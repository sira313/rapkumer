import db from '$lib/server/db';
import { env } from '$env/dynamic/private';
import {
	tableAuthUser,
	tablePegawai,
	tableKelas,
	tableMataPelajaran,
	tableAuthUserMataPelajaran,
	tableAuthUserKelas,
	tableMurid,
	tableSemester
} from '$lib/server/db/schema';
import { tableSekolah } from '$lib/server/db/schema';
import { sql, eq, and, inArray, desc } from 'drizzle-orm';
import { authority } from './utils.server';
import { defaultPermissionsByType } from './permissions';
import { hashPassword } from '$lib/server/auth';
import { validatePasswordStrength } from '$lib/server/password-policy';
import { resolveUniqueUsername } from '$lib/server/usernames';
import { mergeAccountsUnderKepalaSekolah } from '$lib/server/pengguna-merge';
import { randomBytes } from 'node:crypto';
import { fail } from '@sveltejs/kit';

const u = tableAuthUser;

const ALLOWED_USER_TYPES = ['admin', 'kepala_sekolah', 'wali_kelas', 'wali_asuh', 'user'] as const;

// Run consolidation once per process, not on every page load.
// Handles pegawai dedup, wali_kelas/wali_asuh account creation, and cross-type merge.
let consolidationDone = false;

