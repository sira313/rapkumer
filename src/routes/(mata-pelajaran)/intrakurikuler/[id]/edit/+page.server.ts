import db from '$lib/server/db/index.js';
import { normMapelName } from '$lib/server/dapodik';
import { opsiMapelDapodik } from '$lib/server/dapodik-mapel-options';
import { tableDapodikPembelajaran, tableMataPelajaran } from '$lib/server/db/schema.js';
import { isWaliOfKelas } from '$lib/server/kelas-akses';
import { agamaMapelNames, pksMapelNames } from '$lib/statics';
import { unflattenFormData } from '$lib/utils';
import { fail } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';

const AGAMA_MAPEL_NAME_SET = new Set<string>(agamaMapelNames);
const PKS_MAPEL_NAME_SET = new Set<string>(pksMapelNames);
const JENIS_VALUES = [
	'belum_dipetakan',
	'wajib',
	'pilihan',
	'mulok',
	'kejuruan',
	'pemberdayaan'
] as const;
function isValidJenis(value: string): value is (typeof JENIS_VALUES)[number] {
	return (JENIS_VALUES as readonly string[]).includes(value);
}

export async function load({ parent, locals }) {
	const { mapel } = await parent();
	const { dapodikMapelList, indukList } = await opsiMapelDapodik(mapel.kelasId, locals.sekolah);
	return {
		meta: { title: `Edit Mata Pelajaran - ${mapel.nama}` },
		kelasAktif: mapel.kelas,
		dapodikMapelList,
		indukList
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
			nama_lokal?: string;
			jenis?: string;
			kkm?: string;
			kode?: string;
			induk_pembelajaran_id?: string;
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

		// Wali kelas hanya boleh mengedit mapel di kelas miliknya
		const user = locals.user as { type?: string; pegawaiId?: number | null } | null;
		if (user?.type === 'wali_kelas' && !(await isWaliOfKelas(user, existing.kelasId))) {
			return fail(403, { fail: 'Anda tidak memiliki izin untuk mengedit di kelas ini.' });
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

		// Logika konsisten dengan modal Tambah: nama tidak terdaftar sebagai
		// pembelajaran Dapodik → Mata Pelajaran Induk wajib dipilih.
		const indukRows = await db
			.select({
				nama: tableDapodikPembelajaran.nama,
				pembelajaranId: tableDapodikPembelajaran.pembelajaranId,
				mataPelajaranId: tableDapodikPembelajaran.mataPelajaranId
			})
			.from(tableDapodikPembelajaran)
			.where(eq(tableDapodikPembelajaran.kelasId, existing.kelasId));
		const terdaftarDiDapodik =
			indukRows.length > 0 &&
			indukRows.some(
				(r) => r.nama === existing.nama || normMapelName(r.nama) === normMapelName(existing.nama)
			);
		let indukBaru: string | null | undefined;
		const indukRaw = formMapel.induk_pembelajaran_id;
		if (indukRaw !== undefined) {
			const v = indukRaw.trim();
			if (v) {
				if (!indukRows.some((r) => r.pembelajaranId === v)) {
					return fail(400, { fail: 'Pembelajaran induk tidak valid untuk kelas ini.' });
				}
				indukBaru = v;
			} else {
				indukBaru = null;
			}
		}
		if (
			indukRows.length > 0 &&
			!terdaftarDiDapodik &&
			(indukBaru === undefined || indukBaru === null)
		) {
			return fail(400, {
				fail: `"${existing.nama}" belum terdaftar sebagai pembelajaran Dapodik — pilih "Mata Pelajaran Induk" agar dapat dikirim sebagai Sub Pembelajaran.`
			});
		}

		if (isAgamaGroup) {
			// enforce PAPB code for agama group and update KKM and kode across all variants
			const setAgama: Partial<typeof tableMataPelajaran.$inferInsert> = {
				kkm,
				kode: 'PAPB',
				updatedAt: now
			};
			// Induk pilihan (Sub Pembelajaran) berlaku ke seluruh varian agama kelas ini.
			if (indukBaru !== undefined) setAgama.dapodikIndukPembelajaranId = indukBaru;
			await db
				.update(tableMataPelajaran)
				.set(setAgama)
				.where(
					and(
						eq(tableMataPelajaran.kelasId, existing.kelasId),
						inArray(tableMataPelajaran.nama, agamaMapelNames)
					)
				);

			return { message: `Data Pendidikan Agama dan Budi Pekerti diperbarui` };
		}

		if (isPksGroup) {
			// enforce PKS code for PKS group and update KKM, jenis, and kode across all variants
			const jenisRaw = formMapel.jenis?.toString().toLowerCase() ?? existing.jenis;
			if (!isValidJenis(jenisRaw)) {
				return fail(400, { fail: 'Jenis mata pelajaran tidak valid.' });
			}

			const setPks: Record<string, unknown> = {
				kkm,
				jenis: jenisRaw,
				kode: 'PKS',
				updatedAt: now
			};
			if (indukBaru !== undefined) setPks.dapodikIndukPembelajaranId = indukBaru;
			await db
				.update(tableMataPelajaran)
				.set(setPks)
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
		const updates: Record<string, unknown> = {
			nama,
			namaLokal: formMapel.nama_lokal?.toString().trim() || null,
			jenis: jenisRaw,
			kkm,
			updatedAt: now
		};
		if (kode) updates.kode = kode;
		if (indukBaru !== undefined) updates.dapodikIndukPembelajaranId = indukBaru;
		// Nama diganti → sinkronkan kode Dapodik:
		// - nama baru terdaftar sebagai pembelajaran → rebind ke kode baru;
		// - nama baru tidak terdaftar → hapus kode lama agar kirim nilai jatuh
		//   ke jalur Sub Pembelajaran (induk wajib dipilih saat nama tak terdaftar).
		if (nama !== existing.nama) {
			const mirrorBaru = indukRows.find(
				(m) =>
					m.mataPelajaranId && (m.nama === nama || normMapelName(m.nama) === normMapelName(nama))
			);
			if (mirrorBaru) {
				updates.dapodikPembelajaranId = mirrorBaru.pembelajaranId;
				updates.dapodikMataPelajaranId = mirrorBaru.mataPelajaranId;
				updates.dapodikIndukPembelajaranId = null;
			} else {
				updates.dapodikPembelajaranId = null;
				updates.dapodikMataPelajaranId = null;
			}
		}

		await db.update(tableMataPelajaran).set(updates).where(eq(tableMataPelajaran.id, id));

		return { message: `Data mata pelajaran berhasil diperbarui` };
	}
};
