# Pengaturan Izin Pengguna

## Lokasi

Halaman `GET /pengguna/[id]` — menampilkan daftar semua izin yang tersedia dalam bentuk toggle checkbox per pengguna.

Server load: `src/routes/pengguna/[id]/+page.server.ts:9`  
Client UI: `src/routes/pengguna/[id]/+page.svelte:33`

---

## Daftar Izin

Didefinisikan di `src/routes/pengguna/permissions.ts:1`.

Izin dibagi menjadi 10 grup, mengikuti struktur drawer menu aplikasi. Setiap izin berformat `{grup}_{value}`.

| Grup           | Izin                                | Deskripsi                   |
| -------------- | ----------------------------------- | --------------------------- |
| user           | `user_list`                         | Lihat daftar pengguna       |
| user           | `user_detail`                       | Lihat detail pengguna       |
| user           | `user_add`                          | Tambah pengguna             |
| user           | `user_delete`                       | Hapus pengguna              |
| user           | `user_suspend`                      | Tangguhkan pengguna         |
| user           | `user_set_permissions`              | Atur izin pengguna          |
| dashboard      | `dashboard_manage`                  | Kelola Tindakan Cepat       |
| app            | `app_check_update`                  | Cek Pembaruan Aplikasi      |
| server         | `server_stop`                       | Hentikan Server             |
| kelas          | `kelas_pindah`                      | Pindah dan akses kelas lain |
| informasi_umum | `informasi_umum_sekolah`            | Menu Sekolah                |
| informasi_umum | `informasi_umum_akademik`           | Menu Akademik               |
| informasi_umum | `informasi_umum_kelas`              | Menu Kelas                  |
| informasi_umum | `informasi_umum_murid`              | Menu Murid                  |
| mata_pelajaran | `mata_pelajaran_intrakurikuler`     | Menu Intrakurikuler         |
| mata_pelajaran | `mata_pelajaran_kokurikuler`        | Menu Kokurikuler            |
| mata_pelajaran | `mata_pelajaran_ekstrakurikuler`    | Menu Ekstrakurikuler        |
| mata_pelajaran | `mata_pelajaran_keasramaan`         | Menu Keasramaan             |
| input_nilai    | `input_nilai_asesmen_formatif`      | Menu Asesmen Formatif       |
| input_nilai    | `input_nilai_asesmen_sumatif`       | Menu Asesmen Sumatif        |
| input_nilai    | `input_nilai_asesmen_kokurikuler`   | Menu Asesmen Kokurikuler    |
| input_nilai    | `input_nilai_nilai_ekstrakurikuler` | Menu Nilai Ekstrakurikuler  |
| input_nilai    | `input_nilai_asesmen_keasramaan`    | Menu Asesmen Keasramaan     |
| administrasi   | `administrasi_absen`                | Menu Absen                  |
| administrasi   | `administrasi_jurnal_mengajar`      | Menu Jurnal Mengajar        |
| administrasi   | `administrasi_catatan_wali_kelas`   | Menu Catatan Wali Kelas     |
| administrasi   | `administrasi_rekap_nilai`          | Menu Rekap Nilai            |
| administrasi   | `administrasi_rekap_keasramaan`     | Menu Rekap Keasramaan       |
| administrasi   | `administrasi_keputusan`            | Menu Keputusan              |
| administrasi   | `administrasi_buku_tamu`            | Menu Buku Tamu              |
| cetak          | `cetak_dokumen`                     | Menu Cetak Dokumen          |

**Total: 31 izin** dalam 10 kelompok.

Izin `kelas_pindah` tetap dipertahankan (grup `kelas`), karena ini izin fungsional yang tidak merepresentasikan menu.

### Izin yang Dihapus

Model lama memiliki 3 izin global yang kini **dihapus** dan digantikan izin per-menu:

| Izin lama        | Digantikan oleh                          |
| ---------------- | ---------------------------------------- |
| `sekolah_manage` | `informasi_umum_sekolah`                 |
| `rapor_manage`   | Izin menu terkait (akademik/mapel/nilai) |
| `kelas_manage`   | `informasi_umum_kelas`                   |

