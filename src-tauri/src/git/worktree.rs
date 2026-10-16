use crate::models::{FileDiff, GitWorktree};
use std::path::{Path, PathBuf};
use std::process::Command;
use uuid::Uuid;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct GitManager;

impl GitManager {
    fn git_cmd() -> Command {
        let mut cmd = Command::new("git");
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }

    /// Detects if a directory is inside a Git repository
    pub fn find_repo_root(start_dir: &str) -> Option<String> {
        let output = Self::git_cmd()
            .args(["-C", start_dir, "rev-parse", "--show-toplevel"])
            .output()
            .ok()?;

        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Some(path_str.replace('\\', "/"))
        } else {
            None
        }
    }

    /// List all git worktrees for a given repository
    pub fn list_worktrees(repo_path: &str) -> Result<Vec<GitWorktree>, String> {
        let output = Self::git_cmd()
            .args(["-C", repo_path, "worktree", "list", "--porcelain"])
            .output()
            .map_err(|e| format!("Failed to execute git worktree list: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Git worktree list error: {}", err));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut worktrees = Vec::new();
        let mut current_path = String::new();
        let mut current_branch = String::new();
        let mut is_first = true;

        for line in stdout.lines() {
            let line = line.trim();
            if line.starts_with("worktree ") {
                if !current_path.is_empty() {
                    let dirty_count = Self::get_dirty_file_count(&current_path);
                    let folder_name = Path::new(&current_path)
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "worktree".to_string());

                    worktrees.push(GitWorktree {
                        id: Uuid::new_v4().to_string(),
                        name: folder_name,
                        path: current_path.clone().replace('\\', "/"),
                        branch: current_branch.clone(),
                        is_main: is_first,
                        dirty_files_count: dirty_count,
                        active_agent_name: None,
                    });
                    is_first = false;
                }
                current_path = line.trim_start_matches("worktree ").to_string();
                current_branch = "detached".to_string();
            } else if line.starts_with("branch ") {
                let branch_ref = line.trim_start_matches("branch ");
                current_branch = branch_ref.trim_start_matches("refs/heads/").to_string();
            }
        }

        // Push last block
        if !current_path.is_empty() {
            let dirty_count = Self::get_dirty_file_count(&current_path);
            let folder_name = Path::new(&current_path)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "worktree".to_string());

            worktrees.push(GitWorktree {
                id: Uuid::new_v4().to_string(),
                name: folder_name,
                path: current_path.replace('\\', "/"),
                branch: current_branch,
                is_main: is_first,
                dirty_files_count: dirty_count,
                active_agent_name: None,
            });
        }

        Ok(worktrees)
    }

    /// Creates a new worktree for an isolated task/agent
    pub fn create_worktree(
        repo_path: &str,
        branch: &str,
        base_branch: Option<&str>,
    ) -> Result<GitWorktree, String> {
        let clean_branch = branch.trim().replace(' ', "-");
        let parent_dir = Path::new(repo_path)
            .parent()
            .ok_or("Cannot determine parent directory of repository")?;

        let repo_folder_name = Path::new(repo_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "repo".to_string());

        let folder_safe_branch = clean_branch.replace('/', "_");
        let worktree_dir_name = format!("{}-{}", repo_folder_name, folder_safe_branch);
        let target_path: PathBuf = parent_dir.join(&worktree_dir_name);
        let target_str = target_path.to_string_lossy().to_string().replace('\\', "/");

        let base = base_branch.unwrap_or("HEAD");

        // Check if branch already exists in git
        let branch_exists = Self::git_cmd()
            .args(["-C", repo_path, "show-ref", "--verify", &format!("refs/heads/{}", clean_branch)])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

        let mut cmd = Self::git_cmd();
        cmd.args(["-C", repo_path, "worktree", "add"]);

        if branch_exists {
            cmd.args([&target_str, &clean_branch]);
        } else {
            cmd.args(["-b", &clean_branch, &target_str, base]);
        }

        let output = cmd.output().map_err(|e| format!("Failed to run git worktree add: {}", e))?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("git worktree add failed: {}", err));
        }

        Ok(GitWorktree {
            id: Uuid::new_v4().to_string(),
            name: worktree_dir_name,
            path: target_str,
            branch: clean_branch,
            is_main: false,
            dirty_files_count: 0,
            active_agent_name: None,
        })
    }

    /// Safely removes a worktree and prunes dead entries
    pub fn remove_worktree(repo_path: &str, worktree_path: &str, force: bool) -> Result<(), String> {
        let mut cmd = Self::git_cmd();
        cmd.args(["-C", repo_path, "worktree", "remove"]);
        if force {
            cmd.arg("--force");
        }
        cmd.arg(worktree_path);

        let output = cmd.output().map_err(|e| format!("Failed to remove worktree: {}", e))?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("git worktree remove failed: {}", err));
        }

        // Prune worktrees
        let _ = Self::git_cmd()
            .args(["-C", repo_path, "worktree", "prune"])
            .output();

        Ok(())
    }

    /// Gets changed files and unified diffs for a worktree
    pub fn get_worktree_diff(worktree_path: &str) -> Result<Vec<FileDiff>, String> {
        let status_output = Self::git_cmd()
            .args(["-C", worktree_path, "status", "--porcelain"])
            .output()
            .map_err(|e| format!("Failed to get git status: {}", e))?;

        let status_str = String::from_utf8_lossy(&status_output.stdout);
        let mut files = Vec::new();

        for line in status_str.lines() {
            if line.len() < 4 {
                continue;
            }
            let status_code = &line[0..2].trim();
            let file_path = line[3..].trim().to_string();

            // Fetch diff for individual file
            let diff_output = Self::git_cmd()
                .args(["-C", worktree_path, "diff", "HEAD", "--", &file_path])
                .output()
                .ok();

            let diff_content = diff_output
                .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                .unwrap_or_default();

            let mut additions = 0;
            let mut deletions = 0;
            for diff_line in diff_content.lines() {
                if diff_line.starts_with('+') && !diff_line.starts_with("+++") {
                    additions += 1;
                } else if diff_line.starts_with('-') && !diff_line.starts_with("---") {
                    deletions += 1;
                }
            }

            files.push(FileDiff {
                path: file_path,
                status: status_code.to_string(),
                additions,
                deletions,
                diff_content,
            });
        }

        Ok(files)
    }

    /// Commits all modified files in a worktree
    pub fn commit_worktree(worktree_path: &str, message: &str) -> Result<String, String> {
        let add_out = Self::git_cmd()
            .args(["-C", worktree_path, "add", "-A"])
            .output()
            .map_err(|e| format!("Failed to git add: {}", e))?;

        if !add_out.status.success() {
            return Err(String::from_utf8_lossy(&add_out.stderr).to_string());
        }

        let commit_out = Self::git_cmd()
            .args(["-C", worktree_path, "commit", "-m", message])
            .output()
            .map_err(|e| format!("Failed to git commit: {}", e))?;

        if !commit_out.status.success() {
            return Err(String::from_utf8_lossy(&commit_out.stderr).to_string());
        }

        Ok(String::from_utf8_lossy(&commit_out.stdout).to_string())
    }

    fn get_dirty_file_count(path: &str) -> usize {
        let output = Self::git_cmd()
            .args(["-C", path, "status", "--porcelain"])
            .output()
            .ok();

        if let Some(out) = output {
            String::from_utf8_lossy(&out.stdout).lines().count()
        } else {
            0
        }
    }
}
