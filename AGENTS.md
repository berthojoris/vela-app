# AGENTS.md — Vela (Rust + Tauri 2 desktop terminal/worktree manager)

## Identity & docs — read first

- The real product is **Vela** (`package.json` `name: vela`, Rust crate `vela` / lib `vela_lib`, `productName: Vela`; the shipped executable is `vela.exe` — the Cargo binary name, lowercase, while every user-facing name is `Vela`). `PRD.md` still uses an older codename for this product, and the UI consumes the legacy `orca` color alias in `tailwind.config.js` — do **not** rename existing identifiers to match the PRD.
- `PRD.md` and `PRD_Remote_Agent_Companion.md` are **aspirational specs, not implemented features**. Much of `PRD.md` does not exist in code: no `git2` (git is shelled out), no global-shortcut plugin, no tray usage, no notification usage, no agent status parsing, no zero-copy Channel IPC. The Remote Companion PRD (Android + Rust relay) has **no code at all** here.
- When a PRD and the code disagree, the code wins. Verify before assuming a feature exists.

## Commands

- Dev (Tauri window + HMR): `npm run tauri dev` (Vite on strict port `1420`).
- Frontend build + typecheck: `npm run build` (`tsc && vite build`); standalone `npm run typecheck`; regression tests: `npm test` (Vitest + jsdom).
- Lint/format: `npm run lint` (ESLint flat config), `npm run format` / `npm run format:check` (Prettier).
- Rust: `cargo check` / `cargo build` from `src-tauri/`; `cargo fmt --check`; `cargo clippy --all-targets -- -D warnings`; tests: `cargo test --locked --lib`.
- Release binary: `npx @tauri-apps/cli build --no-bundle`. `tauri.conf.json` has `bundle.active: false`, so `npm run tauri build` will **not** produce an installer; `--no-bundle` is intentional.
- Release **installer** (NSIS, Windows x64): `npx @tauri-apps/cli build --config src-tauri/tauri.bundle.json` — see "Release installer (NSIS)" below. Never flip `bundle.active` in `tauri.conf.json`; use the override file.
- Plain `npm run dev` runs the UI in a browser without Tauri; every `tauriIpc` method short-circuits via `isTauri()` and returns mocks. Useful for UI work, but it won't exercise real PTY/git.

Rust regression/integration tests exercise temporary Git repos and real ConPTY on Windows, with a mocked Tauri runtime. `build.rs` embeds a Common Controls v6 manifest for the test harness too. Windows checks live in `.github/workflows/check.yml`. Only claim checks actually run, and do not equate passing tests with verified RAM/FPS or zero bugs.

## Definition of done — release build on request only

- **Do NOT run release build unless explicitly requested**: Do not run `npx @tauri-apps/cli build --no-bundle` unless the user explicitly asks for a release build in their prompt.
- For code changes, verification is done via `npm run build` (`tsc && vite build`) / `npm run typecheck`, `npm run lint`, `npm run format:check`, and `cargo check` / `cargo clippy` / `cargo fmt --check` (or `cargo test`) from `src-tauri/`.
- **When a release build IS explicitly requested**: Run `npx @tauri-apps/cli build --no-bundle` from the repo root as the final step after checks are clean. The output is `src-tauri/target/release/vela.exe`. Confirm the build succeeded and the exe's timestamp was updated before reporting the task done.
- If the build fails, fix it (or report the exact error output) — don't hand back a task with a broken release build. If `vela.exe` is locked because the app is running, say so and ask the user to close it rather than killing the process.
- Docs-only changes (e.g. `*.md`) don't need build checks.
- **When a release *installer* is requested** (setup.exe / Windows installer / distributable release): follow the "Release installer (NSIS)" section — bump the version in all 5 files first, then build with `npx @tauri-apps/cli build --config src-tauri/tauri.bundle.json`. Do not reuse `--no-bundle` for that request, and do not enable `bundle.active` in `tauri.conf.json`.

## Push-only requests — git only, nothing else

When the prompt only asks to push ("push update to repo", "push update ke github", "push ke repo", "commit and push", or similar), the whole task is exactly: `git status` → `git add` → `git commit` → `git push`. This overrides the "Definition of done" above.

