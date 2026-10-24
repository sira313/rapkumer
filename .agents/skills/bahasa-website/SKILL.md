---
name: bahasa-website
description: "Menulis teks situs web dan antarmuka berbahasa Indonesia: UX writing, microcopy, label tombol, pesan galat/error, empty state, form, notifikasi, onboarding, halaman landing, halaman produk, tentang kami, FAQ, halaman 404. WAJIB dipakai saat pengguna meminta 'copy website', 'teks landing page', 'microcopy', 'UX writing', 'pesan error', 'wording tombol', 'copy halaman', 'konten web company profile', atau teks apa pun yang akan tampil di situs/aplikasi berbahasa Indonesia. (Indonesian website copy & UX writing.)"
---

# Bahasa Website

Skill ini menumpuk di atas `bahasa-inti`: semua larangan dan pemeriksaan di sana berlaku penuh. Kalau tersedia, baca juga [../bahasa-inti/references/frasa-terlarang.md](../bahasa-inti/references/frasa-terlarang.md).

Teks antarmuka berbeda dari artikel: dibaca sepintas, di tengah tugas, sering dalam keadaan kesal. Standarnya empat, rumusan praktisi UX writing Indonesia (dwinawan.com; UX writer Gojek dan tiket.com memakai varian serupa): **jelas** (tak multitafsir), **ringkas** (tak berbelit), **konsisten** (istilah dan nada sama di seluruh produk), **berguna** (memandu tindakan berikutnya). Kalau harus memilih, jelas mengalahkan ringkas, dan keduanya mengalahkan lucu.

## Tiga keputusan sebelum menulis

1. **Persona produk**: bayangkan produk ini manusia. Teman? Asisten? Konsultan? (Metode praktisi Gojek dan tiket.com.) Semua teks keluar dari satu mulut itu.
2. **Sapaan**: _kamu_ (aplikasi konsumen) atau _Anda_ (finansial, B2B, dokumen legal). Satu produk satu sapaan, sampai ke pesan galat terdalam.
3. **Glosarium istilah**: sebelum menulis banyak layar, tetapkan istilah untuk konsep yang berulang (lihat tabel di bawah). Kalau produk sudah hidup, ikuti istilah yang ada; jangan memperkenalkan sinonim.

## Istilah antarmuka baku

Tidak ada standar nasional "Masuk vs Login"; yang mutlak adalah **konsistensi internal**. Default paket ini: padanan Indonesia.

| Konsep                 | Default                                        | Catatan                     |
| ---------------------- | ---------------------------------------------- | --------------------------- |
| Log in / Sign in       | **Masuk**                                      |                             |
| Sign up / Register     | **Daftar**                                     |                             |
| Log out                | **Keluar**                                     |                             |
| Password               | **Kata sandi**                                 |                             |
| Submit                 | **Kirim** (atau verba hasilnya: Simpan, Bayar) | jangan "Submit"             |
| Save / Cancel / Delete | **Simpan / Batal / Hapus**                     |                             |
| Next / Back            | **Lanjut / Kembali**                           |                             |
| Retry                  | **Coba lagi**                                  |                             |
| Search                 | **Cari**                                       |                             |
| Settings               | **Pengaturan**                                 |                             |
| Upload / Download      | **Unggah / Unduh**                             |                             |
| Edit                   | **Ubah**                                       | "Edit" diterima; pilih satu |
| Sign in with Google    | **Masuk dengan Google**                        |                             |

Kalau produk sudah telanjur memakai "Login", pakai "Login" di semua tempat: campuran "Masuk" di satu layar dan "Login" di layar lain lebih buruk daripada pilihan mana pun.

## Aturan per komponen

**Tombol**: verba yang menyebut hasil aksi, maksimal ±3 kata: "Simpan perubahan", "Buat akun", "Bayar Rp150.000". Jangan "Klik di sini", "OK", "Ya/Tidak" untuk aksi yang punya akibat. Register tombol sama dengan register teks di atasnya (badan formal + tombol "Gaskeun" adalah cacat konsistensi).

**Pesan galat**: pola wajibnya **apa yang terjadi (bahasa awam) + cara memperbaiki**, tanpa menyalahkan, tanpa jargon, tanpa kode telanjang.

