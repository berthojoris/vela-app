use crate::models::{ChangedFile, FileDiff, GitWorktree, WorktreeChanges};
use crate::process::{hidden_command, output};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::process::{Command, Output};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

const MAX_FILES: usize = 500;
const MAX_DIFF: usize = 8 * 1024 * 1024;
const FILE_PREVIEW: usize = 32 * 1024;
const TOTAL_PREVIEW: usize = 2 * 1024 * 1024;

#[derive(Debug)]
struct StatusEntry {
    status: String,
    path: String,
    original_path: Option<String>,
}

static MUTATIONS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
struct Mutation(String);
impl Mutation {
    fn begin(path: &str) -> Result<Self, String> {
        let key = GitManager::normalize_path(path).to_lowercase();
        let mut operations = MUTATIONS
            .get_or_init(Default::default)
            .lock()
            .map_err(|_| "Git operation registry is unavailable")?;
        if !operations.insert(key.clone()) {
            return Err(
                "Another Git write is already running for this repository. Please wait.".into(),
            );
        }
        Ok(Self(key))
    }
    /// All worktrees of one repository share a single key: the common Git directory.
    /// Falls back to the path itself when Git cannot resolve it; the write then fails on its own.
    fn repository(path: &str) -> Result<Self, String> {
        let common = GitManager::run(
            GitManager::git_cmd().args([
                "-C",
                path,
                "rev-parse",
                "--path-format=absolute",
                "--git-common-dir",
            ]),
            64 * 1024,
        )
        .ok()
        .filter(|result| result.status.success())
        .map(|result| String::from_utf8_lossy(&result.stdout).trim().to_string())
        .filter(|dir| !dir.is_empty());
        Self::begin(common.as_deref().unwrap_or(path))
    }
}
impl Drop for Mutation {
    fn drop(&mut self) {
        if let Some(operations) = MUTATIONS.get() {
            operations
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .remove(&self.0);
        }
    }
}

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
    fn git_cmd() -> Command {
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
    fn run(command: &mut Command, limit: usize) -> Result<Output, String> {
        output(command, Duration::from_secs(30), limit)
    }
    fn checked(result: Output) -> Result<Output, String> {
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
    fn directory(path: &str) -> Result<String, String> {
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
        let mut worktrees = Vec::new();
        let mut current: Option<(String, String)> = None;
        let mut append = |path: String, branch: String| -> Result<(), String> {
            let (count, status_error) = if check_status {
                match Self::status(&path) {
                    Ok(entries) => (Some(entries.len()), None),
                    Err(error) => (None, Some(error)),
                }
            } else {
                (None, None)
            };
            worktrees.push(GitWorktree {
                id: Self::generate_worktree_id(&path),
                name: Path::new(&path)
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "worktree".into()),
                path: path.replace('\\', "/"),
                branch,
                is_main: worktrees.is_empty(),
                dirty_files_count: count,
                status_error,
                active_agent_name: None,
            });
            Ok(())
        };
        for field in text.split('\0') {
            if let Some(path) = field.strip_prefix("worktree ") {
                if let Some((path, branch)) = current.take() {
                    append(path, branch)?;
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
        if let Some((path, branch)) = current {
            append(path, branch)?;
        }
        Ok(worktrees)
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
    fn status(path: &str) -> Result<Vec<StatusEntry>, String> {
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
    fn has_head(path: &str) -> Result<bool, String> {
        Ok(Self::run(
            Self::git_cmd().args(["-C", path, "rev-parse", "--verify", "HEAD"]),
            64 * 1024,
        )?
        .status
        .success())
    }
    /// Status plus per-file line counts for the sidebar. Never builds patch text.
    pub fn get_worktree_changes(worktree_path: &str) -> Result<WorktreeChanges, String> {
        let path = Self::directory(worktree_path)?;
        let entries = Self::status(&path)?;
        let total = entries.len();
        if entries.is_empty() {
            return Ok(WorktreeChanges {
                total,
                files: Vec::new(),
            });
        }
        let mut command = Self::git_cmd();
        command.args([
            "-C",
            &path,
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--numstat",
            "-z",
        ]);
        if Self::has_head(&path)? {
            command.arg("HEAD");
        } else {
            command.arg("--cached");
        }
        command.arg("--");
        // Counts are decoration: a failed or oversized numstat still lists the changed files.
        let mut counts = Self::run(&mut command, 2 * 1024 * 1024)
            .and_then(Self::checked)
            .map(|result| parse_numstat(&result.stdout))
            .unwrap_or_default();
        let occurrences = path_occurrences(&entries);
        let mut staged_counts = if occurrences.values().any(|count| *count > 1) {
            Self::run(
                Self::git_cmd().args([
                    "-C",
                    &path,
                    "diff",
                    "--no-ext-diff",
                    "--no-textconv",
                    "--numstat",
                    "-z",
                    "--cached",
                    "--",
                ]),
                2 * 1024 * 1024,
            )
            .and_then(Self::checked)
            .map(|result| parse_numstat(&result.stdout))
            .unwrap_or_default()
        } else {
            HashMap::new()
        };
        let files = entries
            .into_iter()
            .take(MAX_FILES)
            .map(
                |StatusEntry {
                     status, path: file, ..
                 }| {
                    let (additions, deletions) = if status == "??" {
                        (0, 0)
                    } else if occurrences.get(&file).is_some_and(|count| *count > 1) {
                        staged_counts.remove(&file).unwrap_or((0, 0))
                    } else {
                        counts.remove(&file).unwrap_or((0, 0))
                    };
                    ChangedFile {
                        path: file,
                        status,
                        additions,
                        deletions,
                    }
                },
            )
            .collect();
        Ok(WorktreeChanges { total, files })
    }
    pub fn get_worktree_diff(worktree_path: &str) -> Result<Vec<FileDiff>, String> {
        let path = Self::directory(worktree_path)?;
        let entries = Self::status(&path)?;
        Self::diff_entries(&path, entries)
    }
    fn diff_entries(path: &str, entries: Vec<StatusEntry>) -> Result<Vec<FileDiff>, String> {
        if entries.len() > MAX_FILES {
            return Err(format!("{} changed files exceed the {MAX_FILES} file review limit. Use the terminal to narrow or review this change set.", entries.len()));
        }
        if entries.is_empty() {
            return Ok(Vec::new());
        }
        let has_head = Self::has_head(path)?;
        let mut command = Self::git_cmd();
        command.args(["-C", path, "diff", "--no-ext-diff", "--no-textconv"]);
        if has_head {
            command.arg("HEAD");
        } else {
            command.arg("--cached");
        }
        command.arg("--");
        // A giant patch never grows process memory or an IPC payload without a bound.
        let patch = Self::run(&mut command, MAX_DIFF).and_then(Self::checked);
        let (mut patches, preview_error) = match patch {
            Ok(result) => (split_patch(&String::from_utf8_lossy(&result.stdout)), None),
            Err(error) => (HashMap::new(), Some(error)),
        };
        let occurrences = path_occurrences(&entries);
        // A staged deletion and an untracked replacement are separate changes, not a net diff.
        let mut staged_patches = if occurrences.values().any(|count| *count > 1) {
            Self::run(
                Self::git_cmd().args([
                    "-C",
                    path,
                    "diff",
                    "--no-ext-diff",
                    "--no-textconv",
                    "--cached",
                    "--",
                ]),
                MAX_DIFF,
            )
            .and_then(Self::checked)
            .map(|result| split_patch(&String::from_utf8_lossy(&result.stdout)))
            .unwrap_or_default()
        } else {
            HashMap::new()
        };
        let mut budget = TOTAL_PREVIEW;
        let mut diffs = Vec::with_capacity(entries.len());
        for StatusEntry {
            status, path: file, ..
        } in entries
        {
            let mut additions = 0;
            let mut deletions = 0;
            let duplicate = occurrences.get(&file).is_some_and(|count| *count > 1);
            let patch = if status.contains('?') {
                None
            } else if duplicate {
                staged_patches.remove(&file)
            } else {
                patches.remove(&file)
            };
            let text = if let Some(patch) = patch {
                additions = patch
                    .lines()
                    .filter(|line| line.starts_with('+') && !line.starts_with("+++"))
                    .count();
                deletions = patch
                    .lines()
                    .filter(|line| line.starts_with('-') && !line.starts_with("---"))
                    .count();
                patch
            } else if status.contains('?') || (!has_head && status.contains('A')) {
                match untracked_preview(&Path::new(&path).join(&file), budget) {
                    Ok((preview, count)) => {
                        additions = count;
                        preview
                    }
                    Err(error) => format!("Preview unavailable for {file}: {error}. Refresh or inspect it in the terminal."),
                }
            } else {
                format!(
                    "No text preview available (binary, rename, or concurrent change). {}",
                    preview_error
                        .as_deref()
                        .unwrap_or("Refresh if the file changed during inspection.")
                )
            };
            let preview = truncate_preview(&text, FILE_PREVIEW.min(budget));
            budget = budget.saturating_sub(preview.len());
            diffs.push(FileDiff {
                path: file,
                status,
                additions,
                deletions,
                diff_content: preview,
                rollback_error: duplicate.then(|| "This path has multiple Git status entries. Resolve it in the terminal before rolling back.".into()),
            });
        }
        Ok(diffs)
    }
    pub fn commit_worktree(worktree_path: &str, message: &str) -> Result<String, String> {
        let path = Self::directory(worktree_path)?;
        let _operation = Mutation::repository(&path)?;
        let message = message.trim();
        if message.is_empty() || message.len() > 16 * 1024 || message.contains('\0') {
            return Err(
                "Enter a commit message between 1 and 16,384 bytes, without NUL characters.".into(),
            );
        }
        Self::checked(Self::run(
            Self::git_cmd().args(["-C", &path, "add", "-A", "--"]),
            256 * 1024,
        )?)?;
        let result = output(Self::git_cmd().args(["-C", &path, "commit", "-m", message]), Duration::from_secs(120), 256 * 1024)
            .and_then(Self::checked).map_err(|error| format!("{error}\nChanges staged by git add -A remain staged. Check git status before retrying."))?;
        Ok(String::from_utf8_lossy(&result.stdout).trim().to_string())
    }
    pub fn rollback_file(worktree_path: &str, file_path: &str) -> Result<(), String> {
        let path = Self::directory(worktree_path)?;
        let file = file_path.replace('\\', "/");
        validate_rollback_path(&file)?;
        let _operation = Mutation::repository(&path)?;
        let entries = Self::status(&path)?;
        let matches: Vec<_> = entries.iter().filter(|entry| entry.path == file).collect();
        if matches.len() != 1 {
            return Err("This path has changed or has multiple Git status entries. Refresh and resolve it in the terminal before rolling back.".into());
        }
        let entry = matches[0];
        let has_head = Self::has_head(&path)?;
        if entry.status.contains('R') {
            let source = entry
                .original_path
                .as_deref()
                .ok_or("Rename source is unavailable")?;
            validate_rollback_path(source)?;
            if entries.iter().any(|other| {
                other.path == source
                    || (other.path != file && other.original_path.as_deref() == Some(source))
            }) {
                return Err(
                    "The rename source has other changes. Resolve this rename in the terminal."
                        .into(),
                );
            }
            // Git restores the source and removes/restores the destination in one checked operation.
            Self::checked(Self::run(
                Self::git_cmd().args([
                    "-C",
                    &path,
                    "restore",
                    "--source=HEAD",
                    "--staged",
                    "--worktree",
                    "--",
                    source,
                    &file,
                ]),
                64 * 1024,
            )?)?;
            return Ok(());
        }
        let in_head = if has_head {
            Self::run(
                Self::git_cmd().args(["-C", &path, "cat-file", "-e", &format!("HEAD:{file}")]),
                64 * 1024,
            )?
            .status
            .success()
        } else {
            false
        };

        if in_head {
            Self::checked(Self::run(
                Self::git_cmd().args([
                    "-C",
                    &path,
                    "restore",
                    "--source=HEAD",
                    "--staged",
                    "--worktree",
                    "--",
                    &file,
                ]),
                64 * 1024,
            )?)?;
        } else if entry.status == "??" {
            Self::checked(Self::run(
                Self::git_cmd().args(["-C", &path, "clean", "-f", "-d", "--", &file]),
                64 * 1024,
            )?)?;
            if Path::new(&path).join(&file).exists() {
                return Err("Git did not remove this path. Inspect it in the terminal.".into());
            }
        } else {
            Self::checked(Self::run(
                Self::git_cmd().args(["-C", &path, "rm", "-f", "--", &file]),
                64 * 1024,
            )?)?;
        }
        Ok(())
    }
    pub fn reset_worktree(worktree_path: &str) -> Result<(), String> {
        let path = Self::directory(worktree_path)?;
        let _operation = Mutation::repository(&path)?;

        let has_head = Self::run(
            Self::git_cmd().args(["-C", &path, "rev-parse", "--verify", "HEAD"]),
            64 * 1024,
        )?
        .status
        .success();

        if has_head {
            Self::checked(Self::run(
                Self::git_cmd().args(["-C", &path, "reset", "--hard", "HEAD"]),
                256 * 1024,
            )?)?;
        } else {
            let _ = Self::run(
                Self::git_cmd().args(["-C", &path, "rm", "-rf", "--cached", "."]),
                256 * 1024,
            );
        }

        Self::checked(Self::run(
            Self::git_cmd().args(["-C", &path, "clean", "-f", "-d"]),
            256 * 1024,
        )?)?;

        Ok(())
    }
}

fn path_occurrences(entries: &[StatusEntry]) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    for entry in entries {
        *counts.entry(entry.path.clone()).or_insert(0) += 1;
    }
    counts
}

fn validate_rollback_path(file: &str) -> Result<(), String> {
    if file.is_empty()
        || file.starts_with('-')
        || file.starts_with('/')
        || file.contains(':')
        || file.split('/').any(|part| part == ".." || part == ".git")
        || file.chars().any(char::is_control)
    {
        return Err("Invalid file path for rollback".into());
    }
    Ok(())
}

fn untracked_preview(full_path: &Path, budget: usize) -> Result<(String, usize), String> {
    let metadata = std::fs::symlink_metadata(full_path).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
        return Ok((
            "Symbolic link. Inspect its target in the terminal.".into(),
            0,
        ));
    }
    if !metadata.is_file() || metadata.len() > 1_000_000 || budget == 0 {
        return Ok(("Preview omitted: not a regular file or review size limit reached. Inspect it in the terminal before committing.".into(), 0));
    }
    use std::io::Read;
    let mut bytes = Vec::new();
    std::fs::File::open(full_path)
        .and_then(|file| file.take(1_000_001).read_to_end(&mut bytes))
        .map_err(|error| error.to_string())?;
    if bytes.contains(&0) {
        return Ok(("Binary file. No text preview available.".into(), 0));
    }
    let content = String::from_utf8_lossy(&bytes);
    let count = content.lines().count();
    let preview = content
        .lines()
        .take(2000)
        .map(|line| format!("+{line}\n"))
        .collect();
    Ok((preview, count))
}

fn parse_status(bytes: &[u8]) -> Vec<StatusEntry> {
    let mut fields = bytes.split(|byte| *byte == 0);
    let mut entries = Vec::new();
    while let Some(field) = fields.next() {
        if field.len() < 4 {
            continue;
        }
        let status = String::from_utf8_lossy(&field[..2]).trim().to_string();
        let path = String::from_utf8_lossy(&field[3..]).into_owned();
        let original_path = if field[..2].contains(&b'R') || field[..2].contains(&b'C') {
            fields
                .next()
                .map(|source| String::from_utf8_lossy(source).into_owned())
        } else {
            None
        };
        entries.push(StatusEntry {
            status,
            path,
            original_path,
        });
    }
    entries
}

/// Parses `git diff --numstat -z`. Renames emit an empty path followed by source and destination;
/// the destination matches the path `git status` reports. Binary files ("-") count as zero.
fn parse_numstat(bytes: &[u8]) -> HashMap<String, (usize, usize)> {
    let mut fields = bytes.split(|byte| *byte == 0);
    let mut counts = HashMap::new();
    while let Some(field) = fields.next() {
        let text = String::from_utf8_lossy(field);
        let mut parts = text.splitn(3, '\t');
        let (Some(added), Some(deleted), Some(path)) = (parts.next(), parts.next(), parts.next())
        else {
            continue;
        };
        let path = if path.is_empty() {
            fields.next();
            match fields.next() {
                Some(destination) => String::from_utf8_lossy(destination).into_owned(),
                None => continue,
            }
        } else {
            path.to_string()
        };
        counts.insert(
            path,
            (added.parse().unwrap_or(0), deleted.parse().unwrap_or(0)),
        );
    }
    counts
}

fn unquote_path(path: &str) -> String {
    if !path.starts_with('"') {
        return path.to_string();
    }
    let mut decoded = Vec::new();
    let mut bytes = path.trim_matches('"').bytes().peekable();
    while let Some(byte) = bytes.next() {
        if byte != b'\\' {
            decoded.push(byte);
            continue;
        }
        match bytes.next() {
            Some(b't') => decoded.push(b'\t'),
            Some(b'n') => decoded.push(b'\n'),
            Some(b'r') => decoded.push(b'\r'),
            Some(first @ b'0'..=b'7') => {
                let mut value = (first - b'0') as u16;
                for _ in 0..2 {
                    if bytes.peek().is_some_and(|byte| matches!(byte, b'0'..=b'7')) {
                        value = value * 8 + (bytes.next().unwrap_or(b'0') - b'0') as u16;
                    }
                }
                decoded.push(value as u8);
            }
            Some(byte) => decoded.push(byte),
            None => (),
        }
    }
    String::from_utf8_lossy(&decoded).into_owned()
}

fn split_patch(patch: &str) -> HashMap<String, String> {
    let mut patches = HashMap::new();
    for chunk in patch
        .strip_prefix("diff --git ")
        .unwrap_or(patch)
        .split("\ndiff --git ")
    {
        let new_path = chunk
            .lines()
            .find_map(|line| line.strip_prefix("+++ "))
            .map(unquote_path);
        let old_path = chunk
            .lines()
            .find_map(|line| line.strip_prefix("--- "))
            .map(unquote_path);
        let path = new_path.filter(|path| path != "/dev/null").or(old_path);
        if let Some(path) = path {
            patches.insert(
                path.strip_prefix("b/")
                    .or_else(|| path.strip_prefix("a/"))
                    .unwrap_or(&path)
                    .to_string(),
                format!("diff --git {chunk}"),
            );
        }
    }
    patches
}

fn truncate_preview(text: &str, limit: usize) -> String {
    if text.len() <= limit {
        return text.to_string();
    }
    if limit == 0 {
        return "Preview omitted: total review size limit reached. Inspect this file in the terminal.".into();
    }
    let mut end = limit;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    format!(
        "{}\n[Preview truncated. Inspect the full change in the terminal before committing.]",
        &text[..end]
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn normalizes_windows_and_msys_paths_for_ipc() {
        assert_eq!(
            GitManager::normalize_path(r"C:\repo\worktree\"),
            "C:/repo/worktree"
        );
        assert_eq!(
            GitManager::normalize_path("/c/repo/worktree/"),
            "C:/repo/worktree"
        );
        assert_eq!(GitManager::normalize_path("/é/repo"), "/é/repo");
        assert_eq!(GitManager::normalize_path("C://"), "C:/");
        assert_eq!(GitManager::normalize_path("C:"), "C:/");
        assert_eq!(
            GitManager::normalize_path(r"\\server\share\"),
            "//server/share"
        );
    }
    #[test]
    fn worktree_ids_are_stable_and_case_insensitive() {
        assert_eq!(
            GitManager::generate_worktree_id("C:/Repo/Worktree"),
            GitManager::generate_worktree_id("c:\\repo\\worktree")
        );
    }
    #[test]
    fn nul_status_preserves_names_and_rename_destination() {
        let entries =
            parse_status(b"R  new -> name.txt\0old.txt\0?? leading space.txt\0 M a\tb.txt\0");
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].path, "new -> name.txt");
        assert_eq!(entries[0].original_path.as_deref(), Some("old.txt"));
        assert_eq!(entries[2].path, "a\tb.txt");
        let copies = parse_status(b"C  copy.txt\0source.txt\0");
        assert_eq!(copies[0].original_path.as_deref(), Some("source.txt"));
    }
    #[test]
    fn numstat_counts_follow_rename_destination_and_skip_binary() {
        let counts =
            parse_numstat(b"3\t1\tsrc/a b.rs\0-\t-\timage.png\x005\t0\t\0old.txt\0new.txt\0");
        assert_eq!(counts.get("src/a b.rs"), Some(&(3, 1)));
        assert_eq!(counts.get("image.png"), Some(&(0, 0)));
        assert_eq!(counts.get("new.txt"), Some(&(5, 0)));
        assert!(!counts.contains_key("old.txt"));
    }
    #[test]
    fn preview_limits_are_unicode_safe() {
        assert!(truncate_preview("日本語".repeat(20).as_str(), 5).starts_with('日'));
        assert_eq!(unquote_path(r#""b/a\tb.txt""#), "b/a\tb.txt");
    }
    #[test]
    fn patch_content_cannot_be_mistaken_for_a_file_header() {
        let chunks = split_patch("diff --git a/test.txt b/test.txt\n--- a/test.txt\n+++ b/test.txt\n@@ -1 +1 @@\n-old\n+contains diff --git text\n");
        assert!(chunks["test.txt"].contains("+contains diff --git text"));
    }
    #[test]
    fn mutation_guard_rejects_duplicate_writes() {
        let guard = Mutation::begin("C:/unique-test-repo").unwrap();
        assert!(Mutation::begin("c:/unique-test-repo").is_err());
        drop(guard);
        assert!(Mutation::begin("c:/unique-test-repo").is_ok());
    }

    #[test]
    fn real_git_worktree_diff_commit_remove_lifecycle() {
        // All writes/removals are restricted to this test's unique temporary directory.
        struct Scratch(std::path::PathBuf);
        impl Drop for Scratch {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let root = std::env::var_os("LOCALAPPDATA")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(std::env::temp_dir)
            .join("Temp/opencode")
            .join(format!("vela-git-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("repo")).unwrap();
        let scratch = Scratch(root);
        let path = scratch.0.join("repo").to_string_lossy().replace('\\', "/");
        let run = |args: &[&str]| {
            GitManager::checked(
                GitManager::run(
                    GitManager::git_cmd().arg("-C").arg(&path).args(args),
                    256 * 1024,
                )
                .unwrap(),
            )
            .unwrap()
        };
        run(&["init", "-b", "main"]);
        run(&["config", "user.name", "Vela Test"]);
        run(&["config", "user.email", "vela-test@example.invalid"]);
        run(&["config", "commit.gpgsign", "false"]);
        run(&["config", "core.autocrlf", "false"]);
        let hooks = scratch.0.join("hooks");
        std::fs::create_dir(&hooks).unwrap();
        run(&["config", "core.hooksPath", &hooks.to_string_lossy()]);
        std::fs::write(scratch.0.join("repo/first.txt"), "original\n").unwrap();
        GitManager::commit_worktree(&path, "initial").unwrap();
        let worktree = GitManager::create_worktree(&path, "feat/test", None).unwrap();
        // A write in a linked worktree must block writes through the main worktree.
        let guard = Mutation::repository(&worktree.path).unwrap();
        assert!(Mutation::repository(&path).is_err());
        drop(guard);
        let from_linked = GitManager::create_worktree(&worktree.path, "feat/second", None).unwrap();
        assert!(from_linked.name.starts_with("repo-feat_second-"));
        GitManager::remove_worktree(&path, &from_linked.path, false).unwrap();
        assert_eq!(GitManager::list_worktrees(&path, true).unwrap().len(), 2);
        std::fs::write(Path::new(&worktree.path).join("first.txt"), "updated\n").unwrap();
        std::fs::write(
            Path::new(&worktree.path).join("日本 file.txt"),
            "new content\n",
        )
        .unwrap();
        let changes = GitManager::get_worktree_diff(&worktree.path).unwrap();
        assert_eq!(changes.len(), 2);
        assert!(changes
            .iter()
            .any(|file| file.path == "first.txt" && file.additions > 0 && file.deletions > 0));
        assert!(changes
            .iter()
            .any(|file| file.path == "日本 file.txt" && file.additions == 1));
        let summary = GitManager::get_worktree_changes(&worktree.path).unwrap();
        assert_eq!(summary.total, 2);
        assert!(summary.files.iter().any(|file| file.path == "first.txt"
            && file.status == "M"
            && file.additions == 1
            && file.deletions == 1));
        assert!(summary
            .files
            .iter()
            .any(|file| file.path == "日本 file.txt" && file.status == "??"));
        assert!(GitManager::remove_worktree(&path, &worktree.path, false).is_err());
        GitManager::commit_worktree(&worktree.path, "reviewed task").unwrap();
        assert_eq!(
            GitManager::get_worktree_changes(&worktree.path)
                .unwrap()
                .total,
            0
        );
        assert!(GitManager::get_worktree_diff(&worktree.path)
            .unwrap()
            .is_empty());
        assert!(GitManager::get_worktree_diff(&path).unwrap().is_empty());
        GitManager::remove_worktree(&path, &worktree.path, false).unwrap();
        assert_eq!(GitManager::list_worktrees(&path, true).unwrap().len(), 1);
        assert_eq!(GitManager::list_worktrees(&path, false).unwrap().len(), 1);
        assert_eq!(
            GitManager::list_worktrees(&path, false).unwrap()[0].dirty_files_count,
            None
        );
        assert!(GitManager::create_worktree(&path, "--invalid", None).is_err());
        assert!(GitManager::remove_worktree(&path, &path, false).is_err());

        // Test rollback per file and reset all changes
        let file_tracked = scratch.0.join("repo/first.txt");
        let file_untracked = scratch.0.join("repo/untracked.txt");
        std::fs::write(&file_tracked, "modified content\n").unwrap();
        std::fs::write(&file_untracked, "new untracked\n").unwrap();
        assert_eq!(GitManager::get_worktree_diff(&path).unwrap().len(), 2);

        // Rollback untracked file
        GitManager::rollback_file(&path, "untracked.txt").unwrap();
        assert!(!file_untracked.exists());
        assert_eq!(GitManager::get_worktree_diff(&path).unwrap().len(), 1);

        // Rollback tracked file
        GitManager::rollback_file(&path, "first.txt").unwrap();
        assert_eq!(
            std::fs::read_to_string(&file_tracked).unwrap(),
            "original\n"
        );
        assert!(GitManager::get_worktree_diff(&path).unwrap().is_empty());

        // Natural staged renames, with both staged and unstaged destination edits.
        for variant in 0..3 {
            run(&["mv", "first.txt", "renamed.txt"]);
            if variant > 0 {
                std::fs::write(scratch.0.join("repo/renamed.txt"), "original\nextra\n").unwrap();
            }
            if variant == 2 {
                run(&["add", "renamed.txt"]);
            }
            GitManager::rollback_file(&path, "renamed.txt").unwrap();
            assert_eq!(
                std::fs::read_to_string(&file_tracked).unwrap(),
                "original\n"
            );
            assert!(!scratch.0.join("repo/renamed.txt").exists());
            assert!(GitManager::status(&path).unwrap().is_empty());
        }
        run(&["mv", "first.txt", "renamed.txt"]);
        std::fs::write(&file_tracked, "independent local file\n").unwrap();
        assert!(GitManager::rollback_file(&path, "renamed.txt").is_err());
        assert_eq!(
            std::fs::read_to_string(&file_tracked).unwrap(),
            "independent local file\n"
        );
        GitManager::reset_worktree(&path).unwrap();

        // Index deletion + untracked replacement must be distinct and non-destructive.
        run(&["rm", "--cached", "first.txt"]);
        std::fs::write(&file_tracked, "local replacement\n").unwrap();
        let duplicate = GitManager::get_worktree_diff(&path).unwrap();
        assert_eq!(duplicate.len(), 2);
        assert!(duplicate.iter().all(|file| file.rollback_error.is_some()));
        assert!(duplicate
            .iter()
            .find(|file| file.status == "D")
            .unwrap()
            .diff_content
            .contains("-original"));
        assert!(duplicate
            .iter()
            .find(|file| file.status == "??")
            .unwrap()
            .diff_content
            .contains("+local replacement"));
        assert!(GitManager::rollback_file(&path, "first.txt").is_err());
        let summary = GitManager::get_worktree_changes(&path).unwrap();
        let deletion = summary
            .files
            .iter()
            .find(|file| file.status == "D")
            .unwrap();
        assert_eq!((deletion.additions, deletion.deletions), (0, 1));
        assert_eq!(
            std::fs::read_to_string(&file_tracked).unwrap(),
            "local replacement\n"
        );
        GitManager::reset_worktree(&path).unwrap();

        // A vanished untracked file cannot prevent review of remaining changes.
        std::fs::write(&file_tracked, "still reviewable\n").unwrap();
        let entries = parse_status(b" M first.txt\0?? vanished.txt\0");
        let partial = GitManager::diff_entries(&path, entries).unwrap();
        assert_eq!(partial.len(), 2);
        assert!(partial
            .iter()
            .any(|file| file.diff_content.contains("+still reviewable")));
        assert!(partial.iter().any(|file| file
            .diff_content
            .contains("Preview unavailable for vanished.txt")));
        GitManager::rollback_file(&path, "first.txt").unwrap();

        // Literal pathspecs must not roll back a sibling whose name matches a wildcard.
        std::fs::write(scratch.0.join("repo/[a].txt"), "literal\n").unwrap();
        std::fs::write(scratch.0.join("repo/a.txt"), "sibling\n").unwrap();
        GitManager::rollback_file(&path, "[a].txt").unwrap();
        assert!(scratch.0.join("repo/a.txt").exists());
        GitManager::rollback_file(&path, "a.txt").unwrap();

        // Status errors are isolated and unchecked worktrees are never marked clean.
        let broken = GitManager::create_worktree(&path, "broken", None).unwrap();
        let git_file = Path::new(&broken.path).join(".git");
        std::fs::remove_file(&git_file).unwrap();
        std::fs::write(&git_file, "gitdir: nonexistent-git-directory\n").unwrap();
        let listing = GitManager::list_worktrees(&path, true).unwrap();
        let unavailable = listing
            .iter()
            .find(|item| item.path == broken.path)
            .unwrap();
        assert_eq!(unavailable.dirty_files_count, None);
        assert!(unavailable.status_error.is_some());
        assert_eq!(
            listing
                .iter()
                .find(|item| item.path == path)
                .unwrap()
                .dirty_files_count,
            Some(0)
        );
        assert!(GitManager::find_repo_root(Some(&broken.path)).is_err());
        let plain = scratch.0.join("plain");
        std::fs::create_dir(&plain).unwrap();
        assert!(GitManager::find_repo_root(Some(&plain.to_string_lossy()))
            .unwrap()
            .is_none());
        let envs: HashMap<_, _> = GitManager::git_cmd()
            .get_envs()
            .map(|(key, value)| (key.to_owned(), value.map(|value| value.to_owned())))
            .collect();
        assert_eq!(
            envs.get(std::ffi::OsStr::new("LC_ALL")),
            Some(&Some("C".into()))
        );

        // Test invalid paths
        assert!(GitManager::rollback_file(&path, "../escape").is_err());
        assert!(GitManager::rollback_file(&path, "--flag").is_err());

        // Test reset_worktree (reset all)
        std::fs::write(&file_tracked, "will be reset\n").unwrap();
        std::fs::write(&file_untracked, "will be cleaned\n").unwrap();
        assert_eq!(GitManager::get_worktree_diff(&path).unwrap().len(), 2);
        GitManager::reset_worktree(&path).unwrap();
        assert_eq!(
            std::fs::read_to_string(&file_tracked).unwrap(),
            "original\n"
        );
        assert!(!file_untracked.exists());
        assert!(GitManager::get_worktree_diff(&path).unwrap().is_empty());
    }
}
