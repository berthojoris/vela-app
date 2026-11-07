use super::mutation::Mutation;
use super::parsing::*;
use super::worktree::GitManager;
use crate::models::{ChangedFile, FileDiff, WorktreeChanges};
use crate::process::output;
use std::{collections::HashMap, path::Path, time::Duration};

const MAX_FILES: usize = 500;
const MAX_DIFF: usize = 8 * 1024 * 1024;
const FILE_PREVIEW: usize = 32 * 1024;
const TOTAL_PREVIEW: usize = 2 * 1024 * 1024;

impl GitManager {
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
    pub(super) fn diff_entries(
        path: &str,
        entries: Vec<StatusEntry>,
    ) -> Result<Vec<FileDiff>, String> {
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
