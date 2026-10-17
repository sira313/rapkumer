import db from '$lib/server/db';
import { ensureSchema } from './ensure-helper';

const TABLE = 'buku_tamu_settings';

export async function ensureBukuTamuSettingsSchema() {
	await ensureSchema(TABLE, [
		`CREATE TABLE IF NOT EXISTS "${TABLE}" (
			"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			"sekolah_id" integer NOT NULL,
			"passkey" text,
			"passkey_hash" text,
			"passkey_salt" text,
			"unlock_token" text,
			"created_at" text NOT NULL,
			"updated_at" text,
			FOREIGN KEY ("sekolah_id") REFERENCES "sekolah" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
			CONSTRAINT "buku_tamu_settings_sekolah_id_unique" UNIQUE("sekolah_id")
		)`
	]);

	// Existing installs predate the plain `passkey` column; add it if missing.
	const columns = await db.$client.execute(
		`SELECT name FROM pragma_table_info('${TABLE}') WHERE name = 'passkey'`
	);
	if (!columns.rows.length) {
		await db.$client.execute(`ALTER TABLE "${TABLE}" ADD COLUMN "passkey" text`);
	}
}
