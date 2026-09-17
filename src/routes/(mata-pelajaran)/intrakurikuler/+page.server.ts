import db from '$lib/server/db';
import { normMapelName, pilihIndukPembelajaran } from '$lib/server/dapodik';
import { ensureAgamaMapelForClasses } from '$lib/server/mapel-agama';
import { getAksesMapelUser, needsMapelFilter } from '$lib/server/mapel-access';
import { isWaliOfKelas } from '$lib/server/kelas-akses';
import {
	tableMataPelajaran,
	tableTujuanPembelajaran,
	tableKelas,
	tableAuthUserMataPelajaran,
	tableDapodikPembelajaran
} from '$lib/server/db/schema';
import { agamaVariantNames, pksVariantNames } from '$lib/statics';
import { and, eq, inArray } from 'drizzle-orm';

type MataPelajaranBase = Omit<MataPelajaran, 'tujuanPembelajaran'>;
type MataPelajaranWithTp = MataPelajaranBase & {
	tpCount: number;
	editTpMapelId?: number;
	/** Keterangan posisi Dapodik: "Mapel Induk" / "Sub-mapel induk: X". Null bila tak ada data Dapodik. */
	keteranganDapodik?: string | null;
};

const AGAMA_VARIANT_NAME_SET = new Set<string>(agamaVariantNames);
const PKS_VARIANT_NAME_SET = new Set<string>(pksVariantNames);
const AGAMA_PARENT_NAME = 'Pendidikan Agama dan Budi Pekerti';
const PKS_PARENT_NAME = 'Pendalaman Kitab Suci';

async function canManageImportUrutan(
	user: { type?: string; pegawaiId?: number | null } | null,
	kelasId: number | null
): Promise<boolean> {
	if (!user) return false;
	if (user.type === 'admin' || user.type === 'kepala_sekolah') return true;
	if (user.type !== 'wali_kelas') return false;
	// Wali kelas hanya boleh menambah/import/urutan mapel di kelas miliknya.
	if (kelasId == null) return false;
	return isWaliOfKelas(user, kelasId);
}

type MapelRow = { id: number; nama: string | null };

/** Kembalikan [induk, ...varian] — induk SELALU elemen pertama (urutan `rows` DB tak tentu). */
function mapelGroupSiblings(
	rows: MapelRow[],
	parentName: string,
	variantSet: Set<string>
): MapelRow[] {
	const parent = rows.find((r) => r.nama === parentName);
	if (!parent) return [];
	const variants = rows.filter(
		(r) => r.nama !== parentName && r.nama !== null && variantSet.has(r.nama)
	);
	return [parent, ...variants];
}

/**
 * Samakan urutan varian tersembunyi (agama & PKS) dengan induknya. Posisi induk
 * dibaca dari `idList` (urutan = index + 1 — yang baru saja dialokasikan),
 * bukan dibaca ulang dari DB di dalam transaksi.
 */
async function assignSiblingUrutan(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	group: MapelRow[],
	idList: number[]
) {
	if (!group.length) return;
	const parentIdx = idList.indexOf(group[0].id);
	if (parentIdx === -1) return;
	const variantIds = group.slice(1).map((g) => g.id);
	if (variantIds.length) {
		await tx
			.update(tableMataPelajaran)
			.set({ urutan: parentIdx + 1 })
			.where(inArray(tableMataPelajaran.id, variantIds));
	}
}

// Urutan tampil jenis mapel pada tabel gabungan (belum dipetakan paling atas
// agar segera terlihat dan dipetakan admin).
const JENIS_URUTAN = [
	'belum_dipetakan',
	'wajib',
	'pilihan',
	'kejuruan',
	'pemberdayaan',
	'mulok'
] as const;

