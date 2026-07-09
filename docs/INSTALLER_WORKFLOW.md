# Alur Kerja Installer RapkumerSetup.exe

## ⚡ Cheat Sheet (Jangan Lupa!)

> **Setiap kali ubah script di folder `scripts/`:**
>
> 1. Jalankan: `node scripts/sync-to-installer.mjs`
> 2. Test: `pnpm package:win`
> 3. Cek: `ls dist/windows/stage/Rapkumer/scripts/` (file wajib ada?)
> 4. Deploy: `pnpm prod` atau `pnpm prod:signed`

> **File-file penting (jangan sampai hilang dari installer):**
>
> - 🔴 `ensure-columns.mjs` ← Menambah kolom di database (PENTING BANGET!)
> - 🔴 `start-build.mjs` ← Starter aplikasi (PENTING BANGET!)
> - ✅ `fix-drizzle-indexes.mjs` ← Buat index database
> - ✅ `migrate-installed-db.mjs` ← Migrasi database
> - ✅ `seed-default-admin.mjs` ← Buat akun admin
> - ✅ `grant-admin-permissions.mjs` ← Kasih permission
> - ✅ `notify-server-reload.mjs` ← Notifikasi reload

> **Kalau install gagal, biasanya karena:**
>
> - ❌ Error: "no such column: permissions" → `ensure-columns.mjs` hilang
> - ❌ Error: "start-build.mjs not found" → Script launcher hilang
> - ✅ Solusi: Jalankan `pnpm package:win` dulu sebelum bikin installer

---

## Overview

Folder `installer/` isinya konfigurasi untuk membuat **RapkumerSetup.exe** (installer Windows).

Keunikan installer ini:

- 👤 Instalasi per-user (tidak perlu admin, cuma di folder `AppData` user)
- 🔒 Aman (data terpisah dari aplikasi)
- 🔄 Gampang update (cukup jalankan installer lagi)

---

## File-File Penting

### 1. **rapkumer.iss** - Resep Installer

File ini berisi "resep" cara membuat installer:

| Bagian    | Apa Isinya?                                   |
| --------- | --------------------------------------------- |
| `[Setup]` | Pengaturan umum (nama, versi, folder install) |
| `[Files]` | File apa aja yang dikopiin ke komputer user   |
| `[Run]`   | Script apa yang dijalankan saat install       |
| `[Icons]` | Shortcut di Start Menu dan Desktop            |
| `[Code]`  | Logika khusus (menggunakan Pascal/PowerShell) |

**Pengaturan penting:**

```ini
DefaultDirName={localappdata}\Rapkumer         # Folder user, bukan C:\Program Files
PrivilegesRequired=lowest                      # Tidak perlu admin
ArchitecturesAllowed=x64compatible             # Hanya 64-bit
```

---

## Tahap-Tahap Instalasi

### **Tahap 1: Wizard Instalasi**

User jalankan `RapkumerSetup.exe` → Muncul kotak dialog:

- Pilih mau install di mana (default: `AppData\Local\Rapkumer`)
- Pilih folder Start Menu (default: Rapkumer)
- Klik "Install"

### **Tahap 2: Kopiin File**

Installer kopiin file dari `dist/windows/stage/Rapkumer/` ke folder instalasi user:

```
Folder yang dikopiin:
├── build/                  ← Aplikasi sudah di-build
├── static/                 ← File gambar, CSS, dll
├── data/database.sqlite3   ← Database template
├── scripts/                ← Script migrasi
└── drizzle/                ← File database schema
```

Semua file ini masuk ke: **`%LOCALAPPDATA%\Rapkumer`**

### **Tahap 3: Setup Folder Data User**

Setelah file dikopiin, Inno Setup menjalankan script Pascal untuk:

