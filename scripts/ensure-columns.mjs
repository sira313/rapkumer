#!/usr/bin/env node
import { createClient } from '@libsql/client';

const DEFAULT_DB_URL = 'file:./data/database.sqlite3';
const dbUrl = process.env.DB_URL || DEFAULT_DB_URL;

async function tableHasColumn(client, table, column) {
	// Return detailed info: { exists: boolean, type: string | undefined }
	try {
		const res = await client.execute({ sql: `PRAGMA table_info('${table}')` });
		const rows = res.rows || [];
		// PRAGMA table_info returns rows with columns: cid, name, type, notnull, dflt_value, pk
		for (const r of rows) {
			const name = (r.name || r[1] || '').toString();
			if (name.toLowerCase() === column.toLowerCase()) {
				const type = (r.type || r[2] || '').toString();
				return { exists: true, type };
			}
		}
		return { exists: false };
	} catch (err) {
		const msg = err && (err.message || err.toString());
		if (msg && /no such table/i.test(msg)) {
			console.warn(`[ensure-columns] Table not present: ${table}`);
			return { exists: false };
		}
		throw err;
	}
}

async function addColumnIfMissing(client, table, column, type) {
	const info = await tableHasColumn(client, table, column);
	if (info.exists) {
		console.info(
			`[ensure-columns] Column ${column} already present on ${table} (type=${info.type || 'unknown'})`
		);
		// If type is provided and looks different, warn but do not attempt risky migration here
		if (info.type && type && info.type.toUpperCase() !== String(type).split(' ')[0].toUpperCase()) {
			console.warn(
				`[ensure-columns] Column ${column} on ${table} has type ${info.type} which differs from expected ${type}.` +
					' Leave as-is; manual migration may be required.'
			);
		}

		return { added: false };
	}

	console.info(`[ensure-columns] Adding column ${column} to ${table}`);
	try {
		await client.execute({ sql: `ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}` });
		console.info(`[ensure-columns] Added ${column} on ${table}`);
		return { added: true };
	} catch (err) {
		const msg = err && (err.message || err.toString());
		console.error(`[ensure-columns] Failed to add column ${column} to ${table}:`, msg || err);
		// don't throw - allow migrate process to continue and let drizzle report final error
		return { added: false, error: msg };
	}
}

