import db from '$lib/server/db';
import { ensureAsesmenSumatifSchema } from '$lib/server/db/ensure-asesmen-sumatif';
import { tableAsesmenSumatif, tableMataPelajaran, tableMurid } from '$lib/server/db/schema';
import { redirect } from '@sveltejs/kit';
import { getAksesMapelUser, needsMapelFilter } from '$lib/server/mapel-access';
import { labelVarianUntukMurid, muridAgamaKey } from '$lib/server/mapel-picker';
import { agamaMapelOptions, pksMapelOptions } from '$lib/statics';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

const AGAMA_BASE_SUBJECT = 'Pendidikan Agama dan Budi Pekerti';
const PKS_BASE_SUBJECT = 'Pendalaman Kitab Suci';
const AGAMA_VARIANT_NAMES = agamaMapelOptions
	.filter((option) => option.key !== 'umum')
	.map((option) => normalizeText(option.name));
const PKS_VARIANT_NAMES = pksMapelOptions
	.filter((option) => option.key !== 'umum')
	.map((option) => normalizeText(option.name));
const AGAMA_MAPEL_VALUE = 'agama';
const PKS_MAPEL_VALUE = 'pks';

function normalizeText(value: string | null | undefined) {
	return value?.trim().toLowerCase() ?? '';
}

function isAgamaSubject(name: string) {
	// Mencakup varian "Pendidikan Kepercayaan terhadap Tuhan YME dan Budi Pekerti".
	return /^pendidikan (agama|kepercayaan)/i.test(normalizeText(name));
}

function isPksSubject(name: string) {
	return normalizeText(name).startsWith('pendalaman kitab suci');
}

function resolveAgamaVariantName(agama: string | null | undefined) {
	// Ejaan mengikuti $lib/statics (sumber nama baris DB) agar pencocokan
	// mapelByName selalu cocok — termasuk varian Konghuchu & Kepercayaan.
	const key = muridAgamaKey(agama);
	return agamaMapelOptions.find((option) => option.key === key)?.name ?? null;
}

function resolvePksVariantName(agama: string | null | undefined) {
	const key = muridAgamaKey(agama);
	return pksMapelOptions.find((option) => option.key === key)?.name ?? null;
}

function formatScore(value: number | null | undefined) {
	if (value == null || Number.isNaN(value)) return null;
	return Number.parseFloat(value.toFixed(2));
}

function computeNilaiAkhir(
	naLingkup: number | null | undefined,
	sts: number | null | undefined,
	sas: number | null | undefined,
	bobotLingkup: number,
	bobotSts: number,
	bobotSas: number
) {
	const eff =
		sts == null
			? { lingkup: 70, sts: 0, sas: 30 }
			: { lingkup: bobotLingkup, sts: bobotSts, sas: bobotSas };
	let weighted = 0;
	let totalW = 0;
	if (naLingkup != null) {
		weighted += naLingkup * eff.lingkup;
		totalW += eff.lingkup;
	}
	if (sts != null) {
		weighted += sts * eff.sts;
		totalW += eff.sts;
	}
	if (sas != null) {
		weighted += sas * eff.sas;
		totalW += eff.sas;
	}
	if (totalW === 0) return null;
	return Math.round((weighted / totalW) * 100) / 100;
}

function computeNilaiAkhirRts(
	naLingkup: number | null | undefined,
	sts: number | null | undefined,
	bobotLingkup: number,
	bobotSts: number
) {
	let weighted = 0;
	let totalW = 0;
	if (naLingkup != null) {
		weighted += naLingkup * bobotLingkup;
		totalW += bobotLingkup;
	}
	if (sts != null) {
		weighted += sts * bobotSts;
		totalW += bobotSts;
	}
	if (totalW === 0) return null;
	return Math.round((weighted / totalW) * 100) / 100;
}

type MapelOption = { value: string; nama: string };

type MuridRow = {
	id: number;
	no: number;
	nama: string;
	agamaLabel?: string | null;
	nilaiAkhirRts: number | null;
	nilaiAkhir: number | null;
	naLingkup: number | null;
	sts: number | null;
	sas: number | null;
	nilaiHref: string | null;
	canNilai: boolean;
	/** True bila data milik guru lain (murid di luar varian/mapel guru). */
	diisiUserLain?: boolean;
};

