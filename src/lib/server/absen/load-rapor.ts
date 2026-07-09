import db from '$lib/server/db';
import {
	tableMurid,
	tableKetidakhadiranHarian,
	tableKetidakhadiranRapor,
	tableAbsensi,
	tableSemester,
	tableMataPelajaran,
	tableJadwalPelajaran
} from '$lib/server/db/schema';
import { asc, eq, inArray, and, sql } from 'drizzle-orm';
import { isValidDate } from './utils';
import { computePagination, PER_PAGE } from './pagination';
import { buildRangeLiburDates, buildRangeRedDays } from './libur';
import { getUniqueSubjectKodes } from './first-mapel';
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
	tahunAjaranId: number;
	semesterId: number;
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
		url,
		tahunAjaranId,
		semesterId: kelasSemesterId
	} = params;

	const jenisPresensi = presensiSettings.jenisPresensi ?? 'wali_kelas_saja';
	const tipePresensi = presensiSettings.tipePresensi ?? '';
	const isWaliKelasMasukPulang =
		jenisPresensi === 'wali_kelas_saja' && tipePresensi === 'masuk_pulang';
	const isTiapMapel = jenisPresensi === 'tiap_mapel';
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
		totalPertemuan: 0,
		bulananRows: [],
		raporRows: [] as RaporRow[],
		persentaseBulananRows: [],
		persentaseSemesterRows: [],
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
		harianMapelId: null,
		guruMapelSubject: null,
		isMapelOnJadwal: false,
		simulasiHari: simHari,
		simulasiJam: simJam,
		isLibur: false
	};

	const activeTa = academicContext?.tahunAjaranList.find((ta: any) => ta.id === tahunAjaranId);
	const activeSem = activeTa?.semester.find((s: any) => s.id === kelasSemesterId);
	let tanggalMulaiRapor = activeSem?.tanggalMasuk ?? activeSem?.tanggalMulai ?? null;
	let tanggalAkhirRapor = activeSem?.tanggalBagiRaport ?? activeSem?.tanggalSelesai ?? null;
	const semesterId = kelasSemesterId;

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

	const totalHariBelajar = allDates.filter((tgl) => !redDaySet.has(tgl)).length;
	const rangeStartISO = `${tanggalMulaiRapor}T00:00:00.000Z`;
	const rangeEndISO = `${tanggalAkhirRapor}T23:59:59.999Z`;

	// For tiap_mapel, build day -> subject mapping across full range
	const dateSubjectKodesMap = new Map<string, string[]>();
	const kodeToMpMap = new Map<string, number>();

	if (isTiapMapel) {
		const dayNames = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
		const hariJadwalCache = new Map<string, string[]>();

		for (const tgl of allDates) {
			if (redDaySet.has(tgl)) continue;
			const hariNama = dayNames[new Date(tgl + 'T00:00:00').getDay()];

			let uniqueKode: string[];
			if (hariJadwalCache.has(hariNama)) {
				uniqueKode = hariJadwalCache.get(hariNama)!;
			} else {
				const jadwal = await db.query.tableJadwalPelajaran.findMany({
					columns: { kodeKegiatan: true, jamKe: true },
					where: and(
						eq(tableJadwalPelajaran.sekolahId, sekolahId),
						eq(tableJadwalPelajaran.kelasId, kelasId),
						eq(tableJadwalPelajaran.hari, hariNama)
					),
					orderBy: [asc(tableJadwalPelajaran.jamKe)]
				});
				uniqueKode = getUniqueSubjectKodes(jadwal);
				hariJadwalCache.set(hariNama, uniqueKode);
			}

			dateSubjectKodesMap.set(tgl, uniqueKode);
		}

		// Build kodeToMpMap from all unique kodes across all days
		const allKodes = [...new Set(Array.from(dateSubjectKodesMap.values()).flat())];
		const matchingMp = await db.query.tableMataPelajaran.findMany({
			columns: { id: true, kode: true },
			where: and(
				eq(tableMataPelajaran.kelasId, kelasId),
				inArray(tableMataPelajaran.kode, allKodes)
			)
		});
		for (const mp of matchingMp) {
			if (mp.kode) kodeToMpMap.set(mp.kode, mp.id);
		}

		// Keep all kodes — rapor uses only the first valid mapel per day
	}

	const mpIds = [...kodeToMpMap.values()];

	let allKetidakhadiran: Array<{
		muridId: number;
		tanggal: string;
		keterangan: string | null;
		keteranganPulang: string | null;
		mataPelajaranId: number | null;
	}> = [];
	let allAbsensi: Array<{ muridId: number; waktu: string; mataPelajaranId?: number | null }> = [];
	let allNullKetidakhadiran: Array<{
		muridId: number;
		tanggal: string;
		keterangan: string | null;
		keteranganPulang: string | null;
	}> = [];
	let allNullAbsensi: Array<{ muridId: number; waktu: string }> = [];

	if (isTiapMapel) {
		const isiMapelKhPromise =
			mpIds.length > 0
				? db.query.tableKetidakhadiranHarian.findMany({
						columns: {
							muridId: true,
							tanggal: true,
							keterangan: true,
							keteranganPulang: true,
							mataPelajaranId: true
						},
						where: and(
							inArray(tableKetidakhadiranHarian.muridId, muridIds),
							sql`${tableKetidakhadiranHarian.tanggal} >= ${tanggalMulaiRapor}`,
							sql`${tableKetidakhadiranHarian.tanggal} <= ${tanggalAkhirRapor}`,
							inArray(tableKetidakhadiranHarian.mataPelajaranId, mpIds)
						)
					})
				: Promise.resolve([]);
		const isiMapelAbsPromise =
			mpIds.length > 0
				? db.query.tableAbsensi.findMany({
						columns: { muridId: true, waktu: true, mataPelajaranId: true },
						where: and(
							inArray(tableAbsensi.muridId, muridIds),
							sql`${tableAbsensi.waktu} >= ${rangeStartISO}`,
							sql`${tableAbsensi.waktu} <= ${rangeEndISO}`,
							inArray(tableAbsensi.mataPelajaranId, mpIds)
						)
					})
				: Promise.resolve([]);
		const [kh, abs, nullKh, nullAbs] = await Promise.all([
			isiMapelKhPromise,
			isiMapelAbsPromise,
			db.query.tableKetidakhadiranHarian.findMany({
				columns: { muridId: true, tanggal: true, keterangan: true, keteranganPulang: true },
				where: and(
					inArray(tableKetidakhadiranHarian.muridId, muridIds),
					sql`${tableKetidakhadiranHarian.tanggal} >= ${tanggalMulaiRapor}`,
					sql`${tableKetidakhadiranHarian.tanggal} <= ${tanggalAkhirRapor}`,
					sql`${tableKetidakhadiranHarian.mataPelajaranId} IS NULL`
				)
			}),
			db.query.tableAbsensi.findMany({
				columns: { muridId: true, waktu: true },
				where: and(
					inArray(tableAbsensi.muridId, muridIds),
					sql`${tableAbsensi.waktu} >= ${rangeStartISO}`,
					sql`${tableAbsensi.waktu} <= ${rangeEndISO}`,
					sql`${tableAbsensi.mataPelajaranId} IS NULL`
				)
			})
		]);
		allKetidakhadiran = kh;
		allAbsensi = abs;
		allNullKetidakhadiran = nullKh;
		allNullAbsensi = nullAbs;
	} else if (!isTiapMapel) {
		const [kh, abs] = await Promise.all([
			db.query.tableKetidakhadiranHarian.findMany({
				columns: {
					muridId: true,
					tanggal: true,
					keterangan: true,
					keteranganPulang: true,
					mataPelajaranId: true
				},
				where: and(
					inArray(tableKetidakhadiranHarian.muridId, muridIds),
					sql`${tableKetidakhadiranHarian.tanggal} >= ${tanggalMulaiRapor}`,
					sql`${tableKetidakhadiranHarian.tanggal} <= ${tanggalAkhirRapor}`,
					sql`${tableKetidakhadiranHarian.mataPelajaranId} IS NULL`
				)
			}),
			db.query.tableAbsensi.findMany({
				columns: { muridId: true, waktu: true, mataPelajaranId: true },
				where: and(
					inArray(tableAbsensi.muridId, muridIds),
					sql`${tableAbsensi.waktu} >= ${rangeStartISO}`,
					sql`${tableAbsensi.waktu} <= ${rangeEndISO}`,
					sql`${tableAbsensi.mataPelajaranId} IS NULL`
				)
			})
		]);
		allKetidakhadiran = kh;
		allAbsensi = abs;
	}

	const khMap = new Map<string, string | null>();
	const khPulangMap = new Map<string, string | null>();
	const nullKhMap = new Map<string, string | null>();
	const nullKhPulangMap = new Map<string, string | null>();
	for (const kh of allKetidakhadiran) {
		if (isTiapMapel) {
			khMap.set(`${kh.muridId}:${kh.tanggal}:${kh.mataPelajaranId}`, kh.keterangan);
			khPulangMap.set(`${kh.muridId}:${kh.tanggal}:${kh.mataPelajaranId}`, kh.keteranganPulang);
		} else {
			khMap.set(`${kh.muridId}:${kh.tanggal}`, kh.keterangan);
			khPulangMap.set(`${kh.muridId}:${kh.tanggal}`, kh.keteranganPulang);
		}
	}
	for (const kh of allNullKetidakhadiran) {
		nullKhMap.set(`${kh.muridId}:${kh.tanggal}`, kh.keterangan);
		nullKhPulangMap.set(`${kh.muridId}:${kh.tanggal}`, kh.keteranganPulang);
	}

	const absensiSet = new Set<string>();
	const absensiPerMapel = new Map<string, number>();
	const nullAbsensiSet = new Set<string>();
	for (const a of allAbsensi) {
		if (isTiapMapel) {
			const key = `${a.muridId}:${a.waktu.slice(0, 10)}:${a.mataPelajaranId}`;
			absensiPerMapel.set(key, (absensiPerMapel.get(key) ?? 0) + 1);
		} else {
			absensiSet.add(`${a.muridId}:${a.waktu.slice(0, 10)}`);
		}
	}
	for (const a of allNullAbsensi) {
		nullAbsensiSet.add(`${a.muridId}:${a.waktu.slice(0, 10)}`);
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

		if (isWaliKelasMasukPulang) {
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
				}
			}
		} else if (isTiapMapel) {
			for (const tgl of allDates) {
				if (redDaySet.has(tgl)) continue;
				const subjectKodes = dateSubjectKodesMap.get(tgl) ?? [];

				// Rapor follows harian/bulanan: use first valid mapel only
				let mpId: number | null = null;
				for (const kode of subjectKodes) {
					const found = kodeToMpMap.get(kode);
					if (found != null) {
						mpId = found;
						break;
					}
				}

				const nullKey = `${murid.id}:${tgl}`;
				let keterangan: string | null | undefined;

				if (mpId != null) {
					const khKey = `${murid.id}:${tgl}:${mpId}`;
					keterangan = khMap.get(khKey);
					if (keterangan === undefined && nullKhMap.has(nullKey)) {
						keterangan = nullKhMap.get(nullKey);
					}
				} else {
					// No valid mapel — fall back to null-mpId record
					keterangan = nullKhMap.get(nullKey);
				}

				if (keterangan !== undefined) {
					if (keterangan === null) {
						hadir++;
					} else if (keterangan === 'sakit') {
						sakit++;
					} else if (keterangan === 'izin') {
						izin++;
					} else {
						alfa++;
					}
				} else {
					const hasAbsensi =
						mpId != null
							? absensiPerMapel.has(`${murid.id}:${tgl}:${mpId}`) || nullAbsensiSet.has(nullKey)
							: nullAbsensiSet.has(nullKey);
					if (hasAbsensi) {
						hadir++;
					}
				}
			}
		} else {
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
				}
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
		totalHariBelajar,
		raporRows
	};
}
