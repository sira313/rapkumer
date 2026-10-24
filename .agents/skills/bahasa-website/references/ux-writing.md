# UX Writing: Komponen Antarmuka

Empat standar (jelas, ringkas, konsisten, berguna) diturunkan ke tiap komponen. Contoh memakai sapaan _kamu_; ganti _Anda_ untuk produk formal, dan jangan campur.

## Suara produk

Personifikasi (metode praktisi Gojek dan tiket.com): tulis dulu 3 kata sifat persona produk (misalnya "teman yang sigap, hangat, tidak lebay"), lalu uji tiap teks: "apakah orang ini akan mengatakannya begini?"

Contoh pilar suara Gojek sebagai referensi (bukan default semua produk): _colloquial_ (bahasa sehari-hari, boleh humor receh), _bright_ (saat gagal pun melihat sisi terang, tidak mengeluh), _empathetic_ (fokus menolong pengguna). Bank digital akan memilih pilar berbeda: tenang, presisi, meyakinkan.

Empati bukan berarti meminta maaf berlebihan. Satu "maaf" pada kegagalan sistem cukup; tiga "mohon maaf atas ketidaknyamanannya" dalam satu alur terasa seperti robot yang panik.

## Tombol & tautan

- Verba + objek/hasil: "Simpan perubahan", "Kirim ulasan", "Bayar Rp150.000" (menyebut nominal di tombol pembayaran mengurangi kaget).
- Larangan: "Klik di sini", "Submit", "OK" untuk aksi berakibat, "Ya/Tidak" pada dialog destruktif.
- Pasangan aksi: primer memakai verba aksi; sekunder "Batal" atau alternatif jujur ("Nanti saja").
- Tautan inline menyebut tujuannya: "Lihat syarat lengkap", bukan "di sini".
- Kapitalisasi label: gaya kalimat ("Simpan perubahan"), bukan Title Case; konsisten seproduk.

## Pesan galat

Pola: **[apa yang terjadi, bahasa awam] + [cara memperbaiki] (+ tombol aksi)**. Tanpa menyalahkan ("karena Anda…"), tanpa dramatisasi ("GAGAL TOTAL"), tanpa jargon ("unprocessable entity").

| Situasi                  | Buruk                      | Baik                                                                                                        |
| ------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Validasi email           | "Email tidak valid"        | "Formatnya belum lengkap. Contoh: nama@domain.com"                                                          |
| Login gagal              | "Autentikasi gagal"        | "Email atau kata sandi salah. Coba lagi, atau klik 'Lupa kata sandi'."                                      |
| Koneksi                  | "Network error occurred"   | "Internetmu terputus. Cek koneksi, lalu coba lagi." + [Coba lagi]                                           |
| Server (5xx)             | "Terjadi kesalahan sistem" | "Servernya lagi bermasalah, bukan salahmu. Tunggu sebentar, lalu coba lagi. Masih gagal? Hubungi kami di …" |
| Stok habis saat checkout | "Item unavailable"         | "Yah, ukuran M baru saja habis. Ukuran L masih ada, atau simpan dulu di wishlist?"                          |

Metafora lokal (gaya Gojek: server sibuk itu "padat merayap") hanya bila persona produk memang bermain, dan cara keluar dari masalah tetap wajib disebut.

## Form

- Label di atas kolom, selalu tampak. Placeholder berisi contoh isian ("cth: 081234567890") dan hilang saat diketik; karena itu, placeholder bukan pengganti label.
- Teks bantuan _sebelum_ galat untuk format ketat: "Min. 8 karakter dengan 1 angka".
- Validasi inline saat pengguna selesai mengisi kolom, bukan setelah tombol kirim.
- Satu pesan galat per kolom, spesifik. Jangan merangkum "Ada 3 kesalahan pada form" tanpa menandai kolomnya.
- Kolom opsional ditandai "(opsional)", bukan menandai yang wajib dengan asterisk saja.
- Minta data seperlunya; tiap kolom tambahan menurunkan penyelesaian form.

## Empty state

Tiga tugas: (1) nyatakan kosong, (2) katakan cara mengisi, (3) satu tombol mulai.

> ❌ "Belum ada data."
> ✅ "Belum ada transaksi bulan ini. Transaksi pertamamu akan muncul di sini begitu ada penjualan. [Buat transaksi]"

Pola Tokopedia (wishlist): "Yah, Wishlist-mu masih kosong" + cara menambah ("ketuk ♡ pada produk idamanmu") + [Telusuri Produk]. Perhatikan "produk idaman": padanan yang terasa Indonesia, bukan terjemahan kaku "daftar keinginan".

## Onboarding & permission

- Minta izin (notifikasi, lokasi, kamera) dengan alasan bernilai bagi pengguna, tepat sebelum dibutuhkan: "Nyalakan notifikasi biar tahu pas pesananmu sampai". Bukan di detik pertama buka aplikasi.
- Layar perkenalan maksimal 3, masing-masing satu manfaat konkret; sediakan "Lewati".
- Jangan mengajari yang sudah jelas ("Ini tombol beranda").

## Notifikasi, toast, dialog

- Toast sukses: kabar + detail penting: "Tersimpan. Draf bisa diakses di menu Draf." Hilang sendiri; jangan pakai toast untuk galat yang butuh tindakan.
- Push notification: baris pertama berisi isi utamanya, bukan "Halo!", karena pengguna memutuskan dari lockscreen. Jangan kirim "Kami kangen kamu 🥺" tanpa isi.
- Dialog interupsi hanya untuk keputusan yang benar-benar menghentikan alur. Judul berupa pertanyaannya; tombol berupa jawabannya ("Simpan sebagai draf?" [Buang] [Simpan]).

## Mikrodetail yang sering salah

- "Silakan" (bukan _silahkan_). Kebanyakan kalimat perintah antarmuka bahkan tak butuh "silakan": "Masukkan email" sudah sopan.
- "Gratis" tidak perlu "100%".
- Angka di antarmuka pakai format Indonesia: Rp1.500.000; "10rb" boleh untuk ruang sempit, konsisten.
- Tanggal: "14 Sep 2026" atau "14 September 2026"; jangan campur "Sep 14".
- Zona waktu disebut bila relevan: "Webinar 19.00 WIB".
- Elipsis pada proses berjalan: "Mengunggah…", bukan "Mengunggah...." (empat titik).