`removedLegacyPermissionKeys` di `permissions.ts:112-114` mendefinisikan daftar izin lama yang **dibuang** saat migrasi (tidak dipertahankan).

---

## Cara Kerja

### Admin

- `isAuthorizedUser()` (`permissions.ts`) mengembalikan `true` untuk semua permission jika `user.type === 'admin'`
- Di UI, semua toggle checkbox _checked + disabled_ dengan hidden input agar tetap terkirim
- Tidak perlu diatur secara manual — admin selalu punya semua akses

### Non-Admin (Wali Kelas, Wali Asuh, User/Guru Mapel)

- Izin dicek langsung dari kolom `permissions` (JSON array of strings) di tabel `auth_user`
- Setiap izin adalah string seperti `"informasi_umum_sekolah"`, `"administrasi_absen"`, dll.
- Fungsi `isAuthorizedUser()` mengecek apakah user punya **salah satu** dari izin yang diminta (OR)
- Tiga lapis penjagaan:
  - **Server-side route guard** (`hooks.server.ts`): setiap request memetakan URL ke permission via `resolveRoutePermission()`. Tanpa izin → redirect `303 /forbidden?required={permission}`. Ini penjagaan utama.
  - **Form actions / API**: `authority()` di `utils.server.ts` dan `isAuthorizedUser()` langsung — memblokir submit/request
  - **Client-side**: `<Authority>` component di `authority.svelte` — render conditional elemen UI
- **Drawer menu** (`menu.svelte`) menyaring item menu berdasarkan permission user — tanpa izin, item (beserta grup induknya bila semua terkunci) disembunyikan

---

## Dampak per Tipe Akun

### Admin

| Izin  | Dampak                                                               |
| ----- | -------------------------------------------------------------------- |
| Semua | Bisa apa saja. Manajemen user, sekolah, akademik, server, dashboard. |

Catatan: `isAuthorizedUser` selalu return `true` untuk admin, sehingga permission list di UI tidak relevan (selalu full).

### Wali Kelas (`type: 'wali_kelas'`)

**Default saat akun dibuat** (`defaultPermissionsByType['wali_kelas']`) — 16 izin, **tanpa** `/sekolah`, `/akademik`, `/kelas`, dan `/buku-tamu`:

| Izin                             | Dampak                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kelas_pindah` **(auto-assign)** | Otomatis diberi jika wali menangani >1 kelas (`+page.server.ts:204-208`). Bisa berpindah-pindah kelas dan mengakses data kelas lain (tidak hanya kelas yang di-wali-kan). |
| `informasi_umum_murid`           | Bisa lihat/kelola menu Murid.                                                                                                                                             |
| Semua izin `mata_pelajaran_*`    | Bisa lihat/kelola semua menu mata pelajaran (Intrakurikuler, Kokurikuler, Ekstrakurikuler, Keasramaan).                                                                   |
| Semua izin `input_nilai_*`       | Bisa isi semua menu asesmen/nilai (Formatif, Sumatif, Kokurikuler, Ekstrakurikuler, Keasramaan).                                                                          |
| Semua izin `administrasi_*`      | Bisa akses Absen, Jurnal, Catatan Wali Kelas, Rekap Nilai, Keputusan. **Tidak termasuk** Buku Tamu.                                                                       |
| `cetak_dokumen`                  | Bisa cetak dokumen rapor dll.                                                                                                                                             |

**Tidak punya default akses ke** menu Sekolah, Akademik, dan Kelas (`informasi_umum_sekolah/akademik/kelas`) — menu tersebut tersembunyi di drawer dan akses langsung di-redirect ke `/forbidden`.

Catatan penting:

- **Tanpa `kelas_pindah`** — Wali Kelas hanya bisa mengakses kelas yang `waliKelasId`-nya cocok dengan `pegawaiId` mereka. Request ke kelas lain akan di-redirect ke `/forbidden`.
- **Dengan `kelas_pindah`** — tetap terbatas: hanya bisa pindah ke kelas lain yang `waliKelasId`-nya adalah `pegawaiId` mereka sendiri (validasi di `+layout.server.ts:179-188`).
- Bisa edit absen (`canUserEditAbsen` return `true`).
- `canManageMapel` = `true` (bisa atur mata pelajaran).
- Tidak bisa dihapus dari halaman pengguna.

### Wali Asuh (`type: 'wali_asuh'`)

**Default saat akun dibuat** (`defaultPermissionsByType['wali_asuh']`) — 5 izin:

| Izin                             | Dampak                                                                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mata_pelajaran_keasramaan`      | Bisa akses menu Keasramaan (TP/indikator/mata evaluasi).                                                                                                  |
| `input_nilai_asesmen_keasramaan` | Bisa akses menu Asesmen Keasramaan dan isi nilainya.                                                                                                      |
| `cetak_dokumen`                  | Bisa cetak dokumen, **terbatas hanya Rapor Keasramaan** (filter di `cetak/+page.svelte:33` dan pembatasan murid asuhan sendiri di `preview-data.ts:250`). |
| `kelas_pindah`                   | Bisa berpindah-pindah kelas.                                                                                                                              |
| `administrasi_rekap_keasramaan`  | Bisa akses menu Rekap Keasramaan (hanya murid asuhan sendiri).                                                                                            |

