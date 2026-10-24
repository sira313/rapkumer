# REPORT.md — Analisis Cara Kerja e-Rapor SMK v8

> Laporan ini merangkum cara kerja proyek dengan fokus pada tiga alur utama:
>
> 1. Penarikan data dari Dapodik
> 2. Pengisian nilai oleh guru
> 3. Pengiriman nilai kembali ke Dapodik
>
> Semua klaim diverifikasi langsung dari kode sumber (referensi file disertakan).
>
> **Catatan untuk reuse di project lain:** satu-satunya antarmuka yang berdiri sendiri dan dapat
> direplikasi tanpa infrastruktur e-Rapor adalah **GET/POST langsung ke WebService aplikasi Dapodik
> desktop sekolah** (Bagian 4.1 — spesifikasi kontrak lengkapnya ada di **Bagian 4.1a**, autentikasi
> di **Bagian 5.2**). Jalur Synchronizer (`sync.erapor-smk.net`) dan Dashboard pusat
> (`app.erapor-smk.net`) adalah layanan pihak ketiga milik e-Rapor SMK dan TIDAK relevan untuk
> reimplementasi mandiri. Peta data minimum + endpoint yang perlu diverifikasi sendiri: **Bagian 7**.

---

## 1. Gambaran Umum Arsitektur

| Komponen              | Teknologi                                                                    | Keterangan                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Backend API           | Laravel 11 (`app/Http/Controllers`, `routes/api.php`)                        | Semua endpoint JSON, diamankan Sanctum token                                                                      |
| Frontend SPA          | Vue 3 + Vuetify 3 (Vuexy) di `resources/js`                                  | File-based routing di `resources/js/pages`                                                                        |
| Database              | PostgreSQL                                                                   | Termasuk beberapa **view** hasil migrasi (`*_view.php`) untuk agregasi nilai                                      |
| Auth & Role           | Sanctum + Laratrust                                                          | Role: `admin`, `guru`, `wali` (wali kelas), `siswa`, `kaprog`, `waka`, `tu`, `pembimbing`, `pembina_ekskul`, dll. |
| PDF Rapor             | laravel-mpdf via `routes/web.php` prefix `/cetak/*`                          |                                                                                                                   |
| Excel template/import | maatwebsite/excel via `/downloads/*` dan `PenilaianController::upload_nilai` |                                                                                                                   |

### Konsep kunci: e-Rapor TIDAK berkomunikasi langsung dengan server Pusat Data (PUSDATIN)

Semua trafik ke/ dari ekosistem Dapodik melewati dua server perantara milik e-Rapor SMK
(dikonfigurasi di `config/erapor.php`):

```
config('erapor.api_url')       = http://sync.erapor-smk.net/api/v8/dapodik/   → "Synchronizer" (jembatan ke Server Direktorat/Dapodik)
config('erapor.dashboard_url') = http://app.erapor-smk.net/api/               → "Dashboard" (server pusat e-Rapor)
```

- Helper `http_client()` (`app/Helpers/functions.php:50`) — request **keluar** ke Synchronizer,
  membawa header `x-api-key` berisi `sekolah_id`.
- Helper `http_dashboard()` (`functions.php`) — request **keluar** ke Dashboard untuk pengiriman data.
- Endpoint masuk `POST /api/sinkronisasi/synchronizer` (`routes/api.php:34`) — dipakai aplikasi eksternal
  **Synchronizer v2** mendorong data _ke dalam_ e-Rapor; diautentikasi middleware `auth.apikey`
  (`app/Http/Middleware/ApiKeyMiddleware.php`: header `X-Api-Key` harus cocok dengan `sekolah_id` yang terdaftar).

Selain itu ada jalur ketiga yang **langsung** ke WebService aplikasi Dapodik desktop yang terpasang di
komputer sekolah (dijelaskan di Bagian 4).

---

## 2. Cara Menarik Data dari Dapodik

Ada **dua mekanisme** penarikan data:

### 2.1 Jalur aktif: aplikasi Synchronizer v2 (mendorong data ke e-Rapor)

Penarikan lewat web e-Rapor telah **ditutup** — lihat `SinkronisasiController::data_dapodik()`
(`app/Http/Controllers/SinkronisasiController.php:166`): endpoint selalu mengembalikan pesan
_"Pengambilan Dapodik ditutup. Proses Pengambilan Dapodik hanya melalui aplikasi Synchronizer v.2"_.

Alur kerjanya:

```
┌───────────────┐   1. tarik    ┌──────────────────────────┐   2. dorong (POST /api/sinkronisasi/synchronizer,
│ Server Pusdatin│ ───────────► │ Aplikasi Synchronizer v2 │      header X-Api-Key = sekolah_id)
│  (Dapodik)     │              │ (terpasang di komputer   │ ────────────────────────────────────────────► e-Rapor SMK
└───────────────┘               │  sekolah)                │        payload terenkripsi (prepare_receive)
                                └──────────────────────────┘
```

- Handler penerima: `SinkronisasiController::synchronizer()` (`SinkronisasiController.php:755`).
  Payload didekripsi dengan `prepare_receive()`, lalu tiap item dipetakan ke fungsi global
  `simpan_{table}()` di `app/Helpers/functions.php` (ada untuk: `ptk`, `rombongan_belajar`,
  `mapel`, `pembelajaran`, `anggota_rombel`, `pd_keluar`, `peserta_didik_aktif`, `pd`, `ekskul`,
  `anggota_ekskul`, `dudi`, `anggota_matpil`, `cek_sekolah`, dst).
- Registrasi awal sekolah juga datang dari Synchronizer melalui `POST /api/sinkronisasi/register`
  → `create_user()` membuat data `sekolah` + user `admin` pertama (password diambil apa adanya dari
  payload Synchronizer) (`SinkronisasiController.php:770-906`).

### 2.2 Jalur artisan: `php artisan sinkron:dapodik`

Perintah konsol `app/Console/Commands/Dapodik.php` menarik data **melalui server Synchronizer**
(`http_client($satuan, $data_sync)`):

- Payload autentikasi yang dikirim: `username_dapo` (email admin), `password_dapo` (**hash password**
  akun admin lokal dikirim ke server synchronizer sebagai kredensial pembanding Dapodik), `npsn`,
  `tahun_ajaran_id`, `semester_id`, `sekolah_id` (`Dapodik.php:201-211`).
- **Jendela waktu sinkronisasi**: hanya boleh antara **pukul 03.00–24.00 WIB**. Fungsi `jam_sinkron()`
  memblokir jam 00.00–03.00 karena rutinitas sinkronisasi PUSDATIN ↔ Direktorat SMK (`Dapodik.php:57-62`).
- Respons dapat berupa paginator (`current_page`/`last_page`) — command otomatis mengulang request
  halaman demi halaman (`proses_data()`, `Dapodik.php:234-251`).
- Progres ditulis ke file `storage/public/proses_sync_{sekolah_id}.json` dan dipantau UI lewat
  endpoint `GET /api/sinkronisasi/hitung/{sekolah_id}`.
- Versi CLI interaktif meminta email admin lalu menampilkan pilihan data; versi terpanggil dari web
  (`POST /api/sinkronisasi/dapodik` → `Artisan::call('sinkron:dapodik', ...)`) menyertakan argumen
  `satuan`, `akses=1`, `sekolah_id`, `semester_id`.

### 2.3 Jenis data yang dapat ditarik

Didefinisikan di `Dapodik.php:70-84` (`$general` + `$smk`) dan labelnya di `get_table()` (`Dapodik.php:156-182`).
Data SMK-specific (`dudi`) hanya untuk `bentuk_pendidikan_id = 15` (SMK).

**A. Data referensi (nasional):**

