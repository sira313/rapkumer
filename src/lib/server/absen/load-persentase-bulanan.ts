import db from '$lib/server/db';
import {
	tableMurid,
	tableKetidakhadiranHarian,
	tableAbsensi,
	tableMataPelajaran,
	tableJadwalPelajaran
} from '$lib/server/db/schema';
import { asc, eq, inArray, and, sql } from 'drizzle-orm';
import { getDaysInMonth, dateStr } from './utils';
import { computePagination, PER_PAGE } from './pagination';
import { buildLiburDates, buildRedDays } from './libur';
import { getUniqueSubjectKodes } from './first-mapel';
import type { PersentaseBulananRow, AbsenLoadData } from './types';
import type { PresensiCheckResult } from './presensi';

export async function loadPersentaseBulanan(params: {
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
	const {
		sekolahId,
		kelasId,
		search,
		pageNumber,
		bulan,
		tahun,
		presensiSettings,
		simHari,
		simJam,
		url
	} = params;

	const jenisPresensi = presensiSettings.jenisPresensi ?? 'wali_kelas_saja';
	const tipePresensi = presensiSettings.tipePresensi ?? '';
	const isWaliKelasMasukPulang =
		jenisPresensi === 'wali_kelas_saja' && tipePresensi === 'masuk_pulang';
	const isTiapMapel = jenisPresensi === 'tiap_mapel';
	const isAwalAkhir = isTiapMapel && tipePresensi === 'awal_akhir_mapel';

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
	const totalHariBelajar = daysInMonth - redDays.length;

	const monthStartISO = `${monthStart}T00:00:00.000Z`;
	const monthEndISO = `${monthEnd}T23:59:59.999Z`;

	// For tiap_mapel, compute schedule per day and total pertemuan
	let totalPertemuan = 0;
	const daySubjectKodesMap = new Map<number, string[]>();
	const kodeToMpMap = new Map<string, number>();

	if (isTiapMapel) {
		const dayNames = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
		const hariJadwalCache = new Map<string, string[]>();

		for (let d = 1; d <= daysInMonth; d++) {
			if (redDays.includes(d)) continue;
			const tgl = dateStr(tahun, bulan, d);
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

			daySubjectKodesMap.set(d, uniqueKode);
		}

		// Build kodeToMpMap from all unique kodes across all days
		const allKodes = [...new Set(Array.from(daySubjectKodesMap.values()).flat())];
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

		// Compute totalPertemuan from ALL kodes (including those without MP entries)
		for (const [, kodes] of daySubjectKodesMap) {
			totalPertemuan += kodes.filter((k) => k !== 'UPB').length;
		}
		if (isAwalAkhir) totalPertemuan *= 2;
	}

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
		const mpIds = [...kodeToMpMap.values()];
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
							sql`${tableKetidakhadiranHarian.tanggal} >= ${monthStart}`,
							sql`${tableKetidakhadiranHarian.tanggal} <= ${monthEnd}`,
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
							sql`${tableAbsensi.waktu} >= ${monthStartISO}`,
							sql`${tableAbsensi.waktu} <= ${monthEndISO}`,
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
					sql`${tableKetidakhadiranHarian.tanggal} >= ${monthStart}`,
					sql`${tableKetidakhadiranHarian.tanggal} <= ${monthEnd}`,
					sql`${tableKetidakhadiranHarian.mataPelajaranId} IS NULL`
				)
			}),
			db.query.tableAbsensi.findMany({
				columns: { muridId: true, waktu: true },
				where: and(
					inArray(tableAbsensi.muridId, muridIds),
					sql`${tableAbsensi.waktu} >= ${monthStartISO}`,
					sql`${tableAbsensi.waktu} <= ${monthEndISO}`,
					sql`${tableAbsensi.mataPelajaranId} IS NULL`
				)
			})
		]);
		allKetidakhadiran = kh;
		allAbsensi = abs;
		allNullKetidakhadiran = nullKh;
		allNullAbsensi = nullAbs;
	} else {
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
					sql`${tableKetidakhadiranHarian.tanggal} >= ${monthStart}`,
					sql`${tableKetidakhadiranHarian.tanggal} <= ${monthEnd}`,
					sql`${tableKetidakhadiranHarian.mataPelajaranId} IS NULL`
				)
			}),
			db.query.tableAbsensi.findMany({
				columns: { muridId: true, waktu: true, mataPelajaranId: true },
				where: and(
					inArray(tableAbsensi.muridId, muridIds),
					sql`${tableAbsensi.waktu} >= ${monthStartISO}`,
					sql`${tableAbsensi.waktu} <= ${monthEndISO}`,
					sql`${tableAbsensi.mataPelajaranId} IS NULL`
				)
			})
		]);
		allKetidakhadiran = kh;
		allAbsensi = abs;
	}

	const khMap = new Map<string, string | null>();
	const khPulangMap = new Map<string, string | null>();
	// null-mpId fallback map for backward compat with records saved via harian mode
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
	// merge null-mpId kh records into fallback maps
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

	const persentaseBulananRows: PersentaseBulananRow[] = semuaMurid.map((murid, index) => {
		let countHadir = 0;
		let sakit = 0;
		let izin = 0;
		let alfa = 0;

		if (isWaliKelasMasukPulang) {
			for (let d = 1; d <= daysInMonth; d++) {
				if (redDays.includes(d)) continue;
				const tgl = dateStr(tahun, bulan, d);
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

		if (isTiapMapel) {
			for (let d = 1; d <= daysInMonth; d++) {
				if (redDays.includes(d)) continue;
				const tgl = dateStr(tahun, bulan, d);
				const subjectKodes = daySubjectKodesMap.get(d) ?? [];

				for (const kode of subjectKodes) {
					if (kode === 'UPB') continue;
					const mpId = kodeToMpMap.get(kode);
					const nullKey = `${murid.id}:${tgl}`;
					let keterangan: string | null | undefined;

					if (mpId != null) {
						const khKey = `${murid.id}:${tgl}:${mpId}`;
						keterangan = khMap.get(khKey);
						// fallback to null-mpId record (backward compat)
						if (keterangan === undefined && nullKhMap.has(nullKey)) {
							keterangan = nullKhMap.get(nullKey);
						}
					} else {
						// kode without MP entry — use null-mpId fallback
						keterangan = nullKhMap.get(nullKey);
					}

					if (keterangan !== undefined) {
						if (keterangan === null) {
							if (isAwalAkhir) {
								const absCount =
									mpId != null ? (absensiPerMapel.get(`${murid.id}:${tgl}:${mpId}`) ?? 0) : 0;
								countHadir += absCount > 0 ? absCount : 2;
							} else {
								countHadir++;
							}
						} else if (keterangan === 'sakit') {
							sakit += isAwalAkhir ? 2 : 1;
						} else if (keterangan === 'izin') {
							izin += isAwalAkhir ? 2 : 1;
						} else {
							alfa += isAwalAkhir ? 2 : 1;
						}
					} else {
						const hasAbsensi =
							mpId != null
								? absensiPerMapel.has(`${murid.id}:${tgl}:${mpId}`) || nullAbsensiSet.has(nullKey)
								: nullAbsensiSet.has(nullKey);
						if (hasAbsensi) {
							if (isAwalAkhir) {
								const absCount =
									mpId != null ? (absensiPerMapel.get(`${murid.id}:${tgl}:${mpId}`) ?? 0) : 0;
								countHadir += absCount;
							} else {
								countHadir++;
							}
						} else {
							alfa += isAwalAkhir ? 2 : 1;
						}
					}
				}
			}
			const denom = totalPertemuan;
			const persentase = denom > 0 ? Math.round((countHadir / denom) * 100) : 0;
			return {
				no: index + 1,
				nama: murid.nama,
				persentase,
				hadir: Math.round(countHadir),
				sakit,
				izin,
				alfa
			};
		}

		for (let d = 1; d <= daysInMonth; d++) {
			if (redDays.includes(d)) continue;
			const tgl = dateStr(tahun, bulan, d);
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
		mode: 'persentase_bulanan',
		bulan,
		tahun,
		daysInMonth,
		totalHariBelajar,
		totalPertemuan,
		bulananRows: [],
		raporRows: [],
		persentaseBulananRows,
		persentaseSemesterRows: [],
		redDays,
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
}
