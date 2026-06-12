#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function resolveLocalAppData() {
	// Prefer LOCALAPPDATA; fall back to APPDATA -> replace Roaming with Local
	const local = process.env.LOCALAPPDATA;
	if (local) return local;
	const appdata = process.env.APPDATA;
	if (appdata) return appdata.replace(/\\Roaming/i, '\\Local');
	// last resort, use user profile
	const user = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\Public';
	return path.join(user, 'AppData', 'Local');
}

function joinDbPath(base) {
	return path.join(base, 'Rapkumer-data', 'database.sqlite3');
}

function run(cmd, args, opts = {}) {
	console.info(`\n> ${[cmd, ...(args || [])].join(' ')}`);
	// On Windows some CLI shims are .cmd files which must be executed via the shell.
	// Detect that case and enable shell execution to avoid EINVAL when spawning .cmd.
	const isWin = process.platform === 'win32';
	const cmdExt = path.extname(cmd || '').toLowerCase();
	const useShell = opts.shell ?? (isWin && cmdExt === '.cmd');
	const res = spawnSync(cmd, args || [], { stdio: 'inherit', shell: useShell, ...opts });
	if (res.error) {
		console.error('Failed to run:', res.error);
		throw res.error;
	}
	if (res.status !== 0) {
		console.error(`Process exited with code ${res.status}`);
		throw new Error(`Command failed: ${cmd} ${args ? args.join(' ') : ''}`);
	}
}

// spawnSync but capture stdout/stderr so callers can inspect the underlying
// child's output (useful for parsing CLI error messages such as sqlite index
// conflicts). Returns the same object shape as spawnSync.
function runCapture(cmd, args, opts = {}) {
	console.info(`\n> ${[cmd, ...(args || [])].join(' ')}`);
	const isWin = process.platform === 'win32';
	const cmdExt = path.extname(cmd || '').toLowerCase();
	const useShell = opts.shell ?? (isWin && cmdExt === '.cmd');
	const res = spawnSync(cmd, args || [], {
		stdio: ['ignore', 'pipe', 'pipe'],
		shell: useShell,
		...opts
	});
	// Write child's stdout/stderr to parent so we keep the same visible logs
	if (res.stdout && res.stdout.length) process.stdout.write(res.stdout);
	if (res.stderr && res.stderr.length) process.stderr.write(res.stderr);
	if (res.error) {
		console.error('Failed to run:', res.error);
		process.exitCode = 1;
		throw res.error;
	}
	if (res.status !== 0) {
		// Include stdout/stderr in the thrown error message for downstream parsing
		const out = (res.stdout || '').toString();
		const err = (res.stderr || '').toString();
		const combined = [res.status, out, err].filter(Boolean).join('\n');
		const e = new Error(combined || `Process exited with code ${res.status}`);
		e.code = res.status;
		throw e;
	}
	return res;
}

