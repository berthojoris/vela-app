pub mod agent;
pub mod git;
pub mod models;
pub mod pty;

use agent::supervisor::AgentSupervisor;
use git::worktree::GitManager;
use models::{AgentType, DetectedAgent, FileDiff, GitWorktree, ShellProfile, TerminalSession};
use pty::manager::PtyManager;
use tauri::{AppHandle, State, Window};

#[tauri::command]
fn spawn_terminal(
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
    let resolved_cwd = if cwd.trim().is_empty() {
        std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default()
    } else {
        cwd
    };
    let clean_cwd = GitManager::normalize_path(&resolved_cwd);

    let pid = pty_manager.spawn(
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
}

#[tauri::command]
fn write_terminal(
    pty_manager: State<'_, PtyManager>,
    id: String,
    data: String,
) -> Result<(), String> {
    pty_manager.write(&id, data.as_bytes())
}

#[tauri::command]
fn resize_terminal(
    pty_manager: State<'_, PtyManager>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    pty_manager.resize(&id, cols, rows)
}

#[tauri::command]
fn kill_terminal(pty_manager: State<'_, PtyManager>, id: String) -> Result<(), String> {
    pty_manager.kill(&id)
}

#[tauri::command]
fn start_terminal_output(pty_manager: State<'_, PtyManager>, id: String) -> Result<(), String> {
    pty_manager.start_output(&id)
}

#[tauri::command]
async fn find_git_repo(path: Option<String>) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || GitManager::find_repo_root(path.as_deref()))
        .await
        .map_err(|e| format!("Task execution error: {}", e))
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
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn is_window_maximized(window: Window) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}

#[tauri::command]
fn select_directory() -> Result<Option<String>, String> {
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
    let pty_manager = PtyManager::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty_manager)
        .invoke_handler(tauri::generate_handler![
            spawn_terminal,
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
            get_shell_profiles,
            detect_agents,
            toggle_maximize,
            minimize_window,
            close_window,
            is_window_maximized,
            select_directory,
            get_current_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running vela application");
}