Catatan penting:

- **`canManageMapel = false`** (`+layout.server.ts:249`) — Wali Asuh **tidak bisa** mengelola mata pelajaran (tidak seperti wali_kelas dan user/guru mapel).
- **Tidak bisa edit absen** (`canUserEditAbsen` return `false`).
- Dengan `kelas_pindah`, wali_asuh **tidak dibatasi** oleh `kelas_id` — bisa akses kelas manapun.
- Wali asuh bersifat per-siswa (bukan per-kelas): data asesmen keasramaan dan cetak hanya menampilkan murid asuhan (`pegawaiId`).
- Tidak bisa dihapus dari halaman pengguna.

### User / Guru Mapel (`type: 'user'`)

**Default saat akun dibuat** (`defaultPermissionsByType['user']`) — 7 izin:
`mata_pelajaran_intrakurikuler`, `input_nilai_asesmen_formatif`, `input_nilai_asesmen_sumatif`, `administrasi_absen`, `administrasi_jurnal_mengajar`, `administrasi_rekap_nilai`, `cetak_dokumen`.

Jika user dibuat dengan >1 kelas, otomatis diberi `kelas_pindah` (`+page.server.ts`).

Catatan penting:

- **`disableInteraction`** (`+layout.svelte:103-107`) — mekanisme **terpisah dari permission system** yang membuat halaman `user` menjadi **read-only** secara default. Berlaku di rute yang masih bisa diakses via izin default.
- **Edit absen individual tetap diblokir** — `canUserEditAbsen` return `false` untuk `user`. Hanya `handleIsiSekaligus` (bulk fill per-mapel) yang dikecualikan di `absen/actions.ts:163-169`.
- **`canManageMapel` = `true`** — Bisa mengelola mata pelajaran (filter ketat di server).
- Membutuhkan minimal 1 mata pelajaran saat pembuatan akun.

---

## Ringkasan Perbedaan Akses Bawaan (tanpa perubahan izin)

