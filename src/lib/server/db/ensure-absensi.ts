import db from '$lib/server/db';
import { ensureSchema } from './ensure-helper';

export async function ensureAbsensiSchema() {
	await ensureSchema('absensi', [
		`CREATE TABLE IF NOT EXISTS "absensi" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "murid_id" integer NOT NULL,
      "waktu" text NOT NULL,
      "mata_pelajaran_id" integer,
      "created_at" text NOT NULL,
      "updated_at" text,
      CONSTRAINT "absensi_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
      CONSTRAINT "absensi_mata_pelajaran_id_mata_pelajaran_id_fk" FOREIGN KEY ("mata_pelajaran_id") REFERENCES "mata_pelajaran" ("id") ON UPDATE NO ACTION ON DELETE SET NULL
    )`,
		`CREATE INDEX IF NOT EXISTS "absensi_murid_waktu_idx" ON "absensi" ("murid_id", "waktu")`
	]);

	try {
		await db.$client.execute(
			`ALTER TABLE "absensi" ADD COLUMN "mata_pelajaran_id" integer REFERENCES "mata_pelajaran"("id") ON DELETE SET NULL`
		);
	} catch {
		// column already exists
	}
}
