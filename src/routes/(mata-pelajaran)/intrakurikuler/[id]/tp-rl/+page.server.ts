import db from '$lib/server/db/index.js';
import { ensureAgamaMapelForClasses } from '$lib/server/mapel-agama.js';
import { ensurePksMapelForClasses } from '$lib/server/mapel-pks.js';
import {
	tableMataPelajaran,
	tableTujuanPembelajaran,
	tableAuthUserMataPelajaran,
	tableAuthUser
} from '$lib/server/db/schema.js';
import { agamaMapelNames, agamaMapelOptions, pksMapelNames, pksMapelOptions } from '$lib/statics';
import { unflattenFormData } from '$lib/utils';
import { fail } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { readBufferToAoA } from '$lib/utils/excel.js';
import { redirect } from '@sveltejs/kit';
import { authority } from '../../../../pengguna/utils.server';

const MAX_IMPORT_FILE_SIZE = 2 * 1024 * 1024; // 2MB

function normalizeCell(value: unknown) {
	if (value == null) return '';
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number') return value.toString().trim();
	return String(value).trim();
}

function normalizeText(value: string | null | undefined) {
	return value?.trim().toLowerCase() ?? '';
}

function isXlsxMime(type: string | null | undefined) {
	if (!type) return false;
	return type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

export async function load({ depends, params, parent }) {
	// Check permission: admin, wali_kelas, wali_asuh, and users with rapor_manage can access
	// Also allow 'user' type (guru mapel) since they're filtered server-side
	const { user } = await parent();
	const userType = (user as { type?: string } | null)?.type;

	// Allow admin, wali_kelas, wali_asuh, and 'user' (guru mapel) to proceed
	// wali_kelas/wali_asuh already validated by hooks.server.ts to access only their own kelas
	if (
		userType !== 'admin' &&
		userType !== 'user' &&
		userType !== 'wali_kelas' &&
		userType !== 'wali_asuh'
	) {
		authority('rapor_manage');
	}

	depends('app:mapel_tp-rl');
	// pull mapel and user from parent so we can adapt behaviour for assigned agama teachers
	const { mapel } = await parent();

	await ensureAgamaMapelForClasses([mapel.kelasId]);
	await ensurePksMapelForClasses([mapel.kelasId]);

	let tujuanPembelajaran = [];

	let agamaOptions: Array<{
		id: number;
		label: string;
		name: string;
		isActive: boolean;
	}> = [];

	// Determine which religion-based subject group we're working with
	const isPksMapel = (pksMapelNames as readonly string[]).includes(mapel.nama);
	const targetNames: string[] = isPksMapel ? [...pksMapelNames] : [...agamaMapelNames];
	const targetOptions = isPksMapel ? pksMapelOptions : agamaMapelOptions;

	// prepare container for religion-based variant mapel in this kelas
	let kelasAgamaMapel: Array<{ id: number; nama: string }> = [];

	// Collect user's assigned agama variant names early (for filtering agamaOptions)
	const userAssignedAgamaNames = new Set<string>();
	if (user && user.type === 'user' && user.id) {
		try {
			const userAssignedMapels = await db.query.tableAuthUserMataPelajaran.findMany({
				columns: { mataPelajaranId: true },
				where: eq(tableAuthUserMataPelajaran.authUserId, user.id)
			});

			if (userAssignedMapels.length > 0) {
				const assignedRecords = await db.query.tableMataPelajaran.findMany({
					columns: { nama: true },
					where: inArray(
						tableMataPelajaran.id,
						userAssignedMapels.map((m) => m.mataPelajaranId)
					)
				});

				for (const record of assignedRecords) {
					if (targetNames.includes(record.nama)) {
						userAssignedAgamaNames.add((record.nama || '').trim().toLowerCase());
					}
				}
			}
		} catch (err) {
			console.warn('[tp-rl] failed to collect userAssignedAgamaNames', err);
		}
	}

	// Check if mapel is agama parent OR if user has agama variant assigned
	const shouldShowAgamaOptions =
		targetNames.includes(mapel.nama) || userAssignedAgamaNames.size > 0;

	if (shouldShowAgamaOptions) {
		kelasAgamaMapel = await db.query.tableMataPelajaran.findMany({
			columns: { id: true, nama: true },
			where: and(
				eq(tableMataPelajaran.kelasId, mapel.kelasId),
				inArray(tableMataPelajaran.nama, targetNames)
			)
		});

		const mapelByName = new Map(kelasAgamaMapel.map((item) => [item.nama, item]));

		agamaOptions = targetOptions
			.filter((option) => option.key !== 'umum')
			.map((option) => {
				const variant = mapelByName.get(option.name);
				if (!variant) return null;

				// For users with assigned agama/PKS variants, only include agama options they have assigned
				if (
					userAssignedAgamaNames.size > 0 &&
					!userAssignedAgamaNames.has((option.name || '').trim().toLowerCase())
				) {
					return null;
				}

				return {
					id: variant.id,
					label: option.label,
					name: option.name,
					isActive: variant.id === mapel.id
				};
			})
			.filter((item): item is NonNullable<typeof item> => Boolean(item));
	}

	// compute assignedLocalMapelId: if the logged-in user has an assigned
	// mataPelajaranId, attempt to resolve a local mapel in this kelas with the
	// same normalized name as the assigned mapel. This is useful for client
	// logic to lock the agama select even when the global assigned id differs
	// across kelas rows.
	// For multi-mapel users, also check the join table for any agama assignment.
	let assignedLocalMapelId: number | null = null;
	let assignedGlobalId: number | null = null;
	let assignedGlobalName: string | null = null;
	let userHasMultiAgama = false;
	try {
		if (user && user.type === 'user') {
			// Check if user has multi-mapel in join table FIRST, regardless of legacy mataPelajaranId
			if (user.id) {
				const userAssignedMapels = await db.query.tableAuthUserMataPelajaran.findMany({
					columns: { mataPelajaranId: true },
					where: eq(tableAuthUserMataPelajaran.authUserId, user.id)
				});

				if (userAssignedMapels.length > 1) {
					// User has multi-mapel - clear legacy mataPelajaranId if set (one-time fix for existing users)
					if (user.mataPelajaranId) {
						await db
							.update(tableAuthUser)
							.set({ mataPelajaranId: null })
							.where(eq(tableAuthUser.id, user.id));
						user.mataPelajaranId = null; // Update in-memory copy
					}
				}
			}

			// First priority: check legacy mataPelajaranId field
			if (user.mataPelajaranId) {
				const assigned = await db.query.tableMataPelajaran.findFirst({
					columns: { id: true, nama: true },
					where: eq(tableMataPelajaran.id, Number(user.mataPelajaranId))
				});
				if (assigned && assigned.nama) {
					assignedGlobalId = assigned.id;
					assignedGlobalName = assigned.nama;
					const norm = normalizeText(assigned.nama);
					const foundLocal = (kelasAgamaMapel ?? []).find((r) => normalizeText(r.nama) === norm);
					if (foundLocal) assignedLocalMapelId = foundLocal.id;
				}
			}
			// Second priority: for multi-mapel users, check join table for any agama assignment
			else if (user.id) {
				const userAssignedMapels = await db.query.tableAuthUserMataPelajaran.findMany({
					columns: { mataPelajaranId: true },
					where: eq(tableAuthUserMataPelajaran.authUserId, user.id)
				});

				if (userAssignedMapels.length > 0) {
					const assignedRecords = await db.query.tableMataPelajaran.findMany({
						columns: { id: true, nama: true },
						where: inArray(
							tableMataPelajaran.id,
							userAssignedMapels.map((m) => m.mataPelajaranId)
						)
					});

					// Count how many agama variants this user has assigned
					const agamaVariantsCount = assignedRecords.filter((r) =>
						targetNames.includes(r.nama)
					).length;
					userHasMultiAgama = agamaVariantsCount > 1;

					// Find first agama variant in user's assignments
					for (const record of assignedRecords) {
						if (targetNames.includes(record.nama)) {
							assignedGlobalName = record.nama;
							const norm = normalizeText(record.nama);
							const foundLocal = (kelasAgamaMapel ?? []).find(
								(r) => normalizeText(r.nama) === norm
							);
							if (foundLocal) {
								assignedLocalMapelId = foundLocal.id;
								assignedGlobalId = record.id;
							}
							break;
						}
					}
				}
			}
		}
	} catch {
		// non-fatal
	}

	// Server-side enforcement: if the logged-in user is a 'user' assigned to a
	// SINGLE agama variant that exists in this kelas, do not allow them to
	// view a different agama variant — redirect to their assigned local mapel.
	// For multi-mapel users with multiple agama variants, allow access to all pages
	// (client-side logic will handle locking when appropriate).
	if (assignedLocalMapelId && user && user.type === 'user' && !userHasMultiAgama) {
		const requestedId = Number(params.id);
		if (Number.isFinite(requestedId) && requestedId !== assignedLocalMapelId) {
			// redirect to the assigned local mapel's TP page
			throw redirect(303, `/intrakurikuler/${assignedLocalMapelId}/tp-rl`);
		}
	}

	// If the current mapel is the parent agama page and the logged-in user
	// is assigned to a specific agama variant that exists in this kelas,
	// return the tujuan pembelajaran for that assigned variant so the
	// page shows the correct TP even without client navigation.
	// Supports both legacy (mataPelajaranId) and multi-mapel (join table) users.
	let agamaSelection = agamaOptions.find((item) => item.isActive)?.id?.toString() ?? '';
	if (
		agamaOptions.length > 0 &&
		user &&
		user.type === 'user' &&
		assignedLocalMapelId &&
		normalizeText(mapel.nama) === normalizeText(agamaMapelOptions[0].name)
	) {
		const assignedLocal = agamaOptions.find((opt) => opt.id === assignedLocalMapelId);
		if (assignedLocal) {
			// load tujuan for the assigned variant instead of the parent mapel
			agamaSelection = String(assignedLocal.id);
			tujuanPembelajaran = await db.query.tableTujuanPembelajaran.findMany({
				where: eq(tableTujuanPembelajaran.mataPelajaranId, assignedLocal.id),
				orderBy: asc(tableTujuanPembelajaran.createdAt)
			});
			// mark active
			agamaOptions = agamaOptions.map((opt) => ({
				...opt,
				isActive: opt.id === assignedLocal.id
			}));
			return {
				tujuanPembelajaran,
				agamaOptions,
				agamaSelection,
				assignedLocalMapelId,
				// server-enforced disabled flag: only disable for single-assignment (legacy) users
				// For multi-mapel users, client-side logic handles locking based on parent page check
				agamaSelectDisabled: Boolean(
					user?.type === 'user' &&
					user?.mataPelajaranId && // Only if user has legacy single mataPelajaranId
					assignedGlobalId &&
					((): boolean => {
						const name = assignedGlobalName as (typeof agamaMapelNames)[number] | undefined;
						return Boolean(name && agamaMapelNames.includes(name));
					})()
				),
				lockedAgamaSelectionId: assignedLocalMapelId ?? assignedGlobalId,
				meta: { title: `Tujuan Pembelajaran - ${assignedLocal.name}` }
			};
		}
	}

	// default behaviour: load tujuan for the requested mapel id
	tujuanPembelajaran = await db.query.tableTujuanPembelajaran.findMany({
		where: eq(tableTujuanPembelajaran.mataPelajaranId, +params.id),
		orderBy: asc(tableTujuanPembelajaran.createdAt)
	});

	const agamaSelectDisabledValue = Boolean(
		user?.type === 'user' &&
		user?.mataPelajaranId && // Only if user has legacy single mataPelajaranId
		assignedGlobalId &&
		((): boolean => {
			const name = assignedGlobalName as (typeof agamaMapelNames)[number] | undefined;
			return Boolean(name && agamaMapelNames.includes(name));
		})()
	);

	return {
		tujuanPembelajaran,
		agamaOptions,
		agamaSelection,
		assignedLocalMapelId,
		// server-enforced disabled flag: only disable for single-assignment (legacy) users
		// For multi-mapel users, client-side logic handles locking based on parent page check
		agamaSelectDisabled: agamaSelectDisabledValue,
		lockedAgamaSelectionId: assignedLocalMapelId ?? assignedGlobalId,
		userHasMultiAgama,
		meta: { title: `Tujuan Pembelajaran - ${mapel.nama}` }
	};
}

export const actions = {
	async save({ params, request, locals }) {
		// Allow admin, wali_kelas, wali_asuh, rapor_manage permission holders, and guru mapel
		const userType = (locals.user as { type?: string } | null)?.type;
		if (
			userType !== 'admin' &&
			userType !== 'user' &&
			userType !== 'wali_kelas' &&
			userType !== 'wali_asuh'
		) {
			authority('rapor_manage');
		}

		const formData = await request.formData();
		const payload = unflattenFormData<{
			mode?: string;
			lingkupMateri?: string;
			entries?:
				| Array<{ id?: string | number; deskripsi?: string }>
				| { id?: string | number; deskripsi?: string };
		}>(formData);

		const mode = payload.mode === 'edit' ? 'edit' : 'create';
		const mataPelajaranId = Number(params.id);
		if (!Number.isFinite(mataPelajaranId)) {
			return fail(400, { fail: 'Mata pelajaran tidak valid.' });
		}

		const lingkupMateri = (payload.lingkupMateri ?? '').trim();
		if (!lingkupMateri) {
			return fail(400, { fail: 'Lingkup materi wajib diisi.' });
		}

		const rawEntries = Array.isArray(payload.entries)
			? payload.entries
			: payload.entries
				? Object.values(
						payload.entries as Record<string, { id?: string | number; deskripsi?: string }>
					)
				: [];

		const entries = rawEntries
			.map((entry) => {
				const idRaw = typeof entry.id === 'string' ? entry.id.trim() : entry.id;
				const id =
					typeof idRaw === 'number'
						? idRaw
						: typeof idRaw === 'string' && idRaw !== ''
							? Number(idRaw)
							: undefined;
				return {
					id: Number.isFinite(id) ? (id as number) : undefined,
					deskripsi: typeof entry.deskripsi === 'string' ? entry.deskripsi.trim() : ''
				};
			})
			.filter((entry) => entry.deskripsi !== '' || entry.id !== undefined);

		const toInsert = entries.filter((entry) => !entry.id && entry.deskripsi.length > 0);
		const toUpdate = entries.filter((entry) => entry.id && entry.deskripsi.length > 0);
		const toDeleteIds = entries
			.filter((entry) => entry.id && entry.deskripsi.length === 0)
			.map((entry) => entry.id as number);

		const hasDeskripsi = entries.some((entry) => entry.deskripsi.length > 0);

		if (mode === 'create') {
			if (!hasDeskripsi || toInsert.length === 0) {
				return fail(400, { fail: 'Minimal satu tujuan pembelajaran harus diisi.' });
			}

			await db.insert(tableTujuanPembelajaran).values(
				toInsert.map((entry) => ({
					lingkupMateri,
					deskripsi: entry.deskripsi,
					mataPelajaranId
				}))
			);

			return { message: `Tujuan pembelajaran berhasil ditambahkan` };
		}

		if (!hasDeskripsi && toDeleteIds.length === 0) {
			return fail(400, { fail: 'Minimal satu tujuan pembelajaran harus diisi.' });
		}

		if (toUpdate.length === 0 && toInsert.length === 0 && toDeleteIds.length === 0) {
			return { message: `Tidak ada perubahan pada tujuan pembelajaran` };
		}

		if (toUpdate.length > 0) {
			await Promise.all(
				toUpdate.map((entry) =>
					entry.id
						? db
								.update(tableTujuanPembelajaran)
								.set({ lingkupMateri, deskripsi: entry.deskripsi, mataPelajaranId })
								.where(eq(tableTujuanPembelajaran.id, entry.id))
						: Promise.resolve()
				)
			);
		}

		if (toInsert.length > 0) {
			await db.insert(tableTujuanPembelajaran).values(
				toInsert.map((entry) => ({
					lingkupMateri,
					deskripsi: entry.deskripsi,
					mataPelajaranId
				}))
			);
		}

		if (toDeleteIds.length > 0) {
			await db
				.delete(tableTujuanPembelajaran)
				.where(inArray(tableTujuanPembelajaran.id, toDeleteIds));
		}

		return { message: `Tujuan pembelajaran berhasil diperbarui` };
	},

	async delete({ request, locals }) {
		// Allow admin, wali_kelas, wali_asuh, rapor_manage permission holders, and guru mapel
		const userType = (locals.user as { type?: string } | null)?.type;
		if (
			userType !== 'admin' &&
			userType !== 'user' &&
			userType !== 'wali_kelas' &&
			userType !== 'wali_asuh'
		) {
			authority('rapor_manage');
		}

		const formData = await request.formData();
		const idsRaw = formData.getAll('ids');
		const ids = idsRaw.map((value) => Number(value)).filter((value) => Number.isFinite(value));

		if (ids.length === 0) {
			return fail(400, { fail: `Data tujuan pembelajaran tidak ditemukan.` });
		}

		await db.delete(tableTujuanPembelajaran).where(inArray(tableTujuanPembelajaran.id, ids));
		return { message: `Lingkup materi dan tujuan pembelajaran telah dihapus.` };
	},

	async savebobot({
		params,
		request,
		locals
	}: {
		params: Record<string, string>;
		request: Request;
		locals: App.Locals;
	}) {
		// Allow admin, wali_kelas, wali_asuh, rapor_manage permission holders, and guru mapel
		const userType = (locals.user as { type?: string } | null)?.type;
		if (
			userType !== 'admin' &&
			userType !== 'user' &&
			userType !== 'wali_kelas' &&
			userType !== 'wali_asuh'
		) {
			authority('rapor_manage');
		}

		const mataPelajaranId = Number(params.id);
		if (!Number.isFinite(mataPelajaranId)) {
			return fail(400, { fail: 'Mata pelajaran tidak valid.' });
		}

		const formData = await request.formData();

		// Extract bobot values from FormData with format bobot[key]=value
		// FormData entries will be like: ["bobot[key]", "value"]
		const bobotMap: Record<string, number> = {};
		for (const [key, value] of formData.entries()) {
			if (key.startsWith('bobot[') && key.endsWith(']')) {
				const bobotKey = key.slice(6, -1); // Extract key from bobot[key]
				const numValue = Number(value);
				if (Number.isFinite(numValue)) {
					bobotMap[bobotKey] = numValue;
				}
			}
		}

		if (Object.keys(bobotMap).length === 0) {
			return fail(400, { fail: 'Tidak ada bobot untuk disimpan.' });
		} // Get all TP for this mapel to update
		const allTP = await db.query.tableTujuanPembelajaran.findMany({
			where: eq(tableTujuanPembelajaran.mataPelajaranId, mataPelajaranId)
		});

		if (allTP.length === 0) {
			return fail(400, { fail: 'Tidak ada tujuan pembelajaran yang ditemukan.' });
		}

		// Group TP by lingkupMateri to find which ones need update
		const groupMap = new Map<string, typeof allTP>();
		for (const tp of allTP) {
			const key = (tp.lingkupMateri ?? '').trim().toLowerCase();
			if (!groupMap.has(key)) {
				groupMap.set(key, []);
			}
			groupMap.get(key)!.push(tp);
		}

		// Update bobot for each lingkupMateri group
		// Key format from client: "lingkupMateri::id1-id2" (from groupKey function)
		let updateCount = 0;
		for (const [key, value] of Object.entries(bobotMap)) {
			// Extract lingkupMateri from group key (everything before ::)
			const lingkupMateri = key.split('::')[0]?.trim() ?? '';
			const tpGroup = groupMap.get(lingkupMateri.toLowerCase());
			if (!tpGroup || tpGroup.length === 0) continue;

			const bobotValue = Number(value);
			if (!Number.isFinite(bobotValue) || bobotValue < 0) continue;

			// Update all TP in this group with the same bobot
			for (const tp of tpGroup) {
				if (tp.bobot !== bobotValue) {
					await db
						.update(tableTujuanPembelajaran)
						.set({ bobot: bobotValue })
						.where(eq(tableTujuanPembelajaran.id, tp.id));
					updateCount++;
				}
			}
		}

		return {
			message: updateCount > 0 ? 'Bobot berhasil disimpan.' : 'Tidak ada perubahan pada bobot.'
		};
	},

	async import({ params, request, locals }) {
		// Allow admin, wali_kelas, wali_asuh, rapor_manage permission holders, and guru mapel
		const userType = (locals.user as { type?: string } | null)?.type;
		if (
			userType !== 'admin' &&
			userType !== 'user' &&
			userType !== 'wali_kelas' &&
			userType !== 'wali_asuh'
		) {
			authority('rapor_manage');
		}

		const mataPelajaranId = Number(params.id);
		if (!Number.isFinite(mataPelajaranId)) {
			return fail(400, { fail: 'Mata pelajaran tidak valid.' });
		}

		const formData = await request.formData();
		const file = formData.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { fail: 'File Excel belum dipilih.' });
		}

		if (file.size > MAX_IMPORT_FILE_SIZE) {
			return fail(400, { fail: 'Ukuran file melebihi 2MB.' });
		}

		const filename = (file.name ?? '').toLowerCase();
		if (!filename.endsWith('.xlsx') && !isXlsxMime(file.type)) {
			return fail(400, { fail: 'Format file harus .xlsx.' });
		}

		let rawRows;
		try {
			const buffer = await file.arrayBuffer();
			rawRows = await readBufferToAoA(buffer as ArrayBuffer);
		} catch {
			return fail(400, { fail: 'Gagal membaca file Excel. Pastikan format sesuai.' });
		}

		if (!Array.isArray(rawRows) || rawRows.length === 0) {
			return fail(400, { fail: 'File Excel tidak berisi data.' });
		}

		let headerIndex = -1;
		for (let index = 0; index < rawRows.length; index += 1) {
			const row = rawRows[index];
			const colA = normalizeCell(row?.[0] ?? '');
			const colB = normalizeCell(row?.[1] ?? '');
			if (colA.toLowerCase().includes('lingkup') && colB.toLowerCase().includes('tujuan')) {
				headerIndex = index;
				break;
			}
		}

		if (headerIndex === -1) {
			return fail(400, {
				fail: 'Template tidak valid. Pastikan terdapat kolom "Lingkup Materi" dan "Tujuan Pembelajaran".'
			});
		}

		const dataRows = rawRows.slice(headerIndex + 1);
		let currentLingkup = '';
		const groupOrder: Array<{ lingkupMateri: string; deskripsi: string[] }> = [];
		const groupMap = new Map<string, { lingkupMateri: string; deskripsi: string[] }>();

		for (const row of dataRows) {
			if (!row) continue;
			const lingkupValue = normalizeCell(row[0] ?? '');
			const tujuanValue = normalizeCell(row[1] ?? '');

			if (lingkupValue) {
				currentLingkup = lingkupValue;
			}

			if (!currentLingkup) {
				continue;
			}

			if (!tujuanValue) {
				continue;
			}

			const key = currentLingkup.toLowerCase();
			let group = groupMap.get(key);
			if (!group) {
				group = { lingkupMateri: currentLingkup, deskripsi: [] };
				groupMap.set(key, group);
				groupOrder.push(group);
			}

			if (!group.deskripsi.some((entry) => entry.toLowerCase() === tujuanValue.toLowerCase())) {
				group.deskripsi.push(tujuanValue);
			}
		}

		const cleanedGroups = groupOrder
			.map((group) => ({
				lingkupMateri: group.lingkupMateri,
				deskripsi: group.deskripsi.filter((entry) => entry.length > 0)
			}))
			.filter((group) => group.deskripsi.length > 0);

		if (cleanedGroups.length === 0) {
			return fail(400, { fail: 'Tidak ada tujuan pembelajaran yang ditemukan dalam file.' });
		}

		const existingEntries = await db.query.tableTujuanPembelajaran.findMany({
			columns: { lingkupMateri: true, deskripsi: true },
			where: eq(tableTujuanPembelajaran.mataPelajaranId, mataPelajaranId)
		});

		const existingKeys = new Set(
			existingEntries.map(
				(entry) =>
					`${normalizeCell(entry.lingkupMateri).toLowerCase()}::${normalizeCell(entry.deskripsi).toLowerCase()}`
			)
		);

		const toInsert: Array<{ lingkupMateri: string; deskripsi: string; mataPelajaranId: number }> =
			[];
		let duplicateCount = 0;
		let longEntryCount = 0;

		for (const group of cleanedGroups) {
			const normalizedLingkup = normalizeCell(group.lingkupMateri);
			for (const deskripsi of group.deskripsi) {
				const normalizedDeskripsi = normalizeCell(deskripsi);
				const key = `${normalizedLingkup.toLowerCase()}::${normalizedDeskripsi.toLowerCase()}`;
				if (existingKeys.has(key)) {
					duplicateCount += 1;
					continue;
				}
				existingKeys.add(key);
				if (normalizedDeskripsi.length > 95) {
					longEntryCount += 1;
				}
				toInsert.push({
					lingkupMateri: normalizedLingkup,
					deskripsi: normalizedDeskripsi,
					mataPelajaranId
				});
			}
		}

		if (toInsert.length === 0) {
			return {
				message:
					duplicateCount > 0
						? 'Semua tujuan pembelajaran pada file sudah tersedia.'
						: 'Tidak ada tujuan pembelajaran baru yang ditemukan.'
			};
		}

		await db.insert(tableTujuanPembelajaran).values(toInsert);

		const parts = [`Berhasil mengimpor ${toInsert.length} tujuan pembelajaran.`];
		if (duplicateCount > 0) {
			parts.push(`${duplicateCount} data diabaikan karena sudah ada.`);
		}

		return { message: parts.join(' '), longEntryCount };
	}
};
