import { getCoverPreviewPayload } from '../cover/preview-data';
import { generatePDF } from '$lib/server/pdf/generate';
import type { RequestHandler } from './$types';

export const GET = (async ({ locals, url }) => {
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
}) satisfies RequestHandler;
