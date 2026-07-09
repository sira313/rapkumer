import db from '$lib/server/db';
import {
	tableEkstrakurikuler,
	tableEkstrakurikulerTujuan,
	tableKelas
} from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { readBufferToAoA } from '$lib/utils/excel.js';
import { cookieNames } from '$lib/utils';

const TABLE_MISSING_MESSAGE =
	'Tabel ekstrakurikuler belum tersedia. Jalankan "pnpm db:push" untuk menerapkan migrasi terbaru.';

function isDuplicateNameError(error: unknown) {
	return (
		error instanceof Error &&
		error.message.includes('UNIQUE constraint failed') &&
		error.message.includes('ekstrakurikuler') &&
		error.message.includes('kelas_id')
	);
}

function isTableMissingError(error: unknown) {
	return (
		error instanceof Error &&
		error.message.includes('no such table') &&
		error.message.includes('ekstrakurikuler')
	);
}

export async function load({ depends, parent }) {
	depends('app:ekstrakurikuler');
	const { kelasAktif } = await parent();
	const kelasId = kelasAktif?.id ?? null;

	let ekstrakurikulerRaw: Awaited<ReturnType<typeof db.query.tableEkstrakurikuler.findMany>> = [];
	let tableReady = true;

	if (kelasId) {
		try {
			ekstrakurikulerRaw = await db.query.tableEkstrakurikuler.findMany({
				where: eq(tableEkstrakurikuler.kelasId, kelasId),
				orderBy: asc(tableEkstrakurikuler.createdAt)
			});
		} catch (error) {
			if (isTableMissingError(error)) {
				tableReady = false;
				ekstrakurikulerRaw = [];
			} else {
				throw error;
			}
		}
	}

	return {
		kelasId,
		tableReady,
		ekstrakurikuler: ekstrakurikulerRaw
	};
}

