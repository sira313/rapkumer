import db from '$lib/server/db';
import { tableKeasramaan, tableMurid, tableKelas } from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { isAuthorizedUser } from '../../../pengguna/permissions';

export async function POST({ request, locals }) {
	if (!isAuthorizedUser(['input_nilai_asesmen_keasramaan'], locals.user)) {
		throw error(403, 'Akses ditolak.');
	}
	try {
		const formData = await request.formData();
		const keasramaanIdRaw = formData.get('keasramaanId')?.toString();
		const kelasIdRaw = formData.get('kelasId')?.toString();

		if (!keasramaanIdRaw || !kelasIdRaw || !locals.sekolah?.id) {
			throw error(400, 'Data tidak lengkap');
		}

		const keasramaanId = Number(keasramaanIdRaw);
		const kelasId = Number(kelasIdRaw);
		if (!Number.isInteger(keasramaanId) || !Number.isInteger(kelasId)) {
			throw error(400, 'ID tidak valid');
		}

		// Get keasramaan with indikators and tujuan
		const keasramaan = await db.query.tableKeasramaan.findFirst({
			where: eq(tableKeasramaan.id, keasramaanId),
			with: {
				indikator: {
					with: {
						tujuan: true
					}
				}
			}
		});

		if (!keasramaan || keasramaan.kelasId !== kelasId) {
			throw error(404, 'Keasramaan tidak ditemukan');
		}

		// Get all murid in the class
		const muridList = await db.query.tableMurid.findMany({
			columns: { id: true, nama: true },
			where: eq(tableMurid.kelasId, kelasId),
			orderBy: asc(tableMurid.nama)
		});

		// Get kelas info for filename
		const kelas = await db.query.tableKelas.findFirst({
			where: eq(tableKelas.id, kelasId),
			columns: { nama: true }
		});

		// Create workbook
		const workbook = new ExcelJS.Workbook();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const worksheet: any = workbook.addWorksheet('Asesmen Keasramaan');

		// Build headers structure
		// Row 1: Title (Matev name) - merged across all columns
		// Row 2: Class name - merged across all columns
		// Row 3: No, Nama, then Indikator names (merged cells)
		// Row 4: TP numbers (TP 1, TP 2, TP 3, etc.)

		const headerRow1 = ['No', 'Nama'];
		const headerRow2 = ['', ''];
		const headerMapping: Array<{ indikatorId: number; tujuanId: number; label: string }> = [];
		const mergeRanges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> = [];

		let colIndex = 3; // Start from column 3 (C)
		for (const indikator of keasramaan.indikator) {
			const tujuanCount = indikator.tujuan.length;
			const startCol = colIndex;

			// Add indikator name to row 1
			headerRow1.push(indikator.deskripsi);
			// Add empty cells for merged range
			for (let i = 1; i < tujuanCount; i++) {
				headerRow1.push('');
			}

			// Add TP numbers to row 2
			for (let tpIndex = 0; tpIndex < tujuanCount; tpIndex++) {
				const tujuan = indikator.tujuan[tpIndex];
				headerRow2.push(`TP ${tpIndex + 1}`);
				headerMapping.push({
					indikatorId: indikator.id,
					tujuanId: tujuan.id,
					label: `TP ${tpIndex + 1}`
				});
			}

			// Create merge range for indikator name (row 1)
			if (tujuanCount > 1) {
				mergeRanges.push({
					s: { r: 0, c: startCol - 1 },
					e: { r: 0, c: startCol + tujuanCount - 2 }
				});
			}

			colIndex += tujuanCount;
		}

		// Add title rows
		const titleRow = Array(headerRow1.length).fill(null);
		titleRow[0] = keasramaan.nama;
		worksheet.addRow(titleRow);

		const classRow = Array(headerRow1.length).fill(null);
		classRow[0] = kelas?.nama ?? 'Kelas';
		worksheet.addRow(classRow);

		// Add header rows
		worksheet.addRow(headerRow1);
		worksheet.addRow(headerRow2);

		// Merge title and class rows across all columns
		const lastCol = headerRow1.length;
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
		worksheet.mergeCells(`A1:${lastColLetter(lastCol)}1`);
		worksheet.mergeCells(`A2:${lastColLetter(lastCol)}2`);

		// Merge cells for No and Nama columns (rows 3-4)
		worksheet.mergeCells('A3:A4');
		worksheet.mergeCells('B3:B4');

		// Set alignment for merged cells immediately after merge
		worksheet.getCell('A3').alignment = {
			horizontal: 'center',
			vertical: 'middle',
			wrapText: true
		};
		worksheet.getCell('B3').alignment = {
			horizontal: 'center',
			vertical: 'middle',
			wrapText: true
		};

		// Apply merge ranges for indikator columns (offset by 2 for title rows)
		for (const merge of mergeRanges) {
			worksheet.mergeCells(merge.s.r + 3, merge.s.c + 1, merge.e.r + 3, merge.e.c + 1);
		}

		// Format title and class rows (bold, center)
		for (let rowNum = 1; rowNum <= 2; rowNum++) {
			const row = worksheet.getRow(rowNum);
			row.font = { bold: true, size: 12 };
			row.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
			row.height = 24;
		}

		// Format header rows (rows 3-4: bold, center, with borders)
		const borderStyle = {
			top: { style: 'thin' },
			left: { style: 'thin' },
			bottom: { style: 'thin' },
			right: { style: 'thin' }
		};

		for (let rowNum = 3; rowNum <= 4; rowNum++) {
			const row = worksheet.getRow(rowNum);
			row.font = { bold: true };

			// Apply borders to all cells in header rows
			for (let colNum = 1; colNum <= headerRow1.length; colNum++) {
				const cell = worksheet.getCell(rowNum, colNum);
				cell.border = borderStyle;
				// Set alignment for all header cells except merged A and B columns
				if (colNum > 2) {
					cell.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
				}
			}
		}

		// Re-apply alignment for merged cells A3:A4 and B3:B4 after loop
		worksheet.getCell('A3').alignment = {
			horizontal: 'center',
			vertical: 'middle',
			wrapText: true
		};
		worksheet.getCell('B3').alignment = {
			horizontal: 'center',
			vertical: 'middle',
			wrapText: true
		};

		// Add murid rows (empty cells for data entry)
		for (let i = 0; i < muridList.length; i++) {
			const murid = muridList[i];
			const row = [i + 1, murid.nama];

			// Add empty cells for each TP
			for (let j = 0; j < headerMapping.length; j++) {
				row.push('');
			}

			worksheet.addRow(row);
		}

		// Apply borders to data rows (start from row 5, after 2 title + 2 header rows)
		for (let rowNum = 5; rowNum <= muridList.length + 4; rowNum++) {
			for (let colNum = 1; colNum <= headerRow1.length; colNum++) {
				const cell = worksheet.getCell(rowNum, colNum);
				cell.border = borderStyle;
				cell.alignment = { vertical: 'center', wrapText: true };
			}
		}

		// Set column widths
		worksheet.columns = [{ width: 5 }, { width: 20 }, ...headerMapping.map(() => ({ width: 18 }))];

		// Add data validation (dropdown) for asesmen columns
		const kategoriList = ['Sangat Baik', 'Baik', 'Cukup', 'Perlu Bimbingan'];
		const kategoriDisplay = kategoriList.join(',');

		// Apply dropdown to data rows (starting from row 5, offset by 2 title rows)
		for (let rowNum = 5; rowNum <= muridList.length + 4; rowNum++) {
			// Apply to columns C onwards (asesmen columns)
			for (let colNum = 3; colNum < 3 + headerMapping.length; colNum++) {
				const cell = worksheet.getCell(rowNum, colNum);
				cell.dataValidation = {
					type: 'list',
					allowBlank: true,
					formulae: [`"${kategoriDisplay}"`],
					showDropDown: true
				};
			}
		}

		// Generate buffer
		const buffer = await workbook.xlsx.writeBuffer();

		const kelasNama = kelas?.nama ?? 'Kelas';
		const sanitize = (s: string) =>
			String(s)
				.replace(/[\\/:*?"<>|]/g, '-')
				.trim();

		return new Response(new Uint8Array(buffer as ArrayBuffer), {
			headers: {
				'Content-Disposition': `attachment; filename="${sanitize(keasramaan.nama)}-${sanitize(kelasNama)}.xlsx"`,
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
