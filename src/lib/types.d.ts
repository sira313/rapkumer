interface MenuItem {
	title: string;
	path?: string;
	icon?: IconName;
	tags?: string[];
	subMenu?: MenuItem[];
	condition?: 'genap' | 'ganjil';
}

interface PageMeta {
	title?: string;
	description?: string;
	logoUrl?: string;
}

interface CoverPrintData {
	sekolah: {
		nama: string;
		jenjang: 'sd' | 'smp' | 'sma' | 'slb' | 'pkbm' | 'srt';
		jenjangVariant?: string | null;
		npsn: string;
		naungan?: 'kemendikbud' | 'kemsos' | 'kemenag' | null;
		alamat: {
			jalan: string;
			desa: string;
			kecamatan: string;
			kabupaten: string;
			provinsi?: string | null;
			kodePos?: string | null;
		};
		website?: string | null;
		email?: string | null;
		logoUrl?: string | null;
		logoDinasUrl?: string | null;
	};
	murid: {
		nama: string;
		nis?: string | null;
		nisn?: string | null;
	};
}

interface BiodataPrintData {
	sekolah: {
		nama: string;
		bgLogoSrc?: string | null;
		statusKepalaSekolah?: string | null;
	};
	showBgLogo?: boolean;
	murid: {
		id?: number;
		foto?: string | null;
		nama: string;
		nis: string;
		nisn: string;
		tempatLahir: string;
		tanggalLahir: string;
		jenisKelamin: string;
		agama: string;
		pendidikanSebelumnya: string;
		alamat: {
			jalan: string;
			kelurahan: string;
			kecamatan: string;
			kabupaten: string;
			provinsi: string;
		};
	};
	orangTua: {
		ayah: {
			nama: string;
			pekerjaan: string;
		};
		ibu: {
			nama: string;
			pekerjaan: string;
		};
		alamat: {
			jalan: string;
			kelurahan: string;
			kecamatan: string;
			kabupaten: string;
			provinsi: string;
		};
	};
	wali: {
		nama: string;
		pekerjaan: string;
		alamat: string;
	};
	ttd: {
		tempat: string;
		tanggal: string;
		kepalaSekolah: string;
		nip: string;
	};
}

interface RaporPrintData {
	sekolah: {
		nama: string;
		alamat: string;
		bgLogoSrc?: string | null;
		jenjangVariant?: string | null;
	};
	raporPeriode?: 'rts' | 'ras';
	murid: {
		nama: string;
		nis: string;
		nisn: string;
	};
	rombel: {
		nama: string;
		fase: string;
	};
	periode: {
		tahunPelajaran: string;
		semester: string;
	};
	waliKelas: {
		nama: string;
		nip?: string | null;
	};
	kepalaSekolah: {
		nama: string;
		nip?: string | null;
		statusKepalaSekolah?: string | null;
	};
	nilaiIntrakurikuler: Array<{
		kelompok?: string | null;
		mataPelajaran: string;
		nilaiAkhir: string;
		deskripsi: string;
		jenis?: 'wajib' | 'pilihan' | 'mulok' | 'kejuruan';
	}>;
	kokurikuler: string;
	hasKokurikuler: boolean;
	ekstrakurikuler: Array<{
		nama: string;
		deskripsi: string;
	}>;
	ketidakhadiran: {
		sakit: number;
		izin: number;
		tanpaKeterangan: number;
	};
	catatanWali: string;
	tanggapanOrangTua: string;
	naik: boolean;
	ttd: {
		tempat: string;
		tanggal: string;
	};

	// Mode for tujuan pembelajaran display: compact | full-desc
	tpMode?: 'compact' | 'full-desc';
	showBgLogo?: boolean;
}

interface PiagamPrintData {
	sekolah: {
		nama: string;
		jenjang: 'sd' | 'smp' | 'sma' | 'slb' | 'pkbm' | 'srt';
		npsn: string;
		alamat: {
			jalan: string;
			desa: string;
			kecamatan: string;
			kabupaten: string;
			provinsi?: string | null;
			kodePos?: string | null;
		};
		website?: string | null;
		email?: string | null;
		logoUrl?: string | null;
		logoDinasUrl?: string | null;
	};
	murid: {
		nama: string;
	};
	penghargaan: {
		rataRata: number | null;
		rataRataFormatted: string;
		ranking: number | null;
		rankingLabel: string;
		judul: string;
		subjudul: string;
		motivasi: string;
	};
	periode: {
		semester: string;
		tahunAjaran: string;
		namaKelas: string | null;
	};
	ttd: {
		tempat: string;
		tanggal: string;
		kepalaSekolah: {
			nama: string;
			nip?: string | null;
			statusKepalaSekolah?: string | null;
		};
		waliKelas: {
			nama: string;
			nip?: string | null;
		};
	};
}

interface KeasramaanPrintData {
	sekolah: {
		nama: string;
		alamat: string;
		logoUrl?: string | null;
		jenjangVariant?: string | null;
	};
	murid: {
		nama: string;
		nis: string;
		nisn: string;
	};
	rombel: {
		nama: string;
		fase: string;
	};
	periode: {
		tahunAjaran: string;
		semester: string;
	};
	waliAsrama: { nama: string; nip?: string | null } | null;
	waliKelas: { nama: string; nip?: string | null } | null;
	waliAsuh: { nama: string; nip?: string | null } | null;
	kepalaSekolah: { nama: string; nip?: string | null; statusKepalaSekolah?: string | null } | null;
	ttd: {
		tempat: string;
		tanggal: string;
	};
	kehadiran: {
		sakit: number;
		izin: number;
		alfa: number;
	} | null;
	keasramaanRows: Array<{
		no: number;
		indikator: string;
		predikat: 'perlu-bimbingan' | 'cukup' | 'baik' | 'sangat-baik';
		deskripsi: string;
		kategoriHeader?: string;
	}>;
}

type MaybePromise<T> = T | Promise<T>;

type FormSubmitEvent = SubmitEvent & { currentTarget: EventTarget & HTMLFormElement };

type OptId<T, ID = number> = Omit<T, 'id'> & { id?: ID };

type ValueOf<T> = T[keyof T];

interface UpdateAsset {
	id: number;
	name: string;
	size: number;
	downloadUrl: string;
	contentType: string | null;
}

interface ReleaseSummary {
	version: string;
	name: string;
	notes: string;
	publishedAt: string;
	htmlUrl: string;
	isPrerelease: boolean;
	assets: UpdateAsset[];
}

interface UpdateCheckResponse {
	currentVersion: string;
	updateAvailable: boolean;
	latest: ReleaseSummary | null;
}

type UpdateDownloadState = 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';

interface UpdateDownloadStatus {
	id: string;
	version: string;
	assetName: string;
	status: UpdateDownloadState;
	downloadedBytes: number;
	totalBytes: number | null;
	error: string | null;
	installScheduled: boolean;
}

// Declare exceljs module for TS when types are not present in node_modules
declare module 'exceljs' {
	// Minimal typing surface used in the project. Keep conservative types to
	// avoid pulling a heavy dependency for full typings.
	export class Workbook {
		addWorksheet(name: string): Worksheet;
		xlsx: {
			writeBuffer(): Promise<ArrayBuffer | ArrayBufferView>;
		};
	}

	export interface Worksheet {
		addRows(rows: Array<unknown>): void;
		getColumn(index: number): { width?: number };
		views?: unknown;
	}

	const ExcelJS: {
		Workbook: typeof Workbook;
	};

	export default ExcelJS;
}