1. **Buat folder data terpisah** di `%LOCALAPPDATA%\Rapkumer-data\`
   - Di sini nanti tempat database asli user
   - Terpisah dari aplikasi (jadi bisa update app tanpa khawatir data hilang)

2. **Kopiin database template** ke folder data user
   - Dari: `%LOCALAPPDATA%\Rapkumer\data\database.sqlite3`
   - Ke: `%LOCALAPPDATA%\Rapkumer-data\database.sqlite3`

3. **Buat folder logs** di `%LOCALAPPDATA%\Rapkumer-data\logs\`
   - Nanti untuk nyimpan log aplikasi

4. **Bikin file `.env`** di `%LOCALAPPDATA%\Rapkumer\.env`
   - Berisi konfigurasi database path, ukuran upload file, dll

### **Tahap 4: Migrasi Database**

Ini tahap kritis! Installer menjalankan script untuk:

1. **Cek kolom database yang hilang** dan tambahkan jika perlu
   - Misalnya kolom `permissions` di tabel `auth_user`
   - Kolom `sekolah_id` di berbagai tabel
   - Script: `ensure-columns.mjs` (JANGAN SAMPAI HILANG!)

2. **Perbaiki index database yang duplikat**
   - Kadang database lama punya index dengan nama aneh
   - Script: `fix-drizzle-indexes.mjs`

3. **Jalankan semua migration**
   - Apply semua perubahan schema dari folder `drizzle/`
   - Menggunakan: `drizzle-kit push`

4. **Buat akun admin default**
   - Username: Admin
   - Password: Admin123
   - Script: `seed-default-admin.mjs`

5. **Kasih permission ke admin**
   - Script: `grant-admin-permissions.mjs`

---

### **Perbedaan Instalasi vs Development**

Kedua-duanya pakai script yang sama (`migrate-installed-db.mjs`), tapi ada perbedaan:

| Hal                  | Development (`pnpm db:push`)                      | Saat Install                                      |
| -------------------- | ------------------------------------------------- | ------------------------------------------------- |
| **Database Mana**    | Database lokal di `data/database.sqlite3`         | Database user di `Rapkumer-data/database.sqlite3` |
| **Deteksi Otomatis** | Cek apakah ada `data/database.sqlite3` di project | Cek apakah script running dari folder `AppData`   |
| **Kalau Ada Error**  | Langsung stop, tampilkan error                    | Coba ulang, bersihkan index lama, coba lagi       |
| **Cek Kolom**        | Cek kolom yang diperlukan                         | Cek 6 kolom yang diperlukan, tambah jika kurang   |

**Hasilnya:**

- **Di development**: Database di project folder
- **Di installer**: Database di user data folder

---

### **⚠️ Masalah yang Pernah Terjadi**

**Kronologinya:**

1. Developer jalankan `pnpm db:push` → berhasil, semua kolom teradd
2. Developer buat installer dengan `pnpm package:win`
3. **Tapi file `ensure-columns.mjs` tidak dikopiin ke staging folder!**
4. User install → migrasi database jalan tapi tanpa `ensure-columns.mjs`
5. Script fallback ke cek inline (tapi tidak lengkap)
6. Kolom `permissions` tidak ditambah
7. Script `seed-default-admin` coba query field `permissions` → ERROR!

**Penyebabnya:**

- Script migrasi cek: "Ada `ensure-columns.mjs` tidak?"
- Kalau ada: pakai file itu
- Kalau tidak ada: pakai fallback inline (tapi tidak semua kolom dicek)
- `ensure-columns.mjs` ada di `scripts/` tapi tidak dikopiin ke staging

**Solusinya:**
Update `prepare-windows.ps1` untuk kopiin `ensure-columns.mjs` ke staging

---

### **Cara Kerja Script Sync**

Ada 2 mekanisme untuk keep script tetap up-to-date:

#### **1. `sync-to-installer.mjs` (Waktu Build Production)**

```bash
node scripts/sync-to-installer.mjs
```

Ini kopiin file dari `scripts/` ke `installer/scripts/`:

- `ensure-columns.mjs`
- `fix-drizzle-indexes.mjs`
- `grant-admin-permissions.mjs`
- `migrate-installed-db.mjs`
- `start-build.mjs`
- `notify-server-reload.mjs`
- `seed-default-admin.mjs`

**Dijalankan otomatis saat:**

- `pnpm prod`
- `pnpm prod:signed`

**Tujuan:** Pastikan `installer/scripts/` selalu fresh dengan `scripts/` terbaru

---

#### **2. `prepare-windows.ps1` (Waktu Staging)**

```bash
pnpm package:win
```

Ini langsung kopiin dari `scripts/` ke **staging folder** (`dist/windows/stage/Rapkumer/scripts/`):

1. Build aplikasi
2. Jalankan migrasi database (untuk template DB)
3. **Kopiin script ke staging** (termasuk `ensure-columns.mjs` dan `start-build.mjs`)
4. Kopiin drizzle config
5. Install production dependencies

**File yang dikopiin ke staging:**

```powershell
'ensure-columns.mjs'           # ← PENTING!
'fix-drizzle-indexes.mjs'
'seed-default-admin.mjs'
'grant-admin-permissions.mjs'
'notify-server-reload.mjs'
'start-build.mjs'              # ← PENTING!
```

---

#### **Perbedaan Keduanya**

|                         | `sync-to-installer.mjs`          | `prepare-windows.ps1`                  |
| ----------------------- | -------------------------------- | -------------------------------------- |
| **Kopiin ke mana?**     | `installer/scripts/`             | `dist/windows/stage/Rapkumer/scripts/` |
| **Kapan dijalankan?**   | `pnpm prod` / `pnpm prod:signed` | `pnpm package:win`                     |
| **Masuk ke installer?** | Belum (perlu `package:win` juga) | Ya (via Inno Setup)                    |

---

#### **Alurnya Begini:**

**Development/Testing:**

```
Ubah script di scripts/
    ↓
pnpm package:win kopiin
    ↓
File masuk ke dist/windows/stage/Rapkumer/scripts/
    ↓
Inno Setup ambil dari sini
    ↓
RapkumerSetup.exe include
    ↓
