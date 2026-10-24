# Hasil Audit Keamanan (White-box)

- **Target:** Rapkumer, instance dev lokal `http://localhost:5173`
- **Tanggal:** 31 Aug 2026
- **Metode:** tinjauan sumber + verifikasi manual via curl terhadap instance dev lokal
- **Lingkup:** hanya instance dev lokal, tanpa aksi destruktif. Semua artefak uji (sesi audit, file probe) dibersihkan.

Sesi uji dibuat langsung di DB (admin id=1, wali_kelas id=5), lalu dihapus. Tidak ada endpoint destruktif yang dieksekusi.

---

## [Tinggi] Path traversal + hilangnya pengecekan peran — unggah/hapus piagam-bg

- **Endpoint:** `src/routes/api/sekolah/piagam-bg/[template]/+server.ts`
- **Tipe:** PathTraversal + AuthBypass (escalation)
- **PoC (terverifikasi):** param `template` diinterpolasi mentah ke `filenameFor()` → `sekolah-${id}-piagam-bg-${template}.png` → `path.join(uploadsDir(), ...)` (piagam-bg.server.ts:16-18, 91). GET dengan `%2e%2e%2f%2e%2e` mengembalikan **200** (resolve bersih, bukan 404). wali_kelas non-admin `arum` (id=5) **menimpa** bg: `POST /api/sekolah/piagam-bg/1` dengan same-origin → **200**, file tertulis di uploads.
- **Dampak:** semua pengguna terautentikasi (tidak ada guard peran/izin di handler — `resolveRoutePermission` tidak memetakan apa pun untuk path ini) dapat menulis/menghapus file berekstensi `.png` di sembarang path via traversal `../`; menimpa bg piagam sekolah. Byte body tidak divalidasi (hanya header `content-type: image/png`, mudah dipalsukan).
- **Perbaikan:** allowlist `template` ke `^[12]$`; tambahkan guard admin/kepala_sekolah (selaras penulisan `/sekolah` lain); validasi magic bytes PNG.

---

## [Tinggi] Reload DB tanpa batas peran — DoS

- **Endpoint:** `src/routes/api/internal/db/reload/+server.ts`
- **Tipe:** DoS, AuthBypass (izin hilang)
- **PoC:** `POST /api/internal/db/reload` sebagai `wali_kelas` non-admin `arum` → **200** (`{"success":true}`). `INTERNAL_RELOAD_SECRET` tidak diset → terbuka bagi pengguna login manapun. Me-reload klien DB → error transien / churn koneksi.
- **Perbaikan:** wajib peran admin/kepala_sekolah (bukan sekadar sesi), atau selalu terapkan `INTERNAL_RELOAD_SECRET`.

---

## [Sedang] IDOR / kebocoran data — endpoint debug asesmen

- **Endpoint:** `src/routes/api/debug/asesmen-murid/+server.ts`
- **Tipe:** InfoLeak, escalation
- **PoC:** `GET /api/debug/asesmen-murid?murid_id=1` sebagai `wali_kelas` non-admin → **200**, baris DB mentah untuk murid mana pun. Tanpa pengecekan izin, tanpa filter lingkup (bimbingan/kelas/sekolah).
- **Dampak:** pengguna terautentikasi mana pun membuang seluruh asesmen-sumatif + tujuan semua murid dengan mengiterasi `murid_id`.
- **Perbaikan:** hapus endpoint, atau gate khusus admin dan lingkup ke `event.locals.sekolah`.

---

## [Sedang] Injeksi HTML tersimpan di template PDF — `formatValue` tak di-escape

