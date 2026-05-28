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

/**
 * Build a combined CSS string for bulk PDF generation using named pages.
 *
 * Strategy:
 * 1. Extract all @page blocks from the first student's CSS with brace counting.
 * 2. Use the template-specific @page (one with @bottom-left/@bottom-right) as base,
 *    stripping both footer rules (they'll be provided per-student).
 * 3. For each student create a named page @page sN with both @bottom-left and
 *    @bottom-right so PagedJS doesn't need @page inheritance.
 * 4. Wrap each student's body in <div style="page: sN"> to activate the page name.
 * 5. Inter-student spacing via sp-break class (page-break-before: always).
 * 6. Single watermark at the combined level to prevent fixed-position stacking.
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

	// Extract all @page blocks using brace counting (handles nested @bottom-left/rules)
	const pageBlocks = extractPageBlocks(allCSS);

	// Remove all complete @page blocks from CSS to get non-page CSS
	let nonPageCSS = allCSS;
	for (const block of pageBlocks) {
		nonPageCSS = nonPageCSS.replace(block, '');
	}
	nonPageCSS = nonPageCSS.trim();

	// Use the template-specific @page (one with @bottom-left or @bottom-right) as base.
	// Falls back to the last @page block, or first, or a sensible default.
	const templatePage =
		pageBlocks.find((b) => /@bottom-(left|right)/.test(b)) ??
		pageBlocks[pageBlocks.length - 1] ??
		pageBlocks[0];

	// Strip both @bottom-left and @bottom-right from base (they'll be provided per-student)
	const basePage = templatePage
		? templatePage
				.replace(/@bottom-left\s*\{[\s\S]*?\}/g, '')
				.replace(/@bottom-right\s*\{[\s\S]*?\}/g, '')
				.trim()
		: '@page { size: A4 portrait; margin: 20mm; }';

	// Extract @bottom-right content from the template for use in each named page
	const brMatch = templatePage ? templatePage.match(/@bottom-right\s*\{([\s\S]*?)\}/i) : null;
	const bottomRightContent = brMatch ? brMatch[1].trim() : '';

	// Build named pages + body content
	const namedPages: string[] = [];
	const bodies: string[] = [];

	for (let i = 0; i < htmls.length; i++) {
		const bodyMatch = htmls[i].match(/<body>([\s\S]*)<\/body>/i);
		if (!bodyMatch) throw new Error(`Failed to extract body from student ${i}`);

		const blMatch = htmls[i].match(/@bottom-left\s*\{([\s\S]*?)\}/i);
		if (blMatch) {
			let namedPageCss = `@page s${i} {\n\t@bottom-left {\n\t\t${blMatch[1].trim()}\n\t}\n`;
			if (bottomRightContent) {
				namedPageCss += `\t@bottom-right {\n\t\t${bottomRightContent}\n\t}\n`;
			}
			namedPageCss += '}';
			namedPages.push(namedPageCss);
		}

		const cls = i === 0 ? 'sp' : 'sp sp-break';
		bodies.push(`<div class="${cls}" style="page: s${i}">${bodyMatch[1]}</div>`);
	}

	// Strip duplicate watermarks from all bodies and add one at the combined level.
	// position: fixed elements are rendered on every page by PagedJS; having N of them
	// would stack opacity (0.12 × N → near opaque).
	const watermarkRe = /<img[^>]*\bclass\s*=\s*"watermark"[^>]*>/gi;
	const watermarkMatch = bodies[0].match(watermarkRe);
	const watermarkHtml = watermarkMatch ? watermarkMatch[0] : '';
	const cleanedBodies = bodies.map((body) => body.replace(watermarkRe, ''));

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
${watermarkHtml}
${cleanedBodies.join('\n')}
</body>
</html>`;

	return renderPDF(combined);
}