export async function load({ depends, url, parent }) {
	depends('app:mapel');
	const { kelasAktif, daftarKelas, user } = await parent();
	const daftarKelasEntries = daftarKelas as Array<{ id: number }> | undefined;
	const kelasIdsForEnsure = daftarKelasEntries?.map((kelas) => kelas.id) ?? [];
	await ensureAgamaMapelForClasses(kelasIdsForEnsure);
	// PKS tidak lagi otomatis ditambahkan, pengguna harus menambahkannya secara manual via tombol "Tambah PKS"
	// await ensurePksMapelForClasses(kelasIdsForEnsure);
	const fromQuery = url.searchParams.get('kelas_id');
	const kelasCandidate = fromQuery ? Number(fromQuery) : (kelasAktif?.id ?? null);
	const kelasId =
		kelasCandidate != null && daftarKelasEntries?.some((kelas) => kelas.id === kelasCandidate)
			? kelasCandidate
			: null;

	let mapel = kelasId
		? await db.query.tableMataPelajaran.findMany({
				where: eq(tableMataPelajaran.kelasId, kelasId)
			})
		: [];

	// If the current user is a 'user' role OR a 'wali_kelas' accessing a non-owned kelas,
	// filter to show only assigned mata pelajaran (ID, nama lintas kelas,
	// keluarga agama/PKS, dan sub pembelajaran induknya).
	const u = user as unknown as {
		id?: number;
		type?: string;
		mataPelajaranId?: number;
		kelasId?: number | null;
	};
	if (needsMapelFilter(u, kelasId)) {
		if (u.id) {
			try {
				const akses = await getAksesMapelUser(
					{ id: u.id, mataPelajaranId: u.mataPelajaranId },
					kelasId
				);
				mapel = mapel.filter(
					(m) => akses.ids.has(m.id) || akses.names.has((m.nama || '').trim().toLowerCase())
				);
			} catch (err) {
				// on error, don't block page — fallback to existing mapel list
				console.warn('[intrakurikuler] Failed to resolve assigned mapel', err);
			}
		}
	}

	const tpCountByMapelId = new Map<number, number>();
	if (mapel.length > 0) {
		const mapelIds = mapel.map((item) => item.id);
		const tujuanList = await db.query.tableTujuanPembelajaran.findMany({
			columns: { mataPelajaranId: true },
			where: inArray(tableTujuanPembelajaran.mataPelajaranId, mapelIds)
		});
		for (const entry of tujuanList) {
			const current = tpCountByMapelId.get(entry.mataPelajaranId) ?? 0;
			tpCountByMapelId.set(entry.mataPelajaranId, current + 1);
		}
	}

	// Build a map of agama parent ID to first variant ID for users with assigned agama
	// This ensures Edit TP link goes to the correct variant, not the parent
	const agamaParentToVariantMap = new Map<number, number>();
	const agamaVariantInKelas = mapel.filter((item) => AGAMA_VARIANT_NAME_SET.has(item.nama));
	const agamaParentInKelas = mapel.find(
		(item) => item.nama?.trim().toLowerCase() === AGAMA_PARENT_NAME.toLowerCase()
	);
	if (agamaParentInKelas && agamaVariantInKelas.length > 0) {
		// Map parent ID to the user's assigned variant, or first variant if no specific assignment
		let targetVariantId = agamaVariantInKelas[0].id;

		// Try to find user's assigned agama variant
		if (user && (user as unknown as { id?: number; type?: string }).type === 'user') {
			const userId = (user as unknown as { id?: number }).id;
			if (userId) {
				try {
					const assignedMapels = await db.query.tableAuthUserMataPelajaran.findMany({
						columns: { mataPelajaranId: true },
						where: eq(tableAuthUserMataPelajaran.authUserId, userId)
					});
					if (assignedMapels.length > 0) {
						const assignedRecords = await db.query.tableMataPelajaran.findMany({
							columns: { id: true, nama: true },
							where: inArray(
								tableMataPelajaran.id,
								assignedMapels.map((m) => m.mataPelajaranId)
							)
						});
						// Find first assigned variant in this kelas
						for (const record of assignedRecords) {
							const norm = (record.nama || '').trim().toLowerCase();
							if (
								norm.startsWith('pendidikan agama') &&
								!norm.includes(AGAMA_PARENT_NAME.toLowerCase())
							) {
								const foundInKelas = agamaVariantInKelas.find((v) => v.id === record.id);
								if (foundInKelas) {
									targetVariantId = foundInKelas.id;
									break;
								}
							}
						}
					}
				} catch (err) {
					console.warn('[intrakurikuler] Failed to resolve assigned agama variant', err);
				}
			}
		}

		agamaParentToVariantMap.set(agamaParentInKelas.id, targetVariantId);
	}

	// Build a map of PKS parent ID to first variant ID for users with assigned PKS
	const pksParentToVariantMap = new Map<number, number>();
	const pksVariantInKelas = mapel.filter((item) => PKS_VARIANT_NAME_SET.has(item.nama));
	const pksParentInKelas = mapel.find(
		(item) => item.nama?.trim().toLowerCase() === PKS_PARENT_NAME.toLowerCase()
	);
	if (pksParentInKelas && pksVariantInKelas.length > 0) {
		// Map parent ID to the user's assigned variant, or first variant if no specific assignment
		let targetVariantId = pksVariantInKelas[0].id;

		// Try to find user's assigned PKS variant
		if (user && (user as unknown as { id?: number; type?: string }).type === 'user') {
			const userId = (user as unknown as { id?: number }).id;
			if (userId) {
				try {
					const assignedMapels = await db.query.tableAuthUserMataPelajaran.findMany({
						columns: { mataPelajaranId: true },
						where: eq(tableAuthUserMataPelajaran.authUserId, userId)
					});
					if (assignedMapels.length > 0) {
						const assignedRecords = await db.query.tableMataPelajaran.findMany({
							columns: { id: true, nama: true },
							where: inArray(
								tableMataPelajaran.id,
								assignedMapels.map((m) => m.mataPelajaranId)
							)
						});
						// Find first assigned PKS variant in this kelas
						for (const record of assignedRecords) {
							const norm = (record.nama || '').trim().toLowerCase();
							if (
								norm.startsWith('pendalaman kitab suci') &&
								!norm.includes(PKS_PARENT_NAME.toLowerCase())
							) {
								const foundInKelas = pksVariantInKelas.find((v) => v.id === record.id);
								if (foundInKelas) {
									targetVariantId = foundInKelas.id;
									break;
								}
							}
						}
					}
				} catch (err) {
					console.warn('[intrakurikuler] Failed to resolve assigned PKS variant', err);
				}
			}
		}

		pksParentToVariantMap.set(pksParentInKelas.id, targetVariantId);
	}

	const mapelWithIndicator: MataPelajaranWithTp[] = mapel.map((item) => ({
		...item,
		tpCount: tpCountByMapelId.get(item.id) ?? 0,
		// If this is an agama parent and user has assigned variant, use variant ID for Edit TP link
		// Same logic applies for PKS parent
		editTpMapelId: agamaParentToVariantMap.has(item.id)
			? agamaParentToVariantMap.get(item.id)
			: pksParentToVariantMap.has(item.id)
				? pksParentToVariantMap.get(item.id)
				: item.id
	}));

	// Keterangan posisi Dapodik per mapel (kolom mata pelajaran):
	// terdaftar sebagai pembelajaran → "Mapel Induk"; selain itu → sub dengan induknya.
	const indukMirrorRows = kelasId
		? await db
				.select({
					nama: tableDapodikPembelajaran.nama,
					pembelajaranId: tableDapodikPembelajaran.pembelajaranId
				})
				.from(tableDapodikPembelajaran)
				.where(eq(tableDapodikPembelajaran.kelasId, kelasId))
		: [];
	const defaultIndukNama = pilihIndukPembelajaran(indukMirrorRows)?.nama ?? null;
	for (const item of mapelWithIndicator) {
		if (indukMirrorRows.length === 0) {
			item.keteranganDapodik = null;
			continue;
		}
		const terdaftar = indukMirrorRows.some(
			(r) => r.nama === item.nama || normMapelName(r.nama) === normMapelName(item.nama)
		);
		if (terdaftar) {
			item.keteranganDapodik = 'Mapel Induk';
			continue;
		}
		const eksplisitNama = item.dapodikIndukPembelajaranId
			? indukMirrorRows.find((r) => r.pembelajaranId === item.dapodikIndukPembelajaranId)?.nama
			: null;
		const indukNama = eksplisitNama ?? defaultIndukNama;
		item.keteranganDapodik = indukNama ? `Sub - ${indukNama}` : null;
	}

	const mapelTampil = mapelWithIndicator.filter(
		(item) => !AGAMA_VARIANT_NAME_SET.has(item.nama) && !PKS_VARIANT_NAME_SET.has(item.nama)
	);

	const jenisIndex = (jenis: string | null | undefined) => {
		const idx = JENIS_URUTAN.indexOf((jenis ?? 'wajib') as (typeof JENIS_URUTAN)[number]);
		return idx === -1 ? JENIS_URUTAN.length : idx;
	};
	// Urutan manual (kolom `urutan`) menang; mapel tanpa nomor jatuh ke urutan lama (jenis → nama).
	const daftarMapel = [...mapelTampil].sort((a, b) => {
		const ua = a.urutan ?? Number.POSITIVE_INFINITY;
		const ub = b.urutan ?? Number.POSITIVE_INFINITY;
		if (ua !== ub) return ua - ub;
		return (
			jenisIndex(a.jenis) - jenisIndex(b.jenis) || (a.nama ?? '').localeCompare(b.nama ?? '', 'id')
		);
	});

	const [referensiDapodik, pembelajaranDapodik] = await Promise.all([
		db.query.tableDapodikMataPelajaran.findFirst({ columns: { mataPelajaranId: true } }),
		db.query.tableDapodikPembelajaran.findFirst({ columns: { id: true } })
	]);
	const adaDataDapodik = Boolean(referensiDapodik || pembelajaranDapodik);

	return {
		kelasId,
		mapel: { daftarMapel },
		adaDataDapodik
	};
}