export const actions = {
	add: async ({ request, locals }) => {
		const formData = await request.formData();
		const kelasIdRaw = formData.get('kelasId');
		const nama = formData.get('nama')?.toString().trim() ?? '';

		if (!kelasIdRaw) {
			return fail(400, { fail: 'Kelas aktif tidak ditemukan' });
		}

		const kelasId = Number(kelasIdRaw);
		if (!Number.isInteger(kelasId)) {
			return fail(400, { fail: 'Kelas tidak valid' });
		}

		// Server-side permission: wali_kelas may only add for their own kelas
		if (locals?.user && (locals.user as unknown as { type?: string }).type === 'wali_kelas') {
			const u = locals.user as { kelasId?: number; permissions?: string[]; pegawaiId?: number };
			const hasAccessOther = Array.isArray(u.permissions)
				? u.permissions.includes('kelas_pindah')
				: false;

			let isOwnClass = false;
			const userKelasId = u.kelasId;
			if (userKelasId != null && Number.isInteger(Number(userKelasId))) {
				isOwnClass = Number(userKelasId) === kelasId;
			} else if (u.pegawaiId) {
				const owned = await db.query.tableKelas.findFirst({
					columns: { id: true },
					where: and(eq(tableKelas.id, kelasId), eq(tableKelas.waliKelasId, u.pegawaiId))
				});
				isOwnClass = !!owned;
			}

			if (!isOwnClass && !hasAccessOther) {
				throw redirect(303, `/forbidden?required=kelas_id`);
			}
		}

		if (!nama) {
			return fail(400, { fail: 'Nama ekstrakurikuler wajib diisi' });
		}

		try {
			await db.insert(tableEkstrakurikuler).values({ kelasId, nama });
			return { message: 'Ekstrakurikuler berhasil ditambahkan' };
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			if (isDuplicateNameError(error)) {
				return fail(400, { fail: 'Nama ekstrakurikuler sudah digunakan di kelas ini' });
			}
			throw error;
		}
	},

	update: async ({ request, locals }) => {
		const formData = await request.formData();
		const idRaw = formData.get('id');
		const kelasIdRaw = formData.get('kelasId');
		const nama = formData.get('nama')?.toString().trim() ?? '';

		if (!idRaw) {
			return fail(400, { fail: 'ID ekstrakurikuler tidak ditemukan' });
		}

		const id = Number(idRaw);
		if (!Number.isInteger(id) || id <= 0) {
			return fail(400, { fail: 'ID ekstrakurikuler tidak valid' });
		}

		if (!kelasIdRaw) {
			return fail(400, { fail: 'Kelas aktif tidak ditemukan' });
		}

		const kelasId = Number(kelasIdRaw);
		if (!Number.isInteger(kelasId)) {
			return fail(400, { fail: 'Kelas tidak valid' });
		}

		// Server-side permission: wali_kelas may only update for their own kelas
		if (locals?.user && (locals.user as unknown as { type?: string }).type === 'wali_kelas') {
			const u = locals.user as { kelasId?: number; permissions?: string[]; pegawaiId?: number };
			const hasAccessOther = Array.isArray(u.permissions)
				? u.permissions.includes('kelas_pindah')
				: false;

			let isOwnClass = false;
			const userKelasId = u.kelasId;
			if (userKelasId != null && Number.isInteger(Number(userKelasId))) {
				isOwnClass = Number(userKelasId) === kelasId;
			} else if (u.pegawaiId) {
				const owned = await db.query.tableKelas.findFirst({
					columns: { id: true },
					where: and(eq(tableKelas.id, kelasId), eq(tableKelas.waliKelasId, u.pegawaiId))
				});
				isOwnClass = !!owned;
			}

			if (!isOwnClass && !hasAccessOther) {
				throw redirect(303, `/forbidden?required=kelas_id`);
			}
		}

		if (!nama) {
			return fail(400, { fail: 'Nama ekstrakurikuler wajib diisi' });
		}

		try {
			const updated = await db
				.update(tableEkstrakurikuler)
				.set({ nama, updatedAt: new Date().toISOString() })
				.where(and(eq(tableEkstrakurikuler.id, id), eq(tableEkstrakurikuler.kelasId, kelasId)))
				.returning({ id: tableEkstrakurikuler.id });

			if (!updated.length) {
				return fail(404, { fail: 'Ekstrakurikuler tidak ditemukan atau sudah dihapus' });
			}

			return { message: 'Ekstrakurikuler berhasil diperbarui', id: updated[0].id };
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			if (isDuplicateNameError(error)) {
				return fail(400, { fail: 'Nama ekstrakurikuler sudah digunakan di kelas ini' });
			}
			throw error;
		}
	},

	delete: async ({ request, locals }) => {
		const formData = await request.formData();
		const rawIds = formData.getAll('ids');
		const fallbackId = formData.get('id');

		const ids = Array.from(
			new Set(
				[
					...rawIds
						.map((value) => Number(value))
						.filter((id): id is number => Number.isInteger(id) && id > 0),
					...(fallbackId ? [Number(fallbackId)] : [])
				].filter((id): id is number => Number.isInteger(id) && id > 0)
			)
		);

		if (!ids.length) {
			return fail(400, { fail: 'Pilih data ekstrakurikuler yang akan dihapus' });
		}

		try {
			// If caller is wali_kelas without akses_lain, ensure all target rows belong to their kelas
			if (locals?.user && (locals.user as unknown as { type?: string }).type === 'wali_kelas') {
				const u = locals.user as { kelasId?: number; permissions?: string[]; pegawaiId?: number };
				const hasAccessOther = Array.isArray(u.permissions)
					? u.permissions.includes('kelas_pindah')
					: false;

				if (!hasAccessOther) {
					let allowedKelasId: number | null = null;
					const userKelasId = u.kelasId;
					if (userKelasId != null && Number.isInteger(Number(userKelasId))) {
						allowedKelasId = Number(userKelasId);
					} else if (u.pegawaiId) {
						const owned = await db.query.tableKelas.findFirst({
							columns: { id: true },
							where: eq(tableKelas.waliKelasId, u.pegawaiId),
							orderBy: asc(tableKelas.id)
						});
						allowedKelasId = owned?.id ?? null;
					}

					if (allowedKelasId != null) {
						const rows = await db.query.tableEkstrakurikuler.findMany({
							columns: { id: true, kelasId: true },
							where: inArray(tableEkstrakurikuler.id, ids)
						});
						const other = rows.some((r) => r.kelasId !== allowedKelasId);
						if (other) throw redirect(303, `/forbidden?required=kelas_id`);
					}
				}
			}
			await db.delete(tableEkstrakurikuler).where(inArray(tableEkstrakurikuler.id, ids));
			return { message: `${ids.length} ekstrakurikuler berhasil dihapus` };
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			throw error;
		}
	},

	import_ekstra: async ({ request, cookies, locals }) => {
		const kelasIdCookie = cookies.get(cookieNames.ACTIVE_KELAS_ID) || null;
		const kelasId = kelasIdCookie ? Number(kelasIdCookie) : null;
		if (!kelasId || !Number.isFinite(kelasId)) {
			return fail(400, { fail: 'Pilih kelas aktif terlebih dahulu.' });
		}

		// Server-side permission: wali_kelas may only import for their own kelas
		if (locals?.user && (locals.user as unknown as { type?: string }).type === 'wali_kelas') {
			const u = locals.user as { kelasId?: number; permissions?: string[]; pegawaiId?: number };
			const hasAccessOther = Array.isArray(u.permissions)
				? u.permissions.includes('kelas_pindah')
				: false;

			let isOwnClass = false;
			const userKelasId = u.kelasId;
			if (userKelasId != null && Number.isInteger(Number(userKelasId))) {
				isOwnClass = Number(userKelasId) === kelasId;
			} else if (u.pegawaiId) {
				const owned = await db.query.tableKelas.findFirst({
					columns: { id: true },
					where: and(eq(tableKelas.id, kelasId), eq(tableKelas.waliKelasId, u.pegawaiId))
				});
				isOwnClass = !!owned;
			}

			if (!isOwnClass && !hasAccessOther) {
				throw redirect(303, `/forbidden?required=kelas_id`);
			}
		}

		const MAX_IMPORT_FILE_SIZE = 2 * 1024 * 1024; // 2MB

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
			const buffer = Buffer.from(await file.arrayBuffer());
			rawRows = await readBufferToAoA(buffer);
		} catch (error) {
			console.error('Gagal membaca file Excel', error);
			return fail(400, { fail: 'Gagal membaca file Excel. Pastikan format sesuai.' });
		}

		if (!Array.isArray(rawRows) || rawRows.length === 0) {
			return fail(400, { fail: 'File Excel tidak berisi data.' });
		}

		// Expect header row containing: Ekstrakurikuler, Tujuan
		const headerIndex = rawRows.findIndex((row) => {
			const cols = (row ?? []).map((c) => normalizeCell(c).toLowerCase());
			return (
				cols.some((c) => c.includes('ekstrakurikuler') || c === 'ekstrakurikuler') &&
				cols.some((c) => c.includes('tujuan'))
			);
		});

		if (headerIndex === -1) {
			return fail(400, {
				fail: 'Template tidak valid. Pastikan kolom Ekstrakurikuler dan Tujuan tersedia.'
			});
		}

		const dataRows = rawRows.slice(headerIndex + 1).filter(Boolean);
		if (!dataRows.length) return fail(400, { fail: 'Tidak ada data pada file.' });

		// Parse rows into ekstrakurikuler -> array of tujuan
		type ParsedEntry = { deskripsi: string };
		const parsed = new Map<string, ParsedEntry[]>();
		let currentEkstra = '';

		for (const row of dataRows as (string | number | null | undefined)[][]) {
			const col0 = normalizeCell(row?.[0] ?? ''); // Ekstrakurikuler
			const col1 = normalizeCell(row?.[1] ?? ''); // Tujuan

			if (col0) {
				currentEkstra = col0;
			}
			if (!currentEkstra) {
				// skip rows before first ekstrakurikuler name
				continue;
			}
			if (!col1) continue; // no tujuan

			const key = currentEkstra;
			let entries = parsed.get(key);
			if (!entries) {
				entries = [];
				parsed.set(key, entries);
			}

			entries.push({ deskripsi: col1 });
		}

		if (parsed.size === 0) return fail(400, { fail: 'Tidak ada tujuan yang ditemukan.' });

		// Persist into DB: create new ekstrakurikuler when not found, otherwise insert tujuan
		// for existing ekstrakurikuler. Avoid duplicate tujuan entries.
		let insertedEkstra = 0;
		let insertedTujuan = 0;
		let skippedTujuan = 0;

		try {
			await db.transaction(async (tx) => {
				// fetch existing ekstrakurikuler for kelas (case-insensitive matching)
				const existingEkstra = await tx.query.tableEkstrakurikuler.findMany({
					where: eq(tableEkstrakurikuler.kelasId, kelasId)
				});

				const ekstraByName = new Map<string, number>();
				for (const e of existingEkstra) ekstraByName.set((e.nama ?? '').toLowerCase(), e.id);

				for (const [ekstraName, tujuanEntries] of parsed.entries()) {
					const lower = ekstraName.toLowerCase();
					let ekstraId = ekstraByName.get(lower) ?? null;
					if (!ekstraId) {
						// create the ekstrakurikuler automatically
						const insertRes = await tx
							.insert(tableEkstrakurikuler)
							.values({ nama: ekstraName, kelasId })
							.returning({ id: tableEkstrakurikuler.id });
						ekstraId = insertRes?.[0]?.id ?? null;
						if (ekstraId) {
							insertedEkstra += 1;
							ekstraByName.set(lower, ekstraId);
						}
					}
					if (!ekstraId) continue; // defensive

					// fetch existing tujuan for this ekstrakurikuler
					const existingTujuan = await tx.query.tableEkstrakurikulerTujuan.findMany({
						columns: { deskripsi: true },
						where: eq(tableEkstrakurikulerTujuan.ekstrakurikulerId, ekstraId)
					});
					const existingKeys = new Set(
						existingTujuan.map((t) => normalizeCell(t.deskripsi).toLowerCase())
					);

					const toInsertTujuan: Array<{
						deskripsi: string;
						ekstrakurikulerId: number;
					}> = [];
					for (const entry of tujuanEntries) {
						const key = normalizeCell(entry.deskripsi).toLowerCase();
						if (existingKeys.has(key)) {
							skippedTujuan += 1;
							continue;
						}
						existingKeys.add(key);
						toInsertTujuan.push({
							deskripsi: entry.deskripsi,
							ekstrakurikulerId: ekstraId
						});
					}

					if (toInsertTujuan.length) {
						await tx.insert(tableEkstrakurikulerTujuan).values(toInsertTujuan);
						insertedTujuan += toInsertTujuan.length;
					}
				}
			});
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, { fail: TABLE_MISSING_MESSAGE });
			}
			if (isDuplicateNameError(error)) {
				return fail(400, {
					fail: 'Nama ekstrakurikuler sudah digunakan di kelas ini. Periksa data yang diimpor.'
				});
			}
			throw error;
		}

		const parts = [
			`Impor selesai: ${insertedEkstra} ekstrakurikuler baru, ${insertedTujuan} tujuan ditambahkan.`
		];
		if (skippedTujuan > 0) parts.push(`${skippedTujuan} tujuan diabaikan karena sudah ada.`);
		return { message: parts.join(' ') };
	}
};
