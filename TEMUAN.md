# TEMUAN — Analisis Potensi Bug Vela

- **Tanggal analisis:** 2026-10-21
- **Cakupan:** seluruh frontend (`src/`), backend Rust (`src-tauri/src/`), konfigurasi Tauri, test, dan alur IPC.
- **Versi working tree saat analisis awal:** 0.1.1 (5 file versi sudah konsisten).
- **Sifat analisis awal:** review statis + eksperimen Git/PowerShell terisolasi. Playwright belum dijalankan pada tahap ini.

> Catatan historis: selama analisis awal, working tree berubah di luar tindakan analis — bump versi ke 0.1.1 di 5 file dan perubahan string prompt PowerShell di `src-tauri/src/pty/manager.rs`. Tahap analisis awal tersebut tidak mengubah kode.

## Status implementasi perbaikan — 2026-10-21

Seluruh 20 temuan telah ditangani pada working tree versi **0.2.0**. Versi aplikasi tidak dinaikkan dan release build tidak dijalankan. Bagian analisis awal di bawah dipertahankan sebagai riwayat; lokasi baris di sana merujuk kode sebelum perbaikan.

| # | Perbaikan yang diimplementasikan |
| --- | --- |
| 1 | Parser mempertahankan sumber rename; rollback memakai `git restore --source=HEAD --staged --worktree` untuk kedua path. Rename dengan perubahan lain pada sumber ditolak agar tidak menimpa file independen. |
| 2 | Key, pilihan, highlight, dan pemulihan pilihan memakai identitas `status + path`. Preview/hitungan staged deletion terpisah dari untracked replacement; rollback ambigu dinonaktifkan di UI dan ditolak ulang oleh backend. |
| 3 | Commit sukses memicu refresh status/sidebar meskipun auto-check OFF. Cache target diinvalidasi, termasuk ketika repo aktif berubah; kegagalan refresh tidak dilaporkan sebagai commit gagal. |
| 4 | `useDialog` menangani Escape dan Tab hanya untuk dialog teratas. Konfirmasi rollback/reset memakai focus trap sendiri, dan Escape tidak menutup dialog saat operasi Git berjalan. |
| 5 | Fokus awal diarahkan ke input direktori, input branch, atau judul review yang netral. Konfirmasi memfokuskan Batal, bukan aksi destruktif. |
| 6 | Refresh periodik dan saat window fokus dijeda selama Diff terbuka. Pembacaan status Git memakai `GIT_OPTIONAL_LOCKS=0` agar tidak mengambil optional index-refresh lock. |
| 7 | Kegagalan status satu worktree tidak menggagalkan daftar. `dirty_files_count: null` beserta `status_error` dibedakan dari clean; UI menampilkan `status unavailable`/`not checked` dan menyediakan refresh. |
| 8 | Fast path tanpa deteksi dibatasi pada root worktree yang diketahui secara tepat. Cwd baru di subdirektori diperiksa sehingga nested repo tidak otomatis diarahkan ke repo luar. |
| 9 | Target repo/worktree lama dibersihkan selama deteksi cwd yang belum diketahui dan saat deteksi gagal. Error lama dibersihkan pada fast path; respons stale tidak boleh mengisi cache. |
| 10 | Prompt PowerShell tidak menambahkan separator ganda; parser OSC 7 dan normalisasi path mempertahankan drive root `C:/`, termasuk laporan lama `file:///C://`. |
| 11 | Status bar membaca versi dari `package.json`, bukan string hardcoded. |
| 12 | Sidebar memberi label `new file` pada untracked. Hitungan nol tidak dipresentasikan sebagai hitungan isi file; sidebar tetap tidak membaca konten untracked. |
| 13 | Memilih mode split yang sudah aktif menjadi no-op, sehingga fokus secondary tidak menukar posisi pane. |
| 14 | Preset agent PowerShell memasang integrasi prompt sebelum menjalankan perintah agent, tanpa mengubah flag permission. Argumen `-File`/encoded command tetap dipertahankan. |
| 15 | Nama dan lokasi worktree baru diturunkan dari main worktree, termasuk ketika pembuatan dimulai dari linked worktree. |
| 16 | Area preview diff memakai `select-text`; chrome modal tetap tidak dapat diseleksi. |
| 17 | Kegagalan metadata/read untracked diisolasi per file dan ditampilkan sebagai preview unavailable; file lain tetap dapat direview. |
| 18 | Badge memprioritaskan conflict/deletion/rename/copy/addition sebelum modification; `AM` tampil ADD dan `RM` tampil REN. |
| 19 | Cache hanya ditulis setelah guard request lolos. Regression test memastikan respons dari komponen lama yang unmount tidak menimpa data baru. |
| 20 | Handler double-click header mengabaikan tombol window beserta elemen SVG di dalamnya. |

