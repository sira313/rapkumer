import db from '$lib/server/db';
import { tableKokurikuler, tableMurid, tableKelas } from '$lib/server/db/schema';
import { asc, eq } from 'drizzle-orm';
import { sanitizeDimensionList } from '$lib/kokurikuler';
import { profilPelajarPancasilaDimensionLabelByKey } from '$lib/statics';
import ExcelJS from 'exceljs';

function jsonError(message: string, status: number) {
	return new Response(JSON.stringify({ message }), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

export async function POST({ request, locals }) {
	try {
		const formData = await request.formData();
		const kokurikulerIdRaw = formData.get('kokurikulerId')?.toString();
		const kelasIdRaw = formData.get('kelasId')?.toString();

		if (!kokurikulerIdRaw || !kelasIdRaw || !locals.sekolah?.id) {
			return jsonError('Data tidak lengkap', 400);
		}

		const kokurikulerId = Number(kokurikulerIdRaw);
		const kelasId = Number(kelasIdRaw);
		if (!Number.isInteger(kokurikulerId) || !Number.isInteger(kelasId)) {
			return jsonError('ID tidak valid', 400);
		}

		const kokurikuler = await db.query.tableKokurikuler.findFirst({
			where: eq(tableKokurikuler.id, kokurikulerId)
		});

		if (!kokurikuler || kokurikuler.kelasId !== kelasId) {
			return jsonError('Kokurikuler tidak ditemukan', 404);
		}

		const dimensiList = sanitizeDimensionList(kokurikuler.dimensi);
		const dimensiLabels = dimensiList.map(
			(key) => profilPelajarPancasilaDimensionLabelByKey[key] ?? key
		);

		const muridList = await db.query.tableMurid.findMany({
			columns: { id: true, nama: true },
			where: eq(tableMurid.kelasId, kelasId),
			orderBy: asc(tableMurid.nama)
		});

		const kelas = await db.query.tableKelas.findFirst({
			where: eq(tableKelas.id, kelasId),
			columns: { nama: true }
		});

		const workbook = new ExcelJS.Workbook();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const worksheet: any = workbook.addWorksheet('Nilai Kokurikuler');

		const totalDimensi = dimensiLabels.length;
		const lastCol = 2 + totalDimensi;

		const lastColLetter = (colNum: number) => {
			let n = colNum;
			let s = '';
			while (n > 0) {
				const m = (n - 1) % 26;
				s = String.fromCharCode(65 + m) + s;
				n = Math.floor((n - 1) / 26);
			}
			return s;
		};

		const borderStyle = {
			top: { style: 'thin' },
			left: { style: 'thin' },
			bottom: { style: 'thin' },
			right: { style: 'thin' }
		};

		const titleRow = Array(lastCol).fill(null);
		titleRow[0] = kokurikuler.tujuan;
		worksheet.addRow(titleRow);
		worksheet.mergeCells(`A1:${lastColLetter(lastCol)}1`);

		const classRow = Array(lastCol).fill(null);
		classRow[0] = kelas?.nama ?? 'Kelas';
		worksheet.addRow(classRow);
		worksheet.mergeCells(`A2:${lastColLetter(lastCol)}2`);

		const headerRow = ['No', 'Nama', ...dimensiLabels];
		worksheet.addRow(headerRow);

		for (let rowNum = 1; rowNum <= 2; rowNum++) {
			const row = worksheet.getRow(rowNum);
			row.font = { bold: true, size: 12 };
			row.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
			row.height = 24;
		}

		for (let colNum = 1; colNum <= lastCol; colNum++) {
			const cell = worksheet.getCell(3, colNum);
			cell.border = borderStyle;
			cell.font = { bold: true };
			cell.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
		}

		for (let i = 0; i < muridList.length; i++) {
			const murid = muridList[i];
			const row = [i + 1, murid.nama];
			for (let j = 0; j < totalDimensi; j++) {
				row.push('');
			}
			worksheet.addRow(row);
		}

		const kategoriList = ['Sangat Baik', 'Baik', 'Cukup', 'Perlu Bimbingan'];
		for (let rowNum = 4; rowNum <= muridList.length + 3; rowNum++) {
			for (let colNum = 1; colNum <= lastCol; colNum++) {
				const cell = worksheet.getCell(rowNum, colNum);
				cell.border = borderStyle;
				cell.alignment = { vertical: 'center', wrapText: true };
			}
			for (let colNum = 3; colNum <= lastCol; colNum++) {
				const cell = worksheet.getCell(rowNum, colNum);
				cell.dataValidation = {
					type: 'list',
					allowBlank: true,
					formulae: [`"${kategoriList.join(',')}"`],
					showDropDown: true
				};
			}
		}

		worksheet.columns = [
			{ width: 5 },
			{ width: 20 },
			...Array.from({ length: totalDimensi }, () => ({ width: 22 }))
		];

		const buffer = await workbook.xlsx.writeBuffer();

		const sanitize = (s: string) =>
			String(s)
				.replace(/[\\/:*?"<>|]/g, '-')
				.trim();

		const filename = `${sanitize(kokurikuler.tujuan)}-${sanitize(kelas?.nama ?? 'Kelas')}.xlsx`;

		return new Response(new Uint8Array(buffer as ArrayBuffer), {
			headers: {
				'Content-Disposition': `attachment; filename="${filename}"`,
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
			}
		});
	} catch (err) {
		console.error('Download template error:', err);
		return jsonError('Gagal membuat template', 500);
	}
}
