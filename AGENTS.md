# AGENTS.md — Vela (Rust + Tauri 2 desktop terminal/worktree manager)

## Identity & docs — read first

- The real product is **Vela** (`package.json` `name: vela`, Rust crate `vela` / lib `vela_lib`, `productName: Vela`, exe `Vela.exe`). `PRD.md` still uses an older codename for this product, and the UI consumes the legacy `orca` color alias in `tailwind.config.js` — do **not** rename existing identifiers to match the PRD.
- `PRD.md` and `PRD_Remote_Agent_Companion.md` are **aspirational specs, not implemented features**. Much of `PRD.md` does not exist in code: no `git2` (git is shelled out), no global-shortcut plugin, no tray usage, no notification usage, no agent status parsing, no zero-copy Channel IPC. The Remote Companion PRD (Android + Rust relay) has **no code at all** here.
- When a PRD and the code disagree, the code wins. Verify before assuming a feature exists.

## Commands

- Dev (Tauri window + HMR): `npm run tauri dev` (Vite on strict port `1420`).
- Frontend build + typecheck: `npm run build` (`tsc && vite build`); standalone `npm run typecheck`; regression tests: `npm test` (Vitest + jsdom).
- Rust check: `cargo check` / `cargo build` from `src-tauri/`.
- Release binary: `npx @tauri-apps/cli build --no-bundle`. `tauri.conf.json` has `bundle.active: false`, so `npm run tauri build` will **not** produce an installer; `--no-bundle` is intentional.
- Plain `npm run dev` runs the UI in a browser without Tauri; every `tauriIpc` method short-circuits via `isTauri()` and returns mocks. Useful for UI work, but it won't exercise real PTY/git.

Rust regression/integration tests: `cargo test --locked --lib` from `src-tauri/`. They exercise temporary Git repos and real ConPTY on Windows, with a mocked Tauri runtime. `build.rs` embeds a Common Controls v6 manifest for the test harness too. Windows checks live in `.github/workflows/check.yml`. There is no eslint/prettier/rustfmt/clippy config. Only claim checks actually run, and do not equate passing tests with verified RAM/FPS or zero bugs.

## Definition of done — always build the release `.exe`

- **Every task that changes code must end with a release build**: run `npx @tauri-apps/cli build --no-bundle` from the repo root as the final step, after `tsc`/`vite build` and `cargo check` are clean.
- The output is `src-tauri/target/release/vela.exe`. Confirm the build succeeded and the exe's timestamp was updated before reporting the task done.
- If the build fails, fix it (or report the exact error output) — don't hand back a task with a broken release build. If `vela.exe` is locked because the app is running, say so and ask the user to close it rather than killing the process.
- Docs-only changes (e.g. `*.md`) don't need a rebuild.

## Layout

- `src-tauri/src/lib.rs` — **all** `#[tauri::command]` definitions + `generate_handler!` registration + `run()`.
- `src-tauri/src/main.rs` — thin; `#![windows_subsystem = "windows"]` suppresses the console.
- `src-tauri/src/models.rs` — all shared serde types (single source of truth for the wire format).
- `src-tauri/src/pty/manager.rs` — ConPTY sessions (portable-pty) + background reader threads.
- `src-tauri/src/git/worktree.rs` — worktree list/add/remove/diff/commit via the **`git` CLI**.
- `src-tauri/src/agent/supervisor.rs` — shell profiles + agent detection (PATH scan only).
- `src-tauri/src/process.rs` — hidden, bounded child commands with execution deadlines; `diagnostics.rs` — bounded local error logs.
- Frontend: `src/App.tsx` → `src/components/*` (layout, tabs, terminal, sidebar, diff, modals, splash); state in `src/stores/*` (Zustand); IPC wrappers in `src/lib/tauriIpc.ts`; mirrored types in `src/types/index.ts`.

## Strict Rust + Tauri 2 rules

