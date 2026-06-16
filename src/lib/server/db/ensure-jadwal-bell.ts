import db from '$lib/server/db';
import { ensureSchema } from './ensure-helper';

export async function ensureJadwalBellSchema() {
	await ensureSchema('jadwal-bell', [
		`CREATE TABLE IF NOT EXISTS bell_settings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id),
			jam_pelajaran_menit INTEGER NOT NULL DEFAULT 35,
			durasi_istirahat INTEGER NOT NULL DEFAULT 30,
			durasi_upacara INTEGER NOT NULL DEFAULT 70,
			jam_mulai TEXT NOT NULL DEFAULT '07:00',
			is_active INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS bell_settings_sekolah_idx ON bell_settings(sekolah_id)`,
		`CREATE TABLE IF NOT EXISTS kegiatan_custom (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id),
			nama TEXT NOT NULL,
			kode TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS kegiatan_custom_sekolah_kode_idx ON kegiatan_custom(sekolah_id, kode)`,
		`CREATE TABLE IF NOT EXISTS bell_sounds (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id),
			tipe TEXT NOT NULL,
			file_name TEXT NOT NULL,
			file_data BLOB,
			mime_type TEXT NOT NULL DEFAULT 'audio/mpeg',
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS bell_sounds_sekolah_tipe_idx ON bell_sounds(sekolah_id, tipe)`,
		`CREATE TABLE IF NOT EXISTS jadwal_pelajaran (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id),
			hari TEXT NOT NULL,
			jam_ke INTEGER NOT NULL,
			kode_kegiatan TEXT NOT NULL,
			kelas_id INTEGER NOT NULL REFERENCES kelas(id),
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS jadwal_pelajaran_uniq_idx ON jadwal_pelajaran(sekolah_id, hari, jam_ke, kelas_id)`
	]);

	try {
		await db.$client.execute(`ALTER TABLE kegiatan_custom ADD COLUMN durasi INTEGER`);
	} catch {
		// column already exists
	}
}
