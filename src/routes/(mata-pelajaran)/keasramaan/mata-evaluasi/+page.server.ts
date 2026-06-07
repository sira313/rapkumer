import db from '$lib/server/db';
import { tableKeasramaan, tableKeasramaanIndikator, tableAsesmenKeasramaan } from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';

const TABLE_MISSING_MESSAGE =
	'Tabel keasramaan belum tersedia. Jalankan "pnpm db:push" untuk menerapkan migrasi terbaru.';

function isTableMissingError(error: unknown) {
	if (error instanceof Error) {
		return error.message.includes('no such table');
	}
	return false;
}

export async function load({ depends, parent }) {
	depends('app:keasramaan');
	const { kelasAktif, user } = await parent();
	const kelasId = kelasAktif?.id ?? null;

	let keasramaanRaw: Awaited<ReturnType<typeof db.query.tableKeasramaan.findMany>> = [];
	let tableReady = true;

	if (kelasId) {
		try {
			keasramaanRaw = await db.query.tableKeasramaan.findMany({
				where: eq(tableKeasramaan.kelasId, kelasId),
				orderBy: asc(tableKeasramaan.createdAt),
				with: { indikator: { orderBy: asc(tableKeasramaanIndikator.createdAt) } }
			});
		} catch (error) {
			if (isTableMissingError(error)) {
				tableReady = false;
				keasramaanRaw = [];
			} else {
				throw error;
			}
		}
	}

	const meta: PageMeta = {
		title: 'Mata Evaluasi Keasramaan'
	};

	return {
		meta,
		kelasId,
		tableReady,
		mataPelajaran: keasramaanRaw
	};
}

function canManageKeasramaan(user: unknown): boolean {
	if (!user || typeof user !== 'object') return false;
	const u = user as { type?: string };
	return u.type === 'admin' || u.type === 'wali_kelas' || u.type === 'wali_asuh';
}

