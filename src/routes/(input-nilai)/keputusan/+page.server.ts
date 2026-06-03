import db from '$lib/server/db';
import { tableKeputusanMurid, tableMurid } from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, sql } from 'drizzle-orm';

const PER_PAGE = 20;
const TABLE_MISSING_MESSAGE =
	'Tabel keputusan murid belum tersedia. Jalankan "pnpm db:push" untuk menerapkan migrasi terbaru.';

function isTableMissingError(error: unknown) {
	return (
		error instanceof Error &&
		error.message.includes('no such table') &&
		error.message.includes('keputusan_murid')
	);
}

export type KeputusanRow = {
	id: number;
	no: number;
	nama: string;
	naik: boolean;
};

type PageState = {
	search: string | null;
	currentPage: number;
	totalPages: number;
	totalItems: number;
	perPage: number;
};

export async function load({ parent, locals, url, depends }) {
	depends('app:keputusan');

	if (!locals.user) throw redirect(303, '/login');

	const { kelasAktif } = await parent();
	const sekolahId = locals.sekolah?.id ?? null;

	const searchParam = url.searchParams.get('q');
	const search = searchParam?.trim() ? searchParam.trim() : null;
	const requestedPage = Number(url.searchParams.get('page')) || 1;
	const pageNumber =
		Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;

	const defaultPage: PageState = {
		search,
		currentPage: 1,
		totalPages: 1,
		totalItems: 0,
		perPage: PER_PAGE
	};

	if (!sekolahId || !kelasAktif?.id) {
		return {
			meta: { title: 'Keputusan Kenaikan Kelas' } satisfies PageMeta,
			tableReady: true,
			daftarMurid: [] as KeputusanRow[],
			page: defaultPage,
			muridCount: 0,
			isGraduating: false
		};
	}

	const baseFilter = and(
		eq(tableMurid.sekolahId, sekolahId),
		eq(tableMurid.kelasId, kelasAktif.id)
	);

	const searchFilter = search
		? and(baseFilter, sql`${tableMurid.nama} LIKE ${'%' + search + '%'} COLLATE NOCASE`)
		: baseFilter;

	const [{ muridCount }] = await db
		.select({ muridCount: sql<number>`count(*)` })
		.from(tableMurid)
		.where(baseFilter);

	const [{ totalItems }] = await db
		.select({ totalItems: sql<number>`count(*)` })
		.from(tableMurid)
		.where(searchFilter);

	const total = totalItems ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
	const currentPage = Math.min(Math.max(pageNumber, 1), totalPages);
	const offset = (currentPage - 1) * PER_PAGE;

	if (pageNumber !== currentPage) {
		const params = new URLSearchParams(url.searchParams);
		if (currentPage <= 1) {
			params.delete('page');
		} else {
			params.set('page', String(currentPage));
		}
		throw redirect(303, `${url.pathname}${params.size ? `?${params}` : ''}`);
	}

	let queryRecords: (Pick<typeof tableMurid.$inferSelect, 'id' | 'nama'> & {
		keputusan: Pick<typeof tableKeputusanMurid.$inferSelect, 'naik'> | null;
	})[] = [];
	let tableReady = true;

	try {
		queryRecords = await db.query.tableMurid.findMany({
			columns: { id: true, nama: true },
			with: {
				keputusan: {
					columns: { naik: true }
				}
			},
			where: searchFilter,
			orderBy: asc(tableMurid.nama),
			limit: PER_PAGE,
			offset
		});
	} catch (error) {
		if (isTableMissingError(error)) {
			tableReady = false;
			const fallbackRecords = await db.query.tableMurid.findMany({
				columns: { id: true, nama: true },
				where: searchFilter,
				orderBy: asc(tableMurid.nama),
				limit: PER_PAGE,
				offset
			});
			queryRecords = fallbackRecords.map((r) => ({ ...r, keputusan: null }));
		} else {
			throw error;
		}
	}

	const isGraduating = ['Fase C', 'Fase D', 'Fase F'].includes(kelasAktif.fase ?? '');

	const rows: KeputusanRow[] = queryRecords.map((murid, index) => ({
		id: murid.id,
		no: offset + index + 1,
		nama: murid.nama,
		naik: murid.keputusan?.naik ?? true
	}));

	const page: PageState = {
		search,
		currentPage,
		totalPages,
		totalItems: total,
		perPage: PER_PAGE
	};

	return {
		meta: { title: 'Keputusan Kenaikan Kelas' } satisfies PageMeta,
		tableReady,
		daftarMurid: rows,
		page,
		muridCount: muridCount ?? 0,
		isGraduating
	};
}

export const actions = {
	save: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id ?? null;
		if (!sekolahId) {
			return fail(401, { fail: 'Sekolah tidak ditemukan' });
		}

		const formData = await request.formData();

		const muridIdsRaw = formData.getAll('muridId');
		const naikRaw = formData.getAll('naik');

		if (!muridIdsRaw.length) {
			return fail(400, { fail: 'Tidak ada data murid' });
		}

		const updates: Array<{ muridId: number; naik: boolean }> = [];

		for (let i = 0; i < muridIdsRaw.length; i++) {
			const muridId = Number(muridIdsRaw[i]);
			if (!Number.isInteger(muridId) || muridId <= 0) {
				return fail(400, { fail: 'ID murid tidak valid' });
			}

			const naikVal = naikRaw[i]?.toString();
			if (naikVal !== 'true' && naikVal !== 'false') {
				return fail(400, { fail: 'Nilai keputusan tidak valid' });
			}

			updates.push({ muridId, naik: naikVal === 'true' });
		}

		try {
			for (const update of updates) {
				await db
					.insert(tableKeputusanMurid)
					.values({
						muridId: update.muridId,
						naik: update.naik
					})
					.onConflictDoUpdate({
						target: tableKeputusanMurid.muridId,
						set: {
							naik: update.naik,
							updatedAt: new Date().toISOString()
						}
					});
			}
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			throw error;
		}

		return { message: 'Keputusan kenaikan kelas berhasil disimpan' };
	}
};
