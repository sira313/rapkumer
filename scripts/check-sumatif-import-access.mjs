#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import ExcelJS from 'exceljs';

const dir = fs.mkdtempSync('/tmp/opencode/sumatif-access-');
process.env.DB_URL = `file:${path.join(dir, 'test.sqlite3')}`;
delete process.env.DB_AUTH_TOKEN;
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
let close;
try {
	const database = await server.ssrLoadModule('/src/lib/server/db/index.ts');
	close = database.closeDbClient;
	const db = database.default;
	const s = await server.ssrLoadModule('/src/lib/server/db/schema.ts');
	await (await server.ssrLoadModule('/src/lib/server/db/ensure-bootstrap.ts')).runStartupEnsures();
	const { POST } = await server.ssrLoadModule('/src/routes/api/asesmen-sumatif/import/+server.ts');
	const insert = async (table, values) => (await db.insert(table).values(values).returning())[0];
	const alamat = await insert(s.tableAlamat, {
		jalan: 'Jalan',
		desa: 'Desa',
		kecamatan: 'Kec',
		kabupaten: 'Kab'
	});
	const kepala = await insert(s.tablePegawai, { nama: 'Kepala', nip: '01' });
	const school = async (nama) =>
		insert(s.tableSekolah, {
			nama,
			npsn: nama,
			jenjangPendidikan: 'smp',
			email: 'a@example.com',
			alamatId: alamat.id,
			kepalaSekolahId: kepala.id
		});
	const a = await school('A');
	const b = await school('B');
	const kelas = async (sekolah, nama) => {
		const tahun = await insert(s.tableTahunAjaran, { sekolahId: sekolah.id, nama });
		const semester = await insert(s.tableSemester, {
			tahunAjaranId: tahun.id,
			tipe: 'ganjil',
			nama: 'Ganjil'
		});
		return insert(s.tableKelas, {
			sekolahId: sekolah.id,
			nama,
			fase: 'D',
			tahunAjaranId: tahun.id,
			semesterId: semester.id
		});
	};
	const own = await kelas(a, 'A1');
	const other = await kelas(a, 'A2');
	const foreign = await kelas(b, 'B1');
	const mapel = (kelas, nama) =>
		insert(s.tableMataPelajaran, { kelasId: kelas.id, nama, jenis: 'wajib' });
	const math = await mapel(own, 'Matematika');
	const science = await mapel(own, 'IPA');
	const otherMath = await mapel(other, 'Matematika');
	const foreignMath = await mapel(foreign, 'Matematika');
	const islam = await mapel(own, 'Pendidikan Agama Islam dan Budi Pekerti');
	await mapel(own, 'Pendidikan Agama Kristen dan Budi Pekerti');
	for (const [nama, agama] of [
		['Ani', 'Islam'],
		['Budi', 'Kristen']
	]) {
		await insert(s.tableMurid, {
			nama,
			agama,
			nis: nama,
			nisn: nama,
			sekolahId: a.id,
			kelasId: own.id,
			semesterId: own.semesterId,
			alamatId: alamat.id,
			tempatLahir: 'Kota',
			tanggalLahir: '2010-01-01',
			jenisKelamin: 'P',
			pendidikanSebelumnya: 'SD',
			tanggalMasuk: '2026-07-01'
		});
	}
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet('Nilai');
	sheet.getRow(3).values = ['Nama', 'Sumatif Tengah Semester', 'Sumatif Akhir Semester'];
	sheet.getRow(5).values = ['Ani', 80, 90];
	sheet.getRow(6).values = ['Budi', 70, 80];
	const bytes = await workbook.xlsx.writeBuffer();
	const permission = ['input_nilai_asesmen_sumatif'];
	const guru = { id: 999, type: 'user', permissions: permission, mataPelajaranId: math.id };
	await insert(s.tableAuthUser, {
		id: guru.id,
		username: 'guru-test',
		usernameNormalized: 'guru-test',
		passwordHash: 'test',
		passwordSalt: 'test',
		type: 'user',
		permissions: permission
	});
	await insert(s.tableAuthUserKelas, { authUserId: guru.id, kelasId: own.id });
	const wali = { id: 998, type: 'wali_kelas', permissions: permission, kelasId: own.id };
	const admin = { id: 997, type: 'admin', permissions: [] };
	const request = async (user, kelasId, mapelId, fileBytes = bytes) => {
		const form = new FormData();
		form.set('file', new File([fileBytes], 'nilai.xlsx'));
		form.set('kelas_id', String(kelasId));
		form.set('mapel_id', String(mapelId));
		return POST({
			locals: { sekolah: a, user },
			request: new Request('http://localhost/api/asesmen-sumatif/import', {
				method: 'POST',
				body: form
			})
		});
	};
	let failed = 0;
	const check = async (name, run) => {
		try {
			await run();
			console.log(`ok ${name}`);
		} catch (err) {
			failed++;
			console.error(`FAIL ${name}`, err);
		}
	};
	for (const [name, user, kelasId, mapelId, status] of [
		['anonymous', undefined, own.id, math.id, 401],
		['missing permission', { ...guru, permissions: [] }, own.id, math.id, 403],
		['unassigned subject', guru, own.id, science.id, 403],
		['wrong subject class', admin, own.id, otherMath.id, 400],
		['foreign school', admin, foreign.id, foreignMath.id, 403],
		['unassigned class', wali, other.id, otherMath.id, 403],
		['invalid selector', admin, own.id, 'invalid', 400]
	]) {
		await check(name, async () => {
			const before = await db.query.tableAsesmenSumatif.findMany();
			assert.equal((await request(user, kelasId, mapelId)).status, status);
			assert.deepEqual(await db.query.tableAsesmenSumatif.findMany(), before);
		});
	}
	await check('assigned subject imports both students', async () => {
		const response = await request(guru, own.id, math.id);
		assert.equal(response.status, 200);
		assert.equal((await response.json()).details.imported, 2);
	});
	await check('grouped religion skips unassigned variant', async () => {
		const response = await request({ ...guru, mataPelajaranId: islam.id }, own.id, 'agama');
		assert.equal(response.status, 200);
		const result = await response.json();
		assert.equal(result.details.imported, 1);
		assert.equal(result.details.skipped, 1);
	});
	await check('missing PKS never falls back to unrelated subject', async () => {
		const before = await db.query.tableAsesmenSumatif.findMany();
		const response = await request(admin, own.id, 'pks');
		assert.equal((await response.json()).details.imported, 0);
		assert.deepEqual(await db.query.tableAsesmenSumatif.findMany(), before);
	});
	for (const [label, value] of [
		['negative score', -1],
		['score above 100', 101],
		['invalid score text', 'abc']
	]) {
		await check(`${label} is rejected`, async () => {
			const invalid = new ExcelJS.Workbook();
			const invalidSheet = invalid.addWorksheet('Nilai');
			invalidSheet.getRow(3).values = ['Nama', 'Sumatif Tengah Semester', 'Sumatif Akhir Semester'];
			invalidSheet.getRow(5).values = ['Ani', value, 90];
			const invalidBytes = await invalid.xlsx.writeBuffer();
			const before = await db.query.tableAsesmenSumatif.findMany();
			const response = await request(admin, own.id, math.id, invalidBytes);
			assert.equal(response.status, 400);
			assert.deepEqual(await db.query.tableAsesmenSumatif.findMany(), before);
		});
	}
	console.log(`13 checks, ${failed} failures`);
	process.exitCode = failed ? 1 : 0;
} finally {
	await close?.();
	await server.close();
	fs.rmSync(dir, { recursive: true, force: true });
}
