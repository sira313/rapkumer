import db from '$lib/server/db';
import { ensureSchema } from './ensure-helper';

export async function ensureKetidakhadiranHarianSchema() {
	await ensureSchema('ketidakhadiran_harian', [
		`CREATE TABLE IF NOT EXISTS "ketidakhadiran_harian" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "murid_id" integer NOT NULL,
      "tanggal" text NOT NULL,
      "keterangan" text,
      "created_at" text NOT NULL,
      "updated_at" text,
      CONSTRAINT "ketidakhadiran_harian_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
    )`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "ketidakhadiran_murid_tanggal_idx" ON "ketidakhadiran_harian" ("murid_id", "tanggal")`
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
}