User install → File ada ✓
```

**Production Release:**

```
Ubah script di scripts/
    ↓
pnpm prod jalankan sync-to-installer.mjs
    ↓
File kopiin ke installer/scripts/
    ↓
pnpm prod jalankan package:win
    ↓
File kopiin ke dist/windows/stage/Rapkumer/scripts/
    ↓
Inno Setup ambil dari sini
    ↓
RapkumerSetup.exe include
    ↓
User install → File ada ✓
```

---

#### **Yang Perlu Dikerjakan Kalau Ubah Script:**

```bash
# 1. Edit script di scripts/
nano scripts/ensure-columns.mjs

# 2. Sync ke installer folder
node scripts/sync-to-installer.mjs

# 3. Test dengan staging
pnpm package:win

# 4. Cek hasilnya
ls dist/windows/stage/Rapkumer/scripts/
# Pastikan ensure-columns.mjs ada di sini

# 5. Kalau production release:
pnpm prod          # atau pnpm prod:signed
```

---

## Tahap 5: Shortcut & Manual Migration Helper

Installer membuat 2 shortcut untuk menjalankan aplikasi:

1. **Start Menu** → `Programs → Rapkumer → Rapkumer`
2. **Desktop** → `Rapkumer` icon

Ketika diklik shortcut, jalankan:

```cmd
node start-rapkumer.mjs
```

**Bonus: `run-migrations.bat`** (Optional untuk pengguna)

Installer juga menyertakan `run-migrations.bat` sebagai convenience wrapper. Pengguna bisa double-click file ini untuk **manual re-run migrations** setelah instalasi (misalnya jika ada update database schema):

```cmd
@echo off
REM Convenience wrapper untuk manual migration
node scripts\migrate-installed-db.mjs
```

---

## Saat User Klik Shortcut

### **Script `start-rapkumer.mjs` Melakukan:**

1. **Pastikan folder ada**
   - Logs folder di `Rapkumer-data/logs/`
   - Data folder di `Rapkumer-data/`

2. **Kopiin database kalau belum ada**
   - Dari: `Rapkumer/data/database.sqlite3` (template)
   - Ke: `Rapkumer-data/database.sqlite3` (data asli)

3. **Setup konfigurasi**

   ```
   PORT = 3000
   NODE_ENV = production
   DB_URL = file:C:\Users\...\Rapkumer-data\database.sqlite3
   BODY_SIZE_LIMIT = 5MB
   ```

4. **Jalankan aplikasi background**
   - Spawn process: `start-build.mjs`
   - Sebagai background (detached), jadi launcher bisa exit
   - Output ke log file

5. **Tunggu server siap**
   - Cek port 3000 aktif (max 10x percobaan)

6. **Catat semua di log**
   - Semua output ke: `Rapkumer-data/logs/rapkumer.log`

### **Script `start-build.mjs` Melakukan:**

Ini adalah server aplikasi sesungguhnya:

1. Baca file `.env` (konfigurasi database path, port, dll)
2. Connect ke database SQLite
3. Jalankan database migrations
4. Listen di port 3000
5. Serve aplikasi web

Semua log tercatat di file log user.

---

## Struktur Folder Setelah Install

```
Folder Instalasi (C:\Users\...\AppData\Local\Rapkumer\):
├── build/                     ← Aplikasi sudah compiled
├── static/                    ← Asset gambar, CSS, font
├── data/
│   └── database.sqlite3       ← Template database awal
├── scripts/                   ← Script migrasi
├── drizzle/                   ← Database schema & migration
├── rapkumer.ico               ← Icon aplikasi
├── start-rapkumer.mjs         ← Launcher aplikasi
├── .env                       ← Konfigurasi (dibikin saat install)
└── package.json               ← Dependencies untuk production

Folder Data User (C:\Users\...\AppData\Local\Rapkumer-data\):
├── database.sqlite3           ← Database asli yang dipakai
├── uploads/                   ← Tempat user upload foto, dokumen
└── logs/
    └── rapkumer.log           ← Log aplikasi setiap hari
```

---

## Yang Perlu Diketahui

| Hal                     | Penjelasan                                                                        |
| ----------------------- | --------------------------------------------------------------------------------- |
| **Per-User Install**    | Setiap user punya instalasi sendiri, data sendiri                                 |
| **Tidak Perlu Admin**   | User biasa bisa install tanpa privilege khusus                                    |
| **Data Terpisah**       | App di `Rapkumer/`, data di `Rapkumer-data/` (jadi update app gak menghapus data) |
| **Node.js Wajib**       | Installer tidak bawa Node.js, user harus install sendiri                          |
| **Aplikasi Background** | Launcher keluar, tapi app tetap jalan background                                  |
| **Log Tersimpan**       | Semua output ke file, bukan di console yang terlihat user                         |
| **Database Bundled**    | Database template disertakan, dicopy per-user saat pertama kali run               |
| **Auto-Migrate**        | Database schema otomatis diupgrade via Drizzle                                    |

---

## Kalau Ada Masalah

### ❌ "Node.js not found"

Artinya: User belum install Node.js atau tidak di PATH

- Suruh user: Install Node.js dulu

### ❌ Aplikasi tidak jalan setelah install

Cek: `C:\Users\USERNAME\AppData\Local\Rapkumer-data\logs\rapkumer.log`

- Lihat error message di file log

### ❌ Database error saat install

Lihat: Apakah script migrasi berhasil jalankan?

- Cek log: `Rapkumer-data\logs\rapkumer.log`

### ✅ Mau reinstall atau update

- Jalankan installer lagi
- App akan terupdate, data user tetap aman di `Rapkumer-data/`

---

## Checklist Sebelum Build Installer

Sebelum jalankan `pnpm package:win` atau `pnpm prod`:

```bash
# 1. Sinkronisasi script ke installer folder
node scripts/sync-to-installer.mjs

