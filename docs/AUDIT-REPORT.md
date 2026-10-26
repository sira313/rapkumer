# Laporan Audit Rapkumer

Tanggal: 26 Oktober 2026. Lingkungan: Linux, Node.js 24.15.0, pnpm 11.6.0.

## Ringkasan

Audit menemukan masalah pembatasan akses data murid dan impor nilai, validasi angka impor, serta risiko ketidakkonsistenan database. Tidak ada temuan Critical yang cukup terbukti. Pemeriksaan TypeScript/Svelte lulus; lint menghasilkan 13 peringatan. Dua skrip pengujian yang tersedia lulus seluruhnya (14 pemeriksaan). Kompilasi produksi berhasil, tetapi pengemasan adapter-node tidak selesai karena pembatasan filesystem audit.

Hanya laporan ini yang ditambahkan ke project. Pemeriksaan dijalankan melalui Bubblewrap dengan filesystem host hanya-baca dan jaringan dinonaktifkan. Direktori keluaran pemeriksaan dan database pengujian memakai tmpfs sementara di dalam sandbox; database aplikasi tidak digunakan untuk pengujian. Tidak ada dependency yang dipasang atau diperbarui.

**Batas bukti:** temuan statis di bawah berasal dari penelusuran kode, bukan eksploitasi terhadap aplikasi aktif. Reproduksi yang memerlukan perubahan data merupakan prosedur untuk lingkungan uji, dan tidak dijalankan terhadap database pengguna. Audit ini mencakup pemeriksaan otomatis seluruh project dan penelusuran manual jalur prioritas, bukan pembuktian bahwa setiap cabang kode bebas masalah.

## Cakupan dan hasil umum

| Area                         | Pemeriksaan dan hasil                                                                                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Struktur dan konfigurasi     | Meninjau `package.json`, `.npmrc`, konfigurasi Svelte/Vite, skrip pemeriksaan, hooks, serta pemisahan routes/components/server. Struktur konsisten dengan SvelteKit.                                       |
| Dependency dan import/export | Dependency terpasang dapat melewati type-check dan kompilasi client/server. Belum ada bukti dependency tidak cocok. Audit advisory daring tidak dilakukan; jaringan sandbox dimatikan.                     |
| Nilai dan rapor              | Menelusuri formulir sumatif, impor Excel, bobot sekolah, rekap nilai akhir, dan pembacaan nilai untuk rapor. Validasi impor berbeda dari formulir.                                                         |
| Murid dan kelas              | Menelusuri formulir murid, pemilihan kelas, helper akses kelas, dan pengujian wali asrama. Ditemukan query murid berdasarkan ID tanpa pembatasan sekolah.                                                  |
| Autentikasi dan otorisasi    | Meninjau session, hooks, pemetaan permission, dan guard endpoint. Session menggunakan token acak/hash dan cookie HttpOnly; beberapa endpoint tidak menerapkan otorisasi objek yang setara dengan halaman.  |
| Database                     | Meninjau koneksi WAL, transaksi formulir/impor, dan penggantian database. Risiko utama: pembaruan bobot tidak atomik dan impor database tanpa pemulihan setelah kegagalan.                                 |
| PDF                          | Meninjau payload rapor, renderer Puppeteer/PagedJS, penggabungan PDF, dan header respons. Ditemukan kegagalan header pada nama Unicode tertentu. Rendering Chrome dan pemeriksaan visual belum dijalankan. |
| Presensi                     | Menelusuri lokasi agregasi harian/bulanan/semester dan guard mode. Belum dilakukan pembuktian numerik untuk seluruh kombinasi kalender, jadwal, dan sesi; tidak dinyatakan bebas bug.                      |

## Temuan terurut berdasarkan prioritas

### H-01 — High — Akses dan perubahan murid tidak dibatasi sekolah/kelas

