// Single Murid Preview Logic - Encapsulated & Testable

import {
	createPreviewURLSearchParams,
	type TPMode,
	type RaporCriteria,
	type RaporPeriode
} from '$lib/rapor-params';
import type { PreviewPayload } from '$lib/preview-types';

export type MuridData = {
	id: number;
	nama: string;
	nis?: string | null;
	nisn?: string | null;
};

export type DocumentType =
	'cover' | 'biodata' | 'rapor' | 'piagam' | 'keasramaan' | 'jurnal-mengajar';

export type { PreviewPayload } from '$lib/preview-types';

export type PreviewState = {
	document: DocumentType | '';
	metaTitle: string;
	data: PreviewPayload | null;
	murid: MuridData | null;
	loading: boolean;
	error: string | null;
};

export type SinglePreviewRequest = {
	documentType: DocumentType;
	murid: MuridData;
	kelasId?: number;
	tpMode: TPMode;
	criteria: RaporCriteria;
	raporPeriode?: RaporPeriode;
	signal?: AbortSignal;
};

const DOCUMENT_PATHS: Record<DocumentType, string> = {
	cover: '/cetak/cover',
	biodata: '/cetak/biodata',
	rapor: '/cetak/rapor',
	piagam: '/cetak/piagam',
	keasramaan: '/cetak/keasramaan',
	'jurnal-mengajar': '/cetak/jurnal-mengajar'
};

const DOCUMENT_LABELS: Record<DocumentType, string> = {
	cover: 'Cover',
	biodata: 'Biodata',
	rapor: 'Rapor',
	piagam: 'Piagam',
	keasramaan: 'Rapor Keasramaan',
	'jurnal-mengajar': 'Jurnal Mengajar'
};

export async function loadSinglePreview(
	request: SinglePreviewRequest
): Promise<{ data: PreviewPayload; title: string }> {
	const path = DOCUMENT_PATHS[request.documentType];
	const label = DOCUMENT_LABELS[request.documentType];

	const params = createPreviewURLSearchParams({
		muridId: request.murid.id,
		kelasId: request.kelasId,
		tpMode: request.tpMode,
		criteria: request.criteria,
		raporPeriode: request.raporPeriode
	});

	const response = await fetch(`${path}.json?${params.toString()}`, {
		signal: request.signal
	});

	if (!response.ok) {
		throw new Error(
			`Gagal memuat preview ${label}. Server tidak dapat menyiapkan dokumen. Coba lagi nanti.`
		);
	}

	const payload = (await response.json()) as PreviewPayload;
	const title =
		(payload.meta && typeof payload.meta === 'object' && 'title' in payload.meta
			? ((payload.meta as { title?: string | null }).title ?? '')
			: '') || `${label} - ${request.murid.nama}`;

	return { data: payload, title };
}

export function resetPreviewState(): PreviewState {
	return {
		document: '',
		metaTitle: '',
		data: null,
		murid: null,
		loading: false,
		error: null
	};
}

export function isPreviewableDocument(value: DocumentType | ''): value is DocumentType {
	return (
		value === 'cover' ||
		value === 'biodata' ||
		value === 'rapor' ||
		value === 'piagam' ||
		value === 'keasramaan' ||
		value === 'jurnal-mengajar'
	);
}

export function buildPreviewButtonTitle(
	selectedDocument: DocumentType | '',
	hasSelectionOptions: boolean,
	selectedMurid: MuridData | null,
	isPiagam: boolean
): string {
	if (!selectedDocument) return 'Pilih dokumen yang ingin di-preview terlebih dahulu';
	if (!hasSelectionOptions) {
		return isPiagam
			? 'Tidak ada data peringkat yang tersedia untuk piagam di kelas ini'
			: 'Tidak ada murid yang dapat di-preview untuk kelas ini';
	}
	if (!selectedMurid) {
		return isPiagam
			? 'Pilih peringkat piagam yang ingin di-preview terlebih dahulu'
			: 'Pilih murid yang ingin di-preview terlebih dahulu';
	}
	const label = DOCUMENT_LABELS[selectedDocument as DocumentType] ?? 'dokumen';
	return `Preview ${label} untuk ${selectedMurid.nama}`;
}
