# Rapkumer (Rapor Kurikulum Merdeka)

## Commands

```sh
pnpm dev -- --port 5173   # dev server + icon generator (scripts/dev.js)
pnpm build                 # vite build (adapter-node)
pnpm db:push               # drizzle migration (scripts/migrate-installed-db.mjs)
pnpm db:studio             # drizzle-kit studio
pnpm check                 # svelte-kit sync + svelte-check (scripts/svelte-check-wrapper.mjs)
pnpm lint                  # prettier --check . && eslint .
pnpm format                # prettier --write .
```

## Stack

- **SvelteKit 2 + Svelte 5 runes** — no `export let`, `$:`, or `(on:click)`. Use `$props()`, `$state`, `$derived`.
- **PagedJS + Puppeteer** — server-side PDF generation. Uses `puppeteer-core` with system Chrome/Chromium. Override Chrome path with `PUPPETEER_EXECUTABLE_PATH` env var. PagedJS polyfill from `pagedjs-cli` package.
- **DaisyUI 5 on TailwindCSS 4** — CSS via `@import "tailwindcss"` + `@plugin "daisyui"` in `src/app.css`. No `tailwind.config.js`.
- **Drizzle ORM + SQLite** — libsql client when `DB_URL` is set, else `file:./data/database.sqlite3`. Casing: `snake_case`.
- **pnpm** only. `engine-strict=true` in `.npmrc`.

## Project structure

- `src/routes/` — route groups: `(informasi-umum)/` (sekolah/kelas/murid/rapor), `(mata-pelajaran)/` (intra/kokuri/ekstra/keasramaan), `(input-nilai)/` (asesmen/nilai/absen/catatan), `cetak/`, `api/`, `pengaturan/`, `pengguna/`, `login/`, `logout/`.
- `src/lib/components/` — domain subfolders (e.g. `tp-rl/`). Keep presentation logic here, not in `+page.svelte`.
- `src/lib/server/db/schema.ts` — single source of truth for all tables and relations.
- `scripts/` — migrasi, seed, icon generator, build helpers.
- `src/docs/help/` — MDsveX help pages (heading level 2 = anchor).

## UI conventions

- **Forms**: use `form-enhance.svelte` (`src/lib/components/form-enhance.svelte`) with `flatten`/`unflatten`/`populateForm` from `$lib/utils.ts`.
- **Toasts**: `import { toast } from '$lib/components/toast.svelte'`.
- **Icons**: add SVG to `src/lib/icons/`, then `node scripts/icon.js` generates `__icons.d.ts` (gitignored, do not commit).
- **Text**: Indonesian for users, English for code/comments.
- **Dark mode**: via `data-theme` attribute.

## Auth & data

- Custom session auth (not Lucia). Session TTL 12h, refresh threshold 2h.
- Cookie names in `$lib/utils.ts` (`cookieNames`): `rapkumer-session`, `active-sekolah-id`, `active-kelas-id`.
- Default admin: `Admin` / `Admin123` (created by `ensureDefaultAdmin()` on first start).
- `event.locals.sekolah` scopes all queries — set by `cookieParser` hook.
- SQLite errors → `handleError` in `src/hooks.server.ts` for user-friendly messages.
- CSRF: custom guard in hooks (not SvelteKit's built-in). `svelte.config.js` has `csrf.trustedOrigins: ['*']`.
- Two runtime `.env` loaders in the codebase (`load-env.ts`, `db/index.ts`) — don't add a third.

## DB

```sh
DB_URL=file:./data/database.sqlite3  # default, overridable via .env
```

- `pnpm db:push` to apply migrations. Schema: `src/lib/server/db/schema.ts`.
- Use `db.query.tableX` with Drizzle query builder. Avoid raw SQL.
- Logos stored as `Uint8Array` blob + type text on `tableSekolah`.
- Many-to-many: `tableAuthUserMataPelajaran`, `tableAuthUserKelas`.
- User types: `admin`, `wali_kelas`, `wali_asuh`, `user` (guru mapel).

## Windows installer

- The InnoSetup installer bundles and auto-installs the **Microsoft Visual C++ Redistributable 2015-2022 (x64)** as a prerequisite for the `@libsql/win32-x64-msvc` native addon.
- `scripts/prepare-windows.mjs` downloads `vc_redist.x64.exe` from Microsoft's CDN (via `aka.ms` link) and places it at `dist/windows/vc_redist.x64.exe`.
- The ISS `[Code]` section checks the registry (`HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64\Version`) and runs the redist installer with `ShellExec('runas', ...)` only if not already installed (shows UAC prompt).
- **Building on Linux via Wine**: Install InnoSetup 7+ with `wine innosetup-*.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /DIR="C:\Inno Setup 7"`. Then compile: `wine "$HOME/.wine/drive_c/Program Files (x86)/Inno Setup 7/ISCC.exe" installer/raporkumer.iss`. Run `pnpm run build` first to generate the SvelteKit build output before compiling the installer.

## Quality

- Run `pnpm lint` then `pnpm check` before committing.
- No test framework is currently wired (vitest/playwright config absent).
- Refer to `.github/instructions/custom.instructions.md` for additional context.
