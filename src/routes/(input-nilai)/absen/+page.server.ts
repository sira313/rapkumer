import db from '$lib/server/db';
import { tableKehadiranMurid, tableMurid, tablePresensiSettings } from '$lib/server/db/schema';
import { ensurePresensiSettingsSchema } from '$lib/server/db/ensure-presensi-settings';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, sql } from 'drizzle-orm';
// authority() permission helper removed from this module

const PER_PAGE = 20;
const TABLE_MISSING_MESSAGE =
	'Tabel kehadiran murid belum tersedia. Jalankan "pnpm db:push" untuk menerapkan migrasi terbaru.';

function isTableMissingError(error: unknown) {
	return (
		error instanceof Error &&
		error.message.includes('no such table') &&
		error.message.includes('kehadiran_murid')
	);
}

type KehadiranRow = {
	id: number;
	no: number;
	nama: string;
	sakit: number;
	izin: number;
	alfa: number;
	updatedAt: string | null;
};

type PageState = {
	search: string | null;
	currentPage: number;
	totalPages: number;
	totalItems: number;
	perPage: number;
};

export async function load({ parent, locals, url, depends }) {
	depends('app:absen');

	// Permission 'nilai_absen' removed — require authenticated user only
	if (!locals.user) throw redirect(303, '/login');

	await ensurePresensiSettingsSchema();

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
			tableReady: true,
			daftarMurid: [] as KehadiranRow[],
			page: defaultPage,
			totalMurid: 0,
			muridCount: 0,
			presensiSettings: null
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

	type MuridMinimal = Pick<typeof tableMurid.$inferSelect, 'id' | 'nama'>;
	type KehadiranMinimal = typeof tableKehadiranMurid.$inferSelect;
	type QueryRecord = MuridMinimal & { kehadiran: KehadiranMinimal | null };

	const presensiSettingsRecord = await db.query.tablePresensiSettings.findFirst({
		where: eq(tablePresensiSettings.sekolahId, sekolahId)
	});
	const presensiSettings = presensiSettingsRecord ?? null;

	let queryRecords: QueryRecord[] = [];
	let tableReady = true;

	try {
		queryRecords = await db.query.tableMurid.findMany({
			columns: { id: true, nama: true },
			with: {
				kehadiran: {
					columns: {
						id: true,
						muridId: true,
						sakit: true,
						izin: true,
						alfa: true,
						createdAt: true,
						updatedAt: true
					}
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
			queryRecords = fallbackRecords.map((record) => ({ ...record, kehadiran: null }));
		} else {
			throw error;
		}
	}

	const rows: KehadiranRow[] = queryRecords.map((murid, index) => ({
		id: murid.id,
		no: offset + index + 1,
		nama: murid.nama,
		sakit: murid.kehadiran?.sakit ?? 0,
		izin: murid.kehadiran?.izin ?? 0,
		alfa: murid.kehadiran?.alfa ?? 0,
		updatedAt: murid.kehadiran?.updatedAt ?? murid.kehadiran?.createdAt ?? null
	}));

	const pageState: PageState = {
		search,
		currentPage,
		totalPages,
		totalItems: total,
		perPage: PER_PAGE
	};

	return {
		meta: { title: 'Kehadiran Murid' } satisfies PageMeta,
		tableReady,
		page: pageState,
		daftarMurid: rows,
		totalMurid: total,
		muridCount: muridCount ?? 0,
		presensiSettings
	};
}

function parseCount(value: FormDataEntryValue | null): number | null {
	if (value == null) return 0;
	const raw = value.toString().trim();
	if (!raw) return 0;
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed < 0) return null;
	return parsed;
}

export const actions = {
	update: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id ?? null;
		if (!sekolahId) {
			return fail(401, { fail: 'Sekolah tidak ditemukan' });
		}

		const formData = await request.formData();
		const muridIdRaw = formData.get('muridId');

		if (!muridIdRaw) {
			return fail(400, { fail: 'Murid tidak ditemukan' });
		}

		const muridId = Number(muridIdRaw);
		if (!Number.isInteger(muridId) || muridId <= 0) {
			return fail(400, { fail: 'ID murid tidak valid' });
		}

		const [sakit, izin, alfa] = ['sakit', 'izin', 'alfa'].map((key) =>
			parseCount(formData.get(key))
		);

		if (sakit == null || izin == null || alfa == null) {
			return fail(400, { fail: 'Nilai kehadiran harus berupa angka bulat dan tidak negatif' });
		}

		const muridRecord = await db.query.tableMurid.findFirst({
			columns: { id: true },
			where: and(eq(tableMurid.id, muridId), eq(tableMurid.sekolahId, sekolahId))
		});

		if (!muridRecord) {
			return fail(404, { fail: 'Murid tidak ditemukan atau bukan bagian dari sekolah ini' });
		}

		try {
			await db
				.insert(tableKehadiranMurid)
				.values({
					muridId,
					sakit,
					izin,
					alfa
				})
				.onConflictDoUpdate({
					target: tableKehadiranMurid.muridId,
					set: {
						sakit,
						izin,
						alfa,
						updatedAt: new Date().toISOString()
					}
				});
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			throw error;
		}

		return { message: 'Rekap kehadiran murid berhasil diperbarui' };
	},

	savePresensiSettings: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id ?? null;
		if (!sekolahId) {
			return fail(401, { fail: 'Sekolah tidak ditemukan' });
		}

		if (locals.user?.type === 'wali_asuh') {
			return fail(403, { fail: 'Anda tidak memiliki izin untuk mengubah pengaturan presensi' });
		}

		const formData = await request.formData();
		const jamMasuk = formData.get('jamMasuk')?.toString().trim() ?? '';
		const jamPulang = formData.get('jamPulang')?.toString().trim() ?? '';
		const hariSekolahRaw = formData.get('hariSekolah')?.toString().trim() ?? '';
		const tipePresensi = formData.get('tipePresensi')?.toString().trim() ?? '';

		const timeRegex = /^\d{2}:\d{2}$/;
		if (!jamMasuk || !timeRegex.test(jamMasuk)) {
			return fail(400, { fail: 'Jam masuk harus diisi dengan format HH:mm' });
		}
		if (!jamPulang || !timeRegex.test(jamPulang)) {
			return fail(400, { fail: 'Jam pulang harus diisi dengan format HH:mm' });
		}
		if (jamMasuk >= jamPulang) {
			return fail(400, { fail: 'Jam masuk harus lebih awal dari jam pulang' });
		}

		const hariSekolah = Number(hariSekolahRaw);
		if (!Number.isInteger(hariSekolah) || ![5, 6].includes(hariSekolah)) {
			return fail(400, { fail: 'Hari sekolah tidak valid' });
		}

		const tipePresensiEnum = tipePresensi as 'masuk_pulang' | 'masuk_saja';
		if (!['masuk_pulang', 'masuk_saja'].includes(tipePresensiEnum)) {
			return fail(400, { fail: 'Tipe presensi tidak valid' });
		}

		await ensurePresensiSettingsSchema();

		await db
			.insert(tablePresensiSettings)
			.values({
				sekolahId,
				jamMasuk,
				jamPulang,
				hariSekolah,
				tipePresensi: tipePresensiEnum,
				updatedAt: new Date().toISOString()
			})
			.onConflictDoUpdate({
				target: tablePresensiSettings.sekolahId,
				set: {
					jamMasuk,
					jamPulang,
					hariSekolah,
					tipePresensi: tipePresensiEnum,
					updatedAt: new Date().toISOString()
				}
			});

		return { message: 'Pengaturan presensi berhasil disimpan' };
	}
};
