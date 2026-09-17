import db from '$lib/server/db';
import {
	tableAuthUser,
	tableAuthUserKelas,
	tableAuthUserMataPelajaran,
	tableKelas,
	tableMataPelajaran,
	tablePegawai,
	tableSemester,
	tableSekolah
} from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { fail, error } from '@sveltejs/kit';
import { authority } from '../../utils.server';
import { defaultPermissionsByType } from '../../permissions';
import { ensurePegawaiConsolidation } from '../../consolidation.server';
import { hashPassword } from '$lib/server/auth';
import { validatePasswordStrength } from '$lib/server/password-policy';

const u = tableAuthUser;

const ALLOWED_USER_TYPES = ['admin', 'kepala_sekolah', 'wali_kelas', 'wali_asuh', 'user'] as const;

async function fetchSharedLists() {
	const [mataPelajaran, sekolahList, kelasListRaw] = await Promise.all([
		db
			.select({
				id: tableMataPelajaran.id,
				nama: tableMataPelajaran.nama,
				kelasId: tableMataPelajaran.kelasId
			})
			.from(tableMataPelajaran)
			.limit(1000),
		db.select({ id: tableSekolah.id, nama: tableSekolah.nama }).from(tableSekolah).limit(1000),
		db
			.select({
				id: tableKelas.id,
				nama: tableKelas.nama,
				fase: tableKelas.fase,
				sekolahId: tableKelas.sekolahId,
				tahunAjaranId: tableKelas.tahunAjaranId,
				semesterId: tableKelas.semesterId,
				semesterTipe: tableSemester.tipe
			})
			.from(tableKelas)
			.leftJoin(tableSemester, eq(tableKelas.semesterId, tableSemester.id))
			.limit(1000)
	]);

	const kelasList = (() => {
		const seen = new Map<string, (typeof kelasListRaw)[0]>();
		for (const kelas of kelasListRaw) {
			const key = `${kelas.nama ?? ''}_${kelas.tahunAjaranId ?? ''}`;
			const existing = seen.get(key);
			if (!existing) {
				seen.set(key, kelas);
			} else if (kelas.semesterTipe === 'ganjil' && existing.semesterTipe !== 'ganjil') {
				seen.set(key, kelas);
			}
		}
		return Array.from(seen.values()).map((k) => ({
			id: k.id,
			nama: k.nama,
			fase: k.fase,
			sekolahId: k.sekolahId
		}));
	})();

	return { mataPelajaran, sekolahList, kelasList };
}

export async function load({ params }) {
	authority(params.id ? 'user_set_permissions' : 'user_add');

	// Ensure wali_kelas/wali_asuh accounts + pegawai dedup are applied before
	// presenting the form (same once-per-process guard as the list page).
	await ensurePegawaiConsolidation();

	let userDetail = null;
	if (params.id) {
		const id = +params.id;
		if (!Number.isFinite(id)) error(400, 'ID pengguna tidak valid');

		const [user] = await db
			.select({
				id: u.id,
				username: u.username,
				type: u.type,
				pegawaiId: u.pegawaiId,
				pegawaiName: tablePegawai.nama,
				sekolahId: u.sekolahId,
				kelasId: u.kelasId
			})
			.from(u)
			.leftJoin(tablePegawai, eq(u.pegawaiId, tablePegawai.id))
			.where(eq(u.id, id));
		if (!user) error(404, 'Pengguna tidak ditemukan');

		const pegawaiId = user.pegawaiId ?? -1;
		const [mapelRows, kelasRows, waliKelas] = await Promise.all([
			db
				.select({ id: tableAuthUserMataPelajaran.mataPelajaranId })
				.from(tableAuthUserMataPelajaran)
				.where(eq(tableAuthUserMataPelajaran.authUserId, id)),
			db
				.select({ id: tableAuthUserKelas.kelasId })
				.from(tableAuthUserKelas)
				.where(eq(tableAuthUserKelas.authUserId, id)),
			db.select({ id: tableKelas.id }).from(tableKelas).where(eq(tableKelas.waliKelasId, pegawaiId))
		]);

		const kelasSet = new Set(kelasRows.map((r) => r.id));
		if (user.kelasId != null) kelasSet.add(user.kelasId);
		for (const wk of waliKelas) kelasSet.add(wk.id);

		userDetail = {
			...user,
			mataPelajaranIds: mapelRows.map((r) => r.id),
			kelasIds: Array.from(kelasSet),
			waliKelasIds: waliKelas.map((r) => r.id)
		};
	}

	const shared = await fetchSharedLists();
	return {
		meta: { title: params.id ? 'Edit Pengguna' : 'Tambah Pengguna' },
		userDetail,
		...shared
	};
}

