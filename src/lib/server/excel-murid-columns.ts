/**
 * Pemetaan header file Excel Data Murid -> index kolom.
 *
 * Dipisah dari +page.server.ts supaya bisa diuji tanpa DB
 * (scripts/check-wali-asuh-excel.mjs).
 */

function normalizeCell(value: unknown): string {
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number') return String(value).trim();
	return '';
}

function canonicalizeHeader(value: string): string {
	return normalizeCell(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

export type MuridExcelColumns = {
	idxNama: number | undefined;
	idxNipd: number | undefined;
	idxRombel: number | undefined;
	idxNisn: number | undefined;
	idxTempatLahir: number | undefined;
	idxTanggalLahir: number | undefined;
	idxJk: number | undefined;
	idxAgama: number | undefined;
	idxAlamat: number | undefined;
	idxKelurahan: number | undefined;
	idxKecamatan: number | undefined;
	idxKabupaten: number | undefined;
	idxKodePos: number | undefined;
	idxSekolahAsal: number | undefined;
	idxTelepon: number | undefined;
	idxHp: number | undefined;
	idxEmail: number | undefined;
	idxKontakOrangTua: number | undefined;
	idxAyahNama: number | undefined;
	idxAyahJob: number | undefined;
	idxAyahKontak: number | undefined;
	idxAyahBase: number | undefined;
	idxIbuNama: number | undefined;
	idxIbuJob: number | undefined;
	idxIbuKontak: number | undefined;
	idxIbuBase: number | undefined;
	idxWaliNama: number | undefined;
	idxWaliJob: number | undefined;
	idxWaliKontak: number | undefined;
	idxWaliBase: number | undefined;
	idxWaliAsuhNama: number | undefined;
	idxWaliAsuhNip: number | undefined;
};

export function resolveMuridExcelColumns(header: unknown[]): MuridExcelColumns {
	const cells = header.map((cell) => normalizeCell(cell));
	const canonical = cells.map((cell) => canonicalizeHeader(cell));

	const findColumnIndex = (...labels: string[]) => {
		for (const label of labels) {
			const canonicalLabel = canonicalizeHeader(label);
			const idx = canonical.findIndex((cell) => cell === canonicalLabel);
			if (idx !== -1) return idx;
		}
		for (const label of labels) {
			const canonicalLabel = canonicalizeHeader(label);
			const idx = canonical.findIndex((cell) => cell.includes(canonicalLabel));
			if (idx !== -1) return idx;
		}
		return undefined;
	};

	const findColumnByPredicate = (
		predicate: (canonical: string, original: string, index: number) => boolean
	): number | undefined => {
		const idx = cells.findIndex((cell, index) => predicate(canonical[index], cell, index));
		return idx >= 0 ? idx : undefined;
	};

	return {
		idxNama: findColumnIndex('Nama', 'Nama Peserta Didik', 'Nama Siswa'),
		idxNipd: findColumnIndex('NIPD', 'NIS', 'Nomor Induk', 'No Induk'),
		idxRombel: findColumnByPredicate((cell) => cell.startsWith('rombel')),
		idxNisn: findColumnIndex('NISN'),
		idxTempatLahir: findColumnIndex('Tempat Lahir', 'Tempat Lahir Peserta Didik'),
		idxTanggalLahir: findColumnIndex('Tanggal Lahir', 'Tanggal Lahir Peserta Didik'),
		idxJk: findColumnIndex('JK', 'Jenis Kelamin'),
		idxAgama: findColumnIndex('Agama'),
		idxAlamat: findColumnIndex('Alamat', 'Alamat Jalan', 'Alamat Peserta Didik'),
		idxKelurahan: findColumnIndex('Kelurahan', 'Kelurahan/Desa', 'Kelurahan / Desa', 'Desa'),
		idxKecamatan: findColumnIndex('Kecamatan'),
		idxKabupaten: findColumnIndex('Kabupaten', 'Kabupaten/Kota', 'Kabupaten / Kota'),
		idxKodePos: findColumnIndex('Kode Pos'),
		idxSekolahAsal: findColumnIndex('Sekolah Asal', 'Sekolah Asal Siswa', 'Pendidikan Sebelumnya'),
		idxTelepon: findColumnIndex('Telepon', 'No Telepon', 'No. Telepon', 'Telepon Rumah'),
		idxHp: findColumnIndex('HP', 'No HP', 'No. HP', 'Nomor HP', 'Nomor Hp', 'HP Siswa'),
		idxEmail: findColumnIndex('E-Mail', 'Email', 'Surel'),
		idxKontakOrangTua: findColumnIndex(
			'Kontak',
			'Kontak Orang Tua',
			'Kontak Ortu',
			'Nomor Kontak Orang Tua',
			'No HP Orang Tua',
			'No Hp Orang Tua',
			'No Hp Ortu',
			'No Telepon Orang Tua',
			'No Telpon Orang Tua',
			'No Telepon Ortu',
			'Telepon Orang Tua',
			'HP Orang Tua',
			'HP Ortu'
		),
		idxAyahNama: findColumnIndex('Nama Ayah', 'Nama Ayah Kandung'),
		idxAyahJob: findColumnIndex('Pekerjaan Ayah', 'Pekerjaan Ayah Kandung'),
		idxAyahKontak: findColumnIndex('Kontak Ayah', 'No HP Ayah', 'No Hp Ayah', 'Telepon Ayah'),
		idxAyahBase: findColumnIndex('Data Ayah'),
		idxIbuNama: findColumnIndex('Nama Ibu', 'Nama Ibu Kandung'),
		idxIbuJob: findColumnIndex('Pekerjaan Ibu', 'Pekerjaan Ibu Kandung'),
		idxIbuKontak: findColumnIndex('Kontak Ibu', 'No HP Ibu', 'No Hp Ibu', 'Telepon Ibu'),
		idxIbuBase: findColumnIndex('Data Ibu'),
		idxWaliNama: findColumnIndex('Nama Wali', 'Nama Wali Murid'),
		idxWaliJob: findColumnIndex('Pekerjaan Wali', 'Pekerjaan Wali Murid'),
		idxWaliKontak: findColumnIndex('Kontak Wali', 'No HP Wali', 'No Hp Wali', 'Telepon Wali'),
		idxWaliBase: findColumnIndex('Data Wali'),
		// 'Wali Asuh' = kolom hasil unduhan Data Murid (/murid), 'Nama Wali Asuh' = format dapodik.
		// Pencocokan exact (bukan includes) supaya kolom 'Nama Wali'/'NIPD' tidak ikut tertangkap.
		idxWaliAsuhNama:
			findColumnByPredicate((cell) => cell === 'nama wali asuh') ??
			findColumnByPredicate((cell) => cell === 'wali asuh'),
		idxWaliAsuhNip:
			findColumnByPredicate((cell) => cell === 'nip wali asuh') ??
			findColumnByPredicate((cell) => cell === 'nip')
	};
}

/**
 * Nilai wali asuh dari file tidak boleh menghapus data lama kalau sel kosong.
 * Impor file tanpa kolom Wali Asuh (atau sel kosong) harus mempertahankan data yang ada.
 */
export function mergeWaliAsuh(
	incoming: string | null | undefined,
	existing: string | null | undefined
): string | null {
	return incoming || existing || null;
}
