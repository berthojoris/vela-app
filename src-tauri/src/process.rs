//! Bounded, non-interactive child commands. PTYs use their own streaming path.
use std::io::Read;
use std::process::{Command, Output, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc,
};
use std::time::{Duration, Instant};

pub fn hidden_command(binary: &str) -> Command {
    let mut command = Command::new(binary);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
}

struct Capture {
    receiver: mpsc::Receiver<Result<Vec<u8>, String>>,
    cancelled: Arc<AtomicBool>,
    worker: Option<std::thread::JoinHandle<()>>,
}
impl Drop for Capture {
    fn drop(&mut self) {
        self.cancelled.store(true, Ordering::Release);
        // Windows pipe reads poll availability, so cancellation never waits for EOF.
        #[cfg(windows)]
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

#[cfg(windows)]
trait PipeReader: Read + Send + std::os::windows::io::AsRawHandle {}
#[cfg(windows)]
impl<T: Read + Send + std::os::windows::io::AsRawHandle> PipeReader for T {}
#[cfg(not(windows))]
trait PipeReader: Read + Send {}
#[cfg(not(windows))]
impl<T: Read + Send> PipeReader for T {}

fn capture<R: PipeReader + 'static>(
    mut reader: R,
    limit: usize,
    exceeded: Arc<AtomicBool>,
) -> Result<Capture, String> {
    let (tx, rx) = mpsc::sync_channel(1);
    let cancelled = Arc::new(AtomicBool::new(false));
    let stopping = cancelled.clone();
    let worker = std::thread::Builder::new()
        .name("command-output".into())
        .spawn(move || {
            let mut bytes = Vec::new();
            let mut buffer = [0; 8192];
            while !stopping.load(Ordering::Acquire) {
                #[cfg(windows)]
                let capacity = {
                    use windows_sys::Win32::{
                        Foundation::ERROR_BROKEN_PIPE, System::Pipes::PeekNamedPipe,
                    };
                    let mut available = 0;
                    // SAFETY: reader owns this pipe handle until the worker exits.
                    let ok = unsafe {
                        PeekNamedPipe(
                            reader.as_raw_handle().cast(),
                            std::ptr::null_mut(),
                            0,
                            std::ptr::null_mut(),
                            &mut available,
                            std::ptr::null_mut(),
                        )
                    };
                    if ok == 0 {
                        let error = std::io::Error::last_os_error();
                        if error.raw_os_error() == Some(ERROR_BROKEN_PIPE as i32) {
                            break;
                        }
                        let _ = tx.send(Err(format!("Cannot inspect command output: {error}")));
                        return;
                    }
                    if available == 0 {
                        std::thread::sleep(Duration::from_millis(10));
                        continue;
                    }
                    buffer.len().min(available as usize)
                };
                #[cfg(not(windows))]
                let capacity = buffer.len();
                match reader.read(&mut buffer[..capacity]) {
                    Ok(0) => break,
                    Err(error) => {
                        let _ = tx.send(Err(format!("Cannot read command output: {error}")));
                        return;
                    }
                    Ok(size) => {
                        let remaining = limit.saturating_sub(bytes.len());
                        bytes.extend_from_slice(&buffer[..size.min(remaining)]);
                        if size > remaining {
                            exceeded.store(true, Ordering::Release);
                            break;
                        }
                    }
                }
            }
            drop(reader);
            let _ = tx.send(Ok(bytes));
        })
        .map_err(|error| format!("Cannot start command output worker: {error}"))?;
    Ok(Capture {
        receiver: rx,
        cancelled,
        worker: Some(worker),
    })
}

/// No shell expansion, no stdin prompts, bounded stdout/stderr, and an execution deadline.
/// Mutating commands are never retried automatically.
pub fn output(command: &mut Command, timeout: Duration, limit: usize) -> Result<Output, String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    let job = {
        let job = crate::process_job::CommandJob::new()?;
        crate::process_job::CommandJob::prepare(command);
        job
    };
    let mut child = command.spawn().map_err(|error| format!("Cannot start command: {error}. Check that its executable is installed and available in PATH."))?;
    #[cfg(windows)]
    if let Err(error) = job.attach_and_resume(&child) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }
    let exceeded = Arc::new(AtomicBool::new(false));
    let streams = (|| {
        Ok::<_, String>((
            capture(
                child.stdout.take().ok_or("Command stdout is unavailable")?,
                limit,
                exceeded.clone(),
            )?,
            capture(
                child.stderr.take().ok_or("Command stderr is unavailable")?,
                64 * 1024,
                exceeded.clone(),
            )?,
        ))
    })();
    let (stdout, stderr) = match streams {
        Ok(streams) => streams,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };
    let started = Instant::now();
    let status = loop {
        if exceeded.load(Ordering::Acquire) || started.elapsed() >= timeout {
            // Closing the job kills descendants even if the root already exited.
            #[cfg(windows)]
            drop(job);
            let _ = child.kill();
            let _ = child.wait();
            return Err(if exceeded.load(Ordering::Acquire) {
                "Command output exceeds the preview limit. Use the terminal to inspect this repository.".into()
            } else {
                format!("Command timed out after {} seconds. Check the terminal and repository state before retrying a write operation.", timeout.as_secs())
            });
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => std::thread::sleep(Duration::from_millis(15)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error.to_string());
            }
        }
    };
    let stdout = stdout
        .receiver
        .recv_timeout(Duration::from_secs(2))
        .map_err(|_| "Command output pipe did not close. Check for background hooks.")??;
    let stderr = stderr
        .receiver
        .recv_timeout(Duration::from_secs(2))
        .map_err(|_| "Command error pipe did not close. Check for background hooks.")??;
    if exceeded.load(Ordering::Acquire) {
        return Err(
            "Command output exceeds the preview limit. Use the terminal to inspect these changes."
                .into(),
        );
    }
    Ok(Output {
        status,
        stdout,
        stderr,
    })
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    // Run this same test executable as a bounded-command fixture. The nested
    // process deliberately inherits the parent's output pipes.
    #[test]
    #[allow(clippy::zombie_processes)] // Fixture deliberately exits before its child; the job owns cleanup.
    fn inherited_pipe_fixture() {
        let Ok(marker) = std::env::var("VELA_PIPE_FIXTURE") else {
            return;
        };
        if std::env::var_os("VELA_PIPE_DESCENDANT").is_some() {
            std::thread::sleep(Duration::from_secs(30));
            return;
        }
        let child = hidden_command(std::env::current_exe().unwrap().to_str().unwrap())
            .args([
                "--exact",
                "process::tests::inherited_pipe_fixture",
                "--nocapture",
            ])
            .env("VELA_PIPE_DESCENDANT", "1")
            .spawn()
            .unwrap();
        std::fs::write(marker, child.id().to_string()).unwrap();
        if std::env::var_os("VELA_PIPE_PARENT_WAIT").is_some() {
            std::thread::sleep(Duration::from_secs(30));
        }
    }

    fn assert_inherited_pipe_cleanup(parent_wait: bool) {
        use windows_sys::Win32::{
            Foundation::{CloseHandle, WAIT_OBJECT_0},
            System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE},
        };
        let marker = std::env::temp_dir().join(format!("vela-pipe-{}", uuid::Uuid::new_v4()));
        let mut command = hidden_command(std::env::current_exe().unwrap().to_str().unwrap());
        command
            .args([
                "--exact",
                "process::tests::inherited_pipe_fixture",
                "--nocapture",
            ])
            .env("VELA_PIPE_FIXTURE", &marker);
        if parent_wait {
            command.env("VELA_PIPE_PARENT_WAIT", "1");
        }
        let started = Instant::now();
        let result = output(
            &mut command,
            Duration::from_secs(if parent_wait { 4 } else { 10 }),
            65536,
        );
        let pid: u32 = std::fs::read_to_string(&marker)
            .expect("fixture must start its descendant")
            .parse()
            .unwrap();
        std::fs::remove_file(marker).unwrap();
        assert!(result.unwrap_err().contains(if parent_wait {
            "timed out"
        } else {
            "pipe did not close"
        }));
        assert!(started.elapsed() < Duration::from_secs(15));
        // SAFETY: OpenProcess returns an owned synchronization-only handle. A null
        // handle means the terminated process has already been removed by Windows.
        unsafe {
            let process = OpenProcess(PROCESS_SYNCHRONIZE, 0, pid);
            if !process.is_null() {
                let status = WaitForSingleObject(process, 5000);
                CloseHandle(process);
                assert_eq!(
                    status, WAIT_OBJECT_0,
                    "descendant must exit with its command job"
                );
            }
        }
    }

    #[test]
    fn inherited_pipes_are_cleaned_after_parent_exit() {
        assert_inherited_pipe_cleanup(false);
    }

    #[test]
    fn timeout_terminates_the_entire_owned_tree() {
        assert_inherited_pipe_cleanup(true);
    }
    #[test]
    fn command_output_is_capped() {
        let result = output(
            hidden_command("cmd.exe").args(["/D", "/C", "echo a-long-output-for-small-limit"]),
            Duration::from_secs(5),
            4,
        );
        assert!(result.unwrap_err().contains("limit"));
    }
    #[test]
    fn commands_have_a_deadline() {
        let result = output(
            hidden_command("powershell.exe").args([
                "-NoProfile",
                "-Command",
                "Start-Sleep -Seconds 30",
            ]),
            Duration::from_millis(100),
            1024,
        );
        assert!(result.unwrap_err().contains("timed out"));
    }
    #[test]
    fn missing_executable_is_an_actionable_error() {
        let result = output(
            &mut hidden_command("vela-nonexistent-test-binary"),
            Duration::from_secs(1),
            1024,
        );
        assert!(result.unwrap_err().contains("PATH"));
    }
}
