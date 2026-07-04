import { PDFDocument } from 'pdf-lib';
import { mkdtemp, writeFile, readFile, unlink, rm } from 'node:fs/promises';
import { tmpdir, availableParallelism } from 'node:os';
import { join } from 'node:path';
import { renderPDF } from './pagedpdf';
import { renderCoverHTML } from './templates/cover';
import { renderRaporHTML } from './templates/rapor';
import { renderBiodataHTML } from './templates/biodata';
import { renderKeasramaanHTML } from './templates/keasramaan';
import { renderPiagamHTML } from './templates/piagam';
import { renderKartuMuridHTML } from './templates/kartu-murid';
import { renderJurnalMengajarHTML } from './templates/jurnal-mengajar';

export type DocumentType =
	| 'cover'
	| 'rapor'
	| 'biodata'
	| 'keasramaan'
	| 'piagam'
	| 'kartu-murid'
	| 'jurnal-mengajar';

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
		case 'kartu-murid':
			return renderKartuMuridHTML(data as never);
		case 'jurnal-mengajar':
			return renderJurnalMengajarHTML(data as never);
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

/** Jumlah worker concurrent untuk generate PDF individual. */
const CONCURRENCY = Math.min(availableParallelism() || 4, 8);

/** Tulis tiap PDF student ke temp file, return array path file. */
async function generateAllPDFs(items: BulkItem[], tmpDir: string): Promise<string[]> {
	const filePaths: string[] = new Array(items.length);
	let index = 0;

	async function worker(): Promise<void> {
		while (index < items.length) {
			const i = index++;
			const pdf = await generatePDF(items[i].docType, items[i].data, items[i].template);
			const filePath = join(tmpDir, `${i}.pdf`);
			await writeFile(filePath, pdf);
			filePaths[i] = filePath;
		}
	}

	const poolSize = Math.min(CONCURRENCY, items.length);
	const workers = Array.from({ length: poolSize }, () => worker());
	await Promise.all(workers);
	return filePaths;
}

/** Merge 2 file PDF menjadi 1 file output, lalu hapus file sumber. */
async function mergeTwoPDFs(aPath: string, bPath: string, outPath: string): Promise<void> {
	const [aBuf, bBuf] = await Promise.all([readFile(aPath), readFile(bPath)]);
	const merged = await PDFDocument.create();
	for (const buf of [aBuf, bBuf]) {
		const pdf = await PDFDocument.load(buf);
		const pages = await merged.copyPages(pdf, pdf.getPageIndices());
		for (const page of pages) merged.addPage(page);
	}
	await writeFile(outPath, await merged.save());
	await Promise.all([unlink(aPath), unlink(bPath)]);
}

export async function generateBulkPDF(items: BulkItem[]): Promise<Uint8Array> {
	if (!items.length) throw new Error('No items to generate PDF for.');
	if (items.length === 1) return generatePDF(items[0].docType, items[0].data, items[0].template);

	const tmpDir = await mkdtemp(join(tmpdir(), 'rapkumer-bulk-'));

	try {
		let batch = await generateAllPDFs(items, tmpDir);

		// Binary merge tree — each round merges pairs into new files, deleting originals.
		// Peak memory: only 2 PDFs loaded at a time per merge operation.
		// Use a global counter so filenames are unique across all rounds, preventing
		// a round-2 output from colliding with a round-1 input that hasn't been consumed yet.
		let mergeId = 0;
		while (batch.length > 1) {
			const next: string[] = [];
			const pairs: [string, string][] = [];

			for (let i = 0; i < batch.length; i += 2) {
				if (i + 1 < batch.length) {
					pairs.push([batch[i], batch[i + 1]]);
				} else {
					next.push(batch[i]);
				}
			}

			const mergedPaths = await Promise.all(
				pairs.map(([a, b]) => {
					const out = join(tmpDir, `m_${mergeId++}.pdf`);
					return mergeTwoPDFs(a, b, out).then(() => out);
				})
			);

			batch = [...next, ...mergedPaths];
		}

		return await readFile(batch[0]);
	} finally {
		await rm(tmpDir, { recursive: true, force: true });
	}
}
