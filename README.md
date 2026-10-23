# Vela

A Windows desktop terminal and Git worktree manager built with Rust, Tauri 2, React 19, and TypeScript.

## Features

- Native ConPTY terminals with persistent tab buffers and optional WebGL rendering.
- PowerShell, CMD, Git Bash, WSL, and coding agent profiles that are listed only when installed.
- Instant startup: the window is revealed as soon as the React workspace mounts, with no splash delay.
- Single pane, vertical split, and horizontal split with independent keyboard focus.
- Git worktree creation/removal, bounded unified diff previews, and commit of all changes.
- Switchable Git / Files sidebar with a lazy-loading folder tree and VS Code-style file icons.
- Tabbed code editor with syntax highlighting, line numbers, search, undo/redo, and Ctrl+S saving.
- Inline errors, retryable launch forms, isolated terminal render failures, and local diagnostics.
- Safe agent defaults: agent permission checks stay on, with one deliberate exception — the Claude Code preset launches with `--dangerously-skip-permissions`.

Vela launches CLI agents; it does **not** currently parse their task status, provide a security sandbox, or implement the Android Remote Companion. The PRDs describe future goals, not a list of shipped features.

## Requirements

- Windows 10/11 x64 with Microsoft Edge WebView2 Runtime.
- Git 2.40+ available in PATH.
- Installed shells/agents you intend to launch.
- For development: Node.js 22.12+ or 24 LTS, stable Rust, and Visual Studio C++ build tools / Windows SDK.

```powershell
npm ci
npm run tauri dev
```

`npm run dev` is a browser-only UI preview with mocked terminal and Git operations. It does not validate native PTY/Git behaviour.

## Checks and release build

```powershell
npm run lint
npm run format:check
npm test
npm run test:ui
npm run build
cd src-tauri
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo check --locked
cargo test --locked --lib
cd ..
npx @tauri-apps/cli build --no-bundle
```

Release executable: `src-tauri/target/release/vela.exe`. Bundling is disabled; this command does not create an installer. Close a running release copy before rebuilding it.

### Windows installer (NSIS, x64)

Bundling is off in `src-tauri/tauri.conf.json`; the installer is produced with a config override:

```powershell
# 1. bump the version in all 5 files: src-tauri/tauri.conf.json, src-tauri/Cargo.toml,
#    src-tauri/Cargo.lock, package.json, package-lock.json  (see AGENTS.md)
# 2. run the checks above
npx @tauri-apps/cli build --config src-tauri/tauri.bundle.json
```

