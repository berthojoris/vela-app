# Product Requirement Document (PRD)

> Aspirational specification. For implemented behaviour, safety limits, and verification commands, see `README.md`. Historical performance figures below are targets, not measured release benchmarks.
## Project: Orca-RS (Agent Development Environment & Worktree Terminal Manager)

---

| **Document Version** | 1.0.0 |
| :--- | :--- |
| **Status** | Approved / Ready for Architecture & Implementation |
| **Target Platform** | Windows 10 / Windows 11 (x64) |
| **Primary Stack** | Rust (1.80+) + Tauri 2.x + React 19 / TypeScript + Vite + Tailwind CSS |
| **Architecture** | Git Worktree-First, ConPTY Native Streaming, Zero-Shadow Modern Flat UI |

---

## 1. Executive Summary & Vision

### 1.1 Product Vision
**Orca-RS** adalah *Agent Development Environment* (ADE) dan *Worktree Terminal Manager* ultra-ringan berperforma tinggi untuk sistem operasi Windows. Orca-RS memungkinkan developer menjalankan berbagai AI coding agent CLI (seperti **Claude Code**, **Gemini CLI**, **Codex**, **Aider**, **Cursor CLI**, dan **OpenCode**) secara paralel di dalam cabang **Git Worktree terisolasi**, lengkap dengan terminal multiplexer multi-tab, visual diff reviewer, dan pemantau proses berbasis native Windows.

