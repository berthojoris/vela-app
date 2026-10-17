use crate::models::{FileDiff, GitWorktree};
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
                "Another Git write is already running for this worktree. Please wait.".into(),
            );
        }
        Ok(Self(key))
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
            .env("GIT_PAGER", "cat");
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
    pub fn list_worktrees(repo_path: &str) -> Result<Vec<GitWorktree>, String> {
        let path = Self::directory(repo_path)?;
        let result = Self::checked(Self::run(
            Self::git_cmd().args(["-C", &path, "worktree", "list", "--porcelain", "-z"]),
            2 * 1024 * 1024,
        )?)?;
        let text = String::from_utf8_lossy(&result.stdout);
        let mut worktrees = Vec::new();
        let mut current: Option<(String, String)> = None;
        let mut append = |path: String, branch: String| -> Result<(), String> {
            let count = if Path::new(&path).is_dir() {
                Self::status(&path)?.len()
            } else {
                0
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
        let _operation = Mutation::begin(&path)?;
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
        let repo = Path::new(&path);
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
            dirty_files_count: 0,
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
        let _operation = Mutation::begin(&repo)?;
        let worktrees = Self::list_worktrees(&repo)?;
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
    fn status(path: &str) -> Result<Vec<(String, String)>, String> {
        let result = Self::checked(Self::run(
            Self::git_cmd().args([
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
    pub fn get_worktree_diff(worktree_path: &str) -> Result<Vec<FileDiff>, String> {
        let path = Self::directory(worktree_path)?;
        let entries = Self::status(&path)?;
        if entries.len() > MAX_FILES {
            return Err(format!("{} changed files exceed the {MAX_FILES} file review limit. Use the terminal to narrow or review this change set.", entries.len()));
        }
        if entries.is_empty() {
            return Ok(Vec::new());
        }
        let has_head = Self::run(
            Self::git_cmd().args(["-C", &path, "rev-parse", "--verify", "HEAD"]),
            64 * 1024,
        )?
        .status
        .success();
        let mut command = Self::git_cmd();
        command.args(["-C", &path, "diff", "--no-ext-diff", "--no-textconv"]);
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
        let mut budget = TOTAL_PREVIEW;
        let mut diffs = Vec::with_capacity(entries.len());
        for (status, file) in entries {
            let mut additions = 0;
            let mut deletions = 0;
            let text = if let Some(patch) = patches.remove(&file) {
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
                let full_path = Path::new(&path).join(&file);
                let metadata = std::fs::symlink_metadata(&full_path)
                    .map_err(|error| format!("Cannot inspect {file}: {error}"))?;
                if metadata.file_type().is_symlink() {
                    "Symbolic link. Inspect its target in the terminal.".into()
                } else if metadata.len() > 1_000_000 || budget == 0 {
                    "Preview omitted: file exceeds the review size limit. Inspect it in the terminal before committing.".into()
                } else {
                    // take() also bounds reads if another process grows the file after metadata().
                    use std::io::Read;
                    let mut bytes = Vec::new();
                    std::fs::File::open(&full_path)
                        .and_then(|file| file.take(1_000_001).read_to_end(&mut bytes))
                        .map_err(|error| format!("Cannot read {file}: {error}"))?;
                    if bytes.contains(&0) {
                        "Binary file. No text preview available.".into()
                    } else {
                        let content = String::from_utf8_lossy(&bytes);
                        additions = content.lines().count();
                        let mut preview = String::new();
                        for line in content.lines().take(2000) {
                            preview.push('+');
                            preview.push_str(line);
                            preview.push('\n');
                        }
                        preview
                    }
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
            });
        }
        Ok(diffs)
    }
    pub fn commit_worktree(worktree_path: &str, message: &str) -> Result<String, String> {
        let path = Self::directory(worktree_path)?;
        let _operation = Mutation::begin(&path)?;
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
}

fn parse_status(bytes: &[u8]) -> Vec<(String, String)> {
    let mut fields = bytes.split(|byte| *byte == 0);
    let mut entries = Vec::new();
    while let Some(field) = fields.next() {
        if field.len() < 4 {
            continue;
        }
        let status = String::from_utf8_lossy(&field[..2]).trim().to_string();
        let path = String::from_utf8_lossy(&field[3..]).into_owned();
        if field[..2].contains(&b'R') || field[..2].contains(&b'C') {
            fields.next();
        }
        entries.push((status, path));
    }
    entries
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
        assert_eq!(entries[0].1, "new -> name.txt");
        assert_eq!(entries[2].1, "a\tb.txt");
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
        assert_eq!(GitManager::list_worktrees(&path).unwrap().len(), 2);
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
        assert!(GitManager::remove_worktree(&path, &worktree.path, false).is_err());
        GitManager::commit_worktree(&worktree.path, "reviewed task").unwrap();
        assert!(GitManager::get_worktree_diff(&worktree.path)
            .unwrap()
            .is_empty());
        assert!(GitManager::get_worktree_diff(&path).unwrap().is_empty());
        GitManager::remove_worktree(&path, &worktree.path, false).unwrap();
        assert_eq!(GitManager::list_worktrees(&path).unwrap().len(), 1);
        assert!(GitManager::create_worktree(&path, "--invalid", None).is_err());
        assert!(GitManager::remove_worktree(&path, &path, false).is_err());
    }
}
