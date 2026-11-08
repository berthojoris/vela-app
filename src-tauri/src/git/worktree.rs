use super::mutation::{Mutation, MUTATIONS};
use super::parsing::*;
use crate::models::{GitBranch, GitWorktree};
use crate::process::{hidden_command, output};
use std::collections::HashMap;
use std::path::Path;
use std::process::{Command, Output};
use std::time::Duration;

pub struct GitManager;
impl GitManager {
    pub fn has_active_writes() -> bool {
        MUTATIONS.get().is_some_and(|operations| {
            operations
                .lock()
                .map(|operations| !operations.is_empty())
                .unwrap_or(true)
        })
    }
    pub(super) fn git_cmd() -> Command {
        let mut command = hidden_command("git");
        command
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_PAGER", "cat")
            // Error classification must not depend on the user's installed translations.
            .env("LC_ALL", "C")
            .env("LANGUAGE", "C")
            .env("GIT_LITERAL_PATHSPECS", "1");
        command.args([
            "--no-pager",
            "-c",
            "core.quotepath=false",
            "-c",
            "color.ui=false",
        ]);
        command
    }
    pub(super) fn run(command: &mut Command, limit: usize) -> Result<Output, String> {
        output(command, Duration::from_secs(30), limit)
    }
    pub(super) fn checked(result: Output) -> Result<Output, String> {
        if result.status.success() {
            Ok(result)
        } else {
            let stderr = String::from_utf8_lossy(&result.stderr);
            let detail = if stderr.trim().is_empty() {
                String::from_utf8_lossy(&result.stdout).trim().to_string()
            } else {
                stderr.trim().to_string()
            };
            Err(if detail.is_empty() {
                format!("Git exited with status {}", result.status)
            } else {
                detail
            })
        }
    }
    pub fn normalize_path(path: &str) -> String {
        let mut path = path.trim().replace('\\', "/");
        let bytes = path.as_bytes();
        if bytes.len() >= 3
            && bytes[0] == b'/'
            && bytes[1].is_ascii_alphabetic()
            && bytes[2] == b'/'
        {
            path = format!(
                "{}:/{}",
                (bytes[1] as char).to_ascii_uppercase(),
                &path[3..]
            );
        }
        while path.len() > 3 && path.ends_with('/') {
            path.pop();
        }
        if path.len() == 2 && path.as_bytes()[0].is_ascii_alphabetic() && path.ends_with(':') {
            path.push('/');
        }
        path
    }
    pub(super) fn directory(path: &str) -> Result<String, String> {
        let path = Self::normalize_path(path);
        if path.is_empty() || !Path::new(&path).is_dir() {
            return Err(format!(
                "Directory does not exist or is inaccessible: {path}"
            ));
        }
        Ok(path)
    }
    pub fn generate_worktree_id(path: &str) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        Self::normalize_path(path).to_lowercase().hash(&mut hasher);
        format!("wt-{:016x}", hasher.finish())
    }
    pub fn find_repo_root(start_dir: Option<&str>) -> Result<Option<String>, String> {
        let path = match start_dir.filter(|path| !path.trim().is_empty()) {
            Some(path) => Self::directory(path)?,
            None => std::env::current_dir()
                .map_err(|error| error.to_string())?
                .to_string_lossy()
                .to_string(),
        };
        let result = Self::run(
            Self::git_cmd().args(["-C", &path, "rev-parse", "--show-toplevel"]),
            64 * 1024,
        )?;
        if result.status.success() {
            Ok(Some(Self::normalize_path(
                String::from_utf8_lossy(&result.stdout).trim(),
            )))
        } else {
            let error = String::from_utf8_lossy(&result.stderr);
            if error.contains("not a git repository") {
                Ok(None)
            } else {
                Self::checked(result).map(|_| None)
            }
        }
    }
    pub fn list_worktrees(repo_path: &str, check_status: bool) -> Result<Vec<GitWorktree>, String> {
        let path = Self::directory(repo_path)?;
        let result = Self::checked(Self::run(
            Self::git_cmd().args(["-C", &path, "worktree", "list", "--porcelain", "-z"]),
            2 * 1024 * 1024,
        )?)?;
        let text = String::from_utf8_lossy(&result.stdout);
        let mut raw_worktrees: Vec<(String, String)> = Vec::new();
        let mut current: Option<(String, String)> = None;
        for field in text.split('\0') {
            if let Some(path) = field.strip_prefix("worktree ") {
                if let Some(entry) = current.take() {
                    raw_worktrees.push(entry);
                }
                current = Some((path.to_string(), "detached".into()));
            } else if let Some(branch) = field.strip_prefix("branch refs/heads/") {
                if let Some((_, current_branch)) = current.as_mut() {
                    *current_branch = branch.to_string();
                }
            } else if field == "bare" {
                current = None;
            }
        }
        if let Some(entry) = current {
            raw_worktrees.push(entry);
        }

        let statuses: Vec<(Option<usize>, Option<String>)> = if !check_status {
            vec![(None, None); raw_worktrees.len()]
        } else if raw_worktrees.len() <= 1 {
            raw_worktrees
                .iter()
                .map(|(wt_path, _)| match Self::status(wt_path) {
                    Ok(entries) => (Some(entries.len()), None),
                    Err(error) => (None, Some(error)),
                })
                .collect()
        } else {
            // Check multiple worktrees in bounded parallel batches of up to 4 threads.
            let mut out = Vec::with_capacity(raw_worktrees.len());
            for chunk in raw_worktrees.chunks(4) {
                std::thread::scope(|scope| {
                    let handles: Vec<_> = chunk
                        .iter()
                        .map(|(wt_path, _)| {
                            scope.spawn(move || match Self::status(wt_path) {
                                Ok(entries) => (Some(entries.len()), None),
                                Err(error) => (None, Some(error)),
                            })
                        })
                        .collect();
                    for handle in handles {
                        out.push(
                            handle
                                .join()
                                .unwrap_or((None, Some("Status worker panicked".into()))),
                        );
                    }
                });
            }
            out
        };

        let worktrees = raw_worktrees
            .into_iter()
            .zip(statuses)
            .enumerate()
            .map(
                |(index, ((wt_path, branch), (count, status_error)))| GitWorktree {
                    id: Self::generate_worktree_id(&wt_path),
                    name: Path::new(&wt_path)
                        .file_name()
                        .map(|name| name.to_string_lossy().into_owned())
                        .unwrap_or_else(|| "worktree".into()),
                    path: wt_path.replace('\\', "/"),
                    branch,
                    is_main: index == 0,
                    dirty_files_count: count,
                    status_error,
                    active_agent_name: None,
                },
            )
            .collect();
        Ok(worktrees)
    }
    /// Branch checked out in `worktree_path`, read straight from that worktree's HEAD file.
    ///
    /// `git switch` / `git checkout` rewrite HEAD, so the UI can follow branch changes with a
    /// cheap file read instead of spawning Git on every poll. `None` means "unknown": callers
    /// keep the previous label rather than guessing. A raw commit ID means detached HEAD, which
    /// is also the wording `git worktree list` uses.
    pub fn read_head_branch(worktree_path: &str) -> Option<String> {
        // Metadata should be tiny. Do not allocate arbitrary file contents if
        // HEAD or a worktree pointer has been replaced by a large file.
        fn metadata_text(path: &Path) -> Option<String> {
            use std::io::Read;
            let mut text = String::new();
            std::fs::File::open(path)
                .ok()?
                .take(4097)
                .read_to_string(&mut text)
                .ok()?;
            (text.len() <= 4096).then_some(text)
        }
        let path = Self::normalize_path(worktree_path);
        let dot_git = Path::new(&path).join(".git");
        let git_dir = if dot_git.is_dir() {
            dot_git
        } else {
            // Linked worktrees use a `.git` file: "gitdir: <absolute or relative path>".
            let pointer = metadata_text(&dot_git)?;
            let target = pointer.trim().strip_prefix("gitdir:")?.trim().to_string();
            let target = Path::new(&target);
            if target.is_absolute() {
                target.to_path_buf()
            } else {
                Path::new(&path).join(target)
            }
        };
        let head = metadata_text(&git_dir.join("HEAD"))?;
        let head = head.trim();
        match head.strip_prefix("ref:") {
            Some(reference) => {
                let branch = reference.trim().strip_prefix("refs/heads/")?;
                (!branch.is_empty()).then(|| branch.to_string())
            }
            None if head.len() >= 40
                && head.len() <= 64
                && head.bytes().all(|byte| byte.is_ascii_hexdigit()) =>
            {
                Some("detached".into())
            }
            None => None,
        }
    }

    /// One HEAD branch per requested worktree, in the same order; `None` keeps the current label.
    pub fn read_head_branches(paths: &[String]) -> Vec<Option<String>> {
        paths
            .iter()
            .map(|path| Self::read_head_branch(path))
            .collect()
    }

    /// Local branches of the repository, annotated with where each is checked out.
    ///
    /// `is_current` comes from the worktree's HEAD file rather than `git branch` output so
    /// the marker is right even while another process is mid-switch. A branch that is checked
    /// out in any worktree (including this one) carries that worktree's path, because Git
    /// refuses to check the same branch out twice.
    pub fn list_branches(worktree_path: &str) -> Result<Vec<GitBranch>, String> {
        let path = Self::directory(worktree_path)?;
        let result = Self::checked(Self::run(
            Self::git_cmd().args(["-C", &path, "branch", "--list", "--format=%(refname:short)"]),
            1024 * 1024,
        )?)?;
        let current = Self::read_head_branch(&path);
        let checkouts: HashMap<String, String> = Self::list_worktrees(&path, false)?
            .into_iter()
            .filter(|worktree| worktree.branch != "detached")
            .map(|worktree| (worktree.branch, worktree.path))
            .collect();
        Ok(String::from_utf8_lossy(&result.stdout)
            .lines()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(|name| GitBranch {
                name: name.to_string(),
                is_current: current.as_deref() == Some(name),
                checked_out_at: checkouts.get(name).cloned(),
            })
            .collect())
    }

    /// Switches this worktree to an existing local branch.
    ///
    /// With `stash_changes`, uncommitted work (including untracked files) is stashed first
    /// and re-applied after the switch: stash push, git switch, stash pop. A failed pop
    /// keeps the entry on the stash stack and says so; work is never dropped silently. The
    /// stash ref is compared before and after the push, so a no-op push (changes vanished
    /// in between) can never pop an unrelated older stash.
    pub fn switch_branch(
        worktree_path: &str,
        branch: &str,
        stash_changes: bool,
    ) -> Result<(), String> {
        let path = Self::directory(worktree_path)?;
        let _operation = Mutation::repository(&path)?;
        let branch = branch.trim();
        if branch.is_empty()
            || branch.len() > 200
            || branch.starts_with('-')
            || branch.contains('\\')
            || branch.chars().any(char::is_control)
        {
            return Err("Invalid Git branch name.".into());
        }
        let exists = Self::run(
            Self::git_cmd().args([
                "-C",
                &path,
                "show-ref",
                "--verify",
                &format!("refs/heads/{branch}"),
            ]),
            64 * 1024,
        )?
        .status
        .success();
        if !exists {
            return Err(format!("Branch does not exist: {branch}"));
        }
        if Self::read_head_branch(&path).as_deref() == Some(branch) {
            return Err(format!("This worktree is already on {branch}."));
        }
        if let Some(occupied) = Self::list_worktrees(&path, false)?
            .into_iter()
            .find(|worktree| worktree.branch == branch)
        {
            return Err(format!(
                "'{branch}' is already checked out at {}. Switch that worktree instead.",
                occupied.path
            ));
        }
        let mut stashed = false;
        if stash_changes && !Self::status(&path)?.is_empty() {
            if !Self::has_head(&path)? {
                return Err("This repository has no commits yet. Commit the current files before switching branches.".into());
            }
            let stash_ref = |path: &str| {
                Self::run(
                    Self::git_cmd().args(["-C", path, "rev-parse", "-q", "--verify", "refs/stash"]),
                    64 * 1024,
                )
                .ok()
                .filter(|result| result.status.success())
                .map(|result| String::from_utf8_lossy(&result.stdout).trim().to_string())
            };
            let before = stash_ref(&path);
            let message = format!("vela: auto-stash before switching to {branch}");
            // Stash needs wildcard pathspecs internally; GIT_LITERAL_PATHSPECS would keep
            // untracked files in the worktree and make the later pop fail on checkout.
            Self::checked(Self::run(
                Self::git_cmd().env_remove("GIT_LITERAL_PATHSPECS").args([
                    "-C",
                    &path,
                    "stash",
                    "push",
                    "--include-untracked",
                    "-m",
                    &message,
                ]),
                1024 * 1024,
            )?)?;
            stashed = stash_ref(&path).is_some_and(|after| Some(&after) != before.as_ref());
        }
        if let Err(error) = Self::checked(output(
            Self::git_cmd().args(["-C", &path, "switch", branch]),
            Duration::from_secs(120),
            256 * 1024,
        )?) {
            if stashed {
                // Best effort: put the stashed work back so nothing sits stranded on the stack.
                let restored = Self::run(
                    Self::git_cmd()
                        .env_remove("GIT_LITERAL_PATHSPECS")
                        .args(["-C", &path, "stash", "pop"]),
                    1024 * 1024,
                )
                .and_then(Self::checked);
                return Err(match restored {
                    Ok(_) => format!("{error}\nYour stashed changes were restored to the current branch."),
                    Err(restore) => format!("{error}\nRe-applying the stash also failed: {restore}\nYour changes are still on the stash stack (git stash list)."),
                });
            }
            return Err(error);
        }
        if stashed {
            if let Err(error) = Self::run(
                Self::git_cmd()
                    .env_remove("GIT_LITERAL_PATHSPECS")
                    .args(["-C", &path, "stash", "pop"]),
                1024 * 1024,
            )
            .and_then(Self::checked)
            {
                return Err(format!(
                    "Switched to {branch}, but re-applying the stashed changes failed: {error}\nYour changes are still on the stash stack (git stash list). Resolve the conflict, then run git stash drop when done."
                ));
            }
        }
        Ok(())
    }

    pub fn create_worktree(
        repo_path: &str,
        branch: &str,
        base_branch: Option<&str>,
    ) -> Result<GitWorktree, String> {
        let path = Self::directory(repo_path)?;
        let _operation = Mutation::repository(&path)?;
        let branch = branch.trim();
        if branch.is_empty()
            || branch.len() > 200
            || branch.starts_with('-')
            || branch.contains('\\')
            || branch.chars().any(char::is_control)
        {
            return Err("Enter a valid Git branch name, up to 200 characters, without a leading dash or backslashes.".into());
        }
        Self::checked(Self::run(
            Self::git_cmd().args(["check-ref-format", "--branch", branch]),
            64 * 1024,
        )?)?;
        let base = base_branch
            .filter(|base| !base.trim().is_empty())
            .unwrap_or("HEAD")
            .trim();
        if base.starts_with('-') || base.len() > 250 || base.chars().any(char::is_control) {
            return Err("Invalid base branch or revision".into());
        }
        // Resolve to an object ID before passing it to worktree add: no option/revision ambiguity.
        let base_result = Self::checked(Self::run(
            Self::git_cmd().args([
                "-C",
                &path,
                "rev-parse",
                "--verify",
                "--end-of-options",
                &format!("{base}^{{commit}}"),
            ]),
            64 * 1024,
        )?)?;
        let base_oid = String::from_utf8_lossy(&base_result.stdout)
            .trim()
            .to_string();
        let main = Self::list_worktrees(&path, false)?
            .into_iter()
            .find(|worktree| worktree.is_main)
            .ok_or("Cannot determine the main worktree")?;
        let repo = Path::new(&main.path);
        let parent = repo
            .parent()
            .ok_or("Cannot determine the repository parent directory")?;
        let name = repo
            .file_name()
            .ok_or("Cannot determine the repository folder name")?
            .to_string_lossy();
        // Include a stable suffix to avoid feature/a colliding with feature_a.
        let safe: String = branch
            .chars()
            .map(|ch| {
                if ch.is_ascii_alphanumeric() || ch == '-' {
                    ch
                } else {
                    '_'
                }
            })
            .take(80)
            .collect();
        let suffix = Self::generate_worktree_id(branch);
        let target = parent.join(format!("{name}-{safe}-{}", &suffix[3..11]));
        if target.exists() {
            return Err(format!(
                "Worktree destination already exists: {}",
                target.display()
            ));
        }
        let target = target.to_string_lossy().replace('\\', "/");
        let exists = Self::run(
            Self::git_cmd().args([
                "-C",
                &path,
                "show-ref",
                "--verify",
                &format!("refs/heads/{branch}"),
            ]),
            64 * 1024,
        )?
        .status
        .success();
        let mut command = Self::git_cmd();
        command.args(["-C", &path, "worktree", "add"]);
        if exists {
            command.args(["--", &target, branch]);
        } else {
            command.args(["-b", branch, "--", &target, &base_oid]);
        }
        Self::checked(output(&mut command, Duration::from_secs(120), 256 * 1024)?)?;
        Ok(GitWorktree {
            id: Self::generate_worktree_id(&target),
            name: Path::new(&target)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            path: target,
            branch: branch.into(),
            is_main: false,
            dirty_files_count: Some(0),
            status_error: None,
            active_agent_name: None,
        })
    }
    pub fn remove_worktree(
        repo_path: &str,
        worktree_path: &str,
        force: bool,
    ) -> Result<(), String> {
        let repo = Self::directory(repo_path)?;
        let path = Self::directory(worktree_path)?;
        let _operation = Mutation::repository(&repo)?;
        let worktrees = Self::list_worktrees(&repo, false)?;
        let target = worktrees
            .iter()
            .find(|worktree| Self::normalize_path(&worktree.path).eq_ignore_ascii_case(&path))
            .ok_or("This directory is not a registered worktree")?;
        if target.is_main {
            return Err("The main worktree cannot be removed".into());
        }
        let mut command = Self::git_cmd();
        command.args(["-C", &repo, "worktree", "remove"]);
        if force {
            command.arg("--force");
        }
        command.args(["--", &path]);
        Self::checked(output(&mut command, Duration::from_secs(120), 256 * 1024)?)?;
        Ok(())
    }
    pub(super) fn status(path: &str) -> Result<Vec<StatusEntry>, String> {
        let result = Self::checked(Self::run(
            Self::git_cmd().env("GIT_OPTIONAL_LOCKS", "0").args([
                "-C",
                path,
                "status",
                "--porcelain=v1",
                "-z",
                "--untracked-files=all",
            ]),
            2 * 1024 * 1024,
        )?)?;
        Ok(parse_status(&result.stdout))
    }
    pub(super) fn has_head(path: &str) -> Result<bool, String> {
        Ok(Self::run(
            Self::git_cmd().args(["-C", path, "rev-parse", "--verify", "HEAD"]),
            64 * 1024,
        )?
        .status
        .success())
    }
}

#[cfg(test)]
#[path = "worktree_tests.rs"]
mod tests;