export async function load({ url, locals }) {
	authority('user_list');

	// Ensure there are auth_user entries for any kelas that has a wali_kelas assigned.
	// This mirrors `scripts/seed-wali-users.mjs` but runs lazily during the users page load
	// so admins don't need to run a separate seed script after importing old DBs.
	// Also support multi-kelas wali by auto-assigning 'kelas_pindah' permission.
	// CONSOLIDATION LOGIC: If multiple accounts exist for same pegawaiId, keep oldest and delete others
	// ALSO: Consolidate duplicate pegawai (same nama), keep oldest, merge auth_user references
	if (!consolidationDone)
		try {
			// STEP 0: Consolidate PEGAWAI duplicates (same nama) → keep oldest, merge auth_user
			const allPegawai = await db.query.tablePegawai.findMany({
				columns: { id: true, nama: true, createdAt: true }
			});

			// Group pegawai by (nama normalized) to find duplicates
			type PegawaiArray = { id: number; nama: string; createdAt: string }[];
			const pegawaiByName = new Map<string, PegawaiArray>();
			for (const peg of allPegawai) {
				const nameKey = (peg.nama || '').trim().toLowerCase();
				if (!nameKey) continue;
				const arr = pegawaiByName.get(nameKey) ?? [];
				arr.push(peg);
				pegawaiByName.set(nameKey, arr);
			}

			// For each pegawai name with duplicates
			for (const [nameKey, pegawaiGroup] of pegawaiByName.entries()) {
				if (pegawaiGroup.length > 1) {
					console.log(
						`[pengguna:consolidate] Found ${pegawaiGroup.length} pegawai with name "${nameKey}"`
					);
					// Sort by createdAt to find oldest
					const sorted = pegawaiGroup.sort((a, b) => {
						const aTime = new Date(a.createdAt || 0).getTime();
						const bTime = new Date(b.createdAt || 0).getTime();
						return aTime - bTime;
					});

					const keepPegawai = sorted[0];
					const deletePegawai = sorted.slice(1);

					// For each pegawai to delete
					for (const dup of deletePegawai) {
						console.log(
							`[pengguna:consolidate] Consolidating pegawai: keeping ID=${keepPegawai.id}, deleting ID=${dup.id}`
						);

						// Update all auth_user pointing to dup pegawai → point to keep pegawai instead
						const dupAuthUsers = await db.query.tableAuthUser.findMany({
							where: eq(tableAuthUser.pegawaiId, dup.id),
							columns: { id: true }
						});

						for (const au of dupAuthUsers) {
							await db
								.update(tableAuthUser)
								.set({ pegawaiId: keepPegawai.id })
								.where(eq(tableAuthUser.id, au.id));
							console.log(
								`[pengguna:consolidate] Updated auth_user ID=${au.id}: pegawaiId ${dup.id} → ${keepPegawai.id}`
							);
						}

						// Update all kelas pointing to dup pegawai → point to keep pegawai instead
						const dupKelas = await db.query.tableKelas.findMany({
							where: eq(tableKelas.waliKelasId, dup.id),
							columns: { id: true }
						});

						for (const k of dupKelas) {
							await db
								.update(tableKelas)
								.set({ waliKelasId: keepPegawai.id })
								.where(eq(tableKelas.id, k.id));
							console.log(
								`[pengguna:consolidate] Updated kelas ID=${k.id}: waliKelasId ${dup.id} → ${keepPegawai.id}`
							);
						}

						// Update any sekolah whose kepalaSekolahId points to the dup pegawai
						// → point to keep pegawai instead (prevents a dangling FK and keeps
						// the kepala sekolah account tied to the merged pegawai).
						const dupSekolah = await db.query.tableSekolah.findMany({
							where: eq(tableSekolah.kepalaSekolahId, dup.id),
							columns: { id: true }
						});
						for (const s of dupSekolah) {
							await db
								.update(tableSekolah)
								.set({ kepalaSekolahId: keepPegawai.id })
								.where(eq(tableSekolah.id, s.id));
							console.log(
								`[pengguna:consolidate] Updated sekolah ID=${s.id}: kepalaSekolahId ${dup.id} → ${keepPegawai.id}`
							);
						}

						// Now safe to delete duplicate pegawai
						await db.delete(tablePegawai).where(eq(tablePegawai.id, dup.id));
						console.warn(
							`[pengguna:consolidate] ✓ Deleted duplicate pegawai: ID=${dup.id}, nama="${nameKey}"`
						);
					}
				}
			}

			// FIRST: Global consolidation - find ALL pegawaiId that have multiple wali_kelas accounts, consolidate them
			const allWaliAccounts = await db.query.tableAuthUser.findMany({
				where: eq(tableAuthUser.type, 'wali_kelas'),
				columns: { id: true, pegawaiId: true, createdAt: true, username: true }
			});
			console.log('[pengguna:consolidate] Found wali_kelas accounts:', allWaliAccounts.length);

			// Group by pegawaiId
			type AuthUserArray = {
				id: number;
				username: string;
				createdAt: string;
				pegawaiId: number | null;
			}[];
			const accountsByPegawai = new Map<number, AuthUserArray>();
			for (const acc of allWaliAccounts) {
				if (!acc.pegawaiId) continue;
				const arr = accountsByPegawai.get(acc.pegawaiId) ?? [];
				arr.push(acc);
				accountsByPegawai.set(acc.pegawaiId, arr);
			}

			// For each pegawaiId with multiple accounts, keep oldest and delete rest
			for (const [pegawaiId, accounts] of accountsByPegawai.entries()) {
				if (accounts.length > 1) {
					console.log(
						`[pengguna:consolidate] Found ${accounts.length} accounts for pegawaiId=${pegawaiId}`
					);
					// Sort by createdAt
					const sorted = accounts.sort((a, b) => {
						const aTime = new Date(a.createdAt || 0).getTime();
						const bTime = new Date(b.createdAt || 0).getTime();
						return aTime - bTime;
					});

					// Keep first, delete rest
					const toDelete = sorted.slice(1);
					for (const dup of toDelete) {
						console.log(
							`[pengguna:consolidate] Deleting auth_user ID=${dup.id}, username="${dup.username}"`
						);
						await db.delete(tableAuthUser).where(eq(tableAuthUser.id, dup.id));
						console.warn(
							`[pengguna:consolidate] ✓ Deleted duplicate wali_kelas account: ID=${dup.id}, username="${dup.username}", pegawaiId=${pegawaiId}`
						);
					}
				}
			}

			// SECOND: Process current kelas and ensure accounts exist / permissions correct
			const kelasWithWali = await db.query.tableKelas.findMany({
				where: sql`${tableKelas.waliKelasId} IS NOT NULL`,
				columns: { id: true, waliKelasId: true }
			});

			// Group kelas by waliKelasId to detect multi-kelas scenarios
			const kelasGroupedByWali = new Map<number, typeof kelasWithWali>();
			for (const k of kelasWithWali) {
				if (!k.waliKelasId) continue;
				const arr = kelasGroupedByWali.get(k.waliKelasId) ?? [];
				arr.push(k);
				kelasGroupedByWali.set(k.waliKelasId, arr);
			}

			// Process each wali_kelas
			for (const [waliPegawaiId, kelasArr] of kelasGroupedByWali) {
				if (!waliPegawaiId || kelasArr.length === 0) continue;

				// Now consolidation already happened above, so find the kept account.
				// Prefer an existing wali_kelas account (never create duplicates); fall
				// back to a plain guru account for promotion below.
				const exists = await db.query.tableAuthUser.findFirst({
					where: eq(tableAuthUser.pegawaiId, waliPegawaiId),
					columns: { id: true, type: true, permissions: true },
					orderBy: sql`CASE ${tableAuthUser.type} WHEN 'wali_kelas' THEN 0 WHEN 'user' THEN 1 ELSE 2 END, ${tableAuthUser.id}`
				});

				if (!exists) {
					// Need to create new account for this wali
					// Use first kelas as the primary kelasId
					const firstKelas = kelasArr[0];

					// Fetch pegawai name
					const peg = await db.query.tablePegawai.findFirst({
						where: eq(tablePegawai.id, waliPegawaiId),
						columns: { nama: true }
					});
					const nama = (peg?.nama || '').trim();
					if (!nama) continue;

					const username = await resolveUniqueUsername(nama);
					const usernameNormalized = username.toLowerCase();
					const password = randomBytes(6).toString('base64url');
					const { hash, salt } = hashPassword(password);
					const timestamp = new Date().toISOString();

					// If wali has >1 kelas, include 'kelas_pindah' permission
					const permissions: UserPermission[] = [
						...(defaultPermissionsByType['wali_kelas'] ?? []),
						...(kelasArr.length > 1 ? (['kelas_pindah'] as UserPermission[]) : [])
					];

					await db.insert(tableAuthUser).values({
						username,
						usernameNormalized,
						passwordHash: hash,
						passwordSalt: salt,
						passwordUpdatedAt: timestamp,
						// password generated automatically → require a change at first login
						mustChangePassword: true,
						permissions,
						type: 'wali_kelas',
						pegawaiId: waliPegawaiId,
						kelasId: firstKelas.id,
						createdAt: timestamp,
						updatedAt: timestamp
					});

					const kelasLog = kelasArr.map((k) => k.id).join(', ');
					console.info(
						`[pengguna] Created user for wali_kelas ${nama} (kelas: ${kelasLog})${kelasArr.length > 1 ? ' [multi-kelas]' : ''}`
					);
				} else {
					// Account exists for this pegawai but may predate the wali assignment
					// (e.g. dapodik import created it as type='user'). Promote plain guru
					// accounts so login actually gains wali access.
					const currentPerms = Array.isArray(exists.permissions) ? exists.permissions : [];
					// Kepala sekolah: mergeAccountsUnderKepalaSekolah() keeps the KS
					// account and deletes guru accounts — promoting here is wasted work.
					const isKepalaSekolah =
						exists.type === 'kepala_sekolah' ||
						Boolean(
							await db.query.tableSekolah.findFirst({
								columns: { id: true },
								where: eq(tableSekolah.kepalaSekolahId, waliPegawaiId)
							})
						);
					if (!isKepalaSekolah && exists.type === 'user') {
						const permissions: UserPermission[] = [
							...new Set([
								...(currentPerms as UserPermission[]),
								...(defaultPermissionsByType['wali_kelas'] ?? []),
								...(kelasArr.length > 1 ? (['kelas_pindah'] as UserPermission[]) : [])
							])
						];
						await db
							.update(tableAuthUser)
							.set({
								type: 'wali_kelas',
								kelasId: kelasArr[0].id,
								permissions,
								updatedAt: new Date().toISOString()
							})
							.where(eq(tableAuthUser.id, exists.id));
						console.info(
							`[pengguna] Promoted account ID=${exists.id} from 'user' to wali_kelas (kelas: ${kelasArr
								.map((k) => k.id)
								.join(', ')})`
						);
					} else if (kelasArr.length > 1) {
						// Account exists, wali has >1 kelas: ensure 'kelas_pindah' permission
						if (!currentPerms.includes('kelas_pindah')) {
							const updatedPerms: UserPermission[] = [
								...(currentPerms as UserPermission[]),
								'kelas_pindah' as UserPermission
							];
							await db
								.update(tableAuthUser)
								.set({
									permissions: updatedPerms,
									updatedAt: new Date().toISOString()
								})
								.where(eq(tableAuthUser.id, exists.id));

							const peg = await db.query.tablePegawai.findFirst({
								where: eq(tablePegawai.id, waliPegawaiId),
								columns: { nama: true }
							});
							const kelasLog = kelasArr.map((k) => k.id).join(', ');
							console.info(
								`[pengguna] Updated wali_kelas ${peg?.nama ?? 'unknown'} with kelas_pindah permission (kelas: ${kelasLog})`
							);
						}
					}
				}
			}

			// ========== WALI ASUH AUTO-DETECTION ==========
			// Same logic as wali_kelas but for wali_asuh
			// STEP 1: Consolidate duplicate wali_asuh accounts
			const allWaliAsuhAccounts = await db.query.tableAuthUser.findMany({
				where: eq(tableAuthUser.type, 'wali_asuh'),
				columns: { id: true, pegawaiId: true, createdAt: true, username: true }
			});
			console.log('[pengguna:consolidate] Found wali_asuh accounts:', allWaliAsuhAccounts.length);

			// Group by pegawaiId
			const asuhAccountsByPegawai = new Map<number, AuthUserArray>();
			for (const acc of allWaliAsuhAccounts) {
				if (!acc.pegawaiId) continue;
				const arr = asuhAccountsByPegawai.get(acc.pegawaiId) ?? [];
				arr.push(acc);
				asuhAccountsByPegawai.set(acc.pegawaiId, arr);
			}

			// For each pegawaiId with multiple accounts, keep oldest and delete rest
			for (const [pegawaiId, accounts] of asuhAccountsByPegawai.entries()) {
				if (accounts.length > 1) {
					console.log(
						`[pengguna:consolidate] Found ${accounts.length} wali_asuh accounts for pegawaiId=${pegawaiId}`
					);
					const sorted = accounts.sort((a, b) => {
						const aTime = new Date(a.createdAt || 0).getTime();
						const bTime = new Date(b.createdAt || 0).getTime();
						return aTime - bTime;
					});

					const toDelete = sorted.slice(1);
					for (const dup of toDelete) {
						console.log(
							`[pengguna:consolidate] Deleting wali_asuh auth_user ID=${dup.id}, username="${dup.username}"`
						);
						await db.delete(tableAuthUser).where(eq(tableAuthUser.id, dup.id));
						console.warn(
							`[pengguna:consolidate] ✓ Deleted duplicate wali_asuh account: ID=${dup.id}, username="${dup.username}", pegawaiId=${pegawaiId}`
						);
					}
				}
			}

			// STEP 2: Detect wali_asuh from per-student assignments on tableMurid
			const muridWaliRows = await db.query.tableMurid.findMany({
				columns: { waliAsuhNama: true, waliAsuhNip: true },
				where: sql`${tableMurid.waliAsuhNama} IS NOT NULL AND trim(${tableMurid.waliAsuhNama}) != ''`
			});

			// Deduplicate by normalized name
			const waliAsuhByName = new Map<string, { nama: string; nip: string | null }>();
			for (const row of muridWaliRows) {
				const nama = (row.waliAsuhNama ?? '').trim();
				if (!nama) continue;
				const key = nama.toLowerCase();
				if (!waliAsuhByName.has(key)) {
					waliAsuhByName.set(key, { nama, nip: row.waliAsuhNip ?? null });
				}
			}

			for (const { nama, nip } of waliAsuhByName.values()) {
				// Find or create pegawai record by name
				let pegawaiId: number | null = null;
				const existingPegawai = await db.query.tablePegawai.findFirst({
					columns: { id: true },
					where: sql`LOWER(trim(${tablePegawai.nama})) = ${nama.toLowerCase()}`
				});

				if (existingPegawai) {
					pegawaiId = existingPegawai.id;
				} else {
					// Auto-create pegawai for this wali_asuh
					const timestamp = new Date().toISOString();
					const insertPeg = await db
						.insert(tablePegawai)
						.values({ nama, nip: nip ?? '', createdAt: timestamp, updatedAt: timestamp })
						.returning({ id: tablePegawai.id });
					pegawaiId = insertPeg?.[0]?.id ?? null;
					if (pegawaiId) {
						console.info(`[pengguna] Created pegawai for wali_asuh "${nama}" (ID=${pegawaiId})`);
					}
				}

				if (!pegawaiId) continue;

				// Check if auth_user already exists for this pegawai
				const exists = await db.query.tableAuthUser.findFirst({
					where: and(eq(tableAuthUser.pegawaiId, pegawaiId), eq(tableAuthUser.type, 'wali_asuh')),
					columns: { id: true }
				});

				if (exists) continue;

				// Create auth_user — no kelasId since wali_asuh is per-student, not per-class
				const username = await resolveUniqueUsername(nama);
				const usernameNormalized = username.toLowerCase();
				const password = randomBytes(6).toString('base64url');
				const { hash, salt } = hashPassword(password);
				const timestamp = new Date().toISOString();

				await db.insert(tableAuthUser).values({
					username,
					usernameNormalized,
					passwordHash: hash,
					passwordSalt: salt,
					passwordUpdatedAt: timestamp,
					// password generated automatically → require a change at first login
					mustChangePassword: true,
					permissions: defaultPermissionsByType['wali_asuh'] ?? [],
					type: 'wali_asuh',
					pegawaiId,
					createdAt: timestamp,
					updatedAt: timestamp
				});

				console.info(`[pengguna] Created user for wali_asuh "${nama}" (pegawaiId=${pegawaiId})`);
			}

			// Cross-type merge: if the same person is both kepala_sekolah and a guru
			// (wali_kelas / user, e.g. a PLT kepala sekolah who must keep teaching
			// hours), keep the kepala_sekolah account and merge the rest.
			await mergeAccountsUnderKepalaSekolah();
			consolidationDone = true;
		} catch (err) {
			console.warn('[pengguna] Failed to ensure wali_kelas/wali_asuh users:', err);
		}

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

	// Attach mapelIds/kelasIds/waliKelasIds to each user for edit modal
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

	// fetch sekolah list so the Add User modal can offer a sekolah selection
	const sekolahList = await db
		.select({ id: tableSekolah.id, nama: tableSekolah.nama })
		.from(tableSekolah)
		.limit(1000);

	// fetch kelas list so the Add User modal can offer kelas selection for multi-kelas
	// Include semester information to deduplicate kelas across ganjil/genap
	const kelasListRaw = await db
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
		.limit(1000);

	// Deduplicate kelas: for each (nama + tahunAjaranId), keep only one entry
	// Prefer 'ganjil' semester if available, otherwise take the first one found
	const kelasList = (() => {
		const seen = new Map<string, (typeof kelasListRaw)[0]>();
		for (const kelas of kelasListRaw) {
			const key = `${kelas.nama ?? ''}_${kelas.tahunAjaranId ?? ''}`;
			const existing = seen.get(key);
			if (!existing) {
				seen.set(key, kelas);
			} else if (kelas.semesterTipe === 'ganjil' && existing.semesterTipe !== 'ganjil') {
				// Prefer ganjil semester
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

	return { meta: { title: 'Manajemen Pengguna' }, users, mataPelajaran, sekolahList, kelasList };
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
	create_user: async ({ request }) => {
		authority('user_add');
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '').trim();
		const nama = String(form.get('nama') ?? '').trim();
		const roleValue = String(form.get('type') ?? 'user');
		if (!(ALLOWED_USER_TYPES as readonly string[]).includes(roleValue)) {
			return fail(400, { message: 'Tipe pengguna tidak valid.' });
		}

		// Parse multi-mapel: mataPelajaranIds adalah JSON array string
		let mataPelajaranIds: number[] = [];
		const mataPelajaranIdsRaw = form.get('mataPelajaranIds');
		if (mataPelajaranIdsRaw) {
			try {
				const parsed = JSON.parse(String(mataPelajaranIdsRaw));
				if (Array.isArray(parsed)) {
					mataPelajaranIds = parsed.map((id) => Number(id)).filter((id) => !isNaN(id));
				}
			} catch (err) {
				console.warn('[pengguna] failed to parse mataPelajaranIds', err);
			}
		}

		// Parse multi-kelas: kelasIds adalah JSON array string
		let kelasIds: number[] = [];
		const kelasIdsRaw = form.get('kelasIds');
		if (kelasIdsRaw) {
			try {
				const parsed = JSON.parse(String(kelasIdsRaw));
				if (Array.isArray(parsed)) {
					kelasIds = parsed.map((id) => Number(id)).filter((id) => !isNaN(id));
				}
			} catch (err) {
				console.warn('[pengguna] failed to parse kelasIds', err);
			}
		}

		const sekolahIdRaw = form.get('sekolahId');
		const sekolahId = sekolahIdRaw ? Number(String(sekolahIdRaw)) : null;

		if (!username) return fail(400, { message: 'username required' });
		if (!password) return fail(400, { message: 'password required' });

		const passwordError = validatePasswordStrength(password);
		if (passwordError) {
			return fail(400, { message: passwordError });
		}

		try {
			const { hash, salt } = hashPassword(password);
			const timestamp = new Date().toISOString();
			// if a nama was provided, create a pegawai row and link the user to it
			let pegawaiId: number | null = null;
			if (nama) {
				// `nip` is required by the schema; use empty string when not provided
				const [p] = await db
					.insert(tablePegawai)
					.values({ nama, nip: '' })
					.returning({ id: tablePegawai.id });
				if (p && typeof p.id === 'number') pegawaiId = p.id;
			}

			// If no mataPelajaranIds selected but sekolahId provided, try to
			// resolve any mata_pelajaran owned by that sekolah and use the first
			if (mataPelajaranIds.length === 0 && sekolahId) {
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
				} catch (err) {
					console.warn('[pengguna] failed to resolve mataPelajaran for sekolahId', sekolahId, err);
				}
			}

			// Auto-assign default permissions sesuai tipe akun.
			// Tambahkan 'kelas_pindah' untuk wali_kelas/user (guru) dengan multiple kelas
			const permissions: string[] = [
				...(defaultPermissionsByType[roleValue as AuthUser['type']] ?? [])
			];
			if ((roleValue === 'user' || roleValue === 'wali_kelas') && kelasIds.length > 1) {
				permissions.push('kelas_pindah');
			}

			// Insert auth_user record
			const insertData = {
				username,
				usernameNormalized: username.toLowerCase(),
				passwordHash: hash,
				passwordSalt: salt,
				passwordUpdatedAt: timestamp,
				permissions: permissions,
				type: roleValue,
				// For backward compatibility: only set mataPelajaranId if single mapel
				// Multi-mapel users should have null so system uses join table instead
				mataPelajaranId: mataPelajaranIds.length === 1 ? mataPelajaranIds[0] : undefined,
				// Set kelasId to first item (for backward compatibility with old code that checks kelasId)
				kelasId: kelasIds.length > 0 ? kelasIds[0] : undefined,
				// persist sekolah selection when provided so login reliably selects it
				sekolahId: sekolahId ?? undefined,
				pegawaiId: pegawaiId ?? undefined,
				createdAt: timestamp,
				updatedAt: timestamp
			};

			// @ts-expect-error: drizzle type inference issue with spread
			await db.insert(tableAuthUser).values(insertData);

			// fetch created user record to return the created user object reliably.
			// select the most-recent row matching usernameNormalized in case multiple exist.
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

			if (!created) {
				throw new Error('Failed to retrieve created user');
			}

			// Insert many-to-many entries untuk semua mata pelajaran yang dipilih
			for (const mapelId of mataPelajaranIds) {
				try {
					await db.insert(tableAuthUserMataPelajaran).values({
						authUserId: created.id,
						mataPelajaranId: mapelId,
						createdAt: timestamp,
						updatedAt: timestamp
					});
				} catch (err) {
					// Ignore duplicate errors (if somehow same mapel was added twice)
					if (String(err).includes('UNIQUE')) {
						console.warn(`[pengguna] duplicate mapel entry: user ${created.id}, mapel ${mapelId}`);
					} else {
						throw err;
					}
				}
			}

			// Insert many-to-many entries untuk semua kelas yang dipilih
			for (const kelasIdItem of kelasIds) {
				try {
					await db.insert(tableAuthUserKelas).values({
						authUserId: created.id,
						kelasId: kelasIdItem,
						createdAt: timestamp,
						updatedAt: timestamp
					});
				} catch (err) {
					// Ignore duplicate errors (if somehow same kelas was added twice)
					if (String(err).includes('UNIQUE')) {
						console.warn(
							`[pengguna] duplicate kelas entry: user ${created.id}, kelas ${kelasIdItem}`
						);
					} else {
						throw err;
					}
				}
			}

			console.info(
				`[pengguna] Created user via action: ${username} -> id=${created.id}, mapels=${mataPelajaranIds.length}, kelas=${kelasIds.length}`
			);

			// diagnostic logs to help track persistence issues after DB imports
			try {
				console.info(
					`[pengguna] create_user diagnostic: cwd=${process.cwd()} DB_URL=${env.DB_URL ?? 'file:./data/database.sqlite3'}`
				);
				const [{ count }] = await db.select({ count: sql`COUNT(*)` }).from(u);
				console.info('[pengguna] total auth_user rows after insert:', count);
			} catch (diagErr) {
				console.warn('[pengguna] diagnostic failed:', diagErr);
			}
			return {
				success: true,
				user: created,
				displayName: nama,
				mataPelajaranIds: mataPelajaranIds,
				kelasIds: kelasIds
			};
		} catch (err: unknown) {
			console.error('Failed to create user', err);
			// detect sqlite unique constraint on normalized username and return a user-friendly error
			// safely extract message fields from unknown error
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
	},

	update_user: async ({ request }) => {
		authority('user_set_permissions');
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!id) return fail(400, { message: 'ID pengguna tidak valid.' });

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
			// Fetch existing user to diff
			const existing = await db.query.tableAuthUser.findFirst({
				columns: { id: true, pegawaiId: true, username: true, usernameNormalized: true },
				where: eq(u.id, id)
			});
			if (!existing) return fail(404, { message: 'Pengguna tidak ditemukan.' });

			// Validate password before transaction (return fail() inside tx callback is dead code)
			let hashedPassword: { hash: string; salt: string } | null = null;
			if (password) {
				const passwordError = validatePasswordStrength(password);
				if (passwordError) return fail(400, { message: passwordError });
				hashedPassword = hashPassword(password);
			}

			// Transactional: update auth_user + pegawai + many-to-many
			await db.transaction(async (tx) => {
				// Update auth_user fields
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
				if (mataPelajaranIds.length === 1) {
					updateData.mataPelajaranId = mataPelajaranIds[0];
				} else {
					updateData.mataPelajaranId = undefined;
				}
				if (kelasIds.length > 0) {
					updateData.kelasId = kelasIds[0];
				}

				if (Object.keys(updateData).length > 0) {
					await tx.update(u).set(updateData).where(eq(u.id, id));
				}

				// Update pegawai nama if provided
				if (nama && existing.pegawaiId) {
					await tx
						.update(tablePegawai)
						.set({ nama })
						.where(eq(tablePegawai.id, existing.pegawaiId));
				} else if (nama && !existing.pegawaiId) {
					const [p] = await tx
						.insert(tablePegawai)
						.values({ nama, nip: '' })
						.returning({ id: tablePegawai.id });
					if (p) await tx.update(u).set({ pegawaiId: p.id }).where(eq(u.id, id));
				}

				// Sync many-to-many: delete existing then re-insert
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

				// Sinkron kelas_pindah: kelas >1 → beri, ≤1 → cabut (wali_kelas/user).
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

			// Return updated user
			const [updated] = await db
				.select({
					id: u.id,
					username: u.username,
					type: u.type,
					passwordUpdatedAt: u.passwordUpdatedAt
				})
				.from(u)
				.where(eq(u.id, id));

			return {
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
	},

	delete_users: async ({ request }) => {
		authority('user_delete');
		let ids: number[] = [];
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
