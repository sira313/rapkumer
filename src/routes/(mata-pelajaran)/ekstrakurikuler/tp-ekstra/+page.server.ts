import db from '$lib/server/db';
import { tableEkstrakurikuler, tableEkstrakurikulerTujuan } from '$lib/server/db/schema';
import { fail, redirect, error } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { authority } from '../../../pengguna/utils.server';

const TABLE_EKSTRA_MISSING_MESSAGE =
	'Tabel ekstrakurikuler belum tersedia. Jalankan "pnpm db:push" untuk menerapkan migrasi terbaru.';
const TABLE_TUJUAN_MISSING_MESSAGE =
	'Tabel tujuan ekstrakurikuler belum tersedia. Jalankan "pnpm db:push" untuk menerapkan migrasi terbaru.';

function isTableMissingError(error: unknown, tableName: string) {
	return (
		error instanceof Error &&
		error.message.includes('no such table') &&
		error.message.includes(tableName)
	);
}

export async function load({ depends, url, parent }) {
	const { kelasAktif, user } = await parent();

	// Permission check: Allow admin, wali_kelas, wali_asuh, and users with rapor_manage
	const userType = (user as { type?: string } | null)?.type;
	if (
		userType !== 'admin' &&
		userType !== 'kepala_sekolah' &&
		userType !== 'wali_kelas' &&
		userType !== 'wali_asuh'
	) {
		authority('mata_pelajaran_ekstrakurikuler');
	}

	depends('app:ekstrakurikuler:tp');
	const ekstrakurikulerIdParam = url.searchParams.get('ekstrakurikulerId');

	if (!ekstrakurikulerIdParam) {
		throw redirect(302, '/ekstrakurikuler');
	}

	const ekstrakurikulerId = Number(ekstrakurikulerIdParam);
	if (!Number.isInteger(ekstrakurikulerId)) {
		throw error(400, 'ID ekstrakurikuler tidak valid');
	}

	let ekstrakurikuler: Ekstrakurikuler | null;
	let tujuan: EkstrakurikulerTujuan[];
	let tujuanTableReady = true;

	try {
		ekstrakurikuler =
			(await db.query.tableEkstrakurikuler.findFirst({
				where: eq(tableEkstrakurikuler.id, ekstrakurikulerId)
			})) ?? null;
	} catch (err) {
		if (isTableMissingError(err, 'ekstrakurikuler')) {
			throw error(500, TABLE_EKSTRA_MISSING_MESSAGE);
		}
		throw err;
	}

	if (!ekstrakurikuler) {
		throw error(404, 'Ekstrakurikuler tidak ditemukan');
	}

	if (kelasAktif?.id && ekstrakurikuler.kelasId !== kelasAktif.id) {
		throw error(403, 'Ekstrakurikuler tidak termasuk dalam kelas aktif');
	}

	try {
		tujuan = await db.query.tableEkstrakurikulerTujuan.findMany({
			where: eq(tableEkstrakurikulerTujuan.ekstrakurikulerId, ekstrakurikulerId),
			orderBy: asc(tableEkstrakurikulerTujuan.createdAt)
		});
	} catch (err) {
		if (isTableMissingError(err, 'ekstrakurikuler_tujuan')) {
			tujuanTableReady = false;
			tujuan = [];
		} else {
			throw err;
		}
	}

	const meta: PageMeta = {
		title: `Tujuan Ekstrakurikuler · ${ekstrakurikuler.nama}`
	};

	return {
		meta,
		ekstrakurikuler,
		tujuan,
		tujuanTableReady
	};
}

