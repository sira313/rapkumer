import fs from 'node:fs/promises';
import path from 'node:path';
import db from '$lib/server/db';
import { ensureJadwalBellSchema } from '$lib/server/db/ensure-jadwal-bell';
import { tableBellSounds } from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import type { RequestHandler } from './$types';

const allowedTypes = [
	'upacara',
	'istirahat',
	'selesai_istirahat',
	'pergantian',
	'custom',
	'masuk',
	'pulang'
];

function soundsDir() {
	const envSounds = process.env.sounds || 'file:./data/sounds';
	const raw = envSounds.startsWith('file:') ? envSounds.slice(5) : envSounds;
	return path.resolve(raw);
}

function filePath(dir: string, sekolahId: number, tipe: string) {
	return path.join(dir, `${sekolahId}_${tipe}.mp3`);
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) error(401, 'Sekolah tidak ditemukan');

	const tipe = params.tipe;
	if (!allowedTypes.includes(tipe)) error(400, 'Tipe sound tidak valid');

	await ensureJadwalBellSchema();

	const sound = await db.query.tableBellSounds.findFirst({
		where: and(eq(tableBellSounds.sekolahId, sekolahId), eq(tableBellSounds.tipe, tipe))
	});

	if (!sound) error(404, 'Sound tidak ditemukan');

	const dir = soundsDir();
	const fPath = filePath(dir, sekolahId, tipe);

	try {
		const data = await fs.readFile(fPath);
		return new Response(data, {
			headers: {
				'Content-Type': sound.mimeType,
				'Content-Disposition': `inline; filename="${sound.fileName}"`
			}
		});
	} catch {
		error(404, 'Sound tidak ditemukan');
	}
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) error(401, 'Sekolah tidak ditemukan');

	if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
		error(403, 'Anda tidak memiliki izin');
	}

	const tipe = params.tipe;
	if (!allowedTypes.includes(tipe)) error(400, 'Tipe sound tidak valid');

	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	if (!file) error(400, 'File tidak ditemukan');

	if (!file.name.endsWith('.mp3') && !file.type.startsWith('audio/')) {
		error(400, 'Hanya file audio (MP3, WAV, OGG, dll) yang diperbolehkan');
	}

	const maxSize = 2 * 1024 * 1024;
	if (file.size > maxSize) error(400, 'Ukuran file maksimal 2MB');

	const buffer = Buffer.from(await file.arrayBuffer());

	const dir = soundsDir();
	await fs.mkdir(dir, { recursive: true });

	await fs.writeFile(filePath(dir, sekolahId, tipe), buffer, { mode: 0o644 });

	await ensureJadwalBellSchema();

	await db
		.insert(tableBellSounds)
		.values({
			sekolahId,
			tipe,
			fileName: file.name,
			mimeType: file.type || 'audio/mpeg',
			updatedAt: new Date().toISOString()
		})
		.onConflictDoUpdate({
			target: [tableBellSounds.sekolahId, tableBellSounds.tipe],
			set: {
				fileName: file.name,
				mimeType: file.type || 'audio/mpeg',
				updatedAt: new Date().toISOString()
			}
		});

	return new Response(JSON.stringify({ message: 'Sound berhasil diupload' }), {
		headers: { 'Content-Type': 'application/json' }
	});
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) error(401, 'Sekolah tidak ditemukan');

	if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
		error(403, 'Anda tidak memiliki izin');
	}

	const tipe = params.tipe;
	if (!allowedTypes.includes(tipe)) error(400, 'Tipe sound tidak valid');

	await ensureJadwalBellSchema();

	const sound = await db.query.tableBellSounds.findFirst({
		where: and(eq(tableBellSounds.sekolahId, sekolahId), eq(tableBellSounds.tipe, tipe))
	});

	if (!sound) error(404, 'Sound tidak ditemukan');

	await db
		.delete(tableBellSounds)
		.where(and(eq(tableBellSounds.sekolahId, sekolahId), eq(tableBellSounds.tipe, tipe)));

	const dir = soundsDir();
	const fPath = filePath(dir, sekolahId, tipe);
	try {
		await fs.unlink(fPath);
	} catch {
		// file may not exist
	}

	return new Response(JSON.stringify({ message: 'Sound berhasil dihapus' }), {
		headers: { 'Content-Type': 'application/json' }
	});
};
