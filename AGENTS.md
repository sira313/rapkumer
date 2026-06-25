# Rapkumer (Rapor Kurikulum Merdeka)

## Commands

```sh
pnpm dev -- --port 5173      # vite dev + icon generator (scripts/dev.js)
pnpm build                   # adapter-node → build/index.js
pnpm start                   # run built app (scripts/start-build.mjs)
pnpm db:push                 # custom migration script, not raw drizzle-kit push
pnpm db:studio               # drizzle-kit studio
pnpm db:cleanup              # cleanup orphan records
pnpm seed:walis              # seed wali asuh users
pnpm package:win             # stage windows installer artifacts
pnpm prepare                 # svelte-kit sync (auto-runs on install)
pnpm check                   # svelte-kit sync + svelte-check
pnpm check:watch             # svelte-kit sync + svelte-check --watch
pnpm lint                    # prettier --check . && eslint .
pnpm format                  # prettier --write . (tabs, single quotes, no trailing comma)
```

## Stack

- **SvelteKit 2 + Svelte 5 runes** — use `$props()`, `$state`, `$derived`. No `export let`, `$:`, or `(on:click)`.
- **PagedJS + puppeteer-core** — server-side PDF gen from `src/lib/server/pdf/templates/`. Needs system Chrome/Chromium; set path via `PUPPETEER_EXECUTABLE_PATH`.
- **TailwindCSS 4 + DaisyUI 5** — CSS via `@import "tailwindcss"` + `@plugin "daisyui"` in `src/app.css`. No tailwind.config.js.
- **Drizzle ORM + SQLite** — `@libsql/client`. `snake_case` in DB, camelCase in schema (`drizzle.config.js` sets `casing: 'snake_case'`).
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
- Two `.env` loaders exist (`load-env.ts`, `db/index.ts`) — don't add a third.

## Windows installer

- InnoSetup bundles **VC++ Redistributable 2015-2022 (x64)** for `@libsql/win32-x64-msvc`.
- `scripts/prepare-windows.mjs` downloads `vc_redist.x64.exe` to `dist/windows/`.
- Build on Linux via Wine: install InnoSetup 7+, then `wine ISCC.exe installer/raporkumer.iss`. Run `pnpm build` first.

## Gotchas

- **DaisyUI `.fieldset` has `padding: 0`** — inputs are flush against container edge. Inside a scrollable container (`overflow-y: auto`), the focus outline (`outline-offset: 2px`) gets clipped. Fix: `global-modal.svelte` overrides `outline-offset: -2px` via `:global(.modal input:focus)`.
- **Disabled buttons** with `title` for tooltip use `aria-disabled` alongside `disabled` (project convention).

## Quality

- Run `pnpm lint` then `pnpm check` before committing.
- No test framework wired (vitest/playwright absent).
