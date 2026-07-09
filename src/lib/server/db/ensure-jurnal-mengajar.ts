import { ensureSchema } from './ensure-helper';

export async function ensureJurnalMengajarSchema() {
	await ensureSchema('jurnal_mengajar', [
		`CREATE TABLE IF NOT EXISTS "jurnal_mengajar" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"auth_user_id" integer NOT NULL,
			"kelas_id" integer NOT NULL,
			"mata_pelajaran_id" integer NOT NULL,
			"tanggal" text NOT NULL,
			"jam_pelajaran" text NOT NULL,
			"lingkup_materi" text NOT NULL,
			"tujuan_pembelajaran_id" integer,
			"catatan" text,
			"created_at" text NOT NULL,
			"updated_at" text,
			CONSTRAINT "jurnal_mengajar_auth_user_id_auth_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "auth_user" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
			CONSTRAINT "jurnal_mengajar_kelas_id_kelas_id_fk" FOREIGN KEY ("kelas_id") REFERENCES "kelas" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
			CONSTRAINT "jurnal_mengajar_mata_pelajaran_id_mata_pelajaran_id_fk" FOREIGN KEY ("mata_pelajaran_id") REFERENCES "mata_pelajaran" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
			CONSTRAINT "jurnal_mengajar_tujuan_pembelajaran_id_tujuan_pembelajaran_id_fk" FOREIGN KEY ("tujuan_pembelajaran_id") REFERENCES "tujuan_pembelajaran" ("id") ON UPDATE NO ACTION ON DELETE SET NULL
		)`,
		`CREATE INDEX IF NOT EXISTS "jurnal_mengajar_auth_user_idx" ON "jurnal_mengajar" ("auth_user_id")`
	]);
}
