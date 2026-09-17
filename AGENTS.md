# Rapkumer (Administrasi guru terpadu)

## Commands

```sh
pnpm dev -- --port 5173      # vite dev + icon generator (scripts/dev.js)
pnpm build                   # adapter-node → build/index.js
pnpm preview                 # vite preview (quick built-app check without full start script)
pnpm start                   # run built app (scripts/start-build.mjs)
pnpm db:push                 # custom migration script, not raw drizzle-kit push
pnpm db:studio               # drizzle-kit studio
pnpm db:cleanup              # cleanup orphan records
pnpm db:purge                # delete sqlite db files (main + wal/shm); asks confirmation, -y skips
pnpm seed:walis              # seed wali asuh users
pnpm package:win             # stage windows installer artifacts
pnpm prepare                 # svelte-kit sync (auto-runs on install)
pnpm check                   # svelte-kit sync + svelte-check
pnpm check:watch             # svelte-kit sync + svelte-check --watch
pnpm lint                    # prettier --check . && eslint .
pnpm format                  # prettier --write . (tabs, single quotes, no trailing comma, width 100)
strix -n -t ./ --scan-mode quick   # AI pentest (install & usage: docs/SKILLS.md)
```

## Stack

- **SvelteKit 2 + Svelte 5 runes** — use `$props()`, `$state`, `$derived`. No `export let`, `$:`, or `(on:click)`.
- **PagedJS + puppeteer-core** — server-side PDF gen from `src/lib/server/pdf/templates/`. Needs system Chrome/Chromium; set path via `PUPPETEER_EXECUTABLE_PATH`.
- **TailwindCSS 4 + DaisyUI 5** — CSS via `@import "tailwindcss"` + `@plugin "daisyui"` in `src/app.css`. No tailwind.config.js.
- **Drizzle ORM + SQLite** — `@libsql/client`. `snake_case` in DB, camelCase in schema (`drizzle.config.js` sets `casing: 'snake_case'`). Env vars: `DB_URL` (default `file:./data/database.sqlite3`), `DB_AUTH_TOKEN` (for Turso/remote), `BODY_SIZE_LIMIT` (default `512K`, parsed in `hooks.server.ts`). Three scripts (`db/index.ts`, `start-build.mjs`, `prepare-windows.mjs`) load `.env` independently — don't rely on a single loader.
- **mdsvex** — `.md` files render as Svelte components. `svelte.config.js` sets `extensions: ['.svelte', '.md']`.
- **pnpm** only. `engine-strict=true`.
- **`opencode.json`** has `"plugin": ["@sveltejs/opencode"]` — Svelte MCP tools available.

## Project structure

- `src/routes/` — route groups: `(informasi-umum)/`, `(mata-pelajaran)/`, `(input-nilai)/`, `cetak/`, `api/`, `pengaturan/`, `pengguna/`, `login/`, `logout/`.
- `src/lib/components/` — domain subfolders. Keep presentation logic here, not in route files.
- `src/lib/server/db/schema.ts` — all tables + relations.
- `src/lib/server/db/index.ts` — DB connection (Proxy for HMR, WAL mode, busy timeout). `reloadDbClient()` reconnects.
- `src/lib/server/db/ensure-*.ts` — schema migration helpers, run on first request.
- `src/lib/server/pdf/templates/` — PagedJS rapor/cover/biodata/piagam/keasramaan HTML templates.
- `installer/` — InnoSetup script + packaging config for Windows builds.
- `docs/` — development reference (setup, daof, development, Strix pentesting: `docs/SKILLS.md`).
- `.agents/skills/` — Strix pentest skills + bahasa writing skills; opencode discovers these automatically.
- `$lib/utils.ts` — `cookieNames`, `flatten`/`unflatten`/`populateForm`, `modalRoute`.

## UI conventions

