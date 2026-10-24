use crate::agent::supervisor::AgentSupervisor;
use crate::process::{hidden_command, output};
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Condvar, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const OUTPUT_WINDOW: usize = 64 * 1024;
const STREAM_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_SESSIONS: usize = 32;

#[derive(Default)]
struct FlowState {
    ready: bool,
    stopped: bool,
    pending: usize,
}

#[derive(Default)]
struct OutputFlow {
    state: Mutex<FlowState>,
    changed: Condvar,
}

impl OutputFlow {
    fn reserve(&self, bytes: usize) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "Terminal stream state is unavailable")?;
        let deadline = Instant::now() + STREAM_TIMEOUT;
        while !state.stopped && (!state.ready || state.pending + bytes > OUTPUT_WINDOW) {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(
                    "Terminal renderer stopped responding. Close this tab and open a new terminal."
                        .into(),
                );
            }
            state = self
                .changed
                .wait_timeout(state, remaining)
                .map_err(|_| "Terminal stream state is unavailable")?
                .0;
        }
        if state.stopped {
            return Err("Terminal closed".into());
        }
        state.pending += bytes;
        Ok(())
    }
    fn acknowledge(&self, bytes: usize) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "Terminal stream state is unavailable")?;
        if bytes > state.pending {
            return Err("Invalid terminal output acknowledgement".into());
        }
        state.pending -= bytes;
        self.changed.notify_all();
        Ok(())
    }
    fn stop(&self) {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        state.stopped = true;
        self.changed.notify_all();
    }
    fn stopped(&self) -> bool {
        self.state.lock().map(|state| state.stopped).unwrap_or(true)
    }
}

struct InputChunk {
    data: Vec<u8>,
    completed: mpsc::SyncSender<Result<(), String>>,
}

struct ActiveSession {
    input: mpsc::SyncSender<InputChunk>,
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    pid: Option<u32>,
    flow: Arc<OutputFlow>,
}

