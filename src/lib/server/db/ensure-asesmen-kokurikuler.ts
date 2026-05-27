import { ensureSchema } from './ensure-helper';

export async function ensureAsesmenKokurikulerSchema() {
	await ensureSchema('asesmen_kokurikuler', [
		`CREATE TABLE IF NOT EXISTS "asesmen_kokurikuler" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"murid_id" integer NOT NULL,
			"kokurikuler_id" integer NOT NULL,
			"dimensi" text NOT NULL,
			"kategori" text NOT NULL,
			"dinilai_pada" text,
			"created_at" text NOT NULL,
			"updated_at" text,
			CONSTRAINT "asesmen_kokurikuler_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
			CONSTRAINT "asesmen_kokurikuler_kokurikuler_id_kokurikuler_id_fk" FOREIGN KEY ("kokurikuler_id") REFERENCES "kokurikuler" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "asesmen_kokurikuler_unique" ON "asesmen_kokurikuler" ("murid_id", "kokurikuler_id", "dimensi")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_kokurikuler_murid_idx" ON "asesmen_kokurikuler" ("murid_id")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_kokurikuler_kokurikuler_idx" ON "asesmen_kokurikuler" ("kokurikuler_id")`
	]);
}