type PageState = {
	search: string | null;
	currentPage: number;
	totalPages: number;
	totalItems: number;
	perPage: number;
};

export async function load({ parent, url, depends, locals }) {
	depends('app:asesmen-sumatif');
	const { kelasAktif, user } = await parent();
	const meta: PageMeta = { title: 'Asesmen Sumatif' };

	const searchParam = url.searchParams.get('q');
	const searchTrimmed = searchParam ? searchParam.trim() : '';
	const search = searchTrimmed.length ? searchTrimmed : null;
	const perPage = 20;
	const requestedPage = Number(url.searchParams.get('page')) || 1;
	const pageNumber =
		Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;

	if (!kelasAktif?.id) {
		const pageState: PageState = {
			search,
			currentPage: 1,
			totalPages: 1,
			totalItems: 0,
			perPage
		};
		return {
			meta,
			mapelList: [] as MapelOption[],
			selectedMapelValue: null as string | null,
			selectedMapel: null as { id: number | null; nama: string } | null,
			daftarMurid: [] as MuridRow[],
			page: pageState
		};
	}

	let mapelRecords = await db.query.tableMataPelajaran.findMany({
		columns: { id: true, nama: true, namaLokal: true },
		where: eq(tableMataPelajaran.kelasId, kelasAktif.id),
		orderBy: asc(tableMataPelajaran.nama)
	});

	// Restrict for 'user' accounts assigned to mata pelajaran.
	// First check join table auth_user_mata_pelajaran for multi-mapel support,
	// then fallback to legacy mataPelajaranId field if join table is empty.
	// IMPORTANT: Match by mapel name (since same subject can exist in different classes)
	const maybeUser = user as unknown as
		{ id?: number; type?: string; mataPelajaranId?: number } | undefined;
	const assignedMapelIds = new Set<number>();
	let userAkses: Awaited<ReturnType<typeof getAksesMapelUser>> | null = null;

	if (needsMapelFilter(maybeUser, kelasAktif?.id ?? null) && maybeUser?.id) {
		try {
			userAkses = await getAksesMapelUser(
				{
					id: maybeUser.id,
					mataPelajaranId: maybeUser.mataPelajaranId
				},
				kelasAktif?.id ?? null
			);
			mapelRecords = mapelRecords.filter(
				(r) => userAkses!.ids.has(r.id) || userAkses!.names.has(normalizeText(r.nama))
			);
			// Populate assignedMapelIds for assignedLocalMapelId detection below
			for (const id of userAkses.ids) {
				assignedMapelIds.add(id);
			}
		} catch {
			// Silently handle error
		}
	}

	const mapelByName = new Map(mapelRecords.map((record) => [normalizeText(record.nama), record]));

	// Determine if the logged-in user is assigned to mata pelajaran.
	// For multi-mapel: pick the first one as assignedLocalMapelId (used for display).
	// assignedIsAgamaVariant is set if any of the assigned mapel is agama variant.
	let assignedLocalMapelId: number | null = null;
	let assignedIsAgamaVariant = false;
	if (needsMapelFilter(maybeUser, kelasAktif?.id ?? null) && maybeUser?.id) {
		// Check multi-mapel first
		if (assignedMapelIds.size > 0) {
			// Pick first assigned mapel from the filtered list
			const firstAssignedId = Array.from(assignedMapelIds)[0];
			const found = mapelRecords.find((r) => r.id === firstAssignedId);
			if (found) {
				assignedLocalMapelId = found.id;
				const norm = normalizeText(found.nama);
				assignedIsAgamaVariant =
					(norm.startsWith('pendidikan agama') && norm !== normalizeText(AGAMA_BASE_SUBJECT)) ||
					(norm.startsWith('pendalaman kitab suci') && norm !== normalizeText(PKS_BASE_SUBJECT));
			}
		} else if (maybeUser.mataPelajaranId) {
			// Fallback to legacy single mapel
			try {
				const assigned = await db.query.tableMataPelajaran.findFirst({
					columns: { id: true, nama: true },
					where: eq(tableMataPelajaran.id, Number(maybeUser.mataPelajaranId))
				});
				if (assigned && assigned.nama) {
					const norm = normalizeText(assigned.nama);
					assignedIsAgamaVariant =
						(norm.startsWith('pendidikan agama') && norm !== normalizeText(AGAMA_BASE_SUBJECT)) ||
						(norm.startsWith('pendalaman kitab suci') && norm !== normalizeText(PKS_BASE_SUBJECT));
					const found = mapelRecords.find((r) => normalizeText(r.nama) === norm);
					if (found) assignedLocalMapelId = found.id;
				} else {
					const foundById = mapelRecords.find((r) => r.id === Number(maybeUser.mataPelajaranId));
					if (foundById) assignedLocalMapelId = foundById.id;
				}
			} catch {
				// Silently handle error
			}
		}
	}

	const allowedAgamaVariants = new Set<string>();
	if (userAkses) {
		for (const option of [...agamaMapelOptions, ...pksMapelOptions]) {
			if (option.key !== 'umum' && userAkses.names.has(normalizeText(option.name))) {
				allowedAgamaVariants.add(option.label);
			}
		}
	}

	const allowedAgamaForUser: string[] = Array.from(allowedAgamaVariants);

	let agamaBaseMapel: (typeof mapelRecords)[number] | null = null;
	let pksBaseMapel: (typeof mapelRecords)[number] | null = null;
	const agamaVariantRecords: typeof mapelRecords = [];
	const pksVariantRecords: typeof mapelRecords = [];
	const regularOptions: MapelOption[] = [];

	for (const record of mapelRecords) {
		if (isAgamaSubject(record.nama)) {
			if (normalizeText(record.nama) === normalizeText(AGAMA_BASE_SUBJECT)) {
				agamaBaseMapel = record;
			} else {
				agamaVariantRecords.push(record);
			}
		} else if (isPksSubject(record.nama)) {
			if (normalizeText(record.nama) === normalizeText(PKS_BASE_SUBJECT)) {
				pksBaseMapel = record;
			} else {
				pksVariantRecords.push(record);
			}
		} else {
			regularOptions.push({
				value: String(record.id),
				nama: record.namaLokal?.trim() || record.nama
			});
		}
	}

	regularOptions.sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

	const mapelOptions: MapelOption[] = [...regularOptions];
	if (agamaBaseMapel || agamaVariantRecords.length) {
		const exists = mapelOptions.some(
			(option) => normalizeText(option.nama) === normalizeText(AGAMA_BASE_SUBJECT)
		);
		if (!exists) {
			mapelOptions.unshift({ value: AGAMA_MAPEL_VALUE, nama: AGAMA_BASE_SUBJECT });
		}
	}
	if (pksBaseMapel || pksVariantRecords.length) {
		const exists = mapelOptions.some(
			(option) => normalizeText(option.nama) === normalizeText(PKS_BASE_SUBJECT)
		);
		if (!exists) {
			mapelOptions.unshift({ value: PKS_MAPEL_VALUE, nama: PKS_BASE_SUBJECT });
		}
	}

	const requestedValue = url.searchParams.get('mapel_id');
	let selectedMapelValue = requestedValue ?? null;

	// If requestedValue is a numeric ID that matches an agama or PKS variant,
	// convert it to the special value ('agama' or 'pks')
	if (selectedMapelValue) {
		const requestedId = Number(selectedMapelValue);
		if (Number.isInteger(requestedId) && requestedId > 0) {
			const requestedRecord = mapelRecords.find((r) => r.id === requestedId);
			if (requestedRecord) {
				// Check if it's an agama variant
				if (isAgamaSubject(requestedRecord.nama)) {
					// Use special 'agama' value for all agama variants
					selectedMapelValue = AGAMA_MAPEL_VALUE;
				} else if (isPksSubject(requestedRecord.nama)) {
					// Use special 'pks' value for all PKS variants
					selectedMapelValue = PKS_MAPEL_VALUE;
				}
			}
		}
	}

	if (!selectedMapelValue && assignedLocalMapelId) {
		selectedMapelValue = String(assignedLocalMapelId);
	}
	if (selectedMapelValue && !mapelOptions.some((option) => option.value === selectedMapelValue)) {
		selectedMapelValue = null;
	}
	if (!selectedMapelValue && mapelOptions.length) {
		selectedMapelValue = mapelOptions[0].value;
	}

	const isAgamaSelected = selectedMapelValue === AGAMA_MAPEL_VALUE;
	const isPksSelected = selectedMapelValue === PKS_MAPEL_VALUE;
	const selectedMapelRecord =
		!isAgamaSelected && !isPksSelected && selectedMapelValue
			? (mapelRecords.find((record) => String(record.id) === selectedMapelValue) ?? null)
			: null;

	const selectedMapel = isAgamaSelected
		? agamaBaseMapel
			? { id: agamaBaseMapel.id, nama: agamaBaseMapel.nama }
			: { id: null, nama: AGAMA_BASE_SUBJECT }
		: isPksSelected
			? pksBaseMapel
				? { id: pksBaseMapel.id, nama: pksBaseMapel.nama }
				: { id: null, nama: PKS_BASE_SUBJECT }
			: selectedMapelRecord
				? {
						id: selectedMapelRecord.id,
						nama: selectedMapelRecord.namaLokal?.trim() || selectedMapelRecord.nama
					}
				: null;

	const muridFilter = and(
		eq(tableMurid.kelasId, kelasAktif.id),
		search ? sql`${tableMurid.nama} LIKE ${'%' + search + '%'} COLLATE NOCASE` : undefined
	);

	const [{ totalItems }] = await db
		.select({ totalItems: sql<number>`count(*)` })
		.from(tableMurid)
		.where(muridFilter);

	const total = totalItems ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / perPage));
	const currentPage = Math.min(Math.max(pageNumber, 1), totalPages);
	const offset = (currentPage - 1) * perPage;
	const pageState: PageState = {
		search,
		currentPage,
		totalPages,
		totalItems: total,
		perPage
	};

	const muridRecords = await db.query.tableMurid.findMany({
		columns: { id: true, nama: true, agama: true },
		where: muridFilter,
		orderBy: asc(tableMurid.nama),
		limit: perPage,
		offset
	});

	if (pageNumber !== currentPage) {
		const params = new URLSearchParams(url.searchParams);
		if (currentPage <= 1) {
			params.delete('page');
		} else {
			params.set('page', String(currentPage));
		}
		throw redirect(303, `${url.pathname}${params.size ? `?${params}` : ''}`);
	}

	const baseList: MuridRow[] = muridRecords.map((murid, index) => ({
		id: murid.id,
		no: offset + index + 1,
		nama: murid.nama,
		agamaLabel: null,
		nilaiAkhirRts: null,
		nilaiAkhir: null,
		naLingkup: null,
		sts: null,
		sas: null,
		nilaiHref: null,
		canNilai: true
	}));

	if (!selectedMapelValue) {
		return {
			meta,
			mapelList: mapelOptions,
			selectedMapelValue,
			selectedMapel,
			daftarMurid: baseList,
			page: pageState
		};
	}

	await ensureAsesmenSumatifSchema();

	const agamaMapelIds = [
		...agamaVariantRecords.map((record) => record.id),
		...(agamaBaseMapel ? [agamaBaseMapel.id] : [])
	];
	const pksMapelIds = [
		...pksVariantRecords.map((record) => record.id),
		...(pksBaseMapel ? [pksBaseMapel.id] : [])
	];
	const relevantMapelIds = isAgamaSelected
		? Array.from(new Set(agamaMapelIds))
		: isPksSelected
			? Array.from(new Set(pksMapelIds))
			: selectedMapelRecord
				? [selectedMapelRecord.id]
				: [];

	const muridIds = muridRecords.map((murid) => murid.id);

	const sumatifRecords =
		relevantMapelIds.length && muridIds.length
			? await db.query.tableAsesmenSumatif.findMany({
					columns: {
						muridId: true,
						mataPelajaranId: true,
						naLingkup: true,
						sts: true,
						sas: true,
						nilaiAkhir: true,
						nilaiAkhirRts: true
					},
					where: and(
						inArray(tableAsesmenSumatif.mataPelajaranId, relevantMapelIds),
						inArray(tableAsesmenSumatif.muridId, muridIds)
					)
				})
			: [];

	const sumatifByMurid = new Map<number, Map<number, (typeof sumatifRecords)[number]>>();
	for (const record of sumatifRecords) {
		let map = sumatifByMurid.get(record.muridId);
		if (!map) {
			map = new Map();
			sumatifByMurid.set(record.muridId, map);
		}
		map.set(record.mataPelajaranId, record);
	}

	const pickMapelIdForMurid = (muridAgama: string | null | undefined): number | null => {
		if (isAgamaSelected) {
			const variantName = resolveAgamaVariantName(muridAgama);
			if (variantName) {
				const variantRecord = mapelByName.get(normalizeText(variantName));
				if (variantRecord) {
					return variantRecord.id;
				}
			}
			return agamaBaseMapel?.id ?? null;
		}
		if (isPksSelected) {
			const variantName = resolvePksVariantName(muridAgama);
			if (variantName) {
				const variantRecord = mapelByName.get(normalizeText(variantName));
				if (variantRecord) {
					return variantRecord.id;
				}
			}
			return pksBaseMapel?.id ?? null;
		}
		return selectedMapelRecord?.id ?? null;
	};

	const daftarMurid: MuridRow[] = muridRecords.map((murid, index) => {
		const targetMapelId = pickMapelIdForMurid(murid.agama);
		const agamaLabel =
			isAgamaSelected || isPksSelected
				? labelVarianUntukMurid(selectedMapel?.nama ?? '', murid.agama)
				: null;
		const sumatif = targetMapelId
			? (sumatifByMurid.get(murid.id)?.get(targetMapelId) ?? null)
			: null;

		const canAccess = (() => {
			if (!maybeUser || maybeUser.type !== 'user') return true;

			if ((isAgamaSelected || isPksSelected) && allowedAgamaVariants.size > 0) {
				// Hanya murid dengan agama varian yang diajar guru (termasuk sub-nya).
				const label = labelVarianUntukMurid(selectedMapel?.nama ?? '', murid.agama);
				return !!label && allowedAgamaVariants.has(label);
			}

			// For non-agama mapel, check standard assignment
			if (!assignedIsAgamaVariant) return true;
			if (!assignedLocalMapelId) return false;
			return targetMapelId === assignedLocalMapelId;
		})();

		// Murid di luar varian/mapel guru: jangan bocorkan nilai milik guru lain.
		if (!canAccess) {
			return {
				id: murid.id,
				no: offset + index + 1,
				nama: murid.nama,
				agamaLabel,
				nilaiAkhirRts: null,
				nilaiAkhir: null,
				naLingkup: null,
				sts: null,
				sas: null,
				nilaiHref: null,
				canNilai: false,
				diisiUserLain: true
			};
		}

		const bobotLingkup = Number(locals.sekolah?.sumatifBobotLingkup ?? 60);
		const bobotSts = Number(locals.sekolah?.sumatifBobotSts ?? 20);
		const bobotSas = Number(locals.sekolah?.sumatifBobotSas ?? 20);
		const bobotRtsLingkup = Number(locals.sekolah?.sumatifBobotRtsLingkup ?? 70);
		const bobotRtsSts = Number(locals.sekolah?.sumatifBobotRtsSts ?? 30);

		return {
			id: murid.id,
			no: offset + index + 1,
			nama: murid.nama,
			agamaLabel,
			nilaiAkhirRts: formatScore(
				computeNilaiAkhirRts(sumatif?.naLingkup, sumatif?.sts, bobotRtsLingkup, bobotRtsSts)
			),
			nilaiAkhir: formatScore(
				computeNilaiAkhir(
					sumatif?.naLingkup,
					sumatif?.sts,
					sumatif?.sas,
					bobotLingkup,
					bobotSts,
					bobotSas
				)
			),
			naLingkup: formatScore(sumatif?.naLingkup),
			sts: formatScore(sumatif?.sts),
			sas: formatScore(sumatif?.sas),
			nilaiHref:
				targetMapelId && canAccess
					? `/asesmen-sumatif/formulir-asesmen?murid_id=${murid.id}&mapel_id=${targetMapelId}`
					: null,
			canNilai: Boolean(canAccess)
		};
	});

	return {
		meta,
		mapelList: mapelOptions,
		selectedMapelValue,
		selectedMapel,
		daftarMurid,
		allowedAgamaForUser,
		page: pageState
	};
}
