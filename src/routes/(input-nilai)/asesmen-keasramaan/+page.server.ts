import db from '$lib/server/db';
import { tableAsesmenKeasramaan, tableKeasramaan, tableMurid, tablePegawai } from '$lib/server/db/schema';
import {
	ekstrakurikulerNilaiLabelByValue,
	buildKeasramaanDeskripsi,
	type EkstrakurikulerNilaiKategori,
	isEkstrakurikulerNilaiKategori
} from '$lib/ekstrakurikuler';
import {
	kategoriToRubrikValue,
	hitungNilaiIndikator,
	getIndikatorCategory
} from '$lib/components/asesmen-keasramaan/utils';
import { redirect, error } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';

const PER_PAGE = 20;

type NilaiRecord = {
	muridId: number;
	tujuanId: number;
	kategori: string;
	dinilaiPada: string | null;
	updatedAt: string | null;
};

function mapNilaiRecords(records: NilaiRecord[]) {
	const nilaiByMurid = new Map<
		number,
		Map<number, { kategori: EkstrakurikulerNilaiKategori; timestamp: string | null }>
	>();

	for (const record of records) {
		if (!isEkstrakurikulerNilaiKategori(record.kategori)) continue;
		let muridMap = nilaiByMurid.get(record.muridId);
		if (!muridMap) {
			muridMap = new Map<
				number,
				{ kategori: EkstrakurikulerNilaiKategori; timestamp: string | null }
			>();
			nilaiByMurid.set(record.muridId, muridMap);
		}
		const timestamp = record.dinilaiPada ?? record.updatedAt ?? null;
		muridMap.set(record.tujuanId, {
			kategori: record.kategori,
			timestamp
		});
	}

	return nilaiByMurid;
}