Output: `src-tauri/target/release/bundle/nsis/Vela_<version>_x64-setup.exe` (installs to `%LOCALAPPDATA%\Vela\`, per-user, no admin required). Run the new installer over the existing install to upgrade — the version bump is what makes the installer take the upgrade path instead of the reinstall path.

The Windows CI workflow runs frontend lint/format checks/tests/build, Rust fmt/clippy/checks/tests, and the release build. Rust tests include real temporary Git worktree/diff/commit/remove operations and real Windows ConPTY input/output, natural exit, and shutdown. Frontend tests cover stale requests, duplicate submissions, launch retry, split focus, output acknowledgements, input limits, and directory metadata.

`npm run test:ui` uses an installed Microsoft Edge in an isolated headless profile. It checks the browser-preview workspace at 1280×820 and 800×550, including real xterm layout, split focus, modal shortcuts, and recoverable errors. This does not replace interactive testing in the native WebView2 window. The test runner starts/stops its own Vite server; port 1420 must be free.

## Safety and recovery

### File Explorer and editor

Click **Open Files** (above **Open Dir**) to browse the active terminal directory, or choose a folder when there is no active directory. Expand folders with a single click; double-click a file (or press Enter) to edit it on the right. **Git / Files** switches the sidebar; **Terminal / Editor** switches the workspace without stopping terminals or discarding edits. **Open Dir** still opens Windows File Explorer.

The editor supports UTF-8 text files up to 2 MiB and 20 open tabs. LF/CRLF and UTF-8 BOM are preserved; binary files, other encodings, and mixed/legacy line endings are refused. Folder listings are capped at 5,000 entries; Git metadata and links outside the Explorer root are excluded. Filesystem permissions still apply.

Save with **Ctrl+S** or the Save button. Unsaved tabs show a dot, and closing a dirty tab or the native window asks whether to save, discard, or cancel. If the disk content changed since opening/saving, Vela refuses to overwrite it and keeps your edits. Copy your edits before discarding and reopening to resolve a conflict. Files are replaced through a temporary sibling file rather than truncated in place. Open editor tabs are not restored after restarting Vela. The browser-only preview cannot read or save real files.

### Git and terminal operations

- A worktree separates Git files, **not** filesystem permissions. Agents run with your user privileges and their normal permission prompts.
- Commit includes every tracked and unignored untracked change via `git add -A`. There is no file selection or automatic push.
- Failed commits may leave changes staged. Timed-out write operations must be checked with `git status` / `git log` before retrying. Vela never automatically retries a Git write.
- The diff modal keeps its target fixed during a commit. A refresh failure after a successful commit is reported separately.
- Per-file rollback restores both sides of a detected rename. Paths with multiple Git status entries cannot be rolled back individually; resolve them in the terminal or explicitly review Reset All. Git status failures are shown as unavailable, never as clean.
- Worktree removal requires confirmation, refuses active terminal directories in the UI, and lets Git protect dirty worktrees. The main worktree cannot be removed.
- App close is blocked while an in-process Git write is running. On exit, Vela terminates its terminal process trees; it does not terminate external terminals.
- A failed terminal can be closed without losing the rest of the workspace. Session restoration across app restarts is not implemented.

Local diagnostics: `%LOCALAPPDATA%/Vela/logs/errors.log`, rotated at roughly 256 KiB with one previous file. Logs contain error details and may contain paths; terminal streams are not logged and diagnostics are not uploaded.

## Resource bounds and performance

- Maximum 32 terminal tabs; each has 5,000 lines of scrollback.
- PTY output remains Tauri events, with a 64 KiB unacknowledged byte window per session. Credits return only after xterm consumes the output. A stalled renderer is stopped after a 60 second deadline.
- Ordered input is chunked without splitting Unicode surrogate pairs. Pastes above 262,144 UTF-16 code units are refused rather than queued indefinitely.
- Git command output and execution duration are bounded. Most reads time out at 30 seconds; writes at 120 seconds; agent version probes at 5 seconds.
- Review supports up to 500 changed files. Batch patches are capped at 8 MiB, per-file previews at about 32 KiB, and total text previews at about 2 MiB plus explanatory notices. Truncated/unavailable previews must be inspected in a terminal before committing.
- The terminal and GPU renderer load separately from the initial app shell. Startup no longer waits for a decorative splash.

RAM, cold-start, and FPS numbers in earlier PRDs are **targets, not verified benchmarks**. Production acceptance still requires interactive WebView2/agent testing and sustained-load profiling on the deployment machines.

## Directory tracking

PowerShell, CMD, and standard Git Bash profiles report prompt directories through OSC 7; the active repository follows supported directory changes. PowerShell preserves the original prompt, and PowerShell-hosted agent presets install the same integration before launching the agent. Custom prompt scripts can override shell integration; custom `-File`/encoded-command launches are not rewritten. Unmapped Linux paths from WSL/custom shells cannot be interpreted as Windows Git paths; those sessions retain their launch context until a compatible directory report is available.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+T | Open terminal launch dialog |
| Ctrl+W | Close focused terminal tab, or active file in Editor |
| Ctrl+S | Save the active file in Editor |
| Ctrl+F in editor | Find text in the active file |
| Double click tab | Rename tab |
| Double click titlebar | Maximize / restore |
| Escape | Close a dialog when no operation is pending |
| Ctrl+Enter in commit input | Commit reviewed worktree |

Global tab shortcuts are suspended while a modal dialog is open.
