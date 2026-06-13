import db from '$lib/server/db';
import { getKeasramaanPreviewPayload } from './preview-data';
import { buildKelasContext, fetchMuridList, getKelasContextForUser } from '$lib/server/route-utils';
import { tablePegawai } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load = (async (event) => {
	event.depends('app:cetak-keasramaan');

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

	const parentData = await event.parent();
	const { sekolahId, kelasId, kelasIds } = await buildKelasContext(
		event.locals,
		parentData,
		event.url
	);

	let daftarMurid = await fetchMuridList(sekolahId, kelasId, kelasIds);

	// Wali_asuh: only show their own students
	const userWithType = event.locals.user as { type?: string; pegawaiId?: number } | null;
	if (userWithType?.type === 'wali_asuh' && userWithType.pegawaiId) {
		const peg = await db.query.tablePegawai.findFirst({
			columns: { nama: true },
			where: eq(tablePegawai.id, userWithType.pegawaiId)
		});
		const pegNama = peg?.nama?.trim().toLowerCase();
		if (pegNama) {
			daftarMurid = daftarMurid.filter(
				(m) => (m.waliAsuhNama?.trim().toLowerCase() ?? '') === pegNama
			);
		} else {
			daftarMurid = [];
		}
	}

	const muridIdParam = event.url.searchParams.get('murid_id');
	const initialPreviewPayload = muridIdParam
		? await getKeasramaanPreviewPayload({ locals: event.locals, url: event.url })
		: { meta: null, keasramaanData: null };

	return { kelasId, daftarMurid, ...initialPreviewPayload };
}) satisfies PageServerLoad;
