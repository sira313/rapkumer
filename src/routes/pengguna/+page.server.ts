import db from '$lib/server/db';
import {
	tableAuthUser,
	tablePegawai,
	tableKelas,
	tableMataPelajaran,
	tableAuthUserMataPelajaran,
	tableAuthUserKelas,
	tableMurid
} from '$lib/server/db/schema';
import { tableSekolah } from '$lib/server/db/schema';
import { sql, eq, and, inArray } from 'drizzle-orm';
import { authority } from './utils.server';
import { hashPassword } from '$lib/server/auth';
import { validatePasswordStrength } from '$lib/server/password-policy';
import { ensurePegawaiConsolidation } from './consolidation.server';
import { fail } from '@sveltejs/kit';

const u = tableAuthUser;

export async function load({ url, locals }) {
	authority('user_list');

	// Ensure wali_kelas/wali_asuh accounts exist and duplicates are consolidated
	// (runs once per process). See consolidation.server.ts.
	await ensurePegawaiConsolidation();

	// TODO: implement pagination
	const q = url.searchParams.get('q');

	// Query users with joined pegawai and kelas
	// For multi-kelas wali, we need to aggregate ALL kelas they manage
	const usersRaw = await db
		.select({
			id: u.id,
			username: u.username,
			createdAt: u.createdAt,
			type: u.type,
			pegawaiId: u.pegawaiId,
			pegawaiName: tablePegawai.nama,
			kelasId: u.kelasId,
			kelasName: tableKelas.nama,
			passwordUpdatedAt: u.passwordUpdatedAt,
			sekolahId: u.sekolahId
		})
		.from(u)
		.leftJoin(tablePegawai, eq(u.pegawaiId, tablePegawai.id))
		.leftJoin(tableKelas, eq(u.kelasId, tableKelas.id))
		.where(
			and(
				// exclude admin users from the listing
				sql`${u.type} != ${'admin'}`,
				q ? sql` lower(${u.username}) like ${'%' + q.toLowerCase() + '%'}` : sql` true`
			)
		)
		.orderBy(u.id)
		.limit(1000);

	// Deduplicate by user ID
	const dedupedUsers = (() => {
		const map = new Map<number, (typeof usersRaw)[0]>();
		for (const row of usersRaw) {
			if (!map.has(row.id)) map.set(row.id, row);
		}
		return Array.from(map.values());
	})();

	// Derive every role a pegawai holds from relations, so rangkap accounts
	// (e.g. Kepala Sekolah + Wali Kelas A + Wali Kelas B) display all labels.
	const sekolahFilter = locals.sekolah?.id ? sql` AND sekolah_id = ${locals.sekolah.id}` : sql``;
	const [kelasBerwali, sekolahBerkepala, asuhCounts] = await Promise.all([
		db.query.tableKelas.findMany({
			columns: { id: true, nama: true, waliKelasId: true },
			where: sql`${tableKelas.waliKelasId} IS NOT NULL${sekolahFilter}`
		}),
		db
			.select({ pegawaiId: tableSekolah.kepalaSekolahId })
			.from(tableSekolah)
			.where(
				sql`${tableSekolah.kepalaSekolahId} IS NOT NULL${locals.sekolah?.id ? sql` AND ${tableSekolah.id} = ${locals.sekolah.id}` : sql``}`
			),
		db
			.select({ nama: tableMurid.waliAsuhNama, count: sql<number>`count(*)` })
			.from(tableMurid)
			.where(
				sql`${tableMurid.waliAsuhNama} IS NOT NULL AND trim(${tableMurid.waliAsuhNama}) != ''${sekolahFilter}`
			)
			.groupBy(tableMurid.waliAsuhNama)
	]);

	const waliKelasByPegawai = new Map<number, string[]>();
	const waliKelasIdsByPegawai = new Map<number, number[]>();
	for (const k of kelasBerwali) {
		if (!k.waliKelasId) continue;
		const arr = waliKelasByPegawai.get(k.waliKelasId) ?? [];
		arr.push(k.nama);
		waliKelasByPegawai.set(k.waliKelasId, arr);
		const idArr = waliKelasIdsByPegawai.get(k.waliKelasId) ?? [];
		idArr.push(k.id);
		waliKelasIdsByPegawai.set(k.waliKelasId, idArr);
	}
	const kepalaPegawaiIds = new Set(
		sekolahBerkepala.map((s) => s.pegawaiId).filter((id): id is number => id != null)
	);
	const asuhCountByName = new Map<string, number>();
	for (const r of asuhCounts) {
		const key = (r.nama ?? '').trim().toLowerCase();
		if (!key) continue;
		asuhCountByName.set(key, (asuhCountByName.get(key) ?? 0) + Number(r.count));
	}

	const typeLabel: Record<string, string> = {
		admin: 'Admin',
		kepala_sekolah: 'Kepala Sekolah',
		wali_kelas: 'Wali Kelas',
		wali_asuh: 'Wali Asuh',
		user: 'Guru'
	};

	// fetch mata pelajaran + many-to-many mapel/kelas assignments per user
	const allUserIds = dedupedUsers
		.map((r) => r.id)
		.filter((id): id is number => typeof id === 'number' && id > 0);
	const [mataPelajaran, userMapelRows, userKelasRows] = await Promise.all([
		db
			.select({
				id: tableMataPelajaran.id,
				nama: tableMataPelajaran.nama,
				kelasId: tableMataPelajaran.kelasId
			})
			.from(tableMataPelajaran)
			.limit(1000),
		allUserIds.length
			? db
					.select({
						userId: tableAuthUserMataPelajaran.authUserId,
						mataPelajaranId: tableAuthUserMataPelajaran.mataPelajaranId
					})
					.from(tableAuthUserMataPelajaran)
					.where(inArray(tableAuthUserMataPelajaran.authUserId, allUserIds))
			: [],
		allUserIds.length
			? db
					.select({
						userId: tableAuthUserKelas.authUserId,
						kelasId: tableAuthUserKelas.kelasId
					})
					.from(tableAuthUserKelas)
					.where(inArray(tableAuthUserKelas.authUserId, allUserIds))
			: []
	]);

	const mapelKelasMap = new Map<number, number>();
	for (const m of mataPelajaran) {
		if (m.kelasId != null) mapelKelasMap.set(m.id, m.kelasId);
	}
	const userMapelMap = new Map<number, number[]>();
	for (const row of userMapelRows) {
		const arr = userMapelMap.get(row.userId) ?? [];
		arr.push(row.mataPelajaranId);
		userMapelMap.set(row.userId, arr);
	}
	const userKelasMap = new Map<number, number[]>();
	for (const row of userKelasRows) {
		const arr = userKelasMap.get(row.userId) ?? [];
		arr.push(row.kelasId);
		userKelasMap.set(row.userId, arr);
	}

	const users = dedupedUsers.map((row) => {
		const roles: string[] = [];
		if (row.pegawaiId && kepalaPegawaiIds.has(row.pegawaiId)) roles.push('Kepala Sekolah');
		if (row.pegawaiId) {
			for (const nama of waliKelasByPegawai.get(row.pegawaiId) ?? []) roles.push(`Wali ${nama}`);
		}
		// Wali kelas sekaligus guru mapel di kelas LAIN dari kelas wallinya.
		if (row.type === 'wali_kelas' && row.pegawaiId != null) {
			const ownKelas = new Set(waliKelasIdsByPegawai.get(row.pegawaiId) ?? []);
			const arr = userMapelMap.get(row.id);
			if (arr && arr.length > 0) {
				const teachesOutsideOwn = arr.some((mpId) => {
					const kId = mapelKelasMap.get(mpId);
					return kId != null && !ownKelas.has(kId);
				});
				if (teachesOutsideOwn) roles.push('Guru');
			}
		}
		const asuhCount = asuhCountByName.get((row.pegawaiName ?? '').trim().toLowerCase()) ?? 0;
		if (asuhCount > 0 || row.type === 'wali_asuh') {
			roles.push(asuhCount > 0 ? `Wali Asuh (${asuhCount} murid)` : 'Wali Asuh');
		}
		if (!roles.length) roles.push(typeLabel[row.type] ?? row.type);
		return { ...row, roles };
	});

	// Attach mapelIds/kelasIds/waliKelasIds to each user for the edit form
	for (const user of users) {
		const uid = user.id as number;
		if (uid > 0) {
			const ids = new Set(userKelasMap.get(uid) ?? []);
			if (user.kelasId != null) ids.add(user.kelasId);
			if (user.pegawaiId != null) {
				for (const kid of waliKelasIdsByPegawai.get(user.pegawaiId) ?? []) ids.add(kid);
			}
			(user as Record<string, unknown>).mataPelajaranIds = userMapelMap.get(uid) ?? [];
			(user as Record<string, unknown>).kelasIds = Array.from(ids);
			(user as Record<string, unknown>).waliKelasIds =
				user.pegawaiId != null ? (waliKelasIdsByPegawai.get(user.pegawaiId) ?? []) : [];
		}
	}

	return { meta: { title: 'Manajemen Pengguna' }, users };
}

