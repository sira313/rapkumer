import type { RequestHandler } from '@sveltejs/kit';
import db from '$lib/server/db';
import {
	tableAsesmenEkstrakurikuler,
	tableEkstrakurikuler,
	tableEkstrakurikulerTujuan,
	tableMurid
} from '$lib/server/db/schema';
import { type EkstrakurikulerNilaiKategori } from '$lib/ekstrakurikuler';
import { eq, asc } from 'drizzle-orm';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const formData = await request.formData();
		const ekstrakurikulerIdRaw = formData.get('ekstrakurikulerId')?.toString();
		const kelasIdRaw = formData.get('kelasId')?.toString();
		const file = formData.get('file') as File | null;

		if (!ekstrakurikulerIdRaw || !kelasIdRaw || !locals.sekolah?.id || !file) {
			return json({ success: false, message: 'Data tidak lengkap' }, { status: 400 });
		}

		const ekstrakurikulerId = Number(ekstrakurikulerIdRaw);
		const kelasId = Number(kelasIdRaw);
		if (!Number.isInteger(ekstrakurikulerId) || !Number.isInteger(kelasId)) {
			return json({ success: false, message: 'ID tidak valid' }, { status: 400 });
		}

		const ekstrakurikuler = await db.query.tableEkstrakurikuler.findFirst({
			where: eq(tableEkstrakurikuler.id, ekstrakurikulerId)
		});

		if (!ekstrakurikuler || ekstrakurikuler.kelasId !== kelasId) {
			return json({ success: false, message: 'Ekstrakurikuler tidak ditemukan' }, { status: 404 });
		}

		const tujuanList = await db.query.tableEkstrakurikulerTujuan.findMany({
			where: eq(tableEkstrakurikulerTujuan.ekstrakurikulerId, ekstrakurikulerId),
			orderBy: asc(tableEkstrakurikulerTujuan.createdAt),
			columns: { id: true, deskripsi: true }
		});

		const arrayBuffer = await file.arrayBuffer();
		const ExcelJSModule = (await import('exceljs')).default ?? (await import('exceljs'));
		const ExcelJSImport = ExcelJSModule as unknown as { Workbook: { new (): unknown } };
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

		// Validate file name matches selected ekstrakurikuler (Row 1)
		const fileNama = worksheet.getCell(1, 1).value?.toString().trim();
		if (fileNama && fileNama !== ekstrakurikuler.nama) {
			return json(
				{
					success: false,
					message: `File tidak sesuai! File berisi "${fileNama}" tetapi Anda memilih "${ekstrakurikuler.nama}". Pastikan file yang diupload sudah benar.`
				},
				{ status: 400 }
			);
		}

		// Parse headers — Row 3 contains TP 1, TP 2, ...
		const headerRow = worksheet.getRow(3);
		const headers: string[] = [];
		headerRow?.eachCell((cell: { value: unknown }) => {
			headers.push(String(cell.value ?? ''));
		});

		if (headers.length < 2) {
			return json({ success: false, message: 'Format file tidak sesuai' }, { status: 400 });
		}

		// Validate TP column count
		const dataColumnsCount = headers.length - 2;
		const expectedTpCount = tujuanList.length;
		if (dataColumnsCount !== expectedTpCount) {
			return json(
				{
					success: false,
					message: `Struktur file tidak sesuai! File memiliki ${dataColumnsCount} kolom TP tetapi "${ekstrakurikuler.nama}" memiliki ${expectedTpCount} TP. Pastikan download template terbaru.`
				},
				{ status: 400 }
			);
		}

		// Build column-to-tujuanId map
		const colToTujuanMap = new Map<number, number>();
		for (let i = 0; i < tujuanList.length; i++) {
			colToTujuanMap.set(3 + i, tujuanList[i].id);
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
			ekstrakurikulerId: number;
			tujuanId: number;
			kategori: EkstrakurikulerNilaiKategori;
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

			for (const [col, tujuanId] of colToTujuanMap) {
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
					ekstrakurikulerId,
					tujuanId,
					kategori: kategori as EkstrakurikulerNilaiKategori,
					dinilaiPada: now
				});
				importedCount++;
			}
		});

		for (const op of insertOperations) {
			try {
				await db
					.insert(tableAsesmenEkstrakurikuler)
					.values({
						muridId: op.muridId,
						ekstrakurikulerId: op.ekstrakurikulerId,
						tujuanId: op.tujuanId,
						kategori: op.kategori,
						dinilaiPada: op.dinilaiPada
					})
					.onConflictDoUpdate({
						target: [
							tableAsesmenEkstrakurikuler.muridId,
							tableAsesmenEkstrakurikuler.ekstrakurikulerId,
							tableAsesmenEkstrakurikuler.tujuanId
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
