import db from '$lib/server/db';
import { isWaliOfKelas, ownedKelasIdSet } from '$lib/server/kelas-akses';
import { tableKelas, tableKokurikuler } from '$lib/server/db/schema';
import { profilPelajarPancasilaDimensions, type DimensiProfilLulusanKey } from '$lib/statics';
import { fail } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';

const DIMENSION_KEY_SET = new Set<DimensiProfilLulusanKey>(
	profilPelajarPancasilaDimensions.map((dimension) => dimension.key)
);

const TABLE_MISSING_MESSAGE =
	'Tabel kokurikuler belum tersedia. Jalankan "pnpm db:push" untuk menerapkan migrasi terbaru.';

function sanitizeDimensions(values: string[]): DimensiProfilLulusanKey[] {
	const unique = new Set<DimensiProfilLulusanKey>();
	for (const value of values) {
		if (DIMENSION_KEY_SET.has(value as DimensiProfilLulusanKey)) {
			unique.add(value as DimensiProfilLulusanKey);
		}
	}
	return Array.from(unique);
}

function isTableMissingError(error: unknown) {
	return (
		error instanceof Error &&
		error.message.includes('no such table') &&
		error.message.includes('kokurikuler')
	);
}

export async function load({ depends, parent }) {
	depends('app:kokurikuler');
	const { kelasAktif } = await parent();
	const kelasId = kelasAktif?.id ?? null;

	let kokurikulerRaw: Awaited<ReturnType<typeof db.query.tableKokurikuler.findMany>> = [];
	let tableReady = true;

	if (kelasId) {
		try {
			kokurikulerRaw = await db.query.tableKokurikuler.findMany({
				where: eq(tableKokurikuler.kelasId, kelasId),
				orderBy: asc(tableKokurikuler.createdAt)
			});
		} catch (error) {
			if (isTableMissingError(error)) {
				tableReady = false;
				kokurikulerRaw = [];
			} else {
				throw error;
			}
		}
	}

	return {
		kelasId,
		tableReady,
		kokurikuler: kokurikulerRaw.map((item) => ({
			...item,
			dimensi: Array.isArray(item.dimensi)
				? (item.dimensi as DimensiProfilLulusanKey[])
				: sanitizeDimensions(
						typeof item.dimensi === 'string'
							? (() => {
									try {
										return JSON.parse(item.dimensi) as string[];
									} catch (error) {
										console.error('Gagal mengurai dimensi kokurikuler', error);
										return [];
									}
								})()
							: []
					)
		})),
		dimensiPilihan: profilPelajarPancasilaDimensions
	};
}

