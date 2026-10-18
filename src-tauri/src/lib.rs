pub mod agent;

// MockRuntime links TaskDialogIndirect too. Unit-test executables need Tauri's
// Common Controls v6 resource, but normal binaries already receive it once.
#[cfg(all(test, windows, target_env = "msvc"))]
#[link(name = "vela_test_manifest", kind = "static", modifiers = "-bundle")]
extern "C" {}
mod diagnostics;
pub mod git;
pub mod models;
pub mod process;
pub mod pty;

use agent::supervisor::AgentSupervisor;
use git::worktree::GitManager;
use models::{AgentType, DetectedAgent, FileDiff, GitWorktree, ShellProfile, TerminalSession};
use pty::manager::PtyManager;
use tauri::{AppHandle, Manager, State, Window};

#[tauri::command]
async fn spawn_terminal(
    app: AppHandle,
    pty_manager: State<'_, PtyManager>,
    id: String,
    title: String,
    shell: String,
    args: Vec<String>,
    cwd: String,
    cols: u16,
    rows: u16,
    worktree_id: Option<String>,
    is_agent: bool,
    agent_type: Option<AgentType>,
) -> Result<TerminalSession, String> {
    let manager = pty_manager.inner().clone();
    tokio::task::spawn_blocking(move || {
        let resolved_cwd = if cwd.trim().is_empty() {
            std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .map_err(|error| format!("Cannot read the default directory: {error}"))?
        } else {
            cwd
        };
        let clean_cwd = GitManager::normalize_path(&resolved_cwd);

        let pid = manager.spawn(
            app,
            id.clone(),
            shell.clone(),
            args,
            clean_cwd.clone(),
            cols,
            rows,
        )?;

        Ok(TerminalSession {
            id,
            title,
            shell,
            cwd: clean_cwd,
            worktree_id,
            cols,
            rows,
            pid,
            is_agent,
            agent_type,
            agent_status: None,
        })
    })
    .await
    .map_err(|error| format!("Terminal startup worker failed: {error}"))?
}

#[tauri::command]
async fn write_terminal(
    pty_manager: State<'_, PtyManager>,
    id: String,
    data: String,
) -> Result<(), String> {
    let manager = pty_manager.inner().clone();
    tokio::task::spawn_blocking(move || manager.write(&id, data.as_bytes()))
        .await
        .map_err(|error| format!("Terminal input worker failed: {error}"))?
}

#[tauri::command]
async fn resize_terminal(
    pty_manager: State<'_, PtyManager>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let manager = pty_manager.inner().clone();
    tokio::task::spawn_blocking(move || manager.resize(&id, cols, rows))
        .await
        .map_err(|error| format!("Resize worker failed: {error}"))?
}

#[tauri::command]
async fn kill_terminal(pty_manager: State<'_, PtyManager>, id: String) -> Result<(), String> {
    let manager = pty_manager.inner().clone();
    tokio::task::spawn_blocking(move || manager.kill(&id))
        .await
        .map_err(|error| format!("Termination worker failed: {error}"))?
}

#[tauri::command]
fn acknowledge_terminal_output(
    pty_manager: State<'_, PtyManager>,
    id: String,
    bytes: usize,
) -> Result<(), String> {
    pty_manager.acknowledge(&id, bytes)
}

#[tauri::command]
async fn report_frontend_error(message: String) -> Result<(), String> {
    if message.len() > 32768 {
        return Err("Diagnostic message is too long".into());
    }
    tokio::task::spawn_blocking(move || diagnostics::record(&message))
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn start_terminal_output(pty_manager: State<'_, PtyManager>, id: String) -> Result<(), String> {
    pty_manager.start_output(&id)
}

#[tauri::command]
async fn find_git_repo(path: Option<String>) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || GitManager::find_repo_root(path.as_deref()))
        .await
        .map_err(|e| format!("Task execution error: {}", e))?
}

#[tauri::command]
async fn list_worktrees(repo_path: String) -> Result<Vec<GitWorktree>, String> {
    tokio::task::spawn_blocking(move || GitManager::list_worktrees(&repo_path))
        .await
        .map_err(|e| format!("Task execution error: {}", e))?
}

#[tauri::command]
async fn create_worktree(
    repo_path: String,
    branch: String,
    base_branch: Option<String>,
) -> Result<GitWorktree, String> {
    tokio::task::spawn_blocking(move || {
        GitManager::create_worktree(&repo_path, &branch, base_branch.as_deref())
    })
    .await
    .map_err(|e| format!("Task execution error: {}", e))?
}

