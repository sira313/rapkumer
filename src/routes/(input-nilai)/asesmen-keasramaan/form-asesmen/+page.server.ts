import db from '$lib/server/db';
import {
	tableAsesmenKeasramaan,
	tableKeasramaan,
	tableKeasramaanIndikator,
	tableMurid,
	tablePegawai
} from '$lib/server/db/schema';
import {
	ekstrakurikulerNilaiLabelByValue,
	ekstrakurikulerNilaiOptions,
	isEkstrakurikulerNilaiKategori,
	type EkstrakurikulerNilaiKategori
} from '$lib/ekstrakurikuler';
import { unflattenFormData } from '$lib/utils';
import { fail, redirect, error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

type NilaiMap = Record<number, EkstrakurikulerNilaiKategori>;

function sanitizeRedirect(value: string | null | undefined) {
	if (!value) return '/asesmen-keasramaan';
	let decoded: string;
	try {
		decoded = decodeURIComponent(value);
	} catch (err) {
		console.warn('Gagal mengurai redirect parameter', err);
		return '/asesmen-keasramaan';
	}
	if (!decoded.startsWith('/')) {
		return '/asesmen-keasramaan';
	}
	return decoded || '/asesmen-keasramaan';
}

export async function load({ parent, url, depends, locals }) {
	depends('app:asesmen-keasramaan:form');
	const { kelasAktif } = await parent();
	const meta: PageMeta = { title: 'Form Asesmen Keasramaan' };

	const muridIdParam = url.searchParams.get('murid_id');
	const keasramaanIdParam = url.searchParams.get('keasramaan_id');

	if (!muridIdParam || !keasramaanIdParam) {
		throw redirect(302, '/asesmen-keasramaan');
	}

	const muridId = Number(muridIdParam);
	const keasramaanId = Number(keasramaanIdParam);
	if (!Number.isInteger(muridId) || muridId <= 0) {
		throw error(400, 'Parameter murid tidak valid');
	}
	if (!Number.isInteger(keasramaanId) || keasramaanId <= 0) {
		throw error(400, 'Parameter Matev tidak valid');
	}

	const murid = await db.query.tableMurid.findFirst({
		columns: { id: true, nama: true, kelasId: true, waliAsuhNama: true },
		where: eq(tableMurid.id, muridId)
	});
	if (!murid) {
		throw error(404, 'Data murid tidak ditemukan');
	}

	const keasramaan = await db.query.tableKeasramaan.findFirst({
		columns: { id: true, nama: true, kelasId: true },
		where: eq(tableKeasramaan.id, keasramaanId)
	});
	if (!keasramaan) {
		throw error(404, 'Data Matev tidak ditemukan');
	}

	if (murid.kelasId !== keasramaan.kelasId) {
		throw error(403, 'Murid dan Matev tidak berada pada kelas yang sama');
	}

	if (kelasAktif?.id && kelasAktif.id !== murid.kelasId) {
		throw error(403, 'Murid tidak termasuk dalam kelas aktif');
	}

	// Wali_asuh: only allow assessing their own students
	const userWithType = locals.user as { type?: string; pegawaiId?: number } | null;
	if (userWithType?.type === 'wali_asuh' && userWithType.pegawaiId) {
		const peg = await db.query.tablePegawai.findFirst({
			columns: { nama: true },
			where: eq(tablePegawai.id, userWithType.pegawaiId)
		});
		const pegNama = peg?.nama?.trim().toLowerCase();
		const muridWali = (murid as { waliAsuhNama?: string | null }).waliAsuhNama;
		if (!pegNama || (muridWali?.trim().toLowerCase() ?? '') !== pegNama) {
			throw error(403, 'Anda hanya dapat menilai murid asuhan sendiri');
		}
	}

	// Get tujuan from all indikators in this keasramaan
	const tujuanRecords = await db.query.tableKeasramaanTujuan.findMany({
		columns: { id: true, deskripsi: true },
		with: {
			indikator: {
				columns: { keasramaanId: true, deskripsi: true, id: true }
			}
		}
	});

	const tujuan = tujuanRecords
		.filter((t) => t.indikator.keasramaanId === keasramaan.id)
		.map((t) => ({
			id: t.id,
			deskripsi: t.deskripsi,
			indikatorId: t.indikator.id,
			indikatorNama: t.indikator.deskripsi,
			indikatorDeskripsi: t.indikator.deskripsi
		}))
		.sort((a, b) => a.id - b.id);

	// Get all unique indikators for this keasramaan
	const indikatorRecords = await db.query.tableKeasramaanIndikator.findMany({
		columns: { id: true, deskripsi: true },
		where: eq(tableKeasramaanIndikator.keasramaanId, keasramaan.id)
	});

	const indikators = indikatorRecords
		.map((ind) => ({
			id: ind.id,
			nama: ind.deskripsi
		}))
		.sort((a, b) => a.id - b.id);

	const existing = await db.query.tableAsesmenKeasramaan.findMany({
		columns: { tujuanId: true, kategori: true },
		where: and(
			eq(tableAsesmenKeasramaan.muridId, murid.id),
			eq(tableAsesmenKeasramaan.keasramaanId, keasramaan.id)
		)
	});

	const nilaiByTujuan = existing.reduce<NilaiMap>((acc, row) => {
		if (isEkstrakurikulerNilaiKategori(row.kategori)) {
			acc[row.tujuanId] = row.kategori;
		}
		return acc;
	}, {});

	const backUrl = sanitizeRedirect(url.searchParams.get('redirect'));

	return {
		meta,
		murid: { id: murid.id, nama: murid.nama },
		keasramaan: { id: keasramaan.id, nama: keasramaan.nama },
		tujuan,
		indikators,
		nilaiByTujuan,
		kategoriOptions: ekstrakurikulerNilaiOptions,
		kategoriLabelByValue: ekstrakurikulerNilaiLabelByValue,
		backUrl
	};
}

export const actions = {
	save: async ({ request, locals }) => {
		const formData = await request.formData();
		const muridIdRaw = formData.get('muridId');
		const keasramaanIdRaw = formData.get('keasramaanId');

		if (!muridIdRaw || !keasramaanIdRaw) {
			return fail(400, { fail: 'Data murid atau Matev tidak lengkap' });
		}

		const muridId = Number(muridIdRaw);
		const keasramaanId = Number(keasramaanIdRaw);
		if (!Number.isInteger(muridId) || muridId <= 0) {
			return fail(400, { fail: 'Murid tidak valid' });
		}
		if (!Number.isInteger(keasramaanId) || keasramaanId <= 0) {
			return fail(400, { fail: 'Matev tidak valid' });
		}

		const muridRecord = await db.query.tableMurid.findFirst({
			columns: { id: true, kelasId: true, waliAsuhNama: true },
			where: eq(tableMurid.id, muridId)
		});
		if (!muridRecord) {
			return fail(404, { fail: 'Data murid tidak ditemukan' });
		}

		const keasramaanRecord = await db.query.tableKeasramaan.findFirst({
			columns: { id: true, kelasId: true },
			where: eq(tableKeasramaan.id, keasramaanId)
		});
		if (!keasramaanRecord) {
			return fail(404, { fail: 'Data Matev tidak ditemukan' });
		}

		if (muridRecord.kelasId !== keasramaanRecord.kelasId) {
			return fail(400, { fail: 'Murid dan Matev tidak berada pada kelas yang sama' });
		}

		// Wali_asuh: only allow assessing their own students
		const userWithType = locals.user as { type?: string; pegawaiId?: number } | null;
		if (userWithType?.type === 'wali_asuh' && userWithType.pegawaiId) {
			const peg = await db.query.tablePegawai.findFirst({
				columns: { nama: true },
				where: eq(tablePegawai.id, userWithType.pegawaiId)
			});
			const pegNama = peg?.nama?.trim().toLowerCase();
			const muridWali = muridRecord.waliAsuhNama;
			if (!pegNama || (muridWali?.trim().toLowerCase() ?? '') !== pegNama) {
				return fail(403, { fail: 'Anda hanya dapat menilai murid asuhan sendiri' });
			}
		}

		// Get all tujuan IDs for this keasramaan
		const tujuanRecords = await db.query.tableKeasramaanTujuan.findMany({
			columns: { id: true },
			with: {
				indikator: {
					columns: { keasramaanId: true }
				}
			}
		});
		const tujuanIdSet = new Set(
			tujuanRecords.filter((t) => t.indikator.keasramaanId === keasramaanRecord.id).map((t) => t.id)
		);

		const payload = unflattenFormData<{ nilai?: Record<string, FormDataEntryValue> }>(
			formData,
			false
		);
		const nilaiEntries = payload.nilai ?? {};

		const sanitized: Array<{ tujuanId: number; kategori: EkstrakurikulerNilaiKategori }> = [];

		for (const [tujuanKey, rawValue] of Object.entries(nilaiEntries)) {
			const tujuanId = Number(tujuanKey);
			if (!Number.isInteger(tujuanId) || !tujuanIdSet.has(tujuanId)) continue;
			const value = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue ?? '').trim();
			if (!value) continue;
			if (!isEkstrakurikulerNilaiKategori(value)) continue;
			sanitized.push({ tujuanId, kategori: value });
		}

		await db.transaction(async (tx) => {
			await tx
				.delete(tableAsesmenKeasramaan)
				.where(
					and(
						eq(tableAsesmenKeasramaan.muridId, muridRecord.id),
						eq(tableAsesmenKeasramaan.keasramaanId, keasramaanRecord.id)
					)
				);

			if (sanitized.length) {
				const now = new Date().toISOString();
				await tx.insert(tableAsesmenKeasramaan).values(
					sanitized.map((entry) => ({
						muridId: muridRecord.id,
						keasramaanId: keasramaanRecord.id,
						tujuanId: entry.tujuanId,
						kategori: entry.kategori,
						dinilaiPada: now,
						updatedAt: now
					}))
				);
			}
		});

		const message = sanitized.length
			? 'Nilai keasramaan berhasil disimpan'
			: 'Nilai keasramaan dibersihkan';

		return {
			message,
			nilai: sanitized.map((entry) => ({
				tujuanId: entry.tujuanId,
				kategori: entry.kategori,
				kategoriLabel: ekstrakurikulerNilaiLabelByValue[entry.kategori]
			}))
		};
	}
};
