import db from '$lib/server/db/index.js';
import { tableKelas, tableMataPelajaran } from '$lib/server/db/schema';
import { cookieNames, unflattenFormData } from '$lib/utils';
import { fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { agamaMapelNames } from '$lib/statics';

export async function load({ parent }) {
	const { kelasAktif } = await parent();
	return { meta: { title: `Form Mata Pelajaran` }, kelasAktif };
}

export const actions = {
	async add({ request, cookies, locals }) {
		const formMapel = unflattenFormData<{
			nama?: string;
			jenis?: string;
			kkm?: string;
			kode?: string;
		}>(await request.formData());

		const kelasIdCookie = cookies.get(cookieNames.ACTIVE_KELAS_ID);
		if (!kelasIdCookie) {
			return fail(400, { fail: 'Pilih kelas aktif terlebih dahulu di navbar.' });
		}

		const kelasId = Number(kelasIdCookie);
		if (!Number.isInteger(kelasId)) {
			return fail(400, { fail: 'Kelas aktif tidak valid.' });
		}

		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) {
			return fail(400, { fail: 'Pilih sekolah aktif terlebih dahulu.' });
		}

		const kelasAktif = await db.query.tableKelas.findFirst({
			columns: { id: true },
			where: and(eq(tableKelas.id, kelasId), eq(tableKelas.sekolahId, sekolahId))
		});
		if (!kelasAktif) {
			return fail(400, { fail: 'Kelas aktif tidak ditemukan.' });
		}

		const nama = formMapel.nama?.trim();
		const jenis = formMapel.jenis?.toLowerCase() as MataPelajaran['jenis'] | undefined;
		const kkmValue = formMapel.kkm ? Number(formMapel.kkm) : Number.NaN;
		let kode = formMapel.kode?.toString().trim() ?? '';

		if (!nama || !jenis || Number.isNaN(kkmValue)) {
			return fail(400, { fail: 'Harap lengkapi data mata pelajaran.' });
		}

		if (!['wajib', 'pilihan', 'mulok', 'kejuruan', 'pemberdayaan'].includes(jenis)) {
			return fail(400, { fail: 'Jenis mata pelajaran tidak valid.' });
		}

		const kkm = Math.max(0, Math.round(kkmValue));

		// If this is a Pendidikan Agama and Budi Pekerti (parent or variant), enforce code PAPB
		const AGAMA_SET = new Set<string>(agamaMapelNames);
		if (AGAMA_SET.has(nama)) {
			kode = 'PAPB';
		}

		// Validasi duplikat: cek apakah sudah ada mapel dengan nama sama di kelas ini
		const existing = await db.query.tableMataPelajaran.findFirst({
			where: and(eq(tableMataPelajaran.kelasId, kelasId), eq(tableMataPelajaran.nama, nama))
		});

		if (existing) {
			return fail(400, {
				fail: `Mata pelajaran "${nama}" sudah ada di kelas ini. Tidak boleh duplikat.`
			});
		}

		await db.insert(tableMataPelajaran).values({
			nama,
			jenis,
			kkm,
			kelasId,
			kode: kode || null
		});
		return { message: `Data mata pelajaran berhasil ditambah` };
	}
};
