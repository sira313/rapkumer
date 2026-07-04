import { json } from '@sveltejs/kit';
import { storePdfParams } from '$lib/server/pdf/token-store';
import { getCoverPreviewPayload } from '../../../cetak/cover/preview-data';
import { getRaporPreviewPayload } from '../../../cetak/rapor/preview-data';
import { getBiodataPreviewPayload } from '../../../cetak/biodata/preview-data';
import { getKeasramaanPreviewPayload } from '../../../cetak/keasramaan/preview-data';
import { getPiagamPreviewPayload } from '../../../cetak/piagam/preview-data';
import type { RequestHandler } from './$types';

function slugify(text: string): string {
	return text
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^\w\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-')
		.toLowerCase();
}

async function resolveNama(docType: string, locals: App.Locals, url: URL): Promise<string> {
	let nama = '';
	try {
		type PreviewData = Record<string, unknown>;
		let preview: PreviewData | null = null;
		switch (docType) {
			case 'cover': {
				const p = await getCoverPreviewPayload({ locals, url });
				preview = p.coverData as unknown as PreviewData | null;
				break;
			}
			case 'rapor': {
				const p = await getRaporPreviewPayload({ locals, url });
				preview = p.raporData as unknown as PreviewData | null;
				break;
			}
			case 'biodata': {
				const p = await getBiodataPreviewPayload({ locals, url });
				preview = p.biodataData as unknown as PreviewData | null;
				break;
			}
			case 'keasramaan': {
				const p = await getKeasramaanPreviewPayload({ locals, url });
				preview = p ? (p.keasramaanData as unknown as PreviewData | null) : null;
				break;
			}
			case 'piagam': {
				const p = await getPiagamPreviewPayload({ locals, url });
				preview = p.piagamData as unknown as PreviewData | null;
				break;
			}
			}
		nama = ((preview?.murid as Record<string, unknown> | undefined)?.nama as string) || '';
	} catch {
		// fallback
	}
	return nama;
}

export const POST = (async ({ locals, request }) => {
	const body = await request.json();
	const { docType, muridId, kelasId, tpMode, kriteria, template, bgLogo, raporPeriode } = body;

	const url = new URL('http://localhost');
	url.searchParams.set('murid_id', String(muridId));
	if (kelasId) url.searchParams.set('kelas_id', String(kelasId));
	if (tpMode === 'full-desc') url.searchParams.set('full_tp', 'desc');
	if (kriteria) {
		url.searchParams.set('krit_cukup', String(kriteria.kritCukup));
		url.searchParams.set('krit_baik', String(kriteria.kritBaik));
	}
	if (template) url.searchParams.set('template', template);
	if (bgLogo) url.searchParams.set('bg_logo', '1');
	if (raporPeriode) url.searchParams.set('rapor_periode', raporPeriode);

	const docLabel = body.docLabel || docType;
	const nama = await resolveNama(docType, locals, url);
	const slug = `${docLabel}-${slugify(nama || 'dokumen')}`;

	const token = storePdfParams({
		docType,
		muridId,
		kelasId,
		tpMode,
		kritCukup: kriteria?.kritCukup,
		kritBaik: kriteria?.kritBaik,
		template,
		bgLogo,
		raporPeriode,
		slug
	});

	return json({ token, slug });
}) satisfies RequestHandler;
