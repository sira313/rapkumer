import { error } from '@sveltejs/kit';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, unlinkSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { generatePDF, type DocumentType } from '$lib/server/pdf/generate';
import { getRaporPreviewPayload } from '../../../cetak/rapor/preview-data';
import { getCoverPreviewPayload } from '../../../cetak/cover/preview-data';
import { getBiodataPreviewPayload } from '../../../cetak/biodata/preview-data';
import { getKeasramaanPreviewPayload } from '../../../cetak/keasramaan/preview-data';
import { getPiagamPreviewPayload } from '../../../cetak/piagam/preview-data';

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
};

export const POST = (async ({ locals, request }) => {
	const body: BulkRequest = await request.json();

	if (!body.docType || !body.muridIds?.length) {
		throw error(400, 'Parameter docType dan muridIds wajib diisi.');
	}

	const tmpDir = mkdtempSync(join(tmpdir(), 'pdf-bulk-'));
	const files: string[] = [];

	try {
		for (const muridId of body.muridIds) {
			const url = new URL('http://localhost');
			url.searchParams.set('murid_id', String(muridId));
			if (body.kelasId) url.searchParams.set('kelas_id', String(body.kelasId));
			if (body.tpMode === 'full-desc') url.searchParams.set('full_tp', 'desc');
			if (body.criteria) {
				url.searchParams.set('krit_cukup', String(body.criteria.kritCukup));
				url.searchParams.set('krit_baik', String(body.criteria.kritBaik));
			}

			let data: Record<string, unknown>;
			switch (body.docType) {
				case 'rapor': {
					const p = await getRaporPreviewPayload({ locals, url });
					data = p.raporData as unknown as Record<string, unknown>;
					break;
				}
				case 'cover': {
					const p = await getCoverPreviewPayload({ locals, url });
					data = p.coverData as unknown as Record<string, unknown>;
					break;
				}
				case 'biodata': {
					const p = await getBiodataPreviewPayload({ locals, url });
					data = p.biodataData as unknown as Record<string, unknown>;
					break;
				}
				case 'keasramaan': {
					const p = await getKeasramaanPreviewPayload({ locals, url });
					if (!p) throw error(400, 'Data rapor keasramaan tidak ditemukan.');
					data = p.keasramaanData as unknown as Record<string, unknown>;
					break;
				}
				case 'piagam': {
					const p = await getPiagamPreviewPayload({ locals, url });
					data = p.piagamData as unknown as Record<string, unknown>;
					break;
				}
				default:
					throw error(400, `Unknown document type: ${body.docType}`);
			}

			const pdfBuffer = await generatePDF(body.docType, data, body.template);
			const filePath = join(tmpDir, `${muridId}.pdf`);
			writeFileSync(filePath, pdfBuffer);
			files.push(filePath);
		}

		const outputPath = join(tmpDir, 'merged.pdf');
		execSync(`pdfunite ${files.map((f) => `"${f}"`).join(' ')} "${outputPath}"`);

		const mergedBuffer = readFileSync(outputPath);

		const docLabel = body.docLabel || body.docType;
		const kelasLabel = body.kelasLabel || 'Semua-Kelas';
		const filename = `${docLabel}-${kelasLabel}-${files.length}murid.pdf`;

		return new Response(new Blob([mergedBuffer as any], { type: 'application/pdf' }), {
			headers: {
				'Content-Disposition': `attachment; filename="${filename}"`
			}
		});
	} finally {
		for (const file of files) {
			try {
				unlinkSync(file);
			} catch {
				/* ignore */
			}
		}
		try {
			rmSync(tmpDir, { recursive: true });
		} catch {
			/* ignore */
		}
	}
}) satisfies RequestHandler;
