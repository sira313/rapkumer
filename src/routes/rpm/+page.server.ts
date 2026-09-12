import db from '$lib/server/db';
import { tableMataPelajaran, tableTujuanPembelajaran } from '$lib/server/db/schema';
import { asc, eq, inArray } from 'drizzle-orm';
import { getAksesMapelUser, needsMapelFilter } from '$lib/server/mapel-access';
import { buildGuruMapelPicker, buildMapelPicker } from '$lib/server/mapel-picker';
import { agamaVariantOptions } from '$lib/statics';

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
			pickerMapelId: 0,
			agamaOptions: [] as Array<{ key: string; label: string; nama: string; mapelId: number }>,
			lingkupMateriList: [],
			tujuanPembelajaranList: [],
			userType: user?.type ?? ''
		};
	}

	const mapelRows = await db.query.tableMataPelajaran.findMany({
		columns: { id: true, nama: true, namaLokal: true },
		where: eq(tableMataPelajaran.kelasId, kelasAktif.id),
		orderBy: [asc(tableMataPelajaran.nama)]
	});

	// Pilih mapel seperti halaman asesmen: varian agama/PKS digabung jadi satu
	// entri berlabel dasar; guru agama melihat varian miliknya. `pickerMapelId`
	// = pilihan awal select.
	let picker: { mapelList: Array<{ id: number; nama: string }>; pickerMapelId: number };
	const needFilter = needsMapelFilter(
		{
			type: user?.type,
			id: user?.id,
			kelasId: kelasAktif.id
		},
		kelasAktif.id
	);
	if (needFilter && user?.id) {
		const akses = await getAksesMapelUser(
			{ id: user.id, mataPelajaranId: user.mataPelajaranId },
			kelasAktif.id
		);
		picker = buildGuruMapelPicker(mapelRows, akses.ids, akses.names, 0);
	} else {
		picker = buildMapelPicker(mapelRows, 0);
	}
	const allMapelIds = mapelRows.map((m) => m.id);
	const tujuanPembelajaranList = allMapelIds.length
		? await db.query.tableTujuanPembelajaran.findMany({
				columns: { id: true, deskripsi: true, lingkupMateri: true, mataPelajaranId: true },
				where: inArray(tableTujuanPembelajaran.mataPelajaranId, allMapelIds),
				orderBy: [asc(tableTujuanPembelajaran.lingkupMateri)]
			})
		: [];

	const lingkupMateriSet = new Set(
		tujuanPembelajaranList.map((tp) => tp.lingkupMateri).filter(Boolean)
	);
	const lingkupMateriList = Array.from(lingkupMateriSet).sort();

	// Varian PABP yang tersedia di kelas (untuk pemilih "agama" saat memilih PABP).
	const agamaOptions = agamaVariantOptions
		.map((opt) => {
			const row = mapelRows.find(
				(m) => (m.nama ?? '').trim().toLowerCase() === opt.name.toLowerCase()
			);
			return row ? { key: opt.key, label: opt.label, nama: opt.name, mapelId: row.id } : null;
		})
		.filter(Boolean);

	return {
		meta: { title: 'RPM' },
		kelasAktif,
		mapelList: picker.mapelList,
		pickerMapelId: picker.pickerMapelId,
		agamaOptions,
		lingkupMateriList,
		tujuanPembelajaranList,
		userType: user?.type ?? ''
	};
}
