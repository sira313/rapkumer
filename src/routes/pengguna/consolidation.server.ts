import db from '$lib/server/db';
import {
	tableAuthUser,
	tablePegawai,
	tableKelas,
	tableSekolah,
	tableMurid
} from '$lib/server/db/schema';
import { sql, eq, and } from 'drizzle-orm';
import { defaultPermissionsByType } from './permissions';
import { hashPassword } from '$lib/server/auth';
import { resolveUniqueUsername } from '$lib/server/usernames';
import { mergeAccountsUnderKepalaSekolah } from '$lib/server/pengguna-merge';
import { randomBytes } from 'node:crypto';

// Run consolidation once per process, not on every page load.
// Handles pegawai dedup, wali_kelas/wali_asuh account creation, and cross-type merge.
let consolidationDone = false;

// Ensure there are auth_user entries for any kelas that has a wali_kelas assigned.
// This mirrors `scripts/seed-wali-users.mjs` but runs lazily during the users page load
// so admins don't need to run a separate seed script after importing old DBs.
// Also support multi-kelas wali by auto-assigning 'kelas_pindah' permission.
// CONSOLIDATION LOGIC: If multiple accounts exist for same pegawaiId, keep oldest and delete others
// ALSO: Consolidate duplicate pegawai (same nama), keep oldest, merge auth_user references
export async function ensurePegawaiConsolidation() {
	if (consolidationDone) return;
	try {
		// STEP 0: Consolidate PEGAWAI duplicates (same nama + same NIP) → keep oldest, merge auth_user
		const allPegawai = await db.query.tablePegawai.findMany({
			columns: { id: true, nama: true, nip: true, createdAt: true }
		});

		// Group pegawai by (nama normalized + nip normalized) to find duplicates
		// Only merge when both name AND NIP match to avoid collapsing distinct people
		// who happen to share a name. Empty NIPs are grouped separately (two empty-NIP
		// same-name records are treated as potentially different people and skipped).
		type PegawaiArray = { id: number; nama: string; nip: string | null; createdAt: string }[];
		const pegawaiByNameNip = new Map<string, PegawaiArray>();
		for (const peg of allPegawai) {
			const nameKey = (peg.nama || '').trim().toLowerCase();
			if (!nameKey) continue;
			const nipKey = (peg.nip || '').trim();
			// Require non-empty NIP for dedup — two anonymous same-name records
			// could be different people at different schools.
			if (!nipKey) continue;
			const compositeKey = `${nameKey}\0${nipKey}`;
			const arr = pegawaiByNameNip.get(compositeKey) ?? [];
			arr.push(peg);
			pegawaiByNameNip.set(compositeKey, arr);
		}

		// For each (nama, NIP) group with duplicates
		for (const [, pegawaiGroup] of pegawaiByNameNip.entries()) {
			if (pegawaiGroup.length > 1) {
				const nameKey = (pegawaiGroup[0].nama || '').trim().toLowerCase();
				console.log(
					`[pengguna:consolidate] Found ${pegawaiGroup.length} pegawai with name "${nameKey}" (same NIP)`
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
}
