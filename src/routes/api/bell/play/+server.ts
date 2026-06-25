import { playSoundOnServer } from '$lib/server/bell-scheduler';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) error(401, 'Sekolah tidak ditemukan');

	if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
		error(403, 'Anda tidak memiliki izin');
	}

	const body = await request.json();
	const tipe = body?.tipe as string | undefined;
	if (!tipe) error(400, 'Tipe sound tidak valid');

	playSoundOnServer(sekolahId, tipe);

	return json({ message: 'Sound sedang diputar' });
};
