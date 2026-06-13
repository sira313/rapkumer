import { json, redirect } from '@sveltejs/kit';
import { getKartuMuridPreviewPayload } from '../kartu-murid/preview-data';
import type { RequestHandler } from './$types';

export const GET = (async ({ locals, url }) => {
	if (!locals.user) throw redirect(303, '/login');

	const payload = await getKartuMuridPreviewPayload({ locals, url });
	return json(payload);
}) satisfies RequestHandler;
