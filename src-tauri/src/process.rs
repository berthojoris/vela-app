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

fn capture<R: Read + Send + 'static>(
    mut reader: R,
    limit: usize,
    exceeded: Arc<AtomicBool>,
) -> Result<mpsc::Receiver<Result<Vec<u8>, String>>, String> {
    let (tx, rx) = mpsc::sync_channel(1);
    std::thread::Builder::new()
        .name("command-output".into())
        .spawn(move || {
            let mut bytes = Vec::new();
            let mut buffer = [0; 8192];
            loop {
                match reader.read(&mut buffer) {
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
                        }
                    }
                }
            }
            let _ = tx.send(Ok(bytes));
        })
        .map_err(|error| format!("Cannot start command output worker: {error}"))?;
    Ok(rx)
}

/// No shell expansion, no stdin prompts, bounded stdout/stderr, and an execution deadline.
/// Mutating commands are never retried automatically.
pub fn output(command: &mut Command, timeout: Duration, limit: usize) -> Result<Output, String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|error| format!("Cannot start command: {error}. Check that its executable is installed and available in PATH."))?;
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
            // Kill descendants too: a hook/pager must not retain a pipe forever.
            #[cfg(windows)]
            {
                let _ = hidden_command("taskkill")
                    .args(["/F", "/T", "/PID", &child.id().to_string()])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();
            }
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
        .recv_timeout(Duration::from_secs(2))
        .map_err(|_| "Command output pipe did not close. Check for background hooks.")??;
    let stderr = stderr
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
