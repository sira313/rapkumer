// Shared Types for Preview System

export type DocumentType =
	| 'cover'
	| 'biodata'
	| 'rapor'
	| 'piagam'
	| 'keasramaan'
	| 'jurnal-mengajar';

export type MuridData = {
	id: number;
	nama: string;
	nis?: string | null;
	nisn?: string | null;
};

// Generic preview payload - actual structure depends on document type
// See PreviewContent.svelte for the full App.PageData-based definition
export type PreviewPayload = {
	meta?: { title?: string | null } | null;
	[key: string]: unknown;
};
