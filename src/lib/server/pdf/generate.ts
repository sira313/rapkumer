import { PDFDocument } from 'pdf-lib';
import { renderPDF } from './pagedpdf';
import { renderCoverHTML } from './templates/cover';
import { renderRaporHTML } from './templates/rapor';
import { renderBiodataHTML } from './templates/biodata';
import { renderKeasramaanHTML } from './templates/keasramaan';
import { renderPiagamHTML } from './templates/piagam';

export type DocumentType = 'cover' | 'rapor' | 'biodata' | 'keasramaan' | 'piagam';

export function renderHTML(
	docType: DocumentType,
	data: Record<string, unknown>,
	template?: '1' | '2'
): string {
	switch (docType) {
		case 'cover':
			return renderCoverHTML(data as never);
		case 'rapor':
			return renderRaporHTML(data as never);
		case 'biodata':
			return renderBiodataHTML(data as never);
		case 'keasramaan':
			return renderKeasramaanHTML(data as never);
		case 'piagam':
			return renderPiagamHTML(data as never, template ?? '1');
		default:
			throw new Error(`Unknown document type: ${docType}`);
	}
}

export async function generatePDF(
	docType: DocumentType,
	data: Record<string, unknown>,
	template?: '1' | '2'
): Promise<Uint8Array> {
	return renderPDF(renderHTML(docType, data, template));
}

type BulkItem = {
	docType: DocumentType;
	data: Record<string, unknown>;
	template?: '1' | '2';
};

async function generateAllPDFs(items: BulkItem[], concurrency: number = 3): Promise<Uint8Array[]> {
	const results: Uint8Array[] = new Array(items.length);
	let index = 0;

	async function worker(): Promise<void> {
		while (index < items.length) {
			const i = index++;
			results[i] = await generatePDF(items[i].docType, items[i].data, items[i].template);
		}
	}

	const poolSize = Math.min(concurrency, items.length);
	const workers = Array.from({ length: poolSize }, () => worker());
	await Promise.all(workers);

	return results;
}

async function mergePDFs(pdfBuffers: Uint8Array[]): Promise<Uint8Array> {
	if (pdfBuffers.length === 1) return pdfBuffers[0];

	const mergedPdf = await PDFDocument.create();

	for (const pdfBuffer of pdfBuffers) {
		const pdf = await PDFDocument.load(pdfBuffer);
		const pageIndices = pdf.getPageIndices();
		const copiedPages = await mergedPdf.copyPages(pdf, pageIndices);
		for (const page of copiedPages) {
			mergedPdf.addPage(page);
		}
	}

	return await mergedPdf.save();
}

export async function generateBulkPDF(items: BulkItem[]): Promise<Uint8Array> {
	if (!items.length) throw new Error('No items to generate PDF for.');

	if (items.length === 1) {
		return generatePDF(items[0].docType, items[0].data, items[0].template);
	}

	const pdfBuffers = await generateAllPDFs(items, 3);
	return mergePDFs(pdfBuffers);
}
