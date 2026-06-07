import db from '$lib/server/db';
import {
	tableAsesmenFormatif,
	tableMataPelajaran,
	tableMurid,
	tableTujuanPembelajaran,
	tableAuthUserMataPelajaran
} from '$lib/server/db/schema';
import { ensureAsesmenFormatifSchema } from '$lib/server/db/ensure-asesmen-formatif';
import { asc, and, eq, inArray } from 'drizzle-orm';
import { redirect } from '@sveltejs/kit';

const CATEGORY_LABEL: Record<ProgressCategory, string> = {
	'sangat-baik': 'Sangat baik',
	baik: 'Baik',
	'perlu-pendalaman': 'Perlu pendalaman',
	'perlu-bimbingan': 'Perlu bimbingan'
};

const DEFAULT_LINGKUP = 'Tanpa lingkup materi';

const AGAMA_BASE_SUBJECT = 'Pendidikan Agama dan Budi Pekerti';
const AGAMA_MAPEL_VALUE = 'agama';

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

const PKS_BASE_SUBJECT = 'Pendalaman Kitab Suci';
const PKS_MAPEL_VALUE = 'pks';

const PKS_VARIANT_MAP: Record<string, string> = {
	islam: 'Pendalaman Kitab Suci Islam',
	kristen: 'Pendalaman Kitab Suci Kristen',
	protestan: 'Pendalaman Kitab Suci Kristen',
	katolik: 'Pendalaman Kitab Suci Katolik',
	katholik: 'Pendalaman Kitab Suci Katolik',
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

type ProgressCategory = 'sangat-baik' | 'baik' | 'perlu-pendalaman' | 'perlu-bimbingan';

type ProgressSummaryPart = {
	kategori: ProgressCategory;
	kategoriLabel: string;
	lingkupMateri: string;
	tuntas: number;
	totalTujuan: number;
};

function resolveCategory(tuntas: number, total: number): ProgressCategory {
	if (total <= 0) return 'perlu-bimbingan';
	const ratio = tuntas / total;
	if (ratio >= 1) return 'sangat-baik';
	if (ratio >= 2 / 3) return 'baik';
	if (ratio >= 0.5) return 'perlu-pendalaman';
	return 'perlu-bimbingan';
}

function buildSummarySentence(parts: ProgressSummaryPart[]): string | null {
	if (!parts.length) return null;
	const formatted = parts.map((part, index) => {
		const kategoriLabel = index === 0 ? part.kategoriLabel : part.kategoriLabel.toLowerCase();
		const lingkup = part.lingkupMateri.toLowerCase();
		return `${kategoriLabel} dalam materi ${lingkup} (${part.tuntas}/${part.totalTujuan} TP)`;
	});
	let sentence = '';
	if (formatted.length === 1) {
		sentence = formatted[0];
	} else if (formatted.length === 2) {
		sentence = `${formatted[0]} dan ${formatted[1]}`;
	} else {
		sentence = `${formatted.slice(0, -1).join(', ')}, dan ${formatted.at(-1)}`;
	}
	if (!sentence) return null;
	const capitalized = sentence.charAt(0).toUpperCase() + sentence.slice(1);
	return capitalized.endsWith('.') ? capitalized : `${capitalized}.`;
}
export async function load({ parent, url, depends }) {
	depends('app:asesmen-formatif');
	const { kelasAktif, user } = await parent();
	const meta: PageMeta = { title: 'Asesmen Formatif' };
	const perPage = 20;
	const requestedPage = Number(url.searchParams.get('page')) || 1;
	const pageNumber =
		Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;

	if (!kelasAktif?.id) {
		return {
			meta,
			mapelList: [],
			selectedMapelValue: null,
			selectedMapel: null,
			tujuanGroups: [] as Array<{ lingkupMateri: string; totalTujuan: number }>,
			jumlahTujuan: 0,
			daftarMurid: [],
			search: null,
			page: {
				currentPage: 1,
				totalPages: 1,
				totalItems: 0,
				perPage,
				search: null
			}
		};
	}

	let mapelRecords = await db.query.tableMataPelajaran.findMany({
		columns: { id: true, nama: true },
		where: eq(tableMataPelajaran.kelasId, kelasAktif.id),
		orderBy: asc(tableMataPelajaran.nama)
	});

	// If the logged-in user is a simple 'user' and has an assigned mataPelajaranId,
	// prefer the subject with the same name in the active kelas (so subject exists
	// across multiple kelas rows with same name).
	const maybeUser = user as unknown as
		| { id?: number; type?: string; mataPelajaranId?: number }
		| undefined;
	// Special rule: if the logged-in user is a 'user' assigned to any agama
	// variant (Katolik, Islam, Kristen, Hindu, Buddha, Khonghucu, etc.),
	// treat them like the admin behaviour: show the parent agama subject and
	// default to it in the UI. This does NOT grant them wider grading
	// access; that remains restricted to their assigned variant.
	let treatAssignedAgamaVariantAsBase = false;
	if (maybeUser && maybeUser.type === 'user' && maybeUser.id) {
		try {
			// First check join table auth_user_mata_pelajaran for multi-mapel support
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

				// Build a set of allowed mapel names (normalize for comparison)
				const allowedNames = new Set(assignedMapels.map((m) => normalizeText(m.nama)));

				// Check if any assigned mapel is an agama variant
				let hasAgamaVariant = false;
				for (const record of assignedMapels) {
					const norm = normalizeText(record.nama);
					if (norm.startsWith('pendidikan agama') && norm !== normalizeText(AGAMA_BASE_SUBJECT)) {
						hasAgamaVariant = true;
						break;
					}
				}

				// Check for PKS variants
				const pksVariantValues = new Set(
					Object.values(PKS_VARIANT_MAP).map((v) => normalizeText(v))
				);
				let hasPksVariant = false;
				for (const record of assignedMapels) {
					const norm = normalizeText(record.nama);
					if (pksVariantValues.has(norm)) {
						hasPksVariant = true;
						break;
					}
				}

				// If has agama variant, also add the parent agama mapel name
				if (hasAgamaVariant) {
					allowedNames.add(normalizeText(AGAMA_BASE_SUBJECT));
					treatAssignedAgamaVariantAsBase = true;
				}

				// If has PKS variant, also add the parent PKS mapel name
				if (hasPksVariant) {
					allowedNames.add(normalizeText(PKS_BASE_SUBJECT));
					treatAssignedAgamaVariantAsBase = true;
				}

				// Filter current kelas' mapel by name match
				mapelRecords = mapelRecords.filter((r) => {
					const rNorm = normalizeText(r.nama);
					return allowedNames.has(rNorm);
				});
			} else if (maybeUser.mataPelajaranId) {
				// Fallback: check legacy single mataPelajaranId column
				const assigned = await db.query.tableMataPelajaran.findFirst({
					columns: { id: true, nama: true },
					where: eq(tableMataPelajaran.id, Number(maybeUser.mataPelajaranId))
				});
				if (assigned && assigned.nama) {
					const norm = normalizeText(assigned.nama);
					const agamaVariantValues = new Set(
						Object.values(AGAMA_VARIANT_MAP).map((v) => normalizeText(v))
					);
					const pksVariantValues = new Set(
						Object.values(PKS_VARIANT_MAP).map((v) => normalizeText(v))
					);
					// If assigned to a known agama or PKS variant, do NOT lock mapelRecords to the
					// variant. Instead show the base subject and let the select
					// default to the base (handled further down).
					if (agamaVariantValues.has(norm) || pksVariantValues.has(norm)) {
						treatAssignedAgamaVariantAsBase = true;
					} else {
						mapelRecords = mapelRecords.filter((r) => normalizeText(r.nama) === norm);
					}
				} else {
					mapelRecords = mapelRecords.filter((r) => r.id === Number(maybeUser.mataPelajaranId));
				}
			}
		} catch (err) {
			console.warn('[asesmen-formatif] Failed to resolve assigned mapel name', err);
		}
	}

	// Determine if the logged-in user is assigned to a local mapel in this kelas
	// and whether that assigned mapel is an agama variant. This is used to
	// restrict grading links so a guru mapel agama assigned to a variant only
	// grades students of their agama.
	let assignedLocalMapelId: number | null = null;
	let assignedIsAgamaVariant = false;
	if (maybeUser && maybeUser.type === 'user' && maybeUser.mataPelajaranId) {
		try {
			const assigned = await db.query.tableMataPelajaran.findFirst({
				columns: { id: true, nama: true },
				where: eq(tableMataPelajaran.id, Number(maybeUser.mataPelajaranId))
			});
			if (assigned && assigned.nama) {
				const norm = normalizeText(assigned.nama);
				// detect agama or PKS variant
				assignedIsAgamaVariant =
					(norm.startsWith('pendidikan agama') && norm !== normalizeText(AGAMA_BASE_SUBJECT)) ||
					(norm.startsWith('pendalaman kitab suci') && norm !== normalizeText(PKS_BASE_SUBJECT));
				const found = mapelRecords.find((r) => normalizeText(r.nama) === norm);
				if (found) assignedLocalMapelId = found.id;
			} else {
				// fallback: if the assigned id exists in this kelas records, use it
				const foundById = mapelRecords.find((r) => r.id === Number(maybeUser.mataPelajaranId));
				if (foundById) assignedLocalMapelId = foundById.id;
			}
		} catch (err) {
			console.warn(
				'[asesmen-formatif] Failed to resolve assigned mapel for access restriction',
				err
			);
		}
	}

	// Note: do not change assignedIsAgamaVariant here. The special-case for
	// agama variants should only affect which mapel is selected in the UI,
	// but not grant full grading access to all religions.
	if (treatAssignedAgamaVariantAsBase) {
		// keep assignedIsAgamaVariant as detected above
	}

	// Derive human readable agama labels for the assigned agama/PKS variant(s).
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
					// Check both agama and PKS variants
					if (nm.startsWith('pendidikan agama') || nm.startsWith('pendalaman kitab suci')) {
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
			} else if (maybeUser.mataPelajaranId) {
				// Fallback: check legacy single mataPelajaranId
				const assignedRec = await db.query.tableMataPelajaran.findFirst({
					columns: { id: true, nama: true },
					where: eq(tableMataPelajaran.id, Number(maybeUser.mataPelajaranId))
				});
				if (assignedRec && assignedRec.nama) {
					const nm = normalizeText(assignedRec.nama);
					// Check both agama and PKS variants
					if (nm.startsWith('pendidikan agama') || nm.startsWith('pendalaman kitab suci')) {
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
			}
		} catch (err) {
			console.warn('[asesmen-formatif] Failed to resolve assigned agama/PKS variants', err);
		}
	}

	const allowedAgamaForUser =
		allowedAgamaVariants.size > 0 ? Array.from(allowedAgamaVariants)[0] : null;

	let agamaBaseMapel: (typeof mapelRecords)[number] | null = null;
	const agamaVariantRecords: typeof mapelRecords = [];
	let pksBaseMapel: (typeof mapelRecords)[number] | null = null;
	const pksVariantRecords: typeof mapelRecords = [];
	const regularOptions: Array<{ value: string; nama: string }> = [];

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

	const mapelOptions = [...regularOptions];
	// Only show "Pendidikan Agama dan Budi Pekerti" if we have the base mapel OR variant records
	// that actually exist in the kelas (not deleted)
	if (agamaBaseMapel || agamaVariantRecords.length > 0) {
		const exists = mapelOptions.some(
			(option) => normalizeText(option.nama) === normalizeText(AGAMA_BASE_SUBJECT)
		);
		if (!exists) {
			mapelOptions.unshift({ value: AGAMA_MAPEL_VALUE, nama: AGAMA_BASE_SUBJECT });
		}
	}
	// Only show "Pendalaman Kitab Suci" if we have the base mapel OR variant records
	// that actually exist in the kelas (not deleted)
	if (pksBaseMapel || pksVariantRecords.length > 0) {
		const exists = mapelOptions.some(
			(option) => normalizeText(option.nama) === normalizeText(PKS_BASE_SUBJECT)
		);
		if (!exists) {
			mapelOptions.unshift({ value: PKS_MAPEL_VALUE, nama: PKS_BASE_SUBJECT });
		}
	}

	// Build mapelByName to include agama and PKS variants even if they're not in mapelRecords
	// This ensures pickMapelIdForMurid can find the correct mapel ID for students with agama/PKS assignment
	const mapelByName = new Map(mapelRecords.map((record) => [normalizeText(record.nama), record]));

	// Add agama variants to mapelByName if not already present
	for (const record of agamaVariantRecords) {
		const key = normalizeText(record.nama);
		if (!mapelByName.has(key)) {
			mapelByName.set(key, record);
		}
	}

	// Add agama base subject to mapelByName if present
	if (agamaBaseMapel) {
		const key = normalizeText(agamaBaseMapel.nama);
		if (!mapelByName.has(key)) {
			mapelByName.set(key, agamaBaseMapel);
		}
	}

	// Add PKS variants to mapelByName if not already present
	for (const record of pksVariantRecords) {
		const key = normalizeText(record.nama);
		if (!mapelByName.has(key)) {
			mapelByName.set(key, record);
		}
	}

	// Add PKS base subject to mapelByName if present
	if (pksBaseMapel) {
		const key = normalizeText(pksBaseMapel.nama);
		if (!mapelByName.has(key)) {
			mapelByName.set(key, pksBaseMapel);
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

	// If user is locked to a mapel and no explicit query param is provided, default to user's mapel
	if (!selectedMapelValue && maybeUser && maybeUser.type === 'user' && maybeUser.mataPelajaranId) {
		// If the user's assigned mapel is an agama or PKS variant and we have the
		// special rule enabled, default to the parent option instead of the variant id.
		if (treatAssignedAgamaVariantAsBase) {
			// Check if user is assigned to PKS variant, then default to PKS parent
			try {
				const assigned = await db.query.tableMataPelajaran.findFirst({
					columns: { id: true, nama: true },
					where: eq(tableMataPelajaran.id, Number(maybeUser.mataPelajaranId))
				});
				if (assigned && assigned.nama) {
					const norm = normalizeText(assigned.nama);
					if (norm.startsWith('pendalaman kitab suci')) {
						selectedMapelValue = PKS_MAPEL_VALUE;
					} else if (norm.startsWith('pendidikan agama')) {
						selectedMapelValue = AGAMA_MAPEL_VALUE;
					}
				}
			} catch (err) {
				console.warn('[asesmen-formatif] Failed to determine parent mapel value', err);
				// Fallback to agama parent for backward compatibility
				selectedMapelValue = AGAMA_MAPEL_VALUE;
			}
		} else {
			selectedMapelValue = String(maybeUser.mataPelajaranId);
		}
	}
	// If selected mapel value is not in the options list, reset it.
	// Do NOT redirect — the value may come from the user's legacy
	// mataPelajaranId column (not URL), and redirecting would loop.
	if (selectedMapelValue && !mapelOptions.some((option) => option.value === selectedMapelValue)) {
		selectedMapelValue = null;
	}
	if (!selectedMapelValue && mapelOptions.length) {
		selectedMapelValue = mapelOptions[0].value;
	}
	// If user is locked to a mapel and no explicit query param is provided, default to user's mapel
	if (
		(!requestedValue || requestedValue === '') &&
		maybeUser &&
		maybeUser.type === 'user' &&
		maybeUser.mataPelajaranId
	) {
		// Special-case: if assigned to an agama or PKS variant, default to the parent option.
		if (treatAssignedAgamaVariantAsBase) {
			// Check if user is assigned to PKS variant, then default to PKS parent
			try {
				const assigned = await db.query.tableMataPelajaran.findFirst({
					columns: { id: true, nama: true },
					where: eq(tableMataPelajaran.id, Number(maybeUser.mataPelajaranId))
				});
				if (assigned && assigned.nama) {
					const norm = normalizeText(assigned.nama);
					if (norm.startsWith('pendalaman kitab suci')) {
						selectedMapelValue = PKS_MAPEL_VALUE;
					} else if (norm.startsWith('pendidikan agama')) {
						selectedMapelValue = AGAMA_MAPEL_VALUE;
					}
				}
			} catch (err) {
				console.warn('[asesmen-formatif] Failed to determine parent mapel value', err);
				// Fallback to agama parent for backward compatibility
				selectedMapelValue = AGAMA_MAPEL_VALUE;
			}
		} else {
			// try to find a mapel in this kelas with the same name and set it
			try {
				const assigned = await db.query.tableMataPelajaran.findFirst({
					columns: { id: true, nama: true },
					where: eq(tableMataPelajaran.id, Number(maybeUser.mataPelajaranId))
				});
				if (assigned && assigned.nama) {
					const norm = (assigned.nama || '').trim().toLowerCase();
					const found = mapelRecords.find((r) => (r.nama || '').trim().toLowerCase() === norm);
					if (found) selectedMapelValue = String(found.id);
				}
			} catch (err) {
				console.warn('[asesmen-formatif] Failed to default to assigned mapel', err);
			}
		}
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
			: selectedMapelRecord;

	const muridRecords = await db.query.tableMurid.findMany({
		columns: { id: true, nama: true, agama: true },
		where: eq(tableMurid.kelasId, kelasAktif.id),
		orderBy: asc(tableMurid.nama)
	});

	const rawSearch = url.searchParams.get('q')?.trim() ?? '';
	const searchTerm = rawSearch ? rawSearch : null;
	const searchLower = searchTerm ? searchTerm.toLowerCase() : null;
	const filteredMuridRecords = searchLower
		? muridRecords.filter((murid) => murid.nama.toLowerCase().includes(searchLower))
		: muridRecords;

	const totalItems = filteredMuridRecords.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
	const currentPage = Math.min(Math.max(pageNumber, 1), totalPages);
	const offset = (currentPage - 1) * perPage;
	const paginatedMuridRecords = filteredMuridRecords.slice(offset, offset + perPage);

	if (pageNumber !== currentPage) {
		const params = new URLSearchParams(url.searchParams);
		if (currentPage <= 1) {
			params.delete('page');
		} else {
			params.set('page', String(currentPage));
		}
		throw redirect(303, `${url.pathname}${params.size ? `?${params}` : ''}`);
	}

	if (!selectedMapelValue) {
		return {
			meta,
			mapelList: mapelOptions,
			selectedMapelValue: null,
			selectedMapel: null,
			tujuanGroups: [] as Array<{ lingkupMateri: string; totalTujuan: number }>,
			jumlahTujuan: 0,
			daftarMurid: paginatedMuridRecords.map((murid, index) => ({
				id: murid.id,
				nama: murid.nama,
				no: offset + index + 1,
				progressText: null,
				progressSummaryParts: [] as ProgressSummaryPart[],
				hasPenilaian: false,
				nilaiHref: null,
				canNilai: true
			})),
			search: searchTerm,
			page: {
				currentPage,
				totalPages,
				totalItems,
				perPage,
				search: searchTerm
			}
		};
	}

	await ensureAsesmenFormatifSchema();

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

	const tujuanRecords = relevantMapelIds.length
		? await db.query.tableTujuanPembelajaran.findMany({
				columns: { id: true, lingkupMateri: true, mataPelajaranId: true },
				where: inArray(tableTujuanPembelajaran.mataPelajaranId, relevantMapelIds),
				orderBy: [
					asc(tableTujuanPembelajaran.mataPelajaranId),
					asc(tableTujuanPembelajaran.lingkupMateri),
					asc(tableTujuanPembelajaran.id)
				]
			})
		: [];

	const tujuanByMapel = new Map<number, typeof tujuanRecords>();
	const groupedTujuanByMapel = new Map<number, Map<string, typeof tujuanRecords>>();
	for (const tujuan of tujuanRecords) {
		const list = tujuanByMapel.get(tujuan.mataPelajaranId);
		if (list) {
			list.push(tujuan);
		} else {
			tujuanByMapel.set(tujuan.mataPelajaranId, [tujuan]);
		}
		const lingkup = tujuan.lingkupMateri?.trim() || DEFAULT_LINGKUP;
		let map = groupedTujuanByMapel.get(tujuan.mataPelajaranId);
		if (!map) {
			map = new Map();
			groupedTujuanByMapel.set(tujuan.mataPelajaranId, map);
		}
		const groupList = map.get(lingkup);
		if (groupList) {
			groupList.push(tujuan);
		} else {
			map.set(lingkup, [tujuan]);
		}
	}

	const tujuanIds = tujuanRecords.map((record) => record.id);
	const muridIds = filteredMuridRecords.map((murid) => murid.id);

	const asesmenRecords =
		relevantMapelIds.length && tujuanIds.length && muridIds.length
			? await db.query.tableAsesmenFormatif.findMany({
					columns: {
						muridId: true,
						mataPelajaranId: true,
						tujuanPembelajaranId: true,
						tuntas: true
					},
					where: and(
						inArray(tableAsesmenFormatif.mataPelajaranId, relevantMapelIds),
						inArray(tableAsesmenFormatif.muridId, muridIds),
						inArray(tableAsesmenFormatif.tujuanPembelajaranId, tujuanIds)
					)
				})
			: [];

	const asesmenByMurid = new Map<number, Map<number, boolean>>();
	for (const record of asesmenRecords) {
		let muridMap = asesmenByMurid.get(record.muridId);
		if (!muridMap) {
			muridMap = new Map();
			asesmenByMurid.set(record.muridId, muridMap);
		}
		muridMap.set(record.tujuanPembelajaranId, Boolean(record.tuntas));
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
			if (agamaBaseMapel) {
				return agamaBaseMapel.id;
			}
			return agamaVariantRecords[0]?.id ?? null;
		}
		if (isPksSelected) {
			const variantName = resolvePksVariantName(muridAgama);
			if (variantName) {
				const variantRecord = mapelByName.get(normalizeText(variantName));
				if (variantRecord) {
					return variantRecord.id;
				}
			}
			if (pksBaseMapel) {
				return pksBaseMapel.id;
			}
			return pksVariantRecords[0]?.id ?? null;
		}
		return selectedMapelRecord?.id ?? null;
	};

	const daftarMurid = paginatedMuridRecords.map((murid, index) => {
		const targetMapelId = pickMapelIdForMurid(murid.agama);
		const asesmen = asesmenByMurid.get(murid.id) ?? new Map();
		const tujuanList = targetMapelId ? (tujuanByMapel.get(targetMapelId) ?? []) : [];
		const groupedTujuan = targetMapelId
			? (groupedTujuanByMapel.get(targetMapelId) ?? new Map<string, typeof tujuanRecords>())
			: new Map<string, typeof tujuanRecords>();
		const parts: ProgressSummaryPart[] = [];

		for (const [lingkupMateri, tujuan] of groupedTujuan.entries()) {
			const totalTujuan = tujuan.length;
			const tuntas = tujuan.reduce((count, item) => count + (asesmen.get(item.id) ? 1 : 0), 0);
			const kategori = resolveCategory(tuntas, totalTujuan);
			parts.push({
				kategori,
				kategoriLabel: CATEGORY_LABEL[kategori],
				lingkupMateri,
				tuntas,
				totalTujuan
			});
		}

		const hasPenilaian = tujuanList.some((tujuan) => asesmen.has(tujuan.id));
		let progressText: string | null = null;
		let progressSummaryParts = parts.filter((part) => part.totalTujuan > 0);

		if (!targetMapelId) {
			progressText = `Mata pelajaran agama untuk agama ${murid.agama ?? 'tidak diketahui'} belum tersedia.`;
			progressSummaryParts = [];
		} else if (!tujuanList.length) {
			progressText = 'Belum ada tujuan pembelajaran pada mata pelajaran ini.';
			progressSummaryParts = [];
		} else if (!hasPenilaian) {
			progressText = 'Belum ada nilai.';
			progressSummaryParts = [];
		} else if (!progressSummaryParts.length) {
			progressText = 'Belum ada nilai.';
		}

		if (!progressText && progressSummaryParts.length) {
			progressText = buildSummarySentence(progressSummaryParts) ?? 'Belum ada nilai.';
		}

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

			// If PKS is selected and user has assigned agama variants, restrict by agama (PKS follows same logic)
			if (isPksSelected && allowedAgamaVariants.size > 0) {
				const muridVariant = resolvePksVariantName(murid.agama);
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

				// Allow access only if murid's agama is in user's assigned PKS variants
				const allowed = muridAgamaDisplay && allowedAgamaVariants.has(muridAgamaDisplay);

				return allowed ?? false;
			}

			// For non-agama and non-PKS mapel, check standard assignment
			if (!assignedIsAgamaVariant) return true;
			if (!assignedLocalMapelId) return false;
			return targetMapelId === assignedLocalMapelId;
		})();

		return {
			id: murid.id,
			nama: murid.nama,
			no: offset + index + 1,
			progressText,
			progressSummaryParts,
			hasPenilaian,
			nilaiHref:
				targetMapelId && canAccess
					? `/asesmen-formatif/formulir-asesmen?murid_id=${murid.id}&mapel_id=${targetMapelId}`
					: null,
			canNilai: Boolean(canAccess)
		};
	});

	const tujuanGroups =
		!isAgamaSelected && !isPksSelected && selectedMapelRecord
			? Array.from(
					(groupedTujuanByMapel.get(selectedMapelRecord.id) ?? new Map()).entries(),
					([lingkupMateri, tujuan]) => ({
						lingkupMateri,
						totalTujuan: tujuan.length
					})
				)
			: [];

	const jumlahTujuan =
		!isAgamaSelected && !isPksSelected && selectedMapelRecord
			? (tujuanByMapel.get(selectedMapelRecord.id)?.length ?? 0)
			: 0;

	return {
		meta,
		mapelList: mapelOptions,
		selectedMapelValue,
		selectedMapel,
		tujuanGroups,
		jumlahTujuan,
		daftarMurid,
		allowedAgamaForUser,
		search: searchTerm,
		page: {
			currentPage,
			totalPages,
			totalItems,
			perPage,
			search: searchTerm
		}
	};
}