| Kode satuan      | Data                                                            | Fungsi penyimpan                       |
| ---------------- | --------------------------------------------------------------- | -------------------------------------- |
| `wilayah`        | Referensi wilayah (desa→kecamatan→kabupaten→provinsi, rekursif) | `simpan_wilayah` / `proses_wilayah`    |
| `jurusan`        | Referensi jurusan/kompetensi keahlian                           | `simpan_jurusan`                       |
| `kurikulum`      | Referensi kurikulum                                             | `simpan_kurikulum`                     |
| `mata_pelajaran` | Referensi mata pelajaran                                        | `insert_mata_pelajaran`/`simpan_mapel` |
| `kd`             | Referensi Kompetensi Dasar (Kurikulum 2013)                     | `simpan_kd`                            |
| `cp`             | Referensi Capaian Pembelajaran (Kurikulum Merdeka)              | `simpan_cp`                            |

**B. Data satuan pendidikan (per sekolah, per semester):**

| Kode satuan              | Data                                                              | Catatan                                                                   |
| ------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `sekolah`                | Profil sekolah + kepala sekolah + jurusan SP                      | `simpan_sekolah`; set `sinkron=1`                                         |
| `ptk`                    | Guru/PTK (identitas, NUPTK/NIP, jabatan, tugas tambahan)          | `simpan_ptk`; PTK yang hilang dimasukkan ke `ptk_keluar`                  |
| `rombongan_belajar`      | Rombel reguler (jenis_rombel 1) & rombel mapel pilihan (16)       | `simpan_rombongan_belajar`; rombel yang tidak ada lagi di Dapodik dihapus |
| `peserta_didik_aktif`    | Siswa aktif + rombel induknya                                     | `simpan_peserta_didik_aktif` → `simpan_pd`                                |
| `peserta_didik_keluar`   | Siswa keluar                                                      | `simpan_peserta_didik_keluar` → tabel `pd_keluar`                         |
| `anggota_rombel_pilihan` | Anggota rombel mapel pilihan                                      | `simpan_anggota_rombel_pilihan`                                           |
| `pembelajaran`           | Pembelajaran (guru pengampu × rombel × mapel), termasuk sub-mapel | `simpan_pembelajaran` (rekursif untuk `sub_mapel`)                        |
| `ekstrakurikuler`        | Ekskul + pembina                                                  | `simpan_ekstrakurikuler`                                                  |
| `anggota_ekskul`         | Anggota ekskul (jenis_rombel 51)                                  | `simpan_anggota_ekskul`                                                   |
| `dudi`                   | DUDI + MoU + AKT PD (siswa magang) + Bimbing PD                   | `simpan_dudi` (hanya SMK)                                                 |

**C. Pola penting saat penyimpanan:**

- Semua insert memakai `updateOrCreate` (sering `withTrashed()`) dengan **primary key asli Dapodik**
  (`peserta_didik_id`, `rombongan_belajar_id`, dst.) sehingga idempotent dan bisa diulang.
- Kolom `last_sync` sengaja diisi mundur (`Carbon::now()->subDays(30)`) agar baris baru tetap
  terdeteksi "belum terkirim" oleh mekanisme pengiriman incremental (Bagian 4.3).
- Data rombel/pembelajaran/ekskul yang **tidak ada lagi** di Dapodik akan dihapus dari e-Rapor
  (query `whereNotIn(...)->delete()` di akhir tiap fungsi simpan).

---

## 3. Cara Guru Mengisi Nilai

### 3.1 Prasyarat

Sebelum penilaian bisa dilakukan:

1. Admin sinkronisasi Dapodik (Bagian 2) sehingga tersedia data **rombongan belajar**, **pembelajaran**
   (pengampu mapel), dan **anggota rombel**.
2. Guru login (role `guru`); sistem hanya menampilkan pembelajaran tempat ia terdaftar sebagai
   `guru_id`/`guru_pengajar_id` (filter di `PenilaianController::kondisiPembelajaran()`, `PenilaianController.php:349-368`).
3. Mode kurikulum menentukan bentuk penilaian:
   - **Kurikulum Merdeka**: unit penilaian = **TP (Tujuan Pembelajaran)** terkait CP; `kompetensi_id = 4`.
   - **Kurikulum 2013 (K13)**: unit penilaian = **KD (Kompetensi Dasar)**; `kompetensi_id = 1`.
   - Mapel Muatan Lokal/PKL `800001000` dan sub-mapel punya perlakuan khusus (`kompetensi_id = 99` untuk induk sub-mapel).

### 3.2 Jenis penilaian & endpoint

Semua lewat grup route `penilaian/*` (`routes/api.php:141-148`), controller `PenilaianController`.
Satu endpoint serbaguna `POST /penilaian/simpan` menerima parameter `opsi`:

| `opsi`                   | Yang diisi guru                                            | Model tujuan                   | Keterangan                                                   |
| ------------------------ | ---------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------ |
| `sumatif-lingkup-materi` | Nilai per siswa **per TP/KD** (0–100)                      | `NilaiTp`                      | Grid siswa × TP; nilai kosong (<0 atau >100) menghapus baris |
| `sumatif-akhir-semester` | Nilai sumatif akhir semester (tes & non-tes)               | `NilaiSumatif`                 | Dibedakan kolom `jenis`                                      |
| `nilai-akhir`            | Nilai akhir rapor per siswa + tanda TP kompeten/inkompeten | `NilaiAkhir` + `TpNilai`       | `kompetensi_id` 1 (K13) / 4 (Merdeka) / 99 (induk sub-mapel) |
| `capaian-kompetensi`     | Deskripsi capaian (teks kompeten & inkompeten)             | `DeskripsiMataPelajaran`       | Deskripsi otomatis/ manual per siswa                         |
| `reset-kompetensi`       | —                                                          | hapus `DeskripsiMataPelajaran` | Reset deskripsi satu pembelajaran                            |
| `nilai-sikap`            | Sikap/budaya kerja: tanggal, dimensi, elemen, opsi, uraian | `NilaiBudayaKerja`             | Dipakai rapor P5/sikap                                       |
| `nilai-ekskul`           | Nilai + deskripsi ekskul per siswa                         | `NilaiEkstrakurikuler`         |                                                              |

Endpoint pembaca data: `get-cp` (daftar siswa + TP), `get-nilai-akhir`, `get-capaian-kompetensi`,
`nilai-sikap/{id?}`. Penghapusan: `destroy` (nilai sikap/ekskul).

Halaman frontend pemakai: `resources/js/pages/nilai-akademik/{asesmen-sumatif,capaian-kompetensi,nilai-akhir,ekstrakurikuler,nilai-sikap}.vue`.

### 3.3 Perhitungan nilai akhir (bobot)

`get_nilai_akhir()` (`PenilaianController.php:369-481`) menghitung usulan nilai akhir secara otomatis:

```
nilai_sumatif_materi  = rata-rata NilaiTp siswa (avg 'nilai')
nilai_sumatif_semester= NilaiSumatif jenis akhir semester
nilai_asesmen = (bobot_sumatif_materi × NSM / total_bobot) + (bobot_sumatif_akhir × NAS / total_bobot)
```

Bobot diambil dari kolom `bobot_sumatif_materi` & `bobot_sumatif_akhir` pada tabel `pembelajaran`
(diatur admin/guru lewat endpoint `referensi/bobot-penilaian`). Guru tetap bisa menimpa nilai akhir manual.

### 3.4 Import Excel

Guru dapat mengunggah nilai massal via `POST /penilaian/upload-nilai` (`upload_nilai()`,
`PenilaianController.php:577-655`):

- Template resmi diunduh dari `routes/web.php` prefix `/downloads/template-*`
  (template TP, sumatif lingkup materi, sumatif akhir semester, nilai akhir, leger).
