import db from '$lib/server/db';
import { computeNilaiAkhirRekap } from '$lib/server/nilai-akhir';
import { buildKelasContext, fetchMuridList } from '$lib/server/route-utils';
import { tablePegawai } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export async function load({ locals, url, depends, parent }) {
	depends('app:cetak');

	const parentData = await parent();
	const { sekolahId, kelasId, kelasIds, academicContext } = await buildKelasContext(
		locals,
		parentData,
		url
	);

	if (!sekolahId || !kelasIds.length) {
		return { academicContext, kelasId, daftarMurid: [], muridCount: 0 };
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
			daftarMurid = daftarMurid.filter((m) => (m.waliAsuhNama?.trim().toLowerCase() ?? '') === pegNama);
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

	return {
		academicContext,
		kelasId,
		daftarMurid,
		muridCount: daftarMurid.length,
		piagamRankingOptions
	};
}
