use super::worktree::GitManager;
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};

pub(super) static MUTATIONS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
pub(super) struct Mutation(String);
impl Mutation {
    pub(super) fn begin(path: &str) -> Result<Self, String> {
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
    pub(super) fn repository(path: &str) -> Result<Self, String> {
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