# 2. Update database
pnpm db:push

# 3. Build aplikasi
pnpm build

# 4. Buat staging folder
pnpm package:win

# 5. Verifikasi file penting ada
ls dist/windows/stage/Rapkumer/scripts/ | grep -E "(ensure-columns|start-build)"
# Output harus:
# ensure-columns.mjs
# start-build.mjs

# 6. Cek template database
ls -lh data/database.sqlite3
# Size harus > 100KB

# 7. Cek .env di staging
cat dist/windows/stage/Rapkumer/.env
# Harus ada: DB_URL, BODY_SIZE_LIMIT
```

**Kalau ada yang kurang:**

```bash
# Bersihkan dan rebuild
rm -rf dist/windows/stage
pnpm package:win
```

**Baru jalankan:**

```bash
# Untuk development/testing
pnpm package:win

# Untuk production release
pnpm prod                # Tanpa signature
pnpm prod:signed         # Dengan digital signature
```

---

## File-File Penting

### 1. **rapkumer.iss** - Resep Installer

File ini berisi "resep" cara membuat installer:

| Bagian      | Deskripsi                                          |
| ----------- | -------------------------------------------------- |
| **[Setup]** | Konfigurasi global installer                       |
| **[Files]** | File yang akan disalin ke komputer pengguna        |
| **[Run]**   | Skrip yang dijalankan selama instalasi             |
| **[Icons]** | Shortcut yang dibuat di Start Menu & Desktop       |
| **[Code]**  | Logic khusus (PowerShell/Pascal) untuk kustomisasi |

**Konfigurasi Penting:**

```ini
DefaultDirName={localappdata}\Rapkumer
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
```

- **Instalasi per-user**: App disimpan di `%LOCALAPPDATA%\Rapkumer` (folder pengguna, bukan C:\Program Files)
- **Tidak perlu admin**: Dengan `PrivilegesRequired=lowest`, installer berjalan tanpa privilege khusus
- **64-bit only**: Hanya untuk arsitektur x64compatible

---

## Tahap-Tahap Instalasi

### **Fase 1: Pre-Installation (Wizard)**

User menjalankan `RapkumerSetup.exe` → Inno Setup wizard ditampilkan:

- Pilih folder instalasi (default: `%LOCALAPPDATA%\Rapkumer`)
- Pilih Start Menu group (default: Rapkumer)
- Konfirmasi instalasi

### **Fase 2: File Copying**

**Source**: `dist/windows/stage/Rapkumer/`
**Destination**: `%LOCALAPPDATA%\Rapkumer/`

File yang disalin:

```
├── build/              (SvelteKit production build)
├── static/             (Assets statis)
├── data/database.sqlite3  (Database template awal)
├── rapkumer.ico        (Icon aplikasi)
└── start-rapkumer.mjs  (Script launcher)
```

### **Fase 3: Post-Install Script (Inno Setup [Code])**

Di bagian **[Code]**, procedure `CurStepChanged()` dijalankan saat `ssPostInstall`:

```pascal
DbPath := ExpandConstant('{localappdata}\Rapkumer-data\database.sqlite3');
DbDir := ExtractFileDir(DbPath);
if not DirExists(DbDir) then
    ForceDirectories(DbDir);