- Import class di `app/Imports/` (`NilaiSumatifLingkupMateri`, `NilaiSumatifAkhirSemester`, `NilaiAkhirImport`).
- Hasil parse dikonversi menjadi struktur sama seperti input manual lalu disimpan lewat logika `simpan()`.

### 3.5 Generate otomatis & penilaian lain

- `POST /dashboard/generate-nilai` (`DashboardController::generate_nilai`) — membangkitkan
  `NilaiAkhir`, `DeskripsiMataPelajaran`, dan `Absensi` otomatis, misalnya untuk mapel PKL
  (`800001000`) dari data `nilai_pkl` + rekap `absensi_pkl`, atau nilai induk dari sub-mapel.
- Modul penilaian lain di luar mapel: **UKK** (`UkkController`), **Projek P5** (`ProjekController`),
  **PKL/Prakerin** (`PklController`), dan **wali kelas** (`WalasController`: absensi, catatan wali,
  nilai sikap, kenaikan kelas, rapor PTS).

Setiap penyimpanan nilai menandai `last_sync = now()` (atau backdated) — inilah penanda bahwa baris
tersebut **menunggu dikirim** ke server pusat (Bagian 4.3).

---

## 4. Cara Mengirim Nilai Kembali ke Dapodik

Terdapat **dua alur pengiriman** yang berbeda tujuan:

### 4.1 Alur A — Kirim nilai ke WebService Dapodik lokal (desktop)

Tujuan: memasukkan nilai akhir mata evaluasi ke **aplikasi Dapodik yang terinstal di komputer sekolah**
melalui WebService-nya. Halaman UI: `resources/js/pages/sinkronisasi/kirim-nilai-dapodik.vue`;
logika backend di `SinkronisasiController` (metode `cek_koneksi`, `matev_rapor`, `kirim_nilai`).

**Langkah konfigurasi (sekali):**

1. Admin mengisi **URL Dapodik** (mis. `http://localhost:5774/WebService` — server lokal Dapodik) dan
   **Token Dapodik** (token WebService dari aplikasi Dapodik).
2. `POST /sinkronisasi/cek-koneksi` menguji koneksi:
   `GET {url_dapodik}/WebService/getSekolah?npsn={npsn}&semester_id={sem}` dengan header token.
   Jika sukses, URL & token disimpan ke tabel `settings` (`key = url_dapodik`, `token_dapodik`)
   (`SinkronisasiController.php:679-754`).

**Langkah sinkronisasi mata evaluasi (matev):**

3. `POST /sinkronisasi/matev-rapor` mengambil daftar _mata evaluasi_ dari Dapodik:
   helper `getMatev()` → `GET {url_dapodik}/WebService/getMatevNilai?...&a_dari_template=1`
   (`functions.php`). Hasil disimpan ke tabel `dapodik.matev_rapor` (schema khusus `dapodik`).
   Mata evaluasi yang belum ada di Dapodik digenerate otomatis dari daftar `pembelajaran`
   (`createMatev()`), satu matev per mapel.

**Langkah pengiriman nilai:**

4. `POST /sinkronisasi/kirim-nilai` (`SinkronisasiController.php:477-568`) melakukan:
   - Ambil `updater_id` (ID pengguna Dapodik) via `GET /WebService/getPengguna` — dicocokkan dari
     email pengguna e-Rapor (`getUpdaterID()`, `functions.php`).
   - Untuk setiap `MatevRapor` milik rombel terpilih:
     `POST {url_dapodik}/WebService/postMatevRapor?npsn=...&semester_id=...` (payload matev).
     Jika sukses → `status = 1` (tanda sudah terkirim).
   - Untuk setiap siswa pada pembelajaran tersebut, ambil nilai akhir
     (`all_nilai_akhir_pengetahuan` untuk K13, atau `all_nilai_akhir_kurmer` untuk Merdeka) lalu kirim
     satu-per-satu: `POST {url_dapodik}/WebService/postNilai?...&table=rapor` dengan field
     `nilai_id`, `id_evaluasi`, `anggota_rombel_id`, `nilai_kognitif_angka`.
   - Timestamp payload dimanipulasi agar diterima Dapodik (mis. `last_update = now()+6 jam`,
     `last_sync` offset UTC) — meniru perilaku sinkronisasi resmi Dapodik.

Ringkasan endpoint WebService Dapodik yang dipakai — **semuanya WAJIB membawa Bearer token**
(`Authorization: Bearer {token_dapodik}`) pada setiap request GET maupun POST:

| Endpoint WebService       | HTTP | Auth           | Fungsi                        |
| ------------------------- | ---- | -------------- | ----------------------------- |
| `getSekolah`              | GET  | Bearer (wajib) | uji koneksi & validasi token  |
| `getPengguna`             | GET  | Bearer (wajib) | cari `pengguna_id` (updater)  |
| `getMatevNilai`           | GET  | Bearer (wajib) | daftar mata evaluasi existing |
| `postMatevRapor`          | POST | Bearer (wajib) | buat/perbarui mata evaluasi   |
| `postNilai` (table=rapor) | POST | Bearer (wajib) | kirim nilai akhir per siswa   |

Detail implementasi header di kode (Laravel HTTP client — `withToken()` memancarkan
`Authorization: Bearer <token>` secara default):

- `cek_koneksi()`: `Http::withToken(request()->token_dapodik)->retry(3, 100)->get({url}/WebService/getSekolah?npsn=...&semester_id=...)`
  (`SinkronisasiController.php:693`).
- `nilai_dapodik()`: pola sama dengan `retry(3, 100)` (`SinkronisasiController.php:655`).
- `getMatev()`: `Http::withToken(get_setting('token_dapodik', $sekolah_id))->get(.../WebService/getMatevNilai?...)` (`functions.php`).
- `getUpdaterID()`: `Http::withToken(get_setting('token_dapodik', $sekolah_id))->get(.../WebService/getPengguna?...)` (`functions.php`).
- `kirim_nilai()`: `Http::withToken(request()->token_dapodik)->post(.../WebService/postMatevRapor?...)`
  dan `->post(.../WebService/postNilai?...&table=rapor, $param)` (`SinkronisasiController.php:497,538`).

### 4.1a Spesifikasi kontrak lengkap endpoint WebService Dapodik

> Kontrak ini diekstrak langsung dari pemanggilan di kode dan siap dipakai sebagai acuan
> reimplementasi klien HTTP apa pun (tidak terikat Laravel). Notasi `{base}` = `url_dapodik`,
> contoh dari kode/UI: `http://localhost:5774/WebService` (port menyesuaikan instalasi Dapodik
> desktop sekolah).

**Prasyarat umum semua endpoint:**

| Aspek              | Nilai                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| Header wajib       | `Authorization: Bearer {token_dapodik}` (token statis dari menu _Web Service_ aplikasi Dapodik desktop) |
| Query params wajib | `npsn` (NPSN sekolah) dan `semester_id` (format Dapodik, mis. `20251`) pada **semua** call              |
| Format body        | JSON (`Content-Type: application/json`) untuk semua POST                                                |
| Respons sukses     | HTTP 200 + objek JSON; operasi tulis ditandai field boolean `success`                                   |

---

**1. GET `getSekolah` — probe koneksi & validasi token**

```
GET {base}/WebService/getSekolah?npsn={npsn}&semester_id={semester_id}
Authorization: Bearer {token_dapodik}
```

- Tujuan: memverifikasi bahwa pasangan URL+token valid sebelum dipakai.
- Respons: objek JSON profil sekolah. Perilaku parsing defensif di kode
  (`SinkronisasiController.php:655-677`): jika body bukan JSON murni, isi diekstrak antara karakter
  `{` pertama dan `}` terakhir (`get_string_between`). Field `success=false` + `message` berarti
  token/parameter ditolak.

