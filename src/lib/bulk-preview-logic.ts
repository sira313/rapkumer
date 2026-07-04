// Bulk Preview Logic - Robust Loading with Progress & Error Handling

import {
	loadBulkPreviews,
	getSuccessfulResults,
	validateBulkResults
} from '$lib/bulk-preview-loader';
import {
	createPreviewURLSearchParams,
	type TPMode,
	type RaporCriteria,
	type RaporPeriode
} from '$lib/rapor-params';
import type { MuridData, DocumentType } from './single-preview-logic';
import type { PreviewPayload } from './preview-types';

export type BulkPreviewRequest = {
	documentType: DocumentType;
	muridList: MuridData[];
	kelasId?: number;
	tpMode: TPMode;
	criteria: RaporCriteria;
	raporPeriode?: RaporPeriode;
	signal?: AbortSignal;
	onProgress?: (current: number, total: number) => void;
};

export type BulkPreviewResult = {
	isValid: boolean;
	successCount: number;
	failureCount: number;
	failedMurids: string[];
	data: Array<{ murid: MuridData; data: PreviewPayload }>;
};

const DOCUMENT_PATHS: Record<DocumentType, string> = {
	cover: '/cetak/cover',
	biodata: '/cetak/biodata',
	rapor: '/cetak/rapor',
	piagam: '/cetak/piagam',
	keasramaan: '/cetak/keasramaan',
	'jurnal-mengajar': '/cetak/jurnal-mengajar'
};

/**
 * Load previews for multiple murids with robust error handling
 */
export async function loadBulkPreviews_robust(
	request: BulkPreviewRequest
): Promise<BulkPreviewResult> {
	const path = DOCUMENT_PATHS[request.documentType];

	// Convert murid list to bulk load requests
	const bulkResults = await loadBulkPreviews(
		request.muridList.map((murid) => ({
			muridId: murid.id,
			muridNama: murid.nama
		})),
		async (muridId: number) => {
			const params = createPreviewURLSearchParams({
				muridId,
				kelasId: request.kelasId,
				tpMode: request.tpMode,
				criteria: request.criteria,
				raporPeriode: request.raporPeriode
			});

			const response = await fetch(`${path}.json?${params.toString()}`, {
				signal: request.signal
			});

			if (!response.ok) {
				throw new Error(`Server returned ${response.status}: ${response.statusText}`);
			}

			return (await response.json()) as PreviewPayload;
		},
		{
			signal: request.signal,
			concurrency: 3,
			onProgress: request.onProgress
		}
	);

	// Validate results
	const validation = validateBulkResults(bulkResults, 1);

	// Map successful results to data format
	const successfulResults = getSuccessfulResults(bulkResults);
	const data = request.muridList
		.filter((murid) => successfulResults.some((r) => r.muridId === murid.id))
		.map((murid) => ({
			murid,
			data: successfulResults.find((r) => r.muridId === murid.id)!.data
		}));

	return {
		isValid: validation.isValid,
		successCount: validation.successCount,
		failureCount: validation.failureCount,
		failedMurids: validation.failedMurids,
		data
	};
}

export function buildBulkErrorMessage(
	docLabel: string,
	failureCount: number,
	failedMurids: string[]
): string {
	if (failureCount === 0) {
		return `Tidak ada data yang berhasil dimuat untuk murid manapun.`;
	}

	const failedList = failedMurids.slice(0, 3).join(', ');
	const moreCount = failedMurids.length - 3;
	const failedStr = moreCount > 0 ? `${failedList}, dan ${moreCount} murid lainnya` : failedList;

	return `Gagal memuat preview ${docLabel} untuk: ${failedStr}`;
}

export function buildBulkSuccessMessage(
	docLabel: string,
	successCount: number,
	failureCount: number
): string {
	if (failureCount === 0) {
		return `Siap mencetak ${successCount} ${docLabel}`;
	}
	return `Siap mencetak ${successCount} ${docLabel} (${failureCount} gagal dimuat)`;
}
