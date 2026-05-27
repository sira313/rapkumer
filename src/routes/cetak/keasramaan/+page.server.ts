import { getKeasramaanPreviewPayload } from './preview-data';
import { buildKelasContext, fetchMuridList } from '$lib/server/route-utils';
import type { PageServerLoad } from './$types';

export const load = (async (event) => {
	event.depends('app:cetak-keasramaan');

	const parentData = await event.parent();
	const { sekolahId, kelasId, kelasIds } = await buildKelasContext(
		event.locals,
		parentData,
		event.url
	);

	const daftarMurid = await fetchMuridList(sekolahId, kelasId, kelasIds);

	const muridIdParam = event.url.searchParams.get('murid_id');
	const initialPreviewPayload = muridIdParam
		? await getKeasramaanPreviewPayload({ locals: event.locals, url: event.url })
		: { meta: null, keasramaanData: null };

	return { kelasId, daftarMurid, ...initialPreviewPayload };
}) satisfies PageServerLoad;