**2. GET `getPengguna` — resolusi identitas updater**

```
GET {base}/WebService/getPengguna?npsn={npsn}&semester_id={semester_id}
Authorization: Bearer {token_dapodik}
```

- Respons: `{ "rows": [ { "username": "...", "pengguna_id": "...", ... }, ... ] }`
- Konsumsi di kode (`getUpdaterID()`, `functions.php`): cari baris dengan
  `username == email pengguna e-Rapor` → ambil `pengguna_id` untuk dipakai sebagai field
  `updater_id` pada seluruh POST berikutnya. Jika email tidak ditemukan → `updater_id = null`
  (exception ditelan, proses tetap jalan tanpa updater).

**3. GET `getMatevNilai` — baca daftar mata evaluasi existing**

```
GET {base}/WebService/getMatevNilai?npsn={npsn}&semester_id={semester_id}&a_dari_template=1
Authorization: Bearer {token_dapodik}
```

- Parameter tambahan: `a_dari_template=1` (hanya matev buatan template).
- Respons: `{ "rows": [ { "id_evaluasi", "rombongan_belajar_id", "mata_pelajaran_id",
"pembelajaran_id", "nm_mata_evaluasi", "a_dari_template", "no_urut", "create_date",
"last_update", "soft_delete", "last_sync", "updater_id" }, ... ] }`
- Konsumsi: disimpan ke tabel lokal `dapodik.matev_rapor`; matev yang belum ada digenerate lokal
  (satu per pembelajaran/mapel) sebelum dikirim balik lewat `postMatevRapor`.

**4. POST `postMatevRapor` — tulis/perbarui mata evaluasi (satu request per matev)**

```
POST {base}/WebService/postMatevRapor?npsn={npsn}&semester_id={semester_id}
Authorization: Bearer {token_dapodik}
Content-Type: application/json
```

Body (field persis dari `kirim_nilai()`, `SinkronisasiController.php:489-497`):

```jsonc
{
	"id_evaluasi": "<uuid dari Dapodik / generate lokal>",
	"rombongan_belajar_id": "<uuid rombel Dapodik>",
	"mata_pelajaran_id": "<id mapel Dapodik>",
	"pembelajaran_id": "<uuid pembelajaran>",
	"nm_mata_evaluasi": "<nama mapel, max 40 karakter (Str::limit)>",
	"a_dari_template": 1,
	"no_urut": "<nomor urut mapel>",
	"create_date": "<timestamp>",
	"last_update": "<now() + 6 jam>", // offset disengaja, lihat catatan timezone
	"soft_delete": 0,
	"last_sync": "<now() + 330 menit>", // offset disengaja
	"updater_id": "<pengguna_id hasil getPengguna>"
}
```

- Respons: `{ "success": true|false, ... }`. Jika `true` → status lokal matev diset `1`
  (sudah terkirim) dan nilai siswanya boleh dikirim.
- Catatan timezone: offset `last_update`/`last_sync` dimanipulasi secara eksplisit agar diterima
  logika sinkronisasi Dapodik (meniru timestamp yang dibuat klien resmi Dapodik). Reimplementasi
  harus menyalin perilaku ini atau mengujinya terhadap versi Dapodik target.

**5. POST `postNilai` — kirim nilai akhir per siswa (satu request per baris nilai)**

```
POST {base}/WebService/postNilai?npsn={npsn}&semester_id={semester_id}&table=rapor
Authorization: Bearer {token_dapodik}
Content-Type: application/json
```

Body (field persis dari `kirim_nilai()`, `SinkronisasiController.php:503-545`):

```jsonc
{
	"nilai_id": "<nilai_akhir_id lokal>",
	"id_evaluasi": "<id matev yang baru saja sukses di-post>",
	"anggota_rombel_id": "<uuid anggota rombel Dapodik (identitas siswa dalam rombel)>",
	"nilai_kognitif_angka": "<angka nilai akhir 0–100>",
	"create_date": "<now() UTC - 1 jam>",
	"last_update": "<now() UTC>",
	"soft_delete": 0,
	"last_sync": "<now() UTC - 30 menit>",
	"updater_id": "<pengguna_id>"
}
```

- Sumber data nilai: relasi `all_nilai_akhir_pengetahuan` (K13) atau `all_nilai_akhir_kurmer`
  (Kurikulum Merdeka) pada pembelajaran terkait.
- Respons: `{ "success": true|false, ... }`; hanya respons `success=true` yang dihitung sebagai
  terkirim. Item gagal dilewati diam-diam (tidak ada retry, tidak ada error per-baris).
- Field opsional yang dinonaktifkan di kode (dikomentari): `ket_kognitif` (deskripsi teks),
  `a_beku`.

---

**Urutan panggilan yang benar (state machine):**

```
getSekolah (validasi)
   └─► getPengguna (dapat updater_id)
          └─► getMatevNilai (sinkronkan daftar matev; generate yang kurang)
                 └─► postMatevRapor (per matev; wajib sukses dulu)
                        └─► postNilai (per siswa per nilai akhir)
```

`postNilai` hanya dilakukan untuk matev yang `postMatevRapor`-nya sukses (`success=true`),
karena `id_evaluasi` pada body postNilai merujuk matev tersebut.

### 4.1b Analisis komposisi data yang dikirim (sinkron matev & kirim nilai)

> Sumber analisis: `SinkronisasiController::kirim_nilai()` (`SinkronisasiController.php:477-568`),
> skema `dapodik.matev_rapor` (`2023_06_09_084422_create_matev_rapor_table.php`),
> relasi `Pembelajaran::all_nilai_akhir_pengetahuan/kurmer` (`app/Models/Pembelajaran.php:31-35`),
> dan skema tabel `nilai_akhir` (`2019_09_30_170324_create_nilai_akhir_table.php`).

**Lingkup pengiriman:** satu operasi `kirim-nilai` menargetkan **satu rombongan belajar**
(`request()->rombongan_belajar_id`). Yang dikirim adalah (1) **seluruh** baris `dapodik.matev_rapor`
milik rombel tersebut (tanpa filter status), lalu (2) **nilai akhir setiap siswa** untuk pembelajaran
yang terhubung ke matev yang berhasil dikirim.

#### A. Payload `postMatevRapor` — dari mana tiap field berasal

Body dibangun dari `$matev->toArray()` (**seluruh kolom** `dapodik.matev_rapor`) dikurangi dua key,
lalu dioverride empat field (`SinkronisasiController.php:489-496`):

