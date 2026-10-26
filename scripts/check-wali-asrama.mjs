#!/usr/bin/env node
/**
 * Self-check alur "wali asrama".
 *
 * Menjalankan kode aplikasi yang sebenarnya (bukan salinan) lewat Vite SSR
 * module loading, jadi yang diuji adalah implementasi di
 * src/routes/pengguna/consolidation.server.ts + src/lib/server/kelas-akses.ts.
 *
 * DB dibuat di folder temp — data/database.sqlite3 asli tidak disentuh.
 *
 *   node scripts/check-wali-asrama.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rapkumer-wali-asrama-'));
const dbPath = path.join(tmpDir, 'check.sqlite3');

// WAJIB diset sebelum modul db di-import (db/index.ts membaca process.env.DB_URL).
process.env.DB_URL = `file:${dbPath}`;

const { createServer } = await import('vite');

const server = await createServer({
	root: projectRoot,
	configFile: path.join(projectRoot, 'vite.config.ts'),
	server: { middlewareMode: true },
	appType: 'custom',
	logLevel: 'error'
});

const now = new Date().toISOString();
const checks = [];

try {
	const { runStartupEnsures } = await server.ssrLoadModule(
		'/src/lib/server/db/ensure-bootstrap.ts'
	);
	const { default: db } = await server.ssrLoadModule('/src/lib/server/db/index.ts');
	const schema = await server.ssrLoadModule('/src/lib/server/db/schema.ts');
	const { ensureWaliAsramaAccount } = await server.ssrLoadModule(
		'/src/routes/pengguna/consolidation.server.ts'
	);
	const { canAccessKelas, isWaliAsramaOfKelas } = await server.ssrLoadModule(
		'/src/lib/server/kelas-akses.ts'
	);
	const { defaultPermissionsByType, resolveRoutePermission, menuRoutePermissions } =
		await server.ssrLoadModule('/src/routes/pengguna/permissions.ts');

	await runStartupEnsures();

	// ---------- seed ----------
	const [kepala] = await db
		.insert(schema.tablePegawai)
		.values({ nama: 'Kepala Sekolah', nip: '0001', createdAt: now, updatedAt: now })
		.returning({ id: schema.tablePegawai.id });
	const [waliAsrama] = await db
		.insert(schema.tablePegawai)
		.values({ nama: 'Budi Santoso, S.Pd.', nip: '0002', createdAt: now, updatedAt: now })
		.returning({ id: schema.tablePegawai.id });
	const [waliKelas] = await db
		.insert(schema.tablePegawai)
		.values({ nama: 'Siti Aminah', nip: '0003', createdAt: now, updatedAt: now })
		.returning({ id: schema.tablePegawai.id });
	const [tanpaKelas] = await db
		.insert(schema.tablePegawai)
		.values({ nama: 'Tanpa Kelas', nip: '0009', createdAt: now, updatedAt: now })
		.returning({ id: schema.tablePegawai.id });
	const [alamat] = await db
		.insert(schema.tableAlamat)
		.values({
			jalan: 'Jl. Test',
			desa: 'Desa',
			kecamatan: 'Kec',
			kabupaten: 'Kab',
			createdAt: now,
			updatedAt: now
		})
		.returning({ id: schema.tableAlamat.id });
	const [sekolah] = await db
		.insert(schema.tableSekolah)
		.values({
			jenjangPendidikan: 'smp',
			nama: 'SMP Test',
			npsn: '000001',
			alamatId: alamat.id,
			email: 'smp@test.sch.id',
			kepalaSekolahId: kepala.id,
			createdAt: now,
			updatedAt: now
		})
		.returning({ id: schema.tableSekolah.id });
	const [tahunAjaran] = await db
		.insert(schema.tableTahunAjaran)
		.values({ sekolahId: sekolah.id, nama: '2026/2027', createdAt: now, updatedAt: now })
		.returning({ id: schema.tableTahunAjaran.id });
	const [semester] = await db
		.insert(schema.tableSemester)
		.values({
			tahunAjaranId: tahunAjaran.id,
			tipe: 'ganjil',
			nama: 'Ganjil',
			createdAt: now,
			updatedAt: now
		})
		.returning({ id: schema.tableSemester.id });

	const insertKelas = async (nama, extra = {}) => {
		const [row] = await db
			.insert(schema.tableKelas)
			.values({
				sekolahId: sekolah.id,
				tahunAjaranId: tahunAjaran.id,
				semesterId: semester.id,
				nama,
				createdAt: now,
				updatedAt: now,
				...extra
			})
			.returning({ id: schema.tableKelas.id });
		return row.id;
	};

	const kelas1 = await insertKelas('7A', { waliAsramaId: waliAsrama.id });
	const kelas2 = await insertKelas('7B', { waliAsramaId: waliAsrama.id });
	const kelasLain = await insertKelas('8A', { waliKelasId: waliKelas.id });

	const defaults = defaultPermissionsByType.wali_asrama ?? [];

	// auth_user untuk pegawai tertentu (tabel kecil, filter di JS).
	const accountsFor = async (pegawaiId) =>
		(await db.query.tableAuthUser.findMany({ columns: { id: true, pegawaiId: true } }))
			.filter((r) => r.pegawaiId === pegawaiId)
			.map((r) => r.id);

	const authUserById = async (id) => {
		const rows = await db.query.tableAuthUser.findMany();
		return rows.find((r) => r.id === id);
	};

	// ---------- 1. akun dibuat otomatis saat wali asrama ditugaskan ----------
	checks.push({
		name: 'akun wali_asrama dibuat otomatis oleh ensureWaliAsramaAccount',
		fn: async () => {
			await ensureWaliAsramaAccount(waliAsrama.id);

			const ids = await accountsFor(waliAsrama.id);
			assert.equal(ids.length, 1, 'harus tepat 1 akun untuk wali asrama');

			const user = await authUserById(ids[0]);
			assert.equal(user.type, 'wali_asrama');
			assert.equal(user.pegawaiId, waliAsrama.id);
			assert.equal(user.usernameNormalized, 'budisantoso');
			assert.equal(user.kelasId, kelas1, 'kelas utama = kelas yang diampu');
			assert.equal(user.mustChangePassword, true, 'sandi acak → wajib ganti saat login');
			assert.ok(user.passwordHash.length > 0, 'password harus di-hash');
			assert.deepEqual(
				[...(user.permissions ?? [])].sort(),
				[...defaults].sort(),
				'permission default wali_asrama'
			);
		}
	});

	// ---------- 2. idempoten: tidak membuat akun ganda ----------
	checks.push({
		name: 'pemanggilan kedua tidak membuat akun ganda',
		fn: async () => {
			await ensureWaliAsramaAccount(waliAsrama.id);
			const ids = await accountsFor(waliAsrama.id);
			assert.equal(ids.length, 1);
		}
	});

	// ---------- 3. kelas utama tetap valid + kelas_pindah tersedia ----------
	checks.push({
		name: 'kelas utama tetap menunjuk kelas yang diampu + ada izin kelas_pindah',
		fn: async () => {
			await ensureWaliAsramaAccount(waliAsrama.id);
			const [id] = await accountsFor(waliAsrama.id);
			const row = await authUserById(id);
			assert.ok(
				row.kelasId === kelas1 || row.kelasId === kelas2,
				'kelas utama harus salah satu kelas yang diampu'
			);
			assert.ok(
				(row.permissions ?? []).includes('kelas_pindah'),
				'wali asrama perlu izin kelas_pindah untuk pindah kelas via navbar'
			);
		}
	});

	// ---------- 4. permission default yang baru ditambahkan ikut ter-merge ----------
	checks.push({
		name: 'permission default yang hilang pada akun lama dipulihkan',
		fn: async () => {
			const [id] = await accountsFor(waliAsrama.id);
			const row = await authUserById(id);
			// simulates an old account created before `administrasi_dinas_luar` existed
			await db
				.update(schema.tableAuthUser)
				.set({
					permissions: (row.permissions ?? []).filter((p) => p !== 'administrasi_dinas_luar')
				})
				.where(eq(schema.tableAuthUser.id, id));

			await ensureWaliAsramaAccount(waliAsrama.id);

			const updated = await authUserById(id);
			assert.ok(
				(updated.permissions ?? []).includes('administrasi_dinas_luar'),
				'permission default yang baru harus ditambahkan ke akun lama'
			);
			assert.ok(
				(updated.permissions ?? []).includes('kelas_pindah'),
				'penyesuaian manual tidak boleh hilang'
			);
		}
	});

	// ---------- 5. wali asrama tanpa kelas → tidak ada akun ----------
	checks.push({
		name: 'wali asrama tanpa kelas yang diampu tidak membuat akun',
		fn: async () => {
			await ensureWaliAsramaAccount(tanpaKelas.id);
			const ids = await accountsFor(tanpaKelas.id);
			assert.equal(ids.length, 0);
		}
	});

	// ---------- 6. akses kelas ----------
	checks.push({
		name: 'wali_asrama hanya bisa akses kelas yang diampu',
		fn: async () => {
			const [id] = await accountsFor(waliAsrama.id);
			const row = await authUserById(id);
			const localsUser = {
				...row,
				sekolahId: sekolah.id,
				username: row.username,
				mataPelajaranId: null
			};

			assert.equal(await canAccessKelas(localsUser, sekolah.id, kelas1), true);
			assert.equal(await canAccessKelas(localsUser, sekolah.id, kelas2), true);
			assert.equal(
				await canAccessKelas(localsUser, sekolah.id, kelasLain),
				false,
				'kelas yang bukan diampu → ditolak'
			);
			assert.equal(await isWaliAsramaOfKelas(localsUser, kelasLain), false);
		}
	});

	// ---------- 7. kelas tambahan dari admin (auth_user_kelas) ----------
	checks.push({
		name: 'kelas tambahan yang di-assign admin bisa diakses',
		fn: async () => {
			const [id] = await accountsFor(waliAsrama.id);
			const row = await authUserById(id);
			const localsUser = {
				...row,
				sekolahId: sekolah.id,
				mataPelajaranId: null
			};

			await db.insert(schema.tableAuthUserKelas).values({
				authUserId: id,
				kelasId: kelasLain,
				createdAt: now
			});
			assert.equal(await canAccessKelas(localsUser, sekolah.id, kelasLain), true);
		}
	});

	// ---------- 8. gate menu: keasramaan, asesmen keasramaan, rekap keasramaan, dinas luar, cetak ----------
	checks.push({
		name: 'permission default wali_asrama hanya membuka 5 menu',
		fn: async () => {
			const allowed = menuRoutePermissions
				.filter((r) => defaults.includes(r.permission))
				.map((r) => r.path);
			assert.deepEqual(allowed.sort(), [
				'/asesmen-keasramaan',
				'/cetak',
				'/dinas-luar',
				'/keasramaan',
				'/rekap-keasramaan'
			]);

			for (const closed of ['/kelas', '/murid', '/presensi-murid', '/sekolah', '/akademik']) {
				const permission = resolveRoutePermission(closed);
				assert.ok(permission, `${closed} harus punya permission`);
				assert.equal(
					defaults.includes(permission),
					false,
					`${closed} (${permission}) tidak boleh terbuka untuk wali asrama`
				);
			}
			for (const open of [
				'/keasramaan',
				'/asesmen-keasramaan',
				'/rekap-keasramaan',
				'/cetak',
				'/dinas-luar'
			]) {
				const permission = resolveRoutePermission(open);
				assert.ok(permission);
				assert.equal(defaults.includes(permission), true, `${open} harus terbuka`);
			}
		}
	});

	// ---------- jalankan ----------
	let failed = 0;
	for (const c of checks) {
		try {
			await c.fn();
			console.info(`  ok   ${c.name}`);
		} catch (err) {
			failed += 1;
			console.error(`  FAIL ${c.name}`);
			console.error(`       ${err?.message ?? err}`);
		}
	}

	console.info(
		failed === 0
			? `\n[check-wali-asrama] Semua ${checks.length} pemeriksaan lulus.`
			: `\n[check-wali-asrama] ${failed}/${checks.length} pemeriksaan gagal.`
	);
	process.exitCode = failed === 0 ? 0 : 1;
} catch (err) {
	console.error('[check-wali-asrama] Error:', err);
	process.exitCode = 1;
} finally {
	await (await server.ssrLoadModule('/src/lib/server/db/index.ts')).closeDbClient();
	try {
		await server.close();
	} catch {
		// ignore
	}
	fs.rmSync(tmpDir, { recursive: true, force: true });
}
