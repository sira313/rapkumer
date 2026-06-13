import { getKartuMuridPreviewPayload } from './preview-data';
import type { PageServerLoad } from './$types';
export const load = (async (event) => {
	event.depends('app:cetak-kartu-murid');
	return getKartuMuridPreviewPayload({ locals: event.locals, url: event.url });
}) satisfies PageServerLoad;