| Kemampuan                   | Admin | Wali Kelas                | Wali Asuh        | Guru Mapel                      |
| --------------------------- | ----- | ------------------------- | ---------------- | ------------------------------- |
| Akses semua fitur           | ✅    | ❌                        | ❌               | ❌                              |
| Menu Sekolah/Akademik/Kelas | ✅    | ❌                        | ❌               | ❌                              |
| Menu Murid                  | ✅    | ✅                        | ❌               | ❌                              |
| Menu Keasramaan             | ✅    | ✅                        | ✅               | ❌                              |
| Asesmen Keasramaan          | ✅    | ✅                        | ✅               | ❌                              |
| Cetak Rapor Keasramaan      | ✅    | ✅                        | ✅               | ✅ (semua dokumen)              |
| Edit absen                  | ✅    | ✅                        | ❌               | ❌ (kecuali Isi Sekaligus)      |
| Isi Sekaligus absen         | ✅    | ✅                        | ❌               | ✅                              |
| `canManageMapel`            | ✅    | ✅                        | ❌               | ✅                              |
| `disableInteraction`        | ❌    | ❌                        | ❌               | ✅ (kecuali absen/jurnal/cetak) |
| Akses bebas kelas           | ✅    | ❌ (butuh `kelas_pindah`) | ✅ (tanpa batas) | ❌                              |
| Bisa dihapus                | ✅    | ❌                        | ❌               | ✅                              |
| Server stop                 | ✅    | ❌                        | ❌               | ❌                              |
| Buku Tamu                   | ✅    | ❌                        | ❌               | ❌                              |

---

## Kapan Permission Dicek

1. **Hook level** (`hooks.server.ts`): Setiap request — map URL ke permission via `resolveRoutePermission()`, redirect ke `/forbidden?required={permission}` jika tidak punya. Juga guard `kelas_id` untuk wali_kelas.
2. **Layout level** (`+layout.server.ts:155-198`): Pemilihan kelas aktif — guard tambahan untuk wali_kelas.
3. **Page load** (`+page.server.ts` via `authority()`): Halaman yang butuh izin lebih spesifik.
4. **Form actions** (`+page.server.ts` actions via `authority()`): Setiap submit yang membutuhkan izin.
5. **API endpoints** (via `isAuthorizedUser()` langsung): Endpoint seperti `/api/runtime/stop`, `/api/updates/*`, `/api/sekolah/*`.
6. **Client-side rendering** (`<Authority>` component): Tombol dan elemen UI yang di-render conditional.
7. **CSS guard** (`+layout.svelte` via `disableInteraction`): Read-only visual untuk guru mapel.
8. **Drawer menu** (`menu.svelte`): Item menu disembunyikan jika user tidak punya permission rute-nya.

---

## Catatan Teknis

- Permission disimpan sebagai `TEXT` JSON array di SQLite: `permissions TEXT NOT NULL DEFAULT '[]'`
- Tipe di TypeScript: `UserPermission` — union string dari semua kombinasi `group_value` (auto-generated dari `groupedUserPermissions`)
- Saat save via form, semua permission checkbox name (key) yang ter-submit dikumpulkan sebagai array baru, lalu `db.update(...).set({ permissions })`
- Admin **tidak perlu** permission apapun — `isAuthorizedUser` selalu return `true` untuk admin
- Saat user dibuat via form `/pengguna`, permission otomatis diisi `defaultPermissionsByType[tipe]` (+ `kelas_pindah` untuk guru multi-kelas). Admin dapat menyesuaikan setelahnya via halaman izin.
- Mapping URL → permission ada di `menuRoutePermissions` (`permissions.ts`), dipakai oleh `resolveRoutePermission()` untuk route guard dan filter menu.

---

## Migrasi dari Model Lama

Migrasi otomatis jalan saat aplikasi start, di `src/lib/server/db/ensure-permission-migration.ts`:

1. Membaca kolom `permissions` semua akun non-admin.
2. Membuang izin lama (`sekolah_manage`, `rapor_manage`, `kelas_manage`).
3. **v1**: menggabungkan default per tipe akun + izin valid yang masih ada.
4. **v2**: permission `wali_asuh` di-**replace** dengan set default terbatas (keasramaan/asesmen-keasramaan/cetak-dokumen/kelas_pindah).
5. **v3**: permission `wali_kelas` juga di-**replace** dengan set default 16 menu (tanpa sekolah/akademik/kelas/buku-tamu). Untuk `user` (guru mapel) tetap di-merge. `kelas_pindah` dipertahankan bila sudah ada (auto-assign untuk wali multi-kelas, bukan bagian dari default menu).
6. Menulis marker `permission_model_version = 'menu-based-v3'` di tabel `app_meta` agar tidak berjalan dua kali per versi (idempotent).

