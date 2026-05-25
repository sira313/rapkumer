import db from '$lib/server/db';
import { ensureAsesmenSumatifSchema } from '$lib/server/db/ensure-asesmen-sumatif';
import {
	tableAsesmenSumatif,
	tableMataPelajaran,
	tableMurid,
	tableEkstrakurikuler,
	tableKokurikuler,
	tableAsesmenKokurikuler,
	tableAsesmenEkstrakurikuler
} from '$lib/server/db/schema';
import { sanitizeDimensionList } from '$lib/kokurikuler';
import { redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const PER_PAGE = 20;

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

type NilaiAkhirRow = {
	id: number;
	nama: string;
	nilaiRataRata: number | null;
	jumlahMapelDinilai: number;
	totalMapelRelevan: number;
	// kokurikuler fields
	nilaiRataRataKokurikuler: number | null;
	jumlahKokurikulerDinilai: number;
	totalKokurikulerRelevan: number;
	kokDetailHref: string;
	// ekstrakurikuler fields
	nilaiRataRataEkstrakurikuler?: number | null;
	jumlahEkstrakurikulerDinilai?: number;
	totalEkstrakurikulerRelevan?: number;
	eksDetailHref?: string;
	kriteriaEkstrakurikuler?: string | null;
	// kriteria label for kokurikuler (Sangat Baik / Baik / Cukup / Perlu bimbingan)
	kriteriaKokurikuler: string | null;
	detailHref: string;
	peringkat: number;
};

type PageState = {
	search: string | null;
	currentPage: number;
	totalPages: number;
	totalItems: number;
	perPage: number;
};

type Summary = {
	totalMurid: number;
	totalMuridDinilai: number;
	totalMapel: number;
	totalEkstrakurikuler?: number;
	totalKokurikuler?: number;
};

export const load: PageServerLoad = async ({ parent, locals, url, depends }) => {
	depends('app:nilai-akhir');

	const meta: PageMeta = { title: 'Rekap Nilai' };
	const { kelasAktif } = await parent();
	const sekolahId = locals.sekolah?.id ?? null;

	const searchParam = url.searchParams.get('q');
	const searchTrimmed = searchParam ? searchParam.trim() : '';
	const search = searchTrimmed.length ? searchTrimmed : null;
	const requestedPage = Number(url.searchParams.get('page')) || 1;
	const pageNumber =
		Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;

	const defaultState: PageState = {
		search,
		currentPage: 1,
		totalPages: 1,
		totalItems: 0,
		perPage: PER_PAGE
	};

	if (!sekolahId || !kelasAktif?.id) {
		return {
			meta,
			daftarNilai: [] as NilaiAkhirRow[],
			page: defaultState,
			summary: {
				totalMurid: 0,
				totalMuridDinilai: 0,
				totalMapel: 0
			} satisfies Summary
		};
	}

	const muridRecords = await db.query.tableMurid.findMany({
		columns: { id: true, nama: true, agama: true },
		where: and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, kelasAktif.id)),
		orderBy: asc(tableMurid.nama)
	});

	const muridIds = muridRecords.map((murid) => murid.id);

	const rawMapelRecords = await db.query.tableMataPelajaran.findMany({
		columns: { id: true, nama: true },
		where: eq(tableMataPelajaran.kelasId, kelasAktif.id)
	});
	const mapelIds = rawMapelRecords.map((mapel) => mapel.id);

	await ensureAsesmenSumatifSchema();

	const sumatifRecords =
		muridIds.length && mapelIds.length
			? await db.query.tableAsesmenSumatif.findMany({
					columns: {
						muridId: true,
						mataPelajaranId: true,
						nilaiAkhir: true
					},
					where: and(
						inArray(tableAsesmenSumatif.muridId, muridIds),
						inArray(tableAsesmenSumatif.mataPelajaranId, mapelIds)
					)
				})
			: [];

	const sumatifByMurid = new Map<number, Map<number, number | null>>();
	for (const record of sumatifRecords) {
		let map = sumatifByMurid.get(record.muridId);
		if (!map) {
			map = new Map();
			sumatifByMurid.set(record.muridId, map);
		}
		map.set(record.mataPelajaranId, record.nilaiAkhir);
	}

	const rows = muridRecords.map((murid) => {
		const relevantMapel = pickAgamaMapel(rawMapelRecords, murid.agama);
		let total = 0;
		let countDinilai = 0;

		for (const mapel of relevantMapel) {
			const nilai = sumatifByMurid.get(murid.id)?.get(mapel.id) ?? null;
			if (nilai != null) {
				total += nilai;
				countDinilai += 1;
			} else {
				total += 0;
			}
		}

		const rataRata = relevantMapel.length ? formatScore(total / relevantMapel.length) : null;

		return {
			id: murid.id,
			nama: murid.nama,
			nilaiRataRata: rataRata,
			jumlahMapelDinilai: countDinilai,
			totalMapelRelevan: relevantMapel.length,
			detailHref: `/nilai-akhir/daftar-nilai?murid_id=${murid.id}`,
			// default kokurikuler values; will be filled below if kokurikuler exists
			nilaiRataRataKokurikuler: null,
			jumlahKokurikulerDinilai: 0,
			totalKokurikulerRelevan: 0,
			kokDetailHref: `/nilai-akhir/nilai-kokurikuler?murid_id=${murid.id}`,
			kriteriaKokurikuler: null,
			// default ekstrakurikuler values; will be filled below if ekstrakurikuler exists
			nilaiRataRataEkstrakurikuler: null,
			jumlahEkstrakurikulerDinilai: 0,
			totalEkstrakurikulerRelevan: 0,
			eksDetailHref: `/nilai-akhir/nilai-ekstra?murid_id=${murid.id}`,
			kriteriaEkstrakurikuler: null
		};
	});

	rows.sort((a, b) => {
		const aScore = a.nilaiRataRata;
		const bScore = b.nilaiRataRata;
		if (aScore == null && bScore == null) {
			return a.nama.localeCompare(b.nama, 'id');
		}
		if (aScore == null) return 1;
		if (bScore == null) return -1;
		const diff = bScore - aScore;
		if (Math.abs(diff) > 0.0001) return diff;
		return a.nama.localeCompare(b.nama, 'id');
	});

	let lastRankScore: number | null = null;
	let lastRank = 0;

	const rankedRows = rows.map((row, index) => {
		const score = row.nilaiRataRata;
		let peringkat = index + 1;
		if (score != null) {
			if (lastRankScore != null && Math.abs(lastRankScore - score) <= 0.0001) {
				peringkat = lastRank;
			} else {
				lastRankScore = score;
				lastRank = peringkat;
			}
		} else {
			lastRankScore = null;
			lastRank = peringkat;
		}
		return { ...row, peringkat } satisfies NilaiAkhirRow;
	});

	const lowerSearch = search ? search.toLowerCase() : null;
	const filteredRows = lowerSearch
		? rankedRows.filter((row) => row.nama.toLowerCase().includes(lowerSearch))
		: rankedRows;

	const totalItems = filteredRows.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / PER_PAGE));
	const currentPage = Math.min(Math.max(pageNumber, 1), totalPages);
	const offset = (currentPage - 1) * PER_PAGE;

	if (pageNumber !== currentPage) {
		const params = new URLSearchParams(url.searchParams);
		if (currentPage <= 1) {
			params.delete('page');
		} else {
			params.set('page', String(currentPage));
		}
		throw redirect(303, `${url.pathname}${params.size ? `?${params}` : ''}`);
	}

	const daftarNilai: NilaiAkhirRow[] = filteredRows.slice(offset, offset + PER_PAGE);
	const page: PageState = {
		search,
		currentPage,
		totalPages,
		totalItems,
		perPage: PER_PAGE
	};

	const uniqueMapelCount = new Set(rawMapelRecords.map((mapel) => mapel.nama)).size;

	// compute ekstrakurikuler / kokurikuler counts for the active class so the UI can show them
	let ekstrakCount = 0;
	try {
		const ekstrakRows = await db.query.tableEkstrakurikuler.findMany({
			columns: { id: true },
			where: eq(tableEkstrakurikuler.kelasId, kelasAktif.id)
		});
		ekstrakCount = ekstrakRows.length;
	} catch {
		// ignore — table might not exist in older installations
		ekstrakCount = 0;
	}

	let kokurikulerCount = 0;
	try {
		const kokuriRows = await db.query.tableKokurikuler.findMany({
			columns: { id: true },
			where: eq(tableKokurikuler.kelasId, kelasAktif.id)
		});
		kokurikulerCount = kokuriRows.length;
	} catch {
		kokurikulerCount = 0;
	}

	const summary: Summary = {
		totalMurid: rankedRows.length,
		totalMuridDinilai: rankedRows.filter((row) => row.jumlahMapelDinilai > 0).length,
		totalMapel: uniqueMapelCount,
		totalEkstrakurikuler: ekstrakCount,
		totalKokurikuler: kokurikulerCount
	};

	// If kokurikuler exist for the class, compute per-murid kokurikuler averages
	if (kokurikulerCount > 0) {
		try {
			// fetch kokurikuler rows for the class with their dimensi
			const kokRows = await db.query.tableKokurikuler.findMany({
				columns: { id: true, dimensi: true },
				where: eq(tableKokurikuler.kelasId, kelasAktif.id),
				orderBy: asc(tableKokurikuler.createdAt)
			});

			const kokIds = kokRows.map((k) => k.id);
			// guard: if no kok rows, skip
			if (kokIds.length > 0 && muridIds.length > 0) {
				// try to ensure schema exists (older installs may not have the table)
				try {
					// dynamic import of ensure function to avoid hard dependency when table missing
					const { ensureAsesmenKokurikulerSchema } =
						await import('$lib/server/db/ensure-asesmen-kokurikuler');
					await ensureAsesmenKokurikulerSchema();
				} catch {
					// ignore if ensure not available
				}

				// fetch asesmen records for all murids and kok ids
				const asesmenRecords = await db.query.tableAsesmenKokurikuler.findMany({
					columns: { muridId: true, kokurikulerId: true, dimensi: true, kategori: true },
					where: and(
						inArray(tableAsesmenKokurikuler.muridId, muridIds),
						inArray(tableAsesmenKokurikuler.kokurikulerId, kokIds)
					)
				});

				// build map: muridId -> kokId -> map(dimensi -> kategori)
				const asesmenByMurid = new Map<number, Map<number, Map<string, string>>>();
				for (const r of asesmenRecords) {
					let murMap = asesmenByMurid.get(r.muridId);
					if (!murMap) {
						murMap = new Map();
						asesmenByMurid.set(r.muridId, murMap);
					}
					let kokMap = murMap.get(r.kokurikulerId);
					if (!kokMap) {
						kokMap = new Map();
						murMap.set(r.kokurikulerId, kokMap);
					}
					kokMap.set(r.dimensi, r.kategori);
				}

				const kategoriToNumber: Record<string, number> = {
					'perlu-bimbingan': 1,
					cukup: 2,
					baik: 3,
					'sangat-baik': 4
				};

				// for each murid, compute kokurikuler average across kok rows
				for (const row of daftarNilai) {
					const muridId = row.id;
					const murMap = asesmenByMurid.get(muridId) ?? new Map();

					const kokValues: number[] = [];
					let countedKok = 0;

					for (const k of kokRows) {
						const dims = sanitizeDimensionList(k.dimensi);
						const kokMap = murMap.get(k.id) ?? new Map();

						const vals: number[] = [];
						for (const dim of dims) {
							const kategori = kokMap.get(dim);
							const num = kategori ? (kategoriToNumber[kategori] ?? null) : null;
							if (num != null && Number.isFinite(num)) vals.push(num);
						}

						if (vals.length > 0) {
							const sum = vals.reduce((a, b) => a + b, 0);
							const nilaiAkhir = Number.parseFloat((sum / vals.length).toFixed(2));
							kokValues.push(nilaiAkhir);
							countedKok += 1;
						}
					}

					if (kokValues.length > 0) {
						const avg = kokValues.reduce((a, b) => a + b, 0) / kokValues.length;
						const avgFixed = Number.parseFloat(avg.toFixed(2));
						row.nilaiRataRataKokurikuler = avgFixed;
						// map to kriteria label
						if (avgFixed >= 3.51) row.kriteriaKokurikuler = 'Sangat Baik';
						else if (avgFixed >= 2.51) row.kriteriaKokurikuler = 'Baik';
						else if (avgFixed >= 1.51) row.kriteriaKokurikuler = 'Cukup';
						else row.kriteriaKokurikuler = 'Perlu bimbingan';
					} else {
						row.nilaiRataRataKokurikuler = null;
						row.kriteriaKokurikuler = null;
					}
					row.jumlahKokurikulerDinilai = countedKok;
					row.totalKokurikulerRelevan = kokRows.length;
					// also add kok detail href
					// keep same domain path as other detail pages
					row.kokDetailHref = `/nilai-akhir/nilai-kokurikuler?murid_id=${muridId}`;
				}
			}
		} catch {
			// ignore kokurikuler errors — keep defaults
			// console.debug('kokurikuler aggregation skipped', err);
		}
	}

	// compute ekstrakurikuler per-murid averages (if ekstrak rows exist)
	if (ekstrakCount > 0) {
		try {
			const ekstrakRows = await db.query.tableEkstrakurikuler.findMany({
				where: eq(tableEkstrakurikuler.kelasId, kelasAktif.id),
				orderBy: asc(tableEkstrakurikuler.createdAt),
				with: { tujuan: { columns: { id: true } } }
			});

			const ekstrIds = ekstrakRows.map((e) => e.id);
			if (ekstrIds.length > 0 && muridIds.length > 0) {
				try {
					const { ensureAsesmenEkstrakurikulerSchema } =
						await import('$lib/server/db/ensure-asesmen-ekstrakurikuler');
					await ensureAsesmenEkstrakurikulerSchema();
				} catch {
					// ignore
				}

				const asesmenRecords = await db.query.tableAsesmenEkstrakurikuler.findMany({
					columns: { ekstrakurikulerId: true, tujuanId: true, muridId: true, kategori: true },
					where: and(
						inArray(tableAsesmenEkstrakurikuler.muridId, muridIds),
						inArray(tableAsesmenEkstrakurikuler.ekstrakurikulerId, ekstrIds)
					)
				});

				const asesmenByMurid = new Map<number, Map<number, Map<number, string>>>();
				for (const r of asesmenRecords) {
					let murMap = asesmenByMurid.get(r.muridId);
					if (!murMap) {
						murMap = new Map();
						asesmenByMurid.set(r.muridId, murMap);
					}
					let eksMap = murMap.get(r.ekstrakurikulerId);
					if (!eksMap) {
						eksMap = new Map();
						murMap.set(r.ekstrakurikulerId, eksMap);
					}
					eksMap.set(r.tujuanId, r.kategori);
				}

				const kategoriToNumber: Record<string, number> = {
					'perlu-bimbingan': 1,
					cukup: 2,
					baik: 3,
					'sangat-baik': 4
				};

				for (const row of daftarNilai) {
					const muridId = row.id;
					const murMap = asesmenByMurid.get(muridId) ?? new Map();

					const ekstrValues: number[] = [];
					let countedEks = 0;

					for (const e of ekstrakRows) {
						const tujuanIds = (e.tujuan ?? []).map((t: { id: number }) => t.id);
						const eksMap = murMap.get(e.id) ?? new Map<number, string>();

						const vals: number[] = [];
						for (const tId of tujuanIds) {
							const kategori = eksMap.get(tId);
							const num = kategori ? (kategoriToNumber[kategori] ?? null) : null;
							if (num != null && Number.isFinite(num)) vals.push(num);
						}

						if (vals.length > 0) {
							const sum = vals.reduce((a, b) => a + b, 0);
							const nilaiAkhir = Number.parseFloat((sum / vals.length).toFixed(2));
							ekstrValues.push(nilaiAkhir);
							countedEks += 1;
						}
					}

					if (ekstrValues.length > 0) {
						const avg = ekstrValues.reduce((a, b) => a + b, 0) / ekstrValues.length;
						const avgFixed = Number.parseFloat(avg.toFixed(2));
						row.nilaiRataRataEkstrakurikuler = avgFixed;
						// map to kriteria label (same ranges as kokurikuler)
						if (avgFixed >= 3.51) row.kriteriaEkstrakurikuler = 'Sangat Baik';
						else if (avgFixed >= 2.51) row.kriteriaEkstrakurikuler = 'Baik';
						else if (avgFixed >= 1.51) row.kriteriaEkstrakurikuler = 'Cukup';
						else row.kriteriaEkstrakurikuler = 'Perlu bimbingan';
					} else {
						row.nilaiRataRataEkstrakurikuler = null;
						row.kriteriaEkstrakurikuler = null;
					}
					row.jumlahEkstrakurikulerDinilai = countedEks;
					row.totalEkstrakurikulerRelevan = ekstrakRows.length;
					row.eksDetailHref = `/nilai-akhir/nilai-ekstra?murid_id=${muridId}`;
				}
			}
		} catch {
			// ignore ekstrak errors — keep defaults
		}
	}

	return { meta, daftarNilai, page, summary };
};