export const actions = {
	add: async ({ request, locals }) => {
		if (!canManageKeasramaan(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}
		const formData = await request.formData();
		const kelasIdRaw = formData.get('kelasId');
		const nama = formData.get('nama')?.toString().trim() ?? '';

		const kelasId = kelasIdRaw ? Number(kelasIdRaw) : null;
		if (!kelasId || !Number.isInteger(kelasId)) {
			throw redirect(303, `/forbidden?required=kelas_id`);
		}

		if (!nama) {
			return fail(400, { fail: 'Nama mata evaluasi wajib diisi' });
		}

		try {
			await db.insert(tableKeasramaan).values({ kelasId, nama });
			return { message: 'Mata evaluasi berhasil ditambahkan' };
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			throw error;
		}
	},

	update: async ({ request, locals }) => {
		if (!canManageKeasramaan(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}
		const formData = await request.formData();
		const idRaw = formData.get('id');
		const nama = formData.get('nama')?.toString().trim() ?? '';

		const id = idRaw ? Number(idRaw) : null;
		if (!id || !Number.isInteger(id)) {
			return fail(400, { fail: 'ID mata evaluasi tidak valid' });
		}

		if (!nama) {
			return fail(400, { fail: 'Nama mata evaluasi wajib diisi' });
		}

		try {
			await db.update(tableKeasramaan).set({ nama }).where(eq(tableKeasramaan.id, id));
			return { message: 'Mata evaluasi berhasil diperbarui' };
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			throw error;
		}
	},

	delete: async ({ request, locals }) => {
		if (!canManageKeasramaan(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}
		const formData = await request.formData();
		const idRaw = formData.get('id');

		const id = idRaw ? Number(idRaw) : null;
		if (!id || !Number.isInteger(id)) {
			return fail(400, { fail: 'ID mata evaluasi tidak valid' });
		}

		try {
			await db.transaction(async (tx) => {
				// Delete asesmen keasramaan yang referensi ke mata evaluasi ini
				await tx.delete(tableAsesmenKeasramaan).where(eq(tableAsesmenKeasramaan.keasramaanId, id));

				// Delete tujuan dan indikator akan otomatis terhapus via cascade
				// Delete mata evaluasi
				await tx.delete(tableKeasramaan).where(eq(tableKeasramaan.id, id));
			});
			return { message: 'Mata evaluasi berhasil dihapus' };
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			throw error;
		}
	},

	create: async ({ request, locals }) => {
		if (!canManageKeasramaan(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}
		const formData = await request.formData();
		const nama = formData.get('nama')?.toString().trim() ?? '';
		const kelasIdStr = formData.get('kelasId')?.toString().trim() ?? '';

		if (!nama) {
			return fail(400, { fail: 'Nama mata evaluasi wajib diisi' });
		}

		const kelasId = kelasIdStr ? Number(kelasIdStr) : null;
		if (!kelasId || !Number.isInteger(kelasId)) {
			return fail(400, { fail: 'Kelas tidak valid' });
		}

		// Parse indikator data from formData
		const indicatorMap = new Map<
			number,
			{
				deskripsi: string;
			}
		>();

		for (const [key, value] of formData.entries()) {
			const match = key.match(/^indikator\.(\d+)\.deskripsi$/);
			if (match) {
				const idx = Number(match[1]);
				const deskripsi = (value as string).trim();
				if (deskripsi.length > 0) {
					if (!indicatorMap.has(idx)) {
						indicatorMap.set(idx, { deskripsi });
					}
				}
			}
		}

		const indicators = Array.from(indicatorMap.values());

		try {
			await db.transaction(async (tx) => {
				// Insert mata evaluasi
				const keasramaanResult = await tx
					.insert(tableKeasramaan)
					.values({ kelasId, nama })
					.returning({ id: tableKeasramaan.id });

				const newId = keasramaanResult[0]?.id ?? null;
				if (!newId) {
					throw new Error('Failed to get inserted mata evaluasi ID');
				}

				// Insert indicators
				if (indicators.length > 0) {
					await tx.insert(tableKeasramaanIndikator).values(
						indicators.map((ind) => ({
							keasramaanId: newId,
							deskripsi: ind.deskripsi
						}))
					);
				}
			});

			return { message: 'Mata evaluasi berhasil ditambahkan' };
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			console.error('Create error:', error);
			throw error;
		}
	},

	save: async ({ request, locals }) => {
		if (!canManageKeasramaan(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}
		const formData = await request.formData();
		const mataEvaluasiIdRaw = formData.get('mataEvaluasiId');
		const mataEvaluasiNama = formData.get('mataEvaluasiNama')?.toString().trim() ?? '';

		const mataEvaluasiId = mataEvaluasiIdRaw ? Number(mataEvaluasiIdRaw) : null;
		if (!mataEvaluasiId || !Number.isInteger(mataEvaluasiId)) {
			return fail(400, { fail: 'ID mata evaluasi tidak valid' });
		}

		if (!mataEvaluasiNama) {
			return fail(400, { fail: 'Nama mata evaluasi wajib diisi' });
		}

		// Parse indikator data from formData
		const indicatorMap = new Map<
			number,
			{
				id?: number;
				deskripsi: string;
			}
		>();

		for (const [key, value] of formData.entries()) {
			const match = key.match(/^indikator\.(\d+)\.deskripsi$/);
			if (match) {
				const idx = Number(match[1]);
				const deskripsi = (value as string).trim();
				if (deskripsi.length > 0) {
					if (!indicatorMap.has(idx)) {
						indicatorMap.set(idx, { deskripsi });
					} else {
						const item = indicatorMap.get(idx)!;
						item.deskripsi = deskripsi;
					}
				}
			}

			const matchId = key.match(/^indikator\.(\d+)\.id$/);
			if (matchId) {
				const idx = Number(matchId[1]);
				const id = (value as string).trim();
				if (id.length > 0) {
					const numId = Number(id);
					if (Number.isFinite(numId)) {
						if (!indicatorMap.has(idx)) {
							indicatorMap.set(idx, { id: numId, deskripsi: '' });
						} else {
							indicatorMap.get(idx)!.id = numId;
						}
					}
				}
			}
		}

		const indicators = Array.from(indicatorMap.values());

		try {
			await db.transaction(async (tx) => {
				// Update mata evaluasi nama
				await tx
					.update(tableKeasramaan)
					.set({ nama: mataEvaluasiNama })
					.where(eq(tableKeasramaan.id, mataEvaluasiId));

				// Get existing indicators
				const existingIndicators = await tx
					.select()
					.from(tableKeasramaanIndikator)
					.where(eq(tableKeasramaanIndikator.keasramaanId, mataEvaluasiId));

				const existingIds = new Set(existingIndicators.map((ind) => ind.id));
				const incomingIds = new Set(
					indicators.filter((ind) => ind.id !== undefined).map((ind) => ind.id!)
				);

				// Delete indicators that are no longer in the list
				const idsToDelete = Array.from(existingIds).filter((id) => !incomingIds.has(id));
				if (idsToDelete.length > 0) {
					await tx
						.delete(tableKeasramaanIndikator)
						.where(inArray(tableKeasramaanIndikator.id, idsToDelete));
				}

				// Update existing indicators and collect new ones
				const toInsert = [];
				for (const indicator of indicators) {
					if (indicator.id !== undefined) {
						await tx
							.update(tableKeasramaanIndikator)
							.set({ deskripsi: indicator.deskripsi })
							.where(eq(tableKeasramaanIndikator.id, indicator.id));
					} else {
						toInsert.push({
							keasramaanId: mataEvaluasiId,
							deskripsi: indicator.deskripsi
						});
					}
				}

				// Insert new indicators
				if (toInsert.length > 0) {
					await tx.insert(tableKeasramaanIndikator).values(toInsert);
				}
			});

			return { message: 'Mata evaluasi dan indikator berhasil disimpan' };
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			console.error('Save error:', error);
			throw error;
		}
	},

	bulkDelete: async ({ request, locals }) => {
		if (!canManageKeasramaan(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}
		const formData = await request.formData();
		const ids: number[] = [];

		// Handle both formats: ids[0], ids[1] or just multiple 'ids' keys
		for (const [key, value] of formData.entries()) {
			if (key === 'ids') {
				// Direct format: formData.append('ids', id)
				const id = Number(value);
				if (Number.isInteger(id) && id > 0) {
					ids.push(id);
				}
			} else {
				// Indexed format: ids.0, ids.1 (for backward compatibility)
				const match = key.match(/^ids\.(\d+)$/);
				if (match) {
					const id = Number(value);
					if (Number.isInteger(id) && id > 0) {
						ids.push(id);
					}
				}
			}
		}

		if (ids.length === 0) {
			return fail(400, { fail: 'Tidak ada mata evaluasi yang dipilih' });
		}

		try {
			await db.transaction(async (tx) => {
				// Delete asesmen keasramaan yang referensi ke mata evaluasi yang akan dihapus
				await tx
					.delete(tableAsesmenKeasramaan)
					.where(inArray(tableAsesmenKeasramaan.keasramaanId, ids));

				// Delete tujuan dan indikator akan otomatis terhapus via cascade
				// Delete mata evaluasi
				await tx.delete(tableKeasramaan).where(inArray(tableKeasramaan.id, ids));
			});
			return { message: `${ids.length} mata evaluasi berhasil dihapus` };
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			throw error;
		}
	}
};
