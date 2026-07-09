# Pengembangan — Rapkumer

Dokumen ini berisi pedoman singkat untuk pengembang yang ingin menjalankan, membangun, atau
mengontribusikan kode ke proyek Rapkumer.

Catatan utama (ikuti pedoman ini untuk konsistensi proyek):

- Gunakan pnpm untuk semua perintah paket.
- Periksa tipe dan svelte-check sebelum linting.
- Gunakan runes Svelte (Svelte 5) dan pola komponen yang ada di `src/lib/components`.

## Persyaratan

- Node.js 20 LTS
- pnpm
- (Opsional) Inno Setup jika membuat installer Windows

## Skrip penting

- `pnpm install` — pasang dependensi
- `pnpm dev -- --port 5173` — jalankan server pengembangan (jika perlu ganti port ke 5174)
- `pnpm build` — buat build produksi
- `pnpm preview` — preview hasil build
- `pnpm db:push` — terapkan migrasi Drizzle ke database lokal
- `pnpm db:studio` — jalankan Drizzle Studio untuk inspeksi database
- `pnpm lint` — cek format dan linting (Prettier + ESLint)
- `pnpm check` — sinkronisasi SvelteKit + svelte-check (type checking)

Contoh pengembangan cepat:

```bash
pnpm install
pnpm dev -- --port 5173
```

## Database

- Database lokal disimpan di `data/database.sqlite3`.
- Gunakan `pnpm db:push` untuk menjalankan migrasi (skrip Drizzle ada di folder `drizzle/` dan `scripts/`).
- Untuk inspeksi, jalankan `pnpm db:studio`.

## Gaya & Pola

- UI: SvelteKit 2 + Svelte 5 (runes), TailwindCSS v4 + DaisyUI 5.
- Gunakan runes untuk props & state (`let { prop } = $props()`, `$state`, `$derived`). Hindari `export let` untuk pola lama.
- Pecah halaman kompleks ke `src/lib/components/**` untuk menjaga keterbacaan.
- Ikon di `src/lib/icons` dihasilkan oleh skrip `scripts/icon.js`.

## Menjalankan pemeriksaan sebelum PR

1. `pnpm check` — memeriksa sinkronisasi dan tipe
2. `pnpm lint` — cek format dan lint

Jika ada masalah tipe atau lint yang tidak jelas, jalankan `pnpm check:watch` saat memperbaiki.

## Migrasi dan seed

- File migrasi SQL disimpan di `drizzle/`.
- Skrip seed ada di `scripts/` (mis. `seed-default-admin.mjs`, `seed-tujuan-pembelajaran.mjs`).

## Pembuatan installer Windows

- Persiapkan environment signing sesuai `installer/`.
- Gunakan `pnpm package:win` atau langkah manual di `package.json`.

## Catatan keamanan

- Jangan commit kredensial atau file pfx/password ke repositori publik.
- Lokalkan file sensitif dan gunakan variabel lingkungan.

## Pertanyaan lebih lanjut

Jika butuh bantuan teknis terkait arsitektur kode atau migrasi, buka issue di GitHub dan sertakan detail lingkungan
dan langkah reproduksi.
