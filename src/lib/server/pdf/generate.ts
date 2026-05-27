import { renderPDF } from './pagedpdf';
import { renderCoverHTML } from './templates/cover';
import { renderRaporHTML } from './templates/rapor';
import { renderBiodataHTML } from './templates/biodata';
import { renderKeasramaanHTML } from './templates/keasramaan';
import { renderPiagamHTML } from './templates/piagam';

export type DocumentType = 'cover' | 'rapor' | 'biodata' | 'keasramaan' | 'piagam';

export async function generatePDF(
	docType: DocumentType,
	data: Record<string, unknown>,
	template?: '1' | '2'
): Promise<Uint8Array> {
	let html: string;

	switch (docType) {
		case 'cover':
			html = renderCoverHTML(data as never);
			break;
		case 'rapor':
			html = renderRaporHTML(data as never);
			break;
		case 'biodata':
			html = renderBiodataHTML(data as never);
			break;
		case 'keasramaan':
			html = renderKeasramaanHTML(data as never);
			break;
		case 'piagam':
			html = renderPiagamHTML(data as never, template ?? '1');
			break;
		default:
			throw new Error(`Unknown document type: ${docType}`);
	}

	return renderPDF(html);
}
