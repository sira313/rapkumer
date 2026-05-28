import db from '$lib/server/db';
import {
	tableEkstrakurikuler,
	tableMurid,
	tableKelas,
	tableEkstrakurikulerTujuan
} from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';

export async function POST({ request, locals }) {
	try {
		const formData = await request.formData();
		const ekstrakurikulerIdRaw = formData.get('ekstrakurikulerId')?.toString();
		const kelasIdRaw = formData.get('kelasId')?.toString();

		if (!ekstrakurikulerIdRaw || !kelasIdRaw || !locals.sekolah?.id) {
			throw error(400, 'Data tidak lengkap');
		}

		const ekstrakurikulerId = Number(ekstrakurikulerIdRaw);
		const kelasId = Number(kelasIdRaw);
		if (!Number.isInteger(ekstrakurikulerId) || !Number.isInteger(kelasId)) {
			throw error(400, 'ID tidak valid');
		}

		const ekstrakurikuler = await db.query.tableEkstrakurikuler.findFirst({
			where: eq(tableEkstrakurikuler.id, ekstrakurikulerId)
		});

		if (!ekstrakurikuler || ekstrakurikuler.kelasId !== kelasId) {
			throw error(404, 'Ekstrakurikuler tidak ditemukan');
		}

		const tujuanList = await db.query.tableEkstrakurikulerTujuan.findMany({
			where: eq(tableEkstrakurikulerTujuan.ekstrakurikulerId, ekstrakurikulerId),
			orderBy: asc(tableEkstrakurikulerTujuan.createdAt)
		});

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
		const worksheet: any = workbook.addWorksheet('Nilai Ekstrakurikuler');

		const totalTujuan = tujuanList.length;
		const lastCol = 2 + totalTujuan;

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

		// Row 1: Title (ekstrakurikuler name) — merged across all columns
		const titleRow = Array(lastCol).fill(null);
		titleRow[0] = ekstrakurikuler.nama;
		worksheet.addRow(titleRow);
		worksheet.mergeCells(`A1:${lastColLetter(lastCol)}1`);

		// Row 2: Class name — merged across all columns
		const classRow = Array(lastCol).fill(null);
		classRow[0] = kelas?.nama ?? 'Kelas';
		worksheet.addRow(classRow);
		worksheet.mergeCells(`A2:${lastColLetter(lastCol)}2`);

		// Row 3: Headers — No, Nama, TP 1, TP 2, ...
		const headerRow = ['No', 'Nama'];
		for (let i = 0; i < totalTujuan; i++) {
			headerRow.push(`TP ${i + 1}`);
		}
		worksheet.addRow(headerRow);

		// Format title rows
		for (let rowNum = 1; rowNum <= 2; rowNum++) {
			const row = worksheet.getRow(rowNum);
			row.font = { bold: true, size: 12 };
			row.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
			row.height = 24;
		}

		// Format header row (row 3)
		for (let colNum = 1; colNum <= lastCol; colNum++) {
			const cell = worksheet.getCell(3, colNum);
			cell.border = borderStyle;
			cell.font = { bold: true };
			cell.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
		}

		// Add murid rows
		for (let i = 0; i < muridList.length; i++) {
			const murid = muridList[i];
			const row = [i + 1, murid.nama];
			for (let j = 0; j < totalTujuan; j++) {
				row.push('');
			}
			worksheet.addRow(row);
		}

		// Apply borders and dropdown to data rows (start from row 4)
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
			...Array.from({ length: totalTujuan }, () => ({ width: 18 }))
		];

		const buffer = await workbook.xlsx.writeBuffer();

		const sanitize = (s: string) =>
			String(s)
				.replace(/[\\/:*?"<>|]/g, '-')
				.trim();

		return new Response(new Uint8Array(buffer as ArrayBuffer), {
			headers: {
				'Content-Disposition': `attachment; filename="${sanitize(ekstrakurikuler.nama)}-${sanitize(kelas?.nama ?? 'Kelas')}.xlsx"`,
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
			}
		});
	} catch (err) {
		console.error('Download template error:', err);
		return new Response(JSON.stringify({ message: 'Gagal membuat template' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
}
