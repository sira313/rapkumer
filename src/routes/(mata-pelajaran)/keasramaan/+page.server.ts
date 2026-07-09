import db from '$lib/server/db';
import {
	tableKeasramaan,
	tableKeasramaanIndikator,
	tableKeasramaanTujuan
} from '$lib/server/db/schema';
import { redirect, fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { readBufferToAoA } from '$lib/utils/excel.js';
import { cookieNames } from '$lib/utils';

interface KeasramaanWithIndikator {
	id: number;
	nama: string;
	indikator: Array<{
		id: number;
		deskripsi: string;
	}>;
}

function isTableMissingError(error: unknown) {
	if (error instanceof Error) {
		return error.message.includes('no such table');
	}
	return false;
}

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

const MAX_IMPORT_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export async function load({ depends, parent }) {
	depends('app:keasramaan');
	const { kelasAktif, user } = await parent();

	if (!kelasAktif?.id) {
		throw redirect(303, `/forbidden?required=kelas_id`);
	}

	let keasramaanRaw: KeasramaanWithIndikator[] = [];
	let tableReady = true;

	try {
		keasramaanRaw = await db.query.tableKeasramaan.findMany({
			where: eq(tableKeasramaan.kelasId, kelasAktif.id),
			orderBy: asc(tableKeasramaan.createdAt),
			with: { indikator: { orderBy: asc(tableKeasramaanIndikator.createdAt) } }
		});
	} catch (error) {
		if (isTableMissingError(error)) {
			tableReady = false;
			keasramaanRaw = [];
		} else {
			throw error;
		}
	}

	return {
		meta: { title: 'Daftar Nilai Keasramaan' },
		mataEvaluasi: keasramaanRaw,
		tableReady
	};
}

function canManageKeasramaan(user: unknown): boolean {
	if (!user || typeof user !== 'object') return false;
	const u = user as { type?: string };
	return u.type === 'admin' || u.type === 'wali_kelas' || u.type === 'wali_asuh';
}

export const actions = {
	async import_matev({ request, cookies, locals }) {
		if (!canManageKeasramaan(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}
		const kelasIdCookie = cookies.get(cookieNames.ACTIVE_KELAS_ID) || null;
		const kelasId = kelasIdCookie ? Number(kelasIdCookie) : null;
		if (!kelasId || !Number.isFinite(kelasId)) {
			return fail(400, { fail: 'Pilih kelas aktif terlebih dahulu.' });
		}

		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Pilih sekolah aktif terlebih dahulu.' });

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

		// Identify header columns by name (robust against different column orders)
		// find header row index first (row that contains Matev, Indikator, Tujuan Pembelajaran)
		const headerIndex = rawRows.findIndex((row) => {
			const cols = (row ?? []).map((c) => normalizeCell(c).toLowerCase());
			return (
				cols.some((c) => c.includes('matev') || c === 'matev') &&
				cols.some((c) => c.includes('indikator')) &&
				cols.some((c) => c.includes('tujuan'))
			);
		});

		if (headerIndex === -1) {
			return fail(400, {
				fail: 'Template tidak valid. Pastikan kolom Matev, Indikator, dan Tujuan Pembelajaran tersedia.'
			});
		}

		const headerRow = rawRows[headerIndex] ?? [];
		const normalizedHeaderCols = (headerRow ?? []).map((c) => normalizeCell(c).toLowerCase());

		const findColIndex = (names: string[]) =>
			normalizedHeaderCols.findIndex((h) => names.some((n) => h.includes(n)));

		const idxMatev = findColIndex(['matev']);
		const idxIndikator = findColIndex(['indikator']);
		const idxTujuan = findColIndex(['tujuan']);

		if (idxMatev === -1 || idxIndikator === -1 || idxTujuan === -1) {
			return fail(400, {
				fail: 'Template tidak valid. Pastikan kolom Matev, Indikator, dan Tujuan Pembelajaran tersedia.'
			});
		}

		const dataRows = rawRows.slice(headerIndex + 1).filter(Boolean);
		if (!dataRows.length) return fail(400, { fail: 'Tidak ada data pada file.' });

		// Parse rows into matev -> indikator -> tujuan
		type ParsedTujuan = { deskripsi: string };
		type ParsedIndikator = { deskripsi: string; tujuan: ParsedTujuan[] };
		type ParsedMatev = { deskripsi: string; indikator: ParsedIndikator[] };

		const parsed = new Map<string, ParsedMatev>();
		let currentMatev = '';
		let currentIndikator = '';

		for (const row of dataRows as (string | number | null | undefined)[][]) {
			const get = (i: number) => normalizeCell(row?.[i] ?? '');

			const colMatev = get(idxMatev);
			const colIndikator = get(idxIndikator);
			const colTujuan = get(idxTujuan);

			// New Matev found
			if (colMatev) {
				currentMatev = colMatev;
				currentIndikator = '';
			}

			// Skip until first matev
			if (!currentMatev) continue;

			// New Indikator found
			if (colIndikator) {
				currentIndikator = colIndikator;
			}

			// Skip rows without tujuan
			if (!colTujuan) continue;

			// Ensure matev exists in parsed map
			const matevKey = currentMatev;
			if (!parsed.has(matevKey)) {
				parsed.set(matevKey, {
					deskripsi: currentMatev,
					indikator: []
				});
			}

			const matevData = parsed.get(matevKey)!;

			// Find or create indikator in current matev
			if (currentIndikator) {
				let indikatorData = matevData.indikator.find(
					(ind) => ind.deskripsi.toLowerCase() === currentIndikator.toLowerCase()
				);

				if (!indikatorData) {
					indikatorData = {
						deskripsi: currentIndikator,
						tujuan: []
					};
					matevData.indikator.push(indikatorData);
				}

				// Add tujuan
				indikatorData.tujuan.push({ deskripsi: colTujuan });
			}
		}

		if (parsed.size === 0) return fail(400, { fail: 'Tidak ada data matev yang ditemukan.' });

		// Persist into DB
		let insertedMatev = 0;
		let insertedIndikator = 0;
		let insertedTujuan = 0;
		let skippedMatev = 0;
		let skippedIndikator = 0;
		let skippedTujuan = 0;

		try {
			await db.transaction(async (tx) => {
				// Fetch existing keasramaan for kelas (case-insensitive matching)
				const existingMatev = await tx.query.tableKeasramaan.findMany({
					where: eq(tableKeasramaan.kelasId, kelasId),
					with: { indikator: true }
				});

				const matevByName = new Map<string, number>();
				const indikatorByMatevId = new Map<number, Set<string>>();

				for (const m of existingMatev) {
					matevByName.set((m.nama ?? '').toLowerCase(), m.id);
					const indSet = new Set<string>();
					for (const ind of m.indikator ?? []) {
						indSet.add((ind.deskripsi ?? '').toLowerCase());
					}
					indikatorByMatevId.set(m.id, indSet);
				}

				// Process each matev
				for (const [matevName, matevData] of parsed.entries()) {
					const matevLower = matevName.toLowerCase();
					let matevId = matevByName.get(matevLower) ?? null;

					// Create matev if not exists
					if (!matevId) {
						const insertRes = await tx
							.insert(tableKeasramaan)
							.values({ nama: matevName, kelasId })
							.returning({ id: tableKeasramaan.id });
						matevId = insertRes?.[0]?.id ?? null;
						if (matevId) {
							insertedMatev += 1;
							indikatorByMatevId.set(matevId, new Set());
						}
					} else {
						skippedMatev += 1;
					}

					if (!matevId) continue; // Defensive

					const indikatorSet = indikatorByMatevId.get(matevId) ?? new Set();

					// Process indikator
					for (const indikatorData of matevData.indikator ?? []) {
						const indikatorLower = indikatorData.deskripsi.toLowerCase();
						let indikatorId: number | null = null;

						// Find existing indikator
						const existingInd = existingMatev
							.find((m) => m.id === matevId)
							?.indikator?.find((ind) => (ind.deskripsi ?? '').toLowerCase() === indikatorLower);

						if (existingInd) {
							indikatorId = existingInd.id;
							skippedIndikator += 1;
						} else {
							// Create new indikator
							const insertRes = await tx
								.insert(tableKeasramaanIndikator)
								.values({ deskripsi: indikatorData.deskripsi, keasramaanId: matevId })
								.returning({ id: tableKeasramaanIndikator.id });
							indikatorId = insertRes?.[0]?.id ?? null;
							if (indikatorId) {
								insertedIndikator += 1;
								indikatorSet.add(indikatorLower);
							}
						}

						if (!indikatorId) continue; // Defensive

						// Fetch existing tujuan for this indikator
						const existingTujuan = await tx.query.tableKeasramaanTujuan.findMany({
							columns: { deskripsi: true },
							where: eq(tableKeasramaanTujuan.indikatorId, indikatorId)
						});
						const existingTujuanKeys = new Set(
							existingTujuan.map((t) => normalizeCell(t.deskripsi).toLowerCase())
						);

						// Insert new tujuan
						const toInsertTujuan: Array<{
							deskripsi: string;
							indikatorId: number;
						}> = [];

						for (const tujuanData of indikatorData.tujuan ?? []) {
							const tujuanKey = normalizeCell(tujuanData.deskripsi).toLowerCase();
							if (existingTujuanKeys.has(tujuanKey)) {
								skippedTujuan += 1;
								continue;
							}
							existingTujuanKeys.add(tujuanKey);
							toInsertTujuan.push({
								deskripsi: tujuanData.deskripsi,
								indikatorId
							});
						}

						if (toInsertTujuan.length) {
							await tx.insert(tableKeasramaanTujuan).values(toInsertTujuan);
							insertedTujuan += toInsertTujuan.length;
						}
					}
				}
			});
		} catch (error) {
			if (isTableMissingError(error)) {
				return fail(500, {
					fail: 'Database keasramaan belum siap. Jalankan pnpm db:push untuk menerapkan migrasi terbaru.'
				});
			}
			throw error;
		}

		const parts = [
			`Impor selesai: ${insertedMatev} matev baru, ${insertedIndikator} indikator ditambahkan, ${insertedTujuan} tujuan ditambahkan.`
		];
		if (skippedMatev > 0) parts.push(`${skippedMatev} matev diabaikan karena sudah ada.`);
		if (skippedIndikator > 0)
			parts.push(`${skippedIndikator} indikator diabaikan karena sudah ada.`);
		if (skippedTujuan > 0) parts.push(`${skippedTujuan} tujuan diabaikan karena sudah ada.`);
		return { message: parts.join(' ') };
	}
};
