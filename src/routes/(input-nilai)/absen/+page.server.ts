import db from '$lib/server/db';
import {
	tableAbsensi,
	tableKetidakhadiranHarian,
	tableKetidakhadiranRapor,
	tableMurid,
	tablePresensiSettings,
	tableKelas,
	tableSemester,
	tableTahunAjaran
} from '$lib/server/db/schema';
import { ensureAbsensiSchema } from '$lib/server/db/ensure-absensi';
import { ensureKetidakhadiranHarianSchema } from '$lib/server/db/ensure-ketidakhadiran-harian';
import { ensureKetidakhadiranRaporSchema } from '$lib/server/db/ensure-ketidakhadiran-rapor';
import { ensurePresensiSettingsSchema } from '$lib/server/db/ensure-presensi-settings';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

const PER_PAGE = 20;
const TABLE_MISSING_MESSAGE =
	'Tabel yang diperlukan belum tersedia. Jalankan "pnpm db:push" untuk menerapkan migrasi terbaru.';

function isTableMissingError(error: unknown) {
	return (
		error instanceof Error &&
		error.message.includes('no such table') &&
		(error.message.includes('ketidakhadiran_harian') ||
			error.message.includes('ketidakhadiran_rapor') ||
			error.message.includes('absensi'))
	);
}

