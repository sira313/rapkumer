import db from '$lib/server/db';
import { computeNilaiAkhirRekap } from '$lib/server/nilai-akhir';
import { buildKelasContext, fetchMuridList } from '$lib/server/route-utils';
import { tablePegawai, tableSemester, tableTahunAjaran } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

export async function load({ locals, url, depends, parent }) {
	depends('app:cetak');

	const parentData = await parent();
	const { sekolahId, kelasId, kelasIds, academicContext } = await buildKelasContext(
		locals,
		parentData,
		url
	);

	if (!sekolahId || !kelasIds.length) {
		return {
			academicContext,
			kelasId,
			daftarMurid: [],
			muridCount: 0,
			tanggalMasuk: '',
			tanggalBagiRaport: ''
		};
	}

	let daftarMurid = await fetchMuridList(sekolahId, kelasId, kelasIds);

	const userWithType = locals.user as { type?: string; pegawaiId?: number } | null;
	if (userWithType?.type === 'wali_asuh' && userWithType.pegawaiId) {
		const peg = await db.query.tablePegawai.findFirst({
			columns: { nama: true },
			where: eq(tablePegawai.id, userWithType.pegawaiId)
		});
		const pegNama = peg?.nama?.trim().toLowerCase();
		if (pegNama) {
			daftarMurid = daftarMurid.filter(
				(m) => (m.waliAsuhNama?.trim().toLowerCase() ?? '') === pegNama
			);
		} else {
			daftarMurid = [];
		}
	}

	let piagamRankingOptions: Array<{
		muridId: number;
		peringkat: number;
		nama: string;
		nilaiRataRata: number | null;
	}> = [];

	if (kelasId) {
		const rekap = await computeNilaiAkhirRekap({ sekolahId, kelasId: Number(kelasId) });
		piagamRankingOptions = rekap.rows
			.filter((row) => Number.isFinite(row.peringkat) && row.peringkat >= 1)
			.sort((a, b) => a.peringkat - b.peringkat)
			.slice(0, 4)
			.map((row) => ({
				muridId: row.id,
				peringkat: row.peringkat,
				nama: row.nama,
				nilaiRataRata: row.nilaiRataRata
			}));
	}

	// Default date range for jurnal mengajar
	let tanggalMasuk = '';
	let tanggalBagiRaport = '';
	if (sekolahId) {
		const activeSemester = await db
			.select({
				tanggalMasuk: tableSemester.tanggalMasuk,
				tanggalBagiRaport: tableSemester.tanggalBagiRaport
			})
			.from(tableSemester)
			.innerJoin(tableTahunAjaran, eq(tableSemester.tahunAjaranId, tableTahunAjaran.id))
			.where(and(eq(tableTahunAjaran.sekolahId, sekolahId), eq(tableSemester.isAktif, true)))
			.limit(1)
			.then((r) => r[0]);
		if (activeSemester) {
			tanggalMasuk = activeSemester.tanggalMasuk ?? '';
			tanggalBagiRaport = activeSemester.tanggalBagiRaport ?? '';
		}
	}

	return {
		academicContext,
		kelasId,
		daftarMurid,
		muridCount: daftarMurid.length,
		piagamRankingOptions,
		tanggalMasuk,
		tanggalBagiRaport
	};
}
