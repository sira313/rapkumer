import { getPiagamPreviewPayload } from '../piagam/preview-data';
import { generatePDF } from '$lib/server/pdf/generate';
import type { RequestHandler } from './$types';

export const GET = (async ({ locals, url }) => {
	const payload = await getPiagamPreviewPayload({ locals, url });
	const template = (url.searchParams.get('template') as '1' | '2') || '1';
	const pdfBuffer = await generatePDF(
		'piagam',
		payload.piagamData as unknown as Record<string, unknown>,
		template
	);

	const filename = `Piagam_${payload.piagamData?.murid?.nama?.replace(/\s+/g, '_') || 'dokumen'}.pdf`;

	return new Response(new Blob([pdfBuffer as any], { type: 'application/pdf' }), {
		headers: {
			'Content-Disposition': `inline; filename="${filename}"`
		}
	});
}) satisfies RequestHandler;
