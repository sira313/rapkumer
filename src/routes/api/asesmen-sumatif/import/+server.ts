import { json, type RequestHandler } from '@sveltejs/kit';
import { canAccessKelas } from '$lib/server/kelas-akses';
import { getAksesMapelUser, needsMapelFilter } from '$lib/server/mapel-access';
import { isAuthorizedUser } from '../../../pengguna/permissions';
import db from '$lib/server/db';
import {
	tableAsesmenSumatif,
	tableAsesmenSumatifTujuan,
	tableTujuanPembelajaran,
	tableMataPelajaran,
	tableMurid,
	tableSekolah
} from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { muridAgamaKey } from '$lib/server/mapel-picker';
import { agamaMapelOptions, pksMapelOptions } from '$lib/statics';

const AGAMA_BASE_SUBJECT = 'Pendidikan Agama dan Budi Pekerti';
const PKS_BASE_SUBJECT = 'Pendalaman Kitab Suci';

function normalizeText(value: string | null | undefined) {
	return value?.trim().toLowerCase() ?? '';
}

function resolveAgamaVariantName(agama: string | null | undefined) {
	const key = muridAgamaKey(agama);
	return key ? (agamaMapelOptions.find((o) => o.key === key)?.name ?? null) : null;
}

function resolvePksVariantName(agama: string | null | undefined) {
	const key = muridAgamaKey(agama);
	return key ? (pksMapelOptions.find((o) => o.key === key)?.name ?? null) : null;
}

function parseNumericCell(value: unknown): number | null {
	if (value == null) return null;
	const text = typeof value === 'string' ? value.trim() : String(value).trim();
	if (text === '') return null;
	const normalized = text.replace(',', '.');
	const num = Number(normalized);
	if (!Number.isFinite(num)) return null;
	return Math.round(num * 100) / 100;
}

function isValidScoreCell(value: unknown): boolean {
	if (value == null || (typeof value === 'string' && value.trim() === '')) return true;
	const text = typeof value === 'string' ? value.trim() : String(value).trim();
	const num = Number(text.replace(',', '.'));
	return Number.isFinite(num) && num >= 0 && num <= 100;
}

function sanitizeBobot(value: number | null | undefined) {
	if (value == null || Number.isNaN(value)) return 0;
	const finite = Number(value);
	if (!Number.isFinite(finite) || finite <= 0) return 0;
	return Math.round(finite * 100) / 100;
}

function normalizeLingkup(value: string | null | undefined) {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : 'Tanpa lingkup materi';
}

