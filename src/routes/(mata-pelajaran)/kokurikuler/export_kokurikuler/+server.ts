import db from '$lib/server/db';
import { tableKelas, tableKokurikuler } from '$lib/server/db/schema';
import {
	profilPelajarPancasilaDimensionLabelByKey,
	type DimensiProfilLulusanKey
} from '$lib/statics';
import { writeAoaToBuffer } from '$lib/utils/excel.js';
import { asc, eq } from 'drizzle-orm';
import { cookieNames } from '$lib/utils';

export async function GET({ cookies }) {
	const kelasIdCookie = cookies.get(cookieNames.ACTIVE_KELAS_ID) || null;
	const kelasId = kelasIdCookie ? Number(kelasIdCookie) : null;
	if (!kelasId || !Number.isFinite(kelasId)) {
		return new Response(JSON.stringify({ fail: 'Pilih kelas aktif terlebih dahulu.' }), {
			status: 400
		});
	}

	const kokurikulerRows = await db.query.tableKokurikuler.findMany({
		where: eq(tableKokurikuler.kelasId, kelasId),
		orderBy: asc(tableKokurikuler.kode)
	});

	const header = ['Kode', 'Dimensi', 'Kegiatan'];

	const rows: Array<Array<string>> = [header];
	for (const item of kokurikulerRows) {
		const dims = Array.isArray(item.dimensi) ? (item.dimensi as DimensiProfilLulusanKey[]) : [];
		const dimensiLabel = dims
			.map((key) => profilPelajarPancasilaDimensionLabelByKey[key] ?? key)
			.join(', ');
		rows.push([item.kode, dimensiLabel, item.tujuan ?? '']);
	}

	const buffer = await writeAoaToBuffer(rows);

	let kelasLabel = `kelas-${kelasId}`;
	try {
		const kelasRow = await db.query.tableKelas.findFirst({
			columns: { nama: true },
			where: eq(tableKelas.id, kelasId)
		});
		if (kelasRow?.nama) kelasLabel = kelasRow.nama;
	} catch {
		// ignore and fallback to kelasId
	}
	const safeLabel = kelasLabel
		.replace(/[\\/:*?"<>|]+/g, '')
		.replace(/\s+/g, '')
		.trim();
	const filename = `kokurikuler-${safeLabel}.xlsx`;

	return new Response(Buffer.from(buffer), {
		status: 200,
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
}