- **Kategori/status:** masalah keamanan; kekurangan guard terbukti pada kode, belum diuji melalui HTTP.
- **Lokasi:** `src/routes/(informasi-umum)/murid/form/[[id]]/+page.server.ts:11–29, 55–75, 111–125, 168–170`.
- **Bukti:** load dan action mengizinkan wali kelas atau pemilik permission `informasi_murid`. Pencarian murid memakai `eq(tableMurid.id, +params.id)` saja. Kelas tujuan hanya diperiksa keberadaannya, bukan kepemilikan sekolah atau akses pengguna. Update juga hanya memakai ID murid. Guard umum di `src/hooks.server.ts:261–298` memeriksa permission rute, bukan kepemilikan murid yang dipilih.
- **Kondisi/dampak:** pengguna yang berhak mengelola murid dapat meminta ID murid di luar kelas/sekolahnya; data pribadi dapat terbaca atau berubah. Pemilihan kelas dari sekolah berbeda juga berisiko menghasilkan relasi sekolah-kelas yang tidak konsisten.
- **Reproduksi:** pada fixture dua sekolah, login sebagai wali kelas sekolah A; buka `/murid/form/<id-murid-sekolah-B>`, kemudian kirim action edit untuk ID tersebut. Uji pula `kelasId` milik sekolah B. Harapan: 403/404 sebelum data dibaca atau ditulis.
- **Rekomendasi:** validasi murid dan kelas terhadap `locals.sekolah.id` serta daftar kelas yang boleh diakses; gunakan pembatasan yang sama dalam query update, bukan hanya pada UI.

### H-02 — High — Impor sumatif melewati otorisasi mapel dan kelas

- **Kategori/status:** masalah keamanan; ketidaksamaan guard terbukti statis, belum dieksploitasi melalui HTTP.
- **Lokasi:** `src/routes/api/asesmen-sumatif/import/+server.ts:88–115, 238–242, 290–304, 531–560`; `src/routes/pengguna/permissions.ts:194–211`; `src/hooks.server.ts:288–298`.
- **Bukti:** endpoint memeriksa keberadaan sekolah dan angka `kelas_id`/`mapel_id`, tetapi tidak memanggil pemeriksaan penugasan guru-mapel atau akses kelas. Query murid membatasi sekolah dan kelas, tetapi mapel kiriman tidak diverifikasi sebagai mapel kelas itu. Resolver permission hanya mencocokkan prefix halaman; `/api/asesmen-sumatif/import` tidak memperoleh permission halaman sumatif melalui resolver tersebut.
- **Pembanding:** formulir sumatif memanggil `ensureUserCanAccessMapel` dan `ensureUserCanAccessMurid` di `src/routes/(input-nilai)/asesmen-sumatif/formulir-asesmen/+page.server.ts:349–358`.
- **Kondisi/dampak:** akun login dengan sekolah aktif dapat berpotensi menulis nilai kelas/mapel di luar penugasannya melalui impor, meskipun formulir melarangnya. Pasangan murid-mapel yang tidak sesuai kelas juga dapat terbentuk.
- **Reproduksi:** gunakan guru yang hanya ditugaskan pada mapel A. Kirim workbook valid ke endpoint impor dengan kelas/mapel B dalam sekolah yang sama. Uji juga pasangan kelas dan mapel yang berbeda kelas. Harapan: 403 atau 400 sebelum transaksi.
- **Rekomendasi:** terapkan permission eksplisit pada endpoint, validasi akses kelas dan mapel, dan pastikan mapel merupakan anggota kelas yang dipilih. Gunakan helper otorisasi bersama dengan formulir.

### H-03 — High — Impor menerima nilai negatif dan nilai di atas 100

- **Kategori/status:** bug validasi terbukti dari alur kode; penyimpanan pada database aktif tidak diuji.
- **Lokasi:** `src/routes/api/asesmen-sumatif/import/+server.ts:32–39, 341–381, 406–421, 531–560`.
- **Bukti:** `parseNumericCell` hanya memeriksa apakah angka finite, lalu membulatkan. Nilai TP, STS, dan SAS langsung dihitung/disimpan. Sebaliknya, formulir sumatif menolak nilai di luar 0–100 pada baris 415–425 dan 458–460.
- **Dampak:** nilai seperti -10 atau 150 dapat masuk melalui Excel dan memengaruhi nilai akhir, peringkat, serta rapor. Angka tidak valid seperti teks justru menjadi null, sehingga kesalahan input juga dapat hilang tanpa pesan spesifik.
- **Reproduksi:** pada workbook valid, isi salah satu kolom TP atau STS dengan 150 dan kolom SAS dengan -10; impor pada database uji dan periksa hasil asesmen. Formulir manual untuk angka yang sama semestinya menolak.
- **Rekomendasi:** gunakan validator angka bersama yang membedakan kosong dari salah format dan memeriksa rentang 0–100; sertakan nomor baris/kolom pada kesalahan impor.

