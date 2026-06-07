import db from '$lib/server/db';
import {
	tableAsesmenFormatif,
	tableMataPelajaran,
	tableMurid,
	tableTujuanPembelajaran,
	tableAuthUserMataPelajaran
} from '$lib/server/db/schema';
import { ensureAsesmenFormatifSchema } from '$lib/server/db/ensure-asesmen-formatif';
import { unflattenFormData } from '$lib/utils';
import { fail, error, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { authority } from '../../../pengguna/utils.server';

const DEFAULT_LINGKUP = 'Tanpa lingkup materi';

export async function load({ url, locals, depends }) {
	depends('app:asesmen-formatif/formulir');
	const muridIdParam = url.searchParams.get('murid_id');
	const mapelIdParam = url.searchParams.get('mapel_id');

	const muridId = muridIdParam ? Number(muridIdParam) : Number.NaN;
	const mapelId = mapelIdParam ? Number(mapelIdParam) : Number.NaN;

	if (!Number.isInteger(muridId) || !Number.isInteger(mapelId)) {
		throw error(400, 'Parameter asesmen tidak valid.');
	}

	const sekolahId = locals.sekolah?.id ?? null;
	if (!sekolahId) {
		throw error(401, 'Sekolah aktif tidak ditemukan.');
	}

	const murid = await db.query.tableMurid.findFirst({
		columns: { id: true, nama: true, kelasId: true },
		where: and(eq(tableMurid.id, muridId), eq(tableMurid.sekolahId, sekolahId))
	});

	if (!murid) {
		throw error(404, 'Data murid tidak ditemukan.');
	}

	const mapel = await db.query.tableMataPelajaran.findFirst({
		columns: { id: true, nama: true, kelasId: true },
		where: eq(tableMataPelajaran.id, mapelId)
	});

	if (!mapel || mapel.kelasId !== murid.kelasId) {
		throw error(404, 'Mata pelajaran tidak ditemukan untuk murid ini.');
	}

	// Permission check: Allow admin, wali_kelas, wali_asuh, and user (guru mapel) assigned to this subject
	const userType = (locals.user as { type?: string } | null)?.type;
	if (userType !== 'admin' && userType !== 'wali_kelas' && userType !== 'wali_asuh') {
		if (userType === 'user' && locals.user?.id) {
			const userId = locals.user.id;
			const assignedMapels = await db.query.tableAuthUserMataPelajaran.findMany({
				columns: { mataPelajaranId: true },
				where: eq(tableAuthUserMataPelajaran.authUserId, userId)
			});
			const assignedIds = new Set(assignedMapels.map((m) => m.mataPelajaranId));
			const legacyId = (locals.user as { mataPelajaranId?: number | null }).mataPelajaranId;
			if (legacyId) assignedIds.add(legacyId);

			// Check by ID first, then by name (cross-semester resolution)
			const accessById = assignedIds.has(mapel.id);
			if (!accessById) {
				const assignedMapelRecords = await db.query.tableMataPelajaran.findMany({
					columns: { nama: true },
					where: inArray(tableMataPelajaran.id, Array.from(assignedIds))
				});
				const allowedNames = new Set(
					assignedMapelRecords.map((m) => m.nama?.trim().toLowerCase() ?? '')
				);
				const mapelNorm = mapel.nama?.trim().toLowerCase() ?? '';
				if (!allowedNames.has(mapelNorm)) {
					throw redirect(303, '/forbidden?required=mapel_id');
				}
			}
		} else {
			authority('rapor_manage');
		}
	}

	await ensureAsesmenFormatifSchema();

	const tujuanPembelajaran = await db.query.tableTujuanPembelajaran.findMany({
		columns: { id: true, deskripsi: true, lingkupMateri: true },
		where: eq(tableTujuanPembelajaran.mataPelajaranId, mapel.id),
		orderBy: [asc(tableTujuanPembelajaran.lingkupMateri), asc(tableTujuanPembelajaran.id)]
	});

	const tujuanIds = tujuanPembelajaran.map((item) => item.id);

	const asesmen = tujuanIds.length
		? await db.query.tableAsesmenFormatif.findMany({
				columns: { tujuanPembelajaranId: true, tuntas: true },
				where: and(
					eq(tableAsesmenFormatif.muridId, murid.id),
					inArray(tableAsesmenFormatif.tujuanPembelajaranId, tujuanIds)
				)
			})
		: [];

	const asesmenMap = new Map(
		asesmen.map((item) => [item.tujuanPembelajaranId, Boolean(item.tuntas)])
	);

	const entries = tujuanPembelajaran.map((item, index) => {
		const status = asesmenMap.has(item.id) ? (asesmenMap.get(item.id) ? 'ya' : 'tidak') : null;
		return {
			index: index + 1,
			tujuanPembelajaranId: item.id,
			deskripsi: item.deskripsi,
			lingkupMateri: item.lingkupMateri?.trim() || DEFAULT_LINGKUP,
			status
		};
	});

	const meta: PageMeta = { title: `Form Asesmen Formatif - ${mapel.nama}` };

	return {
		meta,
		murid: { id: murid.id, nama: murid.nama },
		mapel: { id: mapel.id, nama: mapel.nama },
		hasTujuan: entries.length > 0,
		entries
	};
}

export const actions = {
	save: async ({ request, locals }) => {
		const formPayload = unflattenFormData<{
			muridId?: string;
			mapelId?: string;
			entries?: Record<string, { tujuanPembelajaranId?: string; status?: string }>;
		}>(await request.formData());

		const muridIdRaw = formPayload.muridId ?? '';
		const mapelIdRaw = formPayload.mapelId ?? '';
		const muridId = Number(muridIdRaw);
		const mapelId = Number(mapelIdRaw);

		if (!Number.isInteger(muridId) || !Number.isInteger(mapelId)) {
			return fail(400, { fail: 'Data murid atau mata pelajaran tidak valid.' });
		}

		const sekolahId = locals.sekolah?.id ?? null;
		if (!sekolahId) {
			return fail(401, { fail: 'Sekolah aktif tidak ditemukan.' });
		}

		const murid = await db.query.tableMurid.findFirst({
			columns: { id: true, kelasId: true },
			where: and(eq(tableMurid.id, muridId), eq(tableMurid.sekolahId, sekolahId))
		});
		if (!murid) {
			return fail(404, { fail: 'Murid tidak ditemukan.' });
		}

		const mapel = await db.query.tableMataPelajaran.findFirst({
			columns: { id: true, kelasId: true, nama: true },
			where: eq(tableMataPelajaran.id, mapelId)
		});
		if (!mapel || mapel.kelasId !== murid.kelasId) {
			return fail(404, { fail: 'Mata pelajaran tidak ditemukan.' });
		}

		// Permission check: Allow admin, wali_kelas, wali_asuh, and user (guru mapel) assigned to this subject
		const saveUserType = (locals.user as { type?: string } | null)?.type;
		if (saveUserType !== 'admin' && saveUserType !== 'wali_kelas' && saveUserType !== 'wali_asuh') {
			if (saveUserType === 'user' && locals.user?.id) {
				const saveUserId = locals.user.id;
				const saveAssigned = await db.query.tableAuthUserMataPelajaran.findMany({
					columns: { mataPelajaranId: true },
					where: eq(tableAuthUserMataPelajaran.authUserId, saveUserId)
				});
				const saveAssignedIds = new Set(saveAssigned.map((m) => m.mataPelajaranId));
				const saveLegacyId = (locals.user as { mataPelajaranId?: number | null }).mataPelajaranId;
				if (saveLegacyId) saveAssignedIds.add(saveLegacyId);

				// Check by ID first, then by name (cross-semester resolution)
				const saveAccessById = saveAssignedIds.has(mapel.id);
				if (!saveAccessById) {
					const saveAssignedMapels = await db.query.tableMataPelajaran.findMany({
						columns: { nama: true },
						where: inArray(tableMataPelajaran.id, Array.from(saveAssignedIds))
					});
					const saveAllowedNames = new Set(
						saveAssignedMapels.map((m) => m.nama?.trim().toLowerCase() ?? '')
					);
					const saveMapelNorm = mapel.nama?.trim().toLowerCase() ?? '';
					if (!saveAllowedNames.has(saveMapelNorm)) {
						return fail(403, { fail: 'Anda tidak memiliki akses ke mata pelajaran ini.' });
					}
				}
			} else {
				authority('rapor_manage');
			}
		}

		const tujuanPembelajaran = await db.query.tableTujuanPembelajaran.findMany({
			columns: { id: true },
			where: eq(tableTujuanPembelajaran.mataPelajaranId, mapel.id)
		});
		const tujuanSet = new Set(tujuanPembelajaran.map((item) => item.id));

		if (!tujuanSet.size) {
			return fail(400, { fail: 'Belum ada tujuan pembelajaran untuk mata pelajaran ini.' });
		}

		await ensureAsesmenFormatifSchema();

		const entries = Object.values(formPayload.entries ?? {}).flatMap((entry) => {
			const tujuanId = Number(entry.tujuanPembelajaranId ?? '');
			if (!Number.isInteger(tujuanId) || !tujuanSet.has(tujuanId)) {
				return [] as Array<{ tujuanId: number; status: 'ya' | 'tidak' | null }>;
			}
			const rawStatus = entry.status?.toLowerCase();
			const status = rawStatus === 'ya' ? 'ya' : rawStatus === 'tidak' ? 'tidak' : null;
			return [{ tujuanId, status }];
		});

		const now = new Date().toISOString();

		await db.transaction(async (tx) => {
			for (const entry of entries) {
				if (!entry.status) {
					await tx
						.delete(tableAsesmenFormatif)
						.where(
							and(
								eq(tableAsesmenFormatif.muridId, murid.id),
								eq(tableAsesmenFormatif.tujuanPembelajaranId, entry.tujuanId)
							)
						);
					continue;
				}

				await tx
					.insert(tableAsesmenFormatif)
					.values({
						muridId: murid.id,
						mataPelajaranId: mapel.id,
						tujuanPembelajaranId: entry.tujuanId,
						tuntas: entry.status === 'ya',
						updatedAt: now
					})
					.onConflictDoUpdate({
						target: [tableAsesmenFormatif.muridId, tableAsesmenFormatif.tujuanPembelajaranId],
						set: {
							tuntas: entry.status === 'ya',
							mataPelajaranId: mapel.id,
							updatedAt: now
						}
					});
			}
		});

		return { message: 'Penilaian formatif berhasil disimpan.' };
	}
};