- **Forms**: use `form-enhance.svelte` with `flatten`/`unflatten`/`populateForm` from `$lib/utils.ts`.
- **Toasts**: `import { toast } from '$lib/components/toast.svelte'`.
- **Icons**: add SVG to `src/lib/icons/`, then `node scripts/icon.js` generates `__icons.d.ts` (gitignored, don't commit). Use `<Icon name="..." />` in Svelte markup. For modal HTML body, use component-based body instead of string (e.g., `body: MyComponent, bodyProps: {...}`) so `<Icon name="..." />` works inside it. Do not use `import svg from '$lib/icons/name.svg?raw'`.
- **Text**: Indonesian for users, English for code/comments.
- **Dark mode**: `data-theme` attribute on `<html>`, persisted in localStorage.

## Auth & data

- Custom session auth (not Lucia). Session TTL 12h, refresh threshold 2h.
- Cookie names from `$lib/utils.ts` `cookieNames`: `rapkumer-session`, `active-sekolah-id`, `active-kelas-id`.
- Default admin: `Admin` / `Admin123` (created by `ensureDefaultAdmin()` on first start).
- User types: `admin`, `wali_kelas`, `wali_asuh`, `user`. Permissions stored as JSON array on `auth_user.permissions`.
- Three hooks composed via `sequence(csrfGuard, authGuard, cookieParser)` in `src/hooks.server.ts`.
- CSRF: SvelteKit's built-in disabled (`csrf.trustedOrigins: ['*']`). Custom guard checks origin/referer.
- `event.locals.sekolah` scopes all queries — set by `cookieParser` hook.
- Body size limit from `process.env.BODY_SIZE_LIMIT` (default 512K).
- User type `user` accounts are **read-only** (`disableInteraction`) on `/murid`, `/kokurikuler`, `/ekstrakurikuler`, `/keasramaan`, `/asesmen-kokurikuler`, `/nilai-ekstrakurikuler`, `/asesmen-keasramaan`, `/catatan-wali-kelas`, `/keputusan`, `/cetak`. **Exception:** `/absen` exempts `user` type from `disableInteraction` — guru mapel can view all modes and use "Isi Sekaligus" (per-mapel bulk), but individual edit/delete remains blocked via `canUserEditAbsen`.

## DB

- Default: `file:./data/database.sqlite3`. Override via `DB_URL` env.
- `pnpm db:push` applies schema changes (custom orchestration, not raw `drizzle-kit push`).
- Use `db.query.tableX` with Drizzle query builder. Avoid raw SQL.
- Logos: `Uint8Array` blob + mime type string on `tableSekolah`.
- **Signatures (tanda tangan / paraf):** stored as transparent PNG files under `<dataRoot()>/ttd/<kategori>/` (`guru` = presensi guru, `tamu` = buku tamu), NOT inline base64 in the DB. `dataRoot()` lives in `src/lib/server/data-dirs.ts` (env `RAPKUMER_DATA_DIR` → `%LOCALAPPDATA%\Rapkumer-data` on Windows → `<cwd>/data`); same helper also centralizes `uploadsDir()` (honors `photo` env) and `soundsDir()` (honors `sounds` env). The DB `tanda_tangan` column holds a rel path like `guru/27_2026-08-04.png` (legacy inline data URLs still render). Guru filenames include a timestamp (e.g. `27_2026-08-04_1722660000000.png`) so replacing a paraf yields a fresh URL (the old file is deleted by the admin handler); `/api/ttd` serves with `Cache-Control: immutable`. Helpers in `src/lib/server/ttd.ts` (`saveSignatureFile`, `readSignatureFile`, `deleteSignatureFile`, `signatureToDataUrl`, `migrateLegacySignatures`). Files are served via `/api/ttd/[...path]`; client-side `signatureDisplaySrc()` in `$lib/utils.ts` maps stored values to displayable `<img>` srcs. Guru canvas is 400×400 (1:1, for paraf only, `bg-white` CSS); tamu canvas uses 2× DPI. `migrateLegacySignatures()` runs once per process from the ensure-* scripts.
- `.env` loaders exist in `db/index.ts`, `start-build.mjs`, and `prepare-windows.mjs` — each handles its own subset; don't rely on a single loader.

## Windows installer

- InnoSetup bundles **VC++ Redistributable 2015-2022 (x64)** for `@libsql/win32-x64-msvc`.
- `scripts/prepare-windows.mjs` downloads `vc_redist.x64.exe` to `dist/windows/`.
- Build on Linux via Wine: install InnoSetup 7+, then `wine ISCC.exe installer/rapkumer.iss`. Run `pnpm build` first.
- **Data root override:** `installer/files/start-rapkumer.mjs` resolves the user-data root as `RAPKUMER_DATA_DIR` env → `%LOCALAPPDATA%\Rapkumer-data\data-root.txt` (written by the "Lokasi Data" page) → default `%LOCALAPPDATA%\Rapkumer-data`. The **database stays in the fixed launcher home** (`%LOCALAPPDATA%\Rapkumer-data\database.sqlite3`, set via `DB_URL`) and never follows the movable root — moving an open WAL SQLite file is unsafe. `storage-settings.ts` mirrors this via `launcherHome()`/`launcherDataRootConfigPath()`/`writeLauncherDataRootOverride()`. **Uploads/sounds always follow the root** (default `<root>/uploads|sounds`); the "Lokasi Data" form only edits the root and the handler clears any `photo`/`sounds` pin in `.env` on save (also consolidating legacy custom folders into the new root). The installer's fresh `.env` only contains `DB_URL` + `BODY_SIZE_LIMIT` — no photo/sounds pins.

## Gotchas

- **`scripts/dev.js` runs two processes** — the icon generator and Vite dev server are spawned in parallel. Either crashing kills the whole dev session. `start-build.mjs` reads `.env` manually and resolves `build/index.js` from multiple candidate paths (scripts/, parent/, cwd/) so it works both in-repo and in installed-app layouts.
- **DaisyUI `.fieldset` has `padding: 0`** — inputs are flush against container edge. Inside a scrollable container (`overflow-y: auto`), the focus outline (`outline-offset: 2px`) gets clipped. Fix: `global-modal.svelte` overrides `outline-offset: -2px` via `:global(.modal input:focus)`.
- **Disabled buttons** with `title` for tooltip use `aria-disabled` alongside `disabled` (project convention).

## Absen presensi logic

Attendance is split into 2 statuses: **Hadir** (Present) and **Tidak Hadir** (Sakit/Izin/Alfa). Unset defaults to TK (No Info).

Configured via `jenisPresensi` (wali_kelas_saja / tiap_mapel) and `tipePresensi` (masuk_saja / masuk_pulang / awal_mapel / awal_akhir_mapel) in the Pengaturan Presensi modal at `/akademik`.

The 4 logic blocks below are **mutually exclusive** — gated by `isWaliKelasMasukPulang` / `isTiapMapel` / `isAwalAkhir` guards in `load-persentase-bulanan.ts` and `load-persentase-semester.ts`.

### Logic 1 — Wali Kelas only + Masuk only

- `bulanan`: already correct (1 session/day)
- `persentase_bulanan`: already correct (`hadir / totalHariBelajar * 100%`)
- `persentase_semester`: same as bulanan, computed from `tanggalMasuk` to `tanggalBagiRapor`
- `rapor`: same as `bulanan`

### Logic 2 — Wali Kelas only + Masuk pulang

- `bulanan`: references "presensi masuk" from Isi Sekaligus (1 session/day)
- `persentase_bulanan`: `masuk=1, pulang=1` → `persentase = countHadir / (totalHariBelajar * 2) * 100%`
- `persentase_semester`: same as bulanan, date range from semester start to rapor date
- `rapor`: same as `bulanan`

### Logic 3 — Per-Mapel + Awal mapel (guru mapel only)

- Each subject = 1 **pertemuan** (meeting).
- Isi Sekaligus for guru mapel has no time restriction (`jadwalBelumDimulai = false` in `+page.svelte`). `isMapelOnJadwal` validates whether the teacher's subject is scheduled that day.
- `harian` & `persentase_harian`: uses the first scheduled subject (`first-mapel.ts`). Subsequent subjects count as present even if unattended.
- `persentase_bulanan`: `persentase = countHadir / totalPertemuan * 100%`. Header: `(N days M subjects)`.
- `bulanan` & `rapor`: follows `harian` (first subject per day).
- `persentase_semester`: same as bulanan, date range from semester start to rapor date.

### Logic 4 — Per-Mapel + Awal & akhir mapel

- Like logic 3, but each meeting has **2 attendance sessions** (start + end).
- `totalPertemuan` is **doubled** (`totalPertemuan *= 2`). Header: `(N days M sessions)`.
- `countHadir` = raw `absCount` per subject (not halved). If `keterangan===null` with no absensi records, defaults to 2 sessions present.
- `sakit`/`izin`/`alfa` are **doubled** (`+= 2`) to match session count.
- `persentase = countHadir / totalPertemuan * 100%` (denominator already doubled).
- Other modes (`harian`, `bulanan`, `rapor`, `persentase_harian`, `persentase_semester`) same as logic 3.

## Quality

- Run `pnpm lint` then `pnpm check` before committing.
- `state_referenced_locally` fails `pnpm check` via `svelte-check --fail-on-warnings` (default in `scripts/svelte-check-wrapper.mjs`). Intentional initial-value captures from `data`/props must opt out with a `// svelte-ignore state_referenced_locally` comment directly above the `$state(...)` line — only when the one-time snapshot is deliberate.
- No test framework wired (vitest/playwright absent).

## Security (Strix)

AI pentest for this repo: `docs/SKILLS.md`. Quick command:
```sh
strix -n -t ./ --scan-mode quick --max-budget 15
```
Output goes to `strix_runs/` (gitignored). Skills live in `.agents/skills/`; restart opencode session after adding new skills.