export const actions = {
	save: async ({ params, request }) => {
		if (params.id) return updateUser(request, +params.id);
		return createUser(request);
	}
};

async function createUser(request: Request) {
	authority('user_add');
	const form = await request.formData();
	const username = String(form.get('username') ?? '').trim();
	const password = String(form.get('password') ?? '').trim();
	const nama = String(form.get('nama') ?? '').trim();
	const roleValue = String(form.get('type') ?? 'user');
	if (!(ALLOWED_USER_TYPES as readonly string[]).includes(roleValue)) {
		return fail(400, { message: 'Tipe pengguna tidak valid.' });
	}

	let mataPelajaranIds: number[] = [];
	const mpRaw = form.get('mataPelajaranIds');
	if (mpRaw) {
		try {
			const parsed = JSON.parse(String(mpRaw));
			if (Array.isArray(parsed)) mataPelajaranIds = parsed.map(Number).filter((n) => !isNaN(n));
		} catch {
			/* ignore */
		}
	}

	let kelasIds: number[] = [];
	const kelasRaw = form.get('kelasIds');
	if (kelasRaw) {
		try {
			const parsed = JSON.parse(String(kelasRaw));
			if (Array.isArray(parsed)) kelasIds = parsed.map(Number).filter((n) => !isNaN(n));
		} catch {
			/* ignore */
		}
	}

	const sekolahIdRaw = form.get('sekolahId');
	const sekolahId = sekolahIdRaw ? Number(String(sekolahIdRaw)) : null;

	if (!username) return fail(400, { message: 'Username wajib diisi.' });
	if (!password) return fail(400, { message: 'Kata sandi wajib diisi.' });

	const passwordError = validatePasswordStrength(password);
	if (passwordError) return fail(400, { message: passwordError });

	try {
		const { hash, salt } = hashPassword(password);
		const timestamp = new Date().toISOString();

		let pegawaiId: number | null = null;
		if (nama) {
			const [p] = await db
				.insert(tablePegawai)
				.values({ nama, nip: '' })
				.returning({ id: tablePegawai.id });
			if (p && typeof p.id === 'number') pegawaiId = p.id;
		}

		if (mataPelajaranIds.length === 0 && sekolahId && roleValue === 'user') {
			try {
				const mpList = await db
					.select({ id: tableMataPelajaran.id })
					.from(tableMataPelajaran)
					.leftJoin(tableKelas, eq(tableMataPelajaran.kelasId, tableKelas.id))
					.where(eq(tableKelas.sekolahId, sekolahId))
					.limit(1);
				if (mpList.length > 0 && mpList[0].id) {
					mataPelajaranIds = [mpList[0].id];
				}
			} catch {
				/* ignore */
			}
		}

		const permissions: string[] = [
			...(defaultPermissionsByType[roleValue as AuthUser['type']] ?? [])
		];
		if ((roleValue === 'user' || roleValue === 'wali_kelas') && kelasIds.length > 1) {
			permissions.push('kelas_pindah');
		}

		const insertData = {
			username,
			usernameNormalized: username.toLowerCase(),
			passwordHash: hash,
			passwordSalt: salt,
			passwordUpdatedAt: timestamp,
			permissions,
			type: roleValue,
			mataPelajaranId: mataPelajaranIds.length === 1 ? mataPelajaranIds[0] : undefined,
			kelasId: kelasIds.length > 0 ? kelasIds[0] : undefined,
			sekolahId: sekolahId ?? undefined,
			pegawaiId: pegawaiId ?? undefined,
			createdAt: timestamp,
			updatedAt: timestamp
		};

		// @ts-expect-error: drizzle type inference issue with spread
		await db.insert(tableAuthUser).values(insertData);

		const [created] = await db
			.select({
				id: u.id,
				username: u.username,
				createdAt: u.createdAt,
				type: u.type,
				passwordUpdatedAt: u.passwordUpdatedAt
			})
			.from(u)
			.where(eq(u.usernameNormalized, username.toLowerCase()))
			.orderBy(desc(u.id))
			.limit(1);

		if (!created) throw new Error('Failed to retrieve created user');

		for (const mapelId of mataPelajaranIds) {
			try {
				await db.insert(tableAuthUserMataPelajaran).values({
					authUserId: created.id,
					mataPelajaranId: mapelId,
					createdAt: timestamp,
					updatedAt: timestamp
				});
			} catch (err) {
				if (!String(err).includes('UNIQUE')) throw err;
			}
		}

		for (const kelasIdItem of kelasIds) {
			try {
				await db.insert(tableAuthUserKelas).values({
					authUserId: created.id,
					kelasId: kelasIdItem,
					createdAt: timestamp,
					updatedAt: timestamp
				});
			} catch (err) {
				if (!String(err).includes('UNIQUE')) throw err;
			}
		}

		console.info(
			`[pengguna] Created user: ${username} -> id=${created.id}, mapels=${mataPelajaranIds.length}, kelas=${kelasIds.length}`
		);

		return {
			message: 'Pengguna dibuat',
			success: true,
			user: created,
			displayName: nama,
			mataPelajaranIds,
			kelasIds
		};
	} catch (err: unknown) {
		console.error('Failed to create user', err);
		const e = err as Record<string, unknown>;
		const cause = (e.cause as Record<string, unknown> | undefined) ?? undefined;
		const causeMsg = (
			(cause && String(cause.message)) ||
			(e.message && String(e.message)) ||
			String(err)
		).toString();
		if (
			causeMsg.includes('UNIQUE constraint failed') &&
			causeMsg.includes('auth_user.username_normalized')
		) {
			return fail(400, { message: 'Username sudah digunakan' });
		}
		return fail(500, { message: 'Internal Error' });
	}
}