#[derive(Clone, Default)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, Arc<ActiveSession>>>>,
    spawning: Arc<Mutex<()>>,
    closing: Arc<AtomicBool>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self::default()
    }

    fn session(&self, id: &str) -> Result<Arc<ActiveSession>, String> {
        self.sessions
            .lock()
            .map_err(|_| "Terminal registry is unavailable")?
            .get(id)
            .cloned()
            .ok_or_else(|| format!("Terminal {id} has already exited"))
    }

    // Startup takes the full terminal descriptor; splitting it would add no clarity.
    #[allow(clippy::too_many_arguments)]
    pub fn spawn<R: tauri::Runtime>(
        &self,
        app: AppHandle<R>,
        id: String,
        shell: String,
        args: Vec<String>,
        cwd: String,
        cols: u16,
        rows: u16,
    ) -> Result<Option<u32>, String> {
        // Serialise startup separately: terminal writes/resize/ack never wait on
        // ConPTY or shell creation while holding the global session registry.
        let _spawn = self
            .spawning
            .lock()
            .map_err(|_| "Terminal startup state is unavailable")?;
        if self.closing.load(Ordering::Acquire) {
            return Err("Vela is shutting down. New terminals cannot be opened.".into());
        }
        if id.is_empty()
            || id.len() > 128
            || !id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        {
            return Err("Invalid terminal identifier".into());
        }
        if !std::path::Path::new(&cwd).is_dir() {
            return Err(format!(
                "Directory does not exist or is inaccessible: {cwd}"
            ));
        }
        if args.len() > 64
            || args
                .iter()
                .any(|arg| arg.len() > 32768 || arg.contains('\0'))
            || shell.len() > 32768
            || shell.contains('\0')
        {
            return Err("Terminal command arguments exceed the supported limits".into());
        }
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "Terminal registry is unavailable")?;
        if sessions.contains_key(&id) {
            return Err("This terminal ID is already in use".into());
        }
        if sessions.len() >= MAX_SESSIONS {
            return Err(
                "The 32 terminal limit has been reached. Close an unused tab first.".into(),
            );
        }
        drop(sessions);
        let resolved_shell = if shell.is_empty() || shell == "default" {
            if AgentSupervisor::check_binary_exists("pwsh.exe") {
                "pwsh.exe".into()
            } else {
                "powershell.exe".into()
            }
        } else {
            shell
        };
        let mut command = CommandBuilder::new(&resolved_shell);
        command.cwd(&cwd);
        configure_shell(&mut command, &resolved_shell, &args);
        let pair = native_pty_system()
            .openpty(PtySize {
                rows: rows.clamp(10, 500),
                cols: cols.clamp(20, 1000),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| format!("Unable to create terminal: {error}"))?;
        // Acquire I/O before spawning so failures cannot leave an unowned child.
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|error| error.to_string())?;
        let mut writer = pair
            .master
            .take_writer()
            .map_err(|error| error.to_string())?;
        let mut child = pair.slave.spawn_command(command).map_err(|error| format!("Cannot launch '{resolved_shell}': {error}. Check the executable and working directory."))?;
        drop(pair.slave);
        let pid = child.process_id();
        let flow = Arc::new(OutputFlow::default());
        let (input, receiver) = mpsc::sync_channel::<InputChunk>(32);
        let session = Arc::new(ActiveSession {
            input,
            master: Mutex::new(Some(pair.master)),
            killer: Mutex::new(child.clone_killer()),
            pid,
            flow: flow.clone(),
        });
        self.sessions
            .lock()
            .map_err(|_| "Terminal registry is unavailable")?
            .insert(id.clone(), session.clone());

        let input_flow = flow.clone();
        let input_app = app.clone();
        let input_id = id.clone();
        let writer_thread = std::thread::Builder::new()
            .name(format!("pty-input-{id}"))
            .spawn(move || {
                while !input_flow.stopped() {
                    match receiver.recv_timeout(Duration::from_millis(250)) {
                        Ok(chunk) => {
                            let result = writer
                                .write_all(&chunk.data)
                                .and_then(|_| writer.flush())
                                .map_err(|error| format!("Terminal input failed: {error}"));
                            let failed = result.is_err();
                            if let Err(error) = &result {
                                if !input_flow.stopped() {
                                    let _ = input_app.emit(&format!("pty-error-{input_id}"), error);
                                }
                            }
                            let _ = chunk.completed.send(result);
                            if failed {
                                input_flow.stop();
                                break;
                            }
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => (),
                        Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    }
                }
            });
        if let Err(error) = writer_thread {
            let _ = self.kill(&id);
            return Err(format!("Cannot start terminal input worker: {error}"));
        }

        // ConPTY does not close its output pipe merely because the shell exited.
        // Wait independently and close the pseudoconsole while the reader drains it.
        let (exit_tx, exit_rx) = mpsc::sync_channel(1);
        let monitor_session = session.clone();
        let monitor = std::thread::Builder::new()
            .name(format!("pty-process-{id}"))
            .spawn(move || {
                let code = child.wait().ok().map(|status| status.exit_code());
                let master = monitor_session
                    .master
                    .lock()
                    .unwrap_or_else(|error| error.into_inner())
                    .take();
                drop(master); // ClosePseudoConsole may wait for the concurrent output reader.
                let _ = exit_tx.send(code);
            });
        if let Err(error) = monitor {
            let _ = self.kill(&id);
            return Err(format!("Cannot start process monitor: {error}"));
        }

        let map = self.sessions.clone();
        let reader_session = session.clone();
        let reader_id = id.clone();
        let reader_thread = std::thread::Builder::new()
            .name(format!("pty-output-{id}"))
            .spawn(move || {
                let event = format!("pty-output-{reader_id}");
                let mut buffer = [0; 8192];
                let mut failure = None;
                // Gate even EOF until the UI has installed its exit listener.
                if let Err(error) = flow.reserve(0) {
                    failure = Some(error);
                }
                while failure.is_none() && !flow.stopped() {
                    match reader.read(&mut buffer) {
                        Ok(0) => break,
                        Ok(size) => {
                            if let Err(error) = flow.reserve(size) {
                                failure = Some(error);
                                break;
                            }
                            if let Err(error) = app.emit(&event, buffer[..size].to_vec()) {
                                failure = Some(error.to_string());
                                break;
                            }
                        }
                        Err(error) => {
                            if !flow.stopped() {
                                failure = Some(format!("Terminal output ended: {error}"));
                            }
                            break;
                        }
                    }
                }
                if failure.is_some() && !flow.stopped() {
                    // taskkill terminates descendants; the owned killer is the fallback.
                    let _ = terminate_tree(&reader_session);
                }
                if failure.is_some() || flow.stopped() {
                    if let Ok(mut killer) = reader_session.killer.lock() {
                        let _ = killer.kill();
                    }
                    // Closing ConPTY can flush final bytes. Drain them on cancellation so
                    // ClosePseudoConsole cannot deadlock behind an abandoned output pipe.
                    let _ = std::io::copy(&mut reader, &mut std::io::sink());
                }
                flow.stop();
                let code = exit_rx.recv_timeout(Duration::from_secs(5)).ok().flatten();
                if let Some(error) = failure {
                    let _ = app.emit(&format!("pty-error-{reader_id}"), error);
                }
                if let Ok(mut sessions) = map.lock() {
                    if sessions
                        .get(&reader_id)
                        .is_some_and(|current| Arc::ptr_eq(current, &reader_session))
                    {
                        sessions.remove(&reader_id);
                    }
                }
                let _ = app.emit(&format!("pty-exit-{reader_id}"), code);
            });
        if let Err(error) = reader_thread {
            let _ = self.kill(&id);
            return Err(format!("Cannot start terminal output worker: {error}"));
        }
        Ok(pid)
    }

    pub fn start_output(&self, id: &str) -> Result<(), String> {
        let session = self.session(id)?;
        let mut state = session
            .flow
            .state
            .lock()
            .map_err(|_| "Terminal stream is unavailable")?;
        state.ready = true;
        session.flow.changed.notify_all();
        Ok(())
    }
    pub fn acknowledge(&self, id: &str, bytes: usize) -> Result<(), String> {
        // A final write callback may arrive just after natural process exit.
        let session = self
            .sessions
            .lock()
            .map_err(|_| "Terminal registry is unavailable")?
            .get(id)
            .cloned();
        if let Some(session) = session {
            session.flow.acknowledge(bytes)?;
        }
        Ok(())
    }
    pub fn write(&self, id: &str, data: &[u8]) -> Result<(), String> {
        if data.len() > 16 * 1024 {
            return Err("Input is too large. Paste in smaller sections.".into());
        }
        let session = self.session(id)?;
        if session.flow.stopped() {
            return Err("This terminal has exited. Open a new tab.".into());
        }
        let (completed, receiver) = mpsc::sync_channel(1);
        session
            .input
            .try_send(InputChunk {
                data: data.to_vec(),
                completed,
            })
            .map_err(|error| -> String {
                match error {
                    mpsc::TrySendError::Full(_) => {
                        "Terminal input is busy. Wait for the current paste to finish.".into()
                    }
                    mpsc::TrySendError::Disconnected(_) => {
                        "Terminal input has closed. Open a new tab.".into()
                    }
                }
            })?;
        receiver
            .recv_timeout(Duration::from_secs(10))
            .map_err(|_| {
                "Terminal input stopped responding. Close this tab before retrying the command."
                    .to_string()
            })?
    }
    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let session = self.session(id)?;
        let master = session
            .master
            .lock()
            .map_err(|_| "Terminal resize state is unavailable")?;
        master
            .as_ref()
            .ok_or("Terminal process has exited")?
            .resize(PtySize {
                rows: rows.clamp(10, 500),
                cols: cols.clamp(20, 1000),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| error.to_string())
    }
    pub fn kill(&self, id: &str) -> Result<(), String> {
        let session = self
            .sessions
            .lock()
            .map_err(|_| "Terminal registry is unavailable")?
            .get(id)
            .cloned();
        let Some(session) = session else {
            return Ok(());
        };
        // Never mark the tab closed if termination actually failed.
        terminate_tree(&session)?;
        session.flow.stop();
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Terminal registry is unavailable")?;
        if sessions
            .get(id)
            .is_some_and(|current| Arc::ptr_eq(current, &session))
        {
            sessions.remove(id);
        }
        Ok(())
    }
    pub fn shutdown(&self) -> Result<(), String> {
        self.closing.store(true, Ordering::Release);
        let _spawn = self
            .spawning
            .lock()
            .map_err(|_| "Terminal startup state is unavailable")?;
        let ids: Vec<String> = self
            .sessions
            .lock()
            .map_err(|_| "Terminal registry is unavailable")?
            .keys()
            .cloned()
            .collect();
        let mut errors = Vec::new();
        for id in ids {
            if let Err(error) = self.kill(&id) {
                errors.push(error);
            }
        }
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors.join("\n"))
        }
    }

    pub fn cancel_shutdown(&self) {
        self.closing.store(false, Ordering::Release);
    }
}