### H-04 — High — Perubahan bobot dan penghitungan ulang nilai tidak atomik

- **Kategori/status:** potensi bug konsistensi; membutuhkan kegagalan atau request bersamaan.
- **Lokasi:** `src/routes/api/sekolah/sumatif-bobot/+server.ts:141–151, 153–249`.
- **Bukti:** bobot sekolah diperbarui terlebih dahulu, kemudian asesmen diperbarui satu per satu tanpa transaksi bersama. Catch secara eksplisit mengembalikan pesan bahwa bobot tersimpan tetapi nilai akhir gagal diperbarui.
- **Dampak:** jika pembaruan terhenti, satu sekolah dapat memiliki campuran nilai dengan bobot lama dan baru. Dua request pengaturan bobot yang tumpang tindih juga dapat menghasilkan hasil hitung yang tidak sesuai bobot terakhir.
- **Reproduksi:** pada fixture banyak asesmen, injeksikan kegagalan query setelah beberapa update; periksa bahwa bobot sekolah sudah berubah sementara sebagian nilai belum. Uji paralel dua pengaturan bobot berbeda.
- **Rekomendasi:** masukkan perubahan bobot dan seluruh penghitungan ulang ke transaksi yang sama; pertimbangkan serialisasi atau pemeriksaan versi untuk pembaruan bersamaan.

### H-05 — High — Penggantian database tidak memiliki rollback saat migrasi gagal

- **Kategori/status:** potensi bug kehilangan ketersediaan/konsistensi data; skenario kegagalan tidak dijalankan.
- **Lokasi:** `src/routes/api/database/import/+server.ts:79–85, 108–158, 174–213`.
- **Bukti:** validasi awal hanya memeriksa header SQLite. Database aktif ditutup dan file utama ditimpa sebelum migrasi. Backup bersifat best-effort; kegagalan migrasi menghasilkan HTTP 500 tanpa memulihkan file lama. Kegagalan startup ensures bahkan ditangani sebagai nonfatal sebelum respons sukses.
- **Dampak:** file SQLite valid tetapi tidak kompatibel dapat menggantikan database yang sebelumnya berfungsi. Pengguna harus melakukan pemulihan manual. Operasi request lain saat pergantian juga belum dilindungi mode pemeliharaan pada handler ini.
- **Reproduksi:** hanya di lingkungan sekali pakai, impor database SQLite ber-header valid dengan skema yang membuat migrasi gagal; bandingkan file aktif sebelum/sesudah dan periksa apakah pemulihan otomatis terjadi.
- **Rekomendasi:** validasi integritas dan migrasi pada kandidat terisolasi terlebih dahulu, wajibkan backup yang berhasil, lakukan pergantian terkoordinasi, serta pulihkan database lama bila tahap aktivasi gagal.

### M-01 — Medium — Nama murid Unicode tertentu menyebabkan unduhan PDF gagal

- **Kategori/status:** bug terbukti pada konstruksi respons Node.js; rendering PDF end-to-end belum diuji.
- **Lokasi:** `src/routes/cetak/rapor.pdf/+server.ts:29–34`.
- **Bukti:** nama murid dimasukkan langsung ke `Content-Disposition`. Uji tanpa filesystem menggunakan `new Response` di Node 24.15.0 menghasilkan `Cannot convert argument to a ByteString` untuk `Siswa Ā`; nama dengan newline menghasilkan `invalid header value`. Nama ASCII berhasil.
- **Dampak:** PDF yang sudah selesai dirender tidak dapat dikirim ketika nama mengandung karakter di luar rentang ByteString, misalnya huruf beraksen tertentu atau aksara non-Latin.
- **Reproduksi:** jalankan `new Response('pdf', { headers: { 'Content-Disposition': 'inline; filename="Rapor_Siswa Ā.pdf"' } })` pada Node. Untuk integrasi, gunakan murid dengan nama tersebut dan cetak rapor.
- **Rekomendasi:** gunakan fallback nama file ASCII yang dibersihkan dan parameter `filename*=UTF-8''...` dengan encoding RFC 5987; tolak karakter kontrol.

