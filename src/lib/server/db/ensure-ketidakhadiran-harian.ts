import db from '$lib/server/db';
import { ensureSchema } from './ensure-helper';

export async function ensureKetidakhadiranHarianSchema() {
	await ensureSchema('ketidakhadiran_harian', [
		`CREATE TABLE IF NOT EXISTS "ketidakhadiran_harian" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "murid_id" integer NOT NULL,
      "tanggal" text NOT NULL,
      "mata_pelajaran_id" integer,
      "keterangan" text,
      "keterangan_pulang" text,
      "created_at" text NOT NULL,
      "updated_at" text,
      CONSTRAINT "ketidakhadiran_harian_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
      CONSTRAINT "ketidakhadiran_harian_mata_pelajaran_id_mata_pelajaran_id_fk" FOREIGN KEY ("mata_pelajaran_id") REFERENCES "mata_pelajaran" ("id") ON UPDATE NO ACTION ON DELETE SET NULL
    )`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "ketidakhadiran_murid_tanggal_mapel_idx" ON "ketidakhadiran_harian" ("murid_id", "tanggal", "mata_pelajaran_id")`
	]);

	// migrate existing tables that still have old sakit/izin/alfa columns
	const colInfo = await db.$client.execute({
		sql: `PRAGMA table_info("ketidakhadiran_harian")`
	});
	const cols = (colInfo.rows as unknown as Array<{ name: string }>).map((r) => r.name);

	if (!cols.includes('keterangan')) {
		await db.$client.execute({
			sql: `ALTER TABLE "ketidakhadiran_harian" ADD COLUMN "keterangan" text`
		});
		await db.$client.execute({
			sql: `UPDATE "ketidakhadiran_harian" SET "keterangan" = 'sakit' WHERE "sakit" > 0`
		});
		await db.$client.execute({
			sql: `UPDATE "ketidakhadiran_harian" SET "keterangan" = 'izin' WHERE "keterangan" IS NULL AND "izin" > 0`
		});
		await db.$client.execute({
			sql: `UPDATE "ketidakhadiran_harian" SET "keterangan" = 'alfa' WHERE "keterangan" IS NULL AND "alfa" > 0`
		});
	}

	try {
		await db.$client.execute(
			`ALTER TABLE "ketidakhadiran_harian" ADD COLUMN "mata_pelajaran_id" integer REFERENCES "mata_pelajaran"("id") ON DELETE SET NULL`
		);
	} catch {
		// column already exists
	}

	// add keterangan_pulang column if not exists
	try {
		await db.$client.execute(
			`ALTER TABLE "ketidakhadiran_harian" ADD COLUMN "keterangan_pulang" text`
		);
	} catch {
		// column already exists
	}

	// Migrate unique index if needed
	try {
		await db.$client.execute(`DROP INDEX IF EXISTS "ketidakhadiran_murid_tanggal_idx"`);
	} catch {
		// may not exist
	}
	try {
		await db.$client.execute(
			`CREATE UNIQUE INDEX IF NOT EXISTS "ketidakhadiran_murid_tanggal_mapel_idx" ON "ketidakhadiran_harian" ("murid_id", "tanggal", "mata_pelajaran_id")`
		);
	} catch {
		// index may already exist
	}
}
