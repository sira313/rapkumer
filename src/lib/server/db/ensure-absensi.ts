import { ensureSchema } from './ensure-helper';

export async function ensureAbsensiSchema() {
	await ensureSchema('absensi', [
		`CREATE TABLE IF NOT EXISTS "absensi" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "murid_id" integer NOT NULL,
      "waktu" text NOT NULL,
      "created_at" text NOT NULL,
      "updated_at" text,
      CONSTRAINT "absensi_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
    )`,
		`CREATE INDEX IF NOT EXISTS "absensi_murid_waktu_idx" ON "absensi" ("murid_id", "waktu")`
	]);
}
