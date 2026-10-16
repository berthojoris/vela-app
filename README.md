# Vela 🌌

> **"Engineered with pulsar-class speed. The ultra-lightweight Agent Development Environment."**  
> *Inspired by the Vela Pulsar—one of the fastest rotating neutron stars in the galaxy, spinning over 11 times per second—Vela delivers hyper-responsive terminal multiplexing, native Windows ConPTY streaming, and isolated Git Worktrees for parallel AI coding agents with a near-zero memory footprint.*

---

## ⚡ Overview & Vision

**Vela** is an ultra-lightweight, high-performance desktop environment built with **Rust + Tauri 2.x + React 19 + TypeScript + Tailwind CSS**. It eliminates the massive memory overhead of Electron-based IDEs, allowing software engineers to orchestrate multiple AI coding agents (**Claude Code**, **Gemini CLI**, **Aider**, **Codex**, etc.) simultaneously across **isolated Git Worktrees**.

### Key Performance Benchmarks vs Electron
* **Idle Memory**: `< 65 MB` RAM (vs ~600MB–1.5GB in Electron)
* **Active Memory (5 tabs/agents)**: `< 140 MB` RAM
* **Cold Start**: `< 350 ms`
* **Zero Bloat**: Native Windows ConPTY (`portable-pty`) and native Windows WebView2 runtime.

---

## ✨ Features

1. **Pulsar-Fast Tab & Directory Navigation**
   * Instant `+` tab button and **`Ctrl + T`** shortcut with a sleek **"Open in Directory"** modal.
   * Preset 1-click jump to **Active Worktree**, **Repo Root**, or **Recent Folders**.
   * Native Windows folder picker integration ("Browse...").
   * **`Ctrl + W`** to close active tab.
   * Double-click on any tab header to rename.
   * Layout splits: Single Pane, **Vertical Split** (`Columns2`), and **Horizontal Split** (`Rows2`).
   * Quick shell profiles: PowerShell 7, Windows PowerShell, CMD, Git Bash, WSL.

2. **Git Worktree-First Isolation**
   * Run multiple coding agents simultaneously on different branches without file conflicts or dirty working tree collisions.
   * One-click worktree creation with automated task branching.
   * Option to automatically launch an AI agent (e.g. `claude`) inside the new worktree immediately upon creation.
   * Real-time modified/dirty file counter per worktree.

3. **Visual Diff & Review Engine**
   * Inspect file changes with unified syntax-highlighted diffs (`+` additions in emerald, `-` deletions in rose).
   * Direct commit input to commit changes to the worktree branch without leaving the app.

4. **ConPTY Native Streaming**
   * Windows Pseudo Console (`CreatePseudoConsole`) managed by Rust background worker threads.
   * Streaming raw terminal bytes directly to `@xterm/xterm` with **GPU WebGL acceleration (60 FPS)**.

5. **Modern Flat UI Design**
   * Universal Zero-Shadow policy with 1px crisp borders.
   * Frameless custom titlebar with seamless Windows drag region, window controls, and dynamic Maximize/Restore Down icon.
   * High-contrast cosmic dark theme (`#09090b` / `#141418`).

---

## 🚀 Getting Started

### Prerequisites
* Windows 10 or Windows 11 (64-bit)
* [Rust](https://rustup.rs/) (1.80+)
* [Node.js](https://nodejs.org/) (v18+)

### Running in Development Mode
```powershell
npm run tauri dev
```

### Building Standalone Release Executable
```powershell
npx @tauri-apps/cli build --no-bundle
```
The compiled binary will be located at:
`src-tauri/target/release/Vela.exe` (or `vela.exe`)

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + T` | Open New Terminal in Directory Modal |
| `Enter` in Modal | Launch Terminal immediately in target folder |
| `Ctrl + W` | Close active terminal tab |
| `Double Click Tab` | Rename tab title inline |
| `Double Click Titlebar` | Toggle Maximize / Restore Down |

---

## 📄 License
MIT License.
