import { eq } from 'drizzle-orm';
import {
	defaultPermissionsByType,
	removedLegacyPermissionKeys
} from '../../../routes/pengguna/permissions';
import db from './index.js';
import { tableAppMeta, tableAuthUser } from './schema';

const MIGRATION_KEY = 'permission_model_version';
const MIGRATION_VALUE = 'menu-based-v5';

/**
 * One-time migration dari model permission lama (sekolah_manage/rapor_manage/kelas_manage)
 * ke model baru berbasis menu. Untuk setiap akun non-admin:
 *   - hapus key permission lama yang tidak valid
 *   - pertahankan key yang masih valid (user_*, dashboard_manage, app_check_update, server_stop, kelas_pindah)
 *   - tambahkan default permission sesuai tipe akun
 *
 * v2: default `wali_asuh` dibatasi hanya ke keasramaan/asesmen-keasramaan/cetak-dokumen/kelas_pindah.
 * v3: default `wali_kelas` juga dibatasi (16 menu, tanpa sekolah/akademik/kelas/buku-tamu).
 *     Untuk wali_kelas & wali_asuh, permission di-**replace** dengan set default (bukan di-merge)
 *     agar akses menu bawaan lama otomatis dicabut.
 * v4: tambah `administrasi_dinas_luar` ke default wali_kelas/wali_asuh/user untuk fitur /dinas-luar.
 * v5: tambah `administrasi_rpm` ke default wali_kelas/user untuk fitur /rpm.
 *
 * Idempotent: ditandai di tabel `app_meta` sehingga hanya berjalan sekali per versi.
 */
export async function ensurePermissionMigration() {
	try {
		const marker = await db.query.tableAppMeta.findFirst({
			where: eq(tableAppMeta.key, MIGRATION_KEY)
		});
		if (marker?.value === MIGRATION_VALUE) return;

		const users = await db.query.tableAuthUser.findMany({
			columns: { id: true, type: true, permissions: true }
		});

		let changed = 0;
		const timestamp = new Date().toISOString();
		for (const u of users) {
			if (u.type === 'admin') continue;

			const defaults = defaultPermissionsByType[u.type] ?? [];
			const existing = Array.isArray(u.permissions) ? u.permissions : [];
			const validExisting = existing.filter((p) => !removedLegacyPermissionKeys.has(p));

			// wali_kelas & wali_asuh: terapkan set default secara ketat
			// (hapus akses menu yang tidak lagi bawaan).
			// user/guru mapel: merge agar penyesuaian manual tetap dipertahankan.
			//
			// `kelas_pindah` dipertahankan untuk wali_kelas karena di-auto-assign
			// saat wali menangani >1 kelas di /pengguna (bukan bagian dari default menu).
			const strictTypes = new Set(['wali_kelas', 'wali_asuh']);
			let merged: UserPermission[];
			if (strictTypes.has(u.type)) {
				merged = existing.includes('kelas_pindah')
					? [...defaults, 'kelas_pindah' as const]
					: [...defaults];
			} else {
				merged = Array.from(new Set([...defaults, ...validExisting]));
			}

			const differs = merged.length !== existing.length || merged.some((p, i) => p !== existing[i]);
			if (differs) {
				await db
					.update(tableAuthUser)
					.set({ permissions: merged, updatedAt: timestamp })
					.where(eq(tableAuthUser.id, u.id));
				changed += 1;
			}
		}

		await db
			.insert(tableAppMeta)
			.values({
				key: MIGRATION_KEY,
				value: MIGRATION_VALUE,
				createdAt: timestamp,
				updatedAt: timestamp
			})
			.onConflictDoUpdate({ target: tableAppMeta.key, set: { value: MIGRATION_VALUE } });

		if (changed > 0) {
			console.info(`[permission-migration] Updated permissions for ${changed} user(s)`);
		}
	} catch (err) {
		console.warn('[permission-migration] Migration failed (skipped):', err);
	}
}
