# Investigasi Page Break Paged.js — Laporan Akhir

**Status:** Not reproducible with available data and environment
**Tanggal:** 1 Juni 2026
**Lingkup:** Paged.js 0.4.3 + Puppeteer (Chrome) — migrasi dari WeasyPrint (commit `b0d732f`)
**Data:** 196 siswa (98 old batch kelas 28–31, 98 new batch kelas 36–39), database produksi sqlite3

---

## 1. Hipotesis yang Diuji

### H1: Row `page-break-inside:avoid` menyebabkan empty space
- **Akar hipotesis:** `<tr style="page-break-inside:avoid;">` pada setiap baris tabel memaksa Paged.js memindahkan baris utuh ke halaman berikutnya, meninggalkan ruang kosong.
- **Diuji pada state:** S1 (b0d732f) — SEMUA baris menggunakan `page-break-inside:avoid`.
- **Bukti:** S1 menghasilkan 6× TR selectNode + 2× TABLE selectNode per siswa (8 element-level breaks), tetapi **0 empty space ≥1%** pada semua halaman.
- **Verdict:** TERBANTAHKAN. Element-level break tidak menyebabkan empty space.

### H2: SelectNode(TR) menyebabkan empty space
- **Akar hipotesis:** Callback `selectNode` pada elemen TR mengindikasikan Paged.js kesulitan menempatkan baris, sehingga halaman memiliki celah kosong.
- **Diuji pada state:** S1 (b0d732f) — memicu TR selectNode 6× per siswa.
- **Bukti:** Semua peristiwa selectNode TR terjadi tanpa empty space. Paged.js menangani element-level overflow dengan benar — memindahkan konten ke halaman berikutnya dan mengisi ruang yang tersisa.
- **Verdict:** TERBANTAHKAN. SelectNode adalah mekanisme normal, bukan indikator bug.

### H3: Table selectNode menyebabkan empty space
- **Akar hipotesis:** SelectNode pada elemen TABLE memotong tabel di tengah dan meninggalkan ruang kosong.
- **Diuji pada state:** S1 (b0d732f) — memicu TABLE selectNode 2× per siswa.
- **Bukti:** TABLE selectNode terjadi 2× per siswa, tetapi tidak ada empty space. Data sintetis (7 mapel, 2500 ch/mapel) juga memicu TABLE selectNode 3× tanpa empty space.
- **Verdict:** TERBANTAHKAN.

### H4: Gap calculation `gap - leftMargin` menyebabkan over-estimasi ruang kosong
- **Akar hipotesis:** Perhitungan `this.gap = gap - leftMargin` di Paged.js polyfill menghasilkan nilai negative atau terlalu besar, menyebabkan rendering salah.
- **Diuji pada state:** S1–S4 — nilai `gap - leftMargin` konsisten `1056.701875` (gap ≈ 1132.28, leftMargin ≈ 75.58).
- **Bukti:** Nilai gap konsisten dan positif di semua render. Tidak ada korelasi antara nilai gap dan empty space.
- **Verdict:** TERBANTAHKAN. Gap calculation normal.

### H5: Concurrency (bulk rendering) menyebabkan race condition
- **Akar hipotesis:** Render 4 siswa bersamaan menyebabkan interferensi Paged.js.
- **Diuji:** 5 siswa dengan concurrency=4.
- **Bukti:** Setiap siswa menghasilkan page count dan event pattern yang **identik** dengan render sequential (1 siswa). Tidak ada perbedaan.
- **Verdict:** TERBANTAHKAN. Bulk rendering aman.

### H6: Perubahan CSS setelah S1 menghilangkan bug
- **Akar hipotesis:** Bug asli sudah diperbaiki oleh layout fixes setelah migrasi Paged.js.
- **Diuji:** Semua 4 state (b0d732f → ef97365 → b2708d0 → cb002ce) dengan 5 siswa paling kompleks + Abrillia (7 mapel).
- **Bukti:** Semua state menghasilkan 0 empty space. Halaman konsisten 5 (new batch) atau 2 (old batch). Tidak ada state yang mereproduksi bug.
- **Verdict:** TERBANTAHKAN. Bug sudah tidak ada sejak S1 (first Paged.js commit).

---

## 2. Commit yang Mengubah Perilaku Page Break

