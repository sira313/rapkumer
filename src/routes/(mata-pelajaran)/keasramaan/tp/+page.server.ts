import db from '$lib/server/db';
import {
	tableKeasramaan,
	tableKeasramaanIndikator,
	tableKeasramaanTujuan
} from '$lib/server/db/schema';
import { unflattenFormData } from '$lib/utils';
import { fail, redirect, error } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';

const TABLE_INDIKATOR_MISSING_MESSAGE =
	'Tabel indikator keasramaan belum tersedia. Jalankan "pnpm db:push" untuk menerapkan migrasi terbaru.';
const TABLE_TUJUAN_MISSING_MESSAGE =
	'Tabel tujuan keasramaan belum tersedia. Jalankan "pnpm db:push" untuk menerapkan migrasi terbaru.';

// Driver membungkus error SQL di dalam `cause`, jadi pesan asli ada di sana
function isTableMissingError(err: unknown, tableName: string) {
	const messages = [err instanceof Error ? err.message : '', getErrorCause(err)]
		.filter(Boolean)
		.join(' ');
	return messages.includes('no such table') && messages.includes(tableName);
}

function getErrorCause(err: unknown): string {
	const cause = (err as { cause?: unknown })?.cause;
	if (cause instanceof Error) return cause.message;
	return typeof cause === 'string' ? cause : '';
}

export async function load({ depends, url, parent }) {
	depends('app:keasramaan:tp');
	const { kelasAktif, user } = await parent();

	const indikatorIdParam = url.searchParams.get('indikatorId');

	if (!indikatorIdParam) {
		throw redirect(302, '/keasramaan');
	}

	const indikatorId = Number(indikatorIdParam);
	if (!Number.isInteger(indikatorId)) {
		throw error(400, 'ID indikator tidak valid');
	}

	let indikator:
		| (typeof tableKeasramaanIndikator.$inferSelect & {
				keasramaan: typeof tableKeasramaan.$inferSelect;
		  })
		| null = null;
	let tujuan: (typeof tableKeasramaanTujuan.$inferSelect)[] = [];
	let tujuanTableReady = true;

	try {
		indikator =
			(await db.query.tableKeasramaanIndikator.findFirst({
				where: eq(tableKeasramaanIndikator.id, indikatorId),
				with: { keasramaan: true }
			})) ?? null;
	} catch (err) {
		if (isTableMissingError(err, 'keasramaan_indikator')) {
			throw error(500, TABLE_INDIKATOR_MISSING_MESSAGE);
		}
		throw err;
	}

	if (!indikator) {
		throw error(404, 'Indikator tidak ditemukan');
	}

	if (kelasAktif?.id && indikator.keasramaan.kelasId !== kelasAktif.id) {
		throw error(403, 'Indikator tidak termasuk dalam kelas aktif');
	}

	try {
		tujuan = await db.query.tableKeasramaanTujuan.findMany({
			where: eq(tableKeasramaanTujuan.indikatorId, indikatorId),
			// id as tiebreaker so rows sharing createdAt keep insertion order
			orderBy: [asc(tableKeasramaanTujuan.createdAt), asc(tableKeasramaanTujuan.id)]
		});
	} catch (err) {
		if (isTableMissingError(err, 'keasramaan_tujuan')) {
			tujuanTableReady = false;
			tujuan = [];
		} else {
			throw err;
		}
	}

	const meta: PageMeta = {
		title: `Tujuan Pembelajaran Keasramaan · ${indikator.deskripsi}`
	};

	return {
		meta,
		indikator,
		tujuan,
		tujuanTableReady
	};
}

function canManageKeasramaan(user: unknown): boolean {
	if (!user || typeof user !== 'object') return false;
	const u = user as { type?: string };
	return (
		u.type === 'admin' ||
		u.type === 'kepala_sekolah' ||
		u.type === 'wali_kelas' ||
		u.type === 'wali_asuh'
	);
}

function collectDeskripsi(formData: FormData): string[] {
	const body = unflattenFormData<{ tujuan?: Record<string, { deskripsi?: string }> }>(formData);
	return Object.values(body.tujuan ?? {})
		.map((item) => (item?.deskripsi ?? '').trim())
		.filter((deskripsi) => deskripsi.length > 0);
}