export const actions = {
	create: async ({ request, locals }) => {
		// Allow admin, wali_kelas, wali_asuh, and users with rapor_manage
		const userType = (locals.user as { type?: string } | null)?.type;
		if (
			userType !== 'admin' &&
			userType !== 'kepala_sekolah' &&
			userType !== 'wali_kelas' &&
			userType !== 'wali_asuh'
		) {
			authority('mata_pelajaran_ekstrakurikuler');
		}

		const formData = await request.formData();
		const ekstrakurikulerIdRaw = formData.get('ekstrakurikulerId');
		const deskripsi = formData.get('deskripsi')?.toString().trim() ?? '';

		if (!ekstrakurikulerIdRaw) {
			return fail(400, { fail: 'Ekstrakurikuler tidak valid' });
		}

		const ekstrakurikulerId = Number(ekstrakurikulerIdRaw);
		if (!Number.isInteger(ekstrakurikulerId)) {
			return fail(400, { fail: 'Ekstrakurikuler tidak valid' });
		}

		if (!deskripsi) {
			return fail(400, { fail: 'Tujuan pembelajaran ekstrakurikuler wajib diisi' });
		}

		try {
			await db.insert(tableEkstrakurikulerTujuan).values({ ekstrakurikulerId, deskripsi });
		} catch (err) {
			if (isTableMissingError(err, 'ekstrakurikuler_tujuan')) {
				return fail(500, { fail: TABLE_TUJUAN_MISSING_MESSAGE });
			}
			if (isTableMissingError(err, 'ekstrakurikuler')) {
				return fail(500, { fail: TABLE_EKSTRA_MISSING_MESSAGE });
			}
			throw err;
		}

		return { message: 'Tujuan ekstrakurikuler berhasil ditambahkan' };
	},

	update: async ({ request, locals }) => {
		// Allow admin, wali_kelas, wali_asuh, and users with rapor_manage
		const userType = (locals.user as { type?: string } | null)?.type;
		if (
			userType !== 'admin' &&
			userType !== 'kepala_sekolah' &&
			userType !== 'wali_kelas' &&
			userType !== 'wali_asuh'
		) {
			authority('mata_pelajaran_ekstrakurikuler');
		}

		const formData = await request.formData();
		const idRaw = formData.get('id');
		const ekstrakurikulerIdRaw = formData.get('ekstrakurikulerId');
		const deskripsi = formData.get('deskripsi')?.toString().trim() ?? '';

		if (!idRaw) {
			return fail(400, { fail: 'ID tujuan tidak ditemukan' });
		}
		const id = Number(idRaw);
		if (!Number.isInteger(id) || id <= 0) {
			return fail(400, { fail: 'ID tujuan tidak valid' });
		}

		if (!ekstrakurikulerIdRaw) {
			return fail(400, { fail: 'Ekstrakurikuler tidak valid' });
		}
		const ekstrakurikulerId = Number(ekstrakurikulerIdRaw);
		if (!Number.isInteger(ekstrakurikulerId)) {
			return fail(400, { fail: 'Ekstrakurikuler tidak valid' });
		}

		if (!deskripsi) {
			return fail(400, { fail: 'Tujuan pembelajaran ekstrakurikuler wajib diisi' });
		}

		try {
			const updated = await db
				.update(tableEkstrakurikulerTujuan)
				.set({ deskripsi, updatedAt: new Date().toISOString() })
				.where(
					and(
						eq(tableEkstrakurikulerTujuan.id, id),
						eq(tableEkstrakurikulerTujuan.ekstrakurikulerId, ekstrakurikulerId)
					)
				)
				.returning({ id: tableEkstrakurikulerTujuan.id });

			if (!updated.length) {
				return fail(404, { fail: 'Tujuan ekstrakurikuler tidak ditemukan' });
			}
		} catch (err) {
			if (isTableMissingError(err, 'ekstrakurikuler_tujuan')) {
				return fail(500, { fail: TABLE_TUJUAN_MISSING_MESSAGE });
			}
			throw err;
		}

		return { message: 'Tujuan ekstrakurikuler berhasil diperbarui', id };
	},

	delete: async ({ request, locals }) => {
		// Allow admin, wali_kelas, wali_asuh, and users with rapor_manage
		const userType = (locals.user as { type?: string } | null)?.type;
		if (
			userType !== 'admin' &&
			userType !== 'kepala_sekolah' &&
			userType !== 'wali_kelas' &&
			userType !== 'wali_asuh'
		) {
			authority('mata_pelajaran_ekstrakurikuler');
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
			return fail(400, { fail: 'Pilih tujuan ekstrakurikuler yang akan dihapus' });
		}

		try {
			await db
				.delete(tableEkstrakurikulerTujuan)
				.where(inArray(tableEkstrakurikulerTujuan.id, ids));
		} catch (err) {
			if (isTableMissingError(err, 'ekstrakurikuler_tujuan')) {
				return fail(500, { fail: TABLE_TUJUAN_MISSING_MESSAGE });
			}
			throw err;
		}

		return { message: `${ids.length} tujuan ekstrakurikuler berhasil dihapus` };
	}
};