async function ensureTableExists(client, tableName, createSQL) {
	try {
		const res = await client.execute({
			sql: `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
		});
		if (res.rows && res.rows.length > 0) {
			console.info(`[ensure-columns] Table ${tableName} already exists`);
			return { created: false };
		}

		console.info(`[ensure-columns] Creating table ${tableName}`);
		await client.execute({ sql: createSQL });
		console.info(`[ensure-columns] Created table ${tableName}`);
		return { created: true };
	} catch (err) {
		const msg = err && (err.message || err.toString());
		console.error(`[ensure-columns] Failed to create table ${tableName}:`, msg || err);
		return { created: false, error: msg };
	}
}

async function ensureIndexExists(client, indexName, createIndexSQL) {
	try {
		const res = await client.execute({
			sql: `SELECT name FROM sqlite_master WHERE type='index' AND name='${indexName}'`
		});
		if (res.rows && res.rows.length > 0) {
			console.info(`[ensure-columns] Index ${indexName} already exists`);
			return { created: false };
		}

		console.info(`[ensure-columns] Creating index ${indexName}`);
		await client.execute({ sql: createIndexSQL });
		console.info(`[ensure-columns] Created index ${indexName}`);
		return { created: true };
	} catch (err) {
		const msg = err && (err.message || err.toString());
		console.error(`[ensure-columns] Failed to create index ${indexName}:`, msg || err);
		return { created: false, error: msg };
	}
}

async function main() {
	console.info('[ensure-columns] Target DB:', dbUrl);
	const client = createClient({ url: dbUrl });
	const added = [];
	const skipped = [];

	try {
		// Ensure keasramaan tables exist (from migration 0021)
		await ensureTableExists(
			client,
			'keasramaan',
			`
			CREATE TABLE IF NOT EXISTS "keasramaan" (
				"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
				"nama" text NOT NULL,
				"kelas_id" integer NOT NULL,
				"created_at" text NOT NULL,
				"updated_at" text,
				CONSTRAINT "keasramaan_kelas_id_kelas_id_fk" FOREIGN KEY ("kelas_id") REFERENCES "kelas" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
			)
		`
		);

		await client.execute({
			sql: `CREATE UNIQUE INDEX IF NOT EXISTS "keasramaan_kelas_id_nama_unique" ON "keasramaan" ("kelas_id", "nama")`
		});

		await ensureTableExists(
			client,
			'keasramaan_indikator',
			`
			CREATE TABLE IF NOT EXISTS "keasramaan_indikator" (
				"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
				"keasramaan_id" integer NOT NULL,
				"deskripsi" text NOT NULL,
				"created_at" text NOT NULL,
				"updated_at" text,
				CONSTRAINT "keasramaan_indikator_keasramaan_id_keasramaan_id_fk" FOREIGN KEY ("keasramaan_id") REFERENCES "keasramaan" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
			)
		`
		);

		await client.execute({
			sql: `CREATE INDEX IF NOT EXISTS "keasramaan_indikator_keasramaan_idx" ON "keasramaan_indikator" ("keasramaan_id")`
		});

		await ensureTableExists(
			client,
			'keasramaan_tujuan',
			`
			CREATE TABLE IF NOT EXISTS "keasramaan_tujuan" (
				"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
				"indikator_id" integer NOT NULL,
				"deskripsi" text NOT NULL,
				"created_at" text NOT NULL,
				"updated_at" text,
				CONSTRAINT "keasramaan_tujuan_indikator_id_keasramaan_indikator_id_fk" FOREIGN KEY ("indikator_id") REFERENCES "keasramaan_indikator" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
			)
		`
		);

		await client.execute({
			sql: `CREATE INDEX IF NOT EXISTS "keasramaan_tujuan_indikator_idx" ON "keasramaan_tujuan" ("indikator_id")`
		});

		await ensureTableExists(
			client,
			'asesmen_keasramaan',
			`
			CREATE TABLE IF NOT EXISTS "asesmen_keasramaan" (
				"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
				"murid_id" integer NOT NULL,
				"keasramaan_id" integer NOT NULL,
				"tujuan_id" integer NOT NULL,
				"kategori" text NOT NULL,
				"dinilai_pada" text,
				"created_at" text NOT NULL,
				"updated_at" text,
				CONSTRAINT "asesmen_keasramaan_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
				CONSTRAINT "asesmen_keasramaan_keasramaan_id_keasramaan_id_fk" FOREIGN KEY ("keasramaan_id") REFERENCES "keasramaan" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
				CONSTRAINT "asesmen_keasramaan_tujuan_id_keasramaan_tujuan_id_fk" FOREIGN KEY ("tujuan_id") REFERENCES "keasramaan_tujuan" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
			)
		`
		);

		await client.execute({
			sql: `CREATE UNIQUE INDEX IF NOT EXISTS "asesmen_keasramaan_murid_keasramaan_tujuan_unique" ON "asesmen_keasramaan" ("murid_id", "keasramaan_id", "tujuan_id")`
		});

		await client.execute({
			sql: `CREATE INDEX IF NOT EXISTS "asesmen_keasramaan_murid_idx" ON "asesmen_keasramaan" ("murid_id")`
		});

		await client.execute({
			sql: `CREATE INDEX IF NOT EXISTS "asesmen_keasramaan_keasramaan_idx" ON "asesmen_keasramaan" ("keasramaan_id")`
		});

		// Ensure keputusan_murid table exists
		await ensureTableExists(
			client,
			'keputusan_murid',
			`
			CREATE TABLE IF NOT EXISTS "keputusan_murid" (
				"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
				"murid_id" integer NOT NULL,
				"naik" integer DEFAULT 1 NOT NULL,
				"created_at" text NOT NULL,
				"updated_at" text,
				CONSTRAINT "keputusan_murid_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
			)
		`
		);

		await client.execute({
			sql: `CREATE UNIQUE INDEX IF NOT EXISTS "keputusan_murid_murid_id_unique" ON "keputusan_murid" ("murid_id")`
		});

		await client.execute({
			sql: `CREATE INDEX IF NOT EXISTS "keputusan_murid_murid_idx" ON "keputusan_murid" ("murid_id")`
		});

		// Ensure murid_ekstrakurikuler table exists (from migration 0030)
		await ensureTableExists(
			client,
			'murid_ekstrakurikuler',
			`
			CREATE TABLE IF NOT EXISTS "murid_ekstrakurikuler" (
				"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
				"murid_id" integer NOT NULL,
				"ekstrakurikuler_id" integer NOT NULL,
				"nilai_kosong" integer DEFAULT 0 NOT NULL,
				"created_at" text NOT NULL,
				"updated_at" text,
				CONSTRAINT "murid_ekstrakurikuler_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
				CONSTRAINT "murid_ekstrakurikuler_ekstrakurikuler_id_ekstrakurikuler_id_fk" FOREIGN KEY ("ekstrakurikuler_id") REFERENCES "ekstrakurikuler" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
			)
		`
		);

		await client.execute({
			sql: `CREATE UNIQUE INDEX IF NOT EXISTS "murid_ekstrakurikuler_murid_ekstrak_unique" ON "murid_ekstrakurikuler" ("murid_id", "ekstrakurikuler_id")`
		});

		await client.execute({
			sql: `CREATE INDEX IF NOT EXISTS "murid_ekstrakurikuler_murid_idx" ON "murid_ekstrakurikuler" ("murid_id")`
		});

		await client.execute({
			sql: `CREATE INDEX IF NOT EXISTS "murid_ekstrakurikuler_ekstrak_idx" ON "murid_ekstrakurikuler" ("ekstrakurikuler_id")`
		});

		// Ensure murid_mata_pelajaran table exists (from migration 0031)
		await ensureTableExists(
			client,
			'murid_mata_pelajaran',
			`
			CREATE TABLE IF NOT EXISTS "murid_mata_pelajaran" (
				"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
				"murid_id" integer NOT NULL,
				"mata_pelajaran_id" integer NOT NULL,
				"nilai_kosong" integer DEFAULT 0 NOT NULL,
				"created_at" text NOT NULL,
				"updated_at" text,
				CONSTRAINT "murid_mata_pelajaran_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
				CONSTRAINT "murid_mata_pelajaran_mata_pelajaran_id_mata_pelajaran_id_fk" FOREIGN KEY ("mata_pelajaran_id") REFERENCES "mata_pelajaran" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
			)
		`
		);

		await client.execute({
			sql: `CREATE UNIQUE INDEX IF NOT EXISTS "murid_mata_pelajaran_murid_mapel_unique" ON "murid_mata_pelajaran" ("murid_id", "mata_pelajaran_id")`
		});

		await client.execute({
			sql: `CREATE INDEX IF NOT EXISTS "murid_mata_pelajaran_murid_idx" ON "murid_mata_pelajaran" ("murid_id")`
		});

		await client.execute({
			sql: `CREATE INDEX IF NOT EXISTS "murid_mata_pelajaran_mapel_idx" ON "murid_mata_pelajaran" ("mata_pelajaran_id")`
		});

		// ===== PERFORMANCE OPTIMIZATION INDEXES =====
		// These indexes significantly improve query performance, especially on /pengguna page
		// which performs heavy consolidation queries on every load
		console.info('[ensure-columns] Creating performance optimization indexes...');

		// auth_user table indexes - heavily queried for user management
		await ensureIndexExists(
			client,
			'idx_auth_user_pegawai_id',
			'CREATE INDEX IF NOT EXISTS "idx_auth_user_pegawai_id" ON "auth_user" ("pegawai_id")'
		);
		await ensureIndexExists(
			client,
			'idx_auth_user_type',
			'CREATE INDEX IF NOT EXISTS "idx_auth_user_type" ON "auth_user" ("type")'
		);
		await ensureIndexExists(
			client,
			'idx_auth_user_kelas_id',
			'CREATE INDEX IF NOT EXISTS "idx_auth_user_kelas_id" ON "auth_user" ("kelas_id")'
		);
		await ensureIndexExists(
			client,
			'idx_auth_user_mata_pelajaran_id',
			'CREATE INDEX IF NOT EXISTS "idx_auth_user_mata_pelajaran_id" ON "auth_user" ("mata_pelajaran_id")'
		);
		await ensureIndexExists(
			client,
			'idx_auth_user_sekolah_id',
			'CREATE INDEX IF NOT EXISTS "idx_auth_user_sekolah_id" ON "auth_user" ("sekolah_id")'
		);

		// kelas table indexes - frequently joined with wali_kelas queries
		await ensureIndexExists(
			client,
			'idx_kelas_wali_kelas_id',
			'CREATE INDEX IF NOT EXISTS "idx_kelas_wali_kelas_id" ON "kelas" ("wali_kelas_id")'
		);
		await ensureIndexExists(
			client,
			'idx_kelas_wali_asrama_id',
			'CREATE INDEX IF NOT EXISTS "idx_kelas_wali_asrama_id" ON "kelas" ("wali_asrama_id")'
		);
		await ensureIndexExists(
			client,
			'idx_kelas_wali_asuh_id',
			'CREATE INDEX IF NOT EXISTS "idx_kelas_wali_asuh_id" ON "kelas" ("wali_asuh_id")'
		);
		await ensureIndexExists(
			client,
			'idx_kelas_sekolah_id',
			'CREATE INDEX IF NOT EXISTS "idx_kelas_sekolah_id" ON "kelas" ("sekolah_id")'
		);
		await ensureIndexExists(
			client,
			'idx_kelas_tahun_ajaran_id',
			'CREATE INDEX IF NOT EXISTS "idx_kelas_tahun_ajaran_id" ON "kelas" ("tahun_ajaran_id")'
		);
		await ensureIndexExists(
			client,
			'idx_kelas_semester_id',
			'CREATE INDEX IF NOT EXISTS "idx_kelas_semester_id" ON "kelas" ("semester_id")'
		);

		// murid table indexes
		await ensureIndexExists(
			client,
			'idx_murid_kelas_id',
			'CREATE INDEX IF NOT EXISTS "idx_murid_kelas_id" ON "murid" ("kelas_id")'
		);

		// mata_pelajaran table indexes
		await ensureIndexExists(
			client,
			'idx_mata_pelajaran_kelas_id',
			'CREATE INDEX IF NOT EXISTS "idx_mata_pelajaran_kelas_id" ON "mata_pelajaran" ("kelas_id")'
		);

		// Prevent duplicate mata pelajaran per kelas (0031)
		await ensureIndexExists(
			client,
			'mata_pelajaran_kelas_id_nama_unique',
			'CREATE UNIQUE INDEX IF NOT EXISTS "mata_pelajaran_kelas_id_nama_unique" ON "mata_pelajaran" ("kelas_id", "nama")'
		);

		// tujuan_pembelajaran table indexes
		await ensureIndexExists(
			client,
			'idx_tujuan_pembelajaran_mata_pelajaran_id',
			'CREATE INDEX IF NOT EXISTS "idx_tujuan_pembelajaran_mata_pelajaran_id" ON "tujuan_pembelajaran" ("mata_pelajaran_id")'
		);

		// asesmen tables indexes
		await ensureIndexExists(
			client,
			'idx_asesmen_formatif_murid_id',
			'CREATE INDEX IF NOT EXISTS "idx_asesmen_formatif_murid_id" ON "asesmen_formatif" ("murid_id")'
		);
		await ensureIndexExists(
			client,
			'idx_asesmen_formatif_mata_pelajaran_id',
			'CREATE INDEX IF NOT EXISTS "idx_asesmen_formatif_mata_pelajaran_id" ON "asesmen_formatif" ("mata_pelajaran_id")'
		);
		await ensureIndexExists(
			client,
			'idx_asesmen_sumatif_murid_id',
			'CREATE INDEX IF NOT EXISTS "idx_asesmen_sumatif_murid_id" ON "asesmen_sumatif" ("murid_id")'
		);
		await ensureIndexExists(
			client,
			'idx_asesmen_sumatif_mata_pelajaran_id',
			'CREATE INDEX IF NOT EXISTS "idx_asesmen_sumatif_mata_pelajaran_id" ON "asesmen_sumatif" ("mata_pelajaran_id")'
		);

		// tahun_ajaran table indexes
		await ensureIndexExists(
			client,
			'idx_tahun_ajaran_sekolah_id',
			'CREATE INDEX IF NOT EXISTS "idx_tahun_ajaran_sekolah_id" ON "tahun_ajaran" ("sekolah_id")'
		);

		// tasks table indexes
		await ensureIndexExists(
			client,
			'idx_tasks_sekolah_id',
			'CREATE INDEX IF NOT EXISTS "idx_tasks_sekolah_id" ON "tasks" ("sekolah_id")'
		);
		await ensureIndexExists(
			client,
			'idx_tasks_kelas_id',
			'CREATE INDEX IF NOT EXISTS "idx_tasks_kelas_id" ON "tasks" ("kelas_id")'
		);

		console.info('[ensure-columns] Performance optimization indexes created successfully');

		// Columns referenced by migrations that may be missing in older installed DBs.
		// If missing, add them so subsequent migration UPDATE statements do not fail.
		const checks = [
			{ table: 'sekolah', column: 'jenjang_variant', type: 'TEXT' },
			// Sekolah bobot columns (sumatif distribution)
			{ table: 'sekolah', column: 'sumatif_bobot_lingkup', type: 'INTEGER DEFAULT 60' },
			{ table: 'sekolah', column: 'sumatif_bobot_sts', type: 'INTEGER DEFAULT 20' },
			{ table: 'sekolah', column: 'sumatif_bobot_sas', type: 'INTEGER DEFAULT 20' },
			// Rapor Tengah Semester bobot: lingkup 70%, STS 30%
			{ table: 'sekolah', column: 'sumatif_bobot_rts_lingkup', type: 'INTEGER DEFAULT 70' },
			{ table: 'sekolah', column: 'sumatif_bobot_rts_sts', type: 'INTEGER DEFAULT 30' },
			// Sekolah rapor kriteria columns
			{ table: 'sekolah', column: 'rapor_kriteria_cukup', type: 'INTEGER DEFAULT 85' },
			{ table: 'sekolah', column: 'rapor_kriteria_baik', type: 'INTEGER DEFAULT 95' },
			// Also accept camelCase variants created by older migrations
			{ table: 'sekolah', column: 'raporKriteriaCukup', type: 'INTEGER DEFAULT 85' },
			{ table: 'sekolah', column: 'raporKriteriaBaik', type: 'INTEGER DEFAULT 95' },

			// Columns added by other migrations
			{ table: 'sekolah', column: 'lokasi_tanda_tangan', type: 'TEXT' },
			{ table: 'sekolah', column: 'lokasiTandaTangan', type: 'TEXT' },
			{ table: 'sekolah', column: 'logo_dinas', type: 'BLOB' },
			{ table: 'sekolah', column: 'logo_dinas_type', type: 'TEXT' },

			// STS columns on asesmen_sumatif (0015)
			{ table: 'asesmen_sumatif', column: 'stsTes', type: 'REAL' },
			{ table: 'asesmen_sumatif', column: 'stsNonTes', type: 'REAL' },
			{ table: 'asesmen_sumatif', column: 'sts', type: 'REAL' },

			// mata_pelajaran.kode (0018)
			{ table: 'mata_pelajaran', column: 'kode', type: 'TEXT' },

			// kelas waliAsrama / waliAsuh added in later migrations (0024 / 0026)
			{ table: 'kelas', column: 'waliAsramaId', type: 'INTEGER' },
			{ table: 'kelas', column: 'wali_asrama_id', type: 'INTEGER' },
			{ table: 'kelas', column: 'waliAsuhId', type: 'INTEGER' },
			{ table: 'kelas', column: 'wali_asuh_id', type: 'INTEGER' },

			// status kepala sekolah (0027) - accept both variants
			{
				table: 'sekolah',
				column: 'statusKepalaSekolah',
				type: "TEXT NOT NULL DEFAULT 'definitif'"
			},
			{
				table: 'sekolah',
				column: 'status_kepala_sekolah',
				type: "TEXT NOT NULL DEFAULT 'definitif'"
			},
			{ table: 'tasks', column: 'sekolah_id', type: 'INTEGER' },
			{ table: 'tasks', column: 'kelas_id', type: 'INTEGER' },
			{ table: 'kelas', column: 'sekolah_id', type: 'INTEGER' },
			{ table: 'mata_pelajaran', column: 'kelas_id', type: 'INTEGER' },
			// permissions column stores a JSON array as TEXT (default '[]').
			// Add this so older DBs without the column won't break seed/migration scripts.
			{ table: 'auth_user', column: 'permissions', type: "TEXT NOT NULL DEFAULT '[]'" },
			// 'type' column indicates user type; keep default in sync with schema (admin/wali_kelas/user)
			{ table: 'auth_user', column: 'type', type: "TEXT NOT NULL DEFAULT 'admin'" },
			// Common foreign key columns older DBs may lack
			{ table: 'auth_user', column: 'pegawai_id', type: 'INTEGER' },
			{ table: 'auth_user', column: 'kelas_id', type: 'INTEGER' },
			{ table: 'auth_user', column: 'mata_pelajaran_id', type: 'INTEGER' },
			{ table: 'sekolah', column: 'kepala_sekolah_id', type: 'INTEGER' },
			{ table: 'kelas', column: 'wali_kelas_id', type: 'INTEGER' },
			{ table: 'murid', column: 'kelas_id', type: 'INTEGER' }, // Kolom foto untuk murid (path/filename foto murid)
			{ table: 'murid', column: 'foto', type: 'TEXT' },
			// wali asuh per murid (moved from kelas level)
			{ table: 'murid', column: 'wali_asuh_nama', type: 'TEXT' },
			{ table: 'murid', column: 'wali_asuh_nip', type: 'TEXT' }, // Columns for mata_pelajaran relations used by asesmen/tujuan tables
			{ table: 'tujuan_pembelajaran', column: 'mata_pelajaran_id', type: 'INTEGER' },
			{ table: 'asesmen_sumatif', column: 'mata_pelajaran_id', type: 'INTEGER' },
			{ table: 'asesmen_sumatif', column: 'nilai_akhir_rts', type: 'REAL' },
			{ table: 'asesmen_sumatif_tujuan', column: 'mata_pelajaran_id', type: 'INTEGER' },
			{ table: 'asesmen_formatif', column: 'mata_pelajaran_id', type: 'INTEGER' },
			// Tabel murid_ekstrakurikuler untuk tracking nilai kosong per murid (0030)
			{ table: 'murid_ekstrakurikuler', column: 'murid_id', type: 'INTEGER NOT NULL' },
			{ table: 'murid_ekstrakurikuler', column: 'ekstrakurikuler_id', type: 'INTEGER NOT NULL' },
			{
				table: 'murid_ekstrakurikuler',
				column: 'nilai_kosong',
				type: 'INTEGER DEFAULT 0 NOT NULL'
			},
			// Tabel murid_mata_pelajaran untuk tracking nilai kosong per murid per mata pelajaran (0031)
			{ table: 'murid_mata_pelajaran', column: 'murid_id', type: 'INTEGER NOT NULL' },
			{ table: 'murid_mata_pelajaran', column: 'mata_pelajaran_id', type: 'INTEGER NOT NULL' },
			{
				table: 'murid_mata_pelajaran',
				column: 'nilai_kosong',
				type: 'INTEGER DEFAULT 0 NOT NULL'
			},
			// Columns referenced by newer migrations that older DBs may not have
			// Naungan (organisasi pengelola sekolah)
			{ table: 'sekolah', column: 'naungan', type: "TEXT NOT NULL DEFAULT 'kemendikbud'" },
			{ table: 'sekolah', column: 'naungan', type: 'TEXT' },
			{ table: 'auth_user', column: 'sekolah_id', type: 'INTEGER' },
			{ table: 'feature_unlock', column: 'sekolah_id', type: 'INTEGER' },
			{ table: 'tahun_ajaran', column: 'sekolah_id', type: 'INTEGER' }
		];

		for (const c of checks) {
			const res = await addColumnIfMissing(client, c.table, c.column, c.type);
			if (res && res.added) added.push(`${c.table}.${c.column}`);
			else skipped.push(`${c.table}.${c.column}`);
		}

		console.info('[ensure-columns] Summary:');
		console.info('[ensure-columns] Added columns:', added.length ? added.join(', ') : '(none)');
		console.info(
			'[ensure-columns] Skipped (already present):',
			skipped.length ? skipped.join(', ') : '(none)'
		);
	} catch (err) {
		console.error('[ensure-columns] Unexpected error:', err && (err.message || err.toString()));
		process.exitCode = 1;
	} finally {
		if (typeof client.close === 'function') await client.close();
	}
}

main().catch((err) => {
	console.error('[ensure-columns] Unhandled error:', err && (err.message || err.toString()));
	process.exitCode = 1;
});