### M-02 — Medium — Salah ID murid pada Excel dapat dialihkan diam-diam ke murid lain

- **Kategori/status:** potensi bug integritas impor; bergantung isi workbook dan ekspektasi identitas.
- **Lokasi:** `src/routes/api/asesmen-sumatif/import/+server.ts:271–310`.
- **Bukti:** ID yang tidak ditemukan pada kelas/sekolah terpilih tidak langsung ditolak. Kode beralih ke NIS, lalu nama lowercase melalui `findFirst`. Tidak ada penolakan kecocokan nama ganda maupun konflik ID/NIS/nama.
- **Dampak:** workbook lama atau kelas yang salah dapat mengarahkan nilai ke murid lain yang namanya sama. Pemilihan record pertama tidak memberikan jaminan identitas yang dimaksud pengguna.
- **Reproduksi:** siapkan dua murid bernama sama dalam kelas uji; impor baris dengan ID tidak valid, NIS kosong, dan nama tersebut. Periksa murid mana yang diperbarui. Uji pula ID terisi tetapi sudah tidak cocok setelah perpindahan kelas.
- **Rekomendasi:** bila ID diberikan tetapi tidak cocok, laporkan konflik; gunakan identitas unik yang tervalidasi dan tolak pencarian nama yang ambigu. Jangan meneruskan fallback diam-diam untuk identitas yang saling bertentangan.

### L-01 — Low — Terdapat 13 direktif ESLint yang sudah tidak diperlukan

- **Kategori/status:** kualitas kode; terbukti melalui `pnpm lint`, bukan bug fungsional.
- **Lokasi:** antara lain `src/lib/components/asesmen-sumatif/murid-picker.svelte:2`, `src/lib/components/global-modal.svelte:89`, `src/lib/components/menu.svelte:2`, dan `src/routes/(input-nilai)/asesmen-kokurikuler/+page.svelte:245`.
- **Bukti:** ESLint melaporkan 13 `Unused eslint-disable directive` untuk `svelte/no-navigation-without-resolve`; tidak ada error.
- **Dampak:** keluaran pemeriksaan menjadi bising dan alasan pengecualian aturan sulit dipercaya.
- **Reproduksi:** jalankan `pnpm lint`.
- **Rekomendasi:** hapus pengecualian yang memang tidak diperlukan dalam pekerjaan perbaikan terpisah, lalu verifikasi lint kembali.

### L-02 — Low — Konfigurasi minifikasi memakai opsi yang diperingatkan Vite

- **Kategori/status:** kualitas konfigurasi; peringatan terbukti, belum menyebabkan kegagalan kompilasi.
- **Lokasi:** `vite.config.ts:12, 15–19`; `package.json:61`.
- **Bukti:** Vite 8.1.3 melaporkan `esbuild` deprecated dan menyarankan opsi `oxc`; `build.minify: 'esbuild'` juga diperingatkan deprecated.
- **Dampak:** menambah beban migrasi saat memperbarui tooling; bukan penyebab kegagalan adapter pada audit ini.
- **Reproduksi:** jalankan `pnpm build` dan periksa peringatan awal.
- **Rekomendasi:** migrasikan konfigurasi sesuai API Vite yang digunakan, sambil memverifikasi perilaku penghapusan `debugger` dan hasil minifikasi.

## Saran tambahan, bukan bug terbukti

- Tambahkan pengujian regresi otorisasi lintas sekolah/kelas dan kesetaraan hasil nilai antara formulir, Excel, perubahan bobot, serta rapor RTS/RAS. Saat ini dua skrip pengujian yang diperiksa tidak mencakup jalur tersebut.
- Pusatkan rumus nilai dan validasinya; rumus serupa muncul dalam formulir, impor, serta penghitungan ulang bobot. Duplikasi sendiri bukan bukti hasil perhitungan salah.
- Deklarasikan rentang Node yang didukung pada `package.json`. `.npmrc` mengaktifkan `engine-strict`, tetapi manifest root belum memiliki `engines`.
- `prepare` memakai `svelte-kit sync || echo ''` (`package.json:24`), sehingga kegagalan sync saat instalasi dapat tertutup. Pemeriksaan `check` tetap gagal bila sync gagal; tidak ditemukan kegagalan sync pada audit ini.
- Tambahkan pengujian PDF dengan Chrome, termasuk font, halaman panjang, nama non-ASCII, dan banyak murid. Berhasil dikompilasi tidak membuktikan tata letak PDF benar.

