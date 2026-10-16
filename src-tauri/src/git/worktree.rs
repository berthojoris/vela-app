use crate::models::{FileDiff, GitWorktree};
use std::path::{Path, PathBuf};
use std::process::Command;

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

    /// Normalizes Windows, MSYS (/c/...), and standard forward slash paths
    pub fn normalize_path(path: &str) -> String {
        let mut trimmed = path.trim().replace('\\', "/");
        if trimmed.len() >= 3 && trimmed.starts_with('/') && trimmed.chars().nth(2) == Some('/') {
            let drive = trimmed.chars().nth(1).unwrap();
            if drive.is_ascii_alphabetic() {
                trimmed = format!("{}:/{}", drive.to_ascii_uppercase(), &trimmed[3..]);
            }
        }
        if trimmed.len() > 3 && trimmed.ends_with('/') {
            trimmed.pop();
        }
        trimmed
    }

    /// Deterministic stable ID for a worktree based on its path
    pub fn generate_worktree_id(path: &str) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        Self::normalize_path(path).to_lowercase().hash(&mut hasher);
        format!("wt-{:016x}", hasher.finish())
    }

    /// Detects if a directory is inside a Git repository
    pub fn find_repo_root(start_dir: Option<&str>) -> Option<String> {
        let normalized = start_dir
            .map(Self::normalize_path)
            .filter(|s| !s.is_empty());

        let (target_dir, is_explicit_path) = match normalized.as_deref() {
            Some(dir) if dir != "/" && dir != "\\" && dir != "." && dir != "/index.html" => {
                (Some(dir.to_string()), true)
            }
            _ => (None, false),
        };

        let mut cmd = Self::git_cmd();
        if let Some(ref dir) = target_dir {
            cmd.args(["-C", dir]);
        }
        cmd.args(["rev-parse", "--show-toplevel"]);

        let output = cmd.output().ok()?;

        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Some(path_str.replace('\\', "/"))
        } else if let Some(ref dir) = target_dir {
            // Resilient fallback: traverse upwards to find .git directory or worktree gitlink file
            let mut curr = PathBuf::from(dir);
            loop {
                if curr.join(".git").exists() {
                    return Some(curr.to_string_lossy().to_string().replace('\\', "/"));
                }
                if !curr.pop() {
                    break;
                }
            }
            None
        } else if !is_explicit_path {
            // If running rev-parse in current directory didn't work directly, check std::env::current_dir() explicitly
            if let Ok(cwd) = std::env::current_dir() {
                let cwd_str = cwd.to_string_lossy().to_string();
                let output = Self::git_cmd()
                    .args(["-C", &cwd_str, "rev-parse", "--show-toplevel"])
                    .output()
                    .ok()?;
                if output.status.success() {
                    let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    return Some(path_str.replace('\\', "/"));
                }
                let mut curr = cwd;
                loop {
                    if curr.join(".git").exists() {
                        return Some(curr.to_string_lossy().to_string().replace('\\', "/"));
                    }
                    if !curr.pop() {
                        break;
                    }
                }
            }
            None
        } else {
            None
        }
    }

    /// List all git worktrees for a given repository
    pub fn list_worktrees(repo_path: &str) -> Result<Vec<GitWorktree>, String> {
        let clean_path = Self::normalize_path(repo_path);
        let output = Self::git_cmd()
            .args(["-C", &clean_path, "worktree", "list", "--porcelain"])
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

                    let wt_id = Self::generate_worktree_id(&current_path);
                    worktrees.push(GitWorktree {
                        id: wt_id,
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

            let wt_id = Self::generate_worktree_id(&current_path);
            worktrees.push(GitWorktree {
                id: wt_id,
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
        let clean_repo_path = Self::normalize_path(repo_path);
        let clean_branch = branch.trim().replace(' ', "-");
        let parent_dir = Path::new(&clean_repo_path)
            .parent()
            .ok_or("Cannot determine parent directory of repository")?;

        let repo_folder_name = Path::new(&clean_repo_path)
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
            .args(["-C", &clean_repo_path, "show-ref", "--verify", &format!("refs/heads/{}", clean_branch)])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

        let mut cmd = Self::git_cmd();
        cmd.args(["-C", &clean_repo_path, "worktree", "add"]);

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

        let wt_id = Self::generate_worktree_id(&target_str);
        Ok(GitWorktree {
            id: wt_id,
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
        let clean_repo_path = Self::normalize_path(repo_path);
        let clean_worktree_path = Self::normalize_path(worktree_path);
        let mut cmd = Self::git_cmd();
        cmd.args(["-C", &clean_repo_path, "worktree", "remove"]);
        if force {
            cmd.arg("--force");
        }
        cmd.arg(&clean_worktree_path);

        let output = cmd.output().map_err(|e| format!("Failed to remove worktree: {}", e))?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("git worktree remove failed: {}", err));
        }

        // Prune worktrees
        let _ = Self::git_cmd()
            .args(["-C", &clean_repo_path, "worktree", "prune"])
            .output();

        Ok(())
    }

    /// Gets changed files and unified diffs for a worktree in batch (sub-100ms)
    pub fn get_worktree_diff(worktree_path: &str) -> Result<Vec<FileDiff>, String> {
        let clean_worktree_path = Self::normalize_path(worktree_path);
        let path_obj = Path::new(&clean_worktree_path);
        if !path_obj.exists() || !path_obj.is_dir() {
            return Err(format!("Worktree directory does not exist: {}", clean_worktree_path));
        }

        // 1. Get status list via git status --porcelain=v1 -u
        let status_output = Self::git_cmd()
            .args([
                "-C",
                &clean_worktree_path,
                "-c",
                "core.quotepath=false",
                "--no-pager",
                "status",
                "--porcelain=v1",
                "-u",
            ])
            .output()
            .map_err(|e| format!("Failed to spawn git status: {}", e))?;

        if !status_output.status.success() {
            let stderr = String::from_utf8_lossy(&status_output.stderr);
            let err_msg = stderr.trim();
            return Err(if err_msg.is_empty() {
                format!("Git status failed with exit code {:?}", status_output.status.code())
            } else {
                err_msg.to_string()
            });
        }

        let status_str = String::from_utf8_lossy(&status_output.stdout);
        let mut status_entries: Vec<(String, String)> = Vec::new();

        for line in status_str.lines() {
            let trimmed = line.trim_end();
            if trimmed.len() < 3 {
                continue;
            }
            let code = trimmed[0..2].trim().to_string();
            let mut file_path = trimmed[3..].trim().to_string();
            // Handle renames "old -> new"
            if let Some(idx) = file_path.find(" -> ") {
                file_path = file_path[idx + 4..].to_string();
            }
            file_path = file_path.trim_matches('"').replace('\\', "/");
            if !file_path.is_empty() {
                status_entries.push((code, file_path));
            }
        }

        if status_entries.is_empty() {
            return Ok(Vec::new());
        }

        // 2. Fetch diffs in a single batch command instead of spawning N processes
        let has_head = Self::git_cmd()
            .args(["-C", &clean_worktree_path, "rev-parse", "--verify", "HEAD"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

        let mut combined_diff = String::new();
        let mut git_diff_err: Option<String> = None;

        if has_head {
            let diff_output = Self::git_cmd()
                .args([
                    "-C",
                    &clean_worktree_path,
                    "-c",
                    "core.quotepath=false",
                    "--no-pager",
                    "diff",
                    "HEAD",
                ])
                .output();

            match diff_output {
                Ok(out) if out.status.success() => {
                    combined_diff = String::from_utf8_lossy(&out.stdout).to_string();
                }
                Ok(out) => {
                    let err = String::from_utf8_lossy(&out.stderr).to_string();
                    if !err.trim().is_empty() {
                        git_diff_err = Some(err.trim().to_string());
                    }
                }
                Err(e) => {
                    git_diff_err = Some(e.to_string());
                }
            }
        }

        // If repo has no HEAD or git diff HEAD returned empty/failed, attempt staged + unstaged diffs
        if combined_diff.is_empty() {
            let staged_out = Self::git_cmd()
                .args([
                    "-C",
                    &clean_worktree_path,
                    "-c",
                    "core.quotepath=false",
                    "--no-pager",
                    "diff",
                    "--cached",
                ])
                .output();

            if let Ok(staged) = staged_out {
                if staged.status.success() {
                    let s = String::from_utf8_lossy(&staged.stdout);
                    combined_diff.push_str(&s);
                    if !combined_diff.is_empty() && !combined_diff.ends_with('\n') {
                        combined_diff.push('\n');
                    }
                } else if git_diff_err.is_none() {
                    let err = String::from_utf8_lossy(&staged.stderr).to_string();
                    if !err.trim().is_empty() {
                        git_diff_err = Some(err.trim().to_string());
                    }
                }
            }

            let unstaged_out = Self::git_cmd()
                .args([
                    "-C",
                    &clean_worktree_path,
                    "-c",
                    "core.quotepath=false",
                    "--no-pager",
                    "diff",
                ])
                .output();

            if let Ok(unstaged) = unstaged_out {
                if unstaged.status.success() {
                    let u = String::from_utf8_lossy(&unstaged.stdout);
                    combined_diff.push_str(&u);
                } else if git_diff_err.is_none() {
                    let err = String::from_utf8_lossy(&unstaged.stderr).to_string();
                    if !err.trim().is_empty() {
                        git_diff_err = Some(err.trim().to_string());
                    }
                }
            }
        }

        // 3. Map unified diff chunks to file paths
        use std::collections::HashMap;
        let mut diff_map: HashMap<String, String> = HashMap::new();

        let mut current_file_path: Option<String> = None;
        let mut current_chunk = String::new();

        for line in combined_diff.lines() {
            if line.starts_with("diff --git ") {
                if let Some(path) = current_file_path.take() {
                    diff_map.insert(path, std::mem::take(&mut current_chunk));
                }

                // Extract path after " b/"
                if let Some(idx) = line.rfind(" b/") {
                    let b_path = line[idx + 3..].trim().trim_matches('"').replace('\\', "/");
                    current_file_path = Some(b_path);
                }
                current_chunk.push_str(line);
                current_chunk.push('\n');
            } else {
                if line.starts_with("+++ b/") {
                    let p = line[6..].trim().trim_matches('"').replace('\\', "/");
                    if !p.is_empty() && p != "/dev/null" {
                        current_file_path = Some(p);
                    }
                } else if line.starts_with("--- a/") && current_file_path.is_none() {
                    let p = line[6..].trim().trim_matches('"').replace('\\', "/");
                    if !p.is_empty() && p != "/dev/null" {
                        current_file_path = Some(p);
                    }
                }
                current_chunk.push_str(line);
                current_chunk.push('\n');
            }
        }
        if let Some(path) = current_file_path {
            diff_map.insert(path, current_chunk);
        }

        // 4. Assemble FileDiff objects
        let mut files = Vec::new();
        for (status_code, file_path) in status_entries {
            if let Some(diff_content) = diff_map.remove(&file_path) {
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
                    status: status_code,
                    additions,
                    deletions,
                    diff_content,
                });
            } else if status_code.contains('?') || status_code == "A" {
                // Untracked or staged new file without diff chunk: inspect on disk
                let full_path = Path::new(&clean_worktree_path).join(&file_path);
                if full_path.is_file() {
                    let meta = std::fs::metadata(&full_path).ok();
                    let file_size = meta.map(|m| m.len()).unwrap_or(0);

                    if file_size > 1_000_000 {
                        files.push(FileDiff {
                            path: file_path,
                            status: status_code,
                            additions: 0,
                            deletions: 0,
                            diff_content: format!(
                                "Untracked file size ({} KB) exceeds 1 MB preview limit.",
                                file_size / 1024
                            ),
                        });
                    } else if let Ok(bytes) = std::fs::read(&full_path) {
                        // Check binary
                        let is_binary = bytes.iter().take(8000).any(|&b| b == 0);
                        if is_binary {
                            files.push(FileDiff {
                                path: file_path,
                                status: status_code,
                                additions: 0,
                                deletions: 0,
                                diff_content: "Binary file untracked. Diff preview not available.".to_string(),
                            });
                        } else {
                            let text = String::from_utf8_lossy(&bytes);
                            let line_count = text.lines().count();
                            let mut virtual_diff = format!(
                                "diff --git a/{0} b/{0}\nnew file mode 100644\n--- /dev/null\n+++ b/{0}\n@@ -0,0 +1,{1} @@\n",
                                file_path, line_count
                            );
                            for l in text.lines().take(3000) {
                                virtual_diff.push('+');
                                virtual_diff.push_str(l);
                                virtual_diff.push('\n');
                            }
                            if line_count > 3000 {
                                virtual_diff.push_str("\n... [preview truncated after 3000 lines] ...\n");
                            }
                            files.push(FileDiff {
                                path: file_path,
                                status: status_code,
                                additions: line_count,
                                deletions: 0,
                                diff_content: virtual_diff,
                            });
                        }
                    } else {
                        files.push(FileDiff {
                            path: file_path,
                            status: status_code,
                            additions: 0,
                            deletions: 0,
                            diff_content: "Unable to read file content from disk.".to_string(),
                        });
                    }
                } else {
                    files.push(FileDiff {
                        path: file_path,
                        status: status_code,
                        additions: 0,
                        deletions: 0,
                        diff_content: "File was deleted or not present on disk.".to_string(),
                    });
                }
            } else {
                let note = if let Some(ref err) = git_diff_err {
                    format!("Diff preview unavailable due to Git error:\n{}\n\nFile status: {}", err, status_code)
                } else {
                    format!("No diff preview available or file has binary changes.\n\nFile status: {}", status_code)
                };
                files.push(FileDiff {
                    path: file_path,
                    status: status_code,
                    additions: 0,
                    deletions: 0,
                    diff_content: note,
                });
            }
        }

        Ok(files)
    }

    /// Commits all modified files in a worktree
    pub fn commit_worktree(worktree_path: &str, message: &str) -> Result<String, String> {
        let clean_worktree_path = Self::normalize_path(worktree_path);
        let path_obj = Path::new(&clean_worktree_path);
        if !path_obj.exists() || !path_obj.is_dir() {
            return Err(format!("Worktree directory does not exist: {}", clean_worktree_path));
        }

        let trimmed_msg = message.trim();
        if trimmed_msg.is_empty() {
            return Err("Commit message cannot be empty.".to_string());
        }

        let add_out = Self::git_cmd()
            .args(["-C", &clean_worktree_path, "add", "-A"])
            .output()
            .map_err(|e| format!("Failed to git add: {}", e))?;

        if !add_out.status.success() {
            let stderr = String::from_utf8_lossy(&add_out.stderr);
            return Err(format!("git add failed: {}", stderr.trim()));
        }

        let commit_out = Self::git_cmd()
            .args(["-C", &clean_worktree_path, "commit", "-m", trimmed_msg])
            .output()
            .map_err(|e| format!("Failed to git commit: {}", e))?;

        if !commit_out.status.success() {
            let stderr = String::from_utf8_lossy(&commit_out.stderr);
            return Err(format!("git commit failed: {}", stderr.trim()));
        }

        Ok(String::from_utf8_lossy(&commit_out.stdout).to_string())
    }

    fn get_dirty_file_count(path: &str) -> usize {
        let clean_path = Self::normalize_path(path);
        if !Path::new(&clean_path).is_dir() {
            return 0;
        }
        let output = Self::git_cmd()
            .args(["-C", &clean_path, "status", "--porcelain"])
            .output()
            .ok();

        if let Some(out) = output {
            String::from_utf8_lossy(&out.stdout).lines().count()
        } else {
            0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::GitManager;

    #[test]
    fn normalizes_windows_and_msys_paths_for_ipc() {
        assert_eq!(GitManager::normalize_path(r"C:\repo\worktree\"), "C:/repo/worktree");
        assert_eq!(GitManager::normalize_path("/c/repo/worktree/"), "C:/repo/worktree");
    }

    #[test]
    fn worktree_ids_are_stable_and_case_insensitive() {
        assert_eq!(
            GitManager::generate_worktree_id("C:/Repo/Worktree"),
            GitManager::generate_worktree_id("c:\\repo\\worktree")
        );
    }
}
