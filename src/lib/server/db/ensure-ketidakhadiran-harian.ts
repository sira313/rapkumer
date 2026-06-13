import { ensureSchema } from './ensure-helper';

export async function ensureKetidakhadiranHarianSchema() {
	await ensureSchema('ketidakhadiran_harian', [
		`CREATE TABLE IF NOT EXISTS "ketidakhadiran_harian" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "murid_id" integer NOT NULL,
      "tanggal" text NOT NULL,
      "sakit" integer NOT NULL DEFAULT 0,
      "izin" integer NOT NULL DEFAULT 0,
      "alfa" integer NOT NULL DEFAULT 0,
      "created_at" text NOT NULL,
      "updated_at" text,
      CONSTRAINT "ketidakhadiran_harian_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
    )`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "ketidakhadiran_murid_tanggal_idx" ON "ketidakhadiran_harian" ("murid_id", "tanggal")`
	]);
}
