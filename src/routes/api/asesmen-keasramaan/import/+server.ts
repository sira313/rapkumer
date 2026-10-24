import type { RequestHandler } from '@sveltejs/kit';
import db from '$lib/server/db';
import { tableAsesmenKeasramaan, tableKeasramaan, tableMurid } from '$lib/server/db/schema';
import { type EkstrakurikulerNilaiKategori } from '$lib/ekstrakurikuler';
import { eq } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { isAuthorizedUser } from '../../../pengguna/permissions';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!isAuthorizedUser(['input_nilai_asesmen_keasramaan'], locals.user)) {
		return json({ success: false, message: 'Akses ditolak.' }, { status: 403 });
	}
	try {
		const formData = await request.formData();
		const keasramaanIdRaw = formData.get('keasramaanId')?.toString();
		const kelasIdRaw = formData.get('kelasId')?.toString();
		const file = formData.get('file') as File | null;

		if (!keasramaanIdRaw || !kelasIdRaw || !locals.sekolah?.id || !file) {
			return json({ success: false, message: 'Data tidak lengkap' }, { status: 400 });
		}

		const keasramaanId = Number(keasramaanIdRaw);
		const kelasId = Number(kelasIdRaw);
		if (!Number.isInteger(keasramaanId) || !Number.isInteger(kelasId)) {
			return json({ success: false, message: 'ID tidak valid' }, { status: 400 });
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
			return json({ success: false, message: 'Keasramaan tidak ditemukan' }, { status: 404 });
		}

		// Read file
		const arrayBuffer = await file.arrayBuffer();
		const ExcelJSModule = (await import('exceljs')).default ?? (await import('exceljs'));
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const ExcelJSImport = ExcelJSModule as unknown as { Workbook: { new (): any } };
		const workbook = new ExcelJSImport.Workbook();
		await workbook.xlsx.load(Buffer.from(arrayBuffer));
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const worksheet: any = workbook.worksheets?.[0];

		if (!worksheet) {
			return json({ success: false, message: 'File Excel tidak valid' }, { status: 400 });
		}

		// Validate file name matches selected keasramaan (Row 1)
		const fileKeasramaanName = worksheet.getCell(1, 1).value?.toString().trim();
		if (fileKeasramaanName && fileKeasramaanName !== keasramaan.nama) {
			return json(
				{
					success: false,
					message: `File tidak sesuai! File berisi "${fileKeasramaanName}" tetapi Anda memilih "${keasramaan.nama}". Pastikan file yang diupload sudah benar.`
				},
				{ status: 400 }
			);
		}

		// Parse headers - Row 4 contains TP numbers (TP 1, TP 2, TP 3, etc.)
		const headerRow = worksheet.getRow(4);
		const headers: string[] = [];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		headerRow?.eachCell((cell: any) => {
			headers.push(String(cell.value ?? ''));
		});

		if (headers.length < 2) {
			return json({ success: false, message: 'Format file tidak sesuai' }, { status: 400 });
		}

		// Build mapping dari header ke tujuanId
		// Headers are TP 1, TP 2, etc. starting from column 3 (C)
		// We need to match these with tujuan by order
		const expectedTpCount = Array.from(keasramaan.indikator).reduce(
			(sum, ind) => sum + ind.tujuan.length,
			0
		);

		// Check if number of data columns matches expected TP count
		// Headers start at column 3, so we count from C onwards
		const dataColumnsCount = headers.length - 2; // Skip No and Nama columns (A, B)
		if (dataColumnsCount !== expectedTpCount) {
			return json(
				{
					success: false,
					message: `Struktur file tidak sesuai! File memiliki ${dataColumnsCount} kolom TP tetapi "${keasramaan.nama}" memiliki ${expectedTpCount} TP. Pastikan download template terbaru.`
				},
				{ status: 400 }
			);
		}

		const headerToTujuanMap = new Map<number, number>();
		let tpCount = 0;
		for (const indikator of keasramaan.indikator) {
			for (const tujuan of indikator.tujuan) {
				// Column index is 3 (C) + tpCount
				const col = 3 + tpCount;
				headerToTujuanMap.set(col, tujuan.id);
				tpCount++;
			}
		}

		// Get all murid to find by name
		const allMurid = await db.query.tableMurid.findMany({
			columns: { id: true, nama: true },
			where: eq(tableMurid.kelasId, kelasId)
		});

		const muridByName = new Map(allMurid.map((m) => [m.nama.trim().toLowerCase(), m.id]));

		// Insert/update asesmen
		let importedCount = 0;
		let skippedCount = 0;

		const validKategori = ['sangat-baik', 'baik', 'cukup', 'perlu-bimbingan'];
		const kategoriType = (kategori: string): EkstrakurikulerNilaiKategori => {
			const validated = kategori as EkstrakurikulerNilaiKategori;
			return validKategori.includes(kategori)
				? validated
				: ('baik' as EkstrakurikulerNilaiKategori);
		};

		// Collect all insert operations
		const insertOperations: Array<{
			muridId: number;
			keasramaanId: number;
			tujuanId: number;
			kategori: EkstrakurikulerNilaiKategori;
			dinilaiPada: string;
		}> = [];

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		worksheet.eachRow((row: any, rowNumber: number) => {
			// Skip first 4 rows (title, class name, indikator names, TP numbers)
			if (rowNumber <= 4) return;

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

			for (const [col, tujuanId] of headerToTujuanMap) {
				const kategoriRaw = row.getCell(col).value?.toString().trim().toLowerCase() ?? '';
				if (!kategoriRaw) continue;

				let kategori: EkstrakurikulerNilaiKategori;

				// Normalize kategori input - handle both spaced and dashed versions
				if (
					kategoriRaw === 'sangat baik' ||
					kategoriRaw === 'sangat-baik' ||
					kategoriRaw === 'sangat baik'
				) {
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

				if (!validKategori.includes(kategori)) {
					continue;
				}

				const now = new Date().toISOString();
				insertOperations.push({
					muridId,
					keasramaanId,
					tujuanId,
					kategori: kategoriType(kategori),
					dinilaiPada: now
				});
				importedCount++;
			}
		});

		// Execute all insert operations
		for (const op of insertOperations) {
			try {
				await db
					.insert(tableAsesmenKeasramaan)
					.values({
						muridId: op.muridId,
						keasramaanId: op.keasramaanId,
						tujuanId: op.tujuanId,
						kategori: op.kategori,
						dinilaiPada: op.dinilaiPada
					})
					.onConflictDoUpdate({
						target: [
							tableAsesmenKeasramaan.muridId,
							tableAsesmenKeasramaan.keasramaanId,
							tableAsesmenKeasramaan.tujuanId
						],
						set: {
							kategori: op.kategori,
							dinilaiPada: op.dinilaiPada,
							updatedAt: new Date().toISOString()
						}
					});
			} catch (err) {
				console.error('Error inserting asesmen:', err);
			}
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