async function main() {
	// project root (assume script is in scripts/)
	// Use fileURLToPath to get a correct Windows path (avoid leading slash like /C:/...)
	const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

	// Resolve DB_URL: prefer explicit env. If not set, decide between developer (repo-local)
	// and installed (LocalAppData) DBs.
	const envDb = process.env.DB_URL;
	let dbPath;
	if (envDb) {
		console.info('[migrate-installed-db] Using DB_URL from environment:', envDb);
		dbPath = envDb;
	} else {
		const localAppData = resolveLocalAppData();
		// If the script is running from the LocalAppData tree (typical installer), treat as installed.
		const projLower = String(projectRoot).toLowerCase();
		const localLower = String(localAppData).toLowerCase();
		const looksInstalled =
			projLower.startsWith(localLower + path.sep) ||
			path.basename(projectRoot).toLowerCase() === 'rapkumer';

		const projectLocal = path.join(projectRoot, 'data', 'database.sqlite3');
		const installedCandidate = joinDbPath(localAppData);

		if (looksInstalled) {
			dbPath = `file:${installedCandidate}`;
			console.info(
				'[migrate-installed-db] Detected installed environment; using installed DB path:',
				dbPath
			);
		} else if (fs.existsSync(projectLocal)) {
			dbPath = `file:${projectLocal}`;
			console.info('[migrate-installed-db] No DB_URL set; using project-local DB path:', dbPath);
		} else {
			dbPath = `file:${installedCandidate}`;
			console.info(
				'[migrate-installed-db] No DB_URL set and no project DB found; falling back to installed DB path:',
				dbPath
			);
		}
	}

	// prepare env for child processes
	const childEnv = { ...process.env, DB_URL: dbPath };

	// Locate local drizzle-kit binary if present
	const isWin = process.platform === 'win32';
	const drizzleBin = path.join(
		projectRoot,
		'node_modules',
		'.bin',
		`drizzle-kit${isWin ? '.cmd' : ''}`
	);
	const drizzleCmd = fs.existsSync(drizzleBin) ? drizzleBin : 'drizzle-kit';

	try {
		function normalizeIndexNameForMatch(name) {
			if (!name) return '';
			return String(name)
				.replace(/[^0-9a-z]/gi, '')
				.toLowerCase();
		}
		// mirror package.json db:push sequence
		run(process.execPath, [path.join(projectRoot, 'scripts', 'fix-drizzle-indexes.mjs')], {
			env: childEnv,
			cwd: projectRoot
		});

		// Ensure certain columns exist on older installed DBs so migration UPDATEs don't fail.
		// Prefer running the shipped `scripts/ensure-columns.mjs` if present; otherwise
		// fall back to an inline implementation so the installer doesn't require a
		// separate file to be present in the packaged install.
		const ensureScriptPath = path.join(projectRoot, 'scripts', 'ensure-columns.mjs');
		if (fs.existsSync(ensureScriptPath)) {
			run(process.execPath, [ensureScriptPath], { env: childEnv, cwd: projectRoot });
		} else {
			console.info(
				'[migrate-installed-db] ensure-columns.mjs not found in install; running inline checks'
			);
			// Inline ensure-columns logic (best-effort). Use dynamic import so this file
			// still runs in environments where @libsql/client may or may not be present.
			try {
				const { createClient } = await import('@libsql/client');
				const client = createClient({ url: dbPath });
				// Ensure common columns that older installs may lack. Keep conservative (NULLable INTEGER)
				const checks = [
					{ table: 'tasks', column: 'sekolah_id', type: 'INTEGER' },
					{ table: 'kelas', column: 'sekolah_id', type: 'INTEGER' },
					{ table: 'mata_pelajaran', column: 'kelas_id', type: 'INTEGER' },
					{ table: 'auth_user', column: 'sekolah_id', type: 'INTEGER' },
					{ table: 'feature_unlock', column: 'sekolah_id', type: 'INTEGER' },
					{ table: 'tahun_ajaran', column: 'sekolah_id', type: 'INTEGER' }
				];
				for (const c of checks) {
					try {
						const res = await client.execute({ sql: `PRAGMA table_info('${c.table}')` });
						const rows = res.rows || [];
						const names = rows.map((r) => r.name || r[1]);
						if (!names.includes(c.column)) {
							console.info(
								`[migrate-installed-db] Adding missing column ${c.column} to ${c.table}`
							);
							try {
								await client.execute({
									sql: `ALTER TABLE "${c.table}" ADD COLUMN "${c.column}" ${c.type}`
								});
								console.info(`[migrate-installed-db] Added ${c.column} on ${c.table}`);
							} catch (err) {
								console.warn(
									`[migrate-installed-db] Failed to add ${c.column} on ${c.table}:`,
									err && (err.message || err.toString())
								);
							}
						} else {
							console.info(
								`[migrate-installed-db] Column ${c.column} already present on ${c.table}`
							);
						}
					} catch (err) {
						const msg = err && (err.message || err.toString());
						if (msg && /no such table/i.test(msg)) {
							console.warn(`[migrate-installed-db] Table not present: ${c.table}`);
						} else {
							console.error('[migrate-installed-db] Error checking/adding columns:', err);
						}
					}
				}
				if (typeof client.close === 'function') await client.close();
			} catch (err) {
				console.warn(
					'[migrate-installed-db] Inline ensure-columns failed or @libsql/client missing:',
					err && (err.message || err.toString())
				);
				// continue; drizzle push will provide the definitive error if this fails
			}
		}

		// Aggressive pre-clean: drop any index variants that differ only by case/formatting
		// (some installs historically created `auth_user_usernameNormalized_unique` etc).
		try {
			const { createClient: createClientLocal } = await import('@libsql/client');
			const cleanupClient = createClientLocal({ url: dbPath });
			try {
				// 1) scan sqlite_master for any index names and drop those that
				// normalize to contain 'usernamenormalized' (robust to camelCase/underscore).
				const foundMaster = await cleanupClient.execute({
					sql: `SELECT name FROM sqlite_master WHERE type='index'`
				});
				const masterRows = foundMaster.rows || [];
				for (const r of masterRows) {
					const name = r && (r.name || r[0] || r[1]);
					const normalized = normalizeIndexNameForMatch(name);
					if (name && normalized.includes('usernamenormalized')) {
						try {
							await cleanupClient.execute({ sql: `DROP INDEX IF EXISTS "${name}"` });
							console.info(
								`[migrate-installed-db] Dropped pre-existing index from sqlite_master: ${name}`
							);
						} catch (err) {
							console.warn(
								`[migrate-installed-db] Failed to drop index ${name}:`,
								err && (err.message || err.toString())
							);
						}
					}
				}

				// 2) also check the auth_user table's index list (PRAGMA) for variants
				try {
					const idxRes = await cleanupClient.execute({ sql: `PRAGMA index_list('auth_user')` });
					const idxRows = idxRes.rows || [];
					for (const r of idxRows) {
						const name = r && (r.name || r[0] || r[1]);
						if (!name) continue;
						const normalized = normalizeIndexNameForMatch(name);
						// Prefer name-based match first (fast); fall back to column inspection.
						if (normalized.includes('usernamenormalized')) {
							try {
								await cleanupClient.execute({ sql: `DROP INDEX IF EXISTS "${name}"` });
								console.info(
									`[migrate-installed-db] Dropped pre-existing index (name match): ${name}`
								);
								continue;
							} catch (err) {
								console.warn(
									`[migrate-installed-db] Failed to drop pragma index ${name}:`,
									err && (err.message || err.toString())
								);
							}
						}
						// Use PRAGMA index_info to inspect indexed columns and drop any index
						// that references the `username_normalized` column (case-insensitive).
						try {
							const safeName = String(name).replace(/'/g, "''");
							const infoRes = await cleanupClient.execute({
								sql: `PRAGMA index_info('${safeName}')`
							});
							const infoRows = infoRes.rows || [];
							const cols = infoRows.map((c) => c.name || c[2] || c[1] || '');
							const hasUsernameNormalized = cols.some(
								(col) => String(col).toLowerCase() === 'username_normalized'
							);
							if (hasUsernameNormalized) {
								try {
									await cleanupClient.execute({ sql: `DROP INDEX IF EXISTS "${name}"` });
									console.info(
										`[migrate-installed-db] Dropped pre-existing index (indexed column match): ${name}`
									);
								} catch (err) {
									console.warn(
										`[migrate-installed-db] Failed to drop pragma index ${name}:`,
										err && (err.message || err.toString())
									);
								}
							}
						} catch (err) {
							console.info(
								'[migrate-installed-db] PRAGMA index_info check skipped/failed for',
								name,
								err && (err.message || err.toString())
							);
						}
					}
				} catch (err) {
					// ignore PRAGMA failures but log for diagnostics
					console.info(
						'[migrate-installed-db] PRAGMA index_list check skipped/failed:',
						err && (err.message || err.toString())
					);
				}

				// 3) final catch-all: look for any CREATE INDEX statements that reference the
				// `username_normalized` column in sqlite_master.sql and drop them. This will
				// catch mixed-cased names like `auth_user_usernameNormalized_unique`.
				try {
					const sqlRes = await cleanupClient.execute({
						sql: `SELECT name, sql FROM sqlite_master WHERE type='index' AND sql LIKE '%username_normalized%' COLLATE NOCASE`
					});
					const sqlRows = sqlRes.rows || [];
					for (const r of sqlRows) {
						const name = r && (r.name || r[0] || r[1]);
						if (!name) continue;
						const normalized = normalizeIndexNameForMatch(name);
						if (!normalized.includes('usernamenormalized')) continue;
						try {
							await cleanupClient.execute({ sql: `DROP INDEX IF EXISTS "${name}"` });
							console.info(
								`[migrate-installed-db] Dropped index referenced in sqlite_master.sql: ${name}`
							);
						} catch (err) {
							console.warn(
								`[migrate-installed-db] Failed to drop sqlite_master index ${name}:`,
								err && (err.message || err.toString())
							);
						}
					}
				} catch (err) {
					console.info(
						'[migrate-installed-db] sqlite_master sql-scan skipped/failed:',
						err && (err.message || err.toString())
					);
				}
			} finally {
				if (typeof cleanupClient.close === 'function') await cleanupClient.close();
			}
		} catch (err) {
			// Non-fatal: log and continue to let the standard fix-drizzle-indexes handle other cases
			console.info(
				'[migrate-installed-db] Pre-drizzle index cleanup skipped or failed:',
				err && (err.message || err.toString())
			);
		}

		// Run drizzle push with retry for index conflicts.
		// Some installed DBs have stale indexes that cause "index ... already exists".
		// Retry up to MAX_RETRIES times, dropping conflicting indexes between attempts.
		const MAX_RETRIES = 5;
		let lastError;
		for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
			try {
				runCapture(drizzleCmd, ['push', '--force'], { env: childEnv, cwd: projectRoot });
				lastError = null;
				break;
			} catch (err) {
				lastError = err;
				const msg = String(err?.message || err || '');
				const isIndexConflict =
					msg.includes('already exists') ||
					msg.includes('UNIQUE constraint failed') ||
					msg.includes('SQLITE_ERROR');
				if (!isIndexConflict) throw err;

				if (attempt < MAX_RETRIES) {
					const idxMatch = msg.match(/index\s+(["']?)([^"'\s]+)\1\s+already exists/i);
					const indexName = idxMatch ? idxMatch[2] : null;
					console.info(
						`[migrate-installed-db] drizzle push failed (attempt ${attempt}/${MAX_RETRIES})` +
							(indexName ? `: index "${indexName}" already exists` : '')
					);

					if (indexName) {
						try {
							const { createClient: createClientLocal2 } = await import('@libsql/client');
							const dropClient = createClientLocal2({ url: dbPath });
							try {
								await dropClient.execute({ sql: `DROP INDEX IF EXISTS "${indexName}"` });
								console.info(`[migrate-installed-db] Dropped conflicting index: ${indexName}`);
							} finally {
								if (typeof dropClient.close === 'function') await dropClient.close();
							}
						} catch (dropErr) {
							console.warn(
								'[migrate-installed-db] Failed to drop conflicting index:',
								dropErr?.message || dropErr
							);
						}
					}

					// Run fix-drizzle-indexes to handle auth_user username_normalized variants
					try {
						run(process.execPath, [path.join(projectRoot, 'scripts', 'fix-drizzle-indexes.mjs')], {
							env: childEnv,
							cwd: projectRoot
						});
					} catch (_) {
						// non-fatal
					}

					continue;
				}
			}
		}
		if (lastError) throw lastError;
		run(process.execPath, [path.join(projectRoot, 'scripts', 'fix-drizzle-indexes.mjs')], {
			env: childEnv,
			cwd: projectRoot
		});
		run(process.execPath, [path.join(projectRoot, 'scripts', 'seed-default-admin.mjs')], {
			env: childEnv,
			cwd: projectRoot
		});
		run(process.execPath, [path.join(projectRoot, 'scripts', 'grant-admin-permissions.mjs')], {
			env: childEnv,
			cwd: projectRoot
		});
		run(process.execPath, [path.join(projectRoot, 'scripts', 'notify-server-reload.mjs')], {
			env: childEnv,
			cwd: projectRoot
		});

		console.info('\n[migrate-installed-db] All steps completed successfully.');
	} catch (err) {
		console.error('\n[migrate-installed-db] Migration failed:', err?.message || err);
		process.exitCode = process.exitCode || 1;
	}
}

main();
