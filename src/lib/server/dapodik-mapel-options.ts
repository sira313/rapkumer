import db from '$lib/server/db';
import { tableDapodikMataPelajaran, tableDapodikPembelajaran } from '$lib/server/db/schema';
import { eq, isNull } from 'drizzle-orm';

export type OpsiMapelDapodik = { nama: string; kode: string | null };

// Dapodik tidak punya katalog mapel per tingkat (getPembelajaran 404; row
// pembelajaran rombel hanya mapel yang diinput operator — di SD umumnya cuma
// Guru Kelas + PJOK karena mapel lain diajar wali kelas). Daftar pilihan =
// pembelajaran rombel DIGABUNG referensi nasional (hasil Dapodik Sync).
// Jenjang dasar/menengah dibatasi subset ber-nama umum agar tidak menawarkan
// mapel khas lanjutan; jenjang lanjutan (SMA/SMK/MA/PKBM) memakai seluruh
// referensi agar mapel seperti Kimia/Fisika/Biologi tersedia.
const RE_MAPEL_UMUM_DASAR =
	/^(guru kelas sd|pendidikan agama|pendidikan kepercayaan|pendidikan pancasila|pendidikan kewarganegaraan|bahasa indonesia|bahasa inggris|matematika|ilmu pengetahuan alam|ilmu pengetahuan sosial|ipas|seni budaya|seni rupa|sbdp|prakarya|pendidikan jasmani|pjok|muatan lokal|mulok|bahasa daerah|informatika|koding|pembelajaran berbasis proje[ky])/;
const RE_NOISE = /(tingkat lanjut|peminatan|maritim|perikanan|bimp)/i;

function grupJenjangDasarMenengah(sekolah: App.Locals['sekolah']): boolean {
	const jenjang = (sekolah?.jenjangPendidikan ?? '').toLowerCase();
	const variant = (sekolah?.jenjangVariant ?? '').toLowerCase();
	return ['sd', 'slb', 'smp'].includes(jenjang) || ['mi', 'mts', 'slb-dasar'].includes(variant);
}

/** Daftar opsi nama mapel Dapodik + kandidat pembelajaran induk untuk satu kelas. */
export async function opsiMapelDapodik(
	kelasId: number,
	sekolah: App.Locals['sekolah']
): Promise<{
	dapodikMapelList: OpsiMapelDapodik[];
	indukList: Array<{ nama: string; pembelajaranId: string }>;
}> {
	const referensiPromise = db
		.select({
			nama: tableDapodikMataPelajaran.nama,
			kode: tableDapodikMataPelajaran.mataPelajaranId
		})
		.from(tableDapodikMataPelajaran)
		.where(isNull(tableDapodikMataPelajaran.jurusanId));
	const [pembelajaranRows, referensiRows, indukList] = await Promise.all([
		db
			.selectDistinct({
				nama: tableDapodikPembelajaran.nama,
				kode: tableDapodikPembelajaran.mataPelajaranId
			})
			.from(tableDapodikPembelajaran)
			.where(eq(tableDapodikPembelajaran.kelasId, kelasId)),
		referensiPromise,
		db
			.select({
				nama: tableDapodikPembelajaran.nama,
				pembelajaranId: tableDapodikPembelajaran.pembelajaranId
			})
			.from(tableDapodikPembelajaran)
			.where(eq(tableDapodikPembelajaran.kelasId, kelasId))
	]);
	// Kunci gabungan nama+kode: nama sama dengan kode referensi berbeda
	// tetap tampil sebagai opsi terpisah.
	const opsiMap = new Map<string, OpsiMapelDapodik>();
	for (const row of pembelajaranRows) {
		opsiMap.set(`${row.nama}|${row.kode ?? ''}`, { nama: row.nama, kode: row.kode ?? null });
	}
	for (const row of referensiRows ?? []) {
		const nama = row.nama.trim();
		if (!nama || RE_NOISE.test(nama)) continue;
		if (grupJenjangDasarMenengah(sekolah) && !RE_MAPEL_UMUM_DASAR.test(nama.toLowerCase()))
			continue;
		const kode = String(row.kode);
		opsiMap.set(`${nama}|${kode}`, { nama, kode });
	}
	return {
		dapodikMapelList: [...opsiMap.values()].sort((a, b) => a.nama.localeCompare(b.nama, 'id')),
		indukList: [...indukList].sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
	};
}
