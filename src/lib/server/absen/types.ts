export type StatusPerDay = '' | 'H' | 'S' | 'I' | 'TK';

export type BulananRow = {
	no: number;
	nama: string;
	statusPerDay: StatusPerDay[];
	countS: number;
	countI: number;
	countTK: number;
	countHadir: number;
};

export type RaporRow = {
	id: number;
	no: number;
	nama: string;
	hadir: number;
	sakit: number;
	izin: number;
	alfa: number;
	overridden: boolean;
};

export type KehadiranRow = {
	id: number;
	no: number;
	nama: string;
	hadir: boolean;
	keterangan: string | null;
	keteranganPulang: string | null;
	updatedAt: string | null;
};

export type PersentaseBulananRow = {
	no: number;
	nama: string;
	persentase: number;
	hadir: number;
	sakit: number;
	izin: number;
	alfa: number;
};

export type PersentaseSemesterRow = {
	no: number;
	nama: string;
	persentase: number;
	hadir: number;
	sakit: number;
	izin: number;
	alfa: number;
};

export type PersentaseHarianSubject = {
	kodeKegiatan: string;
	label: string;
};

export type PersentaseHarianRow = {
	no: number;
	muridId: number;
	nama: string;
	subjects: Record<string, string>;
	sessionStatuses: Record<string, { masuk: string; selesai: string }>;
	persentase: number;
};

export type JadwalSaatIni = {
	mataPelajaranId: number | null;
	namaMataPelajaran: string;
	jamKe: number;
	perkiraanJam: string;
};

export type PageState = {
	search: string | null;
	currentPage: number;
	totalPages: number;
	totalItems: number;
	perPage: number;
};

export type Mode =
	| 'harian'
	| 'persentase_harian'
	| 'bulanan'
	| 'persentase_bulanan'
	| 'persentase_semester'
	| 'rapor';

export type AbsenLoadData = {
	meta: { title: string };
	tableReady: boolean;
	page: PageState;
	daftarMurid: KehadiranRow[];
	semuaMurid: Array<{ id: number; nama: string; keterangan: string | null }>;
	totalMurid: number;
	muridCount: number;
	tanggal: string;
	mode: Mode;
	bulan: number;
	tahun: number;
	daysInMonth: number;
	totalHariBelajar: number;
	bulananRows: BulananRow[];
	raporRows: RaporRow[];
	persentaseBulananRows: PersentaseBulananRow[];
	persentaseSemesterRows: PersentaseSemesterRow[];
	redDays: number[];
	tanggalMulaiRapor: string;
	tanggalAkhirRapor: string;
	presensiReady: boolean;
	presensiWarningMessage: string;
	jenisPresensi: string;
	tipePresensi: string;
	persentaseHarianSubjects: PersentaseHarianSubject[];
	persentaseHarianRows: PersentaseHarianRow[];
	jadwalSaatIni: JadwalSaatIni | null;
	simulasiHari: string | null;
	simulasiJam: string | null;
};
