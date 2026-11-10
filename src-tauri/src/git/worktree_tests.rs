use super::*;
use std::collections::HashMap;
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
    let entries = parse_status(b"R  new -> name.txt\0old.txt\0?? leading space.txt\0 M a\tb.txt\0");
    assert_eq!(entries.len(), 3);
    assert_eq!(entries[0].path, "new -> name.txt");
    assert_eq!(entries[0].original_path.as_deref(), Some("old.txt"));
    assert_eq!(entries[2].path, "a\tb.txt");
    let copies = parse_status(b"C  copy.txt\0source.txt\0");
    assert_eq!(copies[0].original_path.as_deref(), Some("source.txt"));
}
#[test]
fn numstat_counts_follow_rename_destination_and_skip_binary() {
    let counts = parse_numstat(b"3\t1\tsrc/a b.rs\0-\t-\timage.png\x005\t0\t\0old.txt\0new.txt\0");
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
fn head_branch_is_read_from_main_and_linked_worktree_metadata() {
    // Synthetic worktrees only: no Git process is involved in reading HEAD.
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
        .join(format!("vela-head-test-{}", uuid::Uuid::new_v4()));
    let main = root.join("main");
    let linked = root.join("linked");
    let linked_git_dir = root.join("gitdirs/linked");
    std::fs::create_dir_all(main.join(".git")).unwrap();
    std::fs::create_dir_all(&linked).unwrap();
    std::fs::create_dir_all(&linked_git_dir).unwrap();
    let scratch = Scratch(root);
    let main_path = main.to_string_lossy().replace('\\', "/");
    let linked_path = linked.to_string_lossy().replace('\\', "/");
    let missing_path = scratch
        .0
        .join("missing")
        .to_string_lossy()
        .replace('\\', "/");

    // Symbolic HEAD: branch names may contain slashes and must never be shortened.
    std::fs::write(
        main.join(".git/HEAD"),
        "ref: refs/heads/feat/branch-after-switch\n",
    )
    .unwrap();
    assert_eq!(
        GitManager::read_head_branch(&main_path).as_deref(),
        Some("feat/branch-after-switch")
    );

    // Linked worktrees reach their Git directory through a `.git` file (relative here).
    std::fs::write(linked.join(".git"), "gitdir: ../gitdirs/linked\n").unwrap();
    std::fs::write(linked_git_dir.join("HEAD"), "ref: refs/heads/task/linked\n").unwrap();

    // A raw commit ID is detached HEAD, worded like `git worktree list`.
    std::fs::write(main.join(".git/HEAD"), format!("{}\n", "a".repeat(40))).unwrap();
    assert_eq!(
        GitManager::read_head_branch(&main_path).as_deref(),
        Some("detached")
    );

    // Unknown or malformed metadata keeps the caller's previous label (None).
    std::fs::write(main.join(".git/HEAD"), "not a ref\n").unwrap();
    assert_eq!(GitManager::read_head_branch(&main_path), None);
    assert_eq!(GitManager::read_head_branch(&missing_path), None);

    std::fs::write(
        main.join(".git/HEAD"),
        "ref: refs/heads/feat/branch-after-switch\n",
    )
    .unwrap();
    assert_eq!(
        GitManager::read_head_branches(&[
            main_path.clone(),
            linked_path.clone(),
            missing_path.clone()
        ]),
        vec![
            Some("feat/branch-after-switch".into()),
            Some("task/linked".into()),
            None
        ]
    );
}

#[test]
fn mutation_guard_rejects_duplicate_writes() {
    let guard = Mutation::begin("C:/unique-test-repo").unwrap();
    assert!(Mutation::begin("c:/unique-test-repo").is_err());
    drop(guard);
    assert!(Mutation::begin("c:/unique-test-repo").is_ok());
}

#[test]
fn real_git_branch_switch_lifecycle() {
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
        .join(format!("vela-switch-test-{}", uuid::Uuid::new_v4()));
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
    std::fs::write(scratch.0.join("repo/tracked.txt"), "original\n").unwrap();
    GitManager::commit_worktree(&path, "initial").unwrap();
    run(&["branch", "feat/switch"]);

    // Listing annotates the current branch and free branches.
    let branches = GitManager::list_branches(&path).unwrap();
    assert_eq!(
        branches
            .iter()
            .map(|branch| branch.name.as_str())
            .collect::<Vec<_>>(),
        vec!["feat/switch", "main"]
    );
    let main = branches
        .iter()
        .find(|branch| branch.name == "main")
        .unwrap();
    assert!(main.is_current);
    assert_eq!(main.checked_out_at.as_deref(), Some(path.as_str()));
    let free = branches
        .iter()
        .find(|branch| branch.name == "feat/switch")
        .unwrap();
    assert!(!free.is_current);
    assert_eq!(free.checked_out_at, None);

    // Unknown, current, invalid, and occupied targets are rejected before any write.
    assert!(GitManager::switch_branch(&path, "missing", false).is_err());
    assert!(GitManager::switch_branch(&path, "main", false).is_err());
    assert!(GitManager::switch_branch(&path, "--invalid", false).is_err());
    let occupied = GitManager::create_worktree(&path, "feat/occupied", None).unwrap();
    assert!(GitManager::switch_branch(&path, "feat/occupied", false).is_err());
    GitManager::remove_worktree(&path, &occupied.path, false).unwrap();

    // Dirty tracked and untracked work rides along through stash, switch, and pop.
    std::fs::write(scratch.0.join("repo/tracked.txt"), "work in progress\n").unwrap();
    std::fs::write(scratch.0.join("repo/untracked.txt"), "new file\n").unwrap();
    GitManager::switch_branch(&path, "feat/switch", true).unwrap();
    assert_eq!(
        GitManager::read_head_branch(&path).as_deref(),
        Some("feat/switch")
    );
    assert_eq!(
        std::fs::read_to_string(scratch.0.join("repo/tracked.txt")).unwrap(),
        "work in progress\n"
    );
    assert_eq!(
        std::fs::read_to_string(scratch.0.join("repo/untracked.txt")).unwrap(),
        "new file\n"
    );
    // The auto-stash was popped, not left on the stack.
    let stash_list = run(&["stash", "list"]);
    assert!(String::from_utf8_lossy(&stash_list.stdout)
        .trim()
        .is_empty());

    // A clean switch with stash requested creates no stash entry.
    GitManager::reset_worktree(&path).unwrap();
    GitManager::switch_branch(&path, "main", true).unwrap();
    assert_eq!(GitManager::read_head_branch(&path).as_deref(), Some("main"));
    let stash_list = run(&["stash", "list"]);
    assert!(String::from_utf8_lossy(&stash_list.stdout)
        .trim()
        .is_empty());

    // The branch list follows the new HEAD.
    let branches = GitManager::list_branches(&path).unwrap();
    assert!(
        branches
            .iter()
            .find(|branch| branch.name == "main")
            .unwrap()
            .is_current
    );
}

#[test]
fn real_git_switch_in_linked_worktree_never_leaves_head_detached() {
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
        .join(format!("vela-linked-switch-test-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(root.join("repo")).unwrap();
    let scratch = Scratch(root);
    let path = scratch.0.join("repo").to_string_lossy().replace('\\', "/");
    let run_at = |at: &str, args: &[&str]| {
        GitManager::checked(
            GitManager::run(
                GitManager::git_cmd().arg("-C").arg(at).args(args),
                256 * 1024,
            )
            .unwrap(),
        )
        .unwrap()
    };
    run_at(&path, &["init", "-b", "main"]);
    run_at(&path, &["config", "user.name", "Vela Test"]);
    run_at(
        &path,
        &["config", "user.email", "vela-test@example.invalid"],
    );
    run_at(&path, &["config", "commit.gpgsign", "false"]);
    run_at(&path, &["config", "core.autocrlf", "false"]);
    let hooks = scratch.0.join("hooks");
    std::fs::create_dir(&hooks).unwrap();
    run_at(
        &path,
        &["config", "core.hooksPath", &hooks.to_string_lossy()],
    );
    std::fs::write(scratch.0.join("repo/tracked.txt"), "original\n").unwrap();
    GitManager::commit_worktree(&path, "initial").unwrap();
    run_at(&path, &["branch", "feat/next"]);

    let linked = GitManager::create_worktree(&path, "feat/linked", None).unwrap();
    assert_eq!(
        GitManager::read_head_branch(&linked.path).as_deref(),
        Some("feat/linked")
    );

    // A sidebar switch on a linked worktree leaves HEAD attached to the chosen branch.
    GitManager::switch_branch(&linked.path, "feat/next", false).unwrap();
    assert_eq!(
        GitManager::read_head_branch(&linked.path).as_deref(),
        Some("feat/next")
    );
    let attached = run_at(&linked.path, &["symbolic-ref", "--short", "HEAD"]);
    assert_eq!(
        String::from_utf8_lossy(&attached.stdout).trim(),
        "feat/next"
    );

    // Advance the branch so its tip differs from the commit a detached HEAD would sit on.
    std::fs::write(
        std::path::Path::new(&linked.path).join("advance.txt"),
        "next\n",
    )
    .unwrap();
    GitManager::commit_worktree(&linked.path, "advance feat/next").unwrap();
    run_at(&linked.path, &["switch", "--detach", "HEAD~1"]);
    assert_eq!(
        GitManager::read_head_branch(&linked.path).as_deref(),
        Some("detached")
    );

    // A detached HEAD on another commit is never silently rewritten into the branch.
    assert!(GitManager::ensure_attached(&linked.path, "feat/next").is_err());
    assert_eq!(
        GitManager::read_head_branch(&linked.path).as_deref(),
        Some("detached")
    );

    // A detached HEAD already sitting on the branch tip is re-attached to the branch ref,
    // so the worktree can never keep showing "detached" after switching to that branch.
    run_at(
        &linked.path,
        &["switch", "--detach", "refs/heads/feat/next"],
    );
    assert_eq!(
        GitManager::read_head_branch(&linked.path).as_deref(),
        Some("detached")
    );
    GitManager::ensure_attached(&linked.path, "feat/next").unwrap();
    assert_eq!(
        GitManager::read_head_branch(&linked.path).as_deref(),
        Some("feat/next")
    );
    let attached = run_at(&linked.path, &["symbolic-ref", "--short", "HEAD"]);
    assert_eq!(
        String::from_utf8_lossy(&attached.stdout).trim(),
        "feat/next"
    );
    // Re-attaching moved no files: the commit and working tree are untouched.
    let head = run_at(&linked.path, &["rev-parse", "HEAD"]);
    let tip = run_at(&linked.path, &["rev-parse", "refs/heads/feat/next"]);
    assert_eq!(head.stdout, tip.stdout);
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
    // The label follows a real `git checkout` without listing worktrees.
    assert_eq!(GitManager::read_head_branch(&path).as_deref(), Some("main"));
    run(&["checkout", "-b", "feat/alternate"]);
    assert_eq!(
        GitManager::read_head_branch(&path).as_deref(),
        Some("feat/alternate")
    );
    run(&["checkout", "main"]);
    let worktree = GitManager::create_worktree(&path, "feat/test", None).unwrap();
    assert_eq!(
        GitManager::read_head_branch(&worktree.path).as_deref(),
        Some("feat/test")
    );
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
    assert_eq!(GitManager::read_head_branch(&worktree.path), None);
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
