import { error } from '@sveltejs/kit';
import { consumePdfParams } from '$lib/server/pdf/token-store';
import { generatePDF } from '$lib/server/pdf/generate';
import { getCoverPreviewPayload } from '../../../cover/preview-data';
import { getRaporPreviewPayload } from '../../../rapor/preview-data';
import { getBiodataPreviewPayload } from '../../../biodata/preview-data';
import { getKeasramaanPreviewPayload } from '../../../keasramaan/preview-data';
import { getPiagamPreviewPayload } from '../../../piagam/preview-data';
import type { RequestHandler } from './$types';
import type { DocumentType } from '$lib/server/pdf/generate';

export const GET = (async ({ locals, params }) => {
	const stored = consumePdfParams(params.token);
	if (!stored) {
		throw error(410, 'Token tidak valid atau sudah kedaluwarsa.');
	}

	const url = new URL('http://localhost');
	url.searchParams.set('murid_id', String(stored.muridId));
	if (stored.kelasId) url.searchParams.set('kelas_id', String(stored.kelasId));
	if (stored.tpMode === 'full-desc') url.searchParams.set('full_tp', 'desc');
	if (stored.kritCukup != null) url.searchParams.set('krit_cukup', String(stored.kritCukup));
	if (stored.kritBaik != null) url.searchParams.set('krit_baik', String(stored.kritBaik));
	if (stored.template) url.searchParams.set('template', stored.template);
	if (stored.bgLogo) url.searchParams.set('bg_logo', '1');
	if (stored.raporPeriode) url.searchParams.set('rapor_periode', stored.raporPeriode);

	const docType = stored.docType as DocumentType;

	let data: unknown;
	switch (docType) {
		case 'cover': {
			const p = await getCoverPreviewPayload({ locals, url });
			data = p.coverData;
			break;
		}
		case 'rapor': {
			const p = await getRaporPreviewPayload({ locals, url });
			data = p.raporData;
			break;
		}
		case 'biodata': {
			const p = await getBiodataPreviewPayload({ locals, url });
			data = p.biodataData;
			break;
		}
		case 'keasramaan': {
			const p = await getKeasramaanPreviewPayload({ locals, url });
			if (!p) throw error(400, 'Data rapor keasramaan tidak ditemukan.');
			data = p.keasramaanData;
			break;
		}
		case 'piagam': {
			const p = await getPiagamPreviewPayload({ locals, url });
			data = p.piagamData;
			break;
		}
		default:
			throw error(400, `Unknown document type: ${docType}`);
	}

	let pdfBuffer;
	try {
		pdfBuffer = await generatePDF(
			docType,
			data as unknown as Record<string, unknown>,
			stored.template
		);
	} catch (e) {
		console.error('PDF generation failed:', e);
		throw error(500, 'Gagal menghasilkan PDF: ' + (e instanceof Error ? e.message : String(e)));
	}

	return new Response(new Blob([pdfBuffer as unknown as BlobPart], { type: 'application/pdf' }), {
		headers: {
			'Content-Disposition': `inline; filename="${stored.slug}.pdf"`
		}
	});
}) satisfies RequestHandler;