- Do **not** run builds, tests, typecheck, lint, format, `cargo` checks, Tauri/release/installer builds, version bumps, dependency installs, or edit any file.
- Read-only git inspection (`git diff --stat`, `git log -1 --oneline`, `git branch --show-current`, `git remote -v`) is allowed only to write an accurate commit message and target the push.
- Do not stage secrets or build output (`.env*`, keys, `node_modules/`, `dist/`, `target/`, `*.exe`); skip them and say so.
- Commit message describes the staged diff only, with no AI attribution. No `--amend`, `--no-verify`, `--allow-empty`.
- If the push is rejected (behind remote, auth, protected branch), stop and report — never `--force`, `pull`, `rebase`, `reset`, or `stash`.
- Checks run only if the same prompt explicitly asks for them. Claude Code agents use the `push-update-to-repo` skill, which has the full rules.

## Release installer (NSIS)

Use this section whenever a prompt asks for a **release installer**, a **Windows installer**, a **setup.exe**, or a distributable **release build**. The flow is always: **bump version → run checks → build installer → user runs the installer in upgrade mode**.

### Version bump comes first — 5 places, must stay in sync

The version is duplicated in **5 files**. A release installer build MUST bump all of them to the same semver string before building:

| File | Field | How to update |
| --- | --- | --- |
| `src-tauri/tauri.conf.json` | `"version"` | edit manually — **this is the one that names the installer file and drives upgrade detection** |
| `src-tauri/Cargo.toml` | `version = "..."` | edit manually |
| `src-tauri/Cargo.lock` | the `name = "vela"` entry's `version` | refreshed by `cargo build`; don't hand-edit unless the build won't run |
| `package.json` | `"version"` | `npm version <x.y.z> --no-git-tag-version` (also updates `package-lock.json`) |
| `package-lock.json` | 2× `"version"` | updated together with `package.json` |

- If the user did not specify a version, bump the **patch** component of the current version unless the change is a feature (minor) or breaking (major). State the chosen version in your report.
- Never bump only some of the 5. A mismatch between `tauri.conf.json` and `Cargo.toml` produces an installer whose filename disagrees with the built binary, and a mismatch with `package.json` breaks the published npm metadata.
- Verify the bump landed everywhere before building: `grep`/read the 5 files and confirm the same string.

### The UI version label follows the bump automatically

The footer status bar (`src/components/layout/StatusBar.tsx`) shows `Vela Core v<version>` in the bottom-left corner of the app window. That label is **derived, never hardcoded**:

- It starts from `version` imported out of `package.json` (so the 5-file bump above already updates it).
- On mount it upgrades to the real running binary version from Tauri's `getVersion()` (`tauri.conf.json` → ProductVersion) when the Tauri IPC is available, falling back to the bundled value in browser/`vitest` mode.

Do **not** write a literal version string (`v0.2.0`, `v0.1.0`, etc.) into `StatusBar.tsx`, and do not add a new hardcoded version literal anywhere in the UI. If you bump the release version, this label is covered by the same 5-file bump — just confirm it renders the new value (`npx vite`/`npm run dev` or the built app) rather than assuming it. When touching that label, keep the runtime `getVersion()` path and its `package.json` fallback (covered by `StatusBar.test.tsx`).

### Why the version bump is mandatory

Tauri's NSIS template compares the installed version against the new installer's version and branches on the result:

- **same version** → installer shows a *reinstall / uninstall* choice instead of an upgrade.
- **newer version** → **upgrade** path: the user can pick "uninstall old first" or "keep and overwrite" (files replaced in place, shortcuts refreshed).
- **older version** → **downgrade**, blocked by default (`allowDowngrades: false`).

So shipping an installer without a version bump makes existing installs treat it as a reinstall, which leaves Start Menu / desktop shortcuts in a broken state. Always bump.

### Build command

```
npx @tauri-apps/cli build --config src-tauri/tauri.bundle.json
```

- `src-tauri/tauri.bundle.json` is the **override** that turns bundling on (`bundle.active: true`, `targets: ["nsis"]`, `installMode: currentUser`, English only). `tauri.conf.json` keeps `bundle.active: false` on purpose — **do not edit it** to enable bundling.
- Run from the repo root. The command runs `beforeBuildCommand` (`npm run build` → `tsc && vite build`) automatically, then `cargo build --release`, then `makensis`.
- Output: `src-tauri/target/release/bundle/nsis/Vela_<version>_x64-setup.exe`.
- The standalone binary is also produced at `src-tauri/target/release/vela.exe`.

### Required order of operations

