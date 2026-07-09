import { ensureSchema } from './ensure-helper';

export async function ensureKetidakhadiranRaporSchema() {
	await ensureSchema('ketidakhadiran_rapor', [
		`CREATE TABLE IF NOT EXISTS "ketidakhadiran_rapor" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "murid_id" integer NOT NULL,
      "semester_id" integer NOT NULL,
      "sakit" integer,
      "izin" integer,
      "alfa" integer,
      "created_at" text NOT NULL,
      "updated_at" text,
      CONSTRAINT "ketidakhadiran_rapor_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
      CONSTRAINT "ketidakhadiran_rapor_semester_id_semester_id_fk" FOREIGN KEY ("semester_id") REFERENCES "semester" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
    )`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "ketidakhadiran_rapor_murid_semester_idx" ON "ketidakhadiran_rapor" ("murid_id", "semester_id")`
	]);
}
