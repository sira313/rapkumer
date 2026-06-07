import type { EkstrakurikulerNilaiKategori } from '$lib/ekstrakurikuler';

export type KeasramaanOption = {
	id: number;
	nama: string;
	tujuanCount: number;
};

export type KeasramaanDetail = {
	id: number;
	nama: string;
	tujuan: Array<{ id: number; deskripsi: string }>;
};

export type NilaiEntry = {
	tujuanId: number;
	tujuan: string;
	kategori: EkstrakurikulerNilaiKategori | null;
	kategoriLabel: string | null;
	timestamp: string | null;
};

export type MuridRow = {
	id: number;
	nama: string;
	no: number;
	nilai: NilaiEntry[];
	deskripsi: string | null;
	hasNilai: boolean;
	lastUpdated: string | null;
	isAsuhanku: boolean;
};

export type PaginationState = {
	currentPage: number;
	totalPages: number;
};

export type PageData = {
	keasramaanList: KeasramaanOption[];
	selectedKeasramaanId: number | null;
	selectedKeasramaan: KeasramaanDetail | null;
	daftarMurid: MuridRow[];
	totalMurid: number;
	muridCount: number;
	search?: string | null;
	page: PaginationState;
};