#[tauri::command]
async fn remove_worktree(
    repo_path: String,
    worktree_path: String,
    force: bool,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        GitManager::remove_worktree(&repo_path, &worktree_path, force)
    })
    .await
    .map_err(|e| format!("Task execution error: {}", e))?
}

#[tauri::command]
async fn get_worktree_diff(worktree_path: String) -> Result<Vec<FileDiff>, String> {
    tokio::task::spawn_blocking(move || GitManager::get_worktree_diff(&worktree_path))
        .await
        .map_err(|e| format!("Task execution error: {}", e))?
}

#[tauri::command]
async fn commit_worktree(worktree_path: String, message: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || GitManager::commit_worktree(&worktree_path, &message))
        .await
        .map_err(|e| format!("Task execution error: {}", e))?
}

#[tauri::command]
async fn rollback_worktree_file(
    worktree_path: String,
    file_path: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || GitManager::rollback_file(&worktree_path, &file_path))
        .await
        .map_err(|e| format!("Task execution error: {}", e))?
}

#[tauri::command]
async fn reset_worktree(worktree_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || GitManager::reset_worktree(&worktree_path))
        .await
        .map_err(|e| format!("Task execution error: {}", e))?
}

#[tauri::command]
fn get_shell_profiles() -> Result<Vec<ShellProfile>, String> {
    Ok(AgentSupervisor::get_shell_profiles())
}

#[tauri::command]
async fn detect_agents() -> Result<Vec<DetectedAgent>, String> {
    tokio::task::spawn_blocking(AgentSupervisor::detect_installed_agents)
        .await
        .map_err(|e| format!("Task execution error: {}", e))
}

#[tauri::command]
fn toggle_maximize(window: Window) -> Result<bool, String> {
    let is_max = window.is_maximized().map_err(|e| e.to_string())?;
    if is_max {
        window.unmaximize().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        window.maximize().map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
fn minimize_window(window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn close_window(window: Window) -> Result<(), String> {
    if GitManager::has_active_writes() {
        return Err(
            "A Git write is still running. Wait for it to finish before closing Vela.".into(),
        );
    }
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn is_window_maximized(window: Window) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}

#[tauri::command]
fn show_window(window: Window) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())
}

#[tauri::command]
async fn select_directory() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(select_directory_blocking)
        .await
        .map_err(|error| format!("Directory dialog failed: {error}"))?
}

fn select_directory_blocking() -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("powershell");
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let output = cmd.args([
            "-NoProfile",
            "-Command",
            "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select directory for terminal'; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $f.SelectedPath }"
        ])
        .output()
        .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path_str.is_empty() {
            Ok(None)
        } else {
            Ok(Some(path_str.replace('\\', "/")))
        }
    }
    #[cfg(not(windows))]
    {
        Ok(None)
    }
}

#[tauri::command]
fn get_current_dir() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string().replace('\\', "/"))
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    diagnostics::install_panic_hook();
    let pty_manager = PtyManager::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty_manager)
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if GitManager::has_active_writes() {
                    api.prevent_close();
                    use tauri::Emitter;
                    let _ = window.emit(
                        "app-error",
                        "A Git write is still running. Wait for it to finish before closing Vela.",
                    );
                }
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(2500));
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            spawn_terminal,
            acknowledge_terminal_output,
            report_frontend_error,
            write_terminal,
            resize_terminal,
            kill_terminal,
            start_terminal_output,
            find_git_repo,
            list_worktrees,
            create_worktree,
            remove_worktree,
            get_worktree_diff,
            commit_worktree,
            rollback_worktree_file,
            reset_worktree,
            get_shell_profiles,
            detect_agents,
            toggle_maximize,
            minimize_window,
            close_window,
            is_window_maximized,
            show_window,
            select_directory,
            get_current_dir,
        ])
        .build(tauri::generate_context!())
        .map(|app| {
            let shutting_down = std::sync::atomic::AtomicBool::new(false);
            app.run(move |handle, event| {
                if let tauri::RunEvent::ExitRequested { api, .. } = event {
                    if !shutting_down.swap(true, std::sync::atomic::Ordering::AcqRel) {
                        api.prevent_exit();
                        let handle = handle.clone();
                        std::thread::spawn(move || {
                            if let Err(error) = handle.state::<PtyManager>().shutdown() {
                                diagnostics::record(&format!("Terminal shutdown: {error}"));
                            }
                            handle.exit(0);
                        });
                    }
                }
            })
        })
        .unwrap_or_else(|error| diagnostics::record(&format!("Unable to start Vela: {error}")));
}
