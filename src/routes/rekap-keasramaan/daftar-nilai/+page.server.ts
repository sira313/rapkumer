import db from '$lib/server/db';
import {
	tableMurid,
	tablePegawai,
	tableKeasramaan,
	tableKeasramaanIndikator,
	tableKeasramaanTujuan,
	tableAsesmenKeasramaan,
	tableKelas
} from '$lib/server/db/schema';
import { kategoriToRubrikValue, nilaiAngkaToHuruf } from '$lib/components/asesmen-keasramaan/utils';
import { error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';

function formatScore(value: number | null | undefined) {
	if (value == null || Number.isNaN(value)) return null;
	return Number.parseFloat(value.toFixed(2));
}

type RingkasanNilai = {
	rataRata: number | null;
	predikat: string | null;
	mapelDinilai: number;
	totalMapel: number;
};

type NilaiDetail = {
	no: number;
	mataPelajaranId: number;
	mataPelajaran: string;
	indikator?: string | null;
	nilaiAkhir: string | number | null;
	sudahDinilai: boolean;
	isMatev?: boolean;
	predikat?: string | null;
};

type DetailStatus = 'empty' | 'not-found' | 'ready';

const defaultRingkasan: RingkasanNilai = {
	rataRata: null,
	predikat: null,
	mapelDinilai: 0,
	totalMapel: 0
};

export async function load({ parent, url, locals, depends }) {
	depends('app:rekap-keasramaan-detail');
	const meta: PageMeta = { title: 'Rekap Keasramaan Murid' };
	const { kelasAktif, user } = await parent();
	const sekolahId = locals.sekolah?.id ?? null;

	if (!sekolahId) {
		throw error(401, 'Sekolah aktif tidak ditemukan');
	}

	if (!kelasAktif?.id) {
		throw error(400, 'Pilih kelas aktif terlebih dahulu');
	}

	const muridIdParam = url.searchParams.get('murid_id');
	if (!muridIdParam) {
		return {
			meta,
			status: 'empty' satisfies DetailStatus,
			murid: null,
			daftarNilai: [] as NilaiDetail[],
			ringkasan: defaultRingkasan
		};
	}

	const muridId = Number(muridIdParam);
	if (!Number.isInteger(muridId) || muridId <= 0) {
		return {
			meta,
			status: 'not-found' satisfies DetailStatus,
			murid: null,
			daftarNilai: [] as NilaiDetail[],
			ringkasan: defaultRingkasan
		};
	}

	const murid = await db.query.tableMurid.findFirst({
		columns: { id: true, nama: true, waliAsuhNama: true },
		where: and(
			eq(tableMurid.id, muridId),
			eq(tableMurid.sekolahId, sekolahId),
			eq(tableMurid.kelasId, kelasAktif.id)
		)
	});

	let waliAsramaInfo: { nama?: string | null; nip?: string | null } | null = null;
	let waliAsuhInfo: { nama?: string | null; nip?: string | null } | null = null;
	try {
		const kelasData = await db.query.tableKelas.findFirst({
			columns: { id: true },
			where: and(eq(tableKelas.id, kelasAktif.id), eq(tableKelas.sekolahId, sekolahId)),
			with: { waliAsrama: true, waliAsuh: true }
		});
		waliAsramaInfo = kelasData?.waliAsrama
			? { nama: kelasData.waliAsrama.nama, nip: kelasData.waliAsrama.nip }
			: null;
		waliAsuhInfo = kelasData?.waliAsuh
			? { nama: kelasData.waliAsuh.nama, nip: kelasData.waliAsuh.nip }
			: null;
		if (!waliAsuhInfo && murid?.waliAsuhNama) {
			const wa = await db.query.tablePegawai.findFirst({
				columns: { nama: true, nip: true },
				where: eq(tablePegawai.nama, murid.waliAsuhNama)
			});
			if (wa) waliAsuhInfo = { nama: wa.nama, nip: wa.nip };
			else waliAsuhInfo = { nama: murid.waliAsuhNama, nip: null };
		}
	} catch {
		// ignore
	}
	try {
		if (!waliAsuhInfo && murid?.waliAsuhNama) {
			const wa = await db.query.tablePegawai.findFirst({
				columns: { nama: true, nip: true },
				where: eq(tablePegawai.nama, murid.waliAsuhNama)
			});
			if (wa) waliAsuhInfo = { nama: wa.nama, nip: wa.nip };
			else waliAsuhInfo = { nama: murid.waliAsuhNama, nip: null };
		}
	} catch {
		// ignore
	}

	if (!murid) {
		return {
			meta,
			status: 'not-found' satisfies DetailStatus,
			murid: null,
			daftarNilai: [] as NilaiDetail[],
			ringkasan: defaultRingkasan
		};
	}

	// Wali_asuh hanya boleh melihat murid asuhannya
	const userWithType = user as { type?: string; pegawaiId?: number } | null;
	if (userWithType?.type === 'wali_asuh' && userWithType.pegawaiId) {
		const peg = await db.query.tablePegawai.findFirst({
			columns: { nama: true },
			where: eq(tablePegawai.id, userWithType.pegawaiId)
		});
		const pegNama = peg?.nama?.trim().toLowerCase();
		if (!pegNama || (murid.waliAsuhNama?.trim().toLowerCase() ?? '') !== pegNama) {
			return {
				meta,
				status: 'not-found' satisfies DetailStatus,
				murid: null,
				daftarNilai: [] as NilaiDetail[],
				ringkasan: defaultRingkasan
			};
		}
	}

	const keasramaanRecords = await db.query.tableKeasramaan.findMany({
		where: eq(tableKeasramaan.kelasId, kelasAktif.id),
		orderBy: [asc(tableKeasramaan.createdAt), asc(tableKeasramaan.id)],
		with: {
			indikator: {
				orderBy: [asc(tableKeasramaanIndikator.createdAt), asc(tableKeasramaanIndikator.id)],
				with: {
					tujuan: {
						orderBy: [asc(tableKeasramaanTujuan.createdAt), asc(tableKeasramaanTujuan.id)]
					}
				}
			}
		}
	});

	const tujuanList: Array<{ id: number; keasramaanNama: string; indikatorNama?: string | null }> =
		[];
	for (const k of keasramaanRecords) {
		for (const ind of k.indikator) {
			for (const t of ind.tujuan) {
				tujuanList.push({ id: t.id, keasramaanNama: k.nama, indikatorNama: ind.deskripsi });
			}
		}
	}

	const asesmenRecords = tujuanList.length
		? await db.query.tableAsesmenKeasramaan.findMany({
				columns: { tujuanId: true, kategori: true },
				where: and(eq(tableAsesmenKeasramaan.muridId, murid.id))
			})
		: [];

	const rubrikByTujuan = new Map<number, number>();
	for (const a of asesmenRecords) {
		rubrikByTujuan.set(a.tujuanId, kategoriToRubrikValue(a.kategori));
	}

	const daftarNilai: NilaiDetail[] = [];
	const groups = new Map<string, Array<{ id: number; indikatorNama?: string | null }>>();
	for (const t of tujuanList) {
		if (!groups.has(t.keasramaanNama)) groups.set(t.keasramaanNama, []);
		groups.get(t.keasramaanNama)!.push({ id: t.id, indikatorNama: t.indikatorNama ?? null });
	}
	let no = 0;
	for (const [matevNama, items] of groups) {
		for (let i = 0; i < items.length; i += 1) {
			const item = items[i];
			no += 1;
			const rubrik = rubrikByTujuan.get(item.id) ?? null;
			daftarNilai.push({
				no,
				mataPelajaranId: item.id,
				mataPelajaran: i === 0 ? matevNama : '',
				indikator: item.indikatorNama ?? null,
				nilaiAkhir: rubrik == null ? null : String(rubrik),
				sudahDinilai: rubrik != null,
				isMatev: false,
				predikat: rubrik == null ? null : nilaiAngkaToHuruf(rubrik)
			});
		}
	}

	const totalMapel = daftarNilai.length;
	const mapelDinilai = daftarNilai.filter((item) => item.sudahDinilai).length;
	const nilaiArray = daftarNilai
		.filter((item) => item.sudahDinilai && item.nilaiAkhir != null)
		.map((item) => Number(item.nilaiAkhir));
	const totalNilai = nilaiArray.reduce((sum, item) => sum + item, 0);
	const rataRata = nilaiArray.length ? formatScore(totalNilai / nilaiArray.length) : null;

	const ringkasan: RingkasanNilai = {
		rataRata,
		predikat: rataRata == null ? null : nilaiAngkaToHuruf(rataRata),
		mapelDinilai,
		totalMapel
	};

	return {
		meta,
		status: 'ready' satisfies DetailStatus,
		murid,
		daftarNilai,
		ringkasan,
		waliAsrama: waliAsramaInfo,
		waliAsuh: waliAsuhInfo,
		kepalaSekolah: locals.sekolah?.kepalaSekolah ?? null
	};
}