```

**Yang terjadi:**

1. **Buat folder data pengguna**: `%LOCALAPPDATA%\Rapkumer-data\`
   - Folder ini menyimpan database & logs per-user (terpisah dari app folder)

2. **Copy database awal** (jika belum ada):

   ```
   Sumber: %LOCALAPPDATA%\Rapkumer\data\database.sqlite3
   Tujuan: %LOCALAPPDATA%\Rapkumer-data\database.sqlite3
   ```

3. **Buat folder logs**: `%LOCALAPPDATA%\Rapkumer-data\logs\`

4. **Generate file `.env`** di `%LOCALAPPDATA%\Rapkumer\.env`:
   ```env
   DB_URL="file:C:\Users\USERNAME\AppData\Local\Rapkumer-data\database.sqlite3"
   BODY_SIZE_LIMIT=5M
   photo="file:C:\Users\USERNAME\AppData\Local\Rapkumer-data\uploads"
   ```

### **Fase 4: Migrasi Database (Setup [Run])**

Setelah post-install, installer **langsung menjalankan** migration script via Node:

```cmd
node "{app}\scripts\migrate-installed-db.mjs"
```

**Yang dilakukan oleh migration script (`migrate-installed-db.mjs`):**

1. **Deteksi database path**: Tentukan lokasi database user di `Rapkumer-data/`

2. **Pre-check kolom**: Cek apakah kolom yang diperlukan sudah ada:
   - `tasks.sekolah_id`
   - `kelas.sekolah_id`
   - `mata_pelajaran.kelas_id`
   - `auth_user.permissions` dan kolom lainnya
   - Jika tidak ada, tambahkan via `ensure-columns.mjs`

3. **Fix Drizzle Indexes**: Jalankan `fix-drizzle-indexes.mjs`
   - Mengatasi duplicate index errors dari versi database lama

4. **Drizzle Push**: Jalankan `drizzle-kit push`
   - Apply semua migration di folder `drizzle/` ke database pengguna

5. **Additional Checks**: Jalankan script validasi lanjutan

---

### **Perbedaan Fase 4 vs `pnpm db:push` di Development**

#### **Context Sama: Script yang Sama**

Keduanya menggunakan **script yang sama**: `scripts/migrate-installed-db.mjs`

```json
// package.json
"db:push": "node scripts/migrate-installed-db.mjs"
```

Di development, jalankan: `pnpm db:push`  
Di instalasi, jalankan langsung via: `node scripts/migrate-installed-db.mjs`

#### **Perbedaan Utama**

| Aspek                     | Development (`pnpm db:push`)                                        | Fase 4 (Installer)                                                                                                  |
| ------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Context Deteksi**       | Script di `project-root/scripts/` → gunakan `data/database.sqlite3` | Script mendeteksi folder app di `%LOCALAPPDATA%/Rapkumer` → gunakan `%LOCALAPPDATA%/Rapkumer-data/database.sqlite3` |
| **DB_URL**                | Tidak ada env → gunakan project-local DB                            | Env `DB_URL` sudah di-set oleh batch/PowerShell → gunakan installed path                                            |
| **Detect Path Logic**     | Cek: `project-root/data/database.sqlite3` ada?                      | Cek: project path di dalam `%LOCALAPPDATA%`? → looksInstalled = true                                                |
| **Database Target**       | Dev: `repo-root/data/database.sqlite3`                              | Installed: `%LOCALAPPDATA%/Rapkumer-data/database.sqlite3`                                                          |
| **Error Handling**        | Standar: fail jika ada error                                        | **Lebih ketat**: Coba drop index lama (cleanup), re-try push, baru fail                                             |
| **Pre-Migration Cleanup** | Minimal                                                             | **Aggressive**: Drop legacy indexes (e.g. `auth_user_usernameNormalized_unique` dari versi lama)                    |
| **Kolom Missing**         | Fix jika diperlukan                                                 | **Pre-check ekstensif**: Pastikan `sekolah_id`, `kelas_id` dll ada sebelum push                                     |

#### **Logika Deteksi Path (Kunci Perbedaan)**

```javascript
// Dalam migrate-installed-db.mjs

const envDb = process.env.DB_URL;
let dbPath;

if (envDb) {
	// Fase 4: batch/PS sudah set DB_URL
	dbPath = envDb; // → %LOCALAPPDATA%/Rapkumer-data/database.sqlite3
} else {
	// Development: tidak ada env, deteksi secara otomatis
	const looksInstalled = projectRoot.startsWith(localAppData);

	if (looksInstalled) {
		// Installer case
		dbPath = `file://${localAppData}/Rapkumer-data/database.sqlite3`;
	} else {
		// Dev case
		dbPath = `file://${projectRoot}/data/database.sqlite3`;
	}
}
```

**Kesimpulannya:**

- **Di development**: Jalankan `pnpm db:push` → script deteksi `$PWD` bukan di `AppData` → gunakan `data/database.sqlite3`
- **Di installer (Fase 4)**: Batch set `DB_URL=file:...` → script gunakan langsung, tidak perlu deteksi

#### **Error Recovery: Installer Lebih Resilient**

**Development:**

```bash
pnpm db:push
# Jika error index → output error, fail immediately
```

**Installer (Fase 4):**

```javascript
// 1. Pre-cleanup: scan & drop legacy indexes
// 2. Cek missing columns, tambah jika perlu
// 3. Try drizzle push
// 4. If "index already exists" error:
//    - Parse error message untuk nama index
//    - DROP INDEX
//    - Retry drizzle push (1x)
//    - Jika masih fail: run fix-drizzle-indexes.mjs, retry lagi
```

**Alasan:** Installed DB bisa berasal dari versi Rapkumer lama yang punya index structure berbeda. Installer harus robust agar tidak gagal di user machines.

#### **Pre-Migration Checks: Installer Lebih Lengkap**

**Development:**

```bash
pnpm db:push
# Langsung jalankan drizzle push
```

**Installer:**

```javascript
// SEBELUM drizzle push, pastikan kolom ada:
const checks = [
  { table: 'tasks', column: 'sekolah_id' },
  { table: 'kelas', column: 'sekolah_id' },
  { table: 'mata_pelajaran', column: 'kelas_id' },
  { table: 'auth_user', column: 'sekolah_id' },
  { table: 'feature_unlock', column: 'sekolah_id' },
  { table: 'tahun_ajaran', column: 'sekolah_id' }
];