fn terminate_tree(session: &ActiveSession) -> Result<(), String> {
    if let Some(pid) = session.pid {
        #[cfg(windows)]
        {
            let result = output(
                hidden_command("taskkill").args(["/F", "/T", "/PID", &pid.to_string()]),
                Duration::from_secs(5),
                64 * 1024,
            );
            if result.is_ok_and(|result| result.status.success()) {
                return Ok(());
            }
        }
        #[cfg(not(windows))]
        {
            let _ = output(
                hidden_command("kill").args(["-9", &pid.to_string()]),
                Duration::from_secs(5),
                64 * 1024,
            );
        }
    }
    // Uses the owned OS process handle, not a potentially recycled PID.
    session
        .killer
        .lock()
        .map_err(|_| "Terminal process handle is unavailable")?
        .kill()
        .map_err(|error| format!("Cannot terminate terminal: {error}"))
}

/// Startup script for PowerShell tabs and agent hosts. It must only use core cmdlets and .NET
/// calls: see `configure_shell` for why module lookups are avoided.
const POWERSHELL_INIT: &str = concat!(
    "try { if (-not ${alias:oc} -and -not ${function:oc}) { function global:oc { opencode @args } } } catch {}; ",
    "try { if (-not (Get-Module PSReadLine)) { & { ",
    "$best = $null; $bestVersion = [version]'0.0'; ",
    "$roots = if ($PSVersionTable.PSEdition -eq 'Core') { @([IO.Path]::Combine($PSHOME, 'Modules', 'PSReadLine')) } ",
    "else { @([IO.Path]::Combine($env:ProgramFiles, 'WindowsPowerShell', 'Modules', 'PSReadLine'), [IO.Path]::Combine($PSHOME, 'Modules', 'PSReadLine')) }; ",
    "foreach ($root in $roots) { if ([IO.Directory]::Exists($root)) { ",
    "foreach ($file in [IO.Directory]::GetFiles($root, 'PSReadLine.psd1', [IO.SearchOption]::AllDirectories)) { ",
    "$version = [version]'0.0'; [void][version]::TryParse([IO.Path]::GetFileName([IO.Path]::GetDirectoryName($file)), [ref]$version); ",
    "if ($null -eq $best -or $version -gt $bestVersion) { $best = $file; $bestVersion = $version } } } }; ",
    "if ($best) { Import-Module $best -Global -ErrorAction SilentlyContinue } ",
    "else { Import-Module PSReadLine -Global -ErrorAction SilentlyContinue } } }; ",
    "if (Get-Module PSReadLine) { ",
    "Set-PSReadLineKeyHandler -Chord 'Shift+Enter' -Function AddLine -ErrorAction SilentlyContinue; ",
    "Set-PSReadLineKeyHandler -Chord 'Ctrl+Enter' -Function AddLine -ErrorAction SilentlyContinue } } catch {}; ",
    "$global:__VelaOriginalPrompt = $function:prompt; function global:prompt { ",
    "try { if ($PWD.Provider.Name -eq 'FileSystem') { $p = $PWD.ProviderPath; ",
    "if (-not $p.EndsWith([IO.Path]::DirectorySeparatorChar)) { $p += [IO.Path]::DirectorySeparatorChar }; $u = [uri]$p; ",
    "[Console]::Write(([char]27) + ']7;' + $u.AbsoluteUri + ([char]7)) } } catch {} ; ",
    "if ($global:__VelaOriginalPrompt) { & $global:__VelaOriginalPrompt } else { 'PS ' + $PWD + '> ' } }",
);