- **Endpoint:** `src/lib/server/pdf/templates/*.ts` (biodata, cover, jurnal-mengajar, keasramaan, buku-tamu, sppd, piagam)
- **Tipe:** Stored XSS (injection HTML) / tamper data
- **Sumber:** `formatValue()` (shared.ts:79-82) mengembalikan `String(val)` mentah — TANPA escape HTML. Teks pengguna (catatan jurnal, lingkupMateri, tujuan, deskripsi keasramaan, alamat, nama) diinterpolasi langsung ke HTML PDF.
- **Dampak:** HTML/SVG yang disuntikkan tampil di PDF yang diekspor (puppeteer headless, skrip umumnya nonaktif — sehingga terbatas pada pemalsuan konten / tautan eksfiltrasi sumber daya, bukan eksekusi skrip). Dampak dunia nyata rendah tetapi melanggar higiene output-encoding.
- **Perbaikan:** escape HTML semua bidang pengguna di `formatValue`.

---

## [Rendah] Kebocoran info — GET trusted-origins

- **Endpoint:** `src/routes/api/origins/env/+server.ts`
- **Tipe:** InfoLeak
- **PoC:** `GET /api/origins/env` oleh pengguna mana pun → **200** himpunan origin lengkap (termasuk IP LAN).
- **Perbaikan:** batasi GET khusus admin (POST sudah dibatasi).

---

## [Rendah] Header keamanan hilang

- **Endpoint:** semua
- **Tipe:** Config
- **PoC:** `curl -sI :5173/login` → tidak ada `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, `X-Content-Type-Options` (hanya di `/api/ttd`). `csrf` SvelteKit dinonaktifkan (`trustedOrigins: ['*']`).
- **Perbaikan:** tambah CSP + `X-Frame-Options: DENY` + `X-Content-Type-Options: nosniff` via `handle`/header SvelteKit.

---

## [Rendah] Bypass CSRF parsial (JSON) + flag Secure dapat dipalsukan

- **Tipe:** CSRF
- **PoC/sumber:** `csrfGuard` (hooks.server.ts:79-85) hanya memeriksa content-type FORM (`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`). Mutasi JSON melewati CSRF. Dimitigasi cookie `SameSite=Lax` (tidak terkirim pada POST lintas-situs). Flag cookie `secure` diturunkan dari `X-Forwarded-Proto`/`Forwarded`/`Origin` yang dapat dipalsukan (http.ts:22-51) — penyerang dapat memaksa flag `Secure` pada sesi http, merusak sesi tersebut.
- **Perbaikan:** perluas guard pada JSON bila memungkinkan; tolak `X-Forwarded-Proto` yang konflik/hilang (percaya hanya saat di belakang proxy yang diketahui).

---

## Tidak rentan (terverifikasi)

- **SQLi:** semua pemakaian `sql\`...\`` terparameterisasi (param terikat); tidak ada string concat. Probe mengembalikan >400 (aman).
- **XSS ter-render halaman:** `searchQueryMarker` (utils.ts:95) meng-escape target & regex-escape query; `formatScore` hanya numerik; `summaryWithHighlights` meng-escape sumber. Semua `{@html}` di halaman klien aman.
- **storage/browse:** khusus admin (`403` untuk arum). Membaca daftar direktori FS penuh sesuai desain (pemilih folder) — catat sebagai pilihan desain, bukan vuln.
- **pembacaan ttd:** `safeRelPath` (ttd.ts:22-26) menolak `..`/`\`/yang tak cocok. Baik.

---

## Prioritas perbaikan

1. Piagam-bg: allowlist `template` + guard peran.
2. db/reload: guard peran.
3. Hapus/lingkupkan endpoint debug asesmen.
4. Escape `formatValue` untuk PDF.

---

# Perbaikan Diterapkan

Status: **seluruh temuan prioritas + hasil review lanjutan sudah diperbaiki dan diverifikasi** terhadap instance dev lokal.

## 1. Piagam-bg — allowlist template + guard peran

- **File:** `src/lib/components/piagam-bg.server.ts`
- `resolveTemplate()` membatasi `template` ke himpunan `{ '1', '2' }` → netralkan traversal `../` pada semua metode (GET/POST/DELETE). `template` tak valid → layani statik default / balas 400.
- `canMutate()` via `isAuthorizedUser(['informasi_umum_sekolah'])` pada POST & DELETE (admin/kepala_sekolah otomatis lolos; wali_kelas/wali_asuh tanpa izin → 403). GET tetap terbuka (fetch gambar oleh peran manapun).
- Perbaikan lanjutan (review): `staticFile` kini `async`/`await` dalam `try/catch` → berkas statik hilang mengembalikan **404**, bukan 500 (catch sebelumnya wadah tak berguna).
- **Verifikasi:** POST wali_kelas → 403 (sebelum 200); GET traversal → 200 statik (tak lagi melarikan diri); admin POST → 200 (fungsi normal).

## 2. db/reload — guard peran

- **File:** `src/routes/api/internal/db/reload/+server.ts`
- Gate `locals.user?.type === 'admin' | 'kepala_sekolah'` _sebelum_ pemeriksaan `INTERNAL_RELOAD_SECRET` (auth dulu, lalu secret). Non-admin → 403.
- **Verifikasi:** `POST /api/internal/db/reload` wali_kelas → 403 (sebelum 200). Admin → tetap dapat.

## 3. Endpoint debug asesmen — dihapus

- **File:** `src/routes/api/debug/asesmen-murid/+server.ts` (route dihapus).
- Tidak ada referensi tersisa di repo.
- **Verifikasi:** `GET /api/debug/asesmen-murid` → 404.

## 4. Stored HTML-injection di PDF — escape teks pengguna

- **File:** `src/lib/server/pdf/templates/shared.ts`
  - `escHtml()` baru: escape `& < > " '`.
  - `formatValue()` memakai `escHtml` (sebelumnya `String(val)` mentah).
