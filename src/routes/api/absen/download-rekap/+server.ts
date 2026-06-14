import db from '$lib/server/db';
import { cookieNames } from '$lib/utils';
import {
	tableKelas,
	tableMurid,
	tableKetidakhadiranHarian,
	tableAbsensi,
	tablePresensiSettings,
	tableSekolah,
	tableTahunAjaran
} from '$lib/server/db/schema';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
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
	const ws = workbook.addWorksheet('Rekap Kehadiran');

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
	waliKelasLabel.font = { size: 10, italic: true };
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

	const buffer = (await workbook.xlsx.writeBuffer()) as Buffer;

	const filename = `Rekap_Kehadiran_${BULAN_NAMES[bulan - 1]}_${tahun}.xlsx`;

	return new Response(new Uint8Array(buffer), {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
}
