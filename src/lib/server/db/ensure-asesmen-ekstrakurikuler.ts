import { ensureSchema } from './ensure-helper';

export async function ensureAsesmenEkstrakurikulerSchema() {
	await ensureSchema('asesmen_ekstrakurikuler', [
		`CREATE TABLE IF NOT EXISTS "asesmen_ekstrakurikuler" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"murid_id" integer NOT NULL,
			"ekstrakurikuler_id" integer NOT NULL,
			"tujuan_id" integer NOT NULL,
			"kategori" text NOT NULL,
			"dinilai_pada" text,
			"created_at" text NOT NULL,
			"updated_at" text,
			CONSTRAINT "asesmen_ekstrakurikuler_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
			CONSTRAINT "asesmen_ekstrakurikuler_ekstrakurikuler_id_ekstrakurikuler_id_fk" FOREIGN KEY ("ekstrakurikuler_id") REFERENCES "ekstrakurikuler" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
			CONSTRAINT "asesmen_ekstrakurikuler_tujuan_id_ekstrakurikuler_tujuan_id_fk" FOREIGN KEY ("tujuan_id") REFERENCES "ekstrakurikuler_tujuan" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "asesmen_ekstrakurikuler_unique" ON "asesmen_ekstrakurikuler" ("murid_id", "ekstrakurikuler_id", "tujuan_id")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_ekstrakurikuler_murid_idx" ON "asesmen_ekstrakurikuler" ("murid_id")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_ekstrakurikuler_ekstrak_idx" ON "asesmen_ekstrakurikuler" ("ekstrakurikuler_id")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_ekstrakurikuler_tujuan_idx" ON "asesmen_ekstrakurikuler" ("tujuan_id")`
	]);
}
