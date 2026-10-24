# Analisis Bottleneck Performa — Rapkumer

**Tanggal:** 2 September 2026
**Hardware server:** Acer Aspire 5 A514-52K — i3-8130U, 4GB RAM, HDD 930GB (btrfs), Arch Linux
**Status:** Audit source code (tanpa mengubah file apapun)

---

## Spesifikasi Hardware & Konteks

| Komponen | Nilai                                       | Catatan                                |
| -------- | ------------------------------------------- | -------------------------------------- |
| CPU      | Intel i3-8130U (4C/4T) @ 3.40 GHz           | Prosesor laptop, lemah untuk server    |
| RAM      | 3.57 GB total, 47% terpakai (~1.9 GB bebas) | Sangat mepet, risiko OOM saat PDF bulk |
| Disk     | 930 GB btrfs, terpakai 2%                   | HDD (bukan SSD) — bottleneck I/O utama |
| OS       | Arch Linux, kernel 6.18.44-1-lts            | —                                      |

Kesimpulan hardware: **HDD adalah penyebab utama lambatnya I/O**, namun ada beberapa pola di kode yang memperburuk kondisi. Perbaikan kode tetap berdampak signifikan bahkan setelah upgrade SSD.

---

## Temuan Detail

### 1. SQLite `synchronous=FULL` (KRITIS)

- **File:** `src/lib/server/db/index.ts:55-62`
- SQLite WAL mode aktif, tapi **tidak ada `PRAGMA synchronous=NORMAL`**.
- Default SQLite = `FULL` → setiap transaksi write melakukan `fsync()` ke disk.
- Di HDD, fsync = **10-20ms per write** → dirasakan di setiap presensi, input nilai, form submit.

### 2. PDF: Chrome spawn + PagedJS per-murid (BESAR)

- **File:** `src/lib/server/pdf/pagedpdf.ts:100-346`
- `getBrowser()` spawn Chrome saat pertama kali dibutuhkan (lambat di hardware ini).
- Bulk rapor memanggil `setContent()` + PagedJS polyfill + `page.pdf()` **per murid** di loop (`src/routes/api/pdf/bulk/+server.ts`) — untuk 30 siswa = 30x render.
- Logo base64 di-load dari DB tanpa cache (`src/lib/server/pdf/preview-utils.ts:39-54`).
- `pdfCache` dibatasi 30 item, TTL 5 menit, di RAM (`pagedpdf.ts:123-147`) — pada 4GB RAM, batch besar mengisi heap.
- `printBackground: true` memaksa rasterisasi background (mahal dengan logo besar).

### 3. Logo di-load dari DB setiap request, tanpa HTTP cache (BESAR)

- **File:** `src/routes/(informasi-umum)/sekolah/logo/+server.ts:31-42`
- Setiap `GET /sekolah/logo` = DB query full blob `Uint8Array`, tanpa in-memory cache.
- Path logo asli **tanpa header `Cache-Control`** → browser refetch setiap render.
- Pattern sama di `src/routes/(informasi-umum)/sekolah/logo-dinas/+server.ts`.

### 4. Murid photo: DB + fs per request, load semua sekelas sekaligus (BESAR)

- **File:** `src/routes/api/murid-photo/[id]/+server.ts` — tiap request = DB query + `fs.readFile`, tanpa cache.
- **File:** `src/routes/(informasi-umum)/murid/photos/+page.server.ts:42` — load binari foto **semua** murid sekelas sekaligus.
- **File:** `src/routes/api/murid-bulk-photo/+server.ts` — unzip semua buffer foto di RAM.

### 5. N+1 Query di Absen Harian (BESAR)

- **File:** `src/lib/server/absen/load-harian.ts`
- **8-10 DB query per page load**: 2x count (pagination), 3x findMany, 2x findFirst, query agama + mapel.
- `computePersentaseHarian` (baris 62-236) menjalankan 5+ query terpisah.
- `first-mapel.ts:17-65` — 3+ query sequential per hari.
- `src/lib/server/absen/pagination.ts:22-25` — `count(*)` full scan tiap page.

