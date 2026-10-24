import { jenisMapel } from '$lib/statics';

export type JenisMapelKey = MataPelajaran['jenis'];

type SekolahLike = { jenjangVariant?: string | null } | null | undefined;

export function isJenjangSmk(sekolah: SekolahLike): boolean {
	return (sekolah?.jenjangVariant ?? '').toUpperCase() === 'SMK';
}

// Label panjang (tabel, form, rapor). SMK memakai "Mata Pelajaran Umum" untuk `wajib`.
export function jenisMapelLabel(
	jenis: JenisMapelKey | null | undefined,
	sekolah?: SekolahLike
): string {
	const key = jenis ?? 'wajib';
	if (key === 'wajib') {
		return isJenjangSmk(sekolah) ? 'Mata Pelajaran Umum' : 'Mata Pelajaran Wajib';
	}
	if (key === 'kejuruan') return 'Mata Pelajaran Kejuruan';
	if (key === 'pemberdayaan') return 'Muatan Pemberdayaan dan Keterampilan';
	return jenisMapel[key] ?? key;
}

// Label pendek untuk badge/statistik ("Wajib"/"Umum").
export function jenisMapelLabelShort(
	jenis: JenisMapelKey | null | undefined,
	sekolah?: SekolahLike
): string {
	const key = jenis ?? 'wajib';
	if (key === 'wajib') return isJenjangSmk(sekolah) ? 'Umum' : 'Wajib';
	return jenisMapel[key] ?? key;
}
