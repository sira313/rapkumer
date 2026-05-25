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
- **WeasyPrint** — server-side PDF generation via Python (spawned as subprocess). Venv at `node_modules/.weasyprint-venv` (auto-created by `pnpm dev`, requires Python 3). Override with `WEASYPRINT_BIN` env.
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

## Quality

- Run `pnpm lint` then `pnpm check` before committing.
- No test framework is currently wired (vitest/playwright config absent).
- Refer to `.github/instructions/custom.instructions.md` for additional context.