| Field                  | Tipe              | Asal data                                                                          | Perlakuan saat dikirim              |
| ---------------------- | ----------------- | ---------------------------------------------------------------------------------- | ----------------------------------- |
| `id_evaluasi`          | uuid (PK)         | Primary key matev; untuk matev baru digenerate lokal (`HasUuids`)                  | apa adanya                          |
| `nm_mata_evaluasi`     | varchar(50)       | Nama mapel (di-generate `Str::limit(...,40)` saat create)                          | **dipotong ulang ke 40 karakter**   |
| `a_dari_template`      | numeric(1)        | Selalu `1` (matev buatan template)                                                 | apa adanya                          |
| `no_urut`              | numeric(3)        | Nomor urut mapel pada pembelajaran                                                 | apa adanya                          |
| `kkm_kognitif`         | numeric(5,2) null | Kolom opsional (tidak diisi oleh alur ini)                                         | apa adanya (null)                   |
| `kkm_psikomotorik`     | numeric(5,2) null | Kolom opsional                                                                     | apa adanya (null)                   |
| `rombongan_belajar_id` | uuid              | ID rombel **milik Dapodik** (FK ke `rombongan_belajar`)                            | apa adanya                          |
| `mata_pelajaran_id`    | integer           | ID referensi mapel Dapodik (FK `ref.mata_pelajaran`)                               | apa adanya                          |
| `pembelajaran_id`      | uuid null         | FK ke pembelajaran e-Rapor                                                         | apa adanya                          |
| `create_date`          | timestamp         | Waktu matev dibuat lokal (CREATED_AT)                                              | apa adanya                          |
| `last_update`          | timestamp         | UPDATED_AT                                                                         | **dioverride**: `now() + 6 jam`     |
| `soft_delete`          | numeric(1)        | Flag hapus                                                                         | apa adanya (0)                      |
| `last_sync`            | timestamp         | —                                                                                  | **dioverride**: `now() + 330 menit` |
| `updater_id`           | uuid              | **Hasil GET `getPengguna`** (`pengguna_id` Dapodik milik akun yang emailnya cocok) | **dioverride**                      |
| ~~`status`~~           | smallint          | Flag internal e-Rapor ("sudah terkirim")                                           | **dibuang** dari payload (`unset`)  |
| ~~`pembelajaran`~~     | relasi            | Hasil eager-load (nested array)                                                    | **dibuang** dari payload (`unset`)  |

#### B. Payload `postNilai` — dari mana tiap field berasal

Sumber baris: tabel `nilai_akhir` (model `NilaiAkhir`) melalui relasi
`Pembelajaran::all_nilai_akhir_pengetahuan` (**filter `kompetensi_id = 1`, K13**) atau
`all_nilai_akhir_kurmer` (**filter `kompetensi_id = 4`, Kurikulum Merdeka**) — dipilih salah satu:
jika K13 punya baris, Merdeka diabaikan, dan sebaliknya. Satu request per baris nilai per siswa:

| Field                  | Asal data                                                           | Arti bagi Dapodik                                        |
| ---------------------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| `nilai_id`             | `nilai_akhir.nilai_akhir_id` (PK lokal e-Rapor)                     | identitas unik baris nilai (idempotency di sisi Dapodik) |
| `id_evaluasi`          | `matev_rapor.id_evaluasi` milik mapel yang baru saja sukses di-post | mengaitkan nilai ke mata evaluasi                        |
| `anggota_rombel_id`    | `nilai_akhir.anggota_rombel_id` — **UUID Dapodik**, bukan NISN/nama | identitas siswa dalam rombel                             |
| `nilai_kognitif_angka` | `nilai_akhir.nilai` (integer 0–100)                                 | nilai akhir kognitif rapor                               |
| `create_date`          | `now()` UTC − 1 jam                                                 | timestamp buatan (meniru klien resmi)                    |
| `last_update`          | `now()` UTC                                                         | timestamp buatan                                         |
| `soft_delete`          | literal `0`                                                         | —                                                        |
| `last_sync`            | `now()` UTC − 30 menit                                              | timestamp buatan                                         |
| `updater_id`           | `pengguna_id` hasil `getPengguna`                                   | penanda siapa yang mengubah                              |

#### C. Data yang ADA di sistem tetapi TIDAK dikirim ke Dapodik

Penting untuk reimplementasi — hanya **dua jenis entitas** yang benar-benar dikirim:

| Data                                                                                                                                                         | Status                                                                                             | Bukti di kode                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deskripsi capaian kompetensi (`DeskripsiMataPelajaran`, teks kompeten/inkompeten)                                                                            | **Di-eager-load tapi tidak pernah dipakai** dalam payload; tidak ada endpoint pengiriman deskripsi | `with([... 'deskripsi_mata_pelajaran'])` dimuat di `kirim_nilai()` namun tak dirujuk; field `ket_kognitif` pada body postNilai berada dalam komentar |
| Nilai granular: `nilai_tp` (sumatif lingkup materi per TP), `nilai_sumatif` (akhir semester), `TpNilai` (kompeten/inkompeten), nilai sikap/ekskul/UKK/P5/PKL | **Tidak dikirim sama sekali** lewat Alur A — hanya nilai akhir (agregat) yang masuk Dapodik        | Loop `kirim_nilai()` hanya membaca `all_nilai_akhir_*`; granular hanya dikirim ke server pusat via Alur B (`table_sync()`)                           |
| Field `a_beku` (freeze) pada postNilai                                                                                                                       | Dinonaktifkan (dikomentari)                                                                        | `SinkronisasiController.php:511,527`                                                                                                                 |

#### D. Konsekuensi praktis

1. Yang muncul di Dapodik setelah proses ini hanyalah **struktur mata evaluasi + satu angka nilai
   kognitif akhir per siswa per mapel** — deskripsi teks dan rincian penilaian harian tidak ikut.
2. Karena `anggota_rombel_id` adalah UUID Dapodik, sistem lain yang ingin mengirim nilai harus
   memiliki peta siswa→anggota_rombel Dapodik yang valid (hasil sinkronisasi data rombel).
3. `updater_id` bisa `null` jika email pengguna e-Rapor tidak terdaftar sebagai pengguna Dapodik;
   proses tetap lanjut (exception ditelan di `getUpdaterID()`).

### 4.2 Alur B — Kirim data e-Rapor ke server pusat e-Rapor (dashboard nasional)

Tujuan: mengirim **seluruh data aplikasi** (bukan hanya nilai) ke `app.erapor-smk.net` untuk
konsolidasi nasional. UI: `resources/js/pages/sinkronisasi/erapor.vue`; command:
`php artisan kirim:erapor` (`app/Console/Commands/Erapor.php`).

1. `GET /sinkronisasi/erapor` (`SinkronisasiController::erapor`) menampilkan pratinjau: cek status
   Server Direktorat via `http_client('status', ...)` dan menghitung jumlah baris siap kirim per tabel.
2. `POST /sinkronisasi/kirim-data` menjalankan `Artisan::call('kirim:erapor', [...])` untuk **setiap
   tabel** pada daftar `table_sync()` (`functions.php`) — ±64 tabel, mencakup semua entitas master
   (sekolah, guru, pd, rombel, …) dan seluruh nilai (`nilai`, `nilai_tp`, `nilai_sumatif`,
   `nilai_akhir`, `nilai_ukk`, `nilai_pts`, `nilai_sikap`, `nilai_budaya_kerja`, `kd_nilai`,
   `deskripsi_mata_pelajaran`, `absensi`, dst.).
3. Command `Erapor.php`:
   - **Incremental**: `get_table()` hanya mengambil baris dengan `updated_at > last_sync`
     (scoped `sekolah_id`, `tahun_ajaran_id`, `semester_id`; khusus `ref.capaian_pembelajaran` hanya
     `is_dir = 0`, khusus `ref.kompetensi_dasar` hanya milik user sekolah).
   - Payload dikemas aman: `prepare_send()` =
     `rawurlencode(base64_encode(gzcompress(encryptor(serialize(json)))))` lalu POST ke
     `{dashboard_url}/sinkronisasi/kirim-data`.
   - Setelah sukses, `last_sync = now()` ditulis balik per baris agar tidak terkirim ulang;
     waktu kirim terakhir dicatat di tabel `sync_logs` (ditampilkan sebagai "Terakhir sinkron").
   - Opsi `--force` mengirim ulang seluruh isi tabel tanpa filter `updated_at > last_sync`.

### 4.3 Hubungan kedua alur