async function updateUser(request: Request, id: number) {
	authority('user_set_permissions');
	const form = await request.formData();

	const username = String(form.get('username') ?? '').trim();
	const password = String(form.get('password') ?? '').trim();
	const nama = String(form.get('nama') ?? '').trim();
	const roleValue = String(form.get('type') ?? 'user');
	if (!(ALLOWED_USER_TYPES as readonly string[]).includes(roleValue)) {
		return fail(400, { message: 'Tipe pengguna tidak valid.' });
	}

	if (!username) return fail(400, { message: 'Username wajib diisi.' });

	let mataPelajaranIds: number[] = [];
	const mpRaw = form.get('mataPelajaranIds');
	if (mpRaw) {
		try {
			const parsed = JSON.parse(String(mpRaw));
			if (Array.isArray(parsed)) mataPelajaranIds = parsed.map(Number).filter((n) => !isNaN(n));
		} catch {
			/* ignore */
		}
	}

	let kelasIds: number[] = [];
	const kelasRaw = form.get('kelasIds');
	if (kelasRaw) {
		try {
			const parsed = JSON.parse(String(kelasRaw));
			if (Array.isArray(parsed)) kelasIds = parsed.map(Number).filter((n) => !isNaN(n));
		} catch {
			/* ignore */
		}
	}

	const sekolahId = form.get('sekolahId') ? Number(form.get('sekolahId')) : null;
	if (sekolahId) {
		const exists = await db.query.tableSekolah.findFirst({
			columns: { id: true },
			where: eq(tableSekolah.id, sekolahId)
		});
		if (!exists) return fail(400, { message: 'Sekolah tidak valid.' });
	}

	try {
		const existing = await db.query.tableAuthUser.findFirst({
			columns: { id: true, pegawaiId: true, username: true, usernameNormalized: true },
			where: eq(u.id, id)
		});
		if (!existing) return fail(404, { message: 'Pengguna tidak ditemukan.' });

		let hashedPassword: { hash: string; salt: string } | null = null;
		if (password) {
			const passwordError = validatePasswordStrength(password);
			if (passwordError) return fail(400, { message: passwordError });
			hashedPassword = hashPassword(password);
		}

		await db.transaction(async (tx) => {
			const updateData: Record<string, unknown> = {};
			if (username !== existing.username) {
				updateData.username = username;
				updateData.usernameNormalized = username.toLowerCase();
			}
			if (hashedPassword) {
				updateData.passwordHash = hashedPassword.hash;
				updateData.passwordSalt = hashedPassword.salt;
				updateData.passwordUpdatedAt = new Date().toISOString();
			}
			updateData.type = roleValue;
			updateData.sekolahId = sekolahId ?? null;
			updateData.updatedAt = new Date().toISOString();
			updateData.mataPelajaranId = mataPelajaranIds.length === 1 ? mataPelajaranIds[0] : null;
			updateData.kelasId = kelasIds.length > 0 ? kelasIds[0] : null;

			if (Object.keys(updateData).length > 0) {
				await tx.update(u).set(updateData).where(eq(u.id, id));
			}

			if (nama && existing.pegawaiId) {
				await tx.update(tablePegawai).set({ nama }).where(eq(tablePegawai.id, existing.pegawaiId));
			} else if (nama && !existing.pegawaiId) {
				const [p] = await tx
					.insert(tablePegawai)
					.values({ nama, nip: '' })
					.returning({ id: tablePegawai.id });
				if (p) await tx.update(u).set({ pegawaiId: p.id }).where(eq(u.id, id));
			}

			await tx
				.delete(tableAuthUserMataPelajaran)
				.where(eq(tableAuthUserMataPelajaran.authUserId, id));
			const ts = new Date().toISOString();
			for (const mpId of mataPelajaranIds) {
				try {
					await tx.insert(tableAuthUserMataPelajaran).values({
						authUserId: id,
						mataPelajaranId: mpId,
						createdAt: ts,
						updatedAt: ts
					});
				} catch (err) {
					if (!String(err).includes('UNIQUE')) throw err;
				}
			}

			await tx.delete(tableAuthUserKelas).where(eq(tableAuthUserKelas.authUserId, id));
			for (const kId of kelasIds) {
				try {
					await tx.insert(tableAuthUserKelas).values({
						authUserId: id,
						kelasId: kId,
						createdAt: ts,
						updatedAt: ts
					});
				} catch (err) {
					if (!String(err).includes('UNIQUE')) throw err;
				}
			}

			if (roleValue === 'user' || roleValue === 'wali_kelas') {
				const [cur] = await tx.select({ permissions: u.permissions }).from(u).where(eq(u.id, id));
				const perms = cur?.permissions ?? [];
				const hasPindah = perms.includes('kelas_pindah');
				if (kelasIds.length > 1 && !hasPindah) {
					await tx
						.update(u)
						.set({ permissions: [...perms, 'kelas_pindah'] })
						.where(eq(u.id, id));
				} else if (kelasIds.length <= 1 && hasPindah) {
					await tx
						.update(u)
						.set({ permissions: perms.filter((p) => p !== 'kelas_pindah') })
						.where(eq(u.id, id));
				}
			}
		});

		const [updated] = await db
			.select({
				id: u.id,
				username: u.username,
				type: u.type,
				passwordUpdatedAt: u.passwordUpdatedAt
			})
			.from(u)
			.where(eq(u.id, id));

		console.info(
			`[pengguna] Updated user: id=${id}, username=${username}, type=${roleValue}, mapels=${mataPelajaranIds.length}, kelas=${kelasIds.length}`
		);

		return {
			message: 'Pengguna diperbarui',
			success: true,
			user: updated,
			displayName: nama,
			mataPelajaranIds,
			kelasIds
		};
	} catch (err) {
		console.error('Failed to update user', err);
		const e = err as Record<string, unknown>;
		const cause = (e.cause as Record<string, unknown> | undefined) ?? undefined;
		const causeMsg = (
			(cause && String(cause.message)) ||
			(e.message && String(e.message)) ||
			String(err)
		).toString();
		if (
			causeMsg.includes('UNIQUE constraint failed') &&
			causeMsg.includes('auth_user.username_normalized')
		) {
			return fail(400, { message: 'Username sudah digunakan' });
		}
		return fail(500, { message: 'Gagal memperbarui pengguna' });
	}
}
