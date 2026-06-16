import db from '$lib/server/db';
import { ensureJadwalBellSchema } from '$lib/server/db/ensure-jadwal-bell';
import { tableBellSounds } from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) error(401, 'Sekolah tidak ditemukan');

	await ensureJadwalBellSchema();

	const sound = await db.query.tableBellSounds.findFirst({
		where: and(eq(tableBellSounds.sekolahId, sekolahId), eq(tableBellSounds.tipe, params.tipe))
	});

	if (!sound || !sound.fileData) error(404, 'Sound tidak ditemukan');

	return new Response(sound.fileData, {
		headers: {
			'Content-Type': sound.mimeType,
			'Content-Disposition': `inline; filename="${sound.fileName}"`
		}
	});
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) error(401, 'Sekolah tidak ditemukan');

	if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
		error(403, 'Anda tidak memiliki izin');
	}

	const tipe = params.tipe;
	const allowedTypes = ['upacara', 'istirahat', 'pergantian', 'custom', 'masuk'];
	if (!allowedTypes.includes(tipe)) error(400, 'Tipe sound tidak valid');

	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	if (!file) error(400, 'File tidak ditemukan');

	if (!file.name.endsWith('.mp3') && !file.type.startsWith('audio/')) {
		error(400, 'Hanya file audio yang diperbolehkan');
	}

	const maxSize = 2 * 1024 * 1024;
	if (file.size > maxSize) error(400, 'Ukuran file maksimal 2MB');

	const buffer = await file.arrayBuffer();

	await ensureJadwalBellSchema();

	await db
		.insert(tableBellSounds)
		.values({
			sekolahId,
			tipe,
			fileName: file.name,
			fileData: buffer,
			mimeType: file.type || 'audio/mpeg',
			updatedAt: new Date().toISOString()
		})
		.onConflictDoUpdate({
			target: [tableBellSounds.sekolahId, tableBellSounds.tipe],
			set: {
				fileName: file.name,
				fileData: buffer,
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

	await ensureJadwalBellSchema();

	await db
		.delete(tableBellSounds)
		.where(and(eq(tableBellSounds.sekolahId, sekolahId), eq(tableBellSounds.tipe, params.tipe)));

	return new Response(JSON.stringify({ message: 'Sound berhasil dihapus' }), {
		headers: { 'Content-Type': 'application/json' }
	});
};