for (const check of checks) {
  if (!columnExists(check.table, check.column)) {
    ALTER TABLE ... ADD COLUMN ...
  }
}
```

**Alasan:** Drizzle push akan UPDATE/DELETE rows berdasarkan kolom baru. Jika kolom belum ada, query akan fail. Installer pre-check untuk avoid ini.

#### **Kapan Digunakan Masing-Masing**

| Situasi                                          | Gunakan                                   | Alasan                                                            |
| ------------------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------- |
| Developer sedang develop & test di local         | `pnpm db:push`                            | Simple, cepat, target `data/database.sqlite3` lokal               |
| Prepare Windows release (build stage)            | `pnpm db:push`                            | Populate `data/database.sqlite3` yang akan di-bundle di installer |
| User install RapkumerSetup.exe                   | `migrate-installed-db.mjs` (via batch/PS) | Robust, handle legacy data, fix indexes, pre-check kolom          |
| User jalankan `pnpm db:push` di installed folder | Auto-detect ke Rapkumer-data DB           | Script smart: kalau `$PWD` di AppData, gunakan Rapkumer-data path |

### **⚠️ Critical Issue: Missing `ensure-columns.mjs` di Installer**

**Masalah yang terjadi:**

Saat user jalankan installer:

1. **Di dev** (`pnpm db:push`):
   - Jalankan `fix-drizzle-indexes.mjs` ✓
   - Jalankan `ensure-columns.mjs` ✓ ← **Ada file ini**
   - Jalankan `drizzle push` ✓
   - Jalankan `seed-default-admin.mjs` ✓

2. **Di installer** (Fase 4):
   - Jalankan `fix-drizzle-indexes.mjs` ✓
   - Jalankan `ensure-columns.mjs` ✗ ← **File tidak ter-copy ke installer!**
   - Fallback ke inline checks (tapi hanya cek minimal)
   - Jalankan `drizzle push` ✓
   - Jalankan `seed-default-admin.mjs` ✗ ← **ERROR: no such column: permissions**

**Log Installer:**

```
[migrate-installed-db] ensure-columns.mjs not found in install; running inline checks
[migrate-installed-db] Column sekolah_id already present on tasks
[migrate-installed-db] Column sekolah_id already present on kelas
...
// Tapi kolom 'permissions' dan kolom lain di auth_user TIDAK di-check!
```

**Log Dev:**

```
[ensure-columns] Target DB: file:.../data/database.sqlite3
[ensure-columns] Adding column permissions to auth_user
[ensure-columns] Added permissions on auth_user
[ensure-columns] Adding column type to auth_user
[ensure-columns] Added type on auth_user
...
```

**Kenapa terjadi?**

1. **Script `ensure-columns.mjs`** di `scripts/` bukan di `installer/scripts/`
2. Saat prepare installer, hanya file di `installer/scripts/` yang di-copy:
   ```powershell
   # installer/prepare-windows.ps1
   # Hanya copy installer/scripts/ → dist/windows/stage/Rapkumer/scripts/
   ```
3. Dev punya akses ke `scripts/ensure-columns.mjs` (di project root)
4. Installer tidak punya akses, fallback ke inline checks (tapi inline tidak lengkap)

**Akibatnya:**

- **Dev DB**: Semua kolom ada (`permissions`, `type`, `pegawai_id`, `kelas_id`, `mata_pelajaran_id`)
- **Installer DB**: Kolom `permissions` dll TIDAK ditambahkan
- `seed-default-admin.mjs` coba query `SELECT ... permissions` → FAIL!

#### **Solusi: Include `ensure-columns.mjs` di Installer**

File `scripts/ensure-columns.mjs` harus di-copy ke installer package:

**Opsi 1: Copy ke installer folder**

```bash
cp scripts/ensure-columns.mjs installer/scripts/
```

**Opsi 2: Update prepare-windows.ps1 untuk copy dari scripts/**

```powershell
# Copy ensure-columns.mjs ke installer stage
Copy-Item (Join-Path $projectRoot 'scripts/ensure-columns.mjs') -Destination (Join-Path $appStage 'scripts') -Force
```

**Opsi 3: Improve inline fallback**
Expand inline checks di `migrate-installed-db.mjs` untuk include semua kolom yang `ensure-columns.mjs` handle.

### **Implementation Notes: Script Synchronization**

⚠️ **Important**: Ada dua mekanisme untuk sync script ke installer:

#### **1. `sync-to-installer.mjs` (Production Build)**

Script ini copy file dari `scripts/` ke `installer/scripts/`:

```bash
node scripts/sync-to-installer.mjs
```

Dipanggil otomatis oleh:

- `pnpm prod`
- `pnpm prod:signed`

**Files yang di-sync:**

- `ensure-columns.mjs`
- `fix-drizzle-indexes.mjs`
- `grant-admin-permissions.mjs`
- `migrate-installed-db.mjs`
- `start-build.mjs`
- `notify-server-reload.mjs`
- `seed-default-admin.mjs`

**Purpose**: Memastikan `installer/scripts/` selalu up-to-date dengan `scripts/` terbaru sebelum build production.

---

#### **2. `prepare-windows.ps1` (Development/Staging)**

Script ini copy file dari `scripts/` **langsung ke staging folder** (`dist/windows/stage/Rapkumer/scripts/`):

```bash
pnpm package:win
```

**Yang terjadi:**

1. Build aplikasi (`pnpm build`)
2. Jalankan `pnpm db:push` untuk populate template DB
3. **Copy file dari `scripts/` ke staging** (termasuk `ensure-columns.mjs` dan `start-build.mjs`)
4. Copy drizzle config & migrations
5. Install production dependencies

**Files yang di-copy ke staging:**

```powershell
$requiredScripts = @(
    'ensure-columns.mjs',
    'fix-drizzle-indexes.mjs',
    'seed-default-admin.mjs',
    'grant-admin-permissions.mjs',
    'notify-server-reload.mjs',
    'start-build.mjs'
)
```

---

#### **Perbedaan Kritis**

| Aspek                    | `sync-to-installer.mjs`          | `prepare-windows.ps1`                  |
| ------------------------ | -------------------------------- | -------------------------------------- |
| **Copy Ke**              | `installer/scripts/`             | `dist/windows/stage/Rapkumer/scripts/` |
| **Dipanggil**            | `pnpm prod` / `pnpm prod:signed` | `pnpm package:win`                     |
| **Include ke Installer** | ✗ Tidak otomatis                 | ✓ Ya (via Inno Setup)                  |
| **Urutan**               | Sebelum staging                  | Saat staging                           |

---

#### **Alur File:**

**Development/Testing:**

```
scripts/ensure-columns.mjs
    ↓