function deriveLingkupBobot(
	tujuanList: Array<{ lingkupMateri: string | null; bobot: number | null }>
) {
	const groups = new Map<string, { bobot: number; isManual: boolean }>();

	for (const tujuan of tujuanList) {
		const lingkup = normalizeLingkup(tujuan.lingkupMateri);
		const sanitized = sanitizeBobot(tujuan.bobot);
		const existing = groups.get(lingkup);
		if (!existing) {
			groups.set(lingkup, { bobot: sanitized, isManual: sanitized > 0 });
			continue;
		}
		if (!existing.isManual && sanitized > 0) {
			existing.bobot = sanitized;
			existing.isManual = true;
		}
	}

	let manualSum = 0;
	const autoKeys: string[] = [];

	for (const [key, entry] of groups.entries()) {
		if (entry.isManual && entry.bobot > 0) {
			manualSum += entry.bobot;
		} else {
			autoKeys.push(key);
		}
	}

	let remaining = 100 - manualSum;
	if (!Number.isFinite(remaining) || remaining < 0) {
		remaining = 0;
	}

	const autoValue = autoKeys.length > 0 ? Math.round((remaining / autoKeys.length) * 100) / 100 : 0;

	const result = new Map<string, number>();

	for (const [key, entry] of groups.entries()) {
		if (entry.isManual && entry.bobot > 0) {
			result.set(key, entry.bobot);
		} else {
			result.set(key, autoKeys.length > 0 ? autoValue : 0);
		}
	}

	return result;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Silakan login terlebih dahulu.' }, { status: 401 });
	if (!isAuthorizedUser(['input_nilai_asesmen_sumatif'], locals.user)) {
		return json({ error: 'Anda tidak memiliki izin mengimpor nilai sumatif.' }, { status: 403 });
	}
	const contentType = request.headers.get('content-type') || '';
	if (!contentType.toLowerCase().includes('multipart/form-data')) {
		return new Response(JSON.stringify({ error: 'Content-Type harus multipart/form-data' }), {
			status: 400
		});
	}

	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const kelasId = Number(formData.get('kelas_id') ?? NaN);
	const mapelIdRaw = String(formData.get('mapel_id') ?? '');

	if (!file) {
		return new Response(JSON.stringify({ error: 'File tidak ditemukan pada request.' }), {
			status: 400
		});
	}

	if (!Number.isInteger(kelasId)) {
		return new Response(JSON.stringify({ error: 'kelas_id tidak valid.' }), { status: 400 });
	}

	const sekolahId = locals.sekolah?.id ?? null;
	if (!sekolahId) {
		return new Response(JSON.stringify({ error: 'Sekolah aktif tidak ditemukan.' }), {
			status: 401
		});
	}

	// Read file buffer
	if (!(await canAccessKelas(locals.user, sekolahId, kelasId))) {
		return json({ error: 'Anda tidak memiliki akses ke kelas ini.' }, { status: 403 });
	}
	const kelasMapels = await db.query.tableMataPelajaran.findMany({
		columns: { id: true, nama: true },
		where: eq(tableMataPelajaran.kelasId, kelasId),
		orderBy: [asc(tableMataPelajaran.nama)]
	});
	const akses = needsMapelFilter(locals.user, kelasId)
		? await getAksesMapelUser(locals.user, kelasId)
		: null;
	const canImportMapel = (mapel: { id: number; nama: string }) =>
		!akses || akses.ids.has(mapel.id) || akses.names.has(normalizeText(mapel.nama));
	const selectedMapel = kelasMapels.find((mapel) => mapel.id === Number(mapelIdRaw));
	if (!selectedMapel && mapelIdRaw !== 'agama' && mapelIdRaw !== 'pks') {
		return json(
			{ error: 'Mata pelajaran tidak sesuai dengan kelas yang dipilih.' },
			{ status: 400 }
		);
	}
	const selectedName =
		selectedMapel?.nama ?? (mapelIdRaw === 'agama' ? AGAMA_BASE_SUBJECT : PKS_BASE_SUBJECT);
	if (!canImportMapel({ id: selectedMapel?.id ?? 0, nama: selectedName })) {
		return json({ error: 'Anda tidak memiliki akses ke mata pelajaran ini.' }, { status: 403 });
	}

	const arrayBuffer = await file.arrayBuffer();
	const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'));
	type WorkbookLike = {
		xlsx: { load(buffer: Buffer): Promise<void>; writeBuffer(): Promise<ArrayBuffer> };
		worksheets?: unknown[];
		getRow?: (n: number) => unknown;
		addWorksheet?: unknown;
	};
	const ExcelJSImport = ExcelJS as unknown as { Workbook: { new (): WorkbookLike } };
	const workbook = new ExcelJSImport.Workbook();
	await workbook.xlsx.load(Buffer.from(arrayBuffer));
	const sheet = workbook.worksheets?.[0];
	if (!sheet) {
		return new Response(JSON.stringify({ error: 'Sheet Excel tidak ditemukan.' }), { status: 400 });
	}

	// Determine columns and groups using header rows (row 3 contains group starts, row 4 TP labels)
	const sheetAny = sheet as unknown as {
		getRow(n: number): { getCell(c: number): { value: unknown } };
		columnCount: number;
		rowCount: number;
	};
	const headerRowGroups = sheetAny.getRow(3);
	const lastCol = sheetAny.columnCount;

	// Build group name per column by scanning row 3 left-to-right. This handles merged
	// header cells where the group name appears only on the first column of the group.
	const groupNameByCol: string[] = [];
	let currentGroupName = '';
	for (let c = 2; c <= lastCol; c++) {
		const cell = headerRowGroups.getCell(c);
		const val = cell && cell.value != null ? String(cell.value).trim() : '';
		if (val) currentGroupName = val;
		groupNameByCol[c] = currentGroupName;
	}

	// Derive contiguous group ranges from groupNameByCol
	type Group = { name: string; start: number; end: number };
	const groups: Group[] = [];
	let gStart = 2;
	let gName = groupNameByCol[2] || '';
	for (let c = 3; c <= lastCol + 1; c++) {
		const name = groupNameByCol[c] ?? '';
		if (name !== gName || c === lastCol + 1) {
			groups.push({ name: gName, start: gStart, end: c - 1 });
			gStart = c;
			gName = name;
		}
	}

	if (groups.length < 2) {
		return new Response(
			JSON.stringify({ error: 'Format sheet tidak sesuai: tidak ada group TP yang valid.' }),
			{ status: 400 }
		);
	}

	// Identify STS and SAS groups by their names (the template appends these exact names)
	const stsGroupIndex = groups.findIndex((g) => /Sumatif Tengah Semester/i.test(g.name));
	const sasGroupIndex = groups.findIndex((g) => /Sumatif Akhir Semester/i.test(g.name));
	if (stsGroupIndex === -1 || sasGroupIndex === -1) {
		return new Response(
			JSON.stringify({
				error: 'Format sheet tidak sesuai: tidak menemukan grup Sumatif Tengah/Akhir Semester.'
			}),
			{ status: 400 }
		);
	}

	const secondLastGroup = groups[stsGroupIndex];
	const lastGroup = groups[sasGroupIndex];

	// Lingkup groups are all groups except STS and SAS, preserving original order
	const lingkupGroups = groups.filter((g, idx) => idx !== stsGroupIndex && idx !== sasGroupIndex);

	// Build ordered list of TP column indices (left-to-right across lingkup groups)
	const tpColumnIndices: number[] = [];
	for (const g of lingkupGroups) {
		for (let c = g.start; c <= g.end; c++) tpColumnIndices.push(c);
	}

	// Read students starting row 5 until empty name cell
	const startRow = 5;
	const students: { rowIndex: number; name: string; values: (number | null)[] }[] = [];
	for (let r = startRow; r <= sheetAny.rowCount; r++) {
		const row = sheetAny.getRow(r);
		const nameCell = row.getCell(1);
		const name = nameCell && nameCell.value != null ? String(nameCell.value).trim() : '';
		if (!name) continue;
		const vals: (number | null)[] = [];
		for (let c = 2; c <= lastCol; c++) {
			const rawValue = (row.getCell(c) as { value: unknown }).value;
			if (!isValidScoreCell(rawValue)) {
				return new Response(
					JSON.stringify({
						error: `Nilai pada baris ${r}, kolom ${c} harus berupa angka 0 sampai 100.`
					}),
					{ status: 400 }
				);
			}
			const v = parseNumericCell(rawValue);
			vals.push(v);
		}
		students.push({ rowIndex: r, name, values: vals });
	}

	if (!students.length) {
		return new Response(JSON.stringify({ error: 'Tidak ada baris murid terdeteksi pada file.' }), {
			status: 400
		});
	}

	// Load kelas mapel list (needed for agama resolution)

	// Find agama base and variants in kelas
	const agamaBase =
		kelasMapels.find((m) => normalizeText(m.nama) === normalizeText(AGAMA_BASE_SUBJECT)) ?? null;
	const pksBase =
		kelasMapels.find((m) => normalizeText(m.nama) === normalizeText(PKS_BASE_SUBJECT)) ?? null;

	const results: { imported: number; skipped: number; errors: string[] } = {
		imported: 0,
		skipped: 0,
		errors: []
	};

	// Cache tujuan lists per mapel for mapping TP columns to tujuan IDs
	const tujuanCache = new Map<
		number,
		Array<{ id: number; lingkupMateri: string | null; bobot: number | null }>
	>();

	// transaction: upsert tujuan-level scores and aggregates for each found student
	const now = new Date().toISOString();
	await db.transaction(async (tx) => {
		for (const s of students) {
			// find murid by kelasId and name case-insensitive
			const mur = await tx.query.tableMurid.findFirst({
				columns: { id: true, nama: true, agama: true },
				where: and(
					eq(tableMurid.sekolahId, sekolahId),
					eq(tableMurid.kelasId, kelasId),
					eq(tableMurid.nama, s.name)
				)
			});
			let muridRecord = mur;
			if (!muridRecord) {
				// Try case-insensitive search
				const allInKelas = await tx.query.tableMurid.findMany({
					columns: { id: true, nama: true, agama: true },
					where: and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, kelasId))
				});
				const found = allInKelas.find((m) => normalizeText(m.nama) === normalizeText(s.name));
				if (found) muridRecord = found;
			}

			if (!muridRecord) {
				results.skipped += 1;
				results.errors.push(`Murid tidak ditemukan untuk baris ${s.rowIndex}: "${s.name}"`);
				continue;
			}

			// Determine mapel id for this student
			let targetMapelId: number | null = null;
			const maybeNumeric = Number(mapelIdRaw);
			if (Number.isInteger(maybeNumeric) && maybeNumeric > 0) {
				targetMapelId = maybeNumeric;
			} else {
				// grouped selection ('agama'/'pks'): resolve by student's agama.
				// Varian agama DAN PKS wajib dipisah — tanpa ini varian agama selalu
				// menang dan import PKS jatuh ke mapel agama.
				const isPksMode = mapelIdRaw === 'pks';
				const agamaVariantName = resolveAgamaVariantName(muridRecord.agama);
				const pksVariantName = resolvePksVariantName(muridRecord.agama);

				if (!isPksMode && agamaVariantName) {
					const variantRecord = kelasMapels.find(
						(rec) => normalizeText(rec.nama) === normalizeText(agamaVariantName)
					);
					if (variantRecord) targetMapelId = variantRecord.id;
				}
				if (!targetMapelId && !isPksMode && agamaBase) targetMapelId = agamaBase.id;

				if (isPksMode && pksVariantName) {
					const variantRecord = kelasMapels.find(
						(rec) => normalizeText(rec.nama) === normalizeText(pksVariantName)
					);
					if (variantRecord) targetMapelId = variantRecord.id;
				}
				if (!targetMapelId && isPksMode && pksBase) targetMapelId = pksBase.id;
			}

			if (!targetMapelId) {
				results.skipped += 1;
				results.errors.push(`Tidak dapat menentukan mata pelajaran untuk murid ${s.name}`);
				continue;
			}

			// (naLingkup will be computed later using tujuan metadata and bobot)
			const targetMapel = kelasMapels.find((mapel) => mapel.id === targetMapelId);
			if (!targetMapel || !canImportMapel(targetMapel)) {
				results.skipped += 1;
				results.errors.push(
					`Baris ${s.rowIndex}: tidak memiliki akses ke mata pelajaran murid ini.`
				);
				continue;
			}

			// STS group
			let stsTes: number | null = null;
			let stsNonTes: number | null = null;
			if (secondLastGroup) {
				stsTes = parseNumericCell(
					(sheetAny.getRow(s.rowIndex).getCell(secondLastGroup.start) as { value: unknown }).value
				);
				if (secondLastGroup.end >= secondLastGroup.start + 1)
					stsNonTes = parseNumericCell(
						(sheetAny.getRow(s.rowIndex).getCell(secondLastGroup.start + 1) as { value: unknown })
							.value
					);
			}

			// SAS group (lastGroup)
			let sasTes: number | null = null;
			let sasNonTes: number | null = null;
			if (lastGroup) {
				sasTes = parseNumericCell(
					(sheetAny.getRow(s.rowIndex).getCell(lastGroup.start) as { value: unknown }).value
				);
				if (lastGroup.end >= lastGroup.start + 1)
					sasNonTes = parseNumericCell(
						(sheetAny.getRow(s.rowIndex).getCell(lastGroup.start + 1) as { value: unknown }).value
					);
			}

			const stsValues = [stsTes, stsNonTes].filter((v): v is number => v != null);
			const sts = stsValues.length
				? Math.round((stsValues.reduce((a, b) => a + b, 0) / stsValues.length) * 100) / 100
				: null;

			const sasValues = [sasTes, sasNonTes].filter((v): v is number => v != null);
			const sas = sasValues.length
				? Math.round((sasValues.reduce((a, b) => a + b, 0) / sasValues.length) * 100) / 100
				: null;

			// (nilaiAkhir will be computed after naLingkup is derived below)

			// Map TP columns to tujuanPembelajaran IDs for this mapel and upsert per-tujuan scores
			// Fetch tujuan list with lingkup & bobot to map TP columns to tujuan and
			// to compute naLingkup using the same weighting algorithm as the form save.
			let tujuanList = tujuanCache.get(targetMapelId) ?? null;
			if (!tujuanList) {
				const raw = await tx.query.tableTujuanPembelajaran.findMany({
					columns: { id: true, lingkupMateri: true, bobot: true },
					where: eq(tableTujuanPembelajaran.mataPelajaranId, targetMapelId),
					orderBy: [asc(tableTujuanPembelajaran.lingkupMateri), asc(tableTujuanPembelajaran.id)]
				});
				tujuanList = raw.map((t) => ({ id: t.id, lingkupMateri: t.lingkupMateri, bobot: t.bobot }));
				tujuanCache.set(targetMapelId, tujuanList);
			}

			// Map TP columns to tujuan entries (left-to-right) and persist per-tujuan nilai
			const maxPairs = Math.min(tujuanList.length, tpColumnIndices.length);
			// Collect per-lingkup values to compute naLingkup with weights
			const perLingkupValues = new Map<string, number[]>();
			for (let i = 0; i < maxPairs; i++) {
				const tujuan = tujuanList[i];
				const colIndex = tpColumnIndices[i];
				const val = parseNumericCell(
					(sheetAny.getRow(s.rowIndex).getCell(colIndex) as { value: unknown }).value
				);
				const lingkupKey = normalizeLingkup(tujuan.lingkupMateri);
				if (!perLingkupValues.has(lingkupKey)) perLingkupValues.set(lingkupKey, []);
				if (val != null) perLingkupValues.get(lingkupKey)!.push(val);

				if (val == null) {
					await tx
						.delete(tableAsesmenSumatifTujuan)
						.where(
							and(
								eq(tableAsesmenSumatifTujuan.muridId, muridRecord.id),
								eq(tableAsesmenSumatifTujuan.tujuanPembelajaranId, tujuan.id)
							)
						);
				} else {
					await tx
						.insert(tableAsesmenSumatifTujuan)
						.values({
							muridId: muridRecord.id,
							mataPelajaranId: targetMapelId,
							tujuanPembelajaranId: tujuan.id,
							nilai: val,
							updatedAt: now
						})
						.onConflictDoUpdate({
							target: [
								tableAsesmenSumatifTujuan.muridId,
								tableAsesmenSumatifTujuan.tujuanPembelajaranId
							],
							set: { nilai: val, mataPelajaranId: targetMapelId, updatedAt: now }
						});
				}
			}

			// Compute naLingkup using tujuanList bobot grouping (replicate save action)
			const tujuanMeta: Array<{ lingkupMateri: string | null; bobot: number | null }> =
				tujuanList.map((t) => ({ lingkupMateri: t.lingkupMateri, bobot: t.bobot }));
			const lingkupBobotMap = deriveLingkupBobot(tujuanMeta);
			const grouped: Map<
				string,
				{
					bobot: number | null;
					values: number[];
				}
			> = new Map();

			for (const tujuan of tujuanList) {
				const lingkup = normalizeLingkup(tujuan.lingkupMateri);
				let group = grouped.get(lingkup);
				if (!group) {
					group = { bobot: lingkupBobotMap.get(lingkup) ?? null, values: [] };
					grouped.set(lingkup, group);
				}
			}

			// Fill grouped values from perLingkupValues
			for (const [lingkup, vals] of perLingkupValues.entries()) {
				const g = grouped.get(lingkup);
				if (g) g.values.push(...vals);
			}

			let weightedSum = 0;
			let totalWeight = 0;
			let averageSum = 0;
			let averageCount = 0;

			for (const group of grouped.values()) {
				if (!group.values.length) continue;
				const avg = group.values.reduce((total, value) => total + value, 0) / group.values.length;
				const roundedAvg = Math.round(avg * 100) / 100;
				averageSum += roundedAvg;
				averageCount += 1;
				const bobot = group.bobot ?? 0;
				if (bobot > 0) {
					weightedSum += roundedAvg * bobot;
					totalWeight += bobot;
				}
			}

			let naLingkup: number | null = null;
			if (totalWeight > 0) {
				naLingkup = Math.round((weightedSum / totalWeight) * 100) / 100;
			} else if (averageCount > 0) {
				naLingkup = Math.round((averageSum / averageCount) * 100) / 100;
			}

			// Compute final nilaiAkhir using sekolah-level weights (after naLingkup)
			const sekolah = await tx.query.tableSekolah.findFirst({
				columns: {
					sumatifBobotLingkup: true,
					sumatifBobotSts: true,
					sumatifBobotSas: true,
					sumatifBobotRtsLingkup: true,
					sumatifBobotRtsSts: true
				},
				where: eq(tableSekolah.id, sekolahId)
			});
			const baseWeights = {
				lingkup: Number(sekolah?.sumatifBobotLingkup ?? 60),
				sts: Number(sekolah?.sumatifBobotSts ?? 20),
				sas: Number(sekolah?.sumatifBobotSas ?? 20)
			};
			const effectiveWeights = sts == null ? { lingkup: 70, sts: 0, sas: 30 } : baseWeights;

			let weightedSumFinal = 0;
			let usedWeightFinal = 0;
			if (naLingkup != null) {
				weightedSumFinal += naLingkup * effectiveWeights.lingkup;
				usedWeightFinal += effectiveWeights.lingkup;
			}
			if (sts != null) {
				weightedSumFinal += sts * effectiveWeights.sts;
				usedWeightFinal += effectiveWeights.sts;
			}
			if (sas != null) {
				weightedSumFinal += sas * effectiveWeights.sas;
				usedWeightFinal += effectiveWeights.sas;
			}
			const nilaiAkhir =
				usedWeightFinal > 0 ? Math.round((weightedSumFinal / usedWeightFinal) * 100) / 100 : null;

			// Compute nilaiAkhirRTS using RTS bobot (lingkup + STS only, no SAS)
			const rtsBobotLingkup = Number(sekolah?.sumatifBobotRtsLingkup ?? 70);
			const rtsBobotSts = Number(sekolah?.sumatifBobotRtsSts ?? 30);

			let nilaiAkhirRts: number | null = null;
			let weightedRts = 0;
			let totalWeightRts = 0;
			if (naLingkup != null) {
				weightedRts += naLingkup * rtsBobotLingkup;
				totalWeightRts += rtsBobotLingkup;
			}
			if (sts != null) {
				weightedRts += sts * rtsBobotSts;
				totalWeightRts += rtsBobotSts;
			}
			if (totalWeightRts > 0) {
				nilaiAkhirRts = Math.round((weightedRts / totalWeightRts) * 100) / 100;
			}

			// Upsert into asesmen_sumatif
			await tx
				.insert(tableAsesmenSumatif)
				.values({
					muridId: muridRecord.id,
					mataPelajaranId: targetMapelId,
					naLingkup,
					stsTes,
					stsNonTes,
					sts,
					sasTes,
					sasNonTes,
					sas,
					nilaiAkhir,
					nilaiAkhirRts,
					updatedAt: now
				})
				.onConflictDoUpdate({
					target: [tableAsesmenSumatif.muridId, tableAsesmenSumatif.mataPelajaranId],
					set: {
						naLingkup,
						stsTes,
						stsNonTes,
						sts,
						sasTes,
						sasNonTes,
						sas,
						nilaiAkhir,
						nilaiAkhirRts,
						updatedAt: now
					}
				});

			results.imported += 1;
		}
	});

	return new Response(
		JSON.stringify({
			message: `Import selesai. Berhasil: ${results.imported}, Dilewati: ${results.skipped}`,
			details: results
		}),
		{ status: 200 }
	);
};

export const prerender = false;
