import db from '$lib/server/db/index.js';
import { tableMataPelajaran } from '$lib/server/db/schema.js';
import { agamaMapelNames, pksMapelNames } from '$lib/statics';
import { unflattenFormData } from '$lib/utils';
import { fail } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';

const AGAMA_MAPEL_NAME_SET = new Set<string>(agamaMapelNames);
const PKS_MAPEL_NAME_SET = new Set<string>(pksMapelNames);
const JENIS_VALUES = ['wajib', 'pilihan', 'mulok', 'kejuruan', 'pemberdayaan'] as const;
function isValidJenis(value: string): value is (typeof JENIS_VALUES)[number] {
	return (JENIS_VALUES as readonly string[]).includes(value);
}

export async function load({ parent }) {
	const { mapel } = await parent();
	return {
		meta: { title: `Edit Mata Pelajaran - ${mapel.nama}` },
		kelasAktif: mapel.kelas
	};
}

export const actions = {
	async update({ params, request, locals }) {
		const id = Number(params.id);
		if (!Number.isInteger(id)) {
			return fail(400, { fail: 'Data mata pelajaran tidak valid.' });
		}

		const formMapel = unflattenFormData<{
			nama?: string;
			jenis?: string;
			kkm?: string;
			kode?: string;
		}>(await request.formData());

		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) {
			return fail(400, { fail: 'Pilih sekolah aktif terlebih dahulu.' });
		}

		const existing = await db.query.tableMataPelajaran.findFirst({
			where: eq(tableMataPelajaran.id, id),
			with: { kelas: true }
		});

		if (!existing || existing.kelas.sekolahId !== sekolahId) {
			return fail(404, { fail: 'Data mata pelajaran tidak ditemukan.' });
		}

		const kkmValue = formMapel.kkm ? Number(formMapel.kkm) : Number.NaN;
		const kode = formMapel.kode?.toString().trim() ?? '';
		if (Number.isNaN(kkmValue)) {
			return fail(400, { fail: 'KKM tidak valid.' });
		}

		const isAgamaGroup = AGAMA_MAPEL_NAME_SET.has(existing.nama);
		const isPksGroup = PKS_MAPEL_NAME_SET.has(existing.nama);
		const now = new Date().toISOString();
		const kkm = Math.max(0, Math.round(kkmValue));

		if (isAgamaGroup) {
			// enforce PAPB code for agama group and update KKM and kode across all variants
			await db
				.update(tableMataPelajaran)
				.set({ kkm, kode: 'PAPB', updatedAt: now })
				.where(
					and(
						eq(tableMataPelajaran.kelasId, existing.kelasId),
						inArray(tableMataPelajaran.nama, agamaMapelNames)
					)
				);

			return { message: `KKM Pendidikan Agama dan Budi Pekerti diperbarui` };
		}

		if (isPksGroup) {
			// enforce PKS code for PKS group and update KKM, jenis, and kode across all variants
			const jenisRaw = formMapel.jenis?.toString().toLowerCase() ?? existing.jenis;
			if (!isValidJenis(jenisRaw)) {
				return fail(400, { fail: 'Jenis mata pelajaran tidak valid.' });
			}

			await db
				.update(tableMataPelajaran)
				.set({ kkm, jenis: jenisRaw, kode: 'PKS', updatedAt: now })
				.where(
					and(
						eq(tableMataPelajaran.kelasId, existing.kelasId),
						inArray(tableMataPelajaran.nama, pksMapelNames)
					)
				);

			return { message: `KKM dan jenis Pendalaman Kitab Suci diperbarui` };
		}

		const nama = formMapel.nama?.toString().trim();
		if (!nama) {
			return fail(400, { fail: 'Nama mata pelajaran wajib diisi.' });
		}

		const jenisRaw = formMapel.jenis?.toString().toLowerCase() ?? '';
		if (!isValidJenis(jenisRaw)) {
			return fail(400, { fail: 'Jenis mata pelajaran tidak valid.' });
		}

		// For non-agama subjects update kode if provided
		const updates: Record<string, unknown> = { nama, jenis: jenisRaw, kkm, updatedAt: now };
		if (kode) updates.kode = kode;

		await db.update(tableMataPelajaran).set(updates).where(eq(tableMataPelajaran.id, id));

		return { message: `Data mata pelajaran berhasil diperbarui` };
	}
};