export const actions = {
	update_credentials: async ({ request }) => {
		authority('user_set_permissions');
		const form = await request.formData();
		const id = Number(form.get('id'));
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '').trim();

		const updateData: Record<string, unknown> = {};
		if (username) {
			updateData.username = username;
			updateData.usernameNormalized = username.toLowerCase();
		}
		if (password) {
			const passwordError = validatePasswordStrength(password);
			if (passwordError) {
				return fail(400, { message: passwordError });
			}
			const { hash, salt } = hashPassword(password);
			updateData.passwordHash = hash;
			updateData.passwordSalt = salt;
			updateData.passwordUpdatedAt = new Date().toISOString();
		}

		if (Object.keys(updateData).length === 0) {
			return fail(400, { message: 'Tidak ada perubahan' });
		}

		try {
			await db.update(u).set(updateData).where(eq(u.id, id));
			const [updated] = await db
				.select({
					id: u.id,
					username: u.username,
					usernameNormalized: u.usernameNormalized,
					passwordUpdatedAt: u.passwordUpdatedAt
				})
				.from(u)
				.where(eq(u.id, id));
			return { success: true, user: updated };
		} catch (err) {
			console.error('Failed to update user credentials', err);
			return fail(500, { message: 'Internal Error' });
		}
	},
	delete_users: async ({ request }) => {
		authority('user_delete');
		let ids: number[];
		try {
			// try JSON first
			const contentType = request.headers.get('content-type') || '';
			if (contentType.includes('application/json')) {
				const body = await request.json();
				ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
			} else {
				const form = await request.formData();
				const raw = String(form.get('ids') ?? '');
				// accept comma-separated ids
				ids = raw
					.split(',')
					.map((s) => Number(s))
					.filter(Boolean);
			}
		} catch (err) {
			console.warn('Failed to parse ids for deletion', err);
			return new Response('Invalid request', { status: 400 });
		}

		// only keep valid positive integers
		ids = ids.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
		if (!ids.length) return new Response('No ids provided', { status: 400 });

		try {
			// fetch candidate users and join pegawai/kelas to detect wali_kelas and get names
			const candidates = await db
				.select({
					id: tableAuthUser.id,
					type: tableAuthUser.type,
					username: tableAuthUser.username,
					pegawaiName: tablePegawai.nama,
					kelasName: tableKelas.nama
				})
				.from(tableAuthUser)
				.leftJoin(tablePegawai, eq(tableAuthUser.pegawaiId, tablePegawai.id))
				.leftJoin(tableKelas, eq(tableAuthUser.kelasId, tableKelas.id))
				.where(inArray(tableAuthUser.id, ids));

			const blocked = candidates.filter((c) => c.type === 'wali_kelas' || c.type === 'wali_asuh');
			if (blocked.length) {
				const messages = blocked.map((b) => {
					const name = b.pegawaiName || b.username || 'Pengguna';
					const kelas = b.kelasName || '';
					const role = b.type === 'wali_asuh' ? 'Wali Asuh' : 'Wali Kelas';
					if (b.type === 'wali_asuh') {
						return `${name} adalah ${role}, tidak dapat dihapus. Ubah wali asuh melalui menu Data Murid`;
					}
					return `${name} adalah ${role} ${kelas}, tidak dapat dihapus. Untuk menggantinya buka menu Data Kelas`;
				});
				return new Response(JSON.stringify({ type: 'warning', message: messages.join(' | ') }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				});
			}

			await db.delete(tableAuthUser).where(inArray(tableAuthUser.id, ids));
			return { success: true, deleted: ids };
		} catch (err) {
			console.error('Failed to delete users', err);
			return new Response(String(err), { status: 500 });
		}
	}
};
