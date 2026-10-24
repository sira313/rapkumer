# Request Perbaikan Performa — Rapkumer

**Tanggal:** 2 September 2026
**Hardware server:** Acer Aspire 5 A514-52K — i3-8130U, 4GB RAM, HDD 930GB, Arch Linux
**Kondisi:** Laman sering bottleneck/lemot, terutama saat input data dan cetak rapor

---

## Ringkasan

Berdasarkan analisis source code, ditemukan beberapa masalah performa yang signifikan. HDD memang penyebab utama lambatnya I/O, tetapi ada beberapa pola di kode yang memperburuk kondisi. Perbaikan kode dapat memberikan perbaikan signifikan tanpa perlu ganti hardware.

---

## 1. SQLite `synchronous=FULL` — KRITIS

**File:** `src/lib/server/db/index.ts:55-62`

SQLite WAL mode sudah aktif, tetapi tidak ada `PRAGMA synchronous=NORMAL`. Default SQLite = `FULL`, artikan setiap transaksi write melakukan `fsync()` ke disk. Di HDD, fsync membutuhkan **10-20ms per write**. Setiap presensi, input nilai, dan form submit mengalami latensi ini.

**Fix:** Tambahkan `PRAGMA synchronous=NORMAL` setelah `PRAGMA journal_mode=WAL` di `enableWAL()`. Ini aman karena WAL sudah menjamin integritas data. Dampak: write latency turun drastis di HDD.

```ts
// Di enableWAL(), setelah journal_mode=WAL
await $client.execute(sql`PRAGMA synchronous = NORMAL`);
```

---

## 2. Logo di-load dari DB setiap request, tanpa HTTP cache — BESAR

**File:** `src/routes/(informasi-umum)/sekolah/logo/+server.ts:31-42`

Setiap load halaman, browser fetch `/sekolah/logo` → DB query full blob `Uint8Array` → tidak ada `Cache-Control` header yang benar. Dashboard load = logo refetch = DB I/O berulang. Pattern sama di `logo-dinas`.

**Fix:**

- Tambah in-memory cache untuk logo blob (misal TTL 60 detik)
- Tambah header `Cache-Control: public, max-age=86400, immutable` pada response logo
- Placeholder path sudah punya `Cache-Control: no-store` — ini sudah benar, tapi path logo asli perlu di-fix

---

## 3. Session resolve = 1 DB query per request, tanpa cache — SEDANG

**File:** `src/hooks.server.ts:158` → `src/lib/server/auth.ts:159-191`

Tidak ada in-memory session cache. Setiap request (termasuk asset, gambar) = 1 query ke `tableAuthSession` + join ke `tableAuthUser`. Untuk halaman dengan banyak asset/gambar, ini menumpuk.

**Fix:** Tambah in-memory cache sederhana untuk session, keyed by token hash, dengan TTL pendek (misal 30 detik). Cukup gunakan `Map<string, {session, expires}>` sederhana.

---

## 4. N+1 Query di Absen Harian — BESAR

**File:** `src/lib/server/absen/load-harian.ts`

Halaman presensi harian menjalankan **8-10 DB queries** per page load:

- 2x count query (pagination + data)
- 3x findMany (jadwal, absensi, murid)
- 2x findFirst (mapel, user mapel)
- Agama query, mapel query

Beberapa query dijalankan berulang untuk data yang sama.

**Fix:**

- Gabungkan count query menjadi satu
- Cache hasil `tableAuthUserMataPelajaran` per user dalam satu request
- Pertimbangkan eager relation untuk mengurangi query terpisah

---

## 5. Query Berulang di Asetmen Formatif — SEDANG

**File:** `src/routes/(input-nilai)/asesmen-formatif/+page.server.ts:99-743`

`tableMataPelajaran.findFirst` dipanggil **4 kali identik** untuk user-type accounts. Selain itu, semua murid di-load dulu (`tableMurid.findMany`), lalu di-paginate di JavaScript, bukan di SQL.

**Fix:**

- Simpan hasil query mapel pertama, re-use untuk 3 pemanggilan berikutnya
- Gunakan `LIMIT` + `OFFSET` di SQL untuk pagination, bukan fetch semua lalu slice di JS

---

## 6. PDF Bulk: Chrome render per-murid — BESAR (untuk cetak rapor)

**File:** `src/lib/server/pdf/pagedpdf.ts:100-346`, `src/routes/api/pdf/bulk/+server.ts`

Bulk rapor memanggil `setContent()` + PagedJS polyfill + `page.pdf()` per murid di loop. Untuk 30 siswa = 30x render Chrome. Logo base64 di-load dari DB tanpa cache (`preview-utils.ts:39-54`). Cache hanya 30 item, 5 menit TTL.

**Fix:**

- Cache logo base64 per sekolah (tidak perlu re-convert tiap murid)
- Pertimbangkan disk-backed cache untuk PDF yang sudah di-generate (keyed by murid+semester+mapel hash)
- Log heavy ini bukan prioritas jika penggunaan cetak batch jarang, tapi perlu diketahui

---

## 7. `runStartupEnsures()` di setiap request — SEDANG

**File:** `src/hooks.server.ts:140`

Meskipun ada guard `ensured` Map, first request setelah restart menjalankan semua `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX` secara sequential. Di HDD ini delay first paint.

**Fix:** Jalankan ensures sekali saat startup server (di `hooks.server.ts` `init` atau di entry point), bukan di request pertama. Atau setidaknya, jalankan di background tanpa menunggu selesai.

---

## 8. Service Worker No-Op — RENDAH

**File:** `static/service-worker.js:9-11`

Service worker tidak melakukan caching apapun. Setiap navigasi refetch semua JS/CSS bundle.

**Fix:** Implement runtime caching untuk JS/CSS/fonts dengan strategy `stale-while-revalidate`. Ini akan mengurangi waktu load halaman berulang, terutama di koneksi lambat.

---

## Prioritas Perbaikan

| #   | Perbaikan                        | Dampak        | Kesulitan              |
| --- | -------------------------------- | ------------- | ---------------------- |
| 1   | `PRAGMA synchronous=NORMAL`      | Sangat Tinggi | Sangat Mudah (1 baris) |
| 2   | Logo cache + `Cache-Control`     | Tinggi        | Mudah                  |
| 3   | In-memory session cache          | Sedang        | Sedang                 |
| 4   | Dedupe query di asetmen formatif | Sedang        | Mudah                  |
| 5   | Fix N+1 di absen harian          | Tinggi        | Sedang                 |
| 6   | PDF bulk cache optimization      | Sedang        | Besar                  |
| 7   | Pindah ensures ke startup        | Sedang        | Mudah                  |
| 8   | Service worker caching           | Rendah        | Sedang                 |

---

## Catatan Tambahan

- Upgrade HDD → SSD akan mengurangi ~60-70% latensi I/O secara keseluruhan, tetapi perbaikan kode di atas tetap berdampak signifikan bahkan di SSD.
- RAM 4GB sangat mepet (47% terpakai). Saat cetak PDF bulk Chrome, risiko OOM meningkat. Pertimbangkan limit concurrent PDF render.
- `BODY_SIZE_LIMIT` default 512K (`hooks.server.ts:377`) — untuk bulk photo import mungkin perlu dinaikkan, tapi hati-hati dengan RAM.
- Tidak ada test framework yang terpasang (vitest/playwright absen), jadi perbaikan perlu diuji manual dengan seksama.
