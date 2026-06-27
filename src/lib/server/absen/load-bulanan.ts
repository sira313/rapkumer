import db from '$lib/server/db';
import { tableMurid, tableKetidakhadiranHarian, tableAbsensi } from '$lib/server/db/schema';
import { asc, eq, inArray, and, sql } from 'drizzle-orm';
import { getDaysInMonth, dateStr } from './utils';
import { computePagination, PER_PAGE } from './pagination';
import { buildLiburDates, buildRedDays } from './libur';
import type { BulananRow, StatusPerDay, AbsenLoadData } from './types';
import type { PresensiCheckResult } from './presensi';

export async function loadBulanan(params: {
	sekolahId: number;
	kelasId: number;
	search: string | null;
	pageNumber: number;
	bulan: number;
	tahun: number;
	presensiSettings: NonNullable<PresensiCheckResult['presensiSettings']>;
	simHari: string | null;
	simJam: string | null;
	url: URL;
}): Promise<AbsenLoadData> {
	const { sekolahId, kelasId, search, pageNumber, bulan, tahun, presensiSettings, simHari, simJam, url } = params;

	const baseFilter = and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, kelasId));
	const searchFilter = search
		? and(baseFilter, sql`${tableMurid.nama} LIKE ${'%' + search + '%'} COLLATE NOCASE`)
		: baseFilter;

	const pagination = await computePagination(db, tableMurid, searchFilter, pageNumber, url);

	const [{ muridCount }] = await db
		.select({ muridCount: sql<number>`count(*)` })
		.from(tableMurid)
		.where(baseFilter);

	const daysInMonth = getDaysInMonth(tahun, bulan);
	const monthStart = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
	const monthEnd = `${tahun}-${String(bulan).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

	const semuaMurid = await db.query.tableMurid.findMany({
		columns: { id: true, nama: true },
		where: searchFilter,
		orderBy: asc(tableMurid.nama),
		limit: PER_PAGE,
		offset: pagination.offset
	});

	const muridIds = semuaMurid.map((m) => m.id);
	const hariSekolah = presensiSettings.hariSekolah ?? 6;
	const liburDates = buildLiburDates(presensiSettings, tahun, bulan);
	const redDays = buildRedDays(hariSekolah, tahun, bulan, daysInMonth, liburDates);

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
		const tgl = dateStr(tahun, bulan, day);
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
		meta: { title: 'Kehadiran Murid' },
		tableReady: true,
		page: {
			search,
			currentPage: pagination.currentPage,
			totalPages: pagination.totalPages,
			totalItems: pagination.total,
			perPage: PER_PAGE
		},
		daftarMurid: [],
		semuaMurid: [],
		totalMurid: pagination.total,
		muridCount: muridCount ?? 0,
		tanggal: '',
		mode: 'bulanan',
		bulan,
		tahun,
		daysInMonth,
		totalHariBelajar: daysInMonth - redDays.length,
		bulananRows,
		raporRows: [],
		persentaseBulananRows: [],
		redDays,
		tanggalMulaiRapor: '',
		tanggalAkhirRapor: '',
		presensiReady: true,
		presensiWarningMessage: '',
		jenisPresensi: presensiSettings.jenisPresensi ?? 'wali_kelas_saja',
		tipePresensi: '',
		persentaseHarianSubjects: [],
		persentaseHarianRows: [],
		jadwalSaatIni: null,
		simulasiHari: simHari,
		simulasiJam: simJam
	};
}
