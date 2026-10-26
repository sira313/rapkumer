import { error, json } from '@sveltejs/kit';
import { copyFile, mkdir, stat, writeFile, unlink, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { closeDbClient, reloadDbClient } from '$lib/server/db';
import db from '$lib/server/db';
import {
	withDatabaseMaintenance,
	blockDatabaseAfterRecoveryFailure
} from '$lib/server/db/maintenance';
import { randomUUID } from 'node:crypto';
import { resolveDatabasePath } from '$lib/server/db-url';
import { runStartupEnsures, resetStartupEnsures } from '$lib/server/db/ensure-bootstrap';
import { execFile } from 'node:child_process';
import { cookieNames } from '$lib/utils';
import { resolveSession } from '$lib/server/auth';
import { createClient } from '@libsql/client';

async function removeSqliteCompanions(dbPath: string) {
	for (const ext of ['-wal', '-shm']) {
		await unlink(dbPath + ext).catch((cause: NodeJS.ErrnoException) => {
			if (cause.code !== 'ENOENT') throw cause;
		});
	}
}

function assertCheckpoint(result: { rows: ArrayLike<{ [key: string]: unknown }> }) {
	if (!result.rows.length || Number(result.rows[0].busy) !== 0) {
		throw new Error('Database checkpoint is busy; import aborted');
	}
}

async function checkpointDatabase(dbPath: string) {
	const client = createClient({ url: `file:${dbPath}` });
	try {
		assertCheckpoint(await client.execute('PRAGMA wal_checkpoint(TRUNCATE)'));
	} finally {
		const close = (client as unknown as { close?: () => Promise<void> | void }).close;
		if (typeof close === 'function') await close.call(client);
	}
}

function runScript(script: string, options: { env?: NodeJS.ProcessEnv; maxBuffer?: number } = {}) {
	const scriptPath = resolve(process.cwd(), 'scripts', script);
	console.info('[database-import] running', script);
	return new Promise<void>((resolvePromise, rejectPromise) => {
		const child = execFile(
			process.execPath,
			[scriptPath],
			{
				windowsHide: true,
				env: options.env,
				maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024
			},
			(err, stdout, stderr) => {
				if (stdout && String(stdout).trim())
					console.info('[' + script + ' stdout]', String(stdout).trim());
				if (stderr && String(stderr).trim())
					console.warn('[' + script + ' stderr]', String(stderr).trim());
				if (err) return rejectPromise(err);
				resolvePromise();
			}
		);
		child.on('error', (e) => rejectPromise(e));
	});
}

export async function POST({ request, cookies }) {
	// PM2 workers do not share the in-process connection or maintenance gate.
	if (process.env.NODE_APP_INSTANCE !== undefined) {
		throw error(503, 'Hentikan PM2 dan jalankan satu proses aplikasi untuk mengimpor database.');
	}
	const formData = await request.formData();
	const file = formData.get('database');
	console.log('[database-import] menerima permintaan import');

	// Preserve admin access across the DB swap: verify the caller is an admin
	// using the currently-open DB before we overwrite it. After the import we
	// will create a fresh session in the newly-imported DB so the client stays
	// authenticated.
	const existingToken = cookies?.get?.(cookieNames.AUTH_SESSION);
	if (!existingToken) {
		console.warn('[database-import] tidak ada cookie sesi pada permintaan');
		throw error(403, 'Akses ditolak');
	}
	const resolved = await resolveSession(existingToken).catch((e) => {
		console.warn('[database-import] gagal memverifikasi sesi sebelum import', e);
		return null;
	});
	if (
		!resolved ||
		!resolved.user ||
		(resolved.user.type !== 'admin' && resolved.user.type !== 'kepala_sekolah')
	) {
		console.warn('[database-import] user tidak memiliki izin admin');
		throw error(403, 'Akses ditolak');
	}

	if (!(file instanceof File)) {
		console.warn('[database-import] gagal: field database tidak ditemukan dalam formData');
		throw error(400, 'Berkas database tidak ditemukan');
	}

	if (file.size === 0) {
		console.warn('[database-import] gagal: berkas kosong');
		throw error(400, 'Berkas database kosong');
	}

	console.log('[database-import] ukuran berkas', file.size, 'byte');

	const dbPath = resolveDatabasePath();
	const dbDir = dirname(dbPath);

	await mkdir(dbDir, { recursive: true });

	// Read uploaded file into buffer
	const uploadedBuffer = Buffer.from(await file.arrayBuffer());

	// Verify buffer length matches expected file size
	if (uploadedBuffer.length !== file.size) {
		console.error(
			'[database-import] ukuran buffer tidak sesuai:',
			uploadedBuffer.length,
			'(expected:',
			file.size,
			')'
		);
		throw error(500, 'Berkas database tidak lengkap');
	}

	if (uploadedBuffer.length < 100) {
		console.error('[database-import] buffer terlalu kecil, bukan database SQLite yang valid');
		throw error(500, 'Berkas database tidak valid');
	}

	// Write to a temp file first, then atomically replace the target.
	// This prevents partial writes if the server crashes mid-import.
	const tempPath = join(dbDir, `database-import-temp-${randomUUID()}.sqlite3`);
	try {
		await writeFile(tempPath, uploadedBuffer);
		const writtenStat = await stat(tempPath);
		if (writtenStat.size !== uploadedBuffer.length) {
			throw error(500, 'Gagal menulis berkas database: ukuran tidak sesuai');
		}
	} catch {
		await unlink(tempPath).catch(() => {});
		throw error(500, 'Gagal menyimpan berkas database');
	}

	// Bring the candidate up to date before touching the live database. A valid
	// SQLite header alone is not enough: migration failures must never replace
	// a database that is currently working.
	try {
		for (const script of [
			'fix-drizzle-indexes.mjs',
			'ensure-columns.mjs',
			'seed-default-admin.mjs',
			'grant-admin-permissions.mjs'
		]) {
			await runScript(script, { env: { ...process.env, DB_URL: `file:${tempPath}` } });
		}
		await checkpointDatabase(tempPath);
	} catch (cause) {
		await unlink(tempPath).catch(() => {});
		await removeSqliteCompanions(tempPath).catch((cleanupError) => {
			console.warn('[database-import] candidate cleanup failed', cleanupError);
		});
		console.error('[database-import] kandidat database gagal divalidasi', cause);
		throw error(400, 'Berkas database tidak kompatibel dengan versi aplikasi ini');
	}

	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const backupPath = join(dbDir, `database-backup-before-import-${timestamp}.sqlite3`);
	try {
		return await withDatabaseMaintenance(async () => {
			// Close the current DB client so no process holds a WAL lock
			assertCheckpoint(await db.$client.execute('PRAGMA wal_checkpoint(TRUNCATE)'));
			await closeDbClient();

			// Backup current database (if exists)
			try {
				await copyFile(dbPath, backupPath);
			} catch (cause) {
				console.error('[database-import] gagal membuat backup database', cause);
				try {
					await reloadDbClient();
				} catch (recoveryError) {
					blockDatabaseAfterRecoveryFailure();
					throw recoveryError;
				}
				throw error(500, 'Gagal membuat backup database');
			}

			let replaced = false;
			// Keep replacement and activation in the same recovery boundary.
			try {
				await removeSqliteCompanions(dbPath);
				await rename(tempPath, dbPath);
				replaced = true;
				await reloadDbClient();
				resetStartupEnsures();
				await runStartupEnsures();
			} catch (cause) {
				console.error('[database-import] gagal mengganti berkas database', cause);
				try {
					await closeDbClient();
					if (replaced) {
						await removeSqliteCompanions(dbPath);
						await copyFile(backupPath, dbPath);
					}
					await reloadDbClient();
					resetStartupEnsures();
					await runStartupEnsures();
				} catch (recoveryError) {
					blockDatabaseAfterRecoveryFailure();
					console.error(
						'[database-import] recovery failed; backup retained at',
						backupPath,
						recoveryError
					);
					throw error(
						503,
						'Pemulihan database gagal. Akses dihentikan; pulihkan backup sebelum menjalankan ulang aplikasi.'
					);
				}
				throw error(500, 'Gagal menyimpan berkas database');
			} finally {
				await unlink(tempPath).catch(() => {});
			}

			console.log('[database-import] import selesai. Backup disimpan di', backupPath);

			// Clear auth session cookie so user must re-login against the imported DB
			try {
				const secure = process.env.NODE_ENV === 'production';
				cookies.set(cookieNames.AUTH_SESSION, '', {
					path: '/',
					httpOnly: true,
					sameSite: 'lax',
					secure,
					expires: new Date(0)
				});
				console.info('[database-import] cleared auth session cookie');
			} catch (e) {
				console.warn('[database-import] failed to clear auth session cookie (non-fatal):', e);
			}

			// Re-apply the startup schema ensures against the imported DB. The in-process
			// "already ensured" cache was populated for the previous database, so without
			// a reset the ensure-* helpers would skip the imported one. This is the
			// safety net for production installs where drizzle-kit is not available.
			console.info('[database-import] schema ensures re-applied');

			return json({
				message: 'Database berhasil diimport. Silakan login ulang.',
				logout: true,
				loginPath: '/login'
			});
		});
	} finally {
		await unlink(tempPath).catch(() => {});
		await removeSqliteCompanions(tempPath).catch((cleanupError) => {
			console.warn('[database-import] candidate cleanup failed', cleanupError);
		});
	}
}
