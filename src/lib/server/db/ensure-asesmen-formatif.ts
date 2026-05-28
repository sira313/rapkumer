import { ensureSchema } from './ensure-helper';

export async function ensureAsesmenFormatifSchema() {
	await ensureSchema('asesmen_formatif', [
		`CREATE TABLE IF NOT EXISTS "asesmen_formatif" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"murid_id" integer NOT NULL,
			"mata_pelajaran_id" integer NOT NULL,
			"tujuan_pembelajaran_id" integer NOT NULL,
			"tuntas" integer NOT NULL DEFAULT 0,
			"catatan" text,
			"dinilai_pada" text,
			"created_at" text NOT NULL,
			"updated_at" text,
			CONSTRAINT "asesmen_formatif_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
			CONSTRAINT "asesmen_formatif_mata_pelajaran_id_mata_pelajaran_id_fk" FOREIGN KEY ("mata_pelajaran_id") REFERENCES "mata_pelajaran" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
			CONSTRAINT "asesmen_formatif_tujuan_pembelajaran_id_tujuan_pembelajaran_id_fk" FOREIGN KEY ("tujuan_pembelajaran_id") REFERENCES "tujuan_pembelajaran" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "asesmen_formatif_murid_tujuan_unique" ON "asesmen_formatif" ("murid_id", "tujuan_pembelajaran_id")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_formatif_murid_idx" ON "asesmen_formatif" ("murid_id")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_formatif_mapel_idx" ON "asesmen_formatif" ("mata_pelajaran_id")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_formatif_tujuan_idx" ON "asesmen_formatif" ("tujuan_pembelajaran_id")`
	]);
}