- ❌ "Terjadi kesalahan. Silahkan coba lagi." (kosong, plus salah eja)
- ❌ "Error 422: Unprocessable Entity"
- ❌ "Karena Anda salah memasukkan data…" (menyalahkan)
- ✅ "Kata sandi salah. Coba lagi, atau atur ulang lewat 'Lupa kata sandi'."
- ✅ "Koneksi terputus. Cek Wi-Fi atau kuotamu, lalu coba lagi." (+ tombol "Coba lagi")

**Empty state**: tiga tugas. Katakan kondisinya kosong, katakan cara mengisinya, beri satu tombol mulai. Contoh pola Tokopedia: "Wishlist-mu masih kosong" + cara menambah + tombol "Telusuri Produk".

**Form**: label selalu tampak (placeholder bukan pengganti label); pesan validasi spesifik per kesalahan ("Email belum pakai @", bukan "input tidak valid"); teks bantuan sebelum kesalahan terjadi untuk format yang ketat (kata sandi, NIK).

**Konfirmasi aksi destruktif**: sebut objek dan akibatnya, tombol menyebut aksinya. "Hapus 3 foto? Foto yang dihapus tidak bisa dikembalikan." [Batal] [Hapus]. Jangan "Apakah Anda yakin?" [Ya] [Tidak].

**Notifikasi & toast**: satu kalimat, kabar dulu baru detail: "Pesanan dikirim. Perkiraan tiba Kamis." Jangan membuka notifikasi dengan "Selamat! 🎉" untuk hal rutin.

## Halaman (landing, produk, tentang kami)

- **Headline landing**: manfaat spesifik dalam ±10 kata, bukan slogan. "Situs company profile tayang 14 hari, mulai Rp2 juta" mengalahkan "Solusi digital terbaik untuk bisnis Anda". Subheadline menjelaskan mekanisme/untuk siapa.
- Bukti dekat klaim: angka, logo klien, testimoni bernama, di layar yang sama dengan klaimnya.
- Satu halaman satu CTA primer, diulang, dengan label konsisten.
- **Tentang kami**: cerita spesifik (tahun berdiri, siapa, kenapa, angka), bukan "berkomitmen memberikan solusi terbaik dengan mengedepankan profesionalisme".
- **FAQ**: pertanyaan yang benar-benar ditanyakan pengguna, dijawab langsung di kalimat pertama. FAQ bukan tempat menjejalkan kata kunci.
- **404**: akui halamannya tak ada, beri jalan pulang (Cari / Beranda / tautan populer). Boleh sedikit bermain kalau persona mendukung; jalan keluar tetap wajib.

Rincian komponen dan halaman: [references/ux-writing.md](references/ux-writing.md) dan [references/halaman-situs.md](references/halaman-situs.md).

## Contoh transformasi

> ❌ Tombol: "KLIK DISINI UNTUK INFORMASI SELENGKAPNYA!"
> ✅ "Lihat detail paket"

> ❌ Hero: "Selamat datang di website kami. Kami adalah perusahaan yang bergerak di bidang teknologi informasi yang berkomitmen memberikan solusi terbaik."
> ✅ "Aplikasi kasir untuk warung dan kafe kecil. Catat penjualan, stok, dan laba dari satu ponsel. Gratis untuk 1 outlet."

> ❌ Galat unggah: "Upload gagal. Silahkan ulangi kembali lagi."
> ✅ "Fotonya kebesaran (maks. 5 MB). Kompres dulu, lalu unggah lagi."

## Pemeriksaan tambahan website

Setelah pemeriksaan `bahasa-inti`:

1. Semua label untuk konsep yang sama identik di seluruh layar/halaman?
2. Sapaan seragam sampai pesan galat dan email transaksional?
3. Tiap pesan galat menyebut cara keluar dari masalah?
4. Tombol menyebut hasil aksinya?
5. Headline bisa dipahami dalam sekali baca oleh orang yang baru tiba?
6. Teks masih benar saat dipotong (tombol sempit, notifikasi satu baris)?

## Referensi

| Berkas                                                     | Isi                                                                                                        | Baca ketika                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| [references/ux-writing.md](references/ux-writing.md)       | Komponen antarmuka: tombol, galat, form, empty state, onboarding, notifikasi + studi kasus Gojek/Tokopedia | Menulis microcopy aplikasi/antarmuka |
| [references/halaman-situs.md](references/halaman-situs.md) | Halaman: landing, produk, harga, tentang kami, FAQ, 404                                                    | Menulis copy halaman penuh           |
