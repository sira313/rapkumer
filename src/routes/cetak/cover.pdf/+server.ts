import { getCoverPreviewPayload } from '../cover/preview-data';
import { generatePDF } from '$lib/server/pdf/generate';
import { buildUrl } from '$lib/server/pdf/request-params';
import type { RequestHandler } from './$types';

async function handle({ locals, url }: { locals: App.Locals; url: URL }) {
	const payload = await getCoverPreviewPayload({ locals, url });
	const pdfBuffer = await generatePDF(
		'cover',
		payload.coverData as unknown as Record<string, unknown>
	);

	return new Response(new Blob([pdfBuffer as any], { type: 'application/pdf' }), {
		headers: {
			'Content-Disposition': `inline; filename="Cover_Rapor_${payload.coverData?.murid?.nama?.replace(/\s+/g, '_') || 'dokumen'}.pdf"`
		}
	});
}

export const GET = (async (event) => handle(event)) satisfies RequestHandler;
export const POST = (async (event) => {
	const url = await buildUrl(event.request, event.url);
	return handle({ locals: event.locals, url });
}) satisfies RequestHandler;