export const actions = {
	create: async ({ request, locals }) => {
		if (!canManageKeasramaan(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}
		const formData = await request.formData();
		const indikatorIdRaw = formData.get('indikatorId');

		if (!indikatorIdRaw) {
			return fail(400, { fail: 'Indikator tidak valid' });
		}

		const indikatorId = Number(indikatorIdRaw);
		if (!Number.isInteger(indikatorId)) {
			return fail(400, { fail: 'Indikator tidak valid' });
		}

		const deskripsiList = collectDeskripsi(formData);

		if (deskripsiList.length === 0) {
			return fail(400, { fail: 'Tujuan pembelajaran keasramaan wajib diisi' });
		}

		try {
			await db
				.insert(tableKeasramaanTujuan)
				.values(deskripsiList.map((deskripsi) => ({ indikatorId, deskripsi })));
		} catch (err) {
			if (isTableMissingError(err, 'keasramaan_tujuan')) {
				return fail(500, { fail: TABLE_TUJUAN_MISSING_MESSAGE });
			}
			if (isTableMissingError(err, 'keasramaan_indikator')) {
				return fail(500, { fail: TABLE_INDIKATOR_MISSING_MESSAGE });
			}
			throw err;
		}

		return {
			message:
				deskripsiList.length === 1
					? 'Tujuan pembelajaran keasramaan berhasil ditambahkan'
					: `${deskripsiList.length} tujuan pembelajaran keasramaan berhasil ditambahkan`
		};
	},

	update: async ({ request, locals }) => {
		if (!canManageKeasramaan(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}
		const formData = await request.formData();
		const idRaw = formData.get('id');
		const indikatorIdRaw = formData.get('indikatorId');
		const deskripsi = formData.get('deskripsi')?.toString().trim() ?? '';

		if (!idRaw) {
			return fail(400, { fail: 'ID tujuan tidak ditemukan' });
		}
		const id = Number(idRaw);
		if (!Number.isInteger(id) || id <= 0) {
			return fail(400, { fail: 'ID tujuan tidak valid' });
		}

		if (!indikatorIdRaw) {
			return fail(400, { fail: 'Indikator tidak valid' });
		}
		const indikatorId = Number(indikatorIdRaw);
		if (!Number.isInteger(indikatorId)) {
			return fail(400, { fail: 'Indikator tidak valid' });
		}

		if (!deskripsi) {
			return fail(400, { fail: 'Tujuan pembelajaran keasramaan wajib diisi' });
		}

		try {
			const updated = await db
				.update(tableKeasramaanTujuan)
				.set({ deskripsi, updatedAt: new Date().toISOString() })
				.where(
					and(eq(tableKeasramaanTujuan.id, id), eq(tableKeasramaanTujuan.indikatorId, indikatorId))
				)
				.returning({ id: tableKeasramaanTujuan.id });

			if (!updated.length) {
				return fail(404, { fail: 'Tujuan pembelajaran keasramaan tidak ditemukan' });
			}
		} catch (err) {
			if (isTableMissingError(err, 'keasramaan_tujuan')) {
				return fail(500, { fail: TABLE_TUJUAN_MISSING_MESSAGE });
			}
			throw err;
		}

		return { message: 'Tujuan pembelajaran keasramaan berhasil diperbarui', id };
	},

	delete: async ({ request, locals }) => {
		if (!canManageKeasramaan(locals.user)) {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}
		const formData = await request.formData();
		const rawIds = formData.getAll('ids');
		const ids = Array.from(
			new Set(
				rawIds
					.map((value) => Number(value))
					.filter((value): value is number => Number.isInteger(value) && value > 0)
			)
		);

		if (!ids.length) {
			return fail(400, { fail: 'Pilih tujuan pembelajaran yang akan dihapus' });
		}

		try {
			await db.delete(tableKeasramaanTujuan).where(inArray(tableKeasramaanTujuan.id, ids));
		} catch (err) {
			if (isTableMissingError(err, 'keasramaan_tujuan')) {
				return fail(500, { fail: TABLE_TUJUAN_MISSING_MESSAGE });
			}
			throw err;
		}

		return { message: `${ids.length} tujuan pembelajaran berhasil dihapus` };
	}
};
