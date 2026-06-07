import { getRaporPreviewPayload } from './preview-data';
import { getKelasContextForUser } from '$lib/server/route-utils';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
export const load = (async (event) => {
	event.depends('app:cetak-rapor');

	if (!event.locals.user) {
		throw redirect(303, '/login');
	}

	// For non-admin users, verify they have access to the requested student's class
	if (event.locals.user.type !== 'admin') {
		const muridIdParam = event.url.searchParams.get('murid_id');
		if (muridIdParam) {
			const { hasAccess } = await getKelasContextForUser(event.locals, event.url, muridIdParam);
			if (!hasAccess) {
				throw redirect(303, '/forbidden?required=kelas_id');
			}
		}
	}

	return getRaporPreviewPayload({ locals: event.locals, url: event.url });
}) satisfies PageServerLoad;
