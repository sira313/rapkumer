import db from '$lib/server/db';
import { cookieNames } from '$lib/utils';
import {
	tableKelas,
	tableMurid,
	tableKetidakhadiranHarian,
	tableAbsensi,
	tablePresensiSettings,
	tableSekolah,
	tableSemester,
	tableTahunAjaran
} from '$lib/server/db/schema';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { buildRangeLiburDates, buildRangeRedDays } from '$lib/server/absen/libur';
import ExcelJS from 'exceljs';
import { error } from '@sveltejs/kit';

function getDaysInMonth(year: number, month: number) {
	return new Date(year, month, 0).getDate();
}

function isSunday(year: number, month: number, day: number) {
	return new Date(year, month - 1, day).getDay() === 0;
}

function isSaturday(year: number, month: number, day: number) {
	return new Date(year, month - 1, day).getDay() === 6;
}

const BULAN_NAMES = [
	'Januari',
	'Februari',
	'Maret',
	'April',
	'Mei',
	'Juni',
	'Juli',
	'Agustus',
	'September',
	'Oktober',
	'November',
	'Desember'
];

function dateStr(year: number, month: number, day: number) {
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export async function POST({ cookies, locals, request }) {
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) {
		throw error(401, 'Sekolah tidak ditemukan');
	}

	const kelasAktifId = Number(cookies.get(cookieNames.ACTIVE_KELAS_ID) || '');
	if (!kelasAktifId) {
		throw error(400, 'Pilih kelas aktif terlebih dahulu');
	}

	if (!locals.user) {
		throw error(401, 'Sesi tidak valid. Silakan login ulang.');
	}

	if (locals.user.type === 'user') {
		throw error(403, 'Anda tidak memiliki izin untuk mengunduh rekap kehadiran.');
	}

	const body = await request.json();
	const bulan = Number(body.bulan);
	const tahun = Number(body.tahun);

	if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) {
		throw error(400, 'Bulan tidak valid');
	}
	if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2099) {
		throw error(400, 'Tahun tidak valid');
	}

	const daysInMonth = getDaysInMonth(tahun, bulan);

	const kelasRecordTa = await db.query.tableKelas.findFirst({
		columns: { tahunAjaranId: true },
		where: eq(tableKelas.id, kelasAktifId)
	});
	const tahunAjaranId = kelasRecordTa?.tahunAjaranId ?? null;

	const presensiSettings = tahunAjaranId
		? await db.query.tablePresensiSettings.findFirst({
				where: and(
					eq(tablePresensiSettings.sekolahId, sekolahId),
					eq(tablePresensiSettings.tahunAjaranId, tahunAjaranId)
				)
			})
		: await db.query.tablePresensiSettings.findFirst({
				where: eq(tablePresensiSettings.sekolahId, sekolahId)
			});
	const hariSekolah = presensiSettings?.hariSekolah ?? 6;

	function expandRange(
		start: string,
		end: string
	): Array<{ tahun: number; bulanLibur: number; tanggal: string; day: number }> {
		const result: Array<{
			tahun: number;
			bulanLibur: number;
			tanggal: string;
			day: number;
		}> = [];
		const s = new Date(start + 'T00:00:00');
		const e = new Date(end + 'T00:00:00');
		const cur = new Date(s);
		while (cur <= e) {
			const y = cur.getFullYear();
			const m = cur.getMonth() + 1;
			const day = cur.getDate();
			const tanggal = dateStr(y, m, day);
			if (y === tahun && m === bulan) {
				result.push({ tahun: y, bulanLibur: m, tanggal, day });
			}
			cur.setDate(cur.getDate() + 1);
		}
		return result;
	}

	let liburDates = new Set<string>();
	let liburNasional: Array<{ tahun: number; bulanLibur: number; tanggal: string; day: number }> =
		[];
	if (presensiSettings?.liburNasional) {
		try {
			const parsed: string[] = JSON.parse(presensiSettings.liburNasional);
			if (Array.isArray(parsed)) {
				const filtered = parsed
					.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
					.map((d) => {
						const [y, m, day] = d.split('-').map(Number);
						return { tahun: y, bulanLibur: m, tanggal: d, day };
					})
					.filter((d) => d.tahun === tahun && d.bulanLibur === bulan);
				liburNasional = filtered;
				liburDates = new Set(filtered.map((d) => d.tanggal));
			}
		} catch {
			// invalid JSON, ignore
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
						typeof range?.start === 'string' &&
						typeof range?.end === 'string' &&
						/^\d{4}-\d{2}-\d{2}$/.test(range.start) &&
						/^\d{4}-\d{2}-\d{2}$/.test(range.end)
					) {
						const expanded = expandRange(range.start, range.end);
						for (const d of expanded) {
							if (!liburDates.has(d.tanggal)) {
								liburDates.add(d.tanggal);
								liburNasional.push(d);
							}
						}
					}
				}
			}
		} catch {
			// invalid JSON, ignore
		}
	}

	const sekolahRecord = await db.query.tableSekolah.findFirst({
		where: eq(tableSekolah.id, sekolahId),
		with: {
			kepalaSekolah: { columns: { nama: true, nip: true } }
		}
	});
	if (!sekolahRecord) {
		throw error(401, 'Sekolah tidak ditemukan');
	}

	const kelasRecord = await db.query.tableKelas.findFirst({
		where: eq(tableKelas.id, kelasAktifId),
		with: {
			waliKelas: { columns: { nama: true, nip: true } }
		}
	});

	const tahunAjaranRecord = await db.query.tableTahunAjaran.findFirst({
		where: eq(tableTahunAjaran.id, kelasRecord?.tahunAjaranId ?? 0)
	});

	const tahunAjaranNama = tahunAjaranRecord?.nama ?? `${tahun - 1}/${tahun}`;

	const semuaMurid = await db.query.tableMurid.findMany({
		columns: { id: true, nama: true, jenisKelamin: true },
		where: and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, kelasAktifId)),
		orderBy: asc(tableMurid.nama)
	});

	if (semuaMurid.length === 0) {
		throw error(404, 'Tidak ada murid di kelas ini');
	}

	const muridIds = semuaMurid.map((m) => m.id);

	const monthStart = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
	const monthEnd = `${tahun}-${String(bulan).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

	const allKetidakhadiran = await db.query.tableKetidakhadiranHarian.findMany({
		columns: { muridId: true, tanggal: true, keterangan: true },
		where: and(
			inArray(tableKetidakhadiranHarian.muridId, muridIds),
			sql`${tableKetidakhadiranHarian.tanggal} >= ${monthStart}`,
			sql`${tableKetidakhadiranHarian.tanggal} <= ${monthEnd}`
		)
	});

	const khMap = new Map<string, string | null>();
	for (const kh of allKetidakhadiran) {
		const key = `${kh.muridId}:${kh.tanggal}`;
		khMap.set(key, kh.keterangan);
	}

	const monthStartISO = `${monthStart}T00:00:00.000Z`;
	const monthEndISO = `${monthEnd}T23:59:59.999Z`;

	const allAbsensi = await db.query.tableAbsensi.findMany({
		columns: { muridId: true, waktu: true },
		where: and(
			inArray(tableAbsensi.muridId, muridIds),
			sql`${tableAbsensi.waktu} >= ${monthStartISO}`,
			sql`${tableAbsensi.waktu} <= ${monthEndISO}`
		)
	});

	const absensiSet = new Set<string>();
	for (const a of allAbsensi) {
		const d = a.waktu.slice(0, 10);
		const key = `${a.muridId}:${d}`;
		absensiSet.add(key);
	}

	function getStatus(muridId: number, day: number): { status: string; hasData: boolean } {
		const tanggal = dateStr(tahun, bulan, day);
		const khKey = `${muridId}:${tanggal}`;
		const absKey = `${muridId}:${tanggal}`;

		const keterangan = khMap.get(khKey);
		if (keterangan !== undefined) {
			if (keterangan === null) return { status: 'H', hasData: true };
			if (keterangan === 'sakit') return { status: 'S', hasData: true };
			if (keterangan === 'izin') return { status: 'I', hasData: true };
			if (keterangan === 'alfa') return { status: 'TK', hasData: true };
			return { status: 'TK', hasData: true };
		}

		if (absensiSet.has(absKey)) {
			return { status: 'H', hasData: true };
		}

		return { status: '', hasData: false };
	}

	const totalCols = 3 + daysInMonth + 4;

	const workbook = new ExcelJS.Workbook();
	const ws = workbook.addWorksheet('Bulanan');

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const worksheet = ws as any;

	const colWidths: Record<number, number> = {
		1: 5,
		2: 40,
		3: 6
	};
	for (let d = 1; d <= daysInMonth; d++) {
		colWidths[3 + d] = 4;
	}
	colWidths[3 + daysInMonth + 1] = 6;
	colWidths[3 + daysInMonth + 2] = 6;
	colWidths[3 + daysInMonth + 3] = 6;
	colWidths[3 + daysInMonth + 4] = 6;

	for (let c = 1; c <= totalCols; c++) {
		const width = colWidths[c] ?? 6;
		worksheet.getColumn(c).width = width;
	}

	const thinBorder = { style: 'thin' as const, color: { argb: 'FF000000' } };
	const borderStyle = {
		top: thinBorder,
		left: thinBorder,
		bottom: thinBorder,
		right: thinBorder
	};
	const centerAlign = { horizontal: 'center' as const, vertical: 'middle' as const };
	const leftAlign = { horizontal: 'left' as const, vertical: 'middle' as const };

	function isRedDay(day: number): boolean {
		const tanggal = dateStr(tahun, bulan, day);
		if (liburDates.has(tanggal)) return true;
		if (hariSekolah === 5) {
			return isSaturday(tahun, bulan, day) || isSunday(tahun, bulan, day);
		}
		return isSunday(tahun, bulan, day);
	}

	let rowIdx = 1;

	const titleRow = worksheet.getRow(rowIdx);
	titleRow.height = 30;
	const titleCell = worksheet.getCell(rowIdx, 1);
	titleCell.value = 'DAFTAR HADIR MURID';
	titleCell.font = { bold: true, size: 16 };
	titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
	worksheet.mergeCells(rowIdx, 1, rowIdx, totalCols);
	rowIdx++;

	const schoolRow = worksheet.getRow(rowIdx);
	schoolRow.height = 20;
	const schoolCell = worksheet.getCell(rowIdx, 1);
	schoolCell.value = sekolahRecord.nama.toUpperCase();
	schoolCell.font = { bold: true, size: 13 };
	schoolCell.alignment = { horizontal: 'center', vertical: 'middle' };
	worksheet.mergeCells(rowIdx, 1, rowIdx, totalCols);
	rowIdx++;

	const taRow = worksheet.getRow(rowIdx);
	taRow.height = 20;
	const taCell = worksheet.getCell(rowIdx, 1);
	taCell.value = `TAHUN AJARAN ${tahunAjaranNama}`;
	taCell.font = { bold: true, size: 12 };
	taCell.alignment = { horizontal: 'center', vertical: 'middle' };
	worksheet.mergeCells(rowIdx, 1, rowIdx, totalCols);
	rowIdx++;

	rowIdx++;

	const bulanRow = worksheet.getRow(rowIdx);
	bulanRow.height = 20;
	const bulanCell = worksheet.getCell(rowIdx, 1);
	bulanCell.value = `BULAN ${BULAN_NAMES[bulan - 1].toUpperCase()} ${tahun}`;
	bulanCell.font = { bold: true, size: 11 };
	bulanCell.alignment = { horizontal: 'center', vertical: 'middle' };
	worksheet.mergeCells(rowIdx, 1, rowIdx, totalCols);
	rowIdx++;

	const headerRow1 = worksheet.getRow(rowIdx);
	headerRow1.height = 25;

	const cellNoHeader = worksheet.getCell(rowIdx, 1);
	cellNoHeader.value = 'NO';
	cellNoHeader.font = { bold: true, size: 10 };
	cellNoHeader.alignment = centerAlign;
	cellNoHeader.border = borderStyle;

	const cellNamaHeader = worksheet.getCell(rowIdx, 2);
	cellNamaHeader.value = 'NAMA SISWA';
	cellNamaHeader.font = { bold: true, size: 10 };
	cellNamaHeader.alignment = centerAlign;
	cellNamaHeader.border = borderStyle;

	const cellLpHeader = worksheet.getCell(rowIdx, 3);
	cellLpHeader.value = 'L/P';
	cellLpHeader.font = { bold: true, size: 10 };
	cellLpHeader.alignment = centerAlign;
	cellLpHeader.border = borderStyle;

	const tanggalStartCol = 4;
	const tanggalEndCol = 3 + daysInMonth;

	if (daysInMonth > 0) {
		const cellTanggalHeader = worksheet.getCell(rowIdx, tanggalStartCol);
		cellTanggalHeader.value = 'TANGGAL';
		cellTanggalHeader.font = { bold: true, size: 10 };
		cellTanggalHeader.alignment = centerAlign;
		cellTanggalHeader.border = borderStyle;
		worksheet.mergeCells(rowIdx, tanggalStartCol, rowIdx, tanggalEndCol);

		for (let d = tanggalStartCol; d <= tanggalEndCol; d++) {
			worksheet.getCell(rowIdx, d).border = borderStyle;
		}
	}

	const summaryColStart = tanggalEndCol + 1;
	const summaryLabels = ['S', 'I', 'TK', 'JLH'];
	for (let si = 0; si < summaryLabels.length; si++) {
		const col = summaryColStart + si;
		const cell = worksheet.getCell(rowIdx, col);
		cell.value = summaryLabels[si];
		cell.font = { bold: true, size: 10 };
		cell.alignment = centerAlign;
		cell.border = borderStyle;
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
	}

	const headerRow1Idx = rowIdx;
	rowIdx++;

	const headerRow2 = worksheet.getRow(rowIdx);
	headerRow2.height = 18;

	for (let d = 1; d <= daysInMonth; d++) {
		const col = 3 + d;
		const cell = worksheet.getCell(rowIdx, col);
		cell.value = String(d).padStart(2, '0');
		cell.font = { size: 8 };
		cell.alignment = centerAlign;
		cell.border = borderStyle;
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
	}

	const headerRow2Idx = rowIdx;

	const mergeCols = [1, 2, 3];
	for (let si = 0; si < summaryLabels.length; si++) {
		mergeCols.push(summaryColStart + si);
	}
	for (const col of mergeCols) {
		worksheet.mergeCells(headerRow1Idx, col, headerRow2Idx, col);
		worksheet.getCell(headerRow1Idx, col).border = borderStyle;
		worksheet.getCell(headerRow2Idx, col).border = borderStyle;
	}

	let dataRowIdx = rowIdx + 1;

	for (let mi = 0; mi < semuaMurid.length; mi++) {
		const murid = semuaMurid[mi];
		const row = worksheet.getRow(dataRowIdx);
		row.height = 18;

		const cellNo = worksheet.getCell(dataRowIdx, 1);
		cellNo.value = mi + 1;
		cellNo.alignment = centerAlign;
		cellNo.border = borderStyle;
		cellNo.font = { size: 9 };

		const cellNama = worksheet.getCell(dataRowIdx, 2);
		cellNama.value = murid.nama;
		cellNama.alignment = leftAlign;
		cellNama.border = borderStyle;
		cellNama.font = { size: 9 };

		const cellLp = worksheet.getCell(dataRowIdx, 3);
		cellLp.value = murid.jenisKelamin;
		cellLp.alignment = centerAlign;
		cellLp.border = borderStyle;
		cellLp.font = { size: 9 };

		let countS = 0;
		let countI = 0;
		let countTK = 0;
		let countH = 0;

		for (let d = 1; d <= daysInMonth; d++) {
			const col = 3 + d;
			const cell = worksheet.getCell(dataRowIdx, col);
			cell.alignment = centerAlign;
			cell.border = borderStyle;
			cell.font = { size: 8 };

			if (isRedDay(d)) {
				cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0F0' } };
				cell.font = { size: 8, color: { argb: 'FFFF0000' } };
			}

			const { status } = getStatus(murid.id, d);
			if (status) {
				cell.value = status;
				if (!isRedDay(d)) {
					if (status === 'S') countS++;
					else if (status === 'I') countI++;
					else if (status === 'TK') countTK++;
					else if (status === 'H') countH++;
				}
			}
		}

		const jlh = countH;

		const colS = summaryColStart;
		const colI = summaryColStart + 1;
		const colTK = summaryColStart + 2;
		const colJLH = summaryColStart + 3;

		const cellS = worksheet.getCell(dataRowIdx, colS);
		cellS.value = countS || '';
		cellS.alignment = centerAlign;
		cellS.border = borderStyle;
		cellS.font = { size: 9, bold: true };

		const cellI = worksheet.getCell(dataRowIdx, colI);
		cellI.value = countI || '';
		cellI.alignment = centerAlign;
		cellI.border = borderStyle;
		cellI.font = { size: 9, bold: true };

		const cellTK = worksheet.getCell(dataRowIdx, colTK);
		cellTK.value = countTK || '';
		cellTK.alignment = centerAlign;
		cellTK.border = borderStyle;
		cellTK.font = { size: 9, bold: true };

		const cellJLH = worksheet.getCell(dataRowIdx, colJLH);
		cellJLH.value = jlh || '';
		cellJLH.alignment = centerAlign;
		cellJLH.border = borderStyle;
		cellJLH.font = { size: 9, bold: true };

		dataRowIdx++;
	}

	dataRowIdx++;

	const midCol = Math.floor(totalCols / 2);

	const mengetahuiRow = worksheet.getRow(dataRowIdx);
	mengetahuiRow.height = 20;

	const mengetahuiCell = worksheet.getCell(dataRowIdx, 1);
	mengetahuiCell.value = 'Mengetahui,';
	mengetahuiCell.font = { size: 10, italic: true };
	mengetahuiCell.alignment = centerAlign;
	worksheet.mergeCells(dataRowIdx, 1, dataRowIdx, midCol);

	dataRowIdx++;

	const kepalaLabel = sekolahRecord.statusKepalaSekolah === 'plt' ? 'Plt. Kepala' : 'Kepala';
	const kepalaTitleRow = worksheet.getRow(dataRowIdx);
	kepalaTitleRow.height = 20;

	const kepalaTitleCell = worksheet.getCell(dataRowIdx, 1);
	kepalaTitleCell.value = kepalaLabel;
	kepalaTitleCell.font = { size: 10 };
	kepalaTitleCell.alignment = centerAlign;
	worksheet.mergeCells(dataRowIdx, 1, dataRowIdx, midCol);

	dataRowIdx++;

	const sekolahNamaRow = worksheet.getRow(dataRowIdx);
	sekolahNamaRow.height = 20;

	const sekolahNamaCell = worksheet.getCell(dataRowIdx, 1);
	sekolahNamaCell.value = sekolahRecord.nama;
	sekolahNamaCell.font = { size: 10, bold: true };
	sekolahNamaCell.alignment = centerAlign;
	worksheet.mergeCells(dataRowIdx, 1, dataRowIdx, midCol);

	const waliKelasLabel = worksheet.getCell(dataRowIdx, midCol + 1);
	waliKelasLabel.value = 'Wali Kelas';
	waliKelasLabel.font = { size: 10 };
	waliKelasLabel.alignment = centerAlign;
	worksheet.mergeCells(dataRowIdx, midCol + 1, dataRowIdx, totalCols);

	dataRowIdx++;

	dataRowIdx++;

	dataRowIdx++;

	dataRowIdx++;

	dataRowIdx++;

	const kepalaNama = sekolahRecord.kepalaSekolah?.nama ?? '';
	const kepalaNip = sekolahRecord.kepalaSekolah?.nip ?? '';

	const waliKelasNama = kelasRecord?.waliKelas?.nama ?? '';
	const waliKelasNip = kelasRecord?.waliKelas?.nip ?? '';

	const signatureRow = worksheet.getRow(dataRowIdx);
	signatureRow.height = 20;

	const kepalaNamaCell = worksheet.getCell(dataRowIdx, 1);
	kepalaNamaCell.value = kepalaNama;
	kepalaNamaCell.font = { size: 10, bold: true, underline: true };
	kepalaNamaCell.alignment = centerAlign;
	worksheet.mergeCells(dataRowIdx, 1, dataRowIdx, midCol);

	const waliNamaCell = worksheet.getCell(dataRowIdx, midCol + 1);
	waliNamaCell.value = waliKelasNama;
	waliNamaCell.font = { size: 10, bold: true, underline: true };
	waliNamaCell.alignment = centerAlign;
	worksheet.mergeCells(dataRowIdx, midCol + 1, dataRowIdx, totalCols);

	dataRowIdx++;

	const nipRow = worksheet.getRow(dataRowIdx);
	nipRow.height = 20;

	const kepalaNipCell = worksheet.getCell(dataRowIdx, 1);
	kepalaNipCell.value = kepalaNip;
	kepalaNipCell.font = { size: 10 };
	kepalaNipCell.alignment = centerAlign;
	worksheet.mergeCells(dataRowIdx, 1, dataRowIdx, midCol);

	const waliNipCell = worksheet.getCell(dataRowIdx, midCol + 1);
	waliNipCell.value = waliKelasNip;
	waliNipCell.font = { size: 10 };
	waliNipCell.alignment = centerAlign;
	worksheet.mergeCells(dataRowIdx, midCol + 1, dataRowIdx, totalCols);

	worksheet.pageSetup.orientation = 'landscape';
	worksheet.pageSetup.fitToPage = true;
	worksheet.pageSetup.fitToWidth = 1;
	worksheet.pageSetup.paperSize = 9;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
 	function addPersentaseSheet(wb: any, name: string, sub1: string, sub2: string, data: any[]) {
 		const sr = sekolahRecord!;
 		const kk = kelasRecord;
 		// eslint-disable-next-line @typescript-eslint/no-explicit-any
 		const s = wb.addWorksheet(name) as any;
		const cols = 7;
		[1, 2, 3, 4, 5, 6, 7].forEach((c) => {
			const w: Record<number, number> = { 1: 5, 2: 40, 3: 8, 4: 8, 5: 8, 6: 8, 7: 14 };
			s.getColumn(c).width = w[c] ?? 8;
		});

		const mid = Math.floor(cols / 2);
		let r = 1;

		const titleCell = s.getCell(r, 1);
		titleCell.value = 'REKAP PERSENTASE KEHADIRAN';
		titleCell.font = { bold: true, size: 14 };
		titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
		s.mergeCells(r, 1, r, cols);
		r++;

		const schoolCell = s.getCell(r, 1);
		schoolCell.value = sr.nama.toUpperCase();
		schoolCell.font = { bold: true, size: 12 };
		schoolCell.alignment = { horizontal: 'center', vertical: 'middle' };
		s.mergeCells(r, 1, r, cols);
		r++;

		const taCell = s.getCell(r, 1);
		taCell.value = `TAHUN AJARAN ${tahunAjaranNama}`;
		taCell.font = { bold: true, size: 11 };
		taCell.alignment = { horizontal: 'center', vertical: 'middle' };
		s.mergeCells(r, 1, r, cols);
		r++;

		r++;

		const sub1Cell = s.getCell(r, 1);
		sub1Cell.value = sub1;
		sub1Cell.font = { bold: true, size: 11 };
		sub1Cell.alignment = { horizontal: 'center', vertical: 'middle' };
		s.mergeCells(r, 1, r, cols);
		r++;

		const sub2Cell = s.getCell(r, 1);
		sub2Cell.value = sub2;
		sub2Cell.font = { size: 10, italic: true };
		sub2Cell.alignment = { horizontal: 'center', vertical: 'middle' };
		s.mergeCells(r, 1, r, cols);
		r++;

		r++;

		const thin = { style: 'thin' as const, color: { argb: 'FF000000' } };
		const bd = { top: thin, left: thin, bottom: thin, right: thin };
		const cx = { horizontal: 'center' as const, vertical: 'middle' as const };
		const lf = { horizontal: 'left' as const, vertical: 'middle' as const };

		const headers = ['NO', 'NAMA SISWA', 'H', 'S', 'I', 'A', 'PERSENTASE'];
		for (let c = 1; c <= cols; c++) {
			const cell = s.getCell(r, c);
			cell.value = headers[c - 1];
			cell.font = { bold: true, size: 10 };
			cell.alignment = cx;
			cell.border = bd;
		}
		r++;

		for (const row of data) {
			const rr = s.getRow(r);
			rr.height = 18;

			const cNo = s.getCell(r, 1);
			cNo.value = row.no;
			cNo.alignment = cx;
			cNo.border = bd;
			cNo.font = { size: 9 };

			const cNm = s.getCell(r, 2);
			cNm.value = row.nama;
			cNm.alignment = lf;
			cNm.border = bd;
			cNm.font = { size: 9 };

			[s.getCell(r, 3), s.getCell(r, 4), s.getCell(r, 5), s.getCell(r, 6)].forEach((cell, i) => {
				const vals = [row.hadir, row.sakit, row.izin, row.alfa];
				cell.value = vals[i] || '';
				cell.alignment = cx;
				cell.border = bd;
				cell.font = { size: 9 };
			});

			const cP = s.getCell(r, 7);
			cP.value = `${row.persentase}%`;
			cP.alignment = cx;
			cP.border = bd;
			cP.font = { size: 9, bold: true };

			r++;
		}

		r++;

		const mengetahuiCell = s.getCell(r, 1);
		mengetahuiCell.value = 'Mengetahui,';
		mengetahuiCell.font = { size: 10, italic: true };
		mengetahuiCell.alignment = cx;
		s.mergeCells(r, 1, r, mid);

		r++;

		const kepalaLabel = sr.statusKepalaSekolah === 'plt' ? 'Plt. Kepala' : 'Kepala';
		const kepalaTitleCell = s.getCell(r, 1);
		kepalaTitleCell.value = kepalaLabel;
		kepalaTitleCell.font = { size: 10 };
		kepalaTitleCell.alignment = cx;
		s.mergeCells(r, 1, r, mid);

		r++;

		const sekolahNamaCell = s.getCell(r, 1);
		sekolahNamaCell.value = sr.nama;
		sekolahNamaCell.font = { size: 10, bold: true };
		sekolahNamaCell.alignment = cx;
		s.mergeCells(r, 1, r, mid);

		const waliLabel = s.getCell(r, mid + 1);
		waliLabel.value = 'Wali Kelas';
		waliLabel.font = { size: 10 };
		waliLabel.alignment = cx;
		s.mergeCells(r, mid + 1, r, cols);

		r++;

		r += 4;

		const knNama = sr.kepalaSekolah?.nama ?? '';
		const knNip = sr.kepalaSekolah?.nip ?? '';
		const wkNama = kk?.waliKelas?.nama ?? '';
		const wkNip = kk?.waliKelas?.nip ?? '';

		const knCell = s.getCell(r, 1);
		knCell.value = knNama;
		knCell.font = { size: 10, bold: true, underline: true };
		knCell.alignment = cx;
		s.mergeCells(r, 1, r, mid);

		const wnCell = s.getCell(r, mid + 1);
		wnCell.value = wkNama;
		wnCell.font = { size: 10, bold: true, underline: true };
		wnCell.alignment = cx;
		s.mergeCells(r, mid + 1, r, cols);

		r++;

		const knipCell = s.getCell(r, 1);
		knipCell.value = knNip;
		knipCell.font = { size: 10 };
		knipCell.alignment = cx;
		s.mergeCells(r, 1, r, mid);

		const wnipCell = s.getCell(r, mid + 1);
		wnipCell.value = wkNip;
		wnipCell.font = { size: 10 };
		wnipCell.alignment = cx;
		s.mergeCells(r, mid + 1, r, cols);

		s.pageSetup.orientation = 'landscape';
		s.pageSetup.fitToPage = true;
		s.pageSetup.fitToWidth = 1;
		s.pageSetup.paperSize = 9;
	}

	let totalHariBelajarBulanan = 0;
	for (let d = 1; d <= daysInMonth; d++) {
		if (!isRedDay(d)) totalHariBelajarBulanan++;
	}

	const persentaseBulananData = semuaMurid.map((murid, index) => {
		let hadir = 0,
			sakit = 0,
			izin = 0,
			alfa = 0;
		for (let d = 1; d <= daysInMonth; d++) {
			if (isRedDay(d)) continue;
			const { status } = getStatus(murid.id, d);
			if (status === 'H') hadir++;
			else if (status === 'S') sakit++;
			else if (status === 'I') izin++;
			else if (status === 'TK') alfa++;
		}
		const persentase =
			totalHariBelajarBulanan > 0 ? Math.round((hadir / totalHariBelajarBulanan) * 100) : 0;
		return { no: index + 1, nama: murid.nama, hadir, sakit, izin, alfa, persentase };
	});

	addPersentaseSheet(
		workbook,
		'Persentase Bulanan',
		`PERSENTASE BULAN ${BULAN_NAMES[bulan - 1].toUpperCase()} ${tahun}`,
		`(${totalHariBelajarBulanan} hari belajar)`,
		persentaseBulananData
	);

	// ---- Persentase Semester sheet ----
	const semesterRecord = kelasRecord?.semesterId
		? await db.query.tableSemester.findFirst({
				where: eq(tableSemester.id, kelasRecord.semesterId),
				columns: { tanggalMasuk: true, tanggalBagiRaport: true }
			})
		: null;

	const tanggalMulaiSem = semesterRecord?.tanggalMasuk;
	const tanggalAkhirSem = semesterRecord?.tanggalBagiRaport;

	if (tanggalMulaiSem && tanggalAkhirSem && presensiSettings) {
		const rangeLiburDates = buildRangeLiburDates(
			presensiSettings,
			tanggalMulaiSem,
			tanggalAkhirSem
		);
		const { allDates, redDaySet } = buildRangeRedDays(
			hariSekolah,
			tanggalMulaiSem,
			tanggalAkhirSem,
			rangeLiburDates
		);
		const totalHariSem = allDates.length - redDaySet.size;

		const semKetidakhadiran = await db.query.tableKetidakhadiranHarian.findMany({
			columns: { muridId: true, tanggal: true, keterangan: true },
			where: and(
				inArray(tableKetidakhadiranHarian.muridId, muridIds),
				sql`${tableKetidakhadiranHarian.tanggal} >= ${tanggalMulaiSem}`,
				sql`${tableKetidakhadiranHarian.tanggal} <= ${tanggalAkhirSem}`,
				sql`${tableKetidakhadiranHarian.mataPelajaranId} IS NULL`
			)
		});

		const semKhMap = new Map<string, string | null>();
		for (const kh of semKetidakhadiran) {
			semKhMap.set(`${kh.muridId}:${kh.tanggal}`, kh.keterangan);
		}

		const rangeStartISO = `${tanggalMulaiSem}T00:00:00.000Z`;
		const rangeEndISO = `${tanggalAkhirSem}T23:59:59.999Z`;

		const semAbsensi = await db.query.tableAbsensi.findMany({
			columns: { muridId: true, waktu: true },
			where: and(
				inArray(tableAbsensi.muridId, muridIds),
				sql`${tableAbsensi.waktu} >= ${rangeStartISO}`,
				sql`${tableAbsensi.waktu} <= ${rangeEndISO}`,
				sql`${tableAbsensi.mataPelajaranId} IS NULL`
			)
		});

		const semAbsensiSet = new Set<string>();
		for (const a of semAbsensi) {
			semAbsensiSet.add(`${a.muridId}:${a.waktu.slice(0, 10)}`);
		}

		const persentaseSemesterData = semuaMurid.map((murid, index) => {
			let hadir = 0,
				sakit = 0,
				izin = 0,
				alfa = 0;
			for (const tgl of allDates) {
				if (redDaySet.has(tgl)) continue;
				const keterangan = semKhMap.get(`${murid.id}:${tgl}`);
				if (keterangan !== undefined) {
					if (keterangan === null) hadir++;
					else if (keterangan === 'sakit') sakit++;
					else if (keterangan === 'izin') izin++;
					else alfa++;
				} else if (semAbsensiSet.has(`${murid.id}:${tgl}`)) {
					hadir++;
				} else {
					alfa++;
				}
			}
			const persentase = totalHariSem > 0 ? Math.round((hadir / totalHariSem) * 100) : 0;
			return { no: index + 1, nama: murid.nama, hadir, sakit, izin, alfa, persentase };
		});

		addPersentaseSheet(
			workbook,
			'Persentase Semester',
			'PERSENTASE SEMESTER',
			`(${tanggalMulaiSem} s.d. ${tanggalAkhirSem}, ${totalHariSem} hari belajar)`,
			persentaseSemesterData
		);
	}

	const buffer = (await workbook.xlsx.writeBuffer()) as Buffer;

	const filename = `Rekap_Kehadiran_${BULAN_NAMES[bulan - 1]}_${tahun}.xlsx`;

	return new Response(new Uint8Array(buffer), {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
}