prepare-windows.ps1 copy
    ↓
dist/windows/stage/Rapkumer/scripts/ensure-columns.mjs
    ↓
Inno Setup [Files] section copy
    ↓
RapkumerSetup.exe include
    ↓
%LOCALAPPDATA%\Rapkumer\scripts\ensure-columns.mjs ✓
```

**Production Release:**

```
scripts/ensure-columns.mjs
    ↓
sync-to-installer.mjs copy
    ↓
installer/scripts/ensure-columns.mjs
    ↓
prepare-windows.ps1 copy (jika package:win juga dijalankan)
    ↓
dist/windows/stage/Rapkumer/scripts/ensure-columns.mjs
    ↓
Inno Setup [Files] section copy
    ↓
RapkumerSetup.exe include
    ↓
%LOCALAPPDATA%\Rapkumer\scripts\ensure-columns.mjs ✓
```

---

#### **Workflow yang Benar:**

**Saat menambah/edit script di `scripts/`:**

```bash
# 1. Edit script
vi scripts/new-feature.mjs

# 2. Sync ke installer/scripts/
node scripts/sync-to-installer.mjs

# 3. Test dengan staging build
pnpm package:win

# 4. Verify semua file ada di staging
ls dist/windows/stage/Rapkumer/scripts/

# 5. Jika akan production release:
pnpm prod          # atau pnpm prod:signed
# Script ini akan:
# - Run sync-to-installer.mjs
# - Package Windows installer
# - File akan ter-include ke RapkumerSetup.exe
```

---

#### **Template database** (`data/database.sqlite3`) yang di-bundel harus memiliki:

- Semua kolom terbaru (dari `ensure-columns.mjs`)
- Schema terbaru dari migrations
- Ini memastikan installer DB sudah "current" saat di-copy ke user

## Fase 5: Shortcut & Icons

Di bagian **[Icons]**:

```ini
Name:"{autoprograms}\Rapkumer\Rapkumer"; Filename:"{sys}\cmd.exe"; Parameters:"/c node ""{app}\start-rapkumer.mjs"""; WorkingDir:"{app}"
Name:"{autodesktop}\Rapkumer"; Filename:"{sys}\cmd.exe"; Parameters:"/c node ""{app}\start-rapkumer.mjs"""; WorkingDir:"{app}"
```

Dua shortcut dibuat:

1. **Start Menu**: `Start → Programs → Rapkumer → Rapkumer`
2. **Desktop**: `Rapkumer` shortcut

Ketika diklik, menjalankan: `node start-rapkumer.mjs`

---

## Flow Saat User Klik Shortcut

### **start-rapkumer.mjs** (File launcher utama)

```javascript
const APP_HOME = %LOCALAPPDATA%\Rapkumer
const USER_STATE_ROOT = %LOCALAPPDATA%\Rapkumer-data
const DB_URL = file:C:\Users\USERNAME\AppData\Local\Rapkumer-data\database.sqlite3
```

**Logika:**

1. **Ensure directories**: Pastikan folder `logs` & data ada
2. **Copy database jika belum**: Jika `Rapkumer-data/database.sqlite3` tidak ada, copy dari bundle
3. **Set environment variables**:

   ```javascript
   PORT = 3000 (default)
   NODE_ENV = production
   DB_URL = file:.../database.sqlite3
   BODY_SIZE_LIMIT = 5242880 (5MB)
   ```

4. **Spawn background process**: Jalankan `start-build.mjs` sebagai detached process

   ```javascript
   spawn(nodeBin, ['start-build.mjs'], {
   	cwd: APP_HOME,
   	env: childEnv,
   	detached: true, // Detached = launcher bisa exit, app tetap jalan
   	stdio: [ignore, logFile, logFile],
   	windowsHide: true // Sembunyikan jendela Node
   });
   ```

5. **Wait for server**: Cek apakah port 3000 aktif (max 10 attempts × 1 detik)

6. **Log output**: Semua output ditulis ke `%LOCALAPPDATA%\Rapkumer-data\logs\rapkumer.log`

---

## Flow Start-Build

**start-build.mjs** adalah script yang di-spawn background:

```bash
node start-build.mjs
```

Ini adalah SvelteKit production server yang:

- Membaca file `.env` (DB_URL, PORT, etc)
- Menghubungkan ke database SQLite
- Jalankan migrations (Drizzle)
- Listen di port 3000
- Serve aplikasi web

Output tercatat di log file pengguna.

---

## Struktur Folder Setelah Instalasi

```
%LOCALAPPDATA%\Rapkumer/              ← Folder instalasi app
├── build/                            ← Artefak build SvelteKit
├── static/                           ← Assets statis
├── data/database.sqlite3             ← Database bundled (template)
├── rapkumer.ico
├── start-rapkumer.mjs
└── .env                              ← Dihasilkan saat install

