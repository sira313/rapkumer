import db from '$lib/server/db';
import {
	tableMurid,
	tableKetidakhadiranHarian,
	tableAbsensi,
	tableSemester
} from '$lib/server/db/schema';
import { asc, eq, inArray, and, sql } from 'drizzle-orm';
import { isValidDate } from './utils';
import { computePagination, PER_PAGE } from './pagination';
import { buildRangeLiburDates, buildRangeRedDays } from './libur';
import type { PersentaseSemesterRow, AbsenLoadData } from './types';
import type { PresensiCheckResult } from './presensi';

export async function loadPersentaseSemester(params: {
	sekolahId: number;
	kelasId: number;
	search: string | null;
	pageNumber: number;
	presensiSettings: NonNullable<PresensiCheckResult['presensiSettings']>;
	simHari: string | null;
	simJam: string | null;
	url: URL;
	academicContext: any;
	tahunAjaranId: number;
	semesterId: number;
}): Promise<AbsenLoadData> {
	const {
		sekolahId,
		kelasId,
		search,
		pageNumber,
		presensiSettings,
		simHari,
		simJam,
		url,
		academicContext,
		tahunAjaranId,
		semesterId
	} = params;

	const jenisPresensi = presensiSettings.jenisPresensi ?? 'wali_kelas_saja';
	const tipePresensi = presensiSettings.tipePresensi ?? '';
	const isWaliKelasMasukPulang =
		jenisPresensi === 'wali_kelas_saja' && tipePresensi === 'masuk_pulang';

	const defaultData = {
		meta: { title: 'Kehadiran Murid' } as const,
		tableReady: true,
		page: { search, currentPage: 1, totalPages: 1, totalItems: 0, perPage: PER_PAGE },
		daftarMurid: [],
		semuaMurid: [],
		totalMurid: 0,
		muridCount: 0,
		tanggal: '',
		mode: 'persentase_semester' as const,
		bulan: 0,
		tahun: 0,
		daysInMonth: 0,
		totalHariBelajar: 0,
		bulananRows: [],
		raporRows: [],
		persentaseBulananRows: [],
		persentaseSemesterRows: [] as PersentaseSemesterRow[],
		redDays: [],
		tanggalMulaiRapor: '',
		tanggalAkhirRapor: '',
		presensiReady: true,
		presensiWarningMessage: '',
		jenisPresensi,
		tipePresensi,
		persentaseHarianSubjects: [],
		persentaseHarianRows: [],
		jadwalSaatIni: null,
		simulasiHari: simHari,
		simulasiJam: simJam
	};

	const activeTa = academicContext?.tahunAjaranList.find((ta: any) => ta.id === tahunAjaranId);
	const activeSem = activeTa?.semester.find((s: any) => s.id === semesterId);
	let tanggalMulaiRapor = activeSem?.tanggalMasuk ?? activeSem?.tanggalMulai ?? null;
	let tanggalAkhirRapor = activeSem?.tanggalBagiRaport ?? activeSem?.tanggalSelesai ?? null;

	if (!tanggalMulaiRapor || !tanggalAkhirRapor) {
		const semesterDb = semesterId
			? await db.query.tableSemester.findFirst({
					where: eq(tableSemester.id, semesterId),
					columns: {
						tanggalMasuk: true,
						tanggalBagiRaport: true,
						tanggalMulai: true,
						tanggalSelesai: true
					}
				})
			: null;
		if (semesterDb) {
			tanggalMulaiRapor = semesterDb.tanggalMasuk ?? semesterDb.tanggalMulai ?? null;
			tanggalAkhirRapor = semesterDb.tanggalBagiRaport ?? semesterDb.tanggalSelesai ?? null;
		}
	}

	if (!tanggalMulaiRapor || !tanggalAkhirRapor) {
		return {
			...defaultData,
			presensiReady: false,
			presensiWarningMessage:
				'Tidak dapat menampilkan persentase semester. Atur tanggal masuk semester dan tanggal bagi rapor di halaman /akademik.'
		};
	}

	if (!isValidDate(tanggalMulaiRapor) || !isValidDate(tanggalAkhirRapor)) {
		return {
			...defaultData,
			presensiReady: false,
			presensiWarningMessage: 'Format tanggal masuk atau tanggal bagi rapor tidak valid.'
		};
	}

	const baseFilter = and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, kelasId));
	const searchFilter = search
		? and(baseFilter, sql`${tableMurid.nama} LIKE ${'%' + search + '%'} COLLATE NOCASE`)
		: baseFilter;

	const pagination = await computePagination(db, tableMurid, searchFilter, pageNumber, url);

	const [{ muridCount }] = await db
		.select({ muridCount: sql<number>`count(*)` })
		.from(tableMurid)
		.where(baseFilter);

	const semuaMurid = await db.query.tableMurid.findMany({
		columns: { id: true, nama: true },
		where: searchFilter,
		orderBy: asc(tableMurid.nama),
		limit: PER_PAGE,
		offset: pagination.offset
	});

	const muridIds = semuaMurid.map((m) => m.id);

	// Auto-extend: if configured dates don't cover actual data, expand range
	if (muridIds.length > 0) {
		const [khRange, absensiRange] = await Promise.all([
			db
				.select({
					minTgl: sql<string>`COALESCE(MIN(${tableKetidakhadiranHarian.tanggal}), '9999-12-31')`,
					maxTgl: sql<string>`COALESCE(MAX(${tableKetidakhadiranHarian.tanggal}), '0000-01-01')`
				})
				.from(tableKetidakhadiranHarian)
				.where(
					and(
						inArray(tableKetidakhadiranHarian.muridId, muridIds),
						sql`${tableKetidakhadiranHarian.mataPelajaranId} IS NULL`
					)
				),
			db
				.select({
					minTgl: sql<string>`COALESCE(MIN(SUBSTR(${tableAbsensi.waktu}, 1, 10)), '9999-12-31')`,
					maxTgl: sql<string>`COALESCE(MAX(SUBSTR(${tableAbsensi.waktu}, 1, 10)), '0000-01-01')`
				})
				.from(tableAbsensi)
				.where(
					and(inArray(tableAbsensi.muridId, muridIds), sql`${tableAbsensi.mataPelajaranId} IS NULL`)
				)
		]);
		const khMin = khRange[0]?.minTgl;
		const khMax = khRange[0]?.maxTgl;
		const absMin = absensiRange[0]?.minTgl;
		const absMax = absensiRange[0]?.maxTgl;
		const dataMin = [khMin, absMin].reduce((a, b) => (a < b ? a : b));
		const dataMax = [khMax, absMax].reduce((a, b) => (a > b ? a : b));
		if (dataMin && dataMax && dataMin !== '9999-12-31' && dataMax !== '0000-01-01') {
			if (dataMin < tanggalMulaiRapor) tanggalMulaiRapor = dataMin;
			if (dataMax > tanggalAkhirRapor) tanggalAkhirRapor = dataMax;
		}
	}

	const hariSekolah = presensiSettings.hariSekolah ?? 6;
	const rangeLiburDates = buildRangeLiburDates(
		presensiSettings,
		tanggalMulaiRapor,
		tanggalAkhirRapor
	);
	const { allDates, redDaySet } = buildRangeRedDays(
		hariSekolah,
		tanggalMulaiRapor,
		tanggalAkhirRapor,
		rangeLiburDates
	);
	const totalHariBelajar = allDates.length - redDaySet.size;

	const allKetidakhadiran = await db.query.tableKetidakhadiranHarian.findMany({
		columns: { muridId: true, tanggal: true, keterangan: true, keteranganPulang: true },
		where: and(
			inArray(tableKetidakhadiranHarian.muridId, muridIds),
			sql`${tableKetidakhadiranHarian.tanggal} >= ${tanggalMulaiRapor}`,
			sql`${tableKetidakhadiranHarian.tanggal} <= ${tanggalAkhirRapor}`,
			sql`${tableKetidakhadiranHarian.mataPelajaranId} IS NULL`
		)
	});

	const khMap = new Map<string, string | null>();
	const khPulangMap = new Map<string, string | null>();
	for (const kh of allKetidakhadiran) {
		khMap.set(`${kh.muridId}:${kh.tanggal}`, kh.keterangan);
		khPulangMap.set(`${kh.muridId}:${kh.tanggal}`, kh.keteranganPulang);
	}

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

	const persentaseSemesterRows: PersentaseSemesterRow[] = semuaMurid.map((murid, index) => {
		let countHadir = 0;
		let sakit = 0;
		let izin = 0;
		let alfa = 0;
		if (isWaliKelasMasukPulang) {
			for (const tgl of allDates) {
				if (redDaySet.has(tgl)) continue;
				const masukKet = khMap.get(`${murid.id}:${tgl}`);
				const pulangKet = khPulangMap.get(`${murid.id}:${tgl}`);
				const countSession = (ket: string | null | undefined) => {
					if (ket === null) countHadir++;
					else if (ket === 'sakit') sakit++;
					else if (ket === 'izin') izin++;
					else alfa++;
				};
				countSession(masukKet);
				countSession(pulangKet);
			}
			const totalSessions = totalHariBelajar * 2;
			const persentase = totalSessions > 0 ? Math.round((countHadir / totalSessions) * 100) : 0;
			return { no: index + 1, nama: murid.nama, persentase, hadir: countHadir, sakit, izin, alfa };
		}
		for (const tgl of allDates) {
			if (redDaySet.has(tgl)) continue;
			const keterangan = khMap.get(`${murid.id}:${tgl}`);
			if (keterangan !== undefined) {
				if (keterangan === null) countHadir++;
				else if (keterangan === 'sakit') sakit++;
				else if (keterangan === 'izin') izin++;
				else alfa++;
			} else if (absensiSet.has(`${murid.id}:${tgl}`)) {
				countHadir++;
			} else {
				alfa++;
			}
		}
		const persentase = totalHariBelajar > 0 ? Math.round((countHadir / totalHariBelajar) * 100) : 0;
		return { no: index + 1, nama: murid.nama, persentase, hadir: countHadir, sakit, izin, alfa };
	});

	return {
		...defaultData,
		page: {
			search,
			currentPage: pagination.currentPage,
			totalPages: pagination.totalPages,
			totalItems: pagination.total,
			perPage: PER_PAGE
		},
		totalMurid: pagination.total,
		muridCount: muridCount ?? 0,
		tanggalMulaiRapor,
		tanggalAkhirRapor,
		totalHariBelajar,
		persentaseSemesterRows
	};
}