1. Bump the version in all 5 files (above).
2. Run the checks: `npm run build` / `npm run typecheck`, `npm run lint`, `npm run format:check`, and from `src-tauri/`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --locked --lib`.
3. Build the installer with the override config.
4. Confirm the installer exists, note its size and SHA256, and confirm `vela.exe`'s timestamp was updated.

### Naming and install layout (don't "fix" the casing)

- `productName: "Vela"` drives the **user-facing** names: installer file name, Start Menu shortcut, desktop shortcut, install folder (`%LOCALAPPDATA%\Vela\`), Add/Remove Programs `DisplayName`, and the exe's `ProductName`/`FileDescription` metadata.
- The **executable file** keeps the Cargo binary name, so it installs as `vela.exe` (lowercase) inside that folder. This is standard Tauri behavior — the shortcut is `Vela` but it targets `vela.exe`. Don't rename the binary to chase casing consistency unless the user explicitly asks; `AGENTS.md` already documents the release binary as `src-tauri/target/release/vela.exe`.
- App data lives under the `identifier` (`com.vela.ade`), not under the product name.

### Reporting

Report the installer's absolute path, size, SHA256, the version, and the upgrade behavior. State that the user should run the new installer over the existing install (upgrade mode) rather than uninstalling first. Don't claim the installer was tested on a clean machine unless it actually was.

## Layout

- `src-tauri/src/lib.rs` — **all** `#[tauri::command]` definitions + `generate_handler!` registration + `run()`.
- `src-tauri/src/main.rs` — thin; `#![windows_subsystem = "windows"]` suppresses the console.
- `src-tauri/src/models.rs` — all shared serde types (single source of truth for the wire format).
- `src-tauri/src/pty/manager.rs` — ConPTY sessions (portable-pty) + background reader threads.
- `src-tauri/src/git/worktree.rs` — worktree list/add/remove/diff/commit via the **`git` CLI**.
- `src-tauri/src/agent/supervisor.rs` — shell profiles + PATH-based agent availability filtering.
- `src-tauri/src/process.rs` — hidden, bounded child commands with execution deadlines; `diagnostics.rs` — bounded local error logs.
- `src-tauri/tauri.conf.json` — the app/window config; keeps `bundle.active: false` on purpose. `src-tauri/tauri.bundle.json` is the bundling **override** used only for installer builds — don't merge the two.
- Frontend: `src/App.tsx` → `src/components/*` (layout, tabs, terminal, sidebar, diff, modals); state in `src/stores/*` (Zustand); IPC wrappers in `src/lib/tauriIpc.ts`; mirrored types in `src/types/index.ts`.

## Code intelligence (CBM MCP, optional)

`cbm` is an **optional local MCP server** (codebase-memory-mcp) that exposes a code graph of this repository. Use it only when the `cbm` tools are present in the session; otherwise fall back to `grep` and direct file reads. Nothing in this project depends on it.

- Prefer graph tools for structure: `search_graph` (find symbols), `trace_path` (callers/callees), `get_architecture` (layers, boundaries, hotspots), `detect_changes` (impact of the current diff), `get_file_outline`, `get_code_snippet`.
- Use `search_code` / `grep` for literals (string constants, config keys, error text) and for any path `check_index_coverage` reports as partial or skipped.
- The project name is derived from the session's working directory, not hardcoded. Check `index_status` before trusting results; run `index_repository` when the index is missing or stale. Each worktree is a separate project index.
- The graph is **static analysis, not runtime truth**. Treat it as a navigation aid: verify against source before asserting behavior, and never treat an empty result as proof that a symbol, caller, or file does not exist.

## Strict Rust + Tauri 2 rules

