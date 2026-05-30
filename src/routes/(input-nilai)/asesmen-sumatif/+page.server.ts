import db from '$lib/server/db';
import { ensureAsesmenSumatifSchema } from '$lib/server/db/ensure-asesmen-sumatif';
import {
	tableAsesmenSumatif,
	tableMataPelajaran,
	tableMurid,
	tableAuthUserMataPelajaran
} from '$lib/server/db/schema';
import { redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

const AGAMA_BASE_SUBJECT = 'Pendidikan Agama dan Budi Pekerti';
const PKS_BASE_SUBJECT = 'Pendalaman Kitab Suci';
const AGAMA_MAPEL_VALUE = 'agama';
const PKS_MAPEL_VALUE = 'pks';

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

const PKS_VARIANT_MAP: Record<string, string> = {
	islam: 'Pendalaman Kitab Suci Islam',
	kristen: 'Pendalaman Kitab Suci Kristen',
	protestan: 'Pendalaman Kitab Suci Kristen',
	katolik: 'Pendalaman Kitab Suci Katolik',
	kathholik: 'Pendalaman Kitab Suci Katolik',
	hindu: 'Pendalaman Kitab Suci Hindu',
	budha: 'Pendalaman Kitab Suci Buddha',
	buddha: 'Pendalaman Kitab Suci Buddha',
	buddhist: 'Pendalaman Kitab Suci Buddha',
	khonghucu: 'Pendalaman Kitab Suci Khonghucu',
	'khong hu cu': 'Pendalaman Kitab Suci Khonghucu',
	konghucu: 'Pendalaman Kitab Suci Khonghucu'
};

function normalizeText(value: string | null | undefined) {
	return value?.trim().toLowerCase() ?? '';
}

function isAgamaSubject(name: string) {
	return normalizeText(name).startsWith('pendidikan agama');
}

function isPksSubject(name: string) {
	return normalizeText(name).startsWith('pendalaman kitab suci');
}

function resolveAgamaVariantName(agama: string | null | undefined) {
	const normalized = normalizeText(agama);
	return AGAMA_VARIANT_MAP[normalized] ?? null;
}

function resolvePksVariantName(agama: string | null | undefined) {
	const normalized = normalizeText(agama);
	return PKS_VARIANT_MAP[normalized] ?? null;
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
	const eff = sts == null
		? { lingkup: 70, sts: 0, sas: 30 }
		: { lingkup: bobotLingkup, sts: bobotSts, sas: bobotSas };
	let weighted = 0;
	let totalW = 0;
	if (naLingkup != null) { weighted += naLingkup * eff.lingkup; totalW += eff.lingkup; }
	if (sts != null) { weighted += sts * eff.sts; totalW += eff.sts; }
	if (sas != null) { weighted += sas * eff.sas; totalW += eff.sas; }
	if (totalW === 0) return null;
	return Math.round((weighted / totalW) * 100) / 100;
}

type MapelOption = { value: string; nama: string };

type MuridRow = {
	id: number;
	no: number;
	nama: string;
	nilaiAkhir: number | null;
	naLingkup: number | null;
	sts: number | null;
	sas: number | null;
	nilaiHref: string | null;
	canNilai: boolean;
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
		columns: { id: true, nama: true },
		where: eq(tableMataPelajaran.kelasId, kelasAktif.id),
		orderBy: asc(tableMataPelajaran.nama)
	});

	// Restrict for 'user' accounts assigned to mata pelajaran.
	// First check join table auth_user_mata_pelajaran for multi-mapel support,
	// then fallback to legacy mataPelajaranId field if join table is empty.
	// IMPORTANT: Match by mapel name (since same subject can exist in different classes)
	const maybeUser = user as unknown as
		| { id?: number; type?: string; mataPelajaranId?: number }
		| undefined;
	const assignedMapelIds = new Set<number>();

	if (maybeUser && maybeUser.type === 'user' && maybeUser.id) {
		try {
			// Try to fetch from join table (multi-mapel)
			const multiMapels = await db.query.tableAuthUserMataPelajaran.findMany({
				columns: { mataPelajaranId: true },
				where: eq(tableAuthUserMataPelajaran.authUserId, maybeUser.id)
			});

			if (multiMapels.length > 0) {
				// User has multi-mapel assignments
				// Fetch the actual mapel records to get their names
				const assignedMapelRecords = await db.query.tableMataPelajaran.findMany({
					columns: { id: true, nama: true },
					where: inArray(
						tableMataPelajaran.id,
						multiMapels.map((m) => m.mataPelajaranId)
					)
				});

				// Build a set of allowed mapel names (normalize for comparison)
				const allowedNames = new Set(assignedMapelRecords.map((m) => normalizeText(m.nama)));

				// Check if any assigned mapel is an agama variant
				let hasAgamaVariant = false;
				for (const record of assignedMapelRecords) {
					const norm = normalizeText(record.nama);
					if (
						norm.startsWith('pendidikan agama') &&
						!norm.includes(normalizeText(AGAMA_BASE_SUBJECT))
					) {
						hasAgamaVariant = true;
						break;
					}
				}

				// Check for PKS variants
				const pksVariantValues = new Set(
					Object.values(PKS_VARIANT_MAP).map((v) => normalizeText(v))
				);
				let hasPksVariant = false;
				for (const record of assignedMapelRecords) {
					const norm = normalizeText(record.nama);
					if (pksVariantValues.has(norm)) {
						hasPksVariant = true;
						break;
					}
				}

				// If has agama variant, also add the parent agama mapel name
				if (hasAgamaVariant) {
					allowedNames.add(normalizeText(AGAMA_BASE_SUBJECT));
				}

				// If has PKS variant, also add the parent PKS mapel name
				if (hasPksVariant) {
					allowedNames.add(normalizeText(PKS_BASE_SUBJECT));
				}

				// Filter current kelas' mapel by name match
				mapelRecords = mapelRecords.filter((r) => {
					const rNorm = normalizeText(r.nama);
					const allowed = allowedNames.has(rNorm);
					return allowed;
				});
			} else if (maybeUser.mataPelajaranId) {
				// Fallback: check legacy single mataPelajaranId
				const assignedId = Number(maybeUser.mataPelajaranId);
				assignedMapelIds.add(assignedId);
				const assigned = await db.query.tableMataPelajaran.findFirst({
					columns: { id: true, nama: true },
					where: eq(tableMataPelajaran.id, assignedId)
				});
				if (assigned && assigned.nama) {
					const norm = normalizeText(assigned.nama);
					// If the assigned mapel matches any known agama variant name,
					// show all agama variants (special case for agama teachers)
					const agamaVariantValues = new Set(
						Object.values(AGAMA_VARIANT_MAP).map((v) => normalizeText(v))
					);
					const pksVariantValues = new Set(
						Object.values(PKS_VARIANT_MAP).map((v) => normalizeText(v))
					);
					if (agamaVariantValues.has(norm)) {
						// Allow all agama variants
						mapelRecords = mapelRecords.filter((r) => {
							const rNorm = normalizeText(r.nama);
							return rNorm === normalizeText(AGAMA_BASE_SUBJECT) || agamaVariantValues.has(rNorm);
						});
					} else if (pksVariantValues.has(norm)) {
						// Allow all PKS variants
						mapelRecords = mapelRecords.filter((r) => {
							const rNorm = normalizeText(r.nama);
							return rNorm === normalizeText(PKS_BASE_SUBJECT) || pksVariantValues.has(rNorm);
						});
					} else {
						mapelRecords = mapelRecords.filter((r) => normalizeText(r.nama) === norm);
					}
				} else {
					mapelRecords = mapelRecords.filter((r) => r.id === assignedId);
				}
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
	if (maybeUser && maybeUser.type === 'user') {
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

	// Derive human readable agama labels for the assigned agama-variant(s).
	// Support both multi-mapel (join table) and legacy single-mapel.
	const allowedAgamaVariants = new Set<string>();
	if (maybeUser && maybeUser.type === 'user' && maybeUser.id) {
		try {
			// First try multi-mapel from join table
			const multiMapels = await db.query.tableAuthUserMataPelajaran.findMany({
				columns: { mataPelajaranId: true },
				where: eq(tableAuthUserMataPelajaran.authUserId, maybeUser.id)
			});

			if (multiMapels.length > 0) {
				// Get mapel names from join table assignments
				const assignedMapels = await db.query.tableMataPelajaran.findMany({
					columns: { id: true, nama: true },
					where: inArray(
						tableMataPelajaran.id,
						multiMapels.map((m) => m.mataPelajaranId)
					)
				});

				for (const mapel of assignedMapels) {
					const nm = normalizeText(mapel.nama);
					if (nm.includes('katolik')) allowedAgamaVariants.add('Katolik');
					else if (nm.includes('kristen') || nm.includes('protestan'))
						allowedAgamaVariants.add('Kristen');
					else if (nm.includes('islam')) allowedAgamaVariants.add('Islam');
					else if (nm.includes('hindu')) allowedAgamaVariants.add('Hindu');
					else if (nm.includes('buddha') || nm.includes('budha') || nm.includes('buddhist'))
						allowedAgamaVariants.add('Buddha');
					else if (
						nm.includes('khonghucu') ||
						nm.includes('konghucu') ||
						nm.includes('khong hu cu')
					)
						allowedAgamaVariants.add('Khonghucu');
				}
			} else if (maybeUser.mataPelajaranId) {
				// Fallback: check legacy single mataPelajaranId
				const assignedRec = await db.query.tableMataPelajaran.findFirst({
					columns: { id: true, nama: true },
					where: eq(tableMataPelajaran.id, Number(maybeUser.mataPelajaranId))
				});
				if (assignedRec && assignedRec.nama) {
					const nm = normalizeText(assignedRec.nama);
					if (nm.includes('katolik')) allowedAgamaVariants.add('Katolik');
					else if (nm.includes('kristen') || nm.includes('protestan'))
						allowedAgamaVariants.add('Kristen');
					else if (nm.includes('islam')) allowedAgamaVariants.add('Islam');
					else if (nm.includes('hindu')) allowedAgamaVariants.add('Hindu');
					else if (nm.includes('buddha') || nm.includes('budha') || nm.includes('buddhist'))
						allowedAgamaVariants.add('Buddha');
					else if (
						nm.includes('khonghucu') ||
						nm.includes('konghucu') ||
						nm.includes('khong hu cu')
					)
						allowedAgamaVariants.add('Khonghucu');
				}
			}
		} catch {
			// Silently handle error
		}
	}

	const allowedAgamaForUser =
		allowedAgamaVariants.size > 0 ? Array.from(allowedAgamaVariants)[0] : null;

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
			regularOptions.push({ value: String(record.id), nama: record.nama });
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
				? { id: selectedMapelRecord.id, nama: selectedMapelRecord.nama }
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
						nilaiAkhir: true
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
		return agamaVariantRecords[0]?.id ?? null;
	};

	const daftarMurid: MuridRow[] = muridRecords.map((murid, index) => {
		const targetMapelId = pickMapelIdForMurid(murid.agama);
		const sumatif = targetMapelId
			? (sumatifByMurid.get(murid.id)?.get(targetMapelId) ?? null)
			: null;

		const canAccess = (() => {
			if (!maybeUser || maybeUser.type !== 'user') return true;

			// If agama is selected and user has assigned agama variants, restrict by agama
			if (isAgamaSelected && allowedAgamaVariants.size > 0) {
				const muridVariant = resolveAgamaVariantName(murid.agama);
				const muridAgamaDisplay = muridVariant
					? (() => {
							const nm = normalizeText(muridVariant);
							if (nm.includes('katolik')) return 'Katolik';
							else if (nm.includes('kristen') || nm.includes('protestan')) return 'Kristen';
							else if (nm.includes('islam')) return 'Islam';
							else if (nm.includes('hindu')) return 'Hindu';
							else if (nm.includes('buddha') || nm.includes('budha') || nm.includes('buddhist'))
								return 'Buddha';
							else if (
								nm.includes('khonghucu') ||
								nm.includes('konghucu') ||
								nm.includes('khong hu cu')
							)
								return 'Khonghucu';
							return null;
						})()
					: null;

				// Allow access only if murid's agama is in user's assigned agama variants
				const allowed = muridAgamaDisplay && allowedAgamaVariants.has(muridAgamaDisplay);
				return allowed ?? false;
			}

			// For non-agama mapel, check standard assignment
			if (!assignedIsAgamaVariant) return true;
			if (!assignedLocalMapelId) return false;
			return targetMapelId === assignedLocalMapelId;
		})();

		const bobotLingkup = Number(locals.sekolah?.sumatifBobotLingkup ?? 60);
		const bobotSts = Number(locals.sekolah?.sumatifBobotSts ?? 20);
		const bobotSas = Number(locals.sekolah?.sumatifBobotSas ?? 20);

		return {
			id: murid.id,
			no: offset + index + 1,
			nama: murid.nama,
			nilaiAkhir: formatScore(
				computeNilaiAkhir(sumatif?.naLingkup, sumatif?.sts, sumatif?.sas, bobotLingkup, bobotSts, bobotSas)
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