%LOCALAPPDATA%\Rapkumer-data/         ← Folder data pengguna (persistent)
├── database.sqlite3                  ← Database aktual (copy dari template)
├── uploads/                          ← Foto & dokumen pengguna
└── logs/
    └── rapkumer.log                  ← Log aplikasi
```

---

## Key Points

| Aspek                    | Detail                                                                            |
| ------------------------ | --------------------------------------------------------------------------------- |
| **Per-user Install**     | Setiap user punya instance terpisah di folder `AppData` mereka                    |
| **No Admin Required**    | Instalasi & run tanpa privilege administrator                                     |
| **Separate Data Folder** | App di `Rapkumer/`, data di `Rapkumer-data/` (untuk update app tanpa affect data) |
| **Node.js Required**     | Installer tidak bundle Node.js; user harus install terpisah                       |
| **Detached Process**     | Launcher exit setelah app berjalan background                                     |
| **Logging**              | Semua output ke file log, bukan console yang terlihat user                        |
| **Database Bundled**     | Template database disertakan, dicopy per-user saat first run                      |
| **Auto-Migrate**         | Database schema otomatis di-upgrade via Drizzle saat install                      |

---

## Troubleshooting

### Installer gagal: "Node.js not found"

→ User belum install Node.js atau tidak di PATH

### App tidak start setelah install

→ Cek: `%LOCALAPPDATA%\Rapkumer-data\logs\rapkumer.log`

### Database error setelah install

→ Lihat apakah migrations berjalan: check log file di folder logs

### Reinstall/Update

→ Jalankan installer lagi; app akan update, data user tetap aman di `Rapkumer-data/`

---

## Pre-Build Checklist

**Sebelum menjalankan `pnpm package:win` atau `pnpm prod`, pastikan:**

```bash
# 1. Sinkronisasi script ke installer/scripts/
node scripts/sync-to-installer.mjs

# 2. Database migration sudah update
pnpm db:push

# 3. Build aplikasi
pnpm build

# 4. Verify staging (setelah package:win)
ls dist/windows/stage/Rapkumer/scripts/ | grep -E "(ensure-columns|start-build)"
# Pastikan output:
# ensure-columns.mjs
# start-build.mjs

# 5. Check template DB
ls -lh data/database.sqlite3
# Pastikan file ada dan memiliki size > 100KB

# 6. Verify .env di staging
cat dist/windows/stage/Rapkumer/.env
# Harus ada DB_URL, BODY_SIZE_LIMIT, photo paths
```

**Jika ada yang hilang:**

```bash
# Rebuild staging
rm -rf dist/windows/stage
pnpm package:win
```

**Baru jalankan:**

```bash
# Development/Testing
pnpm package:win

# Production Release
pnpm prod                # unsigned
pnpm prod:signed         # dengan digital signature
```

---
