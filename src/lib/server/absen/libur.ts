import { isSunday, isSaturday, dateStr } from './utils';

export function buildLiburDates(
	presensiSettings: { liburNasional?: string | null; liburSemester?: string | null } | null,
	tahun: number,
	bulan: number
): Set<string> {
	const liburDates = new Set<string>();
	if (!presensiSettings) return liburDates;

	if (presensiSettings.liburNasional) {
		try {
			const parsed: string[] = JSON.parse(presensiSettings.liburNasional);
			if (Array.isArray(parsed)) {
				for (const d of parsed) {
					if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
						const [y, m] = d.split('-').map(Number);
						if (y === tahun && m === bulan) {
							liburDates.add(d);
						}
					}
				}
			}
		} catch {
			/* ignore */
		}
	}

	if (presensiSettings.liburSemester) {
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
							if (y === tahun && m === bulan && !liburDates.has(tgl)) {
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

	return liburDates;
}

export function buildRedDays(
	hariSekolah: number,
	tahun: number,
	bulan: number,
	daysInMonth: number,
	liburDates: Set<string>
): number[] {
	const redDays: number[] = [];
	for (let d = 1; d <= daysInMonth; d++) {
		const isWeekend =
			hariSekolah === 5
				? isSaturday(tahun, bulan, d) || isSunday(tahun, bulan, d)
				: isSunday(tahun, bulan, d);
		const tgl = dateStr(tahun, bulan, d);
		if (isWeekend || liburDates.has(tgl)) {
			redDays.push(d);
		}
	}
	return redDays;
}

export function buildRangeLiburDates(
	presensiSettings: { liburNasional?: string | null; liburSemester?: string | null } | null,
	tanggalMulai: string,
	tanggalAkhir: string
): Set<string> {
	const liburDates = new Set<string>();
	if (!presensiSettings) return liburDates;

	const rangeStartDate = new Date(tanggalMulai + 'T00:00:00');
	const rangeEndDate = new Date(tanggalAkhir + 'T00:00:00');

	if (presensiSettings.liburNasional) {
		try {
			const parsed: string[] = JSON.parse(presensiSettings.liburNasional);
			if (Array.isArray(parsed)) {
				for (const d of parsed) {
					if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d >= tanggalMulai && d <= tanggalAkhir) {
						liburDates.add(d);
					}
				}
			}
		} catch {
			/* ignore */
		}
	}

	if (presensiSettings.liburSemester) {
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

	return liburDates;
}

export function buildRangeRedDays(
	hariSekolah: number,
	tanggalMulai: string,
	tanggalAkhir: string,
	liburDates: Set<string>
): { allDates: string[]; redDaySet: Set<string> } {
	const allDates: string[] = [];
	const redDaySet = new Set<string>();
	const startDate = new Date(tanggalMulai + 'T00:00:00');
	const endDate = new Date(tanggalAkhir + 'T00:00:00');
	const cur = new Date(startDate);

	while (cur <= endDate) {
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

	return { allDates, redDaySet };
}
