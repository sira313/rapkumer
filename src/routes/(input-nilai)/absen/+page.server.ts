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
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

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
	keterangan: string | null;
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
						keterangan: true,
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
			hadir: murid.absensi.length > 0 && !kh?.keterangan,
			keterangan: kh?.keterangan ?? null,
			updatedAt: kh?.updatedAt ?? kh?.createdAt ?? null
		};
	});

	let semuaMurid: Array<{ id: number; nama: string; keterangan: string | null }> = [];
	if (tableReady) {
		try {
			const semuaMuridRecords = await db.query.tableMurid.findMany({
				columns: { id: true, nama: true },
				with: {
					ketidakhadiranHarian: {
						columns: { keterangan: true },
						where: eq(tableKetidakhadiranHarian.tanggal, tanggal),
						limit: 1
					}
				},
				where: baseFilter,
				orderBy: asc(tableMurid.nama)
			});
			semuaMurid = semuaMuridRecords.map((m) => ({
				id: m.id,
				nama: m.nama,
				keterangan: m.ketidakhadiranHarian?.[0]?.keterangan ?? null
			}));
		} catch {
			tableReady = false;
		}
	}

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
		semuaMurid,
		totalMurid: total,
		muridCount: muridCount ?? 0,
		presensiSettings
	};
}

export const actions = {
	update: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id ?? null;
		if (!sekolahId) {
			return fail(401, { fail: 'Sekolah tidak ditemukan' });
		}

		if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
			return fail(403, { fail: 'Anda tidak memiliki izin untuk mengubah data kehadiran' });
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

		const keteranganRaw = formData.get('keterangan')?.toString().trim() ?? '';
		const keterangan = ['sakit', 'izin', 'alfa'].includes(keteranganRaw) ? keteranganRaw : null;

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
					keterangan
				})
				.onConflictDoUpdate({
					target: [tableKetidakhadiranHarian.muridId, tableKetidakhadiranHarian.tanggal],
					set: {
						keterangan,
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

	isiSekaligus: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id ?? null;
		if (!sekolahId) {
			return fail(401, { fail: 'Sekolah tidak ditemukan' });
		}

		if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
			return fail(403, { fail: 'Anda tidak memiliki izin untuk mengubah data kehadiran' });
		}

		const formData = await request.formData();
		const mode = formData.get('mode')?.toString();

		if (!mode || !['hadir_semua', 'selected'].includes(mode)) {
			return fail(400, { fail: 'Mode tidak valid' });
		}

		const kelasIdRaw = formData.get('kelasId')?.toString();
		const kelasId = kelasIdRaw ? Number(kelasIdRaw) : null;
		if (!kelasId || !Number.isInteger(kelasId)) {
			return fail(400, { fail: 'Kelas tidak ditemukan' });
		}

		const tanggal = todayDateString();
		const now = new Date().toISOString();
		const todayStart = new Date();
		todayStart.setHours(0, 0, 0, 0);
		const todayEnd = new Date();
		todayEnd.setHours(23, 59, 59, 999);

		try {
			const semuaMurid = await db.query.tableMurid.findMany({
				columns: { id: true },
				where: and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, kelasId))
			});

			if (mode === 'hadir_semua') {
				for (const murid of semuaMurid) {
					await db
						.insert(tableKetidakhadiranHarian)
						.values({ muridId: murid.id, tanggal, keterangan: null })
						.onConflictDoUpdate({
							target: [tableKetidakhadiranHarian.muridId, tableKetidakhadiranHarian.tanggal],
							set: { keterangan: null, updatedAt: now }
						});

					const existingAbsensi = await db.query.tableAbsensi.findFirst({
						columns: { id: true },
						where: and(
							eq(tableAbsensi.muridId, murid.id),
							sql`${tableAbsensi.waktu} >= ${todayStart.toISOString()}`,
							sql`${tableAbsensi.waktu} <= ${todayEnd.toISOString()}`
						)
					});
					if (!existingAbsensi) {
						await db.insert(tableAbsensi).values({ muridId: murid.id, waktu: now });
					}
				}

				return { message: 'Semua murid ditandai hadir' };
			}

			if (mode === 'selected') {
				const entriesRaw = formData.get('entries')?.toString() ?? '';
				let entries: Array<{ muridId: number; keterangan: string }> = [];
				try {
					entries = JSON.parse(entriesRaw);
				} catch {
					return fail(400, { fail: 'Data tidak valid' });
				}

				if (!Array.isArray(entries) || entries.length === 0) {
					return fail(400, { fail: 'Pilih minimal satu murid' });
				}

				const entryMap = new Map<number, string>();
				for (const e of entries) {
					const id = Number(e.muridId);
					if (Number.isInteger(id) && id > 0) {
						const k = ['sakit', 'izin', 'alfa'].includes(e.keterangan) ? e.keterangan : 'alfa';
						entryMap.set(id, k);
					}
				}

				const selectedIds = Array.from(entryMap.keys());
				if (selectedIds.length > 0) {
					await db
						.delete(tableAbsensi)
						.where(
							and(
								inArray(tableAbsensi.muridId, selectedIds),
								sql`${tableAbsensi.waktu} >= ${todayStart.toISOString()}`,
								sql`${tableAbsensi.waktu} <= ${todayEnd.toISOString()}`
							)
						);
				}

				for (const [muridId, keterangan] of entryMap) {
					await db
						.insert(tableKetidakhadiranHarian)
						.values({ muridId, tanggal, keterangan })
						.onConflictDoUpdate({
							target: [tableKetidakhadiranHarian.muridId, tableKetidakhadiranHarian.tanggal],
							set: { keterangan, updatedAt: now }
						});
				}

				return { message: 'Kehadiran berhasil diperbarui' };
			}
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			throw error;
		}
	},

	savePresensiSettings: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id ?? null;
		if (!sekolahId) {
			return fail(401, { fail: 'Sekolah tidak ditemukan' });
		}

		if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
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
