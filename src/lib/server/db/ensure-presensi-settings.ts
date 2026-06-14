import db from '$lib/server/db';
import { ensureSchema } from './ensure-helper';

export async function ensurePresensiSettingsSchema() {
	await ensureSchema('presensi_settings', [
		`CREATE TABLE IF NOT EXISTS "presensi_settings" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "sekolah_id" integer NOT NULL,
      "jam_masuk" text NOT NULL DEFAULT '07:30',
      "jam_pulang" text NOT NULL DEFAULT '15:00',
      "hari_sekolah" integer NOT NULL DEFAULT 6,
      "tipe_presensi" text NOT NULL DEFAULT 'masuk_pulang',
      "libur_nasional" text NOT NULL DEFAULT '[]',
      "libur_semester" text NOT NULL DEFAULT '[]',
      "created_at" text NOT NULL,
      "updated_at" text,
      CONSTRAINT "presensi_settings_sekolah_id_sekolah_id_fk" FOREIGN KEY ("sekolah_id") REFERENCES "sekolah" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
    )`
	]);
	for (const col of ['libur_nasional', 'libur_semester']) {
		try {
			await db.$client.execute(
				`ALTER TABLE "presensi_settings" ADD COLUMN "${col}" text NOT NULL DEFAULT '[]'`
			);
		} catch {
			// column already exists
		}
	}
}
