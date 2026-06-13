import db from '$lib/server/db';
import {
	tableAbsensi,
	tableKetidakhadiranHarian,
	tableMurid,
	tablePresensiSettings
} from '$lib/server/db/schema';
import { ensureAbsensiSchema } from '$lib/server/db/ensure-absensi';
import { ensureKetidakhadiranHarianSchema } from '$lib/server/db/ensure-ketidakhadiran-harian';
import { ensurePresensiSettingsSchema } from '$lib/server/db/ensure-presensi-settings';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, sql } from 'drizzle-orm';

const PER_PAGE = 20;
const TABLE_MISSING_MESSAGE =
	'Tabel ketidakhadiran harian belum tersedia. Jalankan "pnpm db:push" untuk menerapkan migrasi terbaru.';

function isTableMissingError(error: unknown) {
	return (
		error instanceof Error &&
		error.message.includes('no such table') &&
		(error.message.includes('ketidakhadiran_harian') || error.message.includes('absensi'))
	);
}

function todayDateString() {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

type KehadiranRow = {
	id: number;
	no: number;
	nama: string;
	hadir: boolean;
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

	if (!locals.user) throw redirect(303, '/login');

	await ensurePresensiSettingsSchema();
	await ensureAbsensiSchema();
	await ensureKetidakhadiranHarianSchema();

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
	type KetidakhadiranMinimal = typeof tableKetidakhadiranHarian.$inferSelect;
	type QueryRecord = MuridMinimal & {
		ketidakhadiranHarian: KetidakhadiranMinimal[];
		absensi: { id: number }[];
	};

	const presensiSettingsRecord = await db.query.tablePresensiSettings.findFirst({
		where: eq(tablePresensiSettings.sekolahId, sekolahId)
	});
	const presensiSettings = presensiSettingsRecord ?? null;

	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);
	const todayEnd = new Date();
	todayEnd.setHours(23, 59, 59, 999);
	const tanggal = todayDateString();

	let queryRecords: QueryRecord[] = [];
	let tableReady = true;

	try {
		queryRecords = await db.query.tableMurid.findMany({
			columns: { id: true, nama: true },
			with: {
				ketidakhadiranHarian: {
					columns: {
						id: true,
						muridId: true,
						tanggal: true,
						sakit: true,
						izin: true,
						alfa: true,
						createdAt: true,
						updatedAt: true
					},
					where: eq(tableKetidakhadiranHarian.tanggal, tanggal)
				},
				absensi: {
					columns: { id: true },
					where: and(
						sql`${tableAbsensi.waktu} >= ${todayStart.toISOString()}`,
						sql`${tableAbsensi.waktu} <= ${todayEnd.toISOString()}`
					),
					limit: 1
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
			queryRecords = fallbackRecords.map((record) => ({
				...record,
				ketidakhadiranHarian: [],
				absensi: []
			}));
		} else {
			throw error;
		}
	}

	const rows: KehadiranRow[] = queryRecords.map((murid, index) => {
		const kh = murid.ketidakhadiranHarian?.[0] ?? null;
		return {
			id: murid.id,
			no: offset + index + 1,
			nama: murid.nama,
			hadir: murid.absensi.length > 0,
			sakit: kh?.sakit ?? 0,
			izin: kh?.izin ?? 0,
			alfa: kh?.alfa ?? 0,
			updatedAt: kh?.updatedAt ?? kh?.createdAt ?? null
		};
	});

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
				.insert(tableKetidakhadiranHarian)
				.values({
					muridId,
					tanggal: todayDateString(),
					sakit,
					izin,
					alfa
				})
				.onConflictDoUpdate({
					target: [tableKetidakhadiranHarian.muridId, tableKetidakhadiranHarian.tanggal],
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

		return { message: 'Ketidakhadiran hari ini berhasil diperbarui' };
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
