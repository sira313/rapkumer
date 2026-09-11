import db from '$lib/server/db';
import { tableMataPelajaran, tableTujuanPembelajaran } from '$lib/server/db/schema';
import { asc, eq, inArray } from 'drizzle-orm';
import { getAksesMapelUser } from '$lib/server/mapel-access';

export async function load({ locals, parent }) {
	const parentData = await parent();
	const kelasAktif = parentData.kelasAktif as {
		id: number;
		nama: string;
		fase: string | null;
	} | null;
	const user = locals.user as {
		id?: number;
		type?: string;
		mataPelajaranId?: number | null;
	} | null;
	const sekolahId = locals.sekolah?.id;

	if (!sekolahId || !kelasAktif) {
		return {
			meta: { title: 'RPM' },
			kelasAktif: null,
			mapelList: [],
			lingkupMateriList: [],
			tujuanPembelajaranList: [],
			userType: user?.type ?? ''
		};
	}

	let mapelRows = await db.query.tableMataPelajaran.findMany({
		columns: { id: true, nama: true, namaLokal: true, jenis: true },
		where: eq(tableMataPelajaran.kelasId, kelasAktif.id),
		orderBy: [asc(tableMataPelajaran.nama)]
	});

	if (user?.type === 'user' && user.id) {
		const akses = await getAksesMapelUser(
			{ id: user.id, mataPelajaranId: user.mataPelajaranId },
			kelasAktif.id
		);
		mapelRows = mapelRows.filter(
			(mp) =>
				akses.ids.has(mp.id) ||
				akses.names.has((mp.nama ?? '').trim().toLowerCase()) ||
				akses.names.has((mp.namaLokal ?? '').trim().toLowerCase())
		);
	}

	const mapelIds = mapelRows.map((m) => m.id);
	const tujuanPembelajaranList = mapelIds.length
		? await db.query.tableTujuanPembelajaran.findMany({
				columns: { id: true, deskripsi: true, lingkupMateri: true, mataPelajaranId: true },
				where: inArray(tableTujuanPembelajaran.mataPelajaranId, mapelIds),
				orderBy: [asc(tableTujuanPembelajaran.lingkupMateri)]
			})
		: [];

	const lingkupMateriSet = new Set(
		tujuanPembelajaranList.map((tp) => tp.lingkupMateri).filter(Boolean)
	);
	const lingkupMateriList = Array.from(lingkupMateriSet).sort();

	return {
		meta: { title: 'RPM' },
		kelasAktif,
		mapelList: mapelRows.map((m) => ({
			id: m.id,
			nama: m.namaLokal || m.nama,
			jenis: m.jenis
		})),
		lingkupMateriList,
		tujuanPembelajaranList,
		userType: user?.type ?? ''
	};
}
