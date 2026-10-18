# Product Requirements Document (PRD)

# Remote Agent Companion — Android ↔ Rust/Tauri 2 Desktop (with Laravel Reverb Relay)

| Field | Value |
|---|---|
| Document version | 2.0 (Updated with Laravel Reverb Backend Architecture) |
| Status | Approved Architecture & Implementation Blueprint |
| Date | 2026-10-18 |
| Target platforms | Windows desktop (Rust + Tauri 2), Android (Kotlin + Jetpack Compose), Cloud Relay & Backend (Laravel 11/12 + Laravel Reverb) |
| Feature | Keep AI coding agents moving from anywhere |
| Product approach | Local-first agent execution; zero-knowledge secure remote control via Laravel Reverb |

> **Purpose:** Memberikan kemampuan kepada developer untuk memantau dan mengontrol AI coding agents (Claude Code, Gemini CLI, Aider, Codex, OpenCode) yang berjalan di PC Windows (Vela Desktop) melalui smartphone Android secara aman melalui internet dari jaringan mana pun (termasuk seluler di balik CGNAT). PC tetap menjadi satu-satunya eksekutor agent; backend terpisah berbasis **Laravel + Laravel Reverb** bertindak sebagai relay data terenkripsi (Zero-Knowledge) dan penyedia layanan presence, autentikasi device, serta notifikasi push FCM.

---

## 1. Executive Summary & Vision

### 1.1 Product Vision
**Continue agent workflows from anywhere, without remotely exposing the entire computer.**
Developer sering kali harus meninggalkan meja kerja saat AI agent sedang menjalankan task panjang (refactoring, run tests, coding). Ketika agent membutuhkan persetujuan (*approval*) atau prompt tindak lanjut, proses akan terhenti (*stalled*). Remote Agent Companion menyelesaikan masalah ini dengan menghubungkan aplikasi mobile Android ke PC lokal melalui Cloud Relay terpisah berbasis Laravel Reverb, dengan enkripsi end-to-end (E2EE) penuh.

### 1.2 Core Architecture Decisions
1. **Pemisahan 3 Komponen Sistem (Tri-Partite System):**
   - **Host (Vela Desktop - Rust + Tauri 2):** Eksekusi lokal AI agent, ConPTY multiplexer, local SQLite event sequence, E2EE encryption endpoint, Windows DPAPI.
   - **Cloud Relay & Companion API (Laravel 11/12 + Laravel Reverb - Proyek Terpisah):** Pusher-compatible WebSocket server (Reverb) untuk presence & routing pesan instan, REST API untuk pairing device, dan dispatcher Firebase Cloud Messaging (FCM).
   - **Client (Android Companion - Kotlin + Jetpack Compose - Proyek Terpisah):** UI mobile modern (zero-shadow flat UI), hardware-backed Android Keystore, Pusher client, pemindai QR CameraX, dan terminal/prompt viewer.
2. **Zero-Knowledge Cloud Relay:**
   - Laravel Reverb hanya meneruskan ciphertext Base64 via Pusher Private & Presence Channels.
   - Server relay, database Laravel, maupun admin VPS **tidak pernah bisa membaca** prompt, source code, diff git, atau output terminal.
3. **Outbound Connections Only (Bypass NAT/Firewall):**
   - Baik PC Desktop maupun Android hanya melakukan koneksi keluar (*outbound WSS*) ke port 443 VPS Laravel Reverb. Tidak memerlukan port forwarding, UPnP, atau IP publik statis di PC.
4. **Presence Tracking Otomatis via Reverb Presence Channels:**
   - Deteksi PC online/offline ditangani secara native oleh protokol Reverb/Pusher (`pusher:member_added` dan `pusher:member_removed`), mengeliminasi kebutuhan membangun custom heartbeat broker di Rust.

---

## 2. Arsitektur Sistem 3-Pilar (Tri-Partite Architecture)