export async function load({ parent, url, depends }) {
	depends('app:asesmen-keasramaan');
	const { kelasAktif, user } = await parent();
	const meta: PageMeta = { title: 'Asesmen Keasramaan' };

	if (!kelasAktif?.id) {
		return emptyPayload(meta);
	}

	const keasramaanRecords = await db.query.tableKeasramaan.findMany({
		columns: { id: true, nama: true },
		with: {
			indikator: {
				columns: { id: true, deskripsi: true },
				with: {
					tujuan: {
						columns: { id: true }
					}
				}
			}
		},
		where: eq(tableKeasramaan.kelasId, kelasAktif.id),
		orderBy: asc(tableKeasramaan.createdAt)
	});

	const keasramaanList = keasramaanRecords.map((record) => ({
		id: record.id,
		nama: record.nama,
		tujuanCount: record.indikator.reduce((sum, ind) => sum + ind.tujuan.length, 0)
	}));

	const requestedIdRaw = url.searchParams.get('keasramaan_id');
	let requestedId = requestedIdRaw ? Number(requestedIdRaw) : null;
	if (requestedId != null && (!Number.isInteger(requestedId) || requestedId <= 0)) {
		requestedId = null;
	}

	const availableIds = new Set(keasramaanList.map((item) => item.id));
	let selectedKeasramaanId = requestedId && availableIds.has(requestedId) ? requestedId : null;
	if (!selectedKeasramaanId && keasramaanList.length === 1) {
		selectedKeasramaanId = keasramaanList[0].id;
	}

	const userWithType = user as { type?: string; pegawaiId?: number } | null;
	let waliAsuhNama: string | null = null;
	if (userWithType?.type === 'wali_asuh' && userWithType.pegawaiId) {
		const peg = await db.query.tablePegawai.findFirst({
			columns: { nama: true },
			where: eq(tablePegawai.id, userWithType.pegawaiId)
		});
		waliAsuhNama = peg?.nama?.trim().toLowerCase() ?? null;
	}

	const muridRecords = await db.query.tableMurid.findMany({
		columns: { id: true, nama: true, waliAsuhNama: true },
		where: eq(tableMurid.kelasId, kelasAktif.id),
		orderBy: asc(tableMurid.nama)
	});

	function isAsuhanku(murid: { waliAsuhNama: string | null }): boolean {
		if (waliAsuhNama === null) return true;
		return (murid.waliAsuhNama?.trim().toLowerCase() ?? '') === waliAsuhNama;
	}

	const rawSearch = url.searchParams.get('q')?.trim() ?? '';
	const searchTerm = rawSearch || null;
	const searchLower = searchTerm ? searchTerm.toLowerCase() : null;
	const filteredMurid = searchLower
		? muridRecords.filter((murid) => murid.nama.toLowerCase().includes(searchLower))
		: muridRecords;

	const totalMurid = filteredMurid.length;
	const requestedPage = Number(url.searchParams.get('page')) || 1;
	const totalPages = Math.max(1, Math.ceil(totalMurid / PER_PAGE));
	const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);

	if (requestedPage !== currentPage) {
		const params = new URLSearchParams(url.searchParams);
		if (currentPage <= 1) {
			params.delete('page');
		} else {
			params.set('page', String(currentPage));
		}
		throw redirect(303, `${url.pathname}${params.size ? `?${params}` : ''}`);
	}

	const offset = (currentPage - 1) * PER_PAGE;
	const paginatedMurid = filteredMurid.slice(offset, offset + PER_PAGE);

	if (!selectedKeasramaanId) {
		return {
			meta,
			keasramaanList,
			selectedKeasramaanId: null,
			selectedKeasramaan: null,
			daftarMurid: paginatedMurid.map((murid, index) => ({
				id: murid.id,
				nama: murid.nama,
				no: offset + index + 1,
				deskripsi: null,
				hasNilai: false,
				nilai: [],
				lastUpdated: null,
				isAsuhanku: isAsuhanku(murid)
			})),
			search: searchTerm,
			totalMurid,
			muridCount: muridRecords.length,
			page: {
				currentPage,
				totalPages,
				totalItems: totalMurid,
				perPage: PER_PAGE,
				search: searchTerm
			}
		};
	}

	const selectedKeasramaan = keasramaanRecords.find((item) => item.id === selectedKeasramaanId);

	if (!selectedKeasramaan) {
		throw error(404, 'Matev keasramaan tidak ditemukan');
	}

	// Get all indikators for this keasramaan, then get their tujuan
	const tujuanRecords = await db.query.tableKeasramaanTujuan.findMany({
		columns: { id: true, deskripsi: true },
		with: {
			indikator: {
				columns: { id: true, keasramaanId: true, deskripsi: true }
			}
		}
	});

	// Filter to only tujuan that belong to the selected keasramaan
	const tujuan = tujuanRecords
		.filter((t) => t.indikator.keasramaanId === selectedKeasramaanId)
		.map((t) => ({
			id: t.id,
			deskripsi: t.deskripsi
		}));

	// Get indikators with their deskripsi for displaying in deskripsi section
	const indikators = selectedKeasramaan.indikator.map((ind) => ({
		id: ind.id,
		nama: ind.deskripsi
	}));

	const nilaiRecords = await db.query.tableAsesmenKeasramaan.findMany({
		columns: {
			muridId: true,
			tujuanId: true,
			kategori: true,
			dinilaiPada: true,
			updatedAt: true
		},
		where: eq(tableAsesmenKeasramaan.keasramaanId, selectedKeasramaan.id),
		with: {
			tujuan: {
				columns: {},
				with: {
					indikator: {
						columns: { id: true }
					}
				}
			}
		}
	});

	const nilaiByMurid = mapNilaiRecords(nilaiRecords);

	const daftarMurid = paginatedMurid.map((murid, index) => {
		const nilaiMap = nilaiByMurid.get(murid.id);
		const nilai = tujuan.map((tujuanItem) => {
			const record = nilaiMap?.get(tujuanItem.id) ?? null;
			const kategori = record?.kategori ?? null;
			const kategoriLabel = kategori ? ekstrakurikulerNilaiLabelByValue[kategori] : null;
			return {
				tujuanId: tujuanItem.id,
				tujuan: tujuanItem.deskripsi,
				kategori: kategori,
				kategoriLabel,
				timestamp: record?.timestamp ?? null
			};
		});

		// Hitung nilai per indikator
		const nilaiPerIndikator = indikators.map((ind) => {
			// Get all tujuan yang belongs to this indikator
			const tujuanForThisIndicator = tujuanRecords
				.filter(
					(t) => t.indikator.id === ind.id && t.indikator.keasramaanId === selectedKeasramaanId
				)
				.map((t) => t.id);

			// Get nilai for each tujuan
			const nilaiArray = tujuanForThisIndicator.map((tpId) => {
				const nilaiItem = nilai.find((n) => n.tujuanId === tpId);
				if (!nilaiItem?.kategori) return null;
				return kategoriToRubrikValue(nilaiItem.kategori);
			});

			const nilaiIndikator = hitungNilaiIndikator(nilaiArray);
			const category = getIndikatorCategory(nilaiIndikator);

			return {
				indikatorNama: ind.nama,
				nilaiIndikator,
				category: category
					? {
							huruf: category.huruf,
							label: category.label
						}
					: null
			};
		});

		const deskripsi = buildKeasramaanDeskripsi(nilaiPerIndikator, murid.nama);

		let lastUpdated: string | null = null;
		for (const item of nilai) {
			if (!item.timestamp) continue;
			if (!lastUpdated || item.timestamp > lastUpdated) {
				lastUpdated = item.timestamp;
			}
		}

		return {
			id: murid.id,
			nama: murid.nama,
			no: offset + index + 1,
			nilai,
			deskripsi,
			hasNilai: Boolean(deskripsi),
			lastUpdated,
			isAsuhanku: isAsuhanku(murid)
		};
	});

	return {
		meta,
		keasramaanList,
		selectedKeasramaanId: selectedKeasramaan.id,
		selectedKeasramaan: {
			id: selectedKeasramaan.id,
			nama: selectedKeasramaan.nama,
			tujuan
		},
		daftarMurid,
		search: searchTerm,
		totalMurid,
		muridCount: muridRecords.length,
		page: {
			currentPage,
			totalPages,
			totalItems: totalMurid,
			perPage: PER_PAGE,
			search: searchTerm
		}
	};
}

function emptyPayload(meta: PageMeta) {
	return {
		meta,
		keasramaanList: [],
		selectedKeasramaanId: null,
		selectedKeasramaan: null,
		daftarMurid: [] as Array<{
			id: number;
			nama: string;
			no: number;
			nilai: unknown[];
			deskripsi: string | null;
			hasNilai: boolean;
			lastUpdated: string | null;
			isAsuhanku: boolean;
		}>,
		search: null as string | null,
		totalMurid: 0,
		muridCount: 0,
		page: {
			currentPage: 1,
			totalPages: 1,
			totalItems: 0,
			perPage: PER_PAGE,
			search: null as string | null
		}
	};
}
