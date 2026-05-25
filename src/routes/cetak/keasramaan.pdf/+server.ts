import { error } from '@sveltejs/kit';
import { getKeasramaanPreviewPayload } from '../keasramaan/preview-data';
import { generatePDF } from '$lib/server/pdf/generate';
import type { RequestHandler } from './$types';

export const GET = (async ({ locals, url }) => {
	const payload = await getKeasramaanPreviewPayload({ locals, url });
	if (!payload) {
		throw error(400, 'Data rapor keasramaan tidak ditemukan.');
	}
	const pdfBuffer = await generatePDF(
		'keasramaan',
		payload.keasramaanData as unknown as Record<string, unknown>
	);

	const filename = `Rapor_Keasramaan_${payload.keasramaanData?.murid?.nama || 'dokumen'}_${payload.keasramaanData?.periode?.tahunAjaran || ''}_${payload.keasramaanData?.periode?.semester || ''}.pdf`;

	return new Response(new Blob([pdfBuffer as any], { type: 'application/pdf' }), {
		headers: {
			'Content-Disposition': `inline; filename="${filename}"`
		}
	});
}) satisfies RequestHandler;