```text
┌─────────────────────────────────────────────────────────────┐
│                 ANDROID COMPANION APP                       │
│  (Kotlin, Jetpack Compose, Pusher Java SDK, Android Keystore)│
│  - QR Scanner (CameraX + ML Kit)                            │
│  - Hardware-Backed Keys (Ed25519/X25519)                    │
│  - Live Terminal Stream Viewer                              │
│  - Prompt Composer & Approval Action Drawer                 │
│  - Firebase Messaging Client (Background Wakeup)            │
└──────────────────────────────┬──────────────────────────────┘
                               │ Outbound WSS :443 (Pusher Protocol)
                               │ & REST API (HTTPS :443)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│        LARAVEL 11/12 + REVERB BACKEND (PROYEK TERPISAH)     │
│  (PHP 8.3+, Laravel Reverb Daemon, MySQL/PostgreSQL, Redis) │
│                                                             │
│  ├─ Laravel Reverb WebSocket Server (:8080 proxied via Nginx)│
│  │   ├─ Presence Channels: `presence-host-{hostId}`          │
│  │   │   └─ Natively tracks PC Online/Offline state         │
│  │   ├─ Private Channels: `private-session-{sessionId}`      │
│  │   │   └─ Relays E2EE Ciphertext via Client Events        │
│  │   └─ Tuning: max_request_size = 64KB - 128KB, whispering │
│  ├─ REST API & Auth (Sanctum / Token Auth)                  │
│  │   ├─ Device Pairing Coordination & QR Verification       │
│  │   ├─ Pusher Channel Authorization (`/broadcasting/auth`) │
│  │   └─ Device Revocation & Permissions API                 │
│  └─ Push Notification Dispatcher (FCM via Laravel Queue)    │
│      └─ Sends silent wakeups & approval alerts to Android   │
└──────────────────────────────▲──────────────────────────────┘
                               │ Outbound WSS :443 (Pusher Protocol)
                               │ & REST API (HTTPS :443)
┌──────────────────────────────┴──────────────────────────────┐
│             PC HOST: VELA DESKTOP (RUST + TAURI 2)          │
│  (Windows 10/11 x64, ConPTY, Tokio Async Runtime)           │
│                                                             │
│  ├─ WebSocket Client (`tokio-tungstenite`) to Laravel Reverb│
│  ├─ E2EE Engine (Noise Protocol / X25519 + ChaCha20-Poly1305)│
│  ├─ Windows DPAPI (Secure Host Private Key Storage)         │
│  ├─ ConPTY Output Fan-Out & Multiplexer (Local UI + Remote) │
│  ├─ Local SQLite Event Store (Event Sequence & Replay Cache)│
│  ├─ Agent Supervisor & Session Adapter                      │
│  │   ├─ Phase 1: Raw Terminal & Prompt Injection            │
│  │   └─ Phase 2: Structured Tool Call Parsing & Approvals   │
│  └─ Tauri 2 Frontend (QR Code Pairing Modal & Settings UI)  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Spesifikasi Rinci Apa Saja yang Dibangun (What We Will Build)

### 3.1 Komponen A: PC Host — Vela Desktop (Rust + Tauri 2)

Terletak di repository ini (`src-tauri/` dan `src/`).

1. **Database Lokal SQLite (`remote_storage.rs`):**
   - Menambahkan dependency `rusqlite` / `sqlx`.
   - Tabel `paired_devices`: menyimpan `device_id`, `public_key`, `name`, `scopes` (read, execute, approve, terminal), `status` (active/revoked), `paired_at`.
   - Tabel `session_events`: menyimpan `session_id`, `sequence` (integer bertambah), `event_type`, `payload_encrypted`, `created_at`.
   - Tabel `rpc_idempotency`: menyimpan `idempotency_key`, `device_id`, `response_hash`, `expiry` untuk mencegah duplikasi eksekusi prompt saat reconnect.
2. **Kriptografi & Key Storage Windows DPAPI (`remote_crypto.rs`):**
   - Integrasi `windows-sys` / Win32 DPAPI (`CryptProtectData` & `CryptUnprotectData`) untuk mengenkripsi private key host di `%APPDATA%/Vela/host_identity.bin`.
   - Key Exchange: X25519 ECDH + HKDF-SHA256 untuk derivasi session key simetris (ChaCha20-Poly1305 / AES-256-GCM).
3. **Pusher/Reverb Client Worker (`reverb_client.rs`):**
   - Koneksi WebSocket outbound menggunakan `tokio-tungstenite` ke endpoint Reverb.
   - Mengimplementasikan handshake Pusher protocol v7:
     - Subscribe ke `presence-host-{hostId}` dengan signature autentikasi dari endpoint Laravel.
     - Listen ke channel `client-*` untuk menerima RPC dari Android.
     - Mengirim event `client-event` untuk streaming output terminal dan status agent.
   - Loop auto-reconnect dengan exponential backoff dan jitter.
4. **PTY Output Fan-Out Multiplexer (`src-tauri/src/pty/manager.rs`):**
   - Memperluas output reader thread ConPTY:
     - Aliran byte tidak hanya di-emit ke event lokal Tauri `pty-output-<id>`, tetapi juga dipecah ke sequence event SQLite lokal dan dienkripsi ke channel Reverb.
     - Mengelola buffer chunk (misal 4 KiB - 16 KiB per frame) agar tidak melebihi batas Reverb payload.
5. **Agent Remote Dispatcher (`agent_remote_dispatcher.rs`):**
   - Memvalidasi signature & token otorisasi RPC dari HP.
   - Pengecekan scope izin device (`read`, `execute`, `approve`, `terminal`).
   - Eksekusi prompt ke session ConPTY target.
6. **Frontend UI Pairing & Settings (`src/components/settings/MobileAccessModal.tsx`):**
   - Menu pengaturan "Mobile Companion" di Vela.
   - Toggle Enable/Disable Remote Access.
   - Generator QR Code (menggunakan library `qrcode.react`): memuat URL Reverb, `host_id`, one-time invite token, dan fingerprint publik key host.
   - Dialog konfirmasi saat HP melakukan pairing: mencocokkan SAS (*Short Authentication String* 6 digit).
   - Daftar device yang terhubung dengan tombol "Revoke".

---

### 3.2 Komponen B: Cloud Relay & Companion Backend (Laravel 11/12 + Reverb)

Proyek terpisah (Repository baru, misal: `vela-backend` atau `vela-relay`).

1. **Setup Laravel Reverb Server:**
   - Instalasi Laravel 11/12 + Laravel Reverb (`php artisan install:broadcasting`).
   - Konfigurasi `config/reverb.php`:
     ```php
     'options' => [
         'max_request_size' => 131072, // 128 KiB untuk PTY buffer
     ],
     'resources' => [
         'channels' => [
             'enable_client_messages' => true, // Mengaktifkan whispering client-to-client
         ],
     ],
     ```
   - Nginx reverse proxy dengan TLS/SSL (Let's Encrypt) mengarah ke port Reverb (default 8080).
2. **Database Skema & Model (MySQL / PostgreSQL):**
   - `users`: ID user pemilik akun/relay (opsional jika single-tenant, wajib jika multi-device).
   - `hosts`: `id` (UUID), `user_id`, `name`, `fingerprint`, `public_key`, `last_seen_at`.
   - `devices`: `id` (UUID), `host_id`, `device_name`, `device_fingerprint`, `public_key`, `fcm_token`, `permissions` (JSON), `is_revoked`.
   - `pairing_sessions`: `invite_token` (hash), `host_id`, `short_code` (6 digit), `expires_at` (TTL 2 menit), `is_consumed`.
3. **REST API Endpoints:**
   - `POST /api/v1/host/register`: Registrasi identitas host baru.
   - `POST /api/v1/pairing/create`: Host membuat token pairing untuk QR code.
   - `POST /api/v1/pairing/claim`: Android men-scan QR dan mengirim identitas publiknya.
   - `POST /api/v1/pairing/confirm`: Host menyetujui pairing setelah mencocokkan kode 6-digit.
   - `POST /api/v1/device/fcm-token`: Update FCM token Android untuk push notification.
   - `POST /api/v1/broadcasting/auth`: Autentikasi channel privat & presence Pusher untuk Host dan Android.
4. **Push Notification Service (FCM):**
   - Paket `laravel-notification-channels/fcm`.
   - Job queue background: Ketika host mentrigger webhook/event bahwa "Agent membutuhkan input" atau "Agent selesai menjalankan task", Laravel mengirim push notification ke Android dengan payload minimalis (tanpa mengekspos isi kode di payload FCM).

---

### 3.3 Komponen C: Android Companion App (Kotlin + Jetpack Compose)

Proyek terpisah (Repository baru, misal: `vela-android`).

1. **UI/UX (Universal Zero-Shadow Flat UI):**
   - Sesuai standar desain: 1px border tajam, kontras tinggi, dark mode native, zero-shadow.
   - **Screen 1: Hosts Dashboard:** Menampilkan PC yang terhubung, status Online/Offline (real-time via Reverb Presence Channel), jumlah sesi aktif.
   - **Screen 2: QR Scanner:** Integrasi CameraX + ML Kit untuk scan pairing QR dari layar monitor.
   - **Screen 3: Session Detail & Terminal Streamer:**
     - Tampilan output terminal live dengan custom virtualized text viewer (ANSI color parsing).
     - Tombol autoscroll lock / resume scroll.
   - **Screen 4: Prompt Composer & Action Drawer:**
     - Input field untuk mengirim follow-up prompt ke agent.
     - Quick Action cards: "Approve", "Reject", "Interrupt (Ctrl+C)".
   - **Screen 5: Device Security & Paired PC Settings:** Daftar izin granted, opsi Unpair.
2. **Konektivitas Jaringan & Protokol Pusher:**
   - Library `com.pusher:pusher-websocket-java`.
   - Reconnect handler otomatis saat transisi Wi-Fi ↔ Seluler.
   - Intersepsi event `client-terminal-stream` dan request RPC `client-rpc-request`.
3. **Kriptografi & Android Keystore:**
   - Private key dihasilkan di dalam Android Hardware-backed Keystore (StrongBox / TEE jika tersedia).
   - Melakukan dekripsi payload ChaCha20-Poly1305 sebelum dirender ke layar Compose.
4. **Firebase Cloud Messaging Service (`VelaFirebaseMessagingService`):**
   - Menerima silent/high-priority push notification.
   - Menampilkan notifikasi lokal: "Claude Code is waiting for your approval in worktree: feature/auth".
   - Deep-link langsung membuka layar session bersangkutan setelah autentikasi biometrik/PIN.

---

## 4. Protokol Komunikasi & Framing Data (Pusher Protocol + E2EE)

Komunikasi antara Android dan Desktop ditransmisikan menggunakan protokol Pusher yang berjalan di atas Laravel Reverb, dengan enkripsi lapis ganda.

### 4.1 Channel Naming Architecture
- **Presence Channel (Host Presence):** `presence-host-{host_uuid}`
  - Host dan Android bergabung ke channel ini.
  - Jika host terhubung, Android menerima event `pusher:member_added`.
  - Jika host mati / PC sleep / internet putus, Android otomatis menerima `pusher:member_removed`.
- **Private Channel (Session Tunnel):** `private-host-{host_uuid}`
  - Digunakan untuk transfer command RPC dan data terminal.

### 4.2 Envelope Framing (Outer Envelope - Dilihat oleh Reverb)
Pesan dikirim menggunakan Pusher Client Event (`client-*`):
```json
{
  "event": "client-e2ee-message",
  "channel": "private-host-d3b07384-d113-4966-9e99-c0c451f04123",
  "data": {
    "v": 1,
    "from_device_id": "dev-and-992a",
    "nonce": "kL94bVc7xZ1...",
    "ciphertext": "BASE64URL_ENCRYPTED_PAYLOAD_HERE"
  }
}
```
*Catatan:* Laravel Reverb hanya melihat metadata routing di atas dan menyalurkannya. Server Reverb tidak memiliki kunci privat untuk mendekripsi `ciphertext`.

### 4.3 Payload Terenkripsi (Inner Payload - Setelah Didekripsi di Desktop / Android)

#### A. Request dari Android ke PC Host:
```json
{
  "rpc_id": "req-8841a",
  "method": "agent.send_prompt",
  "params": {
    "session_id": "term-1740001-xyz",
    "prompt": "Fix unit tests in src/auth.rs and rerun cargo test"
  },
  "idempotency_key": "idem-99120348",
  "timestamp": 1776478900
}
```

#### B. Stream Terminal dari PC Host ke Android:
```json
{
  "type": "terminal.chunk",
  "session_id": "term-1740001-xyz",
  "sequence": 1402,
  "data_b64": "G1swOzMxbUZhaWxlZCB0ZXN0czobWzBt..."
}
```

#### C. Request Approval dari Agent ke Android:
```json
{
  "type": "agent.approval_required",
  "request_id": "appr-0012",
  "session_id": "term-1740001-xyz",
  "tool_name": "bash",
  "command": "git push origin main --force",
  "risk_level": "danger",
  "expires_at": 1776479020
}
```

---

## 5. Alur UX Utama (UX Flows)

### 5.1 Alur Pairing Pertama Kali (QR Code & Mutual SAS)
1. **Desktop:** Pengguna membuka menu *Vela Settings → Remote Companion → Enable*.
2. **Desktop:** Vela melakukan handshake outbound WSS ke Laravel Reverb dan membuat token pairing via REST API Laravel.
3. **Desktop:** Layar Vela menampilkan QR Code yang berisi: URL Reverb, `host_id`, `invite_token`, dan `host_public_key_fingerprint`.
4. **Android:** Pengguna membuka aplikasi Vela Companion di HP, menekan *Add PC*, lalu memindai QR code via kamera.
5. **Android:** Aplikasi HP membuat kunci identitas di Android Keystore dan mengirim permintaan claim ke Laravel API.
6. **Mutual Verification (Anti-MITM):**
   - Layar Desktop dan layar HP sama-sama memunculkan **Short Authentication String (SAS)** berupa 6 digit angka yang identik (dihasilkan dari derivasi hash kunci publik kedua pihak).
   - Pengguna menekan tombol "Confirm & Allow" di Desktop Vela.
7. **Pairing Selesai:** Kunci publik HP disimpan di SQLite Desktop dan DB Laravel. Android langsung masuk ke dashboard host.

### 5.2 Alur Pemantauan & Input Prompt Jarak Jauh
1. Pengguna berada di jaringan seluler 4G/5G di luar rumah/kantor.
2. Membuka aplikasi Android → Status PC terlihat **Online (Hijau)** via Reverb Presence.
3. Memilih sesi aktif (misal: Sesi "Claude Code - Worktree feature/auth").
4. Android melakukan subscribe ke event stream sesi tersebut.
5. Desktop mengirimkan snapshot status terakhir + buffer output terbaru.
6. Pengguna mengetik instruksi baru di Android, lalu menekan tombol *Send*.
7. Pesan dienkripsi di HP → dikirim lewat Reverb → diterima Vela Desktop → didekripsi → diinjeksikan langsung ke ConPTY sesi agent yang bersangkutan.

### 5.3 Alur Background & Notifikasi (FCM Wakeup)
1. Aplikasi Android berada di latar belakang (*background*) atau layar HP mati.
2. Agent di PC menemui kondisi *Waiting for User Approval* atau *Task Completed*.
3. Desktop Vela mengirim sinyal webhook aman ke Laravel API: `"Device X requires notification for Session Y"`.
4. Laravel mengirim push notification FCM berkategori `HIGH_PRIORITY` ke Android.
5. Layar HP memunculkan notifikasi: *"Vela: Claude Code requires approval for bash command"*.
6. Pengguna mengetuk notifikasi → aplikasi terbuka → biometrik terverifikasi → E2EE channel terhubung kembali → dialog approval muncul.

---

## 6. Persyaratan Keamanan & Model Ancaman (Threat Model)

| Ancaman (*Threat*) | Dampak | Mitigasi Wajib |
|---|---|---|
| **Server Relay Laravel / VPS Diretas** | Penyerang mengontrol server Reverb dan database MySQL. | **Zero-Knowledge E2EE**: Seluruh konten pesan (prompt, source code, token) dienkripsi end-to-end antar perangkat. Penyerang hanya melihat ciphertext acak. |
| **Man-In-The-Middle (MITM) saat Pairing** | Pihak ketiga mencegat QR code dan memalsukan identitas. | **6-Digit SAS Code Verification**: Pengguna wajib memverifikasi kode 6-digit yang sama antara monitor PC dan layar HP sebelum akses diberikan. |
| **Ponsel Android Hilang / Dicuri** | Penemu ponsel mengakses terminal PC secara ilegal. | **Instant Revocation & Keystore**: Host dapat mencabut izin ponsel kapan saja dari desktop dengan satu klik. Kunci privat di HP dilindungi oleh Android Keystore + Biometrik (Fingerprint/Face Unlock). |
| **Eksekusi Perintah Ganda (*Replay Attack*)** | Gangguan koneksi seluler menyebabkan prompt terkirim dua kali. | **Idempotency Keys**: Setiap pesan RPC dari HP menyertakan UUID `idempotency_key`. Desktop menolak eksekusi jika key tersebut sudah pernah diproses. |
| **Koneksi Seluler Putus Mendadak** | Kehilangan potongan log terminal saat stream berlangsung. | **Monotonic Sequence Numbering**: Output terminal diberi nomor sequence (`101, 102, ...`). Saat reconnect, HP meminta `session.resume(last_seq)` dari cache SQLite desktop. |

---

## 7. Rencana Implementasi & Pelacak Tugas (Task Tracker)

Status: `WAIT` = Belum dimulai, `IN_PROGRESS` = Sedang dikerjakan, `BLOCKED` = Terhalang, `DONE` = Selesai & Terverifikasi.

### Fase 1: Backend Laravel Reverb (Proyek Terpisah)
| ID | Tugas | Prioritas | Status |
|---|---|---|---|
| T-BE-01 | Setup Laravel 11/12 + Reverb + Nginx SSL di VPS | P0 | WAIT |
| T-BE-02 | Konfigurasi Reverb: max payload 128KB, client whispering enabled | P0 | WAIT |
| T-BE-03 | Buat skema DB & migrasi: `hosts`, `devices`, `pairing_sessions` | P0 | WAIT |
| T-BE-04 | Buat API pairing handshake (create, claim, confirm, revoke) | P0 | WAIT |
| T-BE-05 | Implementasi endpoint `/broadcasting/auth` dengan token Sanctum/Device | P0 | WAIT |
| T-BE-06 | Konfigurasi FCM (Firebase Cloud Messaging) channel di Laravel | P1 | WAIT |

### Fase 2: PC Host — Vela Desktop (Rust + Tauri 2)
| ID | Tugas | Prioritas | Status |
|---|---|---|---|
| T-PC-01 | Tambahkan dependency SQLite (`rusqlite`) & migrasi tabel lokal | P0 | WAIT |
| T-PC-02 | Implementasi modul E2EE (X25519 + ChaCha20-Poly1305) & Windows DPAPI | P0 | WAIT |
| T-PC-03 | Implementasi Pusher/Reverb WebSocket client via `tokio-tungstenite` | P0 | WAIT |
| T-PC-04 | Hubungkan presence channel `presence-host-{id}` untuk deteksi status online | P0 | WAIT |
| T-PC-05 | Modifikasi [pty/manager.rs](file:///C:/DEKSTOP/RUST/terminal_manager/src-tauri/src/pty/manager.rs): fan-out output stream ke Reverb & simpan sequence ke SQLite | P0 | WAIT |
| T-PC-06 | Implementasi RPC dispatcher lokal (terima `send_prompt`, verifikasi scope, injeksi ke ConPTY) | P0 | WAIT |
| T-PC-07 | Buat UI Settings di Tauri: Generate QR pairing, modal konfirmasi SAS, list devices & revoke | P0 | WAIT |

### Fase 3: Android Companion App (Kotlin + Jetpack Compose)
| ID | Tugas | Prioritas | Status |
|---|---|---|---|
| T-AD-01 | Setup project Android: Jetpack Compose, Navigation, Dagger Hilt | P0 | WAIT |
| T-AD-02 | Implementasi CameraX + ML Kit untuk pemindai QR Code pairing | P0 | WAIT |
| T-AD-03 | Implementasi Android Keystore (generate & simpan keypair aman) | P0 | WAIT |
| T-AD-04 | Integrasi `pusher-websocket-java` client ke Laravel Reverb | P0 | WAIT |
| T-AD-05 | Implementasi dekripsi E2EE pesan & verifikasi SAS 6-digit | P0 | WAIT |
| T-AD-06 | Buat UI Dashboard Host: Indikator Online/Offline real-time via Presence Channel | P0 | WAIT |
| T-AD-07 | Buat UI Live Terminal Streamer dengan ANSI viewer & pause/autoscroll | P0 | WAIT |
| T-AD-08 | Buat UI Prompt Composer & kontrol interupsi (Ctrl+C / Kill) | P0 | WAIT |
| T-AD-09 | Integrasi Firebase Cloud Messaging untuk notifikasi background | P1 | WAIT |

---

## 8. Definisi Selesai (Definition of Done)

Proyek Remote Agent Companion dinyatakan siap produksi (Production-Ready) apabila:
1. **End-to-End Pairing Sukses:** Ponsel Android dapat memindai QR code di PC Vela, kode SAS 6-digit cocok di kedua layar, dan otorisasi tersimpan aman di DPAPI (PC) dan Keystore (Android).
2. **Koneksi Menembus Firewall/CGNAT:** Ponsel di jaringan seluler 4G/5G dapat terhubung ke PC di jaringan Wi-Fi rumah tanpa memerlukan konfigurasi router atau port forwarding.
3. **Streaming & Input Berfungsi:** Output terminal ConPTY dari sesi Claude Code / Gemini CLI muncul di HP secara real-time (< 500ms latensi normal), dan prompt yang dikirim dari HP berhasil dieksekusi di PC tanpa membuat sesi ganda.
4. **Zero-Knowledge Terbukti:** Log di server Laravel Reverb diverifikasi hanya berisi ciphertext Base64 acak dan tidak pernah mengekspos teks kode atau prompt pengguna.
5. **Pencabutan Akses Efektif:** Menekan tombol "Revoke" di Desktop Vela seketika memutus akses HP dan menolak seluruh pesan berikutnya.
6. **Build Rilis Terverifikasi:**
   - Desktop: `npx @tauri-apps/cli build --no-bundle` menghasilkan binary rilis `src-tauri/target/release/vela.exe`.
   - Android: APK rilis ditandatangani dengan keystore produksi.
   - Backend: Daemon Reverb berjalan stabil di bawah supervisor/systemd di VPS.
