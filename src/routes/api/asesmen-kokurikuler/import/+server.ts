import type { RequestHandler } from '@sveltejs/kit';
import db from '$lib/server/db';
import { tableAsesmenKokurikuler, tableKokurikuler, tableMurid } from '$lib/server/db/schema';
import { type NilaiKategori, sanitizeDimensionList } from '$lib/kokurikuler';
import { profilPelajarPancasilaDimensionLabelByKey } from '$lib/statics';
import { eq } from 'drizzle-orm';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const formData = await request.formData();
		const kokurikulerIdRaw = formData.get('kokurikulerId')?.toString();
		const kelasIdRaw = formData.get('kelasId')?.toString();
		const file = formData.get('file') as File | null;

		if (!kokurikulerIdRaw || !kelasIdRaw || !locals.sekolah?.id || !file) {
			return json({ success: false, message: 'Data tidak lengkap' }, { status: 400 });
		}

		const kokurikulerId = Number(kokurikulerIdRaw);
		const kelasId = Number(kelasIdRaw);
		if (!Number.isInteger(kokurikulerId) || !Number.isInteger(kelasId)) {
			return json({ success: false, message: 'ID tidak valid' }, { status: 400 });
		}

		const kokurikuler = await db.query.tableKokurikuler.findFirst({
			where: eq(tableKokurikuler.id, kokurikulerId)
		});

		if (!kokurikuler || kokurikuler.kelasId !== kelasId) {
			return json({ success: false, message: 'Kokurikuler tidak ditemukan' }, { status: 404 });
		}

		const dimensiKeys = sanitizeDimensionList(kokurikuler.dimensi);
		const dimensiLabels = dimensiKeys.map(
			(key) => profilPelajarPancasilaDimensionLabelByKey[key] ?? key
		);

		const arrayBuffer = await file.arrayBuffer();
		const exceljsMod = await import('exceljs');
		const ExcelJSImport = (exceljsMod.default ?? exceljsMod) as unknown as {
			Workbook: { new (): unknown };
		};
		const workbook = new ExcelJSImport.Workbook() as {
			xlsx: { load: (buf: Buffer) => Promise<void> };
			worksheets: unknown[];
		};
		await workbook.xlsx.load(Buffer.from(arrayBuffer));
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const worksheet: any = workbook.worksheets?.[0];

		if (!worksheet) {
			return json({ success: false, message: 'File Excel tidak valid' }, { status: 400 });
		}

		// Validate file name matches selected kokurikuler (Row 1)
		const fileTujuan = worksheet.getCell(1, 1).value?.toString().trim();
		if (fileTujuan && fileTujuan !== kokurikuler.tujuan) {
			return json(
				{
					success: false,
					message: `File tidak sesuai! File berisi "${fileTujuan}" tetapi Anda memilih "${kokurikuler.tujuan}". Pastikan file yang diupload sudah benar.`
				},
				{ status: 400 }
			);
		}

		// Parse headers — Row 3
		const headerRow = worksheet.getRow(3);
		const headers: string[] = [];
		headerRow?.eachCell((cell: { value: unknown }) => {
			headers.push(String(cell.value ?? ''));
		});

		if (headers.length < 2) {
			return json({ success: false, message: 'Format file tidak sesuai' }, { status: 400 });
		}

		// Validate dimensi column count
		const dataColumnsCount = headers.length - 2;
		const expectedDimensiCount = dimensiLabels.length;
		if (dataColumnsCount !== expectedDimensiCount) {
			return json(
				{
					success: false,
					message: `Struktur file tidak sesuai! File memiliki ${dataColumnsCount} kolom dimensi tetapi kokurikuler ini memiliki ${expectedDimensiCount} dimensi. Pastikan download template terbaru.`
				},
				{ status: 400 }
			);
		}

		// Build column-to-dimensiKey map
		const colToDimensiMap = new Map<number, string>();
		for (let i = 0; i < dimensiKeys.length; i++) {
			colToDimensiMap.set(3 + i, dimensiKeys[i]);
		}

		// Get all murid to find by name
		const allMurid = await db.query.tableMurid.findMany({
			columns: { id: true, nama: true },
			where: eq(tableMurid.kelasId, kelasId)
		});

		const muridByName = new Map(allMurid.map((m) => [m.nama.trim().toLowerCase(), m.id]));

		let importedCount = 0;
		let skippedCount = 0;

		const insertOperations: Array<{
			muridId: number;
			kokurikulerId: number;
			dimensi: string;
			kategori: NilaiKategori;
			dinilaiPada: string;
		}> = [];

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		worksheet.eachRow((row: any, rowNumber: number) => {
			if (rowNumber <= 3) return;

			const muridNama = row.getCell(2).value?.toString().trim();
			if (!muridNama) {
				skippedCount++;
				return;
			}

			const muridId = muridByName.get(muridNama.toLowerCase());
			if (!muridId) {
				skippedCount++;
				return;
			}

			for (const [col, dimensiKey] of colToDimensiMap) {
				const kategoriRaw = row.getCell(col).value?.toString().trim().toLowerCase() ?? '';
				if (!kategoriRaw) continue;

				let kategori: string;

				if (kategoriRaw === 'sangat baik' || kategoriRaw === 'sangat-baik') {
					kategori = 'sangat-baik';
				} else if (kategoriRaw === 'baik') {
					kategori = 'baik';
				} else if (kategoriRaw === 'cukup') {
					kategori = 'cukup';
				} else if (kategoriRaw === 'perlu bimbingan' || kategoriRaw === 'perlu-bimbingan') {
					kategori = 'perlu-bimbingan';
				} else {
					continue;
				}

				const now = new Date().toISOString();
				insertOperations.push({
					muridId,
					kokurikulerId,
					dimensi: dimensiKey,
					kategori: kategori as NilaiKategori,
					dinilaiPada: now
				});
				importedCount++;
			}
		});

		try {
			await db.transaction(async (tx) => {
				for (const op of insertOperations) {
					await tx
						.insert(tableAsesmenKokurikuler)
						.values({
							muridId: op.muridId,
							kokurikulerId: op.kokurikulerId,
							dimensi: op.dimensi,
							kategori: op.kategori,
							dinilaiPada: op.dinilaiPada
						})
						.onConflictDoUpdate({
							target: [
								tableAsesmenKokurikuler.muridId,
								tableAsesmenKokurikuler.kokurikulerId,
								tableAsesmenKokurikuler.dimensi
							],
							set: {
								kategori: op.kategori,
								dinilaiPada: op.dinilaiPada,
								updatedAt: new Date().toISOString()
							}
						});
				}
			});
		} catch (err) {
			console.error('Error inserting asesmen dalam transaksi:', err);
			return json(
				{ success: false, message: 'Gagal menyimpan data import ke database' },
				{ status: 500 }
			);
		}

		return json({
			success: true,
			message: `Import selesai. Berhasil: ${importedCount}, Terlewatkan: ${skippedCount}`
		});
	} catch (err) {
		console.error('Import error:', err);
		return json(
			{ success: false, message: 'Terjadi kesalahan saat memproses file' },
			{ status: 500 }
		);
	}
};
