import db from '$lib/server/db';
import { ensureSchema } from './ensure-helper';

const TABLE = 'presensi_settings';

export async function ensurePresensiSettingsSchema() {
	await ensureSchema(TABLE, [
		`CREATE TABLE IF NOT EXISTS "${TABLE}" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "sekolah_id" integer NOT NULL,
      "tahun_ajaran_id" integer NOT NULL REFERENCES "tahun_ajaran"("id") ON DELETE CASCADE,
      "jam_masuk" text NOT NULL DEFAULT '07:30',
      "jam_pulang" text NOT NULL DEFAULT '15:00',
      "hari_sekolah" integer NOT NULL DEFAULT 6,
      "tipe_presensi" text NOT NULL DEFAULT 'masuk_pulang',
      "libur_nasional" text NOT NULL DEFAULT '[]',
      "libur_semester" text NOT NULL DEFAULT '[]',
      "created_at" text NOT NULL,
      "updated_at" text,
      CONSTRAINT "presensi_settings_sekolah_id_sekolah_id_fk" FOREIGN KEY ("sekolah_id") REFERENCES "sekolah" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
      CONSTRAINT "presensi_settings_tahun_ajaran_id_tahun_ajaran_id_fk" FOREIGN KEY ("tahun_ajaran_id") REFERENCES "tahun_ajaran" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
      CONSTRAINT "presensi_settings_sekolah_id_tahun_ajaran_id_unique" UNIQUE("sekolah_id","tahun_ajaran_id")
    )`
	]);
	for (const col of ['libur_nasional', 'libur_semester']) {
		try {
			await db.$client.execute(
				`ALTER TABLE "${TABLE}" ADD COLUMN "${col}" text NOT NULL DEFAULT '[]'`
			);
		} catch {
			// column already exists
		}
	}
	try {
		await db.$client.execute(
			`ALTER TABLE "${TABLE}" ADD COLUMN "tahun_ajaran_id" integer REFERENCES "tahun_ajaran"("id") ON DELETE CASCADE`
		);
	} catch {
		// column already exists
	}

	// Drop old unique index on (sekolah_id) alone that may exist from Drizzle or prior schema
	const oldIndexNames = [
		'presensi_settings_sekolahId_unique',
		'presensi_settings_sekolah_id_unique'
	];
	for (const idx of oldIndexNames) {
		try {
			await db.$client.execute(`DROP INDEX IF EXISTS "${idx}"`);
		} catch {
			// may not exist
		}
	}

	// Also scan for any other unique index on presensi_settings that only covers sekolah_id
	try {
		const idxList = await db.$client.execute({
			sql: `SELECT DISTINCT il.name FROM pragma_index_list('${TABLE}') il JOIN pragma_index_info(il.name) ii ON 1=1 WHERE il."unique" = 1 GROUP BY il.name HAVING COUNT(ii.name) = 1 AND MAX(CASE WHEN ii.name = 'sekolah_id' THEN 1 ELSE 0 END) = 1`
		});
		const rows = idxList.rows || [];
		for (const row of rows) {
			const name = String(row?.name ?? row?.[0] ?? '');
			if (name && !name.includes('tahun_ajaran_id')) {
				try {
					await db.$client.execute(`DROP INDEX IF EXISTS "${name}"`);
				} catch {
					// ignore
				}
			}
		}
	} catch {
		// pragma may fail on older SQLite versions
	}

	// Create composite unique index if not present
	try {
		await db.$client.execute(
			`CREATE UNIQUE INDEX IF NOT EXISTS "presensi_settings_sekolah_id_tahun_ajaran_id_unique" ON "${TABLE}" ("sekolah_id", "tahun_ajaran_id")`
		);
	} catch {
		// index may already exist
	}
}