Hardening terkait: pathspec Git dibuat literal agar nama seperti `[a].txt` tidak mengenai file lain; kegagalan Git saat rollback tidak lagi ditutupi oleh penghapusan filesystem manual. Forced refresh setelah mutasi tidak memakai hasil pemeriksaan yang dimulai sebelum mutasi.

**Validasi setelah perbaikan:**

| Pemeriksaan | Hasil |
| --- | --- |
| `npm run build` (`tsc && vite build`) | Lulus |
| `npm test` | 95/95 lulus |
| `npm run lint` | 0 error, 3 warning Fast Refresh yang sudah ada sebelumnya |
| `npm run format:check` | Lulus |
| `npm run test:ui` | 2/2 lulus di Edge headless, 1280×820 dan 800×550; memakai mock IPC browser, bukan aplikasi Tauri native |
| `cargo check --locked` | Lulus |
| `cargo test --locked --lib` | 26/26 lulus, termasuk Git terisolasi dan ConPTY native |
| `cargo clippy --all-targets -- -D warnings` | Lulus |
| `cargo fmt --check` | Lulus |

Test Shift+Enter sempat gagal pada run paralel ketika test native baru ikut memulai shell. Test ConPTY kini diserialkan dengan mutex khusus test; run penuh terakhir lulus. Ini perubahan isolasi test, bukan penghapusan assertion atau perubahan perilaku terminal untuk menutupi kegagalan.

Lihat bagian runtime untuk batas verifikasi WSL dan aplikasi TUI. Hasil lint/build/test tidak berarti seluruh skenario runtime atau performa sudah terjamin.

## Ringkasan analisis awal

Tidak ditemukan bug yang membuat aplikasi crash total. Sebagian besar temuan adalah bug perilaku, edge case Git/path, race condition UI, dan inkonsistensi dokumentasi. Satu temuan berpotensi menghilangkan file dari working tree (rollback rename).

**Hasil pemeriksaan awal, sebelum perbaikan:**

| Pemeriksaan | Hasil |
| --- | --- |
| `npm run typecheck` | Lulus |
| `npm run lint` | 0 error, 9 warning |
| `npm test` | 60/60 lulus |
| `cargo test --locked --lib` | 22/22 lulus |
| `cargo check --locked` | Lulus |
| `cargo fmt --check` | Lulus |
| `cargo clippy --all-targets -- -D warnings` | Lulus |
| `npm run format:check` | Lulus |
| `npm run test:ui` (Playwright) | Tidak dijalankan |

Temuan berikut mendokumentasikan perilaku/edge case sebelum perbaikan; regression test terkait telah ditambahkan.

## Tabel prioritas awal (sebelum perbaikan)

