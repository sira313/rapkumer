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

/**
 * Build a combined CSS string for bulk PDF generation using named pages.
 *
 * Strategy:
 * 1. Extract the base @page from the first student's style (keeps size/margins,
 *    replaces @bottom-right with a generic page counter, strips @bottom-left).
 * 2. For each student create a named page @page sN { @bottom-left { ... } }.
 * 3. Wrap each student's body in <div style="page: sN"> to activate the page name.
 * 4. Inter-student spacing via sp-break class (page-break-before: always).
 * 5. Non-page CSS (sharedStyles + template styles) is kept verbatim.
 */

type BulkItem = {
	docType: DocumentType;
	data: Record<string, unknown>;
	template?: '1' | '2';
};

export async function generateBulkPDF(items: BulkItem[]): Promise<Uint8Array> {
	if (!items.length) throw new Error('No items to generate PDF for.');

	const htmls = items.map((item) => renderHTML(item.docType, item.data, item.template));

	if (htmls.length === 1) {
		return renderPDF(htmls[0]);
	}

	const styleMatch = htmls[0].match(/<style[^>]*>([\s\S]*?)<\/style>/i);
	if (!styleMatch) throw new Error('No style block found in first student HTML.');

	const allCSS = styleMatch[1];

	// 1. Non-page CSS: everything outside @page blocks
	const nonPageCSS = allCSS.replace(/@page\s*\{[\s\S]*?\}/g, '').trim();

	// 2. Base @page (size/margins from first student, generic @bottom-right, no @bottom-left)
	const pageMatch = allCSS.match(/@page\s*\{[\s\S]*?\}/);
	const basePage = pageMatch
		? pageMatch[0]
			.replace(/@bottom-left\s*\{[\s\S]*?\}/g, '')
			.replace(
				/@bottom-right\s*\{[\s\S]*?\}/g,
				`@bottom-right {\n\t\tcontent: "Halaman: " counter(page);\n\t\tfont-size: 9pt;\n\t\tfont-family: Helvetica, Arial, sans-serif;\n\t\tcolor: #555;\n\t}`
			)
		: '@page { size: A4 portrait; margin: 20mm; }';

	// 3. Build named pages + body content
	const namedPages: string[] = [];
	const bodies: string[] = [];

	for (let i = 0; i < htmls.length; i++) {
		const bodyMatch = htmls[i].match(/<body>([\s\S]*)<\/body>/i);
		if (!bodyMatch) throw new Error(`Failed to extract body from student ${i}`);

		const blMatch = htmls[i].match(/@bottom-left\s*\{([\s\S]*?)\}/i);
		if (blMatch) {
			namedPages.push(
				`@page s${i} {\n\t@bottom-left {\n\t\t${blMatch[1].trim()}\n\t}\n}`
			);
		}

		const cls = i === 0 ? 'sp' : 'sp sp-break';
		bodies.push(`<div class="${cls}" style="page: s${i}">${bodyMatch[1]}</div>`);
	}

	const combined = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>
${nonPageCSS}

${basePage}

${namedPages.join('\n\n')}

.sp-break { page-break-before: always; }
</style>
</head>
<body>
${bodies.join('\n')}
</body>
</html>`;

	return renderPDF(combined);
}