| Commit | Perubahan | Efek pada Page Break |
|--------|-----------|---------------------|
| `b0d732f` | Migrasi ke Paged.js + WeasyPrint dihapus | **State S1.** Setiap `<tr>` punya `page-break-inside:avoid`. Tidak ada `orphans`/`widows` pada `<td>`. |
| `ef97365` | Fix combined table (CSS `table-layout:fixed`, padding) | **State S2.** **Tidak ada efek** pada page break. S2 identik dengan S1. |
| **`b2708d0`** | **Fix intrak table pagebreak** | **State S3.** Perubahan paling signifikan: (a) `page-break-inside:avoid` dihapus dari `<tr>`, (b) `orphans:2; widows:2` ditambahkan ke `<td>`, (c) `first-data-row { page-break-before: avoid }`, (d) inline width → CSS class. **Efek: element-level break → text-level break.** |
| `cb002ce` | Avoid pagebreak inside | **State S4.** `page-break-inside:auto` + `orphans:1; widows:1` ditambahkan ke `<td>`. **Tidak ada efek** — orphans/widows di-override ke 2 oleh aturan S3. |

### Ringkasan efek

```
                  element-level break          text-level break
S1 (b0d732f)      ████████████████████████████
S2 (ef97365)      ████████████████████████████
S3 (b2708d0)                                    ████████████████████████████
S4 (cb002ce)                                    ████████████████████████████

Page count:       5 5 5 5 (sama untuk semua state)
Empty space:      0 0 0 0 (sama untuk semua state)
```

---

## 3. Hal-hal yang Masih Tidak Diketahui

1. **Penyebab asli laporan bug tidak diketahui.** Tidak ada data, kode, atau environment yang bisa mereproduksi "row dipindahkan utuh → ruang kosong besar."

2. **"9 surat → 4 halaman" tidak bisa diverifikasi.** Tidak ada siswa dengan ≥9 mapel. Mungkin merujuk pada 9 siswa/baris per halaman yang terpotong, atau interpretasi lain.

3. **Kondisi database sebelum migrasi Paged.js tidak diketahui.** Backup Desember 2025 (`~/Downloads/Telegram Desktop/raporkumer-backup-2025-12-15T04-14-38-634Z.sqlite3`) belum diperiksa — mungkin berisi data dengan konfigurasi yang berbeda.

4. **Faktor eksternal (Chrome, Puppeteer, font rendering) tidak diuji.** Bug mungkin terkait dengan versi Chrome/Puppeteer tertentu, font yang belum di-load, atau race condition yang sporadis.

---

## 4. Rekomendasi Praktis

### Untuk kode saat ini (chore/fix-layout)

1. **State S3 (b2708d0) adalah baseline yang baik** — text-level break lebih halus daripada element-level break, meskipun tidak ada perbedaan page count.

2. **`RepeatTableHeadersHandler` di pagedpdf.ts (uncommitted) tidak diperlukan untuk data saat ini** — tidak ada tabel yang terpotong dengan cara yang menyebabkan header hilang (selectNode TABLE hanya terjadi 2× di S1, dan tidak ada di S3/S4). Namun bisa dipertahankan sebagai safety net.

3. **Prioritas utama sebaiknya bukan page break** — bug tidak bisa direproduksi, dan kualitas page break sudah baik (text-level break, 0 empty space).

4. **Jika ingin melanjutkan optimasi**:
   - Pertimbangkan menambah `page-break-inside:auto` pada seluruh sel tabel (seperti S4) sebagai dokumentasi eksplisit, meskipun tidak mengubah perilaku saat ini.
   - Pertahankan `orphans:2; widows:2` pada `<td>` — ini mencegah satu baris terisolasi di halaman berbeda.

### Untuk investigasi masa depan

Jika bug muncul kembali:
1. Capture **full HTML** dan **screenshot** dari halaman yang bermasalah segera
2. Catat **Chrome/Puppeteer/Paged.js version** saat itu
3. Simpan **database backup** sebelum import data baru
4. Buka laporan baru dengan data konkret

---

## Lampiran

### Data pengujian

- **Script test:** `scripts/test-4-states.mjs` (membandingkan 4 historical template states)
- **Script bulk:** `scripts/validate-bulk.mjs` (full validation, single + concurrent rendering)
- **Script sintetis:** `scripts/repro-long-desc.mjs` (7 mapel, 2500 ch/desc — satu-satunya yang memicu selectNode TR)
- **Polyfill debug:** `/tmp/opencode/browser-debug.js` (Paged.js 0.4.3 + console.log hooks)
- **Hasil detail:** `/tmp/opencode/4-states-results.json`

### Spesifikasi environment

- Paged.js: 0.4.3 (pagedjs-cli 0.4.3)
- Puppeteer-core: 25.1.0
- Chrome: Google Chrome Stable (system default, 64-bit)
- OS: Linux (Arch Linux)
- Node.js: v24.15.0
- pnpm: 10+ (engine-strict)

### Riwayat commit yang diuji

```
b0d732f ─── ef97365 ─── b2708d0 ─── cb002ce
   S1            S2           S3           S4
```
