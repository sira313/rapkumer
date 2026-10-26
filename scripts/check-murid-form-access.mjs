#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rapkumer-murid-access-'));
process.env.DB_URL = `file:${path.join(dir, 'check.sqlite3')}`;
delete process.env.DB_AUTH_TOKEN;
const server = await createServer({
	root,
	server: { middlewareMode: true },
	appType: 'custom'
});
let closeDbClient;
try {
	const database = await server.ssrLoadModule('/src/lib/server/db/index.ts');
	closeDbClient = database.closeDbClient;
	const db = database.default;
	const s = await server.ssrLoadModule('/src/lib/server/db/schema.ts');
	const { runStartupEnsures } = await server.ssrLoadModule(
		'/src/lib/server/db/ensure-bootstrap.ts'
	);
	await runStartupEnsures();
	const route = await server.ssrLoadModule(
		'/src/routes/(informasi-umum)/murid/form/[[id]]/+page.server.ts'
	);
	const insert = async (table, values) => (await db.insert(table).values(values).returning())[0];
	const alamat = () =>
		insert(s.tableAlamat, { jalan: 'Jalan Uji', desa: 'Desa', kecamatan: 'Kec', kabupaten: 'Kab' });
	const kepala = await insert(s.tablePegawai, { nama: 'Kepala', nip: '001' });
	const school = async (nama) =>
		insert(s.tableSekolah, {
			nama,
			alamatId: (await alamat()).id,
			jenjangPendidikan: 'smp',
			npsn: nama,
			email: 'test@example.com',
			kepalaSekolahId: kepala.id
		});
	const a = await school('Sekolah A');
	const b = await school('Sekolah B');
	const kelas = async (nama, sekolahId) => {
		const tahun = await insert(s.tableTahunAjaran, { sekolahId, nama });
		const semester = await insert(s.tableSemester, {
			tahunAjaranId: tahun.id,
			tipe: 'ganjil',
			nama: 'Ganjil'
		});
		return insert(s.tableKelas, {
			nama,
			sekolahId,
			fase: 'A',
			tahunAjaranId: tahun.id,
			semesterId: semester.id
		});
	};
	const own = await kelas('A1', a.id);
	const other = await kelas('A2', a.id);
	const foreign = await kelas('B1', b.id);
	const fields = {
		nis: '001',
		nisn: '001',
		tempatLahir: 'Bandung',
		tanggalLahir: '2010-05-06',
		jenisKelamin: 'P',
		agama: 'Islam',
		pendidikanSebelumnya: 'SD',
		tanggalMasuk: '2026-07-01'
	};
	const student = async (kelas) =>
		insert(s.tableMurid, {
			...fields,
			nis: kelas.nama,
			semesterId: kelas.semesterId,
			nama: `Murid ${kelas.nama}`,
			sekolahId: kelas.sekolahId,
			kelasId: kelas.id,
			alamatId: (await alamat()).id
		});
	const mOwn = await student(own);
	const mOther = await student(other);
	const mForeign = await student(foreign);
	const locals = {
		sekolah: a,
		user: { id: 'test-wali', type: 'wali_kelas', kelasId: own.id, permissions: [] }
	};
	const event = (murid, kelas, extra = {}, context = locals) => {
		const form = new FormData();
		for (const [key, value] of Object.entries({
			...fields,
			nis: murid?.nis ?? 'NEW',
			nama: 'Nama Baru',
			kelasId: kelas.id,
			'alamat.jalan': 'Alamat Baru',
			'alamat.desa': 'Desa',
			'alamat.kecamatan': 'Kec',
			'alamat.kabupaten': 'Kab',
			'ibu.nama': 'Ibu',
			'ayah.nama': 'Ayah',
			'wali.nama': 'Wali',
			...extra
		}))
			form.set(key, String(value));
		for (const parent of ['ibu', 'ayah', 'wali']) {
			for (const field of ['pekerjaan', 'kontak', 'alamat']) form.set(`${parent}.${field}`, 'Uji');
		}
		return {
			params: { id: murid ? String(murid.id) : undefined },
			locals: context,
			request: new Request('http://localhost/murid/form', { method: 'POST', body: form })
		};
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
	const denied = (run) => assert.rejects(run, (e) => [400, 403, 404].includes(e.status));
	for (const murid of [mOther, mForeign]) {
		await check(`load rejects ${murid.nama}`, () =>
			denied(() => route.load({ params: { id: String(murid.id) }, locals }))
		);
		await check(`edit rejects ${murid.nama}`, () =>
			denied(() => route.actions.save(event(murid, own)))
		);
	}
	for (const kelas of [other, foreign]) {
		await check(`destination rejects ${kelas.nama}`, () =>
			denied(() => route.actions.save(event(mOwn, kelas)))
		);
		await check(`create rejects ${kelas.nama}`, () =>
			denied(() => route.actions.save(event(null, kelas)))
		);
	}
	await check('rejected writes leave students and addresses unchanged', async () => {
		for (const original of [mOwn, mOther, mForeign]) {
			const saved = await db.query.tableMurid.findFirst({
				where: eq(s.tableMurid.id, original.id),
				with: { alamat: true }
			});
			assert.equal(saved.nama, original.nama);
			assert.equal(saved.kelasId, original.kelasId);
			assert.equal(saved.sekolahId, original.sekolahId);
			assert.equal(saved.alamat.jalan, 'Jalan Uji');
		}
		assert.equal((await db.query.tableMurid.findMany()).length, 3);
	});
	await check('allowed load', async () => {
		assert.equal((await route.load({ params: { id: String(mOwn.id) }, locals })).murid.id, mOwn.id);
	});
	await check('allowed edit ignores forged ownership and identity', async () => {
		await route.actions.save(event(mOwn, own, { id: 99999, sekolahId: b.id }));
		const saved = await db.query.tableMurid.findFirst({ where: eq(s.tableMurid.id, mOwn.id) });
		assert.equal(saved.nama, 'Nama Baru');
		assert.equal(saved.sekolahId, a.id);
		assert.equal(saved.kelasId, own.id);
	});
	await check('allowed create', async () => {
		const result = await route.actions.save(event(null, own));
		assert.ok(result.id);
	});
	await check('admin can edit another class within active school', async () => {
		const admin = { sekolah: a, user: { id: 'test-admin', type: 'admin', permissions: [] } };
		await route.actions.save(event(mOther, other, {}, admin));
	});
	console.log(`13 checks, ${failed} failures`);
	process.exitCode = failed ? 1 : 0;
} finally {
	await closeDbClient?.();
	await server.close();
	fs.rmSync(dir, { recursive: true, force: true });
}