fn configure_shell(command: &mut CommandBuilder, shell: &str, args: &[String]) {
    let binary = shell
        .replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or(shell)
        .to_ascii_lowercase();
    if matches!(
        binary.as_str(),
        "pwsh" | "pwsh.exe" | "powershell" | "powershell.exe"
    ) {
        command.args(powershell_args(args));
    } else {
        command.args(args);
    }
    if matches!(binary.as_str(), "cmd" | "cmd.exe") {
        command.env(
            "PROMPT",
            format!(
                "$E]7;file:///$P$E\\{}",
                std::env::var("PROMPT").unwrap_or_else(|_| "$P$G".into())
            ),
        );
    } else if matches!(binary.as_str(), "bash" | "bash.exe") {
        let previous = std::env::var("PROMPT_COMMAND").unwrap_or_default();
        // `$PWD` is normally MSYS style (`/c/dir`), but a Windows-native parent can
        // hand bash a `C:/dir` value. That would produce `file://hostC:/dir`, which
        // has no host separator and parses as a bogus UNC path. Normalise to a
        // leading slash so the file URL always separates host from path.
        command.env(
            "PROMPT_COMMAND",
            format!(
                "__vela_pwd=\"$PWD\"; case \"$__vela_pwd\" in [A-Za-z]:*) __vela_pwd=\"/$__vela_pwd\";; esac; printf '\\033]7;file://%s%s\\007' \"${{HOSTNAME:-localhost}}\" \"$__vela_pwd\"; unset __vela_pwd; {previous}"
            ),
        );
    }
}