| # | Temuan | Tingkat | Lokasi utama | Status |
| --- | --- | --- | --- | --- |
| 1 | Rollback file hasil rename tidak memulihkan file asli | Tinggi | `src-tauri/src/git/worktree.rs:498` | Terkonfirmasi |
| 2 | Satu path muncul dua kali (`D` + `??`) → duplicate key & rollback ambigu | Sedang | `src-tauri/src/git/worktree.rs:592` | Terkonfirmasi |
| 3 | Commit tidak me-refresh sidebar saat auto-check OFF | Sedang | `src/stores/useDiffStore.ts:124` | Terkonfirmasi |
| 4 | Escape di konfirmasi rollback/reset menutup seluruh modal diff | Sedang | `src/components/diff/DiffViewerModal.tsx:53` | Terkonfirmasi |
| 5 | Fokus awal modal jatuh ke tombol Close / aksi destruktif | Sedang | `src/lib/useDialog.ts:18` | Terkonfirmasi |
| 6 | Auto-refresh tetap berjalan saat modal Diff terbuka | Sedang | `src/App.tsx:71` | Terkonfirmasi |
| 7 | Satu worktree bermasalah menggagalkan seluruh daftar worktree | Sedang | `src-tauri/src/git/worktree.rs:156` | Terkonfirmasi |
| 8 | Repo bersarang di dalam worktree tidak terdeteksi | Sedang | `src/stores/useWorktreeStore.ts:139` | Terkonfirmasi (logika) |
| 9 | Gagal deteksi repo menyisakan state repo lama | Sedang | `src/stores/useWorktreeStore.ts:203` | Terkonfirmasi |
| 10 | `cd C:\` menghasilkan cwd `C:` yang salah | Sedang | `src-tauri/src/pty/manager.rs:523`, `src/lib/shellIntegration.ts:17` | Terkonfirmasi |
| 11 | Status bar masih menampilkan `v0.1.0` padahal versi 0.1.1 | Rendah | `src/components/layout/StatusBar.tsx:20` | Terkonfirmasi |
| 12 | File untracked selalu tampil `0/0` di sidebar | Rendah | `src-tauri/src/git/worktree.rs:347` | Terkonfirmasi |
| 13 | Klik ulang tombol split yang sama menukar posisi pane | Rendah | `src/stores/useTerminalStore.ts:172` | Terkonfirmasi (logika) |
| 14 | Terminal agent tidak punya integrasi OSC 7 | Sedang | `src-tauri/src/pty/manager.rs:507` | Terkonfirmasi |
| 15 | Nama worktree baru bergantung pada worktree yang aktif | Rendah | `src-tauri/src/git/worktree.rs:236` | Terkonfirmasi (logika) |
| 16 | Teks diff tidak bisa diseleksi | Rendah | `src/components/diff/DiffViewerModal.tsx:138` | Terkonfirmasi |
| 17 | Satu file gagal dibaca menggagalkan seluruh review | Rendah | `src-tauri/src/git/worktree.rs:433` | Terkonfirmasi |
| 18 | Badge status kurang akurat untuk kode gabungan | Rendah | `src/components/diff/DiffViewerModal.tsx:121` | Terkonfirmasi |
| 19 | Cache `ChangedFilesPanel` ditulis sebelum guard request | Rendah | `src/components/sidebar/ChangedFilesPanel.tsx:60` | Terkonfirmasi |
| 20 | Double-click title bar pada tombol window ikut toggle maximize | Rendah | `src/components/layout/TitleBar.tsx:75` | Terkonfirmasi |

---

## 1. Rollback file hasil rename tidak memulihkan file asli

**Lokasi:** `src-tauri/src/git/worktree.rs:498` (`rollback_file`), `:519` (cek `HEAD:<path>`), `:538` (cabang `git rm`), `:592` (`parse_status`).

**Reproduksi (dijalankan pada repo Git sementara):**

```text
git init; commit a.txt
git mv a.txt b.txt

status:  R  b.txt
         a.txt
HEAD:b.txt -> tidak ada

rollback_file("b.txt") mensimulasikan:
  - HEAD:b.txt tidak ada
  - git rm -f -- b.txt
  - hapus target bila ada

Hasil:
status:  D  a.txt
isi direktori: kosong
```

**Penyebab:** `rollback_file` hanya mengetahui path tujuan. Untuk rename, path tujuan tidak ada di HEAD sehingga fungsi masuk cabang "hapus file baru" dan tidak pernah memulihkan path sumber. `parse_status` membuang path sumber rename setelah membacanya.

**Dampak:** tombol Rollback pada entri rename menghapus file baru dan meninggalkan file lama dalam status deleted. Konten masih dapat dipulihkan lewat Reset All/HEAD, tetapi operasi per-file salah dan berpotensi terlihat seperti kehilangan data.

**Saran perbaikan:** simpan pasangan `(source, destination)` untuk status `R`/`C`, lalu pulihkan kedua sisi. Contoh pendekatan: `git reset HEAD -- old new`, `git checkout HEAD -- old`, lalu hapus `new`. Tambahkan regression test untuk rename murni, rename + modifikasi, dan rename yang sudah di-stage.

---

## 2. Satu path muncul dua kali (`D` + `??`)

**Lokasi:** `src-tauri/src/git/worktree.rs:592` (`parse_status`), `src/components/diff/DiffViewerModal.tsx:373`, `src/components/sidebar/ChangedFilesPanel.tsx:175`, `src/stores/useDiffStore.ts:113`.

**Reproduksi:**

```text
git rm --cached a.txt

