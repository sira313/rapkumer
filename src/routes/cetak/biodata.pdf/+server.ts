import { getBiodataPreviewPayload } from '../biodata/preview-data';
import { generatePDF } from '$lib/server/pdf/generate';
import type { RequestHandler } from './$types';

export const GET = (async ({ locals, url }) => {
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
}) satisfies RequestHandler;
