import { json, redirect } from '@sveltejs/kit';
import { getRaporPreviewPayload } from '../rapor/preview-data';
import { getKelasContextForUser } from '$lib/server/route-utils';
import type { RequestHandler } from './$types';

export const GET = (async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	if (locals.user.type !== 'admin') {
		const muridIdParam = url.searchParams.get('murid_id');
		if (muridIdParam) {
			const { hasAccess } = await getKelasContextForUser(locals, url, muridIdParam);
			if (!hasAccess) {
				throw redirect(303, '/forbidden?required=kelas_id');
			}
		}
	}

	const payload = await getRaporPreviewPayload({ locals, url });
	return json(payload);
}) satisfies RequestHandler;
