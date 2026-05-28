import { error } from '@sveltejs/kit';
import { getKeasramaanPreviewPayload } from '../keasramaan/preview-data';
import { generatePDF } from '$lib/server/pdf/generate';
import { buildUrl } from '$lib/server/pdf/request-params';
import type { RequestHandler } from './$types';

async function handle({ locals, url }: { locals: App.Locals; url: URL }) {
	const payload = await getKeasramaanPreviewPayload({ locals, url });
	if (!payload) {
		throw error(400, 'Data rapor keasramaan tidak ditemukan.');
	}
	const pdfBuffer = await generatePDF(
		'keasramaan',
		payload.keasramaanData as unknown as Record<string, unknown>
	);

	const filename = `Rapor_Keasramaan_${payload.keasramaanData?.murid?.nama || 'dokumen'}_${payload.keasramaanData?.periode?.tahunAjaran || ''}_${payload.keasramaanData?.periode?.semester || ''}.pdf`;

	return new Response(new Blob([pdfBuffer as BlobPart], { type: 'application/pdf' }), {
		headers: {
			'Content-Disposition': `inline; filename="${filename}"`
		}
	});
}

export const GET = (async (event) => handle(event)) satisfies RequestHandler;
export const POST = (async (event) => {
	const url = await buildUrl(event.request, event.url);
	return handle({ locals: event.locals, url });
}) satisfies RequestHandler;
