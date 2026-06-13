import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import db from '$lib/server/db';
import { tableAbsensi, tableMurid, tablePresensiSettings } from '$lib/server/db/schema';
import { ensureAbsensiSchema } from '$lib/server/db/ensure-absensi';
import { ensurePresensiSettingsSchema } from '$lib/server/db/ensure-presensi-settings';
import { cookieNames } from '$lib/utils';

export const POST = (async ({ request, locals, cookies }) => {
	if (!locals.user) {
		return json({ error: 'Sesi tidak valid. Silakan login ulang.' }, { status: 401 });
	}

	if (locals.user.type === 'user') {
		return json({ error: 'Anda tidak memiliki izin untuk melakukan absensi.' }, { status: 403 });
	}

	const sekolahId = locals.sekolah?.id ?? null;
	if (!sekolahId) {
		return json({ error: 'Sekolah tidak ditemukan.' }, { status: 400 });
	}

	const kelasId = Number(cookies.get(cookieNames.ACTIVE_KELAS_ID) ?? '');
	if (!kelasId) {
		return json({ error: 'Kelas tidak ditemukan.' }, { status: 400 });
	}

	let body: { qrData?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Data tidak valid.' }, { status: 400 });
	}

	const qrData = body.qrData?.trim();
	if (!qrData) {
		return json({ error: 'QR code tidak valid.' }, { status: 400 });
	}

	const nisn = extractNisn(qrData);
	if (!nisn) {
		return json({ error: 'QR code tidak valid: NISN tidak ditemukan.' }, { status: 400 });
	}

	const murid = await db.query.tableMurid.findFirst({
		columns: { id: true, nama: true },
		where: and(
			eq(tableMurid.nisn, nisn),
			eq(tableMurid.sekolahId, sekolahId),
			eq(tableMurid.kelasId, kelasId)
		)
	});

	if (!murid) {
		return json({ error: 'Murid tidak ditemukan.' }, { status: 404 });
	}

	await ensurePresensiSettingsSchema();

	const settings = await db.query.tablePresensiSettings.findFirst({
		where: eq(tablePresensiSettings.sekolahId, sekolahId)
	});

	if (settings?.jamMasuk) {
		const now = new Date();
		const jam = String(now.getHours()).padStart(2, '0');
		const menit = String(now.getMinutes()).padStart(2, '0');
		const currentTime = `${jam}:${menit}`;

		if (currentTime < settings.jamMasuk) {
			return json(
				{ error: `Presensi belum dapat dimulai. Jam masuk: ${settings.jamMasuk}.` },
				{ status: 403 }
			);
		}
	}

	await ensureAbsensiSchema();

	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);
	const todayEnd = new Date();
	todayEnd.setHours(23, 59, 59, 999);

	const existing = await db
		.select({ id: tableAbsensi.id })
		.from(tableAbsensi)
		.where(
			and(
				eq(tableAbsensi.muridId, murid.id),
				sql`${tableAbsensi.waktu} >= ${todayStart.toISOString()}`,
				sql`${tableAbsensi.waktu} <= ${todayEnd.toISOString()}`
			)
		)
		.limit(1);

	if (existing.length > 0) {
		return json({ error: `${murid.nama} sudah melakukan absensi hari ini.` }, { status: 409 });
	}

	const waktu = new Date().toISOString();

	await db.insert(tableAbsensi).values({
		muridId: murid.id,
		waktu
	});

	return json({ message: `Absensi berhasil untuk ${murid.nama}` });
}) satisfies RequestHandler;

function extractNisn(qrData: string): string | null {
	const lines = qrData.split('\n');
	for (const line of lines) {
		const match = line.match(/^NISN:\s*(.+)$/i);
		if (match) {
			return match[1].trim();
		}
	}
	return null;
}