Admin tidak terpengaruh (selalu full akses). Efek samping: akun non-admin yang sebelumnya diatur manual ikut mendapat izin default tipe-nya — perlu dicek ulang oleh admin di halaman `/pengguna/[id]`.

---

## Filter Menu Berdasarkan Permission

Implementasi di `src/lib/components/menu.svelte`.

Drawer menu (sidebar) menyaring item menu **berdasarkan permission user** (`isAuthorizedUser` + `resolveRoutePermission`), bukan lagi daftar hardcoded per tipe akun:

### Ringkasan Visibilitas Menu dengan Izin Default

| Item Menu             | Admin | Wali Kelas | Wali Asuh | Guru Mapel |
| --------------------- | ----- | ---------- | --------- | ---------- |
| Dashboard             | ✅    | ✅         | ✅        | ✅         |
| Sekolah               | ✅    | ❌         | ❌        | ❌         |
| Akademik              | ✅    | ❌         | ❌        | ❌         |
| Kelas                 | ✅    | ❌         | ❌        | ❌         |
| Murid                 | ✅    | ✅         | ❌        | ❌         |
| Intrakurikuler        | ✅    | ✅         | ❌        | ✅         |
| Kokurikuler           | ✅    | ✅         | ❌        | ❌         |
| Ekstrakurikuler       | ✅    | ✅         | ❌        | ❌         |
| Keasramaan            | ✅    | ✅         | ✅        | ❌         |
| Asesmen Formatif      | ✅    | ✅         | ❌        | ✅         |
| Asesmen Sumatif       | ✅    | ✅         | ❌        | ✅         |
| Asesmen Kokurikuler   | ✅    | ✅         | ❌        | ❌         |
| Nilai Ekstrakurikuler | ✅    | ✅         | ❌        | ❌         |
| Asesmen Keasramaan    | ✅    | ✅         | ✅        | ❌         |
| Absen                 | ✅    | ✅         | ❌        | ✅         |
| Jurnal Mengajar       | ✅    | ✅         | ❌        | ✅         |
| Catatan Wali Kelas    | ✅    | ✅         | ❌        | ❌         |
| Rekap Nilai           | ✅    | ✅         | ❌        | ✅         |
| Rekap Keasramaan      | ✅    | ✅         | ✅        | ❌         |
| Keputusan             | ✅    | ✅         | ❌        | ❌         |
| Buku Tamu             | ✅    | ❌         | ❌        | ❌         |
| Cetak Dokumen         | ✅    | ✅         | ✅        | ✅         |

### Cascading Parent Group

Filter bekerja rekursif: jika semua submenu dalam satu grup tersembunyi, grup induk juga tidak muncul. Contoh:

- Wali Kelas: grup **"Informasi Umum"** — hanya Murid yang terbuka, Sekolah/Akademik/Kelas terkunci. Grup tetap muncul karena masih ada satu submenu.
- Guru Mapel: grup **"Informasi Umum"** (Sekolah, Akademik, Kelas, Murid) — semua terkunci, grup tidak muncul.
- Guru Mapel: grup **"Mata Pelajaran"** — Intrakurikuler terbuka, Kokurikuler/Ekstrakurikuler/Keasramaan terkunci. Grup tetap muncul karena masih ada Intrakurikuler.
- Wali Asuh: grup **"Input Nilai"** — hanya Asesmen Keasramaan yang terbuka, sisanya terkunci. Grup tetap muncul karena masih ada satu submenu.
- Wali Asuh: grup **"Administrasi"** — hanya Rekap Keasramaan yang terbuka, grup tetap muncul karena masih ada satu submenu.

### Catatan

- Filter menu ini **tidak menggantikan** server-side route guard. Jika user mengakses URL langsung (bukan dari menu), hook di `hooks.server.ts` tetap memblokir akses (redirect ke `/forbidden`).
- Admin selalu melihat semua menu (semua permission dianggap ada).
- Perubahan permission di halaman `/pengguna/[id]` langsung tercermin di menu setelah reload.