### 6. Query berulang di Asetmen Formatif (SEDANG)

- **File:** `src/routes/(input-nilai)/asesmen-formatif/+page.server.ts:99-743`
- `tableMataPelajaran.findFirst` dipanggil **4x identik** (baris 188, 347, 388, 408).
- Semua murid di-load dulu, pagination dilakukan di JS, bukan SQL `LIMIT/OFFSET` (baris 444-461).

### 7. Session resolve = 1 DB query per request, tanpa cache (SEDANG)

- **File:** `src/hooks.server.ts:158` → `src/lib/server/auth.ts:159-191`
- Tidak ada in-memory session cache — setiap request (termasuk asset) = query `tableAuthSession` + join `tableAuthUser`.
- `scryptSync` (synchronous) di `auth.ts:44-53` memblokir event loop saat login.

### 8. `runStartupEnsures()` di setiap request (SEDANG)

- **File:** `src/hooks.server.ts:140` → `src/lib/server/db/ensure-helper.ts:5-11`
- Dijaga oleh Map `ensured`, tapi first request setelah restart menjalankan semua DDL sequential.
- Beberapa halaman memanggil 4x `ensure*Schema()` sekaligus (`presensi-murid/+page.server.ts:31-34`).

### 9. Dashboard & root layout banyak query (SEDANG)

- **File:** `src/routes/+page.server.ts` — banyak aggregate count/sum di beberapa tabel.
- **File:** `src/routes/+layout.server.ts:30-52` — `verifyWaliKelasAccess` query tambahan per request untuk wali_kelas.

### 10. Lain-lain (RENDAH-SEDANG)

- **Service worker no-op:** `static/service-worker.js:9-11` — tidak ada caching JS/CSS.
- **CSRF origin file read per mutating request:** `src/hooks.server.ts:105` → `csrf-origins.ts` (TTL 5 detik).
- **DB import spawn node subprocess + reload client:** `src/routes/api/database/import/+server.ts`.
- **`BODY_SIZE_LIMIT` 512K default:** `src/hooks.server.ts:377` — bulk upload besar berisiko OOM.

---

## Skala Dampak

| #   | Temuan                       | Dampak | Estimasi Latensi       |
| --- | ---------------------------- | ------ | ---------------------- |
| 1   | SQLite sync=FULL + HDD fsync | Kritis | +10-20ms per write     |
| 2   | PDF bulk Chrome render       | Besar  | +2-5 detik per murid   |
| 3   | Logo DB + tanpa HTTP cache   | Besar  | +5-15ms per page load  |
| 4   | Murid photo load semua       | Besar  | +100-500ms per halaman |
| 5   | N+1 absen harian             | Besar  | +30-100ms per page     |
| 6   | Query duplikat asetmen       | Sedang | +50-150ms per load     |
| 7   | Session tanpa cache          | Sedang | +2-5ms per request     |
| 8   | Ensures per-first-request    | Sedang | Delay first paint      |
| 9   | Dashboard agregasi           | Sedang | +50-200ms per load     |

---

## Rekomendasi (ringkas)

1. `PRAGMA synchronous=NORMAL` di `db/index.ts` (1 baris, dampak terbesar).
2. Cache logo in-memory + `Cache-Control: public, max-age=86400, immutable`.
3. In-memory session cache (Map + TTL 30 detik).
4. Dedupe query `tableMataPelajaran` di asetmen-formatif (re-use hasil pertama).
5. Gunakan SQL `LIMIT/OFFSET` untuk pagination murid.
6. Cache base64 logo untuk PDF; pertimbangkan disk-backed PDF cache.
7. Jalankan ensures saat startup, bukan di request pertama.
8. Implement service worker runtime caching (stale-while-revalidate).
9. Upgrade ke SSD (mengurangi ~60-70% latensi I/O keseluruhan).

Rekomendasi terperinci tertulis di file `request-perbaikan.md` untuk dikirim ke pembuat aplikasi.
