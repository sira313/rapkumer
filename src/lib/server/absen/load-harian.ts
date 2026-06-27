import db from '$lib/server/db';
import {
	tableMurid,
	tableKetidakhadiranHarian,
	tableAbsensi,
	tableAuthUserMataPelajaran,
	tableMataPelajaran,
	tableJadwalPelajaran
} from '$lib/server/db/schema';
import { asc, eq, inArray, and, sql } from 'drizzle-orm';
import { isTableMissingError, todayDateString } from './utils';
import { computePagination, PER_PAGE } from './pagination';
import { computeJamKeFromTime, type BellSettingsData, type CustomKegiatanData } from '$lib/server/absen-utils';
import {
	simGetKetidakhadiran,
	simGetAbsensi
} from '$lib/server/simulasi-cache';
import type {
	KehadiranRow,
	PersentaseHarianRow,
	PersentaseHarianSubject,
	JadwalSaatIni,
	AbsenLoadData
} from './types';
import type { PresensiCheckResult } from './presensi';

const agamaMapelNames = [
	'Pendidikan Agama dan Budi Pekerti',
	'Pendidikan Agama Islam dan Budi Pekerti',
	'Pendidikan Agama Kristen dan Budi Pekerti',
	'Pendidikan Agama Katolik dan Budi Pekerti',
	'Pendidikan Agama Buddha dan Budi Pekerti',
	'Pendidikan Agama Hindu dan Budi Pekerti',
	'Pendidikan Agama Konghuchu dan Budi Pekerti'
];