export const actions = {
	add: async ({ request, locals }) => {
		const formData = await request.formData();
		const kelasIdRaw = formData.get('kelasId');
		const kode = formData.get('kode')?.toString().trim().toUpperCase() ?? '';
		const tujuan = formData.get('kokurikuler')?.toString().trim() ?? '';
		const dimensi = sanitizeDimensions(
			formData.getAll('dimensi').map((value) => value?.toString() ?? '')
		);

		if (!kelasIdRaw) {
			return fail(400, { fail: 'Kelas aktif tidak ditemukan' });
		}

		const kelasId = Number(kelasIdRaw);
		if (!Number.isInteger(kelasId)) {
			return fail(400, { fail: 'Kelas tidak valid' });
		}

		// Server-side permission: wali_kelas may only add for their own kelas
		if (locals?.user && (locals.user as unknown as { type?: string }).type === 'wali_kelas') {
			const u = locals.user as { pegawaiId?: number | null };

			const owned = u.pegawaiId
				? await db.query.tableKelas.findFirst({
						columns: { id: true },
						where: and(eq(tableKelas.id, kelasId), eq(tableKelas.waliKelasId, u.pegawaiId))
					})
				: null;
			if (!owned) {
				return fail(403, {
					fail: 'Anda tidak memiliki izin untuk menambah kokurikuler di kelas ini.'
				});
			}
		}

		if (!dimensi.length) {
			return fail(400, { fail: 'Pilih minimal satu dimensi profil lulusan' });
		}

		if (!kode) {
			return fail(400, { fail: 'Kode kokurikuler wajib diisi' });
		}

		if (!tujuan) {
			return fail(400, { fail: 'Kegiatan kokurikuler wajib diisi' });
		}

		try {
			const existing = await db.query.tableKokurikuler.findFirst({
				columns: { id: true },
				where: eq(tableKokurikuler.kode, kode)
			});
			if (existing) {
				return fail(400, { fail: 'Kode sudah digunakan' });
			}

			await db.insert(tableKokurikuler).values({
				kelasId,
				kode,
				dimensi,
				tujuan
			});

			return { message: 'Kokurikuler berhasil ditambahkan', kode };
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			throw error;
		}
	},

	delete: async ({ request, locals }) => {
		const formData = await request.formData();
		const ids = Array.from(
			new Set(
				formData
					.getAll('ids')
					.map((id) => Number(id))
					.filter((id): id is number => Number.isInteger(id) && id > 0)
			)
		);

		if (ids.length === 0) {
			return fail(400, { fail: 'Pilih data kokurikuler yang akan dihapus' });
		}

		try {
			// wali_kelas hanya boleh menghapus data di kelas yang dia wali
			const deleteUser = locals.user as { type?: string; pegawaiId?: number | null } | null;
			if (deleteUser?.type === 'wali_kelas') {
				const ownedIds = await ownedKelasIdSet(deleteUser);
				const rows = await db.query.tableKokurikuler.findMany({
					columns: { id: true, kelasId: true },
					where: inArray(tableKokurikuler.id, ids)
				});
				if (rows.some((r) => !ownedIds.has(r.kelasId))) {
					return fail(403, {
						fail: 'Anda tidak memiliki izin untuk menghapus di kelas ini.'
					});
				}
			}
			await db.delete(tableKokurikuler).where(inArray(tableKokurikuler.id, ids));
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			throw error;
		}

		return { message: `${ids.length} kokurikuler berhasil dihapus` };
	},
	update: async ({ request, locals }) => {
		const formData = await request.formData();
		const idRaw = formData.get('id');
		const kelasIdRaw = formData.get('kelasId');
		const kode = formData.get('kode')?.toString().trim().toUpperCase() ?? '';
		const tujuan = formData.get('kokurikuler')?.toString().trim() ?? '';
		const dimensi = sanitizeDimensions(
			formData.getAll('dimensi').map((value) => value?.toString() ?? '')
		);

		if (!idRaw) {
			return fail(400, { fail: 'ID kokurikuler tidak ditemukan' });
		}

		const id = Number(idRaw);
		if (!Number.isInteger(id) || id <= 0) {
			return fail(400, { fail: 'ID kokurikuler tidak valid' });
		}

		if (!kelasIdRaw) {
			return fail(400, { fail: 'Kelas aktif tidak ditemukan' });
		}

		const kelasId = Number(kelasIdRaw);
		if (!Number.isInteger(kelasId)) {
			return fail(400, { fail: 'Kelas tidak valid' });
		}

		// Server-side permission: wali_kelas may only update for their own kelas
		const updateUser = locals.user as { type?: string; pegawaiId?: number | null } | null;
		if (updateUser?.type === 'wali_kelas' && !(await isWaliOfKelas(updateUser, kelasId))) {
			return fail(403, {
				fail: 'Anda tidak memiliki izin untuk mengubah di kelas ini.'
			});
		}

		if (!dimensi.length) {
			return fail(400, { fail: 'Pilih minimal satu dimensi profil lulusan' });
		}

		if (!kode) {
			return fail(400, { fail: 'Kode kokurikuler wajib diisi' });
		}

		if (!tujuan) {
			return fail(400, { fail: 'Kegiatan kokurikuler wajib diisi' });
		}

		try {
			const existing = await db.query.tableKokurikuler.findFirst({
				columns: { id: true },
				where: eq(tableKokurikuler.kode, kode)
			});
			if (existing && existing.id !== id) {
				return fail(400, { fail: 'Kode sudah digunakan' });
			}

			const updated = await db
				.update(tableKokurikuler)
				.set({ kode, dimensi, tujuan, updatedAt: new Date().toISOString() })
				.where(and(eq(tableKokurikuler.id, id), eq(tableKokurikuler.kelasId, kelasId)))
				.returning({ id: tableKokurikuler.id });

			if (!updated.length) {
				return fail(404, { fail: 'Kokurikuler tidak ditemukan atau sudah dihapus' });
			}

			return { message: 'Kokurikuler berhasil diperbarui', id };
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			throw error;
		}
	}
};
