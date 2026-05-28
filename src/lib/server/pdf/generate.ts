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
 * Extract all @page CSS blocks using brace counting so nested rules
 * (@bottom-left, @bottom-right) are handled correctly.
 */
function extractPageBlocks(css: string): string[] {
	const blocks: string[] = [];
	const re = /@page\s*\{/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(css)) !== null) {
		let depth = 1;
		const start = match.index;
		let i = match.index + match[0].length;
		while (i < css.length && depth > 0) {
			if (css[i] === '{') depth++;
			else if (css[i] === '}') depth--;
			i++;
		}
		if (depth === 0) {
			blocks.push(css.substring(start, i));
		}
	}
	return blocks;
}

/** Build a combined CSS string for bulk PDF generation using running elements. */
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

	const bodyClassRe = /<body[^>]*\sclass="([^"]*)"[^>]*>/i;
	const bodyClassMatch = htmls[0].match(bodyClassRe);
	const bodyClass = bodyClassMatch ? bodyClassMatch[1] : '';

	const pageBlocks = extractPageBlocks(allCSS);

	let nonPageCSS = allCSS;
	for (const block of pageBlocks) {
		nonPageCSS = nonPageCSS.replace(block, '');
	}
	nonPageCSS = nonPageCSS.trim();

	const templatePage =
		pageBlocks.find((b) => /@bottom-(left|right)/.test(b)) ??
		pageBlocks[pageBlocks.length - 1] ??
		pageBlocks[0];

	const hasBottomLeft = templatePage ? /@bottom-left/.test(templatePage) : false;

	const basePage =
		hasBottomLeft && templatePage
			? templatePage.replace(/content:\s*"[^"]*"/, 'content: element(footer-left)').trim()
			: templatePage
				? templatePage.trim()
				: '@page { size: A4 portrait; margin: 20mm; }';

	const bodies: string[] = [];

	for (let i = 0; i < htmls.length; i++) {
		const bodyMatch = htmls[i].match(/<body[^>]*>([\s\S]*)<\/body>/i);
		if (!bodyMatch) throw new Error(`Failed to extract body from student ${i}`);

		if (hasBottomLeft) {
			let runningFooter = '';
			const blMatch = htmls[i].match(/@bottom-left\s*\{([\s\S]*?)\}/i);
			if (blMatch) {
				const contentMatch = blMatch[1].match(/content:\s*"([^"]*)"/i);
				const footerText = contentMatch ? contentMatch[1] : '';
				if (footerText) {
					runningFooter = `<span class="footer-left">${footerText}</span>`;
				}
			}
			const cls = i === 0 ? 'sp' : 'sp sp-break';
			bodies.push(`<div class="${cls}">${runningFooter}${bodyMatch[1]}</div>`);
		} else {
			if (i > 0) {
				bodies.push(`<div class="sp-break"></div>`);
			}
			bodies.push(bodyMatch[1]);
		}
	}

	const watermarkRe = /<img[^>]*\bclass\s*=\s*"watermark"[^>]*>/gi;
	const watermarkMatch = bodies[0].match(watermarkRe);
	const watermarkHtml = watermarkMatch ? watermarkMatch[0] : '';

	const piagamBgRe = /<div\s+class="piagam-bg"[^>]*><\/div>/gi;
	const piagamBgMatch = bodies[0].match(piagamBgRe);
	const piagamBgHtml = piagamBgMatch ? piagamBgMatch[0] : '';

	const cleanedBodies = bodies.map((body) => body.replace(watermarkRe, '').replace(piagamBgRe, ''));

	const combined = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>
${nonPageCSS}

${basePage}

.sp-break { page-break-before: always; }

.footer-left {
	position: running(footer-left);
	font-size: 9pt;
	font-family: Helvetica, Arial, sans-serif;
	color: #555;
}

@media print {
	.footer-left { position: running(footer-left); }
}
</style>
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
${watermarkHtml}
${piagamBgHtml}
${cleanedBodies.join('\n')}
</body>
</html>`;

	return renderPDF(combined);
}