```
                    ┌──────────────────────────────────────────────┐
                    │           DATABASE e-Rapor (PostgreSQL)       │
                    │  nilai_tp, nilai_sumatif, nilai_akhir, ...    │
                    └───────┬──────────────────────────┬───────────┘
                            │ Alur A                   │ Alur B
             WebService     │                          │  HTTP (payload terenkripsi+gzip)
             Dapodik lokal  ▼                          ▼
                  ┌──────────────────┐         ┌───────────────────────┐
                  │ Aplikasi Dapodik │         │ app.erapor-smk.net    │
                  │ (komputer sekolah)│        │ (server pusat e-Rapor)│
                  └────────▲─────────┘         └───────────┬───────────┘
                           │                               ▼
                           │                    Server Direktorat /
                           └── data nilai masuk ke Dapodik desktop → PUSDATIN
```

- **Alur A** dibutuhkan agar nilai rapor muncul di aplikasi Dapodik sekolah (dan dari sana ke
  jaringan Dapodik resmi).
- **Alur B** adalah replikasi data ke infrastruktur e-Rapor SMK pusat (monitoring/leger nasional),
  sekaligus jalur cadangan distribusi referensi (KD/CP/UKK buatan sekolah).

---

## 5. Spesifikasi Autentikasi Setiap Kanal Komunikasi

> Bagian ini adalah matriks referensi untuk reimplementasi di sistem lain.
> Semua mekanisme diverifikasi langsung dari kode sumber.

### 5.1 Matriks autentikasi

| #   | Kanal                               | Arah                                          | Mekanisme                                         | Header persis yang dikirim              | Kredensial & sumbernya                                                                                                                                                                    |
| --- | ----------------------------------- | --------------------------------------------- | ------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | WebService Dapodik desktop (Alur A) | outbound GET & POST                           | **Bearer token**                                  | `Authorization: Bearer {token_dapodik}` | Token WebService dari aplikasi Dapodik; disimpan admin ke tabel `settings` (`key='token_dapodik'`, scoped per `sekolah_id`), dibaca ulang via `get_setting('token_dapodik', $sekolah_id)` |
| 2   | Server Synchronizer (tarik Dapodik) | outbound POST                                 | **API key** (bukan bearer)                        | `x-api-key: {sekolah_id}`               | `sekolah_id` internal e-Rapor (`http_client()`, `functions.php`)                                                                                                                          |
| 3   | Dashboard pusat e-Rapor (Alur B)    | outbound POST                                 | **Tanpa auth header** — keamanan di level payload | tidak ada header auth                   | Payload disandikan: `prepare_send()` = `rawurlencode(base64_encode(gzcompress(encryptor(serialize(json)))))`; server pusat memakai shared secret yang sama (`encryptor()`)                |
| 4   | Endpoint masuk dari Synchronizer v2 | inbound POST `/api/sinkronisasi/synchronizer` | **API key**                                       | `X-Api-Key: {sekolah_id}`               | Middleware `auth.apikey` mencocokkan nilai header dengan baris `sekolah` yang terdaftar (`ApiKeyMiddleware.php`); 401 jika tidak cocok                                                    |
| 5   | API internal SPA → backend          | inbound semua `/api/*` (grup `auth:sanctum`)  | **Bearer token Sanctum** (Personal Access Token)  | `Authorization: Bearer {accessToken}`   | Diterbitkan saat login: `$user->createToken('Personal Access Token')` → `plainTextToken` (`AuthController.php:341-342`); dikirim frontend via `resources/js/utils/api.js:8`               |

### 5.2 Detail teknis kanal #1 (Bearer Dapodik) — paling relevan untuk reimplementasi

1. **Semua method HTTP wajib membawa token.** Baik GET (`getSekolah`, `getPengguna`,
   `getMatevNilai`) maupun POST (`postMatevRapor`, `postNilai`) memakai skema identik.
   Di Laravel dicapai dengan `Http::withToken($token)` — signature default
   `withToken($token, $type = 'Bearer')` menghasilkan header `Authorization: Bearer <token>`.
2. **Token bersifat statis tanpa refresh flow.** Tidak ada endpoint login/renew terhadap Dapodik
   dalam repo ini; token dibuat/di-reset manual oleh operator di menu _Web Service_ aplikasi
   Dapodik desktop, lalu dimasukkan ke form e-Rapor. Jika token berubah/expired, seluruh request
   gagal sampai admin mengisi ulang.
3. **Validasi sebelum dipakai:** `POST /api/sinkronisasi/cek-koneksi` memvalidasi pasangan
   `{url_dapodik, token_dapodik}` dengan probe `GET /WebService/getSekolah`. Kredensial hanya
   disimpan ke `settings` jika respons sukses (`SinkronisasiController.php:679-754`). Pola yang
   sama berlaku di halaman pengaturan umum.
4. **Resiliensi:** probe koneksi dan pembacaan data memakai `retry(3, 100)` (3 percobaan,
   jeda 100 ms). Pengiriman nilai (`kirim_nilai`) TIDAK memakai retry per-item — item yang gagal
   dilewati secara diam (`$nilai_dapo->success` false → tidak dihitung, tidak ada error per-baris);
   hanya kegagalan koneksi total yang melempar exception dan menghentikan proses.
5. **Parameter query wajib pada setiap call:** `npsn` dan `semester_id` selalu ada di query string,
   ditambah parameter spesifik endpoint (`a_dari_template=1` untuk getMatevNilai,
   `table=rapor` untuk postNilai). Body POST berformat JSON.
6. **TLS:** koneksi ke WebService Dapodik lokal TIDAK menonaktifkan verifikasi SSL secara eksplisit;
   berbeda dengan helper `http_client()`/`http_dashboard()` yang memakai `'verify' => false`.

### 5.3 Implikasi porting ke sistem lain

**Yang dapat direplikasi mandiri (satu-satunya): kanal #1 — WebService Dapodik desktop.**

- Kredensial yang dibutuhkan hanya dua: `url_dapodik` (base URL WebService, biasanya
  `http://localhost:{port}/WebService` sesuai instalasi Dapodik desktop) dan `token_dapodik`
  (dari menu _Web Service_ aplikasi Dapodik).
- Setiap request (GET maupun POST) cukup membawa header `Authorization: Bearer <token>` —
  tidak ada signature, tidak ada handshake, tidak ada refresh flow.
- Ikuti urutan panggilan dan kontrak body persis seperti **Bagian 4.1a**, termasuk manipulasi
  timestamp (`last_update`/`last_sync`) yang merupakan bagian dari kontrak efektif dengan server
  Dapodik.
- Identitas siswa yang dikirim adalah `anggota_rombel_id` milik Dapodik — artinya sistem
  pengganti juga wajib menyimpan primary key Dapodik untuk rombel/anggota rombel/pembelajaran,
  bukan ID internalnya sendiri.

**Yang TIDAK dapat direplikasi tanpa infrastruktur e-Rapor SMK:**

- Kanal #2/#4 (tarik data Dapodik lewat Synchronizer): butuh akun pada layanan
  `sync.erapor-smk.net` milik e-Rapor SMK; kredensialnya bukan bearer token melainkan `sekolah_id`
  sebagai API key + payload `username_dapo`/hash `password_dapo`. Alternatif resmi: jalankan
  aplikasi **Synchronizer v2** terpisah.