### 1.2 The "Why": Solusi Terhadap Kelemahan Electron (Orca Asli)
Orca asli ([onorca.dev](https://www.onorca.dev/)) berbasis **Electron + Node.js**, yang membawa overhead memori masif (sering kali memakan **800 MB hingga 2.5 GB RAM** saat membuka 5+ terminal tab dan agent).
Orca-RS dibangun dengan **Tauri 2.x + Rust Backend**, memanfaatkan:
1. **Windows WebView2 Runtime** yang sudah terinstal secara bawaan di Windows 10/11 (menghemat RAM dan ukuran binary).
2. **Native Rust ConPTY Process Engine** (`portable-pty` / Win32 `CreatePseudoConsole`) tanpa overhead runtime Node.js.
3. **Zero-Copy IPC Channels**: Menggunakan streaming channel biner dari Tauri 2 untuk output terminal tanpa bottleneck serialisasi JSON.

### 1.3 Target Metrik Kunci
* **Idle RAM Footprint**: `< 65 MB` (vs Electron `~600 MB+`).
* **Active RAM (5 Tab Terminal + PTY)**: `< 140 MB`.
* **Cold Start Time**: `< 350 ms`.
* **Installer Size**: `< 12 MB` (installer NSIS/MSI).
* **Terminal Frame Rate**: Konsisten `60 FPS` dengan WebGL/Canvas renderer.

---

## 2. Problem Statement & User Personas

### 2.1 Problem Statement
1. **Konflik File saat Multi-Agent**: Menjalankan lebih dari satu AI agent di satu direktori lokal menyebabkan tabrakan file (*race condition* dan *dirty working tree*).
2. **Keterbatasan Terminal Windows Bawaan**: Windows Terminal bagus untuk CLI umum, namun tidak memiliki konsep *workspace/worktree*, tidak ada *task status tracking* untuk AI agent, dan tidak memiliki visual diff inline untuk *review code*.
3. **Bloatware IDE**: Membuka banyak instance VS Code / Cursor untuk tiap branch sangat boros resource memori laptop/PC.

### 2.2 Target Personas
* **Agentic Software Engineers**: Developer yang mempekerjakan AI agents untuk mengerjakan issue, refactoring, dan fitur secara paralel.
* **Full-stack Developers**: Pengembang yang membutuhkan pembagian kerja rapi antar backend, frontend, dan automation script di worktree berbeda.
* **Power Terminal Users**: Pengguna yang menginginkan terminal multi-tab/split yang sangat responsif, minimalis, dan modern di Windows.

---

## 3. High-Level System Architecture

```
+-----------------------------------------------------------------------------------+
|                            ORCA-RS TAURI 2 FRONTEND                               |
|   (React 19 + TypeScript + Tailwind CSS + Lucide Icons + @xterm/xterm + WebGL)   |
|                                                                                   |
|  +------------------------+  +-------------------------------------------------+  |
|  |  Worktree & Agent Nav  |  |  Multi-Tab Bar & Split Grid Control (`+` Tab)  |  |
|  |  - Projects & Branches |  |  - Tab 1: Claude Code (Running - 4m)            |  |
|  |  - Worktree Manager    |  |  - Tab 2: Gemini CLI (Waiting Input)            |  |
|  |  - Agent Status Badges |  |  - Tab 3: PowerShell 7 (Interactive)            |  |
|  +------------------------+  +-------------------------------------------------+  |
|  |  Visual Diff Drawer    |  |  xterm.js Viewport (GPU Canvas / WebGL 60 FPS)  |  |
|  |  - Hunk Review/Stage   |  |  - Auto-fit, Resizing, Mouse Scroll, Selection |  |
|  +------------------------+  +-------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
                                        |
                 Tauri 2 IPC (Commands, Events & Zero-Copy Channels)
                                        |
+-----------------------------------------------------------------------------------+
|                             RUST NATIVE BACKEND CORE                              |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | 1. Terminal ConPTY Engine                                                   |  |
|  |    - `portable-pty` / Win32 ConPTY API (`CreatePseudoConsole`)              |  |
|  |    - Async PTY reader/writer stream via Tokio threadpool                    |  |
|  |    - Zero-copy binary chunk streaming ke frontend Channel                   |  |
|  +-----------------------------------------------------------------------------+  |
|  | 2. Git Worktree Supervisor                                                  |  |
|  |    - Git CLI / `git2` binding engine                                        |  |
|  |    - Atomic Worktree Add: `git worktree add ../<proj>-<branch> <branch>`    |  |
|  |    - Worktree Cleanup, Branch Prune, & Status Watcher                       |  |
|  +-----------------------------------------------------------------------------+  |
|  | 3. Agent Process Lifecycle Manager                                          |  |
|  |    - Process Monitor: PID, CPU %, RAM memory usage                          |  |
|  |    - Output Pattern Analyzer: Detects "waiting for input", "error", "done"  |  |
|  |    - Windows Toast Notification on agent task complete                     |  |
|  +-----------------------------------------------------------------------------+  |
|  | 4. Native Windows Integration                                               |  |
|  |    - Windows Mica/Acrylic backdrop & frameless custom titlebar              |  |
|  |    - System Tray integration with active agent counts                       |  |
|  |    - Global Hotkey (`Alt + Space` / `Ctrl + Shift + T`)                     |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 4. Core Feature Specifications (Functional Requirements)

### 4.1 Modul 1: Simple UI & Terminal Tab Manager (Primary UX)

#### FR-1.1: Super Simple Tab Creation & Management
* **Instant New Tab Button**: Tombol `+` persisten di samping tab bar atas.
* **Shortcut Cepat**:
  * `Ctrl + T`: Membuka tab terminal baru seketika (default shell: PowerShell atau custom profile).
  * `Ctrl + W`: Menutup tab aktif (dengan dialog konfirmasi jika masih ada proses agent berjalan).
  * `Ctrl + Tab` / `Ctrl + Shift + Tab`: Navigasi siklis antar tab.
  * `Ctrl + 1` s/d `Ctrl + 9`: Langsung lompat ke tab nomor urut terkait.
* **Inline Tab Customization**:
  * Double click pada judul tab untuk rename instan.
  * Right-click Context Menu: *Split Right*, *Split Down*, *Duplicate Tab*, *Change Shell*, *Change Working Directory*, *Close Others*.

#### FR-1.2: Shell Profiles & Presets
* Pengguna dapat memilih default shell atau quick switch profil:
  * **PowerShell 7** (`pwsh.exe`)
  * **Windows PowerShell** (`powershell.exe`)
  * **Command Prompt** (`cmd.exe`)
  * **Git Bash** (`bash.exe`)
  * **WSL 2** (`wsl.exe -d <Distro>`)
  * **Custom AI Agent Preset**: Shortcut tombol untuk meluncurkan `claude`, `gemini`, `aider`, dsb. dengan environment variable yang telah dikonfigurasi.

#### FR-1.3: Split-Screen Multiplexer (Infinite Grid)
* Split horizontal (`Ctrl + Shift + E`) dan split vertikal (`Ctrl + Shift + O`).
* Mengubah ukuran split pane secara fluid via drag splitter bar.
* Active border focus: Border terminal yang sedang aktif ditandai garis aksen halus (*1px highlight*).

---

### 4.2 Modul 2: Git Worktree Engine (Orca-Style Isolation)

#### FR-2.1: Worktree Lifecycle Management
* **One-Click Worktree Creation**:
  * Modal dialog sederhana: Input *Branch Name* atau *Task Description*.
  * Rust mengeksekusi: `git worktree add <path> -b <branch-name> <base-branch>`.
  * Direktori worktree diletakkan secara teratur, misal di `.worktrees/<branch-name>` atau folder paralel `../<project>-<branch-name>`.
* **Worktree List View**:
  * Panel kiri menampilkan daftar seluruh worktree aktif di proyek tersebut.
  * Setiap kartu worktree menampilkan:
    * Nama branch & commit hash terakhir.
    * Status jumlah file termodifikasi (`+3 ~2 -0`).
    * Agen yang sedang berjalan di dalam worktree tersebut.
    * Tombol aksi cepat: *Open Terminal in Worktree*, *Review Diffs*, *Merge to Main*, *Remove Worktree*.
* **Safe Teardown & Removal**:
  * Menghapus worktree dengan aman: `git worktree remove <path>`.
  * Proteksi peringatan jika ada *uncommitted changes* sebelum dihapus.

---

### 4.3 Modul 3: Agent Orchestrator & Monitoring

#### FR-3.1: Deteksi dan Peluncuran Agen Otomatis
* Orca-RS mendeteksi binary agen yang ada di Windows PATH:
  * `claude` (Anthropic Claude Code CLI)
  * `gemini` / `gemini-cli` (Google Gemini CLI)
  * `aider` (Aider AI pair programmer)
  * `codex` / `opencode` / `cursor`
* Opsi *Launch Agent in new Worktree*:
  * Cukup ketik nama task, Orca-RS otomatis membuat branch baru, membuat worktree, membuka tab terminal baru, dan langsung memicu command agen di direktori tersebut.

#### FR-3.2: Status Tracker & State Parsing
* Rust backend menganalisis stream output terminal secara non-blocking (*zero overhead regex / state machine*):
  * **Thinking / Working**: Agen sedang menghasilkan kode atau menjalankan tes (animasi loading spinner warna kuning/biru).
  * **Waiting for User**: Agen membutuhkan konfirmasi atau prompt baru (badge hijau/oranye + notifikasi).
  * **Completed**: Agen selesai mengeksekusi prompt (badge hijau solid).
  * **Error / Exit Failure**: Child process keluar dengan exit code != 0 (badge merah).
* **Windows Toast Notification**: Ketika agen selesai atau membutuhkan input saat jendela Orca-RS sedang diminimize/background, Windows Toast Notification native akan muncul.

---

### 4.4 Modul 4: Built-in Visual Diff Viewer & Git Review

#### FR-4.1: Fast Git Diff Inspector
* Tab atau sidebar drawer khusus untuk meninjau perubahan kode pada worktree aktif.
* Parsing diff super cepat menggunakan library Rust `git2` atau streaming command `git diff --unified=3`.
* Tampilan visual:
  * **File Tree Changes**: List file yang ditambah (hijau), diubah (kuning), atau dihapus (merah).
  * **Side-by-Side & Unified Diff**: Perbandingan baris dengan syntax highlighting token yang bersih.
* **Aksi Review**:
  * Stage all / Unstage all.
  * Quick Commit box dengan input pesan commit.
  * Quick Merge ke target branch (misal `main` atau `develop`).

---

### 4.5 Modul 5: Windows Native Integration

* **Frameless Titlebar with Mica Backdrop**:
  * Tampilan modern Windows 11 dengan efek translucent Mica/Acrylic.
  * Tombol kontrol window native (Minimize, Maximize/Restore, Close) terintegrasi rapi di header.
  * Mendukung Windows 11 Snap Layouts saat mengarahkan kursor ke tombol maximize.
* **System Tray Bar**:
  * Icon tray yang menampilkan jumlah agen yang sedang aktif.
  * Menu klik kanan: *Open Orca-RS*, *Quick New Terminal*, *Pause All Agents*, *Quit*.
* **Global Hotkey**:
  * Toggle hide/show jendela dari mana saja menggunakan shortcut global (default: `Alt + ` ` atau `Ctrl + Shift + ` `).

---

## 5. UI/UX Design System (Modern, Clean, Simple, Flat UI)

### 5.1 Filosofi Visual (Universal Zero-Shadow Policy)
* **Flat & Crisp**: Tidak menggunakan drop shadow blur (*zero elevation box-shadow*). Kedalaman visual didapat dari **kontras background** dan **1px crisp borders** (`#262626` / `rgba(255, 255, 255, 0.08)`).
* **Color Palette (Dark First)**:
  * **Background Root**: `#0c0c0e` (Jet Black / Zinc 950).
  * **Surface / Card / Sidebar**: `#141417` (Dark Graphite).
  * **Active Tab / Hover Surface**: `#1c1c21`.
  * **Border Color**: `#27272a` (Zinc 800) / 1px solid.
  * **Primary Text**: `#fafafa` (Zinc 50, crisp anti-aliased).
  * **Secondary / Muted Text**: `#a1a1aa` (Zinc 400).
  * **Accent Color**: `#3b82f6` (Electric Blue) atau `#10b981` (Emerald Green untuk status aktif).
* **Tipografi**:
  * UI Text: `Inter`, `Geist Sans`, atau `Segoe UI Variable`.
  * Terminal Code: `JetBrains Mono`, `Cascadia Code`, atau `Fira Code`.

### 5.2 Layout Wireframe Konseptual

```
+---------------------------------------------------------------------------------------------------+
| [Orca-RS]  [Worktree: feature/auth-v2 v]  | [Tab 1: claude] [Tab 2: pwsh] [+]   | [_] [口] [X]   |
+---------------------------------------------------------------------------------------------------+
|  PROJECTS & WORKTREES (240px) | TERMINAL MULTIPLEXER WORKSPACE                                    |
|  [+ New Worktree]             |                                                                   |
|                               | +--------------------------------+------------------------------+ |
|  v my-saas-app (main)         | | [claude-code]                  | [pwsh - test runner]         | |
|    * main (idle)              | |                                |                              | |
|    * feat/auth-v2 (Running)   | | > Claude is updating           | > cargo test                 | |
|      - Agent: Claude Code     | |   src/auth/jwt.rs...           | running 14 tests...          | |
|      - Status: [● 2m 14s]     | |   Added validation check       | test test_jwt_valid ... ok   | |
|    * fix/payment-api (Done)   | |                                | test test_expired ... ok     | |
|      - Agent: Gemini CLI      | |                                |                              | |
|      - Status: [✔ Ready]      | |                                | 14 passed; 0 failed          | |
|                               | +--------------------------------+------------------------------+ |
|  ---------------------------- | STATUS BAR                                                        |
|  [Diff: 4 files changed]      | Worktree: feat/auth-v2 | Agents: 2 active | RAM: 84MB | Latency: 2ms  |
+---------------------------------------------------------------------------------------------------+
```

---

## 6. Technical Specifications & Dependencies

### 6.1 Rust Crates (Backend `src-tauri/Cargo.toml`)

```toml
[package]
name = "orca-rs"
version = "0.1.0"
edition = "2021"

[dependencies]
# Tauri 2 Framework
tauri = { version = "2.0", features = ["tray-icon", "notification"] }
tauri-plugin-shell = "2.0"
tauri-plugin-notification = "2.0"
tauri-plugin-global-shortcut = "2.0"
tauri-plugin-fs = "2.0"
tauri-plugin-dialog = "2.0"

# Async & Concurrency
tokio = { version = "1.38", features = ["full"] }
tokio-util = { version = "0.7", features = ["codec"] }
futures = "0.3"

# ConPTY & Terminal Emulation
portable-pty = "0.8" # Platform-agnostic ConPTY wrapper untuk Windows

# Git Integration
git2 = "0.19"        # Fast native libgit2 bindings

# Serialization & Utility
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
uuid = { version = "1.9", features = ["v4"] }
regex = "1.10"
sysinfo = "0.30"     # Monitoring memory & CPU per agent PID

# Windows Specific
[target.'cfg(windows)'.dependencies]
windows = { version = "0.58", features = [
    "Win32_System_Console",
    "Win32_UI_WindowsAndMessaging",
    "Win32_System_Threading"
] }
```

### 6.2 Frontend Dependencies (`package.json`)

```json
{
  "name": "orca-rs-ui",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-notification": "^2.0.0",
    "@tauri-apps/plugin-shell": "^2.0.0",
    "@xterm/xterm": "^5.5.0",
    "@xterm/addon-webgl": "^0.16.0",
    "@xterm/addon-canvas": "^0.5.0",
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/addon-web-links": "^0.11.0",
    "@xterm/addon-search": "^0.15.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0",
    "lucide-react": "^0.450.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.2",
    "vite": "^5.4.8"
  }
}
```

---

## 7. Data Models & IPC Protocols

### 7.1 Data Models (Rust & TypeScript)

#### 1. Terminal Session
```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TerminalSession {
    pub id: String,              // UUID v4
    pub title: String,           // Judul tab (misal: "Claude Code - Auth")
    pub shell: String,           // Path binary ("pwsh.exe", "claude")
    pub cwd: String,             // Current working directory (worktree path)
    pub worktree_id: Option<String>,
    pub cols: u16,
    pub rows: u16,
    pub pid: u32,
    pub is_agent: bool,
    pub agent_type: Option<AgentType>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum AgentType {
    ClaudeCode,
    GeminiCli,
    Aider,
    Codex,
    Custom(String),
}
```

#### 2. Agent Execution Status
```rust
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum AgentStatus {
    Idle,
    Running { started_at: u64, current_task: String },
    WaitingUserInput { prompt_preview: String },
    Completed { duration_secs: u64 },
    Failed { exit_code: i32, error_summary: String },
}
```

#### 3. Git Worktree Model
```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitWorktree {
    pub id: String,
    pub name: String,
    pub path: String,
    pub branch: String,
    pub is_main: bool,
    pub dirty_files_count: usize,
    pub active_agent_id: Option<String>,
}
```

### 7.2 Tauri 2 IPC Command Set

| Command Name | Input Payload | Output / Event | Deskripsi |
| :--- | :--- | :--- | :--- |
| `spawn_terminal` | `{ cwd, shell, cols, rows, worktree_id }` | `Result<TerminalSession, String>` | Menghasilkan ConPTY child process baru & bind PTY stream |
| `write_terminal` | `{ id: String, data: String }` | `Result<(), String>` | Menulis input keyboard / paste ke PTY stdin |
| `resize_terminal` | `{ id: String, cols: u16, rows: u16 }` | `Result<(), String>` | Menyesuaikan ukuran ConPTY saat ukuran jendela berubah |
| `kill_terminal` | `{ id: String }` | `Result<(), String>` | Menghentikan PTY dan child process tree secara aman |
| `create_worktree` | `{ repo_path, branch, new_branch }` | `Result<GitWorktree, String>` | Menjalankan git worktree creation |
| `list_worktrees` | `{ repo_path: String }` | `Result<Vec<GitWorktree>, String>`| Memindai daftar worktree lokal |
| `get_worktree_diff`| `{ worktree_path: String }` | `Result<Vec<FileDiff>, String>` | Mendapatkan rincian file diff |
| `remove_worktree` | `{ repo_path, worktree_path, force }` | `Result<(), String>` | Menghapus worktree dan membersihkan branch |

#### Zero-Copy Streaming IPC (Channel)
Untuk menjamin tidak ada lag pada output berkecepatan tinggi (misal `cargo build` atau stream teks LLM), output ConPTY ditransmisikan menggunakan **Tauri 2 Channel** (`tauri::ipc::Channel<Vec<u8>>`), bukan string JSON biasa. Frontend menerima raw binary chunk dan langsung mengumpankannya ke `@xterm/xterm` via `term.write(new Uint8Array(chunk))`.

---

## 8. Non-Functional Requirements & Performance Budgets

### 8.1 Performance & Memory Discipline
1. **Zero Garbage Collection Lag**: Rust mengelola buffer PTY dengan kapasitas tetap (*ring buffer*) untuk mencegah alokasi memori berulang (*anti-GC churn*).
2. **WebGL Fallback Strategy**:
   * Default terminal menggunakan `@xterm/addon-webgl` untuk akselerasi hardware kartu grafis.
   * Jika hardware acceleration tidak tersedia (misal di VM atau GPU terbatasi), secara otomatis fallback ke `@xterm/addon-canvas`.
3. **Scrollback Buffer Limitation**:
   * Default scrollback dibatasi ke `5,000` baris per tab (bisa diatur hingga `20,000`) untuk mencegah browser memory leak di WebView2.

### 8.2 Keamanan & Akses Sistem
* Seluruh eksekusi child process dikunci dalam boundary direktori proyek pengguna.
* Variabel environment sensitif (seperti `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`) dapat diinjeksi secara terenkripsi melalui Windows Credential Manager atau file konfigurasi lokal terisolasi (`~/.orca-rs/config.json`), tanpa bocor ke log atau telemetry.

---

## 9. Development Roadmap & Implementation Milestones

```
+-----------------------------------------------------------------------------------+
| PHASE 1: Core Foundation & ConPTY Engine (Sprint 1)                               |
| - Setup Tauri 2 project dengan React 19 + TypeScript + Tailwind CSS               |
| - Implementasi Rust backend ConPTY dengan `portable-pty`                          |
| - Integrasi xterm.js di frontend dengan WebGL Addon                               |
| - Verifikasi streaming dua arah (keyboard input & terminal output) 60 FPS         |
+-----------------------------------------------------------------------------------+
                                        |
+-----------------------------------------------------------------------------------+
| PHASE 2: Simple UI & Multi-Tab Terminal Multiplexer (Sprint 2)                    |
| - Tab Bar UI dengan tombol instant `+`, shortcut `Ctrl+T`, `Ctrl+W`              |
| - Split Screen Engine (Horizontal & Vertical splits)                              |
| - Profil Shell selector (PowerShell 7, CMD, Git Bash, WSL)                        |
| - Frameless custom titlebar Windows dengan Mica backdrop                          |
+-----------------------------------------------------------------------------------+
                                        |
+-----------------------------------------------------------------------------------+
| PHASE 3: Git Worktree Engine & Project Navigator (Sprint 3)                       |
| - Integrasi libgit2 / Git CLI untuk list, add, dan remove worktree                |
| - Sidebar project view & worktree card display                                    |
| - Fitur "Open Terminal in Worktree" otomatis set CWD                              |
+-----------------------------------------------------------------------------------+
                                        |
+-----------------------------------------------------------------------------------+
| PHASE 4: Agent Orchestrator & Live Status Monitoring (Sprint 4)                   |
| - Launcher preset untuk Claude Code, Gemini CLI, Aider                            |
| - Non-blocking stream pattern parsing (deteksi Idle / Running / Waiting)          |
| - Windows Toast Notification & System Tray icon integration                       |
+-----------------------------------------------------------------------------------+
                                        |
+-----------------------------------------------------------------------------------+
| PHASE 5: Visual Diff Reviewer & Polish (Sprint 5)                                 |
| - Built-in Visual Diff Viewer (Side-by-side & unified)                            |
| - Quick Stage, Commit, dan Merge UI                                               |
| - Memory benchmark test (< 65MB idle, < 140MB active)                             |
| - Build release binary & NSIS lightweight installer (< 12MB)                      |
+-----------------------------------------------------------------------------------+
```

---

## 10. Success Metrics & Verification Criteria

1. **Memory Benchmark**:
   * Buka 5 tab terminal bersamaan (2 Claude Code agent, 1 PowerShell, 1 Git Bash, 1 idle).
   * Total konsumsi RAM proses (`orca-rs.exe` + `msedgewebview2.exe`) harus berada di bawah **150 MB**.
2. **Terminal Responsiveness**:
   * Jalankan output banjir teks (misal `git log --stat` atau compile besar).
   * UI tetap responsif tanpa freeze atau penurunan frame rate di bawah 55 FPS.
3. **Tab & ConPTY Reliability**:
   * Menutup tab harus membunuh child process tree terkait di Windows tanpa menyisakan proses zombie di Windows Task Manager.
4. **Worktree Isolation**:
   * Menjalankan 2 agen di 2 worktree berbeda untuk mengedit file dengan nama yang sama tidak boleh saling tumpang tindih sebelum di-*merge*.