- **Perbaikan lanjutan (review):** `formatUpper()` diubah agar _uppercase dulu, kemudian escape_ — mencegah entitas `&amp;` termanfaat sebagai `&AMP;` yang tampil literal. (Bug ditemukan saat review; sebelumnya mangled nama/skolah berisi `&`.)
- Diterapkan konsisten ke seluruh template PDF untuk bidang pengguna:
  - `piagam.ts`: `alamatLine`, `contactLine`, `schoolHeadingText`, `kopLines`, `achievementText`, `murid.nama`, `ttd.tempat/tanggal`, `ttd.kepalaSekolah.nip`, `ttd.waliKelas.nip`, `penghargaan.judul/subjudul/motivasi`.
  - `sppd.ts`: `alamatLine`, `contactLine`, `schoolHeadingText`, `kopLines`.
  - `rapor.ts`: `sekolah.alamat`, `rombel.fase/nama`, `periode.semester/tahunPelajaran`, `item.mataPelajaran`, `ekstrakurikuler.nama`, `tanggapanOrangTua`, `waliKelas.nama/nip`, `kepalaSekolah.nama/nip`, `ttd.tempat/tanggal`.
  - `keasramaan.ts`: `periode.tahunAjaran` (nama/nip lain via `formatValue` sudah aman).
  - `bukti-foto.ts`: `kegiatan`, `foto.nama` (teks + atribut `alt`).
  - `presensi-guru.ts`: `kepalaNama`, `kepalaNip`.
- Catatan: watermark CSS `content` (`rapor`, `keasramaan`) yang memuat nama rombel/murid sengaja **tidak** di-escape — konteks CSS, risiko rendah, admin-triggered.

## 5. origins GET — batasi admin

- **File:** `src/routes/api/origins/env/+server.ts`
- `GET` kini memakai guard `isAdmin` (selaras POST). Himpunan origin hanya tampil untuk admin/kepala_sekolah.
- **Verifikasi:** GET wali_kelas → 403 (sebelum 200), admin → 200.

## Verifikasi teknis

- `eslint` & `prettier --check`: bersih pada semua file yang diubah.
- `pnpm check`: 3 error yang tersisa **pra-ada** di `(input-nilai)/asesmen-sumatif/+page.server.ts` (`maybeUser` possible undefined) — file tidak tersentuh perubahan ini.
- Artefak uji (sesi audit + file probe) dibersihkan setelah verifikasi.
