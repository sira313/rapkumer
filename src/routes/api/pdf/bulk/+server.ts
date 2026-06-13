import { error } from '@sveltejs/kit';
import { generateBulkPDF, type DocumentType } from '$lib/server/pdf/generate';
import { getRaporPreviewPayload } from '../../../cetak/rapor/preview-data';
import { getCoverPreviewPayload } from '../../../cetak/cover/preview-data';
import { getBiodataPreviewPayload } from '../../../cetak/biodata/preview-data';
import { getKeasramaanPreviewPayload } from '../../../cetak/keasramaan/preview-data';
import { getPiagamPreviewPayload } from '../../../cetak/piagam/preview-data';
import { getKartuMuridPreviewPayload } from '../../../cetak/kartu-murid/preview-data';
import { getLogoSrc } from '$lib/server/pdf/preview-utils';

import {
	renderKartuMuridBulkHTML,
	type KartuMuridData
} from '$lib/server/pdf/templates/kartu-murid';
import { renderPDF } from '$lib/server/pdf/pagedpdf';

import type { RequestHandler } from './$types';

type BulkRequest = {
	docType: DocumentType;
	muridIds: number[];
	kelasId?: number;
	tpMode?: string;
	criteria?: { kritCukup: number; kritBaik: number };
	template?: '1' | '2';
	docLabel?: string;
	kelasLabel?: string;
	bgLogo?: boolean;
	raporPeriode?: string;
};

async function fetchStudentData(
	locals: App.Locals,
	body: BulkRequest,
	muridId: number
): Promise<Record<string, unknown>> {
	const url = new URL('http://localhost');
	url.searchParams.set('murid_id', String(muridId));
	if (body.kelasId) url.searchParams.set('kelas_id', String(body.kelasId));
	if (body.tpMode === 'full-desc') url.searchParams.set('full_tp', 'desc');
	if (body.criteria) {
		url.searchParams.set('krit_cukup', String(body.criteria.kritCukup));
		url.searchParams.set('krit_baik', String(body.criteria.kritBaik));
	}
	if (body.bgLogo) url.searchParams.set('bg_logo', '1');
	if (body.raporPeriode) url.searchParams.set('rapor_periode', body.raporPeriode);

	switch (body.docType) {
		case 'rapor': {
			const p = await getRaporPreviewPayload({ locals, url });
			return p.raporData as unknown as Record<string, unknown>;
		}
		case 'cover': {
			const p = await getCoverPreviewPayload({ locals, url });
			return p.coverData as unknown as Record<string, unknown>;
		}
		case 'biodata': {
			const p = await getBiodataPreviewPayload({ locals, url });
			return p.biodataData as unknown as Record<string, unknown>;
		}
		case 'keasramaan': {
			const p = await getKeasramaanPreviewPayload({ locals, url });
			if (!p) throw error(400, 'Data rapor keasramaan tidak ditemukan.');
			return p.keasramaanData as unknown as Record<string, unknown>;
		}
		case 'piagam': {
			const p = await getPiagamPreviewPayload({ locals, url });
			return p.piagamData as unknown as Record<string, unknown>;
		}
		default:
			throw error(400, `Unknown document type: ${body.docType}`);
	}
}

export const POST = (async ({ locals, request }) => {
	const body: BulkRequest = await request.json();

	if (!body.docType || !body.muridIds?.length) {
		throw error(400, 'Parameter docType dan muridIds wajib diisi.');
	}

	if (body.docType === 'kartu-murid') {
		const sekolahId = locals.sekolah?.id;
		const sharedLogo = sekolahId ? await getLogoSrc(sekolahId) : null;

		const kartuData = await Promise.all(
			body.muridIds.map(async (muridId) => {
				const url = new URL('http://localhost');
				url.searchParams.set('murid_id', String(muridId));
				if (body.kelasId) url.searchParams.set('kelas_id', String(body.kelasId));

				const p = await getKartuMuridPreviewPayload({ locals, url }, sharedLogo);
				return p.kartuMuridData as KartuMuridData;
			})
		);

		const html = renderKartuMuridBulkHTML(kartuData);
		const pdfBuffer = await renderPDF(html);

		const docLabel = body.docLabel || body.docType;
		const kelasLabel = body.kelasLabel || 'Semua-Kelas';
		const filename = `${docLabel}-${kelasLabel}-${body.muridIds.length}murid.pdf`;

		return new Response(new Blob([pdfBuffer as unknown as BlobPart], { type: 'application/pdf' }), {
			headers: {
				'Content-Disposition': `attachment; filename="${filename}"`
			}
		});
	}

	const allData = await Promise.all(
		body.muridIds.map((muridId) => fetchStudentData(locals, body, muridId))
	);

	const items = allData.map((data) => ({
		docType: body.docType,
		data,
		template: body.template
	}));

	const pdfBuffer = await generateBulkPDF(items);

	const docLabel = body.docLabel || body.docType;
	const kelasLabel = body.kelasLabel || 'Semua-Kelas';
	const filename = `${docLabel}-${kelasLabel}-${body.muridIds.length}murid.pdf`;

	return new Response(new Blob([pdfBuffer as unknown as BlobPart], { type: 'application/pdf' }), {
		headers: {
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
}) satisfies RequestHandler;