- Alur B (kanal #3, replikasi ke dashboard pusat): butuh shared secret `encryptor()` yang
  disepakati dengan server penerima; tidak ada header otorisasi.

---

## 6. Ringkasan Cepat (TL;DR)

1. **Tarik Dapodik**: aplikasi **Synchronizer v2** menarik data dari Dapodik lalu mendorongnya ke
   endpoint `POST /api/sinkronisasi/synchronizer` (API-key = sekolah_id). Alternatif CLI:
   `php artisan sinkron:dapodik {satuan} {akses} {sekolah_id} {semester_id}` (hanya 03.00–24.00 WIB).
   Data: referensi (wilayah, jurusan, kurikulum, mapel, KD, CP), sekolah, PTK, rombel, siswa
   aktif/keluar, anggota rombel, pembelajaran, ekskul + anggota, DUDI/MoU (SMK).
2. **Guru mengisi nilai**: lewat halaman _Nilai Akademik_ — sumatif lingkup materi (per TP/KD),
   sumatif akhir semester, nilai akhir (auto-hitung berbobot, bisa dioverride), deskripsi capaian
   kompetensi, sikap budaya kerja, ekskul; plus import Excel via template `/downloads/template-*`
   dan generate otomatis (PKL/sub-mapel). Disimpan ke tabel `nilai_*` dengan `last_sync` sebagai
   penanda antrean kirim.
3. **Kirim nilai ke Dapodik (satu-satunya jalur yang portable)**: konfigurasikan URL + Token
   WebService Dapodik lokal (validasi via `getSekolah`), ambil/generate mata evaluasi
   (`getMatevNilai`), lalu kirim `postMatevRapor` + `postNilai` satu-per-satu. **Semua request
   GET/POST wajib membawa header `Authorization: Bearer {token_dapodik}`**. Kontrak lengkap tiap
   endpoint (URL, query params, body fields persis, respons, urutan panggilan): **Bagian 4.1a**.
   Komposisi & asal-usul tiap field payload: **Bagian 4.1b** — intinya yang dikirim hanya dua jenis:
   _metadata mata evaluasi_ (`postMatevRapor`, seluruh kolom `dapodik.matev_rapor`) dan _satu angka
   nilai akhir per siswa_ (`postNilai`: `nilai_id`, `id_evaluasi`, `anggota_rombel_id`,
   `nilai_kognitif_angka`). Deskripsi capaian kompetensi dan nilai granular (per TP/sumatif/sikap/
   ekskul/UKK/P5/PKL) TIDAK dikirim ke Dapodik — granular hanya masuk Alur B ke server pusat.
   Detail autentikasi & gotcha retry/timestamp: **Bagian 5.2**.
   Secara paralel, `kirim:erapor` mereplikasi ±64 tabel ke server pusat `app.erapor-smk.net`
   — ini layanan internal e-Rapor SMK, tidak relevan untuk reimplementasi mandiri.
4. **Model data minimum untuk reimplementasi**: lihat **Bagian 7** — peta kolom hasil `simpan_*`
   per entitas (7.2), daftar endpoint WebService dengan penanda sumber verifikasi (7.3),
   dan checklist tabel minimum agar Alur A dapat berjalan (7.4).

---

## 7. Lampiran Reimplementasi — Peta Data & Endpoint (untuk proyek lain, mis. rapkumer/Svelte)

> Bagian ini menjawab: _"data apa saja yang harus disimpan sistem pengganti?"_ Semua pemetaan
> diekstrak dari fungsi `simpan_*` (`app/Helpers/functions.php:537-1030`) dan
> `Dapodik::simpan_sekolah()` (`app/Console/Commands/Dapodik.php:737-772`). Field sumber adalah
> struktur JSON yang dikirim Synchronizer v2 (cermin struktur API Dapodik).

### 7.1 Konvensi model data lokal

1. **Primary key lokal = primary key Dapodik** (`updateOrCreate` dengan key asli Dapodik);
   sebagian besar tabel juga menyimpan kolom cermin `*_id_dapodik`.
2. Kolom `last_sync` = penanda antrean kirim incremental (diisi mundur −30 hari saat data masuk).
3. Data selalu di-scope `sekolah_id`; data tahunan ditambah `semester_id`.
4. Relasi wajib untuk Alur A (semua UUID milik Dapodik):
   `anggota_rombel_id`, `rombongan_belajar_id`, `pembelajaran_id`.

### 7.2 Pemetaan kolom per entitas

#### sekolah (`simpan_sekolah`, `Dapodik.php:737-772`)

| Kolom lokal                                                      | Field Dapodik                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `sekolah_id` (PK)                                                | `sekolah_id`                                                      |
| `npsn`, `nama`, `nss`                                            | `npsn`, `nama`, `nss`                                             |
| `alamat`                                                         | `alamat_jalan`                                                    |
| `desa_kelurahan`, `kode_wilayah`, `kode_pos`, `lintang`, `bujur` | field sama                                                        |
| `kecamatan`, `kabupaten`, `provinsi`                             | hasil rekursi `wilayah.parrent_recursive` (level 4→1)             |
| `no_telp`, `no_fax`, `email`, `website`                          | `nomor_telepon`, `nomor_fax`, `email`, `website`                  |
| `status_sekolah`, `bentuk_pendidikan_id`                         | field sama                                                        |
| `guru_id` (kepsek)                                               | `kepala_sekolah.ptk_id`                                           |
| —                                                                | `jurusan_sp[]` → `jurusan_sp_id`, `jurusan_id`, `nama_jurusan_sp` |

#### ptk / guru (`simpan_ptk`, functions.php:537-588)

| Kolom lokal                                                                        | Field Dapodik                                                   |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `guru_id` (PK), `guru_id_dapodik`                                                  | `ptk_id`                                                        |
| `nama`, `nip`, `nik`, `jenis_kelamin`, `tempat_lahir`, `tanggal_lahir`, `agama_id` | field sama                                                      |
| `nuptk`                                                                            | `nuptk` (fallback random bila kosong!)                          |
| `status_kepegawaian_id`                                                            | `status_kepegawaian_id`                                         |
| `jenis_ptk_id`                                                                     | `ptk_terdaftar.jenis_ptk_id`                                    |
| `jabatan_ptk_id`                                                                   | `tugas_tambahan.jabatan_ptk_id`                                 |
| `alamat`, `rt`, `rw`, `desa_kelurahan`, `kode_wilayah`, `kode_pos`                 | `alamat_jalan`, dst.                                            |
| `kecamatan`                                                                        | `wilayah.nama`                                                  |
| `no_hp`, `email`                                                                   | `no_hp`; `email` fallback `<random>@erapor-smk.net` bila kosong |

#### rombongan_belajar (`insert_rombel`, functions.php:654-688)

| Kolom lokal                                      | Field Dapodik                                           |
| ------------------------------------------------ | ------------------------------------------------------- |
| `rombongan_belajar_id` (PK), `rombel_id_dapodik` | `rombongan_belajar_id`                                  |
| `semester_id`                                    | `semester_id`                                           |
| `nama`, `kurikulum_id`                           | `nama`; `kurikulum.kurikulum_id` (insert_kurikulum)     |
| `jurusan_id`, `jurusan_sp_id`                    | `jurusan_sp.jurusan_id`, `jurusan_sp.jurusan_sp_id`     |
| `ptk_id` / `guru_id` (wali kelas)                | `ptk_id`                                                |
| `tingkat`                                        | `tingkat_pendidikan_id`                                 |
| `jenis_rombel`                                   | `jenis_rombel` — 1 reguler, 16 mapel pilihan, 51 ekskul |

#### pembelajaran (`simpan_pembelajaran`, functions.php:733-763)

| Kolom lokal                                                                       | Field Dapodik                                                    |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `pembelajaran_id` (PK), `pembelajaran_id_dapodik`                                 | `pembelajaran_id`                                                |
| `induk_pembelajaran_id`                                                           | `induk_pembelajaran_id` (null untuk mapel induk)                 |
| `semester_id`, `rombongan_belajar_id`, `mata_pelajaran_id`, `nama_mata_pelajaran` | field sama                                                       |
| `guru_id`                                                                         | `ptk_terdaftar.ptk_id`                                           |
| —                                                                                 | `sub_mapel[]` direkursif (induk sub-mapel: `kompetensi_id = 99`) |

#### peserta_didik (`simpan_pd`, functions.php:802-865)

| Kolom lokal                                                                                  | Field Dapodik                                                             |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `peserta_didik_id` (PK), `peserta_didik_id_dapodik`                                          | `peserta_didik_id`                                                        |
| `nama`, `nisn`, `nik`, `jenis_kelamin`, `tempat_lahir`, `tanggal_lahir`, `agama_id`, `email` | field sama                                                                |
| `no_induk`                                                                                   | `registrasi_peserta_didik.nipd`                                           |
| `anak_ke`                                                                                    | `anak_keberapa`                                                           |
| `alamat`, `rt`, `rw`, `desa_kelurahan`, `kode_wilayah`, `kode_pos`                           | `alamat_jalan`, dst.                                                      |
| `kecamatan`                                                                                  | hasil rekursi `wilayah`                                                   |
| `no_telp`, `no_hp`                                                                           | `nomor_telepon_rumah`, `nomor_telepon_seluler`                            |
| `sekolah_asal`, `diterima`                                                                   | `registrasi_peserta_didik.sekolah_asal`, `.tanggal_masuk_sekolah`         |
| `diterima_kelas`                                                                             | `diterima_dikelas.rombongan_belajar.nama`                                 |
| `nama_ayah`, `kerja_ayah`                                                                    | `nama_ayah`, `pekerjaan_id_ayah`                                          |
| `nama_ibu`, `kerja_ibu`                                                                      | `nama_ibu_kandung`, `pekerjaan_id_ibu`                                    |
| `nama_wali`, `alamat_wali`, `telp_wali`, `kerja_wali`                                        | `nama_wali`, `alamat_jalan`, `nomor_telepon_seluler`, `pekerjaan_id_wali` |

> Siswa masuk rombel lewat `data.anggota_rombel` nested di payload siswa aktif
> → `simpan_anggota_rombel` (functions.php:764-780): `anggota_rombel_id` (PK + cermin),
> `semester_id`, `rombongan_belajar_id`, `peserta_didik_id`. **Inilah satu-satunya sumber
> UUID anggota rombel yang dipakai sebagai identitas siswa saat kirim nilai (Alur A).**

#### ekstrakurikuler (`simpan_ekskul`/`simpan_anggota_ekskul`, functions.php:866-894)

| Kolom lokal                                         | Field Dapodik                                                   |
| --------------------------------------------------- | --------------------------------------------------------------- |
| `ekstrakurikuler_id` (PK), mirror `id_kelas_ekskul` | `id_kelas_ekskul`                                               |
| `nama_ekskul`                                       | `nm_ekskul`                                                     |
| `guru_id` (pembina)                                 | `rombongan_belajar.ptk_id`                                      |
| `rombongan_belajar_id`, `alamat_ekskul`             | `rombongan_belajar_id`; `rombongan_belajar.ruang.nm_ruang`      |
| anggota                                             | = baris `anggota_rombel` ber-`jenis_rombel` 51 + data PD nested |

#### dudi & relasinya (`simpan_dudi`, functions.php:895-1022 — hanya SMK)

| Tabel            | PK                                    | Kolom penting ← field Dapodik                                                                                                                                  |
| ---------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dudi`           | `dudi_id` (+mirror)                   | `nama`, `bidang_usaha_id`, `alamat_jalan`, `rt/rw/nama_dusun/desa_kelurahan/kode_wilayah/kode_pos/lintang/bujur`, `nomor_telepon/nomor_fax/email/website/npwp` |
| `mou`            | `mou_id` (+mirror)                    | `id_jns_ks`, `nomor_mou`, `judul_mou`, `tanggal_mulai/tanggal_selesai`, `contact_person/telp_cp/jabatan_cp`, `npwp_dudi`                                       |
| `akt_pd`         | `akt_pd_id` ← `id_akt_pd` (+mirror)   | `mou_id`, `id_jns_akt_pd`, `judul_akt_pd`, `sk_tugas/tgl_sk_tugas`, `ket_akt`, `a_komunal`                                                                     |
| `anggota_akt_pd` | `anggota_akt_pd_id` ← `id_ang_akt_pd` | `akt_pd_id`, `peserta_didik_id` (via `registrasi_peserta_didik`), `nm_pd`, `nipd`, `jns_peran_pd`                                                              |
| `bimbing_pd`     | `bimbing_pd_id` ← `id_bimb_pd`        | `akt_pd_id`, `ptk_id`, `urutan_pembimbing`                                                                                                                     |

### 7.3 Daftar endpoint WebService Dapodik + penanda verifikasi

**A. Terverifikasi langsung dari kode e-Rapor** (kontrak pasti, lihat Bagian 4.1a):
`getSekolah`, `getPengguna`, `getMatevNilai?a_dari_template=1`, `postMatevRapor`,
`postNilai?table=rapor`.

**B. TIDAK ada dalam kode repo ini** ⚠️ — e-Rapor menarik master data via Synchronizer
(kanal #2/#4), bukan langsung ke Dapodik, sehingga pemanggilan GET berikut **tidak pernah
diekskusi di repo ini** dan parameternya harus diverifikasi terhadap instalasi Dapodik target:

```
GET {base}/WebService/getPesertaDidik        ?npsn=&semester_id=
GET {base}/WebService/getRombonganBelajar    ?npsn=&semester_id=
GET {base}/WebService/getAnggotaRombel       ?rombongan_belajar_id=&npsn=&semester_id=
GET {base}/WebService/getPembelajaran        ?rombongan_belajar_id= / ?pembelajaran_id=
GET {base}/WebService/getEkskul              ?rombongan_belajar_id=
GET {base}/WebService/getDudi                ?npsn=&semester_id=
```

Endpoint referensi yang lazim tersedia pada WebService Dapodik desktop (sama-sama di luar kode
repo): `getTahunAjaran`, `getSemester`, `getJenjangPendidikan`, `getBentukPendidikan`,
`getStatusKepegawaian`, `getAgama`, `getPekerjaan`, `getPenghasilan`, `getWali`,
`getMataPelajaran`, `getKurikulum`, `getJurusan`. Envelope respons umumnya `{"rows": [...]}`
untuk daftar dan objek tunggal untuk detail — konsisten dengan pola `getMatevNilai`/`getPengguna`
yang terverifikasi.

### 7.4 Checklist tabel minimum agar Alur A dapat berjalan

Untuk mengirim nilai ke Dapodik dari sistem baru, tabel berikut harus ada (kolom kuncinya saja):

| Tabel minimal     | Kunci/field esensial                                                                     | Dipakai untuk   |
| ----------------- | ---------------------------------------------------------------------------------------- | --------------- |
| pengaturan        | `url_dapodik`, `token_dapodik`, `npsn`, `semester_id`                                    | semua call      |
| rombongan_belajar | `rombongan_belajar_id` (UUID Dapodik)                                                    | scope matev     |
| pembelajaran      | `pembelajaran_id`, `rombongan_belajar_id`, `mata_pelajaran_id`, `nama_mata_pelajaran`    | generate matev  |
| anggota_rombel    | `anggota_rombel_id`, `peserta_didik_id`, `rombongan_belajar_id`                          | identitas siswa |
| matev_rapor       | skema persis Bagian 4.1a §4 + `status` internal                                          | postMatevRapor  |
| nilai_akhir       | `nilai_akhir_id`, `pembelajaran_id`, `anggota_rombel_id`, `kompetensi_id` (1/4), `nilai` | postNilai       |

Tanpa sinkronisasi master data (B), sistem pengganti tidak punya UUID Dapodik yang valid —
inilah pekerjaan terbesar yang tidak ter-cover oleh kode e-Rapor dan harus dibangun sendiri.
