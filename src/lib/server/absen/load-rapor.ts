import db from '$lib/server/db';
import {
	tableMurid,
	tableKetidakhadiranHarian,
	tableKetidakhadiranRapor,
	tableAbsensi
} from '$lib/server/db/schema';
import { asc, eq, inArray, and, sql } from 'drizzle-orm';
import { isValidDate } from './utils';
import { computePagination, PER_PAGE } from './pagination';
import { buildRangeLiburDates, buildRangeRedDays } from './libur';
import type { RaporRow, AbsenLoadData } from './types';
import type { PresensiCheckResult } from './presensi';

export async function loadRapor(params: {
	sekolahId: number;
	kelasId: number;
	search: string | null;
	pageNumber: number;
	academicContext: any;
	presensiSettings: NonNullable<PresensiCheckResult['presensiSettings']>;
	simHari: string | null;
	simJam: string | null;
	url: URL;
}): Promise<AbsenLoadData> {
	const {
		sekolahId,
		kelasId,
		search,
		pageNumber,
		academicContext,
		presensiSettings,
		simHari,
		simJam,
		url
	} = params;

	const defaultData = {
		meta: { title: 'Kehadiran Murid' } as const,
		tableReady: true,
		page: { search, currentPage: 1, totalPages: 1, totalItems: 0, perPage: PER_PAGE },
		daftarMurid: [],
		semuaMurid: [],
		totalMurid: 0,
		muridCount: 0,
		tanggal: '',
		mode: 'rapor' as const,
		bulan: 0,
		tahun: 0,
		daysInMonth: 0,
		totalHariBelajar: 0,
		bulananRows: [],
		raporRows: [] as RaporRow[],
		persentaseBulananRows: [],
		redDays: [],
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

	const activeTa = academicContext?.tahunAjaranList.find(
		(ta: any) => ta.id === academicContext?.activeTahunAjaranId
	);
	const activeSem = activeTa?.semester.find((s: any) => s.id === academicContext?.activeSemesterId);
	const tanggalMulaiRapor = activeSem?.tanggalMasuk ?? null;
	const tanggalAkhirRapor = activeSem?.tanggalBagiRaport ?? null;
	const semesterId = academicContext?.activeSemesterId;

	if (!tanggalMulaiRapor || !tanggalAkhirRapor || !semesterId) {
		return {
			...defaultData,
			presensiReady: false,
			presensiWarningMessage:
				'Tidak dapat menampilkan rekap rapor. Atur tanggal masuk semester dan tanggal bagi rapor di halaman /akademik.'
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
	if (muridIds.length === 0) {
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
			tanggalAkhirRapor
		};
	}

	const hariSekolah = presensiSettings.hariSekolah ?? 6;
	const rangeLiburDates = buildRangeLiburDates(presensiSettings, tanggalMulaiRapor, tanggalAkhirRapor);
	const { allDates, redDaySet } = buildRangeRedDays(hariSekolah, tanggalMulaiRapor, tanggalAkhirRapor, rangeLiburDates);

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
				else alfa++;
			} else if (absensiSet.has(`${murid.id}:${tgl}`)) {
				hadir++;
			} else {
				alfa++;
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
		raporRows
	};
}
