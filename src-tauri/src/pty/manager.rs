use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

pub struct ActiveSession {
    pub writer: Box<dyn Write + Send>,
    pub master: Box<dyn MasterPty + Send>,
    pub pid: Option<u32>,
}

#[derive(Clone)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, Arc<Mutex<ActiveSession>>>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Pure in-process binary lookup without creating console windows
    fn is_cmd_available(cmd: &str) -> bool {
        if let Ok(path_var) = std::env::var("PATH") {
            let pathext = std::env::var("PATHEXT").unwrap_or_else(|_| ".EXE;.CMD;.BAT;.COM".to_string());
            let exts: Vec<String> = pathext.split(';').map(|s| s.to_lowercase()).collect();

            for dir in std::env::split_paths(&path_var) {
                let candidate = dir.join(cmd);
                if candidate.is_file() {
                    return true;
                }
                for ext in &exts {
                    let with_ext = dir.join(format!("{}{}", cmd, ext));
                    if with_ext.is_file() {
                        return true;
                    }
                }
            }
        }
        false
    }

    pub fn spawn(
        &self,
        app: AppHandle,
        id: String,
        shell: String,
        args: Vec<String>,
        cwd: String,
        cols: u16,
        rows: u16,
    ) -> Result<Option<u32>, String> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: rows.max(10),
                cols: cols.max(20),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        // Resolve shell binary for Windows without flashing console windows
        let resolved_shell = if shell.is_empty() || shell == "default" {
            if Self::is_cmd_available("pwsh.exe") {
                "pwsh.exe".to_string()
            } else if Self::is_cmd_available("powershell.exe") {
                "powershell.exe".to_string()
            } else {
                "cmd.exe".to_string()
            }
        } else {
            shell
        };

        let mut cmd = CommandBuilder::new(&resolved_shell);
        if !cwd.is_empty() {
            cmd.cwd(&cwd);
        }
        for arg in args {
            cmd.arg(arg);
        }

        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn process '{}': {}", resolved_shell, e))?;

        let pid = child.process_id();
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take PTY writer: {}", e))?;

        let master = pair.master;

        let active_session = ActiveSession {
            writer,
            master,
            pid,
        };

        {
            let mut sessions = self.sessions.lock().unwrap();
            sessions.insert(id.clone(), Arc::new(Mutex::new(active_session)));
        }

        // Spawn background reader thread
        let session_id = id.clone();
        let app_handle = app.clone();
        let sessions_map = self.sessions.clone();

        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF / Process exited
                    Ok(n) => {
                        let chunk = buf[..n].to_vec();
                        let event_name = format!("pty-output-{}", session_id);
                        let _ = app_handle.emit(&event_name, chunk);
                    }
                    Err(_) => break,
                }
            }

            // Cleanup when process terminates
            let _ = child.wait();
            {
                let mut sessions = sessions_map.lock().unwrap();
                sessions.remove(&session_id);
            }
            let exit_event = format!("pty-exit-{}", session_id);
            let _ = app_handle.emit(&exit_event, ());
        });

        Ok(pid)
    }

    pub fn write(&self, id: &str, data: &[u8]) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap();
        if let Some(session_arc) = sessions.get(id) {
            let mut session = session_arc.lock().unwrap();
            session
                .writer
                .write_all(data)
                .map_err(|e| format!("Failed to write to PTY: {}", e))?;
            session
                .writer
                .flush()
                .map_err(|e| format!("Failed to flush PTY: {}", e))?;
            Ok(())
        } else {
            Err(format!("Session {} not found", id))
        }
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap();
        if let Some(session_arc) = sessions.get(id) {
            let session = session_arc.lock().unwrap();
            session
                .master
                .resize(PtySize {
                    rows: rows.max(10),
                    cols: cols.max(20),
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| format!("Failed to resize PTY: {}", e))?;
            Ok(())
        } else {
            Err(format!("Session {} not found", id))
        }
    }

    pub fn kill(&self, id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(session_arc) = sessions.remove(id) {
            let session = session_arc.lock().unwrap();
            if let Some(pid) = session.pid {
                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    let mut cmd = std::process::Command::new("taskkill");
                    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                    let _ = cmd.args(["/F", "/T", "/PID", &pid.to_string()]).output();
                }
                #[cfg(not(windows))]
                {
                    let _ = std::process::Command::new("kill")
                        .args(["-9", &pid.to_string()])
                        .output();
                }
            }
            Ok(())
        } else {
            Ok(())
        }
    }
}
