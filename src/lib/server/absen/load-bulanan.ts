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

	// For tiap_mapel, precompute the first mapel for each day of the month
	const firstMapelByDay = new Map<number, { mpId: number; kode: string }>();
	if (isTiapMapel) {
		const dayNames = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
		const hariSeen = new Set<string>();
		const hariToFirstMapel = new Map<string, { mpId: number; kode: string }>();

		for (let d = 1; d <= daysInMonth; d++) {
			if (redDays.includes(d)) continue;
			const tgl = dateStr(tahun, bulan, d);
			const hariNama = dayNames[new Date(tgl + 'T00:00:00').getDay()];
			if (hariSeen.has(hariNama)) {
				const cached = hariToFirstMapel.get(hariNama);
				if (cached) firstMapelByDay.set(d, cached);
				continue;
			}
			hariSeen.add(hariNama);

			const jadwal = await db.query.tableJadwalPelajaran.findMany({
				columns: { kodeKegiatan: true, jamKe: true },
				where: and(
					eq(tableJadwalPelajaran.sekolahId, sekolahId),
					eq(tableJadwalPelajaran.kelasId, kelasId),
					eq(tableJadwalPelajaran.hari, hariNama)
				),
				orderBy: [asc(tableJadwalPelajaran.jamKe)]
			});

			const uniqueKode = getUniqueSubjectKodes(jadwal);
			if (uniqueKode.length === 0) continue;

			// Try each kode in order until we find one with a matching MP entry
			let found: { mpId: number; kode: string } | null = null;
			for (const kode of uniqueKode) {
				const mp = await db.query.tableMataPelajaran.findFirst({
					columns: { id: true },
					where: and(eq(tableMataPelajaran.kelasId, kelasId), eq(tableMataPelajaran.kode, kode))
				});
				if (mp) {
					found = { mpId: mp.id, kode };
					break;
				}
			}
			if (found) {
				hariToFirstMapel.set(hariNama, found);
				firstMapelByDay.set(d, found);
			}
		}
	}

	const monthStartISO = `${monthStart}T00:00:00.000Z`;
	const monthEndISO = `${monthEnd}T23:59:59.999Z`;

	let allKetidakhadiran: Array<{
		muridId: number;
		tanggal: string;
		keterangan: string | null;
		keteranganPulang: string | null;
		mataPelajaranId: number | null;
	}> = [];
	let allAbsensi: Array<{ muridId: number; waktu: string }> = [];
	let allNullKetidakhadiran: Array<{
		muridId: number;
		tanggal: string;
		keterangan: string | null;
		keteranganPulang: string | null;
	}> = [];
	let allNullAbsensi: Array<{ muridId: number; waktu: string }> = [];

	if (isTiapMapel) {
		const mpIds = [...new Set(Array.from(firstMapelByDay.values()).map((m) => m.mpId))];
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
						columns: { muridId: true, waktu: true },
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
	}

	const khMap = new Map<string, string | null>();
	for (const kh of allKetidakhadiran) {
		if (isTiapMapel) {
			khMap.set(`${kh.muridId}:${kh.tanggal}:${kh.mataPelajaranId}`, kh.keterangan);
		} else {
			khMap.set(`${kh.muridId}:${kh.tanggal}`, kh.keterangan);
		}
	}

	const nullKhMap = new Map<string, string | null>();
	for (const kh of allNullKetidakhadiran) {
		nullKhMap.set(`${kh.muridId}:${kh.tanggal}`, kh.keterangan);
	}

	const absensiSet = new Set<string>();
	for (const a of allAbsensi) {
		absensiSet.add(`${a.muridId}:${a.waktu.slice(0, 10)}`);
	}

	const nullAbsensiSet = new Set<string>();
	for (const a of allNullAbsensi) {
		nullAbsensiSet.add(`${a.muridId}:${a.waktu.slice(0, 10)}`);
	}

	function getStatus(muridId: number, day: number): StatusPerDay {
		const tgl = dateStr(tahun, bulan, day);
		if (isTiapMapel) {
			const firstMp = firstMapelByDay.get(day);
			if (!firstMp) {
				// No valid mapel for this day (schedule kodes lack MP entries).
				// Fall back to null-mpId attendance record (backward compat).
				const nullKey = `${muridId}:${tgl}`;
				const nullKh = nullKhMap.get(nullKey);
				if (nullKh !== undefined) {
					if (nullKh === null) return 'H';
					if (nullKh === 'sakit') return 'S';
					if (nullKh === 'izin') return 'I';
					if (nullKh === 'alfa') return 'TK';
					return 'TK';
				}
				if (nullAbsensiSet.has(nullKey)) return 'H';
				return '';
			}
			const mpId = firstMp.mpId;
			const khKey = `${muridId}:${tgl}:${mpId}`;
			let keterangan = khMap.get(khKey);
			// fallback to null-mpId record (backward compat)
			if (keterangan === undefined) {
				const nullKey = `${muridId}:${tgl}`;
				if (nullKhMap.has(nullKey)) {
					keterangan = nullKhMap.get(nullKey);
				}
			}
			if (keterangan !== undefined) {
				if (keterangan === null) return 'H';
				if (keterangan === 'sakit') return 'S';
				if (keterangan === 'izin') return 'I';
				if (keterangan === 'alfa') return 'TK';
				return 'TK';
			}
			if (absensiSet.has(`${muridId}:${tgl}`) || nullAbsensiSet.has(`${muridId}:${tgl}`))
				return 'H';
			return '';
		}
		const keterangan = khMap.get(`${muridId}:${tgl}`);
		if (keterangan !== undefined) {
			if (keterangan === null) return 'H';
			if (keterangan === 'sakit') return 'S';
			if (keterangan === 'izin') return 'I';
			if (keterangan === 'alfa') return 'TK';
			return 'TK';
		}
		if (!isWaliKelasMasukPulang && absensiSet.has(`${muridId}:${tgl}`)) return 'H';
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
		totalPertemuan: 0,
		bulananRows,
		raporRows: [],
		persentaseBulananRows: [],
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