fn powershell_args(args: &[String]) -> Vec<String> {
    if let Some(index) = args
        .iter()
        .position(|arg| matches!(arg.to_ascii_lowercase().as_str(), "-command" | "-c"))
    {
        if index + 2 == args.len() {
            let mut result = args[..=index].to_vec();
            result.push(format!("{POWERSHELL_INIT}; {}", args[index + 1]));
            return result;
        }
        return args.to_vec();
    }
    if args.iter().all(|arg| {
        !matches!(
            arg.to_ascii_lowercase().as_str(),
            "-command" | "-c" | "-file" | "-f" | "-encodedcommand" | "-enc"
        )
    }) {
        // XTermView sends Shift+Enter as a Win32 Shift+Enter key record. xterm sends
        // Ctrl+J as '\n', which ConPTY reports as Ctrl+Enter (InsertLineAbove).
        // Any by-name module lookup (`Get-Module -ListAvailable`, `Import-Module
        // PSReadLine`, or autoloading a non-core cmdlet such as Set-Alias) probes every
        // PSModulePath entry, and a Documents folder redirected to an unreachable share
        // stalls startup for minutes. Load PSReadLine from its local install path using
        // only core cmdlets and .NET; fall back to a by-name import only if it is absent.
        let mut result = args.to_vec();
        result.extend(["-NoExit".into(), "-Command".into(), POWERSHELL_INIT.into()]);
        result
    } else {
        args.to_vec()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    // Native console/PSReadLine initialization is timing-sensitive under concurrent startup.
    #[cfg(windows)]
    static CONPTY_TEST: Mutex<()> = Mutex::new(());
    #[test]
    fn agent_commands_receive_prompt_integration_without_changing_permission_flags() {
        let args = vec![
            "-NoExit".into(),
            "-Command".into(),
            "claude --dangerously-skip-permissions".into(),
        ];
        let integrated = powershell_args(&args);
        assert_eq!(&integrated[..2], &args[..2]);
        assert!(integrated[2].starts_with(POWERSHELL_INIT));
        assert!(integrated[2].ends_with("; claude --dangerously-skip-permissions"));
        let plain = vec!["-NoProfile".into(), "-File".into(), "script.ps1".into()];
        assert_eq!(powershell_args(&plain), plain);
    }

    #[cfg(windows)]
    #[test]
    fn fast_natural_exit_is_drained_after_delayed_output_gate() {
        let _guard = CONPTY_TEST
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        use tauri::{Listener, Manager};
        let app = tauri::test::mock_app();
        let manager = PtyManager::new();
        let id = format!("fast-exit-{}", uuid::Uuid::new_v4());
        let collected = Arc::new(Mutex::new(Vec::new()));
        let sink = collected.clone();
        app.listen(format!("pty-output-{id}"), move |event| {
            let bytes: Vec<u8> = serde_json::from_str(event.payload()).unwrap();
            sink.lock().unwrap().extend(bytes);
        });
        let errors = Arc::new(Mutex::new(Vec::<String>::new()));
        let error_sink = errors.clone();
        app.listen(format!("pty-error-{id}"), move |event| {
            error_sink.lock().unwrap().push(event.payload().to_string());
        });
        let (tx, rx) = mpsc::channel();
        app.listen(format!("pty-exit-{id}"), move |event| {
            let code: Option<u32> = serde_json::from_str(event.payload()).unwrap();
            tx.send(code).unwrap();
        });
        manager
            .spawn(
                app.app_handle().clone(),
                id.clone(),
                "cmd.exe".into(),
                vec![
                    "/D".into(),
                    "/Q".into(),
                    "/C".into(),
                    "echo VELA_FAST_EXIT".into(),
                ],
                std::env::current_dir()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned(),
                80,
                24,
            )
            .unwrap();
        let session = manager.session(&id).unwrap();
        let deadline = Instant::now() + Duration::from_secs(10);
        while session.master.lock().unwrap().is_some() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(25));
        }
        assert!(
            session.master.lock().unwrap().is_none(),
            "Child must exit before opening the gate"
        );
        assert!(rx.try_recv().is_err());
        manager.start_output(&id).unwrap();
        let result = rx.recv_timeout(Duration::from_secs(15));
        if result.is_err() {
            let _ = manager.kill(&id);
        }
        assert_eq!(result.unwrap(), Some(0));
        assert!(rx.try_recv().is_err());
        assert!(
            errors.lock().unwrap().is_empty(),
            "{:?}",
            errors.lock().unwrap()
        );
        assert!(String::from_utf8_lossy(&collected.lock().unwrap()).contains("VELA_FAST_EXIT"));
        assert!(manager.session(&id).is_err());
    }

    #[cfg(windows)]
    fn assert_escape_reaches_application(shell: &str, args: Vec<String>) {
        use tauri::{Listener, Manager};
        let app = tauri::test::mock_app();
        let manager = PtyManager::new();
        let id = format!("escape-{}", uuid::Uuid::new_v4());
        let collected = Arc::new(Mutex::new(Vec::new()));
        let sink = collected.clone();
        let ack = manager.clone();
        let ack_id = id.clone();
        app.listen(format!("pty-output-{id}"), move |event| {
            let bytes: Vec<u8> = serde_json::from_str(event.payload()).unwrap();
            sink.lock().unwrap().extend(&bytes);
            ack.acknowledge(&ack_id, bytes.len()).unwrap();
        });
        let (tx, rx) = mpsc::channel();
        app.listen(format!("pty-exit-{id}"), move |_| {
            let _ = tx.send(());
        });
        manager
            .spawn(
                app.app_handle().clone(),
                id.clone(),
                shell.into(),
                args,
                std::env::current_dir()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned(),
                80,
                24,
            )
            .unwrap();
        manager.start_output(&id).unwrap();
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(20) {
            if String::from_utf8_lossy(&collected.lock().unwrap()).contains("VELA_KEY_READY") {
                break;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        manager
            .write(&id, b"\x1b[27;1;27;1;0;1_\x1b[27;1;27;0;0;1_")
            .unwrap();
        let exited = rx.recv_timeout(Duration::from_secs(15));
        if exited.is_err() {
            let _ = manager.kill(&id);
        }
        let text = String::from_utf8_lossy(&collected.lock().unwrap()).into_owned();
        assert!(
            exited.is_ok() && text.contains("VELA_ESCAPE_OK"),
            "{text:?}"
        );
        if shell == "powershell.exe" {
            assert!(text.contains("\x1b]7;file:///C:/"), "{text:?}");
            assert!(!text.contains("file:///C://"), "{text:?}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn conpty_escape_powershell_and_agent_root_prompt() {
        let _guard = CONPTY_TEST
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        assert_escape_reaches_application("powershell.exe", vec![
            "-NoLogo".into(), "-NoProfile".into(), "-Command".into(),
            "Set-Location C:\\; $null = prompt; [Console]::WriteLine('VELA_KEY_READY'); $k = [Console]::ReadKey($true); if ($k.Key -eq [ConsoleKey]::Escape) { [Console]::WriteLine('VELA_ESCAPE_OK') }".into(),
        ]);
    }

    #[cfg(windows)]
    #[test]
    fn conpty_escape_git_bash() {
        let _guard = CONPTY_TEST
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let Some(shell) = [
            r"C:\Program Files\Git\bin\bash.exe",
            r"C:\Program Files (x86)\Git\bin\bash.exe",
        ]
        .into_iter()
        .find(|path| std::path::Path::new(path).exists()) else {
            return;
        };
        assert_escape_reaches_application(shell, vec![
            "--noprofile".into(), "--norc".into(), "-c".into(),
            "printf 'VELA_KEY_READY\\n'; IFS= read -r -s -n 1 key; if [[ \"$key\" == $'\\033' ]]; then printf '\\nVELA_ESCAPE_OK\\n'; fi".into(),
        ]);
    }

    #[cfg(windows)]
    #[test]
    fn conpty_git_bash_agent_host_runs_command_and_restores_shell() {
        let _guard = CONPTY_TEST
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let Some(shell) = [
            r"C:\Program Files\Git\bin\bash.exe",
            r"C:\Program Files (x86)\Git\bin\bash.exe",
        ]
        .into_iter()
        .find(|path| std::path::Path::new(path).exists()) else {
            return;
        };
        use tauri::{Listener, Manager};
        let app = tauri::test::mock_app();
        let manager = PtyManager::new();
        let id = format!("agent-host-{}", uuid::Uuid::new_v4());
        let collected = Arc::new(Mutex::new(Vec::new()));
        let sink = collected.clone();
        let ack = manager.clone();
        let ack_id = id.clone();
        app.listen(format!("pty-output-{id}"), move |event| {
            let bytes: Vec<u8> = serde_json::from_str(event.payload()).unwrap();
            sink.lock().unwrap().extend(&bytes);
            let _ = ack.acknowledge(&ack_id, bytes.len());
        });
        // Same argument shape the Droid CLI preset uses, with a harmless command.
        manager
            .spawn(
                app.app_handle().clone(),
                id.clone(),
                shell.to_string(),
                vec![
                    "--login".into(),
                    "-i".into(),
                    "-c".into(),
                    "echo VELA_AGENT_HOST_OK; exec bash -i".into(),
                ],
                std::env::current_dir()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned(),
                80,
                24,
            )
            .unwrap();
        manager.start_output(&id).unwrap();
        let deadline = Instant::now() + Duration::from_secs(25);
        while Instant::now() < deadline {
            let text = String::from_utf8_lossy(&collected.lock().unwrap()).into_owned();
            if text.contains("VELA_AGENT_HOST_OK") && text.contains("\x1b]7;file://") {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let _ = manager.kill(&id);
        let text = String::from_utf8_lossy(&collected.lock().unwrap()).into_owned();
        assert!(text.contains("VELA_AGENT_HOST_OK"), "{text:?}");
        // The replacement shell must still report its directory through OSC 7.
        let Some(start) = text.find("\x1b]7;file://") else {
            panic!("expected an OSC 7 directory report, got {text:?}");
        };
        let payload = &text[start + "\x1b]7;file://".len()..];
        let payload = payload.split('\x07').next().unwrap_or_default();
        let host = payload.split('/').next().unwrap_or_default();
        assert!(
            !host.contains(':'),
            "OSC 7 host must not swallow the drive letter, got {payload:?}"
        );
    }

    #[cfg(windows)]
    #[test]
    fn credits_are_bounded_and_acknowledged() {
        let flow = OutputFlow::default();
        flow.state.lock().unwrap().ready = true;
        flow.reserve(OUTPUT_WINDOW).unwrap();
        assert_eq!(flow.state.lock().unwrap().pending, OUTPUT_WINDOW);
        assert!(flow.acknowledge(OUTPUT_WINDOW + 1).is_err());
        flow.acknowledge(OUTPUT_WINDOW).unwrap();
        flow.reserve(8192).unwrap();
        flow.stop();
        assert!(flow.reserve(1).is_err());
    }
    #[test]
    fn stop_wakes_a_blocked_producer() {
        let flow = Arc::new(OutputFlow::default());
        let worker_flow = flow.clone();
        let worker = std::thread::spawn(move || worker_flow.reserve(8192));
        flow.stop();
        assert!(worker.join().unwrap().is_err());
    }

    #[cfg(windows)]
    #[test]
    fn native_conpty_streams_input_output_and_natural_exit() {
        let _guard = CONPTY_TEST
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        use tauri::{Listener, Manager};
        let app = tauri::test::mock_app();
        let manager = PtyManager::new();
        let id = format!("test-{}", uuid::Uuid::new_v4());
        let collected = Arc::new(Mutex::new(Vec::new()));
        let captured = collected.clone();
        let ack_manager = manager.clone();
        let ack_id = id.clone();
        app.listen(format!("pty-output-{id}"), move |event| {
            let data: Vec<u8> = serde_json::from_str(event.payload()).unwrap();
            captured.lock().unwrap().extend_from_slice(&data);
            ack_manager.acknowledge(&ack_id, data.len()).unwrap();
        });
        let (tx, rx) = mpsc::channel();
        app.listen(format!("pty-exit-{id}"), move |_| {
            let _ = tx.send(());
        });
        let cwd = std::env::current_dir()
            .unwrap()
            .to_string_lossy()
            .to_string();
        manager
            .spawn(
                app.app_handle().clone(),
                id.clone(),
                "cmd.exe".into(),
                vec!["/D".into(), "/Q".into()],
                cwd,
                80,
                24,
            )
            .unwrap();
        manager.start_output(&id).unwrap();
        manager
            .write(&id, b"echo VELA_NATIVE_STREAM_TEST\r\nexit 0\r\n")
            .unwrap();
        if rx.recv_timeout(Duration::from_secs(15)).is_err() {
            let _ = manager.kill(&id);
            panic!(
                "PTY did not exit; captured output: {:?}",
                String::from_utf8_lossy(&collected.lock().unwrap())
            );
        }
        assert!(
            String::from_utf8_lossy(&collected.lock().unwrap()).contains("VELA_NATIVE_STREAM_TEST")
        );
        assert!(manager.session(&id).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn shutdown_cleans_a_terminal_even_before_reader_gate_opens() {
        let _guard = CONPTY_TEST
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        use tauri::Manager;
        let app = tauri::test::mock_app();
        let manager = PtyManager::new();
        let id = format!("test-{}", uuid::Uuid::new_v4());
        let cwd = std::env::current_dir()
            .unwrap()
            .to_string_lossy()
            .to_string();
        manager
            .spawn(
                app.app_handle().clone(),
                id.clone(),
                "cmd.exe".into(),
                vec!["/D".into(), "/Q".into()],
                cwd,
                80,
                24,
            )
            .unwrap();
        manager.shutdown().unwrap();
        assert!(manager.session(&id).is_err());
    }

    #[cfg(windows)]
    fn assert_powershell_adds_line(newline: &[u8]) {
        use tauri::{Listener, Manager};
        let app = tauri::test::mock_app();
        let manager = PtyManager::new();
        let id = format!("test-shift-enter-{}", uuid::Uuid::new_v4());
        let collected = Arc::new(Mutex::new(Vec::new()));
        let sink = collected.clone();
        app.listen(format!("pty-output-{id}"), move |event: tauri::Event| {
            if let Ok(bytes) = serde_json::from_str::<Vec<u8>>(event.payload()) {
                sink.lock().unwrap().extend_from_slice(&bytes);
            }
        });
        let cwd = std::env::current_dir()
            .unwrap()
            .to_string_lossy()
            .to_string();
        manager
            .spawn(
                app.app_handle().clone(),
                id.clone(),
                "powershell.exe".into(),
                vec!["-NoProfile".into(), "-NoLogo".into()],
                cwd,
                80,
                24,
            )
            .unwrap();
        manager.start_output(&id).unwrap();
        let start = std::time::Instant::now();
        while start.elapsed() < Duration::from_secs(15) {
            let s = String::from_utf8_lossy(&collected.lock().unwrap()).to_string();
            if s.contains("> ") {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        std::thread::sleep(Duration::from_millis(200));
        // Type first line; FIRST_OUT only appears in output once the line runs.
        manager
            .write(&id, b"Write-Host ('FIRST' + '_OUT')")
            .unwrap();
        std::thread::sleep(Duration::from_millis(100));
        manager.write(&id, newline).unwrap();
        let start = std::time::Instant::now();
        while start.elapsed() < Duration::from_secs(5)
            && !String::from_utf8_lossy(&collected.lock().unwrap()).contains(">>")
        {
            std::thread::sleep(Duration::from_millis(100));
        }
        let after_shift = String::from_utf8_lossy(&collected.lock().unwrap()).to_string();
        // First line must NOT have executed yet
        assert!(!after_shift.contains("FIRST_OUT"));
        // PSReadLine multiline prompt '>>' must appear
        assert!(after_shift.contains(">>"));

        // Type second line and press regular Enter (sends \r)
        manager
            .write(&id, b"Write-Host ('SECOND' + '_OUT')\rexit\r")
            .unwrap();
        let start = std::time::Instant::now();
        while start.elapsed() < Duration::from_secs(10)
            && !String::from_utf8_lossy(&collected.lock().unwrap()).contains("SECOND_OUT")
        {
            std::thread::sleep(Duration::from_millis(100));
        }
        let after_exec = String::from_utf8_lossy(&collected.lock().unwrap()).to_string();
        let _ = manager.kill(&id);
        // Both lines run in typed order. InsertLineAbove (unbound Ctrl+Enter) also
        // shows '>>' but puts the second line first.
        let first = after_exec
            .find("FIRST_OUT")
            .expect("first line did not run");
        let second = after_exec
            .find("SECOND_OUT")
            .expect("second line did not run");
        assert!(first < second, "lines ran out of order: {after_exec:?}");
    }

    #[cfg(windows)]
    #[test]
    fn conpty_shift_enter_powershell() {
        let _guard = CONPTY_TEST
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        // The Shift+Enter key record XTermView sends.
        assert_powershell_adds_line(b"\x1b[13;28;10;1;16;1_\x1b[13;28;10;0;16;1_");
        // Ctrl+J: xterm sends '\n', which ConPTY reports to PSReadLine as Ctrl+Enter.
        assert_powershell_adds_line(b"\n");
    }
}