1. **Adding an IPC command is a 3-file change**: define `#[tauri::command] fn` in `lib.rs`, add it to `generate_handler!`, then add a typed wrapper in `src/lib/tauriIpc.ts` (and a type in `src/types/index.ts` if it crosses the boundary). Skipping the wrapper leaves the command unreachable from the UI.
2. **Command errors are `Result<T, String>`** everywhere. Follow that; don't introduce a custom error enum or `thiserror` without a deliberate decision.
3. **Tauri 2 auto-converts camelCase JS args to snake_case Rust params.** `tauriIpc.ts` sends `worktreeId`/`isAgent`/`baseBranch`; the Rust fn params are `worktree_id`/`is_agent`/`base_branch`. Keep that mapping in mind when renaming either side.
4. **Keep `models.rs` and `src/types/index.ts` byte-aligned.** Enum serde attributes are load-bearing: `AgentType` uses `#[serde(rename_all = "snake_case")]` (so `OpenCode` ⇄ `'open_code'`), and `AgentStatus` uses `#[serde(tag = "status", content = "data", rename_all = "snake_case")]` — the TS union mirrors that exact shape. Changing one side without the other silently breaks parsing.
5. **PTY output is streamed as Tauri events, not Channels.** The reader emits `pty-output-<session_id>` with `Vec<u8>`. xterm's write callback invokes `acknowledge_terminal_output` to return credits to the 64 KiB output window. Never acknowledge before rendering or remove backpressure. `pty-exit-<session_id>` carries a nullable exit code; `pty-error-<session_id>` carries a message. The PRD's "zero-copy Channel" is not implemented.
6. **Windows-only assumptions are deliberate.** Preserve `CREATE_NO_WINDOW` (`0x08000000`) on every spawned child (`git`, `taskkill`, PowerShell, agent `--version`) so no console window flashes. Process-tree kill uses `taskkill /F /T /PID`. Non-Windows paths are stubs (`select_directory` returns `None`).
7. **Session state lives in a managed `Arc<Mutex<HashMap<...>>>`** (`PtyManager`, `.manage()` in `run()`). Frontend generates the session `id` (`term-<ts>-<rand>`) and passes it in; the backend keys on it.
8. **Long-running work goes on a dedicated `std::thread`**, not the Tauri command thread. Follow the existing spawn-reader pattern; don't block a command on PTY I/O.
9. **New plugins/window APIs may need `src-tauri/capabilities/default.json` entries.** The capability targets window `"main"` (the default label from `tauri.conf.json`). A new window needs its label added there.
10. Edition is 2021; `crate-type` includes `cdylib`/`staticlib` for mobile targets, but this app targets Windows desktop. Don't remove those crate types.
11. `src-tauri/gen/` is generated and gitignored — never edit it.
12. Preserve the separate PTY input, output, and process monitor workers. On Windows, shell exit alone does not close ConPTY output; the monitor closes the pseudoconsole while the reader drains it. Never hold the session registry across PTY I/O or process creation.
13. Agent profiles must retain safe permission defaults. Never add automatic `--dangerously-skip-permissions`. Resolve arguments from the requested profile, not an unrelated default shell.
14. Git writes are not auto-retried. Keep request identity guards in stores, pin the diff target while committing, and distinguish successful writes followed by refresh failure from failed writes.

## Windows gotchas

- Shell/profile resolution scans `PATH` + `PATHEXT` in-process (`AgentSupervisor::check_binary_exists`) rather than spawning `where.exe`. Reuse that helper instead of shelling out for existence checks.
- Git Bash is only detected at the two hard-coded `C:\Program Files\...\Git\bin\bash.exe` paths.
- Paths are normalized to forward slashes (`replace('\\', "/")`) before crossing the IPC boundary; keep that convention.
- `select_directory` first tries the dialog plugin, then falls back to a PowerShell `FolderBrowserDialog`.

## UI conventions

- Tailwind v4 uses the official Vite plugin. `src/index.css` imports Tailwind and loads `tailwind.config.js` with `@config`, preserving the `orca-*` / `vela-*` palettes (e.g. `bg-orca-darkest`, `text-orca-muted`, `border-orca-border`). `index.css` also sets base borders/scrollbars. Do not reintroduce the old Tailwind v3 PostCSS plugin.
- **Universal zero-shadow flat UI**: 1px borders, no `box-shadow`/elevation blur. Dark-only (`darkMode: "class"`, `class="dark"` on `<html>`). Match surrounding components when adding UI.
- Terminal rendering uses `@xterm/xterm` with the WebGL addon and a try/catch canvas/DOM fallback (`XTermView.tsx`); scrollback is capped at 5000 to bound WebView2 memory. Keep both.
- `App.tsx` starts immediately without the decorative splash; panel starts clean with no active terminals or worktree history. OSC 7 directory metadata updates supported Windows shell session directories; WSL/custom prompt limitations are documented in README.md. Split pane position is independent of focused `activeSessionId` (`primarySessionId` and `secondarySessionId`).