import { readBufferToAoA, writeAoaToBuffer } from '$lib/utils/excel.js';
import { fail } from '@sveltejs/kit';
import { asc } from 'drizzle-orm';
import { cookieNames } from '$lib/utils';

const MAX_IMPORT_FILE_SIZE_MAPEL = 2 * 1024 * 1024; // 2MB

function normalizeCell(value: unknown) {
	if (value == null) return '';
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number') return value.toString().trim();
	return String(value).trim();
}

function isXlsxMime(type: string | null | undefined) {
	if (!type) return false;
	return type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

export const actions = {
	async import_mapel({ request, cookies, locals }) {
		const user = locals.user as { type?: string; pegawaiId?: number | null } | null;

		const kelasIdCookie = cookies.get(cookieNames.ACTIVE_KELAS_ID) || null;
		const kelasId = kelasIdCookie ? Number(kelasIdCookie) : null;
		if (!kelasId || !Number.isFinite(kelasId)) {
			return fail(400, { fail: 'Pilih kelas aktif terlebih dahulu.' });
		}

		if (!(await canManageImportUrutan(user, kelasId))) {
			return fail(403, { fail: 'Anda tidak memiliki akses untuk mengimpor mata pelajaran.' });
		}

		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Pilih sekolah aktif terlebih dahulu.' });

		const formData = await request.formData();
		const file = formData.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { fail: 'File Excel belum dipilih.' });
		}

		if (file.size > MAX_IMPORT_FILE_SIZE_MAPEL) {
			return fail(400, { fail: 'Ukuran file melebihi 2MB.' });
		}

		const filename = (file.name ?? '').toLowerCase();
		if (!filename.endsWith('.xlsx') && !isXlsxMime(file.type)) {
			return fail(400, { fail: 'Format file harus .xlsx.' });
		}

		let rawRows;
		try {
			const buffer = Buffer.from(await file.arrayBuffer());
			rawRows = await readBufferToAoA(buffer);
		} catch (error) {
			console.error('Gagal membaca file Excel', error);
			return fail(400, { fail: 'Gagal membaca file Excel. Pastikan format sesuai.' });
		}

		if (!Array.isArray(rawRows) || rawRows.length === 0) {
			return fail(400, { fail: 'File Excel tidak berisi data.' });
		}

		// Identify header columns by name (robust against different column orders)
		// find header row index first (row that contains Mata Pelajaran, Lingkup, Tujuan)
		const headerIndex = rawRows.findIndex((row) => {
			const cols = (row ?? []).map((c) => normalizeCell(c).toLowerCase());
			return (
				cols.some((c) => c.includes('mata pelajaran') || c === 'mapel' || c === 'mata pelajaran') &&
				cols.some((c) => c.includes('lingkup')) &&
				cols.some((c) => c.includes('tujuan'))
			);
		});

		const headerRow = rawRows[headerIndex] ?? [];
		const normalizedHeaderCols = (headerRow ?? []).map((c) => normalizeCell(c).toLowerCase());

		const findColIndex = (names: string[]) =>
			normalizedHeaderCols.findIndex((h) => names.some((n) => h.includes(n)));

		const idxMapel = findColIndex(['mata pelajaran', 'mapel']);
		const idxKode = findColIndex(['kode']);
		const idxJenis = findColIndex(['jenis']);
		const idxKkm = findColIndex(['kkm']);
		const idxLingkup = findColIndex(['lingkup']);
		const idxTujuan = findColIndex(['tujuan']);

		if (idxMapel === -1 || idxLingkup === -1 || idxTujuan === -1) {
			return fail(400, {
				fail: 'Template tidak valid. Pastikan kolom Mata Pelajaran, Lingkup Materi, dan Tujuan Pembelajaran tersedia.'
			});
		}

		const dataRows = rawRows.slice(headerIndex + 1).filter(Boolean);
		if (!dataRows.length) return fail(400, { fail: 'Tidak ada data pada file.' });

		type ParsedEntry = { lingkup: string; deskripsi: string };
		type ParsedMapel = {
			kode?: string;
			jenis?: string;
			kkm?: number | null;
			entries: ParsedEntry[];
		};

		const parsed = new Map<string, ParsedMapel>();
		let currentMapel = '';
		let currentKode = '';
		let currentJenis = '';
		let currentKkmRaw = '';
		let currentLingkup = '';

		for (const row of dataRows as (string | number | null | undefined)[][]) {
			const get = (i: number) => normalizeCell(row?.[i] ?? '');

			const colMapel = get(idxMapel);
			const colKode = idxKode >= 0 ? get(idxKode) : '';
			const colJenis = idxJenis >= 0 ? get(idxJenis) : '';
			const colKkm = idxKkm >= 0 ? get(idxKkm) : '';
			const colLingkup = get(idxLingkup);
			const colTujuan = get(idxTujuan);

			if (colMapel) {
				currentMapel = colMapel;
				currentKode = '';
				currentJenis = '';
				currentKkmRaw = '';
				currentLingkup = '';
			}
			if (!currentMapel) continue; // skip until first mapel

			if (colKode) currentKode = colKode;
			if (colJenis) currentJenis = colJenis;
			if (colKkm) currentKkmRaw = colKkm;
			if (colLingkup) currentLingkup = colLingkup;
			if (!colTujuan) continue; // no tujuan

			const key = currentMapel;
			let entry = parsed.get(key);
			if (!entry) {
				const parsedKkm = currentKkmRaw
					? Number.isFinite(Number(currentKkmRaw))
						? Number(currentKkmRaw)
						: null
					: undefined;
				entry = {
					kode: currentKode || undefined,
					jenis: currentJenis || undefined,
					kkm: parsedKkm ?? undefined,
					entries: []
				};
				parsed.set(key, entry);
			} else {
				if (currentKode) entry.kode = currentKode;
				if (currentJenis) entry.jenis = currentJenis;
				if (currentKkmRaw) {
					const parsedKkm = Number.isFinite(Number(currentKkmRaw)) ? Number(currentKkmRaw) : null;
					if (parsedKkm !== null) entry.kkm = parsedKkm;
				}
			}

			entry.entries.push({ lingkup: currentLingkup, deskripsi: colTujuan });
		}

		if (parsed.size === 0)
			return fail(400, { fail: 'Tidak ada tujuan pembelajaran yang ditemukan.' });

		// Persist into DB: create new mapel when not found, otherwise insert tujuan pembelajaran
		// for existing mapel. Avoid duplicate TP entries. Also update existing mapel's jenis/kkm if provided.
		let insertedMapel = 0;
		let updatedMapel = 0;
		let insertedTp = 0;
		let skippedTp = 0;

		await db.transaction(async (tx) => {
			// fetch existing mapel for kelas (case-insensitive matching will be done in JS)
			const existingMapel = await tx.query.tableMataPelajaran.findMany({
				where: eq(tableMataPelajaran.kelasId, kelasId)
			});

			const mapelByName = new Map<string, number>();
			for (const m of existingMapel) {
				const nameLower = (m.nama ?? '').toLowerCase();
				// Jika sudah ada mapel dengan nama sama, gunakan yang ID-nya lebih kecil (lebih dulu dibuat)
				// dan log peringatan tentang duplikat
				if (mapelByName.has(nameLower)) {
					const existingId = mapelByName.get(nameLower)!;
					console.warn(
						`[DUPLIKAT] Mata pelajaran "${m.nama}" memiliki lebih dari satu ID di kelas ${kelasId}: ID ${existingId} dan ID ${m.id}. Menggunakan ID ${existingId}.`
					);
					continue; // Skip, gunakan ID yang sudah ada (yang lebih dulu)
				}
				mapelByName.set(nameLower, m.id);
			}

			// Mapel baru selalu diletakkan di nomor urut paling bawah.
			let nextUrutan = Math.max(0, ...existingMapel.map((m) => m.urutan ?? 0)) + 1;

			for (const [mapelName, meta] of parsed.entries()) {
				const lower = mapelName.toLowerCase();
				let mapelId = mapelByName.get(lower) ?? null;
				if (!mapelId) {
					// create the mapel automatically using provided jenis/kkm if available
					const insertValues = {
						nama: mapelName,
						jenis: (meta.jenis as MataPelajaran['jenis']) ?? 'wajib',
						kkm: typeof meta.kkm === 'number' ? meta.kkm : 0,
						kelasId,
						urutan: nextUrutan++,
						kode:
							meta.kode ??
							((mapelName || '').toLowerCase().startsWith('pendidikan agama') ? 'PAPB' : null)
					};
					const insertRes = await tx
						.insert(tableMataPelajaran)
						.values(insertValues)
						.returning({ id: tableMataPelajaran.id });
					mapelId = insertRes?.[0]?.id ?? null;
					if (mapelId) {
						insertedMapel += 1;
						mapelByName.set(lower, mapelId);
					}
				} else {
					// update existing mapel jika ada meta baru berbeda
					const updates: Record<string, unknown> = {};
					if (meta.jenis && meta.jenis !== undefined) updates.jenis = meta.jenis;
					if (typeof meta.kkm === 'number') updates.kkm = meta.kkm;
					if (meta.kode && meta.kode !== undefined) updates.kode = meta.kode;
					if (Object.keys(updates).length > 0) {
						await tx
							.update(tableMataPelajaran)
							.set(updates)
							.where(eq(tableMataPelajaran.id, mapelId));
						updatedMapel += 1;
					}
				}
				if (!mapelId) continue; // defensive

				// fetch existing tujuan for this mapel
				const existingTp = await tx.query.tableTujuanPembelajaran.findMany({
					columns: { lingkupMateri: true, deskripsi: true },
					where: eq(tableTujuanPembelajaran.mataPelajaranId, mapelId)
				});
				const existingKeys = new Set(
					existingTp.map(
						(t) =>
							`${normalizeCell(t.lingkupMateri).toLowerCase()}::${normalizeCell(t.deskripsi).toLowerCase()}`
					)
				);

				const toInsertTp: Array<{
					lingkupMateri: string;
					deskripsi: string;
					mataPelajaranId: number;
				}> = [];
				for (const entry of meta.entries) {
					const key = `${normalizeCell(entry.lingkup).toLowerCase()}::${normalizeCell(entry.deskripsi).toLowerCase()}`;
					if (existingKeys.has(key)) {
						skippedTp += 1;
						continue;
					}
					existingKeys.add(key);
					toInsertTp.push({
						lingkupMateri: entry.lingkup,
						deskripsi: entry.deskripsi,
						mataPelajaranId: mapelId
					});
				}

				if (toInsertTp.length) {
					await tx.insert(tableTujuanPembelajaran).values(toInsertTp);
					insertedTp += toInsertTp.length;
				}
			}
		});

		const parts = [
			`Impor selesai: ${insertedMapel} mapel baru, ${updatedMapel} mapel diperbarui, ${insertedTp} tujuan pembelajaran ditambahkan.`
		];
		if (skippedTp > 0) parts.push(`${skippedTp} entri diabaikan karena sudah ada.`);
		return { message: parts.join(' ') };
	},

	async export_mapel({ cookies }) {
		const kelasIdCookie = cookies.get('active_kelas_id') || cookies.get('ACTIVE_KELAS_ID') || null;
		const kelasId = kelasIdCookie ? Number(kelasIdCookie) : null;
		if (!kelasId || !Number.isFinite(kelasId)) {
			return fail(400, { fail: 'Pilih kelas aktif terlebih dahulu.' });
		}

		// fetch mapel and their tujuan
		const mapelRows = await db.query.tableMataPelajaran.findMany({
			where: eq(tableMataPelajaran.kelasId, kelasId),
			orderBy: [asc(tableMataPelajaran.jenis), asc(tableMataPelajaran.nama)]
		});

		const tpRows = await db.query.tableTujuanPembelajaran.findMany({
			where: inArray(
				tableTujuanPembelajaran.mataPelajaranId,
				mapelRows.map((m) => m.id)
			),
			orderBy: [asc(tableTujuanPembelajaran.mataPelajaranId), asc(tableTujuanPembelajaran.id)]
		});

		// Build workbook with one sheet grouped by Mata Pelajaran -> Kode -> Jenis -> KKM -> Lingkup -> Tujuan
		const header = [
			'Mata Pelajaran',
			'Kode',
			'Jenis',
			'KKM',
			'Lingkup Materi',
			'Tujuan Pembelajaran'
		];

		// group tujuan by mapel and lingkup preserving order
		const mapelOrder = mapelRows.map((m) => ({
			id: m.id,
			nama: m.nama,
			kode: m.kode ?? '',
			jenis: m.jenis ?? '',
			kkm: typeof m.kkm === 'number' ? String(m.kkm) : ''
		}));
		const tpByMapel = new Map<number, Array<{ lingkup: string; deskripsi: string }>>();
		for (const tp of tpRows) {
			const list = tpByMapel.get(tp.mataPelajaranId) ?? [];
			list.push({ lingkup: tp.lingkupMateri ?? '', deskripsi: tp.deskripsi ?? '' });
			tpByMapel.set(tp.mataPelajaranId, list);
		}

		const rows: Array<Array<string>> = [header];
		for (const m of mapelOrder) {
			const entries = tpByMapel.get(m.id) ?? [];
			if (entries.length === 0) {
				rows.push([m.nama, m.kode || '', m.jenis || '', m.kkm || '', '', '']);
				continue;
			}
			// First entry includes mapel name + meta
			let first = true;
			let lastLingkup = '';
			for (const e of entries) {
				if (first) {
					rows.push([
						m.nama,
						m.kode || '',
						m.jenis || '',
						m.kkm || '',
						e.lingkup || '',
						e.deskripsi || ''
					]);
					first = false;
					lastLingkup = e.lingkup || '';
					continue;
				}
				// Subsequent rows: blank mapel/meta cells, include lingkup only if different
				const mapelCell = '';
				const kodeCell = '';
				const jenisCell = '';
				const kkmCell = '';
				const lingkupCell = e.lingkup && e.lingkup !== lastLingkup ? e.lingkup : '';
				rows.push([mapelCell, kodeCell, jenisCell, kkmCell, lingkupCell, e.deskripsi || '']);
				lastLingkup = e.lingkup || lastLingkup;
			}
		}

		const buffer = await writeAoaToBuffer(rows);

		// try to include kelas name in filename (sanitize whitespace and dangerous chars)
		let kelasLabel = `kelas-${kelasId}`;
		try {
			const kelasRow = await db.query.tableKelas.findFirst({
				columns: { nama: true },
				where: eq(tableKelas.id, kelasId)
			});
			if (kelasRow?.nama) kelasLabel = kelasRow.nama;
		} catch {
			// ignore and fallback to kelasId
		}
		// compact label: remove dangerous chars and remove spaces so filename becomes mapel-KelasV.xlsx
		const safeLabel = kelasLabel
			.replace(/[\\/:*?"<>|]+/g, '')
			.replace(/\s+/g, '')
			.trim();
		const filename = `mapel-${safeLabel}.xlsx`;

		return new Response(Buffer.from(buffer), {
			status: 200,
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="${filename}"`
			}
		});
	},

	async simpan_urutan({ request, cookies, locals }) {
		const user = locals.user as { type?: string; pegawaiId?: number | null } | null;

		const kelasIdCookie = cookies.get(cookieNames.ACTIVE_KELAS_ID) || null;
		const kelasId = kelasIdCookie ? Number(kelasIdCookie) : null;
		if (!kelasId || !Number.isFinite(kelasId)) {
			return fail(400, { fail: 'Pilih kelas aktif terlebih dahulu.' });
		}

		if (!(await canManageImportUrutan(user, kelasId))) {
			return fail(403, { fail: 'Anda tidak memiliki akses untuk mengubah urutan.' });
		}

		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Pilih sekolah aktif terlebih dahulu.' });

		const formData = await request.formData();
		let ids: unknown;
		try {
			ids = JSON.parse(String(formData.get('urutan') ?? ''));
		} catch {
			return fail(400, { fail: 'Data urutan tidak valid.' });
		}
		if (!Array.isArray(ids) || !ids.every((id) => Number.isFinite(Number(id)))) {
			return fail(400, { fail: 'Data urutan tidak valid.' });
		}

		// Pastikan kelas milik sekolah aktif (cookie bisa dimanipulasi klien).
		const kelas = await db.query.tableKelas.findFirst({
			columns: { id: true },
			where: and(eq(tableKelas.id, kelasId), eq(tableKelas.sekolahId, sekolahId))
		});
		if (!kelas) return fail(404, { fail: 'Kelas tidak ditemukan.' });

		const existing = await db.query.tableMataPelajaran.findMany({
			columns: { id: true, nama: true },
			where: eq(tableMataPelajaran.kelasId, kelasId)
		});
		const knownIds = new Set(existing.map((m) => m.id));
		// Buang ID asing di luar kelas ini; mapel yang tidak ikut di-drag tetap diberi urutan di belakang.
		const idList = [...new Set(ids.map(Number))].filter((id) => knownIds.has(id));
		for (const m of existing) if (!idList.includes(m.id)) idList.push(m.id);

		const agamaGroup = mapelGroupSiblings(existing, AGAMA_PARENT_NAME, AGAMA_VARIANT_NAME_SET);
		const pksGroup = mapelGroupSiblings(existing, PKS_PARENT_NAME, PKS_VARIANT_NAME_SET);

		await db.transaction(async (tx) => {
			for (let i = 0; i < idList.length; i++) {
				await tx
					.update(tableMataPelajaran)
					.set({ urutan: i + 1 })
					.where(eq(tableMataPelajaran.id, idList[i]));
			}

			// Varian tersembunyi ikut nomor urut induknya (agama & PKS).
			await assignSiblingUrutan(tx, agamaGroup, idList);
			await assignSiblingUrutan(tx, pksGroup, idList);
		});

		return { success: 'Urutan mata pelajaran berhasil disimpan.' };
	},

	async tambah_pks({ cookies, locals }) {
		const user = locals.user as { type?: string; pegawaiId?: number | null } | null;

		const kelasIdCookie = cookies.get(cookieNames.ACTIVE_KELAS_ID) || null;
		const kelasId = kelasIdCookie ? Number(kelasIdCookie) : null;
		if (!kelasId || !Number.isFinite(kelasId)) {
			return fail(400, { fail: 'Pilih kelas aktif terlebih dahulu.' });
		}

		if (!(await canManageImportUrutan(user, kelasId))) {
			return fail(403, { fail: 'Anda tidak memiliki akses untuk menambahkan PKS.' });
		}

		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Pilih sekolah aktif terlebih dahulu.' });

		const { addPksParentToClasses } = await import('$lib/server/mapel-pks.js');
		const wasAdded = await addPksParentToClasses([kelasId]);

		if (wasAdded) {
			return { success: 'Mata pelajaran PKS berhasil ditambahkan ke kelas.' };
		} else {
			return { success: 'Mapel PKS sudah ada' };
		}
	}
};
