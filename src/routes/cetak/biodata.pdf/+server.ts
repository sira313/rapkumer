import { getBiodataPreviewPayload } from '../biodata/preview-data';
import { generatePDF } from '$lib/server/pdf/generate';
import { buildUrl } from '$lib/server/pdf/request-params';
import type { RequestHandler } from './$types';

async function handle({ locals, url }: { locals: App.Locals; url: URL }) {
	const payload = await getBiodataPreviewPayload({ locals, url });
	const pdfBuffer = await generatePDF(
		'biodata',
		payload.biodataData as unknown as Record<string, unknown>
	);

	const filename = `Biodata_${payload.biodataData?.murid?.nama?.replace(/\s+/g, '_') || 'dokumen'}.pdf`;

	return new Response(new Blob([pdfBuffer as any], { type: 'application/pdf' }), {
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
