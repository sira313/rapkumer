import { ensureSchema } from './ensure-helper';

export async function ensureAsesmenSumatifSchema() {
	await ensureSchema('asesmen_sumatif', [
		`CREATE TABLE IF NOT EXISTS "asesmen_sumatif" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"murid_id" integer NOT NULL,
			"mata_pelajaran_id" integer NOT NULL,
			"na_lingkup" real,
			"sas_tes" real,
			"sas_non_tes" real,
			"sas" real,
			"nilai_akhir" real,
			"created_at" text NOT NULL,
			"updated_at" text,
			CONSTRAINT "asesmen_sumatif_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
			CONSTRAINT "asesmen_sumatif_mata_pelajaran_id_mata_pelajaran_id_fk" FOREIGN KEY ("mata_pelajaran_id") REFERENCES "mata_pelajaran" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS "asesmen_sumatif_tujuan" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"murid_id" integer NOT NULL,
			"mata_pelajaran_id" integer NOT NULL,
			"tujuan_pembelajaran_id" integer NOT NULL,
			"nilai" real,
			"created_at" text NOT NULL,
			"updated_at" text,
			CONSTRAINT "asesmen_sumatif_tujuan_murid_id_murid_id_fk" FOREIGN KEY ("murid_id") REFERENCES "murid" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
			CONSTRAINT "asesmen_sumatif_tujuan_mata_pelajaran_id_mata_pelajaran_id_fk" FOREIGN KEY ("mata_pelajaran_id") REFERENCES "mata_pelajaran" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
			CONSTRAINT "asesmen_sumatif_tujuan_tujuan_pembelajaran_id_tujuan_pembelajaran_id_fk" FOREIGN KEY ("tujuan_pembelajaran_id") REFERENCES "tujuan_pembelajaran" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "asesmen_sumatif_unique" ON "asesmen_sumatif" ("murid_id", "mata_pelajaran_id")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_sumatif_murid_idx" ON "asesmen_sumatif" ("murid_id")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_sumatif_mapel_idx" ON "asesmen_sumatif" ("mata_pelajaran_id")`,
		`CREATE UNIQUE INDEX IF NOT EXISTS "asesmen_sumatif_tujuan_unique" ON "asesmen_sumatif_tujuan" ("murid_id", "tujuan_pembelajaran_id")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_sumatif_tujuan_murid_idx" ON "asesmen_sumatif_tujuan" ("murid_id")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_sumatif_tujuan_mapel_idx" ON "asesmen_sumatif_tujuan" ("mata_pelajaran_id")`,
		`CREATE INDEX IF NOT EXISTS "asesmen_sumatif_tujuan_tp_idx" ON "asesmen_sumatif_tujuan" ("tujuan_pembelajaran_id")`
	]);
}