async function computePersentaseHarian(params: {
	sekolahId: number;
	kelasId: number;
	tanggal: string;
	semuaMurid: Array<{ id: number; nama: string; keterangan: string | null }>;
	presensiSettings: NonNullable<PresensiCheckResult['presensiSettings']>;
	bellSettings: BellSettingsData | null;
	kegiatanCustom: CustomKegiatanData[];
	user: NonNullable<App.Locals['user']>;
	simHari: string | null;
	simJam: string | null;
}) {
	const {
		sekolahId,
		kelasId,
		tanggal,
		semuaMurid,
		presensiSettings,
		bellSettings,
		kegiatanCustom,
		user,
		simHari,
		simJam
	} = params;

	const dayNames = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
	const todayHari = simHari ?? dayNames[new Date(tanggal + 'T00:00:00').getDay()];

	const jadwalHariIni = await db.query.tableJadwalPelajaran.findMany({
		columns: { kodeKegiatan: true, jamKe: true },
		where: and(
			eq(tableJadwalPelajaran.sekolahId, sekolahId),
			eq(tableJadwalPelajaran.kelasId, kelasId),
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

	let persentaseHarianSubjects: PersentaseHarianSubject[] = [];
	let persentaseHarianRows: PersentaseHarianRow[] = [];
	let jadwalSaatIni: JadwalSaatIni | null = null;

	if (uniqueJadwal.length === 0) {
		return { persentaseHarianSubjects, persentaseHarianRows, jadwalSaatIni };
	}

	const agamaNameSet = new Set(agamaMapelNames);
	const tambahanKode = new Set(['IST', 'PLG']);
	const uniqueKode = uniqueJadwal
		.map((j) => j.kodeKegiatan)
		.filter((k) => !tambahanKode.has(k.toUpperCase()));

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
		return { persentaseHarianSubjects, persentaseHarianRows, jadwalSaatIni };
	}

	const matchingMp = await db.query.tableMataPelajaran.findMany({
		columns: { id: true, kode: true, nama: true },
		where: and(
			eq(tableMataPelajaran.kelasId, kelasId),
			inArray(tableMataPelajaran.kode, uniqueKode)
		)
	});

	const kodeToMpMap = new Map<string, { id: number; nama: string }>();
	for (const mp of matchingMp) {
		if (mp.kode) kodeToMpMap.set(mp.kode, { id: mp.id, nama: mp.nama });
	}

	if (uniqueKode.includes('PAPB') && !kodeToMpMap.has('PAPB')) {
		const agamaMp = await db.query.tableMataPelajaran.findMany({
			columns: { id: true, nama: true },
			where: and(
				eq(tableMataPelajaran.kelasId, kelasId),
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

	if (simHari && simJam) {
		const cacheKetidakhadiran = simGetKetidakhadiran(sekolahId, kelasId, tanggal, simHari, simJam);
		const cacheAbsensi = simGetAbsensi(sekolahId, kelasId, tanggal, simHari, simJam);
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

	let userKodeSet: Set<string> | null = null;
	if (user.type === 'user') {
		userKodeSet = new Set<string>();
		const userMpIds = new Set<number>();
		if (user.mataPelajaranId) userMpIds.add(user.mataPelajaranId);
		const additional = await db.query.tableAuthUserMataPelajaran.findMany({
			columns: { mataPelajaranId: true },
			where: eq(tableAuthUserMataPelajaran.authUserId, user.id)
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

	if (presensiSettings.jamMasuk) {
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

	const tipePresensi = presensiSettings.tipePresensi ?? 'awal_mapel';
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
						if (useHalfWeight) {
							const count = absenPerMapel.get(`${murid.id}:${mpId}`);
							if (count != null) {
								attendedPoints += count * 0.5;
								masuk = 'H';
								if (count >= 2) selesai = 'H';
							} else {
								attendedPoints++;
								masuk = 'H';
								selesai = 'H';
							}
						} else {
							attendedPoints++;
							masuk = 'H';
							selesai = 'H';
						}
					} else {
						const khStatus = mapelKey === 'sakit' ? 'S' : mapelKey === 'izin' ? 'I' : 'TK';
						if (useHalfWeight) {
							const count = absenPerMapel.get(`${murid.id}:${mpId}`);
							if (count != null) {
								attendedPoints += count * 0.5;
								masuk = count >= 1 ? 'H' : khStatus;
								selesai = count >= 2 ? 'H' : khStatus;
							} else {
								masuk = khStatus;
								selesai = khStatus;
							}
							status = masuk === 'H' || selesai === 'H' ? 'H' : khStatus;
						} else {
							status = khStatus;
							masuk = khStatus;
							selesai = khStatus;
						}
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

	return { persentaseHarianSubjects, persentaseHarianRows, jadwalSaatIni };
}

type MuridMinimal = Pick<typeof tableMurid.$inferSelect, 'id' | 'nama'>;
type KetidakhadiranMinimal = typeof tableKetidakhadiranHarian.$inferSelect;
type QueryRecord = MuridMinimal & {
	ketidakhadiranHarian: KetidakhadiranMinimal[];
	absensi: { id: number }[];
};

export async function loadHarian(params: {
	sekolahId: number;
	kelasId: number;
	search: string | null;
	pageNumber: number;
	tanggal: string;
	presensiSettings: NonNullable<PresensiCheckResult['presensiSettings']>;
	bellSettings: BellSettingsData | null;
	kegiatanCustom: CustomKegiatanData[];
	user: NonNullable<App.Locals['user']>;
	simHari: string | null;
	simJam: string | null;
	mode: 'harian' | 'persentase_harian';
	url: URL;
}): Promise<AbsenLoadData> {
	const {
		sekolahId,
		kelasId,
		search,
		pageNumber,
		tanggal,
		presensiSettings,
		bellSettings,
		kegiatanCustom,
		user,
		simHari,
		simJam,
		mode,
		url
	} = params;

	const baseFilter = and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, kelasId));
	const searchFilter = search
		? and(baseFilter, sql`${tableMurid.nama} LIKE ${'%' + search + '%'} COLLATE NOCASE`)
		: baseFilter;

	const [{ muridCount }] = await db
		.select({ muridCount: sql<number>`count(*)` })
		.from(tableMurid)
		.where(baseFilter);

	const pagination = await computePagination(db, tableMurid, searchFilter, pageNumber, url);

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
			offset: pagination.offset
		});
	} catch (error) {
		if (isTableMissingError(error)) {
			tableReady = false;
			const fallbackRecords = await db.query.tableMurid.findMany({
				columns: { id: true, nama: true },
				where: searchFilter,
				orderBy: asc(tableMurid.nama),
				limit: PER_PAGE,
				offset: pagination.offset
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
			no: pagination.offset + index + 1,
			nama: murid.nama,
			hadir: murid.absensi.length > 0 && !kh?.keterangan,
			keterangan: kh?.keterangan ?? null,
			updatedAt: kh?.updatedAt ?? kh?.createdAt ?? null
		};
	});

	if (simHari && simJam) {
		const cacheKetidakhadiran = simGetKetidakhadiran(sekolahId, kelasId, tanggal, simHari, simJam);
		const cacheAbsensi = simGetAbsensi(sekolahId, kelasId, tanggal, simHari, simJam);
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

	if (simHari && simJam) {
		const cacheKetidakhadiran = simGetKetidakhadiran(sekolahId, kelasId, tanggal, simHari, simJam);
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

	const jenisPresensi = presensiSettings.jenisPresensi ?? 'wali_kelas_saja';

	let persentaseHarianSubjects: PersentaseHarianSubject[] = [];
	let persentaseHarianRows: PersentaseHarianRow[] = [];
	let jadwalSaatIni: JadwalSaatIni | null = null;

	if (jenisPresensi === 'tiap_mapel' && tableReady && semuaMurid.length > 0) {
		const result = await computePersentaseHarian({
			sekolahId,
			kelasId,
			tanggal,
			semuaMurid,
			presensiSettings,
			bellSettings,
			kegiatanCustom,
			user,
			simHari,
			simJam
		});
		persentaseHarianSubjects = result.persentaseHarianSubjects;
		persentaseHarianRows = result.persentaseHarianRows;
		jadwalSaatIni = result.jadwalSaatIni;
	}

	return {
		meta: { title: 'Kehadiran Murid' },
		tableReady,
		page: {
			search,
			currentPage: pagination.currentPage,
			totalPages: pagination.totalPages,
			totalItems: pagination.total,
			perPage: PER_PAGE
		},
		daftarMurid: rows,
		semuaMurid,
		totalMurid: pagination.total,
		muridCount: muridCount ?? 0,
		tanggal,
		mode,
		bulan: 0,
		tahun: 0,
		daysInMonth: 0,
		totalHariBelajar: 0,
		bulananRows: [],
		raporRows: [],
		persentaseBulananRows: [],
		redDays: [],
		tanggalMulaiRapor: '',
		tanggalAkhirRapor: '',
		presensiReady: true,
		presensiWarningMessage: '',
		jenisPresensi,
		tipePresensi: presensiSettings.tipePresensi ?? 'awal_mapel',
		persentaseHarianSubjects,
		persentaseHarianRows,
		jadwalSaatIni,
		simulasiHari: simHari,
		simulasiJam: simJam
	};
}
