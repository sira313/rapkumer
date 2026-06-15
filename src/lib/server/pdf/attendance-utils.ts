import db from '$lib/server/db';
import { and, eq, sql } from 'drizzle-orm';
import {
	tablePresensiSettings,
	tableKetidakhadiranHarian,
	tableAbsensi,
	tableKetidakhadiranRapor
} from '$lib/server/db/schema';

function dateStr(year: number, month: number, day: number) {
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isSunday(year: number, month: number, day: number) {
	return new Date(year, month - 1, day).getDay() === 0;
}

function isSaturday(year: number, month: number, day: number) {
	return new Date(year, month - 1, day).getDay() === 6;
}

export type AttendanceCounts = {
	sakit: number;
	izin: number;
	alfa: number;
};

export async function computeRaporAttendance(
	sekolahId: number,
	tahunAjaranId: number,
	muridId: number,
	semester: { id: number; tanggalMasuk: string | null; tanggalBagiRaport: string | null }
): Promise<AttendanceCounts> {
	const tanggalMulaiRapor = semester.tanggalMasuk;
	const tanggalAkhirRapor = semester.tanggalBagiRaport;
	const semesterId = semester.id;

	if (!tanggalMulaiRapor || !tanggalAkhirRapor || !semesterId) {
		return { sakit: 0, izin: 0, alfa: 0 };
	}

	const presensiSettings = await db.query.tablePresensiSettings.findFirst({
		where: and(
			eq(tablePresensiSettings.sekolahId, sekolahId),
			eq(tablePresensiSettings.tahunAjaranId, tahunAjaranId)
		)
	});

	const hariSekolah = presensiSettings?.hariSekolah ?? 6;

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
				for (const r of parsed) {
					if (
						r?.start &&
						r?.end &&
						/^\d{4}-\d{2}-\d{2}$/.test(r.start) &&
						/^\d{4}-\d{2}-\d{2}$/.test(r.end)
					) {
						const s = new Date(r.start + 'T00:00:00');
						const e = new Date(r.end + 'T00:00:00');
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

	const allKetidakhadiran = await db.query.tableKetidakhadiranHarian.findMany({
		columns: { tanggal: true, keterangan: true },
		where: and(
			eq(tableKetidakhadiranHarian.muridId, muridId),
			sql`${tableKetidakhadiranHarian.tanggal} >= ${tanggalMulaiRapor}`,
			sql`${tableKetidakhadiranHarian.tanggal} <= ${tanggalAkhirRapor}`
		)
	});

	const khMap = new Map<string, string | null>();
	for (const kh of allKetidakhadiran) {
		khMap.set(kh.tanggal, kh.keterangan);
	}

	const rangeStartISO = `${tanggalMulaiRapor}T00:00:00.000Z`;
	const rangeEndISO = `${tanggalAkhirRapor}T23:59:59.999Z`;

	const allAbsensi = await db.query.tableAbsensi.findMany({
		columns: { waktu: true },
		where: and(
			eq(tableAbsensi.muridId, muridId),
			sql`${tableAbsensi.waktu} >= ${rangeStartISO}`,
			sql`${tableAbsensi.waktu} <= ${rangeEndISO}`
		)
	});

	const absensiSet = new Set<string>();
	for (const a of allAbsensi) {
		absensiSet.add(a.waktu.slice(0, 10));
	}

	const override = await db.query.tableKetidakhadiranRapor.findFirst({
		columns: { sakit: true, izin: true, alfa: true },
		where: and(
			eq(tableKetidakhadiranRapor.muridId, muridId),
			eq(tableKetidakhadiranRapor.semesterId, semesterId)
		)
	});

	let sakit = 0,
		izin = 0,
		alfa = 0;
	for (const tgl of allDates) {
		if (redDaySet.has(tgl)) continue;
		const keterangan = khMap.get(tgl);
		if (keterangan !== undefined) {
			if (keterangan === null) {
				/* hadir */
			} else if (keterangan === 'sakit') sakit++;
			else if (keterangan === 'izin') izin++;
			else alfa++;
		} else if (absensiSet.has(tgl)) {
			/* hadir */
		} else {
			alfa++;
		}
	}

	return {
		sakit: override?.sakit ?? sakit,
		izin: override?.izin ?? izin,
		alfa: override?.alfa ?? alfa
	};
}
