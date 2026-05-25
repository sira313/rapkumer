import { getRaporPreviewPayload } from '../rapor/preview-data';
import { generatePDF } from '$lib/server/pdf/generate';
import type { RequestHandler } from './$types';

export const GET = (async ({ locals, url }) => {
	const payload = await getRaporPreviewPayload({ locals, url });
	const pdfBuffer = await generatePDF(
		'rapor',
		payload.raporData as unknown as Record<string, unknown>
	);

	const filename = `Rapor_${payload.raporData?.murid?.nama || 'dokumen'}_${payload.raporData?.periode?.tahunPelajaran || ''}_${payload.raporData?.periode?.semester || ''}.pdf`;

	return new Response(new Blob([pdfBuffer as any], { type: 'application/pdf' }), {
		headers: {
			'Content-Disposition': `inline; filename="${filename}"`
		}
	});
}) satisfies RequestHandler;