git status --porcelain=v1 -z:
  D  a.txt
  ?? a.txt
```

**Dampak:**

- `get_worktree_diff` mengembalikan dua `FileDiff` dengan `path` identik.
- React memakai `key={file.path}` di dua komponen → duplicate key.
- `selectFile` mencari berdasarkan path saja, sehingga entri `??` tidak pernah terpilih; klik selalu memilih entri `D`.
- Rollback pada path tersebut ambigu: user mungkin mengira menghapus file untracked, tetapi backend memulihkan konten HEAD dan menimpa file lokal.

**Saran perbaikan (dikoreksi setelah verifikasi):** mengganti React key saja tidak cukup. Gunakan identitas entri yang membedakan `status + path` secara konsisten untuk key, pemilihan file, penandaan entri aktif, dan pemulihan pilihan setelah refresh. Definisikan semantik rollback untuk kombinasi status ganda; selama backend masih menerima path saja, cegah rollback ambigu pada path tersebut. Pertimbangkan `git status --porcelain=v2`, tetapi pergantian format tidak otomatis menyelesaikan identitas entri atau semantik rollback. Tambahkan regression test untuk memilih kedua entri dan memastikan rollback tidak menimpa konten lokal akibat salah identifikasi.

---

## 3. Commit tidak memperbarui sidebar saat auto-check OFF

**Lokasi:** `src/stores/useDiffStore.ts:124` (`commit`), `src/components/diff/DiffViewerModal.tsx:636` dan `:698` (refresh hanya untuk rollback/reset), `src/components/sidebar/ChangedFilesPanel.tsx:83`.

**Alur:**

- `commit()` sukses → `refreshDiffs()` saja.
- `ChangedFilesPanel` hanya reload jika `refreshKey` (`statusRevision`) berubah atau `autoRefresh` true.
- `autoGitStatus` default OFF.

**Dampak:** setelah commit, panel "Changes" tetap menampilkan file yang sudah di-commit, dan `dirty_files_count` di sidebar/status bar tetap lama. User bisa mengira masih ada perubahan yang belum di-commit.

**Saran perbaikan:** setelah commit sukses, panggil `useWorktreeStore.getState().refreshWorktrees(true, true)` seperti pada rollback/reset, atau naikkan `statusRevision` secara eksplisit. Tambahkan test yang memverifikasi refresh setelah commit.

---

## 4. Escape pada konfirmasi rollback/reset menutup seluruh modal

**Lokasi:** `src/lib/useDialog.ts:51` (listener capture), `:23` (`stopImmediatePropagation`), `src/components/diff/DiffViewerModal.tsx:53` (useDialog), `:67` (listener konfirmasi).

**Penyebab:** `useDialog` mendaftarkan listener `keydown` capture di `window` saat modal dibuka. Konfirmasi rollback/reset mendaftarkan listener-nya belakangan. Pada target yang sama, listener capture berjalan sesuai urutan registrasi, sehingga handler `useDialog` berjalan lebih dulu dan `stopImmediatePropagation()` mencegah handler konfirmasi. Escape menutup modal diff, bukan konfirmasi.

**Dampak:** UX salah; kode handler Escape konfirmasi tidak pernah dieksekusi. Tidak ada aksi destruktif otomatis, tetapi perilakunya membingungkan.

**Saran perbaikan (dikoreksi setelah verifikasi):** beri `useDialog` informasi konfirmasi aktif dan pastikan Escape ditangani oleh dialog teratas. Sekadar menandai parent sebagai busy atau melewati `onClose` tidak cukup jika parent tetap memanggil `stopImmediatePropagation()`: handler konfirmasi masih tidak menerima event. Saat konfirmasi aktif, parent harus menyerahkan event sebelum menghentikan propagasi, atau satu handler terpusat membatalkan konfirmasi alih-alih menutup Diff. Tetap cegah Escape diteruskan ke terminal, dan jangan membatalkan operasi Git yang sedang berjalan. Tambahkan test bahwa Escape pertama hanya menutup konfirmasi dan Escape berikutnya menutup Diff ketika tidak busy.

---

## 5. Fokus awal modal jatuh ke tombol Close / aksi destruktif

**Lokasi:** `src/lib/useDialog.ts:18`, `src/components/modals/OpenTerminalModal.tsx:181`, `src/components/modals/CreateWorktreeModal.tsx:91`, `src/components/diff/DiffViewerModal.tsx:182`.

`querySelector` memilih elemen fokusable pertama dalam urutan DOM:

- **Open Terminal:** tombol Close di header. Menekan Enter langsung menutup modal, padahal UI menulis "Press Enter to Launch" (`OpenTerminalModal.tsx:218`).
- **Create Worktree:** tombol Close. Enter menutup modal.
- **Diff Viewer:** tombol **Reset All**. Enter membuka konfirmasi reset seluruh perubahan.

**Saran perbaikan:** prioritaskan `[data-autofocus]` atau input utama; jangan pernah memfokuskan aksi destruktif secara default. Tambahkan test fokus awal untuk ketiga modal.

---

## 6. Auto-refresh tidak dijeda saat modal Diff terbuka

**Lokasi:** `src/App.tsx:71-89`; guard di `:73` dan `:80`.

Guard hanya memeriksa `isOpenTerminalModalOpen` dan `isCreateWorktreeOpen`. Status modal diff ada di `useDiffStore.isOpen` dan tidak diperiksa.

**Dampak:** dengan `autoGitStatus` ON, setiap 10 detik `listWorktrees` menjalankan `git status` untuk setiap worktree saat user sedang mereview atau commit. Ini menambah beban dan berpotensi bersinggungan dengan `git add`/commit (kontensi `index.lock`, walaupun jarang). Komentar "paused while modals are open" tidak akurat untuk modal diff.

**Saran perbaikan:** tambahkan `useDiffStore` open state ke guard; pertimbangkan juga menjeda saat window tidak fokus.

---

## 7. Satu worktree bermasalah menggagalkan seluruh daftar worktree

**Lokasi:** `src-tauri/src/git/worktree.rs:156` (`Self::status(&path)?` di dalam `list_worktrees`).

Jika satu worktree tidak dapat diakses, locked, korup, atau status-nya melewati batas output 2 MB, seluruh perintah `list_worktrees` gagal. Refresh manual (`WorktreeSidebar.tsx:202`) dan auto-check memakai `check_status=true`, sehingga sidebar bisa tidak menampilkan worktree sama sekali.

**Saran perbaikan (dikoreksi setelah verifikasi):** jadikan kegagalan status per-worktree non-fatal bagi daftar, tetapi representasikan hasilnya sebagai status tidak diketahui/gagal diperiksa, bukan `clean`. Jangan langsung memakai `unwrap_or(0)` tanpa memperbarui model dan UI, karena nol saat ini ditafsirkan sebagai tidak ada perubahan. Pertahankan error per-worktree dan sediakan retry; bila mempertahankan hitungan terakhir, tandai sebagai stale. Jika memilih hanya memeriksa worktree aktif, worktree lain juga harus ditandai belum diperiksa. Pertimbangkan paralelisasi dengan batas konkurensi.

**Koreksi kondisi reproduksi dan dampak:** eksperimen menunjukkan `git worktree lock` sendiri tidak membuat `git status` gagal. Worktree dengan `.git` yang menunjuk ke repository tidak valid tetap tercantum dalam `worktree list`, tetapi status-nya gagal dan menggagalkan hasil backend. Pada refresh frontend, daftar lama dipertahankan bersama pesan error, bukan otomatis dikosongkan; kegagalan pemuatan awal tetap dapat membuat daftar belum tersedia.

---

## 8. Repo bersarang di dalam worktree tidak terdeteksi

**Lokasi:** `src/stores/useWorktreeStore.ts:139-156` (fast path), `:186` (klaim slow path mendeteksi nested repo).

Fast path mencocokkan prefix path dan langsung `return` jika cwd berada di bawah worktree yang dikenal. Akibatnya `findGitRepo` tidak pernah dipanggil untuk repo Git bersarang (submodule/nested repo) di dalam worktree; sidebar/diff/commit menargetkan repo/worktree luar.

**Saran perbaikan:** gunakan fast path hanya untuk kecocokan tepat dengan root worktree, atau cache hasil "tidak ada repo bersarang" per cwd. Tambahkan test untuk nested repo.

---

## 9. Gagal deteksi repo menyisakan state repo lama

**Lokasi:** `src/stores/useWorktreeStore.ts:203-215` (catch), `:150` (fast path tidak membersihkan error).

Saat deteksi/listing gagal, hanya `isLoading` dan `error` yang diubah. `repoPath`, `worktrees`, dan `activeWorktreeId` dari repo sebelumnya tetap tampil. Jika terminal pindah ke drive terputus atau folder tanpa izin, UI masih menampilkan worktree repo lama dan tombol Diff/Remove mengarah ke repo lama.

**Saran perbaikan:** saat request masih current, kosongkan state repo/worktree atau tandai stale secara eksplisit. Bersihkan juga `error` di fast path.

---

## 10. Drive root menghasilkan cwd `C:` yang salah

**Lokasi:** `src-tauri/src/pty/manager.rs:523` (prompt PowerShell), `src/lib/shellIntegration.ts:17-24`, `src/stores/useWorktreeStore.ts:6` (`normalizePath`).

**Bukti (dijalankan di PowerShell):**

```text
ProviderPath=[C:\]  Uri=[file:///C://]
```

Parser mengubahnya menjadi `C://`, lalu membuang trailing slash karena panjang > 3 → `C:`. `C:` adalah path relatif-drive, bukan `C:\`. `git -C C:` bisa berjalan di cwd proses pada drive C (hasil tak terduga) atau gagal, dan path ini tidak cocok dengan worktree `C:/...`.

**Saran perbaikan:** normalisasi `^[A-Za-z]:$` menjadi `X:/` di `cwdFromOsc7`/`normalizePath`, dan hindari menambahkan separator jika `ProviderPath` sudah berakhiran separator.

---

## 11. Status bar hardcoded `v0.1.0`

**Lokasi:** `src/components/layout/StatusBar.tsx:20`.

Versi sudah 0.1.1 di 5 file, tetapi status bar masih menampilkan `v0.1.0`. Ini akan terus salah setiap release. Gunakan `getVersion()` dari `@tauri-apps/api/app` atau injeksi build-time.

---

## 12. File untracked tidak punya hitungan baris di sidebar

**Lokasi:** `src-tauri/src/git/worktree.rs:347-392` (`get_worktree_changes`).

`git diff HEAD --numstat` tidak memasukkan untracked. File `??` tampil tanpa `+N` (0/0), meskipun diff viewer menghitung isinya. Ini inkonsistensi UI, bukan kerusakan data.

**Saran perbaikan:** hitung baris dari preview untuk file `??`, atau tampilkan label "new file" alih-alih 0/0.

---

## 13. Klik ulang tombol split yang sama menukar posisi pane

**Lokasi:** `src/stores/useTerminalStore.ts:172-180`.

`setSplitMode` selalu menjadikan `activeSessionId` sebagai primary. Jika split vertikal sudah aktif, user mengklik pane kanan (secondary), lalu mengklik lagi tombol "Split Vertically", primary/secondary bertukar dan pane berpindah posisi. Seharusnya klik mode yang sama menjadi no-op.

**Saran perbaikan:** early return jika `mode === get().splitMode`.

---

## 14. Terminal agent tidak memiliki integrasi OSC 7

**Lokasi:** `src-tauri/src/pty/manager.rs:507-523` (`configure_shell`).

Integrasi prompt/OSC 7 hanya ditambahkan jika argumen tidak mengandung `-Command`. Semua profil agent memakai `-NoExit -Command <agent>`, sehingga cwd terminal agent tidak pernah ter-update. Setelah agent keluar dan user menjalankan `cd`, sidebar tetap menampilkan direktori/worktree lama.

**Saran perbaikan:** sisipkan integrasi prompt sebelum perintah agent, atau pasang ulang prompt setelah agent selesai. Minimal dokumentasikan sebagai batasan.

---

## 15. Nama worktree baru bergantung pada worktree yang aktif

**Lokasi:** `src-tauri/src/git/worktree.rs:236-257`.

`create_worktree` memakai `file_name()` dari `repo_path` yang diteruskan UI. Jika terminal aktif berada di linked worktree (`repo-feature-abcd1234`), worktree baru dinamai `repo-feature-abcd1234-<branch>-...`, bukan berdasarkan nama repo utama. Semakin sering membuat worktree dari worktree lain, namanya makin tidak konsisten.

**Saran perbaikan:** resolve root repo utama (misalnya `git rev-parse --git-common-dir` atau entri `is_main` dari `worktree list`) untuk penamaan.

---

## 16. Teks diff tidak bisa diseleksi

**Lokasi:** `src/components/diff/DiffViewerModal.tsx:138` (`select-none`), area kode `:485-522`.

Root modal memakai `select-none`; area diff tidak menambahkan `select-text`. User tidak dapat menyalin potongan diff. Tombol copy hanya tersedia untuk path file. Untuk tool review, ini cukup mengganggu.

**Saran perbaikan:** tambahkan `select-text` pada area kode diff (dan pertahankan `select-none` pada chrome modal).

---

## 17. Satu file gagal dibaca menggagalkan seluruh review

**Lokasi:** `src-tauri/src/git/worktree.rs:433-446` (untracked file preview).

Error `symlink_metadata`/`File::open` untuk satu untracked file memakai `?`, sehingga seluruh `get_worktree_diff` gagal. File yang terhapus/berpindah di tengah proses review memblokir review file lain.

**Saran perbaikan:** tangkap error per file, tampilkan pesan "tidak bisa dibaca", dan lanjutkan file lain.

---

## 18. Badge status kurang akurat untuk kode gabungan

**Lokasi:** `src/components/diff/DiffViewerModal.tsx:121-129`.

`getStatusBadge` mengecek `M` lebih dulu, sehingga status seperti `AM`/`RM` tampil sebagai MOD. Dampak kosmetik.

---

## 19. Cache `ChangedFilesPanel` ditulis sebelum guard request

**Lokasi:** `src/components/sidebar/ChangedFilesPanel.tsx:55-70`.

Hasil disimpan ke `changesCache` sebelum memeriksa `id !== request.current`. Respons lama untuk path yang sama bisa menimpa cache dengan data lebih lama. Tampilan dilindungi guard, tetapi saat kembali ke worktree tersebut cache bisa stale.

**Saran perbaikan:** pindahkan penulisan cache setelah guard request.

---

## 20. Double-click title bar pada tombol window

**Lokasi:** `src/components/layout/TitleBar.tsx:75`.

`onDoubleClick` dipasang di seluruh header. Double-click pada tombol minimize/maximize/close ikut memicu toggle maximize karena event bubble. Tambahkan pengecekan `e.target.closest('button')` atau `stopPropagation` pada kontrol window.

---

## Temuan yang perlu verifikasi runtime

Catatan awal verifikasi lanjutan (2026-10-21): ketiga poin berikut **belum merupakan bug runtime terkonfirmasi**. Pada tahap awal ini, Playwright dan pengujian interaktif WebView2 belum dijalankan.

Pembaruan implementasi: Playwright kini sudah dijalankan dalam mode browser/mock IPC. Test ConPTY native juga ditambahkan; hasil setelah perbaikan dicatat pada masing-masing poin. Pengujian interaktif window Tauri/WebView2 tetap belum dilakukan.

### 1. Deteksi repo non-Git pada locale non-Inggris

`find_repo_root` (`src-tauri/src/git/worktree.rs:139`) mencocokkan teks Inggris `"not a git repository"`. Jika Git mengeluarkan pesan lokal, folder non-repo bisa dilaporkan sebagai error, bukan `Ok(None)`.

**Hasil pemeriksaan awal:** percobaan pada folder non-repo sementara dengan `LANGUAGE=de_DE`, `LC_ALL=de_DE.UTF-8`, dan `LANG=de_DE.UTF-8` tetap menghasilkan pesan Inggris pada instalasi Git lokal. Risiko pencocokan pesan terlihat di kode, tetapi kegagalan akibat locale **belum tereproduksi**.

**Verifikasi berikutnya:** gunakan instalasi Git yang benar-benar menghasilkan pesan terlokalisasi. Perbaikan klasifikasi harus membedakan folder non-repo dari kegagalan lain; jangan menganggap seluruh exit code nonzero sebagai `Ok(None)`.

**Status setelah perbaikan:** proses Git internal dipaksa memakai `LC_ALL=C` dan `LANGUAGE=C`, sehingga klasifikasi tidak bergantung pada locale pengguna. Regression test memeriksa konfigurasi locale tersebut, folder non-repo menghasilkan `None`, dan `.git` rusak tetap menghasilkan error.

### 2. Kompatibilitas Escape sebagai Win32 key record

`XTermView.tsx:187-195` mengirim sequence `ESC[27;..._` untuk Escape non-IME tanpa Meta. Perlu diuji di Git Bash/WSL/vim/less/fzf; kemungkinan sequence tampil sebagai karakter literal masih hipotesis.

**Hasil pemeriksaan awal:** test frontend memastikan sequence dikirim ke IPC, tetapi xterm/IPC dimock sehingga tidak membuktikan penerjemahan oleh ConPTY. Test native PowerShell `conpty_shift_enter_powershell` menguji **Shift+Enter dan Ctrl+J**, bukan kompatibilitas Escape.

**Verifikasi berikutnya:** uji Escape secara native pada shell dan aplikasi TUI tersebut. Bedakan keberhasilan pengiriman sequence dari keberhasilan aplikasi menerima tombol Escape.

**Status setelah perbaikan:** test ConPTY native lulus untuk PowerShell (`ConsoleKey.Escape`) dan Git Bash (`read` menerima byte ESC). Sequence Escape tidak diubah karena dugaan karakter literal tidak tereproduksi pada kedua target ini. WSL Ubuntu terdaftar, tetapi percobaan menjalankannya gagal karena izin logon lingkungan: `Wsl/Service/CreateInstance/CreateVm/HCS/0x80070569`. Escape di WSL/vim/less/fzf belum terverifikasi; hasil PowerShell/Git Bash tidak boleh dianggap sebagai bukti untuk semua aplikasi tersebut.

### 3. Proses keluar sebelum gate output dibuka

Reader menunggu gate `start_output`, sementara monitor menutup pseudoconsole setelah child keluar (`src-tauri/src/pty/manager.rs:253-265`). Dugaan `pty-error` semu bersamaan dengan `pty-exit` untuk proses yang keluar sebelum UI siap masih **hipotesis**, bukan konsekuensi yang sudah terbukti dari gate tersebut.

**Hasil pemeriksaan awal:** test natural-exit yang ada membuka gate sebelum mengirim perintah keluar. Test shutdown sebelum gate dibuka mencakup pembatalan sesi, bukan natural exit cepat dengan pembukaan gate yang ditunda.

**Verifikasi berikutnya:** jalankan proses yang segera selesai, tunda `start_output`, lalu periksa output akhir, jumlah dan kode event exit, event error, serta pembersihan sesi. Penutupan pseudoconsole sebelum gate terbuka saja tidak cukup untuk menyatakan ada bug.

**Status setelah perbaikan:** test native menunggu proses selesai dan monitor mengambil master pseudoconsole sebelum membuka gate. Output akhir berhasil didrain, tepat satu exit diterima dengan kode 0, tidak ada `pty-error`, dan sesi dibersihkan. Dugaan race ini tidak tereproduksi; pola worker/gate/backpressure produksi dipertahankan.

---

## Celah test awal dan penutupannya

- Rollback rename murni, rename dengan perubahan staged/unstaged, sumber rename yang dibuat ulang, serta status `D` + `??`: tercakup regression Git terisolasi.
- Commit → refresh sidebar, invalidasi cache lintas repo, dan forced refresh setelah pembacaan lama: tercakup test store.
- Escape bertingkat, focus trap, fokus awal modal, dan proteksi operasi berjalan: tercakup test komponen.
- Drive root dan UNC: tercakup test normalisasi/parser; prompt drive root juga diperiksa lewat ConPTY PowerShell native.
- Kegagalan status satu worktree serta preview file yang hilang: tercakup regression backend; tampilan unavailable/retry tercakup test UI.
- Nested repo, pembersihan state saat error, dan respons stale: tercakup test store.
- Integrasi OSC 7 preset agent: tercakup test penyusunan argumen dan eksekusi PowerShell native berargumen `-Command`.
- WSL/vim/less/fzf dan pengujian interaktif window Tauri tetap menjadi batas verifikasi runtime, bukan bug yang sudah terkonfirmasi.

## Urutan perbaikan awal (sudah ditangani)

1. Rollback rename dan status ganda (`D` + `??`) — berpotensi kehilangan/menimpa file.
2. Commit → refresh sidebar/worktree.
3. Escape/fokus awal modal.
4. Jeda auto-refresh saat modal Diff terbuka.
5. Kegagalan per-worktree pada `list_worktrees`.
6. Deteksi repo bersarang dan pembersihan state saat error.
7. Normalisasi drive root dan integrasi OSC 7 untuk agent.
8. Temuan kosmetik: badge status, untracked counts, split toggle, status bar version, seleksi teks diff, title bar double-click, cache guard.
