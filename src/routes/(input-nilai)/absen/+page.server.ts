import db from '$lib/server/db';
import {
	tableAbsensi,
	tableAuthUserMataPelajaran,
	tableBellSettings,
	tableJadwalPelajaran,
	tableKegiatanCustom,
	tableKetidakhadiranHarian,
	tableKetidakhadiranRapor,
	tableMataPelajaran,
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
import {
	simWriteAbsensi,
	simWriteKetidakhadiran,
	simGetAbsensi,
	simGetKetidakhadiran,
	simClear
} from '$lib/server/simulasi-cache';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

const PER_PAGE = 20;
const TABLE_MISSING_MESSAGE =
	'Tabel yang diperlukan belum tersedia. Jalankan "pnpm db:push" untuk menerapkan migrasi terbaru.';

async function canUserEditAbsen(
	user: NonNullable<App.Locals['user']>,
	sekolahId: number
): Promise<boolean> {
	if (user.type === 'admin' || user.type === 'wali_kelas') return true;
	if (user.type === 'wali_asuh') return false;
	if (user.type === 'user') return false;
	return false;
}

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

type PersentaseBulananRow = {
	no: number;
	nama: string;
	persentase: number;
};

type PersentaseHarianSubject = {
	kodeKegiatan: string;
	label: string;
};

type PersentaseHarianRow = {
	no: number;
	muridId: number;
	nama: string;
	subjects: Record<string, string>;
	sessionStatuses: Record<string, { masuk: string; selesai: string }>;
	persentase: number;
};

type JadwalSaatIni = {
	mataPelajaranId: number | null;
	namaMataPelajaran: string;
	jamKe: number;
	perkiraanJam: string;
};

type PageState = {
	search: string | null;
	currentPage: number;
	totalPages: number;
	totalItems: number;
	perPage: number;
};

import {
	computeJamKeFromTime,
	type BellSettingsData,
	type CustomKegiatanData
} from '$lib/server/absen-utils';

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
	let bellSettings: BellSettingsData | null = null;
	let kegiatanCustom: CustomKegiatanData[] = [];
	if (sekolahId && kelasAktif?.id && tahunAjaranId) {
		presensiSettings =
			(await db.query.tablePresensiSettings.findFirst({
				where: and(
					eq(tablePresensiSettings.sekolahId, sekolahId),
					eq(tablePresensiSettings.tahunAjaranId, tahunAjaranId)
				)
			})) ?? null;

		bellSettings =
			(await db.query.tableBellSettings.findFirst({
				columns: {
					jamMulai: true,
					jamPelajaranMenit: true,
					durasiIstirahat: true,
					durasiUpacara: true
				},
				where: eq(tableBellSettings.sekolahId, sekolahId)
			})) ?? null;

		kegiatanCustom = await db.query.tableKegiatanCustom.findMany({
			columns: { kode: true, durasi: true },
			where: eq(tableKegiatanCustom.sekolahId, sekolahId)
		});

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

	const simHari = url.searchParams.get('simHari')?.toLowerCase() ?? null;
	const simJam = url.searchParams.get('simJam') ?? null;

	const explicitMode = url.searchParams.get('mode');
	const isGuruMapelForDefault =
		locals.user?.type === 'user' &&
		(!!locals.user.mataPelajaranId ||
			(locals.user.id
				? (
						await db.query.tableAuthUserMataPelajaran.findMany({
							columns: { id: true },
							where: eq(tableAuthUserMataPelajaran.authUserId, locals.user.id),
							limit: 1
						})
					).length > 0
				: false));
	const mode =
		explicitMode ??
		(isGuruMapelForDefault && presensiSettings?.jenisPresensi === 'tiap_mapel'
			? 'persentase_harian'
			: 'harian');
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
			totalHariBelajar: 0,
			bulananRows: [] as BulananRow[],
			persentaseBulananRows: [] as PersentaseBulananRow[],
			redDays: [] as number[],
			presensiReady,
			presensiWarningMessage,
			jenisPresensi: presensiSettings?.jenisPresensi ?? 'wali_kelas_saja',
			persentaseHarianSubjects: [] as PersentaseHarianSubject[],
			persentaseHarianRows: [] as PersentaseHarianRow[],
			jadwalSaatIni: null,
			simulasiHari: simHari ?? null,
			simulasiJam: simJam ?? null
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
		// In bulanan mode, only show global attendance (mataPelajaranId IS NULL)
		const allKetidakhadiran = await db.query.tableKetidakhadiranHarian.findMany({
			columns: { muridId: true, tanggal: true, keterangan: true },
			where: and(
				inArray(tableKetidakhadiranHarian.muridId, muridIds),
				sql`${tableKetidakhadiranHarian.tanggal} >= ${monthStart}`,
				sql`${tableKetidakhadiranHarian.tanggal} <= ${monthEnd}`,
				sql`${tableKetidakhadiranHarian.mataPelajaranId} IS NULL`
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
				sql`${tableAbsensi.waktu} <= ${monthEndISO}`,
				sql`${tableAbsensi.mataPelajaranId} IS NULL`
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
			totalHariBelajar: daysInMonth - redDays.length,
			bulananRows,
			persentaseBulananRows: [] as PersentaseBulananRow[],
			redDays,
			presensiReady,
			presensiWarningMessage,
			jenisPresensi: presensiSettings?.jenisPresensi ?? 'wali_kelas_saja',
			persentaseHarianSubjects: [] as PersentaseHarianSubject[],
			persentaseHarianRows: [] as PersentaseHarianRow[],
			jadwalSaatIni: null,
			simulasiHari: simHari,
			simulasiJam: simJam
		};
	}

	if (mode === 'persentase_bulanan') {
		const defaultPersentaseBulanan = {
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
			mode: 'persentase_bulanan' as const,
			bulan,
			tahun: tahunQuery,
			daysInMonth: 0,
			totalHariBelajar: 0,
			bulananRows: [] as BulananRow[],
			persentaseBulananRows: [] as PersentaseBulananRow[],
			redDays: [] as number[],
			presensiReady,
			presensiWarningMessage,
			jenisPresensi: presensiSettings?.jenisPresensi ?? 'wali_kelas_saja',
			persentaseHarianSubjects: [] as PersentaseHarianSubject[],
			persentaseHarianRows: [] as PersentaseHarianRow[],
			jadwalSaatIni: null,
			simulasiHari: simHari ?? null,
			simulasiJam: simJam ?? null
		};

		if (!sekolahId || !kelasAktif?.id) return defaultPersentaseBulanan;

		if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) return defaultPersentaseBulanan;
		if (!Number.isInteger(tahunQuery) || tahunQuery < 2000 || tahunQuery > 2099)
			return defaultPersentaseBulanan;

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

		const totalHariBelajar = daysInMonth - redDays.length;

		// Fetch ketidakhadiran and absensi for the month (global only)
		const allKetidakhadiran = await db.query.tableKetidakhadiranHarian.findMany({
			columns: { muridId: true, tanggal: true, keterangan: true },
			where: and(
				inArray(tableKetidakhadiranHarian.muridId, muridIds),
				sql`${tableKetidakhadiranHarian.tanggal} >= ${monthStart}`,
				sql`${tableKetidakhadiranHarian.tanggal} <= ${monthEnd}`,
				sql`${tableKetidakhadiranHarian.mataPelajaranId} IS NULL`
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
				sql`${tableAbsensi.waktu} <= ${monthEndISO}`,
				sql`${tableAbsensi.mataPelajaranId} IS NULL`
			)
		});

		const absensiSet = new Set<string>();
		for (const a of allAbsensi) {
			absensiSet.add(`${a.muridId}:${a.waktu.slice(0, 10)}`);
		}

		function isHadir(muridId: number, day: number): boolean {
			const tgl = dateStr(tahunQuery, bulan, day);
			const keterangan = khMap.get(`${muridId}:${tgl}`);
			if (keterangan !== undefined) return keterangan === null;
			if (absensiSet.has(`${muridId}:${tgl}`)) return true;
			return false;
		}

		const persentaseBulananRows: PersentaseBulananRow[] = semuaMurid.map((murid, index) => {
			let countHadir = 0;

			for (let d = 1; d <= daysInMonth; d++) {
				if (redDays.includes(d)) continue;
				if (isHadir(murid.id, d)) countHadir++;
			}

			const persentase =
				totalHariBelajar > 0 ? Math.round((countHadir / totalHariBelajar) * 100) : 0;

			return {
				no: index + 1,
				nama: murid.nama,
				persentase
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
			mode: 'persentase_bulanan' as const,
			bulan,
			tahun: tahunQuery,
			daysInMonth,
			totalHariBelajar,
			bulananRows: [] as BulananRow[],
			persentaseBulananRows,
			redDays,
			presensiReady,
			presensiWarningMessage,
			jenisPresensi: presensiSettings?.jenisPresensi ?? 'wali_kelas_saja',
			persentaseHarianSubjects: [] as PersentaseHarianSubject[],
			persentaseHarianRows: [] as PersentaseHarianRow[],
			jadwalSaatIni: null,
			simulasiHari: simHari,
			simulasiJam: simJam
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
			totalHariBelajar: 0,
			bulananRows: [] as BulananRow[],
			raporRows: [] as RaporRow[],
			persentaseBulananRows: [] as PersentaseBulananRow[],
			redDays: [],
			tanggalMulaiRapor: '',
			tanggalAkhirRapor: '',
			presensiReady,
			presensiWarningMessage,
			jenisPresensi: presensiSettings?.jenisPresensi ?? 'wali_kelas_saja',
			persentaseHarianSubjects: [] as PersentaseHarianSubject[],
			persentaseHarianRows: [] as PersentaseHarianRow[],
			jadwalSaatIni: null,
			simulasiHari: simHari,
			simulasiJam: simJam
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
		// In rapor mode, only show global attendance (mataPelajaranId IS NULL)
		const allKetidakhadiran = await db.query.tableKetidakhadiranHarian.findMany({
			columns: { muridId: true, tanggal: true, keterangan: true },
			where: and(
				inArray(tableKetidakhadiranHarian.muridId, muridIds),
				sql`${tableKetidakhadiranHarian.tanggal} >= ${tanggalMulaiRapor}`,
				sql`${tableKetidakhadiranHarian.tanggal} <= ${tanggalAkhirRapor}`,
				sql`${tableKetidakhadiranHarian.mataPelajaranId} IS NULL`
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
				sql`${tableAbsensi.waktu} <= ${rangeEndISO}`,
				sql`${tableAbsensi.mataPelajaranId} IS NULL`
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
			totalHariBelajar: 0,
			bulananRows: [] as BulananRow[],
			raporRows,
			persentaseBulananRows: [] as PersentaseBulananRow[],
			redDays: [] as number[],
			tanggalMulaiRapor,
			tanggalAkhirRapor,
			presensiReady,
			presensiWarningMessage,
			jenisPresensi: presensiSettings?.jenisPresensi ?? 'wali_kelas_saja',
			persentaseHarianSubjects: [] as PersentaseHarianSubject[],
			persentaseHarianRows: [] as PersentaseHarianRow[],
			jadwalSaatIni: null,
			simulasiHari: simHari,
			simulasiJam: simJam
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
			mode: (mode === 'persentase_harian' ? 'persentase_harian' : 'harian') as
				| 'harian'
				| 'persentase_harian',
			bulan: 0,
			tahun: 0,
			daysInMonth: 0,
			totalHariBelajar: 0,
			bulananRows: [] as BulananRow[],
			raporRows: [] as RaporRow[],
			persentaseBulananRows: [] as PersentaseBulananRow[],
			redDays: [] as number[],
			tanggalMulaiRapor: '',
			tanggalAkhirRapor: '',
			presensiReady,
			presensiWarningMessage,
			jenisPresensi: 'wali_kelas_saja',
			persentaseHarianSubjects: [] as PersentaseHarianSubject[],
			persentaseHarianRows: [] as PersentaseHarianRow[],
			jadwalSaatIni: null,
			simulasiHari: simHari,
			simulasiJam: simJam
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
						mataPelajaranId: true,
						keterangan: true,
						createdAt: true,
						updatedAt: true
					},
					where: and(
						eq(tableKetidakhadiranHarian.tanggal, tanggal),
						sql`${tableKetidakhadiranHarian.mataPelajaranId} IS NULL`
					)
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

	// Merge simulation cache into rows (overrides DB data during simulation)
	if (simHari && simJam && sekolahId && kelasAktif?.id) {
		const cacheKetidakhadiran = simGetKetidakhadiran(
			sekolahId,
			kelasAktif.id,
			tanggal,
			simHari,
			simJam
		);
		const cacheAbsensi = simGetAbsensi(sekolahId, kelasAktif.id, tanggal, simHari, simJam);
		const cacheKhGlobal = new Map<number, { keterangan: string | null; updatedAt: string }>();
		const cacheAbsenGlobal = new Set<number>();
		for (const kh of cacheKetidakhadiran) {
			if (kh.mataPelajaranId == null) {
				cacheKhGlobal.set(kh.muridId, { keterangan: kh.keterangan, updatedAt: kh.updatedAt });
			}
		}
		for (const a of cacheAbsensi) {
			if (a.mataPelajaranId == null) {
				cacheAbsenGlobal.add(a.muridId);
			}
		}
		for (const row of rows) {
			const ckh = cacheKhGlobal.get(row.id);
			if (ckh) {
				row.keterangan = ckh.keterangan;
				row.hadir = ckh.keterangan === null && cacheAbsenGlobal.has(row.id);
				row.updatedAt = ckh.updatedAt;
			} else if (cacheAbsenGlobal.has(row.id)) {
				row.hadir = true;
				row.keterangan = null;
			}
		}
	}

	let semuaMurid: Array<{ id: number; nama: string; keterangan: string | null }> = [];
	if (tableReady) {
		try {
			const semuaMuridRecords = await db.query.tableMurid.findMany({
				columns: { id: true, nama: true },
				with: {
					ketidakhadiranHarian: {
						columns: { keterangan: true },
						where: and(
							eq(tableKetidakhadiranHarian.tanggal, tanggal),
							sql`${tableKetidakhadiranHarian.mataPelajaranId} IS NULL`
						),
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

	// Merge simulation cache into semuaMurid
	if (simHari && simJam && sekolahId && kelasAktif?.id) {
		const cacheKetidakhadiran = simGetKetidakhadiran(
			sekolahId,
			kelasAktif.id,
			tanggal,
			simHari,
			simJam
		);
		const cacheKhGlobal = new Map<number, string | null>();
		for (const kh of cacheKetidakhadiran) {
			if (kh.mataPelajaranId == null) {
				cacheKhGlobal.set(kh.muridId, kh.keterangan);
			}
		}
		for (const m of semuaMurid) {
			const ckh = cacheKhGlobal.get(m.id);
			if (ckh !== undefined) {
				m.keterangan = ckh;
			}
		}
	}

	const jenisPresensi = presensiSettings?.jenisPresensi ?? 'wali_kelas_saja';

	let persentaseHarianSubjects: PersentaseHarianSubject[] = [];
	let persentaseHarianRows: PersentaseHarianRow[] = [];
	let jadwalSaatIni: JadwalSaatIni | null = null;
	const tipePresensi = presensiSettings?.tipePresensi ?? 'awal_mapel';

	if (jenisPresensi === 'tiap_mapel' && tableReady && semuaMurid.length > 0) {
		const dayNames = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
		const todayHari = simHari ?? dayNames[new Date(tanggal + 'T00:00:00').getDay()];

		const jadwalHariIni = await db.query.tableJadwalPelajaran.findMany({
			columns: { kodeKegiatan: true, jamKe: true },
			where: and(
				eq(tableJadwalPelajaran.sekolahId, sekolahId),
				eq(tableJadwalPelajaran.kelasId, kelasAktif.id),
				eq(tableJadwalPelajaran.hari, todayHari)
			),
			orderBy: [asc(tableJadwalPelajaran.jamKe)]
		});

		const seen = new Set<string>();
		const uniqueJadwal: Array<{ kodeKegiatan: string }> = [];
		for (const j of jadwalHariIni) {
			if (!seen.has(j.kodeKegiatan)) {
				seen.add(j.kodeKegiatan);
				uniqueJadwal.push({ kodeKegiatan: j.kodeKegiatan });
			}
		}

		if (uniqueJadwal.length > 0) {
			const agamaMapelNames = [
				'Pendidikan Agama dan Budi Pekerti',
				'Pendidikan Agama Islam dan Budi Pekerti',
				'Pendidikan Agama Kristen dan Budi Pekerti',
				'Pendidikan Agama Katolik dan Budi Pekerti',
				'Pendidikan Agama Buddha dan Budi Pekerti',
				'Pendidikan Agama Hindu dan Budi Pekerti',
				'Pendidikan Agama Konghuchu dan Budi Pekerti'
			];
			const agamaNameSet = new Set(agamaMapelNames);
			const tambahanKode = new Set(['IST', 'PLG']);
			const uniqueKode = uniqueJadwal
				.map((j) => j.kodeKegiatan)
				.filter((k) => !tambahanKode.has(k.toUpperCase()));

			// Include UPB if scheduled for any class today (school-wide activity)
			if (!uniqueKode.includes('UPB')) {
				const upbAda = await db.query.tableJadwalPelajaran.findFirst({
					columns: { id: true },
					where: and(
						eq(tableJadwalPelajaran.sekolahId, sekolahId),
						eq(tableJadwalPelajaran.hari, todayHari),
						eq(tableJadwalPelajaran.kodeKegiatan, 'UPB')
					)
				});
				if (upbAda) {
					uniqueKode.unshift('UPB');
				}
			}

			if (uniqueKode.length === 0) {
				persentaseHarianSubjects = [];
				persentaseHarianRows = [];
				jadwalSaatIni = null;
			} else {
				const matchingMp = await db.query.tableMataPelajaran.findMany({
					columns: { id: true, kode: true, nama: true },
					where: and(
						eq(tableMataPelajaran.kelasId, kelasAktif.id),
						inArray(tableMataPelajaran.kode, uniqueKode)
					)
				});

				const kodeToMpMap = new Map<string, { id: number; nama: string }>();
				for (const mp of matchingMp) {
					if (mp.kode) kodeToMpMap.set(mp.kode, { id: mp.id, nama: mp.nama });
				}

				// Handle synthetic "PAPB" code: match any agama subject in this class
				if (uniqueKode.includes('PAPB') && !kodeToMpMap.has('PAPB')) {
					const agamaMp = await db.query.tableMataPelajaran.findMany({
						columns: { id: true, nama: true },
						where: and(
							eq(tableMataPelajaran.kelasId, kelasAktif.id),
							inArray(tableMataPelajaran.nama, agamaMapelNames)
						)
					});
					if (agamaMp.length > 0) {
						kodeToMpMap.set('PAPB', { id: agamaMp[0].id, nama: agamaMp[0].nama });
					}
				}

				persentaseHarianSubjects = uniqueKode.map((kode) => ({
					kodeKegiatan: kode,
					label: kode
				}));

				const allMuridIds = semuaMurid.map((m) => m.id);
				const todayStart = new Date(tanggal + 'T00:00:00');
				const todayEnd = new Date(tanggal + 'T23:59:59.999');

				const [allKetidakhadiran, allAbsensi] = await Promise.all([
					db.query.tableKetidakhadiranHarian.findMany({
						columns: { muridId: true, mataPelajaranId: true, keterangan: true },
						where: and(
							inArray(tableKetidakhadiranHarian.muridId, allMuridIds),
							eq(tableKetidakhadiranHarian.tanggal, tanggal)
						)
					}),
					db.query.tableAbsensi.findMany({
						columns: { muridId: true, mataPelajaranId: true },
						where: and(
							inArray(tableAbsensi.muridId, allMuridIds),
							sql`${tableAbsensi.waktu} >= ${todayStart.toISOString()}`,
							sql`${tableAbsensi.waktu} <= ${todayEnd.toISOString()}`
						)
					})
				]);

				const khGlobal = new Map<number, string | null>();
				const khPerMapel = new Map<string, string | null>();
				for (const kh of allKetidakhadiran) {
					if (kh.mataPelajaranId == null) {
						khGlobal.set(kh.muridId, kh.keterangan);
					} else {
						khPerMapel.set(`${kh.muridId}:${kh.mataPelajaranId}`, kh.keterangan);
					}
				}

				const absenGlobal = new Set<number>();
				const absenPerMapel = new Map<string, number>();
				for (const a of allAbsensi) {
					if (a.mataPelajaranId == null) {
						absenGlobal.add(a.muridId);
					} else {
						const key = `${a.muridId}:${a.mataPelajaranId}`;
						absenPerMapel.set(key, (absenPerMapel.get(key) ?? 0) + 1);
					}
				}

				// Merge simulation cache into persentase_harian maps
				if (simHari && simJam && sekolahId && kelasAktif?.id) {
					const cacheKetidakhadiran = simGetKetidakhadiran(
						sekolahId,
						kelasAktif.id,
						tanggal,
						simHari,
						simJam
					);
					const cacheAbsensi = simGetAbsensi(sekolahId, kelasAktif.id, tanggal, simHari, simJam);
					for (const kh of cacheKetidakhadiran) {
						if (kh.mataPelajaranId == null) {
							khGlobal.set(kh.muridId, kh.keterangan);
						} else {
							khPerMapel.set(`${kh.muridId}:${kh.mataPelajaranId}`, kh.keterangan);
						}
					}
					for (const a of cacheAbsensi) {
						if (a.mataPelajaranId == null) {
							absenGlobal.add(a.muridId);
						} else {
							const key = `${a.muridId}:${a.mataPelajaranId}`;
							absenPerMapel.set(key, (absenPerMapel.get(key) ?? 0) + 1);
						}
					}
				}

				// Guru mapel: build set of subject kodes the user owns (class-independent)
				let userKodeSet: Set<string> | null = null;
				if (locals.user?.type === 'user') {
					userKodeSet = new Set<string>();
					const userMpIds = new Set<number>();
					if (locals.user.mataPelajaranId) userMpIds.add(locals.user.mataPelajaranId);
					const additional = await db.query.tableAuthUserMataPelajaran.findMany({
						columns: { mataPelajaranId: true },
						where: eq(tableAuthUserMataPelajaran.authUserId, locals.user.id)
					});
					for (const a of additional) {
						if (a.mataPelajaranId) userMpIds.add(a.mataPelajaranId);
					}
					if (userMpIds.size > 0) {
						const userMps = await db.query.tableMataPelajaran.findMany({
							columns: { kode: true, nama: true },
							where: inArray(tableMataPelajaran.id, [...userMpIds])
						});
						for (const mp of userMps) {
							if (mp.kode) userKodeSet.add(mp.kode.toUpperCase());
							if (agamaNameSet.has(mp.nama)) userKodeSet.add('PAPB');
						}
					}
				}

				if (presensiSettings?.jamMasuk) {
					const currentJamKe = computeJamKeFromTime(
						simJam,
						jadwalHariIni,
						bellSettings,
						kegiatanCustom,
						presensiSettings.jamMasuk
					);
					const jadwalEntries = jadwalHariIni.filter((j) => j.jamKe === currentJamKe);
					for (const jadwalEntry of jadwalEntries) {
						const mpInfo = kodeToMpMap.get(jadwalEntry.kodeKegiatan);
						if (
							mpInfo &&
							(!userKodeSet || userKodeSet.has(jadwalEntry.kodeKegiatan.toUpperCase()))
						) {
							const jamMulai = bellSettings?.jamMulai ?? presensiSettings.jamMasuk;
							const jamPelajaranMenit = bellSettings?.jamPelajaranMenit ?? 45;
							const durasiIstirahat = bellSettings?.durasiIstirahat ?? 30;
							const durasiUpacara = bellSettings?.durasiUpacara ?? 40;
							const customDurasi = new Map<string, number>();
							for (const c of kegiatanCustom) {
								if (c.kode && c.durasi != null) customDurasi.set(c.kode.toUpperCase(), c.durasi);
							}

							const jamKeKode = new Map<number, string>();
							for (const j of jadwalHariIni) {
								if (!jamKeKode.has(j.jamKe)) jamKeKode.set(j.jamKe, j.kodeKegiatan.toUpperCase());
							}

							const [jh, jm] = jamMulai.split(':').map(Number);
							let startMin = jh * 60 + jm;
							for (let jk = 1; jk < currentJamKe; jk++) {
								const kode = jamKeKode.get(jk);
								let dur = jamPelajaranMenit;
								if (kode === 'UPB') dur = durasiUpacara;
								else if (kode === 'IST') dur = durasiIstirahat;
								else if (kode && customDurasi.has(kode)) dur = customDurasi.get(kode)!;
								startMin += dur;
							}
							const kode2 = jamKeKode.get(currentJamKe);
							let curDur = jamPelajaranMenit;
							if (kode2 === 'UPB') curDur = durasiUpacara;
							else if (kode2 === 'IST') curDur = durasiIstirahat;
							else if (kode2 && customDurasi.has(kode2)) curDur = customDurasi.get(kode2)!;
							const endMin = startMin + curDur;
							const fmt = (min: number) =>
								`${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
							jadwalSaatIni = {
								mataPelajaranId: mpInfo.id,
								namaMataPelajaran: agamaNameSet.has(mpInfo.nama)
									? 'Pendidikan Agama dan Budi Pekerti'
									: mpInfo.nama,
								jamKe: jadwalEntry.jamKe,
								perkiraanJam: `${fmt(startMin)}-${fmt(endMin)}`
							};
							break;
						}
					}
				}

				const totalSubjects = uniqueKode.length;
				const useHalfWeight = tipePresensi === 'awal_akhir_mapel';

				persentaseHarianRows = semuaMurid.map((murid, index) => {
					const subjectStatus: Record<string, string> = {};
					const sessionStatuses: Record<string, { masuk: string; selesai: string }> = {};
					let attendedPoints = 0;

					for (const kode of uniqueKode) {
						const mpInfo = kodeToMpMap.get(kode);
						const mpId = mpInfo?.id;
						let status = '';
						let masuk = '';
						let selesai = '';

						if (mpId != null) {
							const mapelKey = khPerMapel.get(`${murid.id}:${mpId}`);
							if (mapelKey !== undefined) {
								if (mapelKey === null) {
									status = 'H';
									attendedPoints++;
									masuk = 'H';
									selesai = 'H';
								} else if (mapelKey === 'sakit') {
									status = 'S';
									masuk = 'S';
									selesai = 'S';
								} else if (mapelKey === 'izin') {
									status = 'I';
									masuk = 'I';
									selesai = 'I';
								} else if (mapelKey === 'alfa') {
									status = 'TK';
									masuk = 'TK';
									selesai = 'TK';
								}
							}
						}

						if (!status) {
							const globalKeterangan = khGlobal.get(murid.id);
							if (globalKeterangan !== undefined) {
								if (globalKeterangan === null) {
									status = 'H';
									attendedPoints++;
									masuk = 'H';
									selesai = 'H';
								} else if (globalKeterangan === 'sakit') {
									status = 'S';
									masuk = 'S';
									selesai = 'S';
								} else if (globalKeterangan === 'izin') {
									status = 'I';
									masuk = 'I';
									selesai = 'I';
								} else if (globalKeterangan === 'alfa') {
									status = 'TK';
									masuk = 'TK';
									selesai = 'TK';
								}
							}
						}

						if (!status && mpId != null && absenPerMapel.has(`${murid.id}:${mpId}`)) {
							status = 'H';
							const count = absenPerMapel.get(`${murid.id}:${mpId}`)!;
							attendedPoints += useHalfWeight ? count * 0.5 : 1;
							masuk = 'H';
							if (count >= 2) selesai = 'H';
						}

						if (!status && absenGlobal.has(murid.id)) {
							status = 'H';
							attendedPoints++;
							masuk = 'H';
							selesai = 'H';
						}

						subjectStatus[kode] = status;
						sessionStatuses[kode] = { masuk, selesai };
					}

					const persentase =
						totalSubjects > 0 ? Math.round((attendedPoints / totalSubjects) * 100) : 0;

					return {
						no: index + 1,
						muridId: murid.id,
						nama: murid.nama,
						subjects: subjectStatus,
						sessionStatuses,
						persentase
					};
				});
			}
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
		mode: (mode === 'persentase_harian' ? 'persentase_harian' : 'harian') as
			| 'harian'
			| 'persentase_harian',
		bulan: 0,
		tahun: 0,
		daysInMonth: 0,
		totalHariBelajar: 0,
		bulananRows: [] as BulananRow[],
		raporRows: [] as RaporRow[],
		persentaseBulananRows: [] as PersentaseBulananRow[],
		redDays: [] as number[],
		tanggalMulaiRapor: '',
		tanggalAkhirRapor: '',
		presensiReady,
		presensiWarningMessage,
		jenisPresensi,
		tipePresensi,
		persentaseHarianSubjects,
		persentaseHarianRows,
		jadwalSaatIni,
		simulasiHari: simHari,
		simulasiJam: simJam
	};
}

export const actions = {
	update: async ({ request, locals, url }) => {
		const sekolahId = locals.sekolah?.id ?? null;
		if (!sekolahId) {
			return fail(401, { fail: 'Sekolah tidak ditemukan' });
		}

		if (!locals.user || !(await canUserEditAbsen(locals.user, sekolahId))) {
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

		const mataPelajaranIdRaw = formData.get('mataPelajaranId')?.toString();
		const mataPelajaranId = mataPelajaranIdRaw ? Number(mataPelajaranIdRaw) : null;

		const kelasIdRaw = formData.get('kelasId')?.toString();
		const kelasId = kelasIdRaw ? Number(kelasIdRaw) : null;

		const simHari = url.searchParams.get('simHari');
		const simJam = url.searchParams.get('simJam');

		const muridRecord = await db.query.tableMurid.findFirst({
			columns: { id: true },
			where: and(eq(tableMurid.id, muridId), eq(tableMurid.sekolahId, sekolahId))
		});

		if (!muridRecord) {
			return fail(404, { fail: 'Murid tidak ditemukan atau bukan bagian dari sekolah ini' });
		}

		if (simHari) {
			if (!kelasId) {
				return fail(400, { fail: 'Kelas tidak ditemukan' });
			}
			simWriteKetidakhadiran(
				sekolahId,
				kelasId,
				tanggal,
				muridId,
				keterangan,
				mataPelajaranId,
				simHari,
				simJam
			);
			return { message: 'Ketidakhadiran berhasil diperbarui (simulasi)' };
		}

		try {
			await db
				.insert(tableKetidakhadiranHarian)
				.values({
					muridId,
					tanggal,
					keterangan,
					mataPelajaranId
				})
				.onConflictDoUpdate({
					target: [
						tableKetidakhadiranHarian.muridId,
						tableKetidakhadiranHarian.tanggal,
						tableKetidakhadiranHarian.mataPelajaranId
					],
					set: {
						keterangan,
						mataPelajaranId,
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

		if (!locals.user) {
			return fail(403, { fail: 'Anda tidak memiliki izin untuk mengubah data kehadiran' });
		}
		const hasEditPermission = await canUserEditAbsen(locals.user, sekolahId);
		if (!hasEditPermission && locals.user.type !== 'user') {
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

		const mataPelajaranIdRaw = formData.get('mataPelajaranId')?.toString();
		const mataPelajaranId = mataPelajaranIdRaw ? Number(mataPelajaranIdRaw) : null;
		const simHari = formData.get('simHari')?.toString() ?? null;
		const simJam = formData.get('simJam')?.toString() ?? null;

		// Guru mapel only: validate schedule match + own subject
		if (locals.user?.type === 'user') {
			const settings = await db.query.tablePresensiSettings.findFirst({
				columns: { jenisPresensi: true, jamMasuk: true },
				where: eq(tablePresensiSettings.sekolahId, sekolahId)
			});
			if (settings?.jenisPresensi === 'tiap_mapel' && settings.jamMasuk) {
				const dayNames = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
				const dayN = simHari ? simHari.toLowerCase() : dayNames[new Date().getDay()];
				const [bellSettingsRaw, kegiatanCustom, jadwalHariIni] = await Promise.all([
					db.query.tableBellSettings.findFirst({
						columns: {
							jamMulai: true,
							jamPelajaranMenit: true,
							durasiIstirahat: true,
							durasiUpacara: true
						},
						where: eq(tableBellSettings.sekolahId, sekolahId)
					}),
					db.query.tableKegiatanCustom.findMany({
						columns: { kode: true, durasi: true },
						where: eq(tableKegiatanCustom.sekolahId, sekolahId)
					}),
					db.query.tableJadwalPelajaran.findMany({
						columns: { kodeKegiatan: true, jamKe: true },
						where: and(
							eq(tableJadwalPelajaran.sekolahId, sekolahId),
							eq(tableJadwalPelajaran.kelasId, kelasId),
							eq(tableJadwalPelajaran.hari, dayN)
						),
						orderBy: [asc(tableJadwalPelajaran.jamKe)]
					})
				]);
				const jamKe = computeJamKeFromTime(
					simJam,
					jadwalHariIni,
					bellSettingsRaw ?? null,
					kegiatanCustom,
					settings.jamMasuk
				);
				const jadwal = jadwalHariIni.find((j) => j.jamKe === jamKe);
				const tambahan = new Set(['IST', 'PLG']);
				if (!jadwal || tambahan.has(jadwal.kodeKegiatan.toUpperCase())) {
					return fail(403, { fail: 'Jam pelajaran bapak/ibu belum dimulai' });
				}
				// Verify the teacher owns this subject (by kode, not per-class ID)
				if (mataPelajaranId) {
					const agamaMapelNames = [
						'Pendidikan Agama dan Budi Pekerti',
						'Pendidikan Agama Islam dan Budi Pekerti',
						'Pendidikan Agama Kristen dan Budi Pekerti',
						'Pendidikan Agama Katolik dan Budi Pekerti',
						'Pendidikan Agama Buddha dan Budi Pekerti',
						'Pendidikan Agama Hindu dan Budi Pekerti',
						'Pendidikan Agama Konghuchu dan Budi Pekerti'
					];
					const agamaNameSet = new Set(agamaMapelNames);
					// Look up the kode and nama of the submitted mataPelajaranId
					const mpRecord = await db.query.tableMataPelajaran.findFirst({
						columns: { kode: true, nama: true },
						where: eq(tableMataPelajaran.id, mataPelajaranId)
					});
					// Build user's kode set from their assigned IDs (across all classes)
					const userKodeSet = new Set<string>();
					const userMpIds = new Set<number>();
					if (locals.user.mataPelajaranId) userMpIds.add(locals.user.mataPelajaranId);
					const additional = await db.query.tableAuthUserMataPelajaran.findMany({
						columns: { mataPelajaranId: true },
						where: eq(tableAuthUserMataPelajaran.authUserId, locals.user.id)
					});
					for (const a of additional) {
						if (a.mataPelajaranId) userMpIds.add(a.mataPelajaranId);
					}
					if (userMpIds.size > 0) {
						const userMps = await db.query.tableMataPelajaran.findMany({
							columns: { kode: true, nama: true },
							where: inArray(tableMataPelajaran.id, [...userMpIds])
						});
						for (const mp of userMps) {
							if (mp.kode) userKodeSet.add(mp.kode.toUpperCase());
							if (agamaNameSet.has(mp.nama)) userKodeSet.add('PAPB');
						}
					}
					const mpKode = mpRecord?.kode?.toUpperCase();
					const isAgama = mpRecord?.nama && agamaNameSet.has(mpRecord.nama);
					const allowed = mpKode
						? userKodeSet.has(mpKode)
						: isAgama
							? userKodeSet.has('PAPB')
							: false;
					if (!allowed) {
						return fail(403, {
							fail: 'Anda tidak memiliki izin untuk melakukan presensi pada mata pelajaran ini'
						});
					}
				}
			}
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
				if (simHari) {
					for (const murid of semuaMurid) {
						simWriteKetidakhadiran(
							sekolahId,
							kelasId,
							tanggal,
							murid.id,
							null,
							mataPelajaranId,
							simHari,
							simJam
						);
						simWriteAbsensi(
							sekolahId,
							kelasId,
							tanggal,
							murid.id,
							mataPelajaranId,
							simHari,
							simJam
						);
					}
					return { message: 'Semua murid ditandai hadir (simulasi)' };
				}
				for (const murid of semuaMurid) {
					await db
						.insert(tableKetidakhadiranHarian)
						.values({ muridId: murid.id, tanggal, keterangan: null, mataPelajaranId })
						.onConflictDoUpdate({
							target: [
								tableKetidakhadiranHarian.muridId,
								tableKetidakhadiranHarian.tanggal,
								tableKetidakhadiranHarian.mataPelajaranId
							],
							set: { keterangan: null, mataPelajaranId, updatedAt: now }
						});

					const existingAbsensi = await db.query.tableAbsensi.findFirst({
						columns: { id: true },
						where: and(
							eq(tableAbsensi.muridId, murid.id),
							mataPelajaranId != null
								? eq(tableAbsensi.mataPelajaranId, mataPelajaranId)
								: sql`${tableAbsensi.mataPelajaranId} IS NULL`,
							sql`${tableAbsensi.waktu} >= ${todayStart.toISOString()}`,
							sql`${tableAbsensi.waktu} <= ${todayEnd.toISOString()}`
						)
					});
					if (!existingAbsensi) {
						await db
							.insert(tableAbsensi)
							.values({ muridId: murid.id, waktu: absensiWaktu, mataPelajaranId });
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

				if (simHari) {
					for (const [muridId, keterangan] of entryMap) {
						simWriteKetidakhadiran(
							sekolahId,
							kelasId,
							tanggal,
							muridId,
							keterangan,
							mataPelajaranId,
							simHari,
							simJam
						);
					}
					return { message: 'Kehadiran berhasil diperbarui (simulasi)' };
				}

				const selectedIds = Array.from(entryMap.keys());
				if (selectedIds.length > 0) {
					const deleteAbsensiConditions = [
						inArray(tableAbsensi.muridId, selectedIds),
						sql`${tableAbsensi.waktu} >= ${todayStart.toISOString()}`,
						sql`${tableAbsensi.waktu} <= ${todayEnd.toISOString()}`
					];
					if (mataPelajaranId != null) {
						deleteAbsensiConditions.push(eq(tableAbsensi.mataPelajaranId, mataPelajaranId));
					}
					await db.delete(tableAbsensi).where(and(...deleteAbsensiConditions));
				}

				for (const [muridId, keterangan] of entryMap) {
					await db
						.insert(tableKetidakhadiranHarian)
						.values({ muridId, tanggal, keterangan, mataPelajaranId })
						.onConflictDoUpdate({
							target: [
								tableKetidakhadiranHarian.muridId,
								tableKetidakhadiranHarian.tanggal,
								tableKetidakhadiranHarian.mataPelajaranId
							],
							set: { keterangan, mataPelajaranId, updatedAt: now }
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

	deletePresensi: async ({ request, locals, url }) => {
		const sekolahId = locals.sekolah?.id ?? null;
		if (!sekolahId) {
			return fail(401, { fail: 'Sekolah tidak ditemukan' });
		}

		if (!locals.user || !(await canUserEditAbsen(locals.user, sekolahId))) {
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

		const simHari = url.searchParams.get('simHari');
		const simJam = url.searchParams.get('simJam');

		if (simHari) {
			simClear(sekolahId, kelasId, tanggal, simHari, simJam);
			return { message: 'Semua data presensi berhasil dihapus (simulasi)' };
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
							sql`${tableAbsensi.mataPelajaranId} IS NULL`,
							sql`${tableAbsensi.waktu} >= ${todayStart.toISOString()}`,
							sql`${tableAbsensi.waktu} <= ${todayEnd.toISOString()}`
						)
					);

				await tx
					.delete(tableKetidakhadiranHarian)
					.where(
						and(
							inArray(tableKetidakhadiranHarian.muridId, ids),
							sql`${tableKetidakhadiranHarian.mataPelajaranId} IS NULL`,
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
