import db from '$lib/server/db';
import { ensureAsesmenSumatifSchema } from '$lib/server/db/ensure-asesmen-sumatif';
import {
	tableAsesmenSumatif,
	tableMataPelajaran,
	tableMurid,
	tableAuthUserMataPelajaran
} from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';

function formatScore(value: number | null | undefined) {
	if (value == null || Number.isNaN(value)) return null;
	return Number.parseFloat(value.toFixed(2));
}

const AGAMA_BASE_SUBJECT = 'Pendidikan Agama dan Budi Pekerti';

const AGAMA_VARIANT_MAP: Record<string, string> = {
	islam: 'Pendidikan Agama Islam dan Budi Pekerti',
	kristen: 'Pendidikan Agama Kristen dan Budi Pekerti',
	protestan: 'Pendidikan Agama Kristen dan Budi Pekerti',
	katolik: 'Pendidikan Agama Katolik dan Budi Pekerti',
	katholik: 'Pendidikan Agama Katolik dan Budi Pekerti',
	hindu: 'Pendidikan Agama Hindu dan Budi Pekerti',
	budha: 'Pendidikan Agama Buddha dan Budi Pekerti',
	buddha: 'Pendidikan Agama Buddha dan Budi Pekerti',
	buddhist: 'Pendidikan Agama Buddha dan Budi Pekerti',
	khonghucu: 'Pendidikan Agama Khonghucu dan Budi Pekerti',
	'khong hu cu': 'Pendidikan Agama Khonghucu dan Budi Pekerti',
	konghucu: 'Pendidikan Agama Khonghucu dan Budi Pekerti'
};

function normalizeText(value: string | null | undefined) {
	return value?.trim().toLowerCase() ?? '';
}

function isAgamaSubject(name: string) {
	return normalizeText(name).startsWith('pendidikan agama');
}

function resolveAgamaVariantName(agama: string | null | undefined) {
	const normalized = normalizeText(agama);
	return AGAMA_VARIANT_MAP[normalized] ?? null;
}

type MapelRecord = {
	id: number;
	nama: string;
};

function pickAgamaMapel(records: MapelRecord[], muridAgama: string | null | undefined) {
	const mapelByName = new Map(records.map((record) => [normalizeText(record.nama), record]));
	let baseMapel: MapelRecord | null = null;
	const variantMapel: MapelRecord[] = [];
	const regularMapel: MapelRecord[] = [];

	for (const record of records) {
		if (isAgamaSubject(record.nama)) {
			if (normalizeText(record.nama) === normalizeText(AGAMA_BASE_SUBJECT)) {
				baseMapel = record;
			} else {
				variantMapel.push(record);
			}
		} else {
			regularMapel.push(record);
		}
	}

	let chosenAgamaMapel: MapelRecord | null = null;
	const variantName = resolveAgamaVariantName(muridAgama);
	if (variantName) {
		chosenAgamaMapel = mapelByName.get(normalizeText(variantName)) ?? null;
	}
	if (!chosenAgamaMapel) {
		chosenAgamaMapel = baseMapel ?? variantMapel.at(0) ?? null;
	}

	const result = [...regularMapel];
	if (chosenAgamaMapel) {
		result.push(chosenAgamaMapel);
	}

	result.sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
	return result;
}

type RingkasanNilai = {
	rataRata: number | null;
	mapelDinilai: number;
	totalMapel: number;
};

type NilaiDetail = {
	no: number;
	mataPelajaranId: number;
	mataPelajaran: string;
	nilaiAkhir: number;
	sudahDinilai: boolean;
};

type DetailStatus = 'empty' | 'not-found' | 'ready';

const defaultRingkasan: RingkasanNilai = {
	rataRata: null,
	mapelDinilai: 0,
	totalMapel: 0
};

export async function load({ parent, url, locals, depends }) {
	depends('app:nilai-akhir-detail');
	const meta: PageMeta = { title: 'Rekapitulasi Nilai Akhir Murid' };
	const { kelasAktif } = await parent();
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
		columns: { id: true, nama: true, agama: true },
		where: and(
			eq(tableMurid.id, muridId),
			eq(tableMurid.sekolahId, sekolahId),
			eq(tableMurid.kelasId, kelasAktif.id)
		)
	});

	if (!murid) {
		return {
			meta,
			status: 'not-found' satisfies DetailStatus,
			murid: null,
			daftarNilai: [] as NilaiDetail[],
			ringkasan: defaultRingkasan
		};
	}

	const rawMapelRecords = await db.query.tableMataPelajaran.findMany({
		columns: { id: true, nama: true },
		where: eq(tableMataPelajaran.kelasId, kelasAktif.id),
		orderBy: asc(tableMataPelajaran.nama)
	});

	// Guru mapel can see all subjects on this page (read-only view)

	const mapelRecords = pickAgamaMapel(rawMapelRecords, murid.agama);

	const mapelIds = mapelRecords.map((mapel) => mapel.id);

	await ensureAsesmenSumatifSchema();

	const sumatifRecords = mapelIds.length
		? await db.query.tableAsesmenSumatif.findMany({
				columns: {
					mataPelajaranId: true,
					nilaiAkhir: true
				},
				where: and(
					eq(tableAsesmenSumatif.muridId, murid.id),
					inArray(tableAsesmenSumatif.mataPelajaranId, mapelIds)
				)
			})
		: [];

	const nilaiByMapel = new Map<number, { nilaiAkhir: number | null }>();
	for (const record of sumatifRecords) {
		nilaiByMapel.set(record.mataPelajaranId, { nilaiAkhir: record.nilaiAkhir });
	}

	const daftarNilai: NilaiDetail[] = mapelRecords.map((mapel, index) => {
		const nilai = nilaiByMapel.get(mapel.id)?.nilaiAkhir ?? null;
		const sudahDinilai = nilai != null;
		const skor = sudahDinilai ? nilai : 0;
		return {
			no: index + 1,
			mataPelajaranId: mapel.id,
			mataPelajaran: mapel.nama,
			nilaiAkhir: formatScore(skor) ?? 0,
			sudahDinilai
		};
	});

	const totalMapel = daftarNilai.length;
	const mapelDinilai = daftarNilai.filter((item) => item.sudahDinilai).length;
	const totalNilai = daftarNilai.reduce((sum, item) => sum + item.nilaiAkhir, 0);
	const rataRata = totalMapel ? formatScore(totalNilai / totalMapel) : null;

	const ringkasan: RingkasanNilai = {
		rataRata,
		mapelDinilai,
		totalMapel
	};

	return { meta, status: 'ready' satisfies DetailStatus, murid, daftarNilai, ringkasan };
}