## Daftar perintah dan hasil pemeriksaan

Seluruh perintah pnpm berikut dibungkus sandbox Bubblewrap. Bentuk dasar:

```sh
bwrap --ro-bind / / --dev /dev --proc /proc --tmpfs /tmp \
  --tmpfs "$PWD/.svelte-kit" \
  --tmpfs "$PWD/node_modules/.vite-temp" \
  --tmpfs "$PWD/node_modules/.vite" \
  --unshare-net --die-with-parent sh -c '<perintah>'
```

Mount tmpfs hanya digunakan sesuai kebutuhan percobaan. Build juga memakai tmpfs pada `build`; adapter mencoba menghapus direktori mount itu sendiri sehingga tetap terhalang. Tidak ada hasil build yang ditulis ke project host.

| Perintah                                              | Hasil                                                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `git status --short` sebelum audit                    | Bersih.                                                                                                                                          |
| `node --version`; `pnpm --version`                    | Berhasil: v24.15.0 dan 11.6.0.                                                                                                                   |
| `pnpm lint`                                           | Berhasil: Prettier lulus, ESLint 0 error dan 13 warning. Dijalankan sebelum laporan dibuat.                                                      |
| `pnpm check`                                          | Berhasil: `svelte-check found 0 errors and 0 warnings`.                                                                                          |
| `pnpm build`, percobaan awal                          | Gagal memuat konfigurasi karena `.vite-temp` hanya-baca. Hambatan sandbox.                                                                       |
| `pnpm build`, setelah `.vite-temp` memakai tmpfs      | Client/server berhasil dikompilasi; gagal pada adapter-node saat menghapus `build` (`Read-only file system`). Build lengkap belum terverifikasi. |
| `pnpm check:wali-asrama`, percobaan awal              | Terhalang penulisan `node_modules/.vite/_svelte_metadata.json`. Hambatan sandbox.                                                                |
| `pnpm check:wali-asrama`, setelah cache memakai tmpfs | Berhasil: 8 pemeriksaan lulus, database sementara dalam tmpfs.                                                                                   |
| `pnpm check:wali-asuh-excel`                          | Berhasil: 6 pemeriksaan lulus, database sementara dalam tmpfs.                                                                                   |
| `node --input-type=module -e '…new Response…'`        | Berhasil dijalankan; membuktikan penolakan header nama Unicode/newline dan penerimaan nama ASCII.                                                |

PnPM mengeluarkan `ERR_PNPM_META_FETCH_FAIL` ketika memeriksa pembaruan dirinya karena jaringan sandbox dinonaktifkan. Ini bukan bukti dependency aplikasi rusak; skrip lint/check/test tetap berjalan.

**Tidak dijalankan:** migrasi/cleanup/reset/seed database aplikasi, instalasi dependency, `format`, dev/start, pengemasan Windows, dan `prod`/`prod:signed` (mengawali proses dengan cleanup database). `tes-bell` tidak dijalankan karena merupakan pengujian perangkat/suara. Tidak ada skrip generik `test` pada manifest. Audit advisory daring dan eksploitasi HTTP aktif juga tidak dijalankan.

## Urutan perbaikan yang disarankan

1. Tutup akses lintas sekolah/kelas dan samakan guard impor dengan formulir (H-01, H-02).
2. Validasi rentang nilai dan identitas murid sebelum impor (H-03, M-02).
3. Jadikan penghitungan ulang nilai atomik dan penggantian database dapat dipulihkan (H-04, H-05).
4. Perbaiki encoding nama unduhan PDF (M-01).
5. Bersihkan peringatan lint/tooling dan tambahkan pengujian regresi untuk jalur di atas (L-01, L-02).