function todayDateString() {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function isValidDate(s: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	const [y, m, d] = s.split('-').map(Number);
	const date = new Date(y, m - 1, d);
	return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function getDaysInMonth(year: number, month: number) {
	return new Date(year, month, 0).getDate();
}

function isSunday(year: number, month: number, day: number) {
	return new Date(year, month - 1, day).getDay() === 0;
}

function isSaturday(year: number, month: number, day: number) {
	return new Date(year, month - 1, day).getDay() === 6;
}

function dateStr(year: number, month: number, day: number) {
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

type StatusPerDay = '' | 'H' | 'S' | 'I' | 'TK';

type BulananRow = {
	no: number;
	nama: string;
	statusPerDay: StatusPerDay[];
	countS: number;
	countI: number;
	countTK: number;
	countHadir: number;
};

type RaporRow = {
	id: number;
	no: number;
	nama: string;
	hadir: number;
	sakit: number;
	izin: number;
	alfa: number;
	overridden: boolean;
};

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
	await ensureKetidakhadiranRaporSchema();

	const { kelasAktif, academicContext } = await parent();
	const sekolahId = locals.sekolah?.id ?? null;
	const kelasRecordTa =
		sekolahId && kelasAktif?.id
			? await db.query.tableKelas.findFirst({
					columns: { tahunAjaranId: true, semesterId: true },
					where: eq(tableKelas.id, kelasAktif.id)
				})
			: null;
	const tahunAjaranId = kelasRecordTa?.tahunAjaranId ?? null;

	// Presensi readiness check
	let presensiReady = true;
	let presensiWarningMessage = '';
	let presensiSettings: typeof tablePresensiSettings.$inferSelect | null = null;
	if (sekolahId && kelasAktif?.id && tahunAjaranId) {
		presensiSettings =
			(await db.query.tablePresensiSettings.findFirst({
				where: and(
					eq(tablePresensiSettings.sekolahId, sekolahId),
					eq(tablePresensiSettings.tahunAjaranId, tahunAjaranId)
				)
			})) ?? null;

		const activeTa = academicContext?.tahunAjaranList.find(
			(ta) => ta.id === academicContext?.activeTahunAjaranId
		);
		const activeSem = activeTa?.semester.find((s) => s.id === academicContext?.activeSemesterId);
		const tanggalMasuk = activeSem?.tanggalMasuk ?? null;
		const activeSemesterLabel = activeSem && activeTa ? `${activeSem.nama} (${activeTa.nama})` : '';

		const hasPresensiSettings = !!presensiSettings;
		const hasTanggalMasuk = !!tanggalMasuk;
		presensiReady = hasPresensiSettings && hasTanggalMasuk;

		if (!presensiReady) {
			const parts: string[] = [];
			if (!hasPresensiSettings) parts.push('melakukan pengaturan presensi');
			if (!hasTanggalMasuk) parts.push('menetapkan tanggal masuk semester ' + activeSemesterLabel);
			presensiWarningMessage = `Tidak dapat melakukan presensi sebelum ${parts.join(' dan ')}`;
		}
	} else {
		presensiReady = false;
		presensiWarningMessage =
			'Tidak dapat melakukan presensi karena pengaturan sekolah atau kelas belum lengkap.';
	}

	const searchParam = url.searchParams.get('q');
	const search = searchParam?.trim() ? searchParam.trim() : null;
	const requestedPage = Number(url.searchParams.get('page')) || 1;
	const pageNumber =
		Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
	const tanggalParam = url.searchParams.get('tanggal');
	const tanggal = tanggalParam && isValidDate(tanggalParam) ? tanggalParam : todayDateString();

	const mode = url.searchParams.get('mode') ?? 'harian';
	const bulanParam = url.searchParams.get('bulan');
	const tahunParam = url.searchParams.get('tahun');
	const now = new Date();
	const bulan = bulanParam ? Number(bulanParam) : now.getMonth() + 1;
	const tahunQuery = tahunParam ? Number(tahunParam) : now.getFullYear();

	if (mode === 'bulanan') {
		const defaultBulanan = {
			tableReady: true,
			daftarMurid: [] as KehadiranRow[],
			page: {
				search,
				currentPage: 1,
				totalPages: 1,
				totalItems: 0,
				perPage: PER_PAGE
			} as PageState,
			totalMurid: 0,
			muridCount: 0,
			tanggal,
			mode: 'bulanan' as const,
			bulan,
			tahun: tahunQuery,
			daysInMonth: 0,
			bulananRows: [] as BulananRow[],
			redDays: [] as number[],
			presensiReady,
			presensiWarningMessage
		};

		if (!sekolahId || !kelasAktif?.id) return defaultBulanan;

		if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) return defaultBulanan;
		if (!Number.isInteger(tahunQuery) || tahunQuery < 2000 || tahunQuery > 2099)
			return defaultBulanan;

		const [{ totalItems }] = await db
			.select({ totalItems: sql<number>`count(*)` })
			.from(tableMurid)
			.where(
				search
					? and(
							eq(tableMurid.sekolahId, sekolahId),
							eq(tableMurid.kelasId, kelasAktif.id),
							sql`${tableMurid.nama} LIKE ${'%' + search + '%'} COLLATE NOCASE`
						)
					: and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, kelasAktif.id))
			);

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

		const [{ muridCount }] = await db
			.select({ muridCount: sql<number>`count(*)` })
			.from(tableMurid)
			.where(and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, kelasAktif.id)));

		const daysInMonth = getDaysInMonth(tahunQuery, bulan);
		const monthStart = `${tahunQuery}-${String(bulan).padStart(2, '0')}-01`;
		const monthEnd = `${tahunQuery}-${String(bulan).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

		const baseFilter = and(
			eq(tableMurid.sekolahId, sekolahId),
			eq(tableMurid.kelasId, kelasAktif.id)
		);
		const searchFilter = search
			? and(baseFilter, sql`${tableMurid.nama} LIKE ${'%' + search + '%'} COLLATE NOCASE`)
			: baseFilter;

		const semuaMurid = await db.query.tableMurid.findMany({
			columns: { id: true, nama: true },
			where: searchFilter,
			orderBy: asc(tableMurid.nama),
			limit: PER_PAGE,
			offset
		});

		const muridIds = semuaMurid.map((m) => m.id);

		// Reuse presensiSettings from readiness check above
		const hariSekolah = presensiSettings?.hariSekolah ?? 6;

		// Build libur date set
		const liburDates = new Set<string>();
		if (presensiSettings?.liburNasional) {
			try {
				const parsed: string[] = JSON.parse(presensiSettings.liburNasional);
				if (Array.isArray(parsed)) {
					for (const d of parsed) {
						if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
							const [y, m] = d.split('-').map(Number);
							if (y === tahunQuery && m === bulan) {
								liburDates.add(d);
							}
						}
					}
				}
			} catch {
				/* ignore */
			}
		}
		if (presensiSettings?.liburSemester) {
			try {
				const parsed: Array<{ start: string; end: string }> = JSON.parse(
					presensiSettings.liburSemester
				);
				if (Array.isArray(parsed)) {
					for (const range of parsed) {
						if (
							range?.start &&
							range?.end &&
							/^\d{4}-\d{2}-\d{2}$/.test(range.start) &&
							/^\d{4}-\d{2}-\d{2}$/.test(range.end)
						) {
							const s = new Date(range.start + 'T00:00:00');
							const e = new Date(range.end + 'T00:00:00');
							const cur = new Date(s);
							while (cur <= e) {
								const y = cur.getFullYear();
								const m = cur.getMonth() + 1;
								const day = cur.getDate();
								const tgl = dateStr(y, m, day);
								if (y === tahunQuery && m === bulan && !liburDates.has(tgl)) {
									liburDates.add(tgl);
								}
								cur.setDate(cur.getDate() + 1);
							}
						}
					}
				}
			} catch {
				/* ignore */
			}
		}

		// Compute red days (weekends + holidays)
		const redDays: number[] = [];
		for (let d = 1; d <= daysInMonth; d++) {
			const isWeekend =
				hariSekolah === 5
					? isSaturday(tahunQuery, bulan, d) || isSunday(tahunQuery, bulan, d)
					: isSunday(tahunQuery, bulan, d);
			const tgl = dateStr(tahunQuery, bulan, d);
			if (isWeekend || liburDates.has(tgl)) {
				redDays.push(d);
			}
		}

		// Fetch ketidakhadiran and absensi for the month
		const allKetidakhadiran = await db.query.tableKetidakhadiranHarian.findMany({
			columns: { muridId: true, tanggal: true, keterangan: true },
			where: and(
				inArray(tableKetidakhadiranHarian.muridId, muridIds),
				sql`${tableKetidakhadiranHarian.tanggal} >= ${monthStart}`,
				sql`${tableKetidakhadiranHarian.tanggal} <= ${monthEnd}`
			)
		});

		const khMap = new Map<string, string | null>();
		for (const kh of allKetidakhadiran) {
			khMap.set(`${kh.muridId}:${kh.tanggal}`, kh.keterangan);
		}

		const monthStartISO = `${monthStart}T00:00:00.000Z`;
		const monthEndISO = `${monthEnd}T23:59:59.999Z`;

		const allAbsensi = await db.query.tableAbsensi.findMany({
			columns: { muridId: true, waktu: true },
			where: and(
				inArray(tableAbsensi.muridId, muridIds),
				sql`${tableAbsensi.waktu} >= ${monthStartISO}`,
				sql`${tableAbsensi.waktu} <= ${monthEndISO}`
			)
		});

		const absensiSet = new Set<string>();
		for (const a of allAbsensi) {
			absensiSet.add(`${a.muridId}:${a.waktu.slice(0, 10)}`);
		}

		function getStatus(muridId: number, day: number): StatusPerDay {
			const tgl = dateStr(tahunQuery, bulan, day);
			const keterangan = khMap.get(`${muridId}:${tgl}`);
			if (keterangan !== undefined) {
				if (keterangan === null) return 'H';
				if (keterangan === 'sakit') return 'S';
				if (keterangan === 'izin') return 'I';
				if (keterangan === 'alfa') return 'TK';
				return 'TK';
			}
			if (absensiSet.has(`${muridId}:${tgl}`)) return 'H';
			return '';
		}

		const bulananRows: BulananRow[] = semuaMurid.map((murid, index) => {
			let countS = 0;
			let countI = 0;
			let countTK = 0;
			let countHadir = 0;
			const statusPerDay: StatusPerDay[] = [];

			for (let d = 1; d <= daysInMonth; d++) {
				const status = getStatus(murid.id, d);
				statusPerDay.push(status);
				if (!redDays.includes(d)) {
					if (status === 'S') countS++;
					else if (status === 'I') countI++;
					else if (status === 'TK') countTK++;
					else if (status === 'H') countHadir++;
				}
			}

			return {
				no: index + 1,
				nama: murid.nama,
				statusPerDay,
				countS,
				countI,
				countTK,
				countHadir
			};
		});

		return {
			meta: { title: 'Kehadiran Murid' } satisfies PageMeta,
			tableReady: true,
			page: {
				search,
				currentPage,
				totalPages,
				totalItems: total,
				perPage: PER_PAGE
			} satisfies PageState,
			daftarMurid: [],
			semuaMurid: [],
			totalMurid: total,
			muridCount,
			tanggal,
			mode: 'bulanan' as const,
			bulan,
			tahun: tahunQuery,
			daysInMonth,
			bulananRows,
			redDays,
			presensiReady,
			presensiWarningMessage
		};
	}

	if (mode === 'rapor') {
		const defaultRapor = {
			tableReady: true,
			daftarMurid: [] as KehadiranRow[],
			page: {
				search,
				currentPage: 1,
				totalPages: 1,
				totalItems: 0,
				perPage: PER_PAGE
			} as PageState,
			totalMurid: 0,
			muridCount: 0,
			tanggal,
			mode: 'rapor' as const,
			bulan: 0,
			tahun: 0,
			daysInMonth: 0,
			bulananRows: [] as BulananRow[],
			raporRows: [] as RaporRow[],
			redDays: [] as number[],
			tanggalMulaiRapor: '',
			tanggalAkhirRapor: '',
			presensiReady,
			presensiWarningMessage
		};

		if (!sekolahId || !kelasAktif?.id) return defaultRapor;

		const activeTa = academicContext?.tahunAjaranList.find(
			(ta) => ta.id === academicContext?.activeTahunAjaranId
		);
		const activeSem = activeTa?.semester.find((s) => s.id === academicContext?.activeSemesterId);
		const tanggalMulaiRapor = activeSem?.tanggalMasuk ?? null;
		const tanggalAkhirRapor = activeSem?.tanggalBagiRaport ?? null;
		const semesterId = academicContext?.activeSemesterId;

		if (!tanggalMulaiRapor || !tanggalAkhirRapor || !semesterId) {
			return {
				...defaultRapor,
				presensiReady: false,
				presensiWarningMessage:
					'Tidak dapat menampilkan rekap rapor. Atur tanggal masuk semester dan tanggal bagi rapor di halaman /akademik.'
			};
		}

		if (!isValidDate(tanggalMulaiRapor) || !isValidDate(tanggalAkhirRapor)) {
			return {
				...defaultRapor,
				presensiReady: false,
				presensiWarningMessage: 'Format tanggal masuk atau tanggal bagi rapor tidak valid.'
			};
		}

		const [{ totalItems }] = await db
			.select({ totalItems: sql<number>`count(*)` })
			.from(tableMurid)
			.where(
				search
					? and(
							eq(tableMurid.sekolahId, sekolahId),
							eq(tableMurid.kelasId, kelasAktif.id),
							sql`${tableMurid.nama} LIKE ${'%' + search + '%'} COLLATE NOCASE`
						)
					: and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, kelasAktif.id))
			);

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

		const [{ muridCount }] = await db
			.select({ muridCount: sql<number>`count(*)` })
			.from(tableMurid)
			.where(and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, kelasAktif.id)));

		const baseFilter = and(
			eq(tableMurid.sekolahId, sekolahId),
			eq(tableMurid.kelasId, kelasAktif.id)
		);
		const searchFilter = search
			? and(baseFilter, sql`${tableMurid.nama} LIKE ${'%' + search + '%'} COLLATE NOCASE`)
			: baseFilter;

		const semuaMurid = await db.query.tableMurid.findMany({
			columns: { id: true, nama: true },
			where: searchFilter,
			orderBy: asc(tableMurid.nama),
			limit: PER_PAGE,
			offset
		});

		const muridIds = semuaMurid.map((m) => m.id);
		if (muridIds.length === 0) {
			return {
				...defaultRapor,
				page: { search, currentPage, totalPages, totalItems: total, perPage: PER_PAGE },
				totalMurid: total,
				muridCount,
				tanggalMulaiRapor,
				tanggalAkhirRapor
			};
		}

		const hariSekolah = presensiSettings?.hariSekolah ?? 6;

		// Build libur date set for the full range
		const liburDates = new Set<string>();
		const rangeStartDate = new Date(tanggalMulaiRapor + 'T00:00:00');
		const rangeEndDate = new Date(tanggalAkhirRapor + 'T00:00:00');

		if (presensiSettings?.liburNasional) {
			try {
				const parsed: string[] = JSON.parse(presensiSettings.liburNasional);
				if (Array.isArray(parsed)) {
					for (const d of parsed) {
						if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d >= tanggalMulaiRapor && d <= tanggalAkhirRapor) {
							liburDates.add(d);
						}
					}
				}
			} catch {
				/* ignore */
			}
		}
		if (presensiSettings?.liburSemester) {
			try {
				const parsed: Array<{ start: string; end: string }> = JSON.parse(
					presensiSettings.liburSemester
				);
				if (Array.isArray(parsed)) {
					for (const range of parsed) {
						if (
							range?.start &&
							range?.end &&
							/^\d{4}-\d{2}-\d{2}$/.test(range.start) &&
							/^\d{4}-\d{2}-\d{2}$/.test(range.end)
						) {
							const s = new Date(range.start + 'T00:00:00');
							const e = new Date(range.end + 'T00:00:00');
							const c = new Date(Math.max(s.getTime(), rangeStartDate.getTime()));
							const rangeEnd = new Date(Math.min(e.getTime(), rangeEndDate.getTime()));
							while (c <= rangeEnd) {
								const tgl = dateStr(c.getFullYear(), c.getMonth() + 1, c.getDate());
								if (!liburDates.has(tgl)) {
									liburDates.add(tgl);
								}
								c.setDate(c.getDate() + 1);
							}
						}
					}
				}
			} catch {
				/* ignore */
			}
		}

		// Generate all dates in range and compute red days
		const allDates: string[] = [];
		const redDaySet = new Set<string>();
		const cur = new Date(rangeStartDate);
		while (cur <= rangeEndDate) {
			const y = cur.getFullYear();
			const m = cur.getMonth() + 1;
			const d = cur.getDate();
			const tgl = dateStr(y, m, d);
			allDates.push(tgl);

			const isWeekend =
				hariSekolah === 5 ? isSaturday(y, m, d) || isSunday(y, m, d) : isSunday(y, m, d);

			if (isWeekend || liburDates.has(tgl)) {
				redDaySet.add(tgl);
			}

			cur.setDate(cur.getDate() + 1);
		}

		// Fetch ketidakhadiran records for the range
		const allKetidakhadiran = await db.query.tableKetidakhadiranHarian.findMany({
			columns: { muridId: true, tanggal: true, keterangan: true },
			where: and(
				inArray(tableKetidakhadiranHarian.muridId, muridIds),
				sql`${tableKetidakhadiranHarian.tanggal} >= ${tanggalMulaiRapor}`,
				sql`${tableKetidakhadiranHarian.tanggal} <= ${tanggalAkhirRapor}`
			)
		});

		const khMap = new Map<string, string | null>();
		for (const kh of allKetidakhadiran) {
			khMap.set(`${kh.muridId}:${kh.tanggal}`, kh.keterangan);
		}

		// Fetch absensi records for the range
		const rangeStartISO = `${tanggalMulaiRapor}T00:00:00.000Z`;
		const rangeEndISO = `${tanggalAkhirRapor}T23:59:59.999Z`;

		const allAbsensi = await db.query.tableAbsensi.findMany({
			columns: { muridId: true, waktu: true },
			where: and(
				inArray(tableAbsensi.muridId, muridIds),
				sql`${tableAbsensi.waktu} >= ${rangeStartISO}`,
				sql`${tableAbsensi.waktu} <= ${rangeEndISO}`
			)
		});

		const absensiSet = new Set<string>();
		for (const a of allAbsensi) {
			absensiSet.add(`${a.muridId}:${a.waktu.slice(0, 10)}`);
		}

		// Fetch override records
		const allOverrides = await db.query.tableKetidakhadiranRapor.findMany({
			columns: { muridId: true, sakit: true, izin: true, alfa: true },
			where: and(
				inArray(tableKetidakhadiranRapor.muridId, muridIds),
				eq(tableKetidakhadiranRapor.semesterId, semesterId)
			)
		});

		const overrideMap = new Map<
			number,
			{ sakit: number | null; izin: number | null; alfa: number | null }
		>();
		for (const o of allOverrides) {
			overrideMap.set(o.muridId, { sakit: o.sakit, izin: o.izin, alfa: o.alfa });
		}

		// Compute rapor rows
		const raporRows: RaporRow[] = semuaMurid.map((murid, index) => {
			let hadir = 0;
			let sakit = 0;
			let izin = 0;
			let alfa = 0;

			for (const tgl of allDates) {
				if (redDaySet.has(tgl)) continue;

				const keterangan = khMap.get(`${murid.id}:${tgl}`);
				if (keterangan !== undefined) {
					if (keterangan === null) hadir++;
					else if (keterangan === 'sakit') sakit++;
					else if (keterangan === 'izin') izin++;
					else if (keterangan === 'alfa') alfa++;
					else alfa++; // fallback unknown
				} else if (absensiSet.has(`${murid.id}:${tgl}`)) {
					hadir++;
				} else {
					alfa++; // fallback: no data = alfa
				}
			}

			const override = overrideMap.get(murid.id);
			const overridden = !!override;

			return {
				id: murid.id,
				no: index + 1,
				nama: murid.nama,
				hadir,
				sakit: override?.sakit ?? sakit,
				izin: override?.izin ?? izin,
				alfa: override?.alfa ?? alfa,
				overridden
			};
		});

		return {
			meta: { title: 'Kehadiran Murid' } satisfies PageMeta,
			tableReady: true,
			page: {
				search,
				currentPage,
				totalPages,
				totalItems: total,
				perPage: PER_PAGE
			} satisfies PageState,
			daftarMurid: [],
			semuaMurid: [],
			totalMurid: total,
			muridCount,
			tanggal,
			mode: 'rapor' as const,
			bulan: 0,
			tahun: 0,
			daysInMonth: 0,
			bulananRows: [] as BulananRow[],
			raporRows,
			redDays: [] as number[],
			tanggalMulaiRapor,
			tanggalAkhirRapor,
			presensiReady,
			presensiWarningMessage
		};
	}

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
			tanggal,
			mode: 'harian' as const,
			bulan: 0,
			tahun: 0,
			daysInMonth: 0,
			bulananRows: [] as BulananRow[],
			raporRows: [] as RaporRow[],
			redDays: [] as number[],
			tanggalMulaiRapor: '',
			tanggalAkhirRapor: '',
			presensiReady,
			presensiWarningMessage
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

	const todayStart = new Date(tanggal + 'T00:00:00');
	const todayEnd = new Date(tanggal + 'T23:59:59.999');

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
		tanggal,
		mode: 'harian' as const,
		bulan: 0,
		tahun: 0,
		daysInMonth: 0,
		bulananRows: [] as BulananRow[],
		raporRows: [] as RaporRow[],
		redDays: [] as number[],
		tanggalMulaiRapor: '',
		tanggalAkhirRapor: '',
		presensiReady,
		presensiWarningMessage
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
		const tanggalRaw = formData.get('tanggal')?.toString() ?? '';
		const tanggal = isValidDate(tanggalRaw) ? tanggalRaw : todayDateString();
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
					tanggal,
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

		return { message: 'Ketidakhadiran berhasil diperbarui' };
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
		const tanggalRaw = formData.get('tanggal')?.toString() ?? '';
		const tanggal = isValidDate(tanggalRaw) ? tanggalRaw : todayDateString();
		const mode = formData.get('mode')?.toString();

		if (!mode || !['hadir_semua', 'selected'].includes(mode)) {
			return fail(400, { fail: 'Mode tidak valid' });
		}

		const kelasIdRaw = formData.get('kelasId')?.toString();
		const kelasId = kelasIdRaw ? Number(kelasIdRaw) : null;
		if (!kelasId || !Number.isInteger(kelasId)) {
			return fail(400, { fail: 'Kelas tidak ditemukan' });
		}

		const now = new Date().toISOString();
		const todayStart = new Date(tanggal + 'T00:00:00');
		const todayEnd = new Date(tanggal + 'T23:59:59.999');
		const absensiWaktu = tanggal === todayDateString() ? now : todayStart.toISOString();

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
						await db.insert(tableAbsensi).values({ muridId: murid.id, waktu: absensiWaktu });
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

	deletePresensi: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id ?? null;
		if (!sekolahId) {
			return fail(401, { fail: 'Sekolah tidak ditemukan' });
		}

		if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
			return fail(403, { fail: 'Anda tidak memiliki izin untuk menghapus data presensi' });
		}

		const formData = await request.formData();
		const tanggalRaw = formData.get('tanggal')?.toString() ?? '';
		const tanggal = isValidDate(tanggalRaw) ? tanggalRaw : todayDateString();
		const kelasIdRaw = formData.get('kelasId')?.toString();
		const kelasId = kelasIdRaw ? Number(kelasIdRaw) : null;
		if (!kelasId || !Number.isInteger(kelasId)) {
			return fail(400, { fail: 'Kelas tidak ditemukan' });
		}

		const muridIds = await db
			.select({ id: tableMurid.id })
			.from(tableMurid)
			.where(and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, kelasId)));

		const ids = muridIds.map((m) => m.id);
		if (ids.length === 0) {
			return { message: 'Tidak ada data presensi untuk tanggal ini' };
		}

		const todayStart = new Date(tanggal + 'T00:00:00');
		const todayEnd = new Date(tanggal + 'T23:59:59.999');

		try {
			await db.transaction(async (tx) => {
				await tx
					.delete(tableAbsensi)
					.where(
						and(
							inArray(tableAbsensi.muridId, ids),
							sql`${tableAbsensi.waktu} >= ${todayStart.toISOString()}`,
							sql`${tableAbsensi.waktu} <= ${todayEnd.toISOString()}`
						)
					);

				await tx
					.delete(tableKetidakhadiranHarian)
					.where(
						and(
							inArray(tableKetidakhadiranHarian.muridId, ids),
							eq(tableKetidakhadiranHarian.tanggal, tanggal)
						)
					);
			});
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			throw error;
		}

		return { message: 'Semua data presensi berhasil dihapus' };
	},

	updateRapor: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id ?? null;
		if (!sekolahId) {
			return fail(401, { fail: 'Sekolah tidak ditemukan' });
		}

		if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
			return fail(403, { fail: 'Anda tidak memiliki izin untuk mengubah data kehadiran' });
		}

		const activeTa = await db.query.tableTahunAjaran.findFirst({
			where: and(eq(tableTahunAjaran.sekolahId, sekolahId), eq(tableTahunAjaran.isAktif, true))
		});
		if (!activeTa) return fail(400, { fail: 'Tahun ajaran aktif tidak ditemukan' });

		const activeSemester = await db.query.tableSemester.findFirst({
			where: and(eq(tableSemester.tahunAjaranId, activeTa.id), eq(tableSemester.isAktif, true))
		});
		if (!activeSemester) return fail(400, { fail: 'Semester aktif tidak ditemukan' });

		const semesterId = activeSemester.id;

		const formData = await request.formData();
		const muridIdRaw = formData.get('muridId');

		if (!muridIdRaw) {
			return fail(400, { fail: 'Murid tidak ditemukan' });
		}

		const muridId = Number(muridIdRaw);
		if (!Number.isInteger(muridId) || muridId <= 0) {
			return fail(400, { fail: 'ID murid tidak valid' });
		}

		const sakitRaw = formData.get('sakit')?.toString().trim() ?? '';
		const izinRaw = formData.get('izin')?.toString().trim() ?? '';
		const alfaRaw = formData.get('alfa')?.toString().trim() ?? '';

		const sakit = sakitRaw ? Number(sakitRaw) : null;
		const izin = izinRaw ? Number(izinRaw) : null;
		const alfa = alfaRaw ? Number(alfaRaw) : null;

		if (
			(sakit !== null && (!Number.isInteger(sakit) || sakit < 0)) ||
			(izin !== null && (!Number.isInteger(izin) || izin < 0)) ||
			(alfa !== null && (!Number.isInteger(alfa) || alfa < 0))
		) {
			return fail(400, { fail: 'Nilai tidak valid' });
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
				.insert(tableKetidakhadiranRapor)
				.values({
					muridId,
					semesterId,
					sakit,
					izin,
					alfa
				})
				.onConflictDoUpdate({
					target: [tableKetidakhadiranRapor.muridId, tableKetidakhadiranRapor.semesterId],
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

		return { message: 'Data kehadiran rapor berhasil diperbarui' };
	},

	resetRapor: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id ?? null;
		if (!sekolahId) {
			return fail(401, { fail: 'Sekolah tidak ditemukan' });
		}

		if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
			return fail(403, { fail: 'Anda tidak memiliki izin untuk mengubah data kehadiran' });
		}

		const activeTa = await db.query.tableTahunAjaran.findFirst({
			where: and(eq(tableTahunAjaran.sekolahId, sekolahId), eq(tableTahunAjaran.isAktif, true))
		});
		if (!activeTa) return fail(400, { fail: 'Tahun ajaran aktif tidak ditemukan' });

		const activeSemester = await db.query.tableSemester.findFirst({
			where: and(eq(tableSemester.tahunAjaranId, activeTa.id), eq(tableSemester.isAktif, true))
		});
		if (!activeSemester) return fail(400, { fail: 'Semester aktif tidak ditemukan' });

		const semesterId = activeSemester.id;

		const formData = await request.formData();
		const muridIdRaw = formData.get('muridId');

		if (!muridIdRaw) {
			return fail(400, { fail: 'Murid tidak ditemukan' });
		}

		const muridId = Number(muridIdRaw);
		if (!Number.isInteger(muridId) || muridId <= 0) {
			return fail(400, { fail: 'ID murid tidak valid' });
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
				.delete(tableKetidakhadiranRapor)
				.where(
					and(
						eq(tableKetidakhadiranRapor.muridId, muridId),
						eq(tableKetidakhadiranRapor.semesterId, semesterId)
					)
				);
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			throw error;
		}

		return { message: 'Data kehadiran rapor berhasil direset' };
	}
};
