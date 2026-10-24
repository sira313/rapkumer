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
import { redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const PER_PAGE = 20;

function formatScore(value: number | null | undefined) {
	if (value == null || Number.isNaN(value)) return null;
	return Number.parseFloat(value.toFixed(2));
}

type Row = {
	id: number;
	nama: string;
	nilaiRataRata: number | null;
	predikat: string | null;
	jumlahDinilai: number;
	totalRelevan: number;
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
	totalKeasramaan: number;
};

export const load: PageServerLoad = async ({ parent, locals, url, depends }) => {
	depends('app:rekap-keasramaan');

	const meta: PageMeta = { title: 'Rekap Keasramaan' };
	const { kelasAktif, user } = await parent();
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
			daftarNilai: [] as Row[],
			page: defaultState,
			summary: { totalMurid: 0, totalMuridDinilai: 0, totalKeasramaan: 0 } satisfies Summary
		};
	}

	const muridRecords = await db.query.tableMurid.findMany({
		columns: { id: true, nama: true, waliAsuhNama: true },
		where: and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, kelasAktif.id)),
		orderBy: asc(tableMurid.nama)
	});

	// Wali_asuh: hanya murid asuhannya sendiri yang boleh terlihat di rekap
	const userWithType = user as { type?: string; pegawaiId?: number } | null;
	let waliAsuhNama: string | null = null;
	if (userWithType?.type === 'wali_asuh' && userWithType.pegawaiId) {
		const peg = await db.query.tablePegawai.findFirst({
			columns: { nama: true },
			where: eq(tablePegawai.id, userWithType.pegawaiId)
		});
		waliAsuhNama = peg?.nama?.trim().toLowerCase() ?? null;
	}
	const scopedMurid =
		waliAsuhNama === null
			? muridRecords
			: muridRecords.filter((m) => (m.waliAsuhNama?.trim().toLowerCase() ?? '') === waliAsuhNama);

	const muridIds = scopedMurid.map((m) => m.id);

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

	// Denominator: jumlah TP (tujuan) seluruh mata evaluasi keasramaan di kelas
	let totalTp = 0;
	const tujuanIds: number[] = [];
	for (const k of keasramaanRecords) {
		for (const ind of k.indikator) {
			for (const t of ind.tujuan) {
				tujuanIds.push(t.id);
				totalTp += 1;
			}
		}
	}

	const asesmenRecords =
		muridIds.length && tujuanIds.length
			? await db.query.tableAsesmenKeasramaan.findMany({
					columns: { muridId: true, tujuanId: true, kategori: true },
					where: and(
						inArray(tableAsesmenKeasramaan.muridId, muridIds),
						inArray(tableAsesmenKeasramaan.tujuanId, tujuanIds)
					)
				})
			: [];

	// rubrik per murid per TP
	const rubrikByMurid = new Map<number, Map<number, number>>();
	for (const a of asesmenRecords) {
		let map = rubrikByMurid.get(a.muridId);
		if (!map) {
			map = new Map();
			rubrikByMurid.set(a.muridId, map);
		}
		map.set(a.tujuanId, kategoriToRubrikValue(a.kategori));
	}

	const rows = scopedMurid.map((murid) => {
		const map = rubrikByMurid.get(murid.id);
		let total = 0;
		let count = 0;
		if (map) {
			for (const value of map.values()) {
				total += value;
				count += 1;
			}
		}
		const rataRata = count ? formatScore(total / count) : null;
		return {
			id: murid.id,
			nama: murid.nama,
			nilaiRataRata: rataRata,
			predikat: nilaiAngkaToHuruf(rataRata),
			jumlahDinilai: count,
			totalRelevan: totalTp
		};
	});

	rows.sort((a, b) => {
		const aScore = a.nilaiRataRata;
		const bScore = b.nilaiRataRata;
		if (aScore == null && bScore == null) return a.nama.localeCompare(b.nama, 'id');
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
		return { ...row, peringkat } satisfies Row;
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
		if (currentPage <= 1) params.delete('page');
		else params.set('page', String(currentPage));
		throw redirect(303, `${url.pathname}${params.size ? `?${params}` : ''}`);
	}

	const daftarNilai = filteredRows.slice(offset, offset + PER_PAGE);
	const page: PageState = { search, currentPage, totalPages, totalItems, perPage: PER_PAGE };

	const summary: Summary = {
		totalMurid: rankedRows.length,
		totalMuridDinilai: rankedRows.filter((row) => row.jumlahDinilai > 0).length,
		totalKeasramaan: keasramaanRecords.length
	};

	let waliAsramaInfo: { nama?: string | null; nip?: string | null } | null = null;
	const waliAsuhList: Array<{ nama: string; nip?: string | null }> = [];
	try {
		const kelasData = await db.query.tableKelas.findFirst({
			columns: { id: true },
			where: and(eq(tableKelas.id, kelasAktif.id), eq(tableKelas.sekolahId, sekolahId)),
			with: { waliAsrama: true }
		});
		waliAsramaInfo = kelasData?.waliAsrama
			? { nama: kelasData.waliAsrama.nama, nip: kelasData.waliAsrama.nip }
			: null;
	} catch {
		// ignore
	}
	try {
		const waSet = new Map<string, string>();
		for (const m of scopedMurid) {
			const nm = (m.waliAsuhNama || '').trim();
			if (nm && !waSet.has(nm.toLowerCase())) waSet.set(nm.toLowerCase(), nm);
		}
		for (const nm of waSet.values()) {
			const p = await db.query.tablePegawai.findFirst({
				columns: { nama: true, nip: true },
				where: eq(tablePegawai.nama, nm)
			});
			waliAsuhList.push({ nama: nm, nip: p?.nip || null });
		}
	} catch {
		// ignore
	}

	return {
		meta,
		daftarNilai,
		page,
		summary,
		waliAsrama: waliAsramaInfo,
		waliAsuhList,
		kepalaSekolah: locals.sekolah?.kepalaSekolah ?? null,
		keasramaanRecords,
		muridAll: scopedMurid.map((m) => ({ id: m.id, nama: m.nama, waliAsuhNama: m.waliAsuhNama }))
	};
};
