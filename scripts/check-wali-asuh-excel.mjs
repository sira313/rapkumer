#!/usr/bin/env node
/**
 * Self-check round-trip kolom "Wali Asuh" pada file Excel Data Murid.
 *
 * Menguji kode aplikasi sebenarnya (bukan salinan):
 * - src/routes/api/murid/download-excel/+server.ts (unduhan Excel)
 * - src/lib/server/excel-murid-columns.ts (pemetaan kolom saat impor)
 *
 * DB dibuat di folder temp — data/database.sqlite3 asli tidak disentuh.
 *
 *   node scripts/check-wali-asuh-excel.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rapkumer-wali-asuh-'));
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
	const { resolveMuridExcelColumns, mergeWaliAsuh } = await server.ssrLoadModule(
		'/src/lib/server/excel-murid-columns.ts'
	);
	const { readBufferToAoA } = await server.ssrLoadModule('/src/lib/utils/excel.js');
	const { GET: downloadExcel } = await server.ssrLoadModule(
		'/src/routes/api/murid/download-excel/+server.ts'
	);

	await runStartupEnsures();

	// ---------- seed ----------
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
	const [kepala] = await db
		.insert(schema.tablePegawai)
		.values({ nama: 'Kepala Sekolah', nip: '0001', createdAt: now, updatedAt: now })
		.returning({ id: schema.tablePegawai.id });
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
	const [kelas] = await db
		.insert(schema.tableKelas)
		.values({
			sekolahId: sekolah.id,
			tahunAjaranId: tahunAjaran.id,
			semesterId: semester.id,
			nama: '7A',
			createdAt: now,
			updatedAt: now
		})
		.returning({ id: schema.tableKelas.id });
	const [wali] = await db
		.insert(schema.tableWaliMurid)
		.values({
			nama: 'Wali Murid',
			pekerjaan: 'Petani',
			kontak: '081200000001',
			createdAt: now,
			updatedAt: now
		})
		.returning({ id: schema.tableWaliMurid.id });

	const waliAsuhNama = 'Budi Santoso, S.Pd.';
	const waliAsuhNip = '198501012010011001';
	await db.insert(schema.tableMurid).values({
		sekolahId: sekolah.id,
		kelasId: kelas.id,
		semesterId: semester.id,
		nama: 'Ani Putri',
		nis: '22001',
		nisn: '0051234567',
		tempatLahir: 'Bandung',
		tanggalLahir: '2010-05-06',
		jenisKelamin: 'P',
		agama: 'Islam',
		pendidikanSebelumnya: 'SDN 1',
		tanggalMasuk: '2026-07-01',
		alamatId: alamat.id,
		waliId: wali.id,
		waliAsuhNama,
		waliAsuhNip,
		createdAt: now,
		updatedAt: now
	});

	// ---------- unduh Excel ----------
	const response = await downloadExcel({ locals: { sekolah: { id: sekolah.id } } });
	assert.ok(response instanceof Response, 'endpoint harus mengembalikan Response');
	const buffer = Buffer.from(await response.arrayBuffer());
	const rows = await readBufferToAoA(buffer);
	assert.ok(rows.length >= 2, 'file harus punya header + minimal 1 murid');

	const header = rows[0];
	const dataRow = rows[1];

	checks.push({
		name: 'unduhan Excel memuat kolom "Wali Asuh" dan "NIP Wali Asuh"',
		fn: () => {
			assert.ok(header.includes('Wali Asuh'), 'kolom "Wali Asuh" harus ada');
			assert.ok(header.includes('NIP Wali Asuh'), 'kolom "NIP Wali Asuh" harus ada');
		}
	});

	checks.push({
		name: 'nilai wali asuh ikut terisi di file unduhan',
		fn: () => {
			assert.equal(dataRow[header.indexOf('Wali Asuh')], waliAsuhNama);
			assert.equal(dataRow[header.indexOf('NIP Wali Asuh')], waliAsuhNip);
		}
	});

	checks.push({
		name: 'kolom wali asuh tidak menimpa kolom wali murid',
		fn: () => {
			const cols = resolveMuridExcelColumns(header);
			assert.equal(cols.idxNama, header.indexOf('Nama'));
			assert.equal(cols.idxNipd, header.indexOf('NIPD'));
			assert.equal(cols.idxRombel, header.indexOf('Rombel'));
			assert.equal(cols.idxWaliNama, header.indexOf('Nama Wali'));
			assert.equal(cols.idxWaliAsuhNama, header.indexOf('Wali Asuh'));
			assert.equal(cols.idxWaliAsuhNip, header.indexOf('NIP Wali Asuh'));
		}
	});

	checks.push({
		name: 'file tanpa kolom wali asuh tidak salah tangkap kolom lain',
		fn: () => {
			const cols = resolveMuridExcelColumns([
				'Nama',
				'NIPD',
				'Rombel',
				'Nama Ayah',
				'Nama Ibu',
				'Nama Wali',
				'Kontak Wali'
			]);
			assert.equal(cols.idxWaliAsuhNama, undefined, '"Nama Wali" bukan wali asuh');
			assert.equal(cols.idxWaliAsuhNip, undefined, '"NIPD" bukan NIP wali asuh');
			assert.equal(cols.idxWaliNama, 5);
		}
	});

	checks.push({
		name: 'format dapodik ("Nama Wali Asuh" + "NIP") tetap terbaca',
		fn: () => {
			const cols = resolveMuridExcelColumns(['Nama', 'NIPD', 'Rombel', 'Nama Wali Asuh', 'NIP']);
			assert.equal(cols.idxWaliAsuhNama, 3);
			assert.equal(cols.idxWaliAsuhNip, 4);
		}
	});

	checks.push({
		name: 'impor tidak menghapus data wali asuh lama saat file kosong',
		fn: () => {
			assert.equal(mergeWaliAsuh('Budi', 'Lama'), 'Budi', 'nilai dari file menang');
			assert.equal(mergeWaliAsuh('', 'Lama'), 'Lama', 'sel kosong tidak menghapus data lama');
			assert.equal(mergeWaliAsuh(null, 'Lama'), 'Lama');
			assert.equal(mergeWaliAsuh('', null), null);
			assert.equal(mergeWaliAsuh(undefined, undefined), null);
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
			? `\n[check-wali-asuh-excel] Semua ${checks.length} pemeriksaan lulus.`
			: `\n[check-wali-asuh-excel] ${failed}/${checks.length} pemeriksaan gagal.`
	);
	process.exitCode = failed === 0 ? 0 : 1;
} catch (err) {
	console.error('[check-wali-asuh-excel] Error:', err);
	process.exitCode = 1;
} finally {
	try {
		await server.close();
	} catch {
		// ignore
	}
	fs.rmSync(tmpDir, { recursive: true, force: true });
}