1. **Adding an IPC command is a 3-file change**: define `#[tauri::command] fn` in `lib.rs`, add it to `generate_handler!`, then add a typed wrapper in `src/lib/tauriIpc.ts` (and a type in `src/types/index.ts` if it crosses the boundary). Skipping the wrapper leaves the command unreachable from the UI.
2. **Command errors are `Result<T, String>`** everywhere. Follow that; don't introduce a custom error enum or `thiserror` without a deliberate decision.
3. **Tauri 2 auto-converts camelCase JS args to snake_case Rust params.** `tauriIpc.ts` sends `worktreeId`/`isAgent`/`baseBranch`; the Rust fn params are `worktree_id`/`is_agent`/`base_branch`. Keep that mapping in mind when renaming either side.
4. **Keep `models.rs` and `src/types/index.ts` byte-aligned.** Enum serde attributes are load-bearing: `AgentType` uses `#[serde(rename_all = "snake_case")]` (so `OpenCode` ⇄ `'open_code'`), and the TS union mirrors that exact shape. Changing one side without the other silently breaks parsing. Do not add agent-status fields until both the backend and UI actually populate them.
5. **PTY output is streamed as Tauri events, not Channels.** The reader emits `pty-output-<session_id>` with `Vec<u8>`. xterm's write callback invokes `acknowledge_terminal_output` to return credits to the 64 KiB output window. Never acknowledge before rendering or remove backpressure. `pty-exit-<session_id>` carries a nullable exit code; `pty-error-<session_id>` carries a message. The PRD's "zero-copy Channel" is not implemented.
6. **Windows-only assumptions are deliberate.** Preserve `CREATE_NO_WINDOW` (`0x08000000`) on every spawned child (`git`, `taskkill`, PowerShell) so no console window flashes. Process-tree kill uses `taskkill /F /T /PID`. Non-Windows paths are stubs (`select_directory` returns `None`).
7. **Session state lives in a managed `Arc<Mutex<HashMap<...>>>`** (`PtyManager`, `.manage()` in `run()`). Frontend generates the session `id` (`term-<ts>-<rand>`) and passes it in; the backend keys on it.
8. **Long-running work goes on a dedicated `std::thread`**, not the Tauri command thread. Follow the existing spawn-reader pattern; don't block a command on PTY I/O.
9. **New plugins/window APIs may need `src-tauri/capabilities/default.json` entries.** The capability targets window `"main"` (the default label from `tauri.conf.json`). A new window needs its label added there.
10. Edition is 2021; `crate-type` includes `cdylib`/`staticlib` for mobile targets, but this app targets Windows desktop. Don't remove those crate types.
11. `src-tauri/gen/` is generated and gitignored — never edit it.
11a. Keep `app.security.dangerousDisableAssetCspModification: ["style-src"]` in `tauri.conf.json`. Otherwise Tauri adds a nonce to `style-src`, browsers then ignore `'unsafe-inline'`, and CodeMirror's injected `<style>` is blocked (the editor shows only line numbers). Guarded by `src/components/editor/CodeEditor.csp.test.ts`.
12. Preserve the separate PTY input, output, and process monitor workers. On Windows, shell exit alone does not close ConPTY output; the monitor closes the pseudoconsole while the reader drains it. Never hold the session registry across PTY I/O or process creation.
13. Agent profiles must retain safe permission defaults. The single deliberate exception is the `agent-claude` preset, which the project owner explicitly asked to launch as `claude --dangerously-skip-permissions`; keep it, but do not add permission-skipping flags to any other agent. Resolve arguments from the requested profile, not an unrelated default shell. Agent profiles are only offered when their command exists on PATH, and they launch through PowerShell (`-NoExit -Command <agent>`) so npm `.cmd` shims work.
14. Git writes are not auto-retried. Keep request identity guards in stores, pin the diff target while committing, and distinguish successful writes followed by refresh failure from failed writes.
15. **The product version lives in 5 files** (`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `package.json`, `package-lock.json`). They must always carry the same semver. When a release installer is requested, bump all 5 *before* building — see "Release installer (NSIS)".

## Windows gotchas

- Shell/profile resolution scans `PATH` + `PATHEXT` in-process (`AgentSupervisor::check_binary_exists`) rather than spawning `where.exe`. Reuse that helper instead of shelling out for existence checks.
- Git Bash is only detected at the two hard-coded `C:\Program Files\...\Git\bin\bash.exe` paths.
- Paths are normalized to forward slashes (`replace('\\', "/")`) before crossing the IPC boundary; keep that convention.
- `select_directory` first tries the dialog plugin, then falls back to a PowerShell `FolderBrowserDialog`.

## UI conventions

- Tailwind v4 uses the official Vite plugin. `src/index.css` imports Tailwind and loads `tailwind.config.js` with `@config`, preserving the `orca-*` / `vela-*` palettes (e.g. `bg-orca-darkest`, `text-orca-muted`, `border-orca-border`). `index.css` also sets base borders/scrollbars. Do not reintroduce the old Tailwind v3 PostCSS plugin.
- **Universal zero-shadow flat UI**: 1px borders, no `box-shadow`/elevation blur. Dark-only (`darkMode: "class"`, `class="dark"` on `<html>`). Match surrounding components when adding UI.
- Terminal rendering uses `@xterm/xterm` with the WebGL addon and a try/catch canvas/DOM fallback (`XTermView.tsx`); scrollback is capped at 5000 to bound WebView2 memory. Keep both.
- `App.tsx` renders immediately with no splash overlay; the native window stays hidden only until React mounts (the Rust setup thread is a 3-second failure fallback, not a startup delay). The panel starts clean with no active terminals or worktree history. OSC 7 directory metadata updates supported Windows shell session directories; WSL/custom prompt limitations are documented in README.md. Split pane position is independent of focused `activeSessionId` (`primarySessionId` and `secondarySessionId`).
