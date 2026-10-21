import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import {
	tableKelas,
	tableMurid,
	tablePegawai,
	tableAuthUserKelas,
	tableAuthUserMataPelajaran,
	tablePresensiSettings
} from '$lib/server/db/schema';
import { cookieNames, findTitleByPath } from '$lib/utils.js';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { resolveRoutePermission, WALI_KELAS_ONLY_PERMISSIONS } from './pengguna/permissions';

type WaliKelasUser = {
	type?: string;
	id?: number;
	kelasId?: number;
	pegawaiId?: number;
	permissions?: string[];
};

/**
 * Verify whether a wali_kelas user is allowed to access the given kelas.
 * Returns true if the kelas is their own, or if they have kelas_pindah
 * permission AND the kelas is linked to them via waliKelasId or auth_user_kelas.
 */
async function verifyWaliKelasAccess(
	user: WaliKelasUser,
	targetKelasId: number,
	ownKelasIds: number[],
	sekolahId: number
): Promise<boolean> {
	const ownIds = ownKelasIds.length > 0 ? ownKelasIds : [Number(user.kelasId)];
	if (ownIds.includes(targetKelasId)) return true;

	const hasPindah = Array.isArray(user.permissions)
		? user.permissions.includes('kelas_pindah')
		: false;
	if (!hasPindah) return false;

	const requestedKelas = await db.query.tableKelas.findFirst({
		columns: { id: true, waliKelasId: true },
		where: and(eq(tableKelas.id, targetKelasId), eq(tableKelas.sekolahId, sekolahId))
	});
	if (!requestedKelas) return false;

	if (requestedKelas.waliKelasId === user.pegawaiId) return true;

	const hasKelasLink = await db.query.tableAuthUserKelas.findFirst({
		columns: { id: true },
		where: and(
			eq(tableAuthUserKelas.authUserId, user.id!),
			eq(tableAuthUserKelas.kelasId, targetKelasId)
		)
	});
	return !!hasKelasLink;
}

export const load: LayoutServerLoad = async ({ url, locals, cookies, depends }) => {
	depends('app:presensi-guru-enabled');

	const meta: PageMeta = {
		title:
			url.pathname === '/' ? 'Rapkumer - Administrasi Guru Terpadu' : findTitleByPath(url.pathname),
		description: ''
	};

	const sekolah = locals.sekolah;
	const user = locals.user ?? null;
	const academicContext = sekolah?.id ? await resolveSekolahAcademicContext(sekolah.id) : null;

	// Presensi guru feature toggle (per active sekolah + tahun ajaran). Defaults to
	// enabled so existing installs keep the feature visible.
	// Started early as a Promise so it runs in parallel with daftarKelas queries below.
	let presensiGuruEnabled = true;
	const presensiPromise =
		sekolah?.id && academicContext?.activeTahunAjaranId
			? db.query.tablePresensiSettings.findFirst({
					columns: { presensiGuruEnabled: true },
					where: and(
						eq(tablePresensiSettings.sekolahId, sekolah.id),
						eq(tablePresensiSettings.tahunAjaranId, academicContext.activeTahunAjaranId)
					)
				})
			: null;

	// Query daftarKelas: for wali_kelas, get ALL kelas they manage (not just active semester)
	// For user type (guru), get kelas from tableAuthUserKelas join table
	// For other users, get kelas from active semester only
	let daftarKelas: Array<{
		id: number;
		nama: string;
		fase: string | null;
		waliKelas: { id: number; nama: string } | null;
	}> = [];
	// Resolved wali kelas IDs for the active semester
	let resolvedWaliOwnKelasIds: number[] = [];
	if (sekolah?.id) {
		const userWithType = user as { type?: string; id?: number; pegawaiId?: number } | null;
		if (userWithType?.type === 'wali_kelas' && userWithType.pegawaiId) {
			// Wali kelas: kelas sendiri (via waliKelasId) + kelas lain via auth_user_kelas
			// (kelas_pindah permission) — guru mapel lintas kelas juga masuk sini.
			const ownKelasRows = await db.query.tableKelas.findMany({
				columns: { id: true },
				where: academicContext?.activeSemesterId
					? and(
							eq(tableKelas.sekolahId, sekolah.id),
							eq(tableKelas.waliKelasId, userWithType.pegawaiId),
							eq(tableKelas.semesterId, academicContext.activeSemesterId)
						)
					: and(
							eq(tableKelas.sekolahId, sekolah.id),
							eq(tableKelas.waliKelasId, userWithType.pegawaiId)
						)
			});
			const ownKelasIds = new Set(ownKelasRows.map((r) => r.id));
			resolvedWaliOwnKelasIds = [...ownKelasIds];
			const additionalKelasRows = await db.query.tableAuthUserKelas.findMany({
				columns: { kelasId: true },
				where: eq(tableAuthUserKelas.authUserId, userWithType.id!)
			});
			const allKelasIds = new Set([...ownKelasIds, ...additionalKelasRows.map((r) => r.kelasId)]);
			if (allKelasIds.size > 0) {
				daftarKelas = await db.query.tableKelas.findMany({
					columns: { id: true, nama: true, fase: true },
					with: { waliKelas: { columns: { id: true, nama: true } } },
					where: academicContext?.activeSemesterId
						? and(
								eq(tableKelas.sekolahId, sekolah.id),
								inArray(tableKelas.id, [...allKelasIds]),
								eq(tableKelas.semesterId, academicContext.activeSemesterId)
							)
						: and(eq(tableKelas.sekolahId, sekolah.id), inArray(tableKelas.id, [...allKelasIds])),
					orderBy: asc(tableKelas.nama)
				});
			}
		} else if (userWithType?.type === 'wali_asrama' && userWithType.pegawaiId) {
			// Wali asrama: kelas yang diampunya (kelas.waliAsramaId) + kelas tambahan
			// via auth_user_kelas (assign admin di /pengguna/form).
			const ownKelasRows = await db.query.tableKelas.findMany({
				columns: { id: true },
				where: academicContext?.activeSemesterId
					? and(
							eq(tableKelas.sekolahId, sekolah.id),
							eq(tableKelas.waliAsramaId, userWithType.pegawaiId),
							eq(tableKelas.semesterId, academicContext.activeSemesterId)
						)
					: and(
							eq(tableKelas.sekolahId, sekolah.id),
							eq(tableKelas.waliAsramaId, userWithType.pegawaiId)
						)
			});
			const additionalKelasRows = userWithType.id
				? await db.query.tableAuthUserKelas.findMany({
						columns: { kelasId: true },
						where: eq(tableAuthUserKelas.authUserId, userWithType.id)
					})
				: [];
			const allKelasIds = new Set([
				...ownKelasRows.map((r) => r.id),
				...additionalKelasRows.map((r) => r.kelasId)
			]);
			if (allKelasIds.size > 0) {
				daftarKelas = await db.query.tableKelas.findMany({
					columns: { id: true, nama: true, fase: true },
					with: { waliKelas: { columns: { id: true, nama: true } } },
					where: academicContext?.activeSemesterId
						? and(
								eq(tableKelas.sekolahId, sekolah.id),
								inArray(tableKelas.id, [...allKelasIds]),
								eq(tableKelas.semesterId, academicContext.activeSemesterId)
							)
						: and(eq(tableKelas.sekolahId, sekolah.id), inArray(tableKelas.id, [...allKelasIds])),
					orderBy: asc(tableKelas.nama)
				});
			}
		} else if (userWithType?.type === 'wali_asuh' && userWithType.pegawaiId) {
			// Wali_asuh: only show classes that have their assigned students
			const peg = await db.query.tablePegawai.findFirst({
				columns: { nama: true },
				where: eq(tablePegawai.id, userWithType.pegawaiId)
			});
			if (peg?.nama) {
				const pegNamaLower = peg.nama.trim().toLowerCase();
				// Find distinct kelasIds from murid where waliAsuhNama matches
				const rows = await db
					.selectDistinct({ kelasId: tableMurid.kelasId })
					.from(tableMurid)
					.where(
						sql`LOWER(trim(${tableMurid.waliAsuhNama})) = ${pegNamaLower} AND ${tableMurid.kelasId} IS NOT NULL`
					);

				const kelasIds = rows.map((r) => r.kelasId).filter((id): id is number => id != null);
				if (kelasIds.length > 0) {
					daftarKelas = await db.query.tableKelas.findMany({
						columns: { id: true, nama: true, fase: true },
						with: { waliKelas: { columns: { id: true, nama: true } } },
						where: academicContext?.activeSemesterId
							? and(
									inArray(tableKelas.id, kelasIds),
									eq(tableKelas.semesterId, academicContext.activeSemesterId)
								)
							: inArray(tableKelas.id, kelasIds),
						orderBy: asc(tableKelas.nama)
					});
				}
			}
		} else if (userWithType?.type === 'user' && userWithType.id) {
			const allowedKelasRecords = await db.query.tableAuthUserKelas.findMany({
				columns: { kelasId: true },
				where: eq(tableAuthUserKelas.authUserId, userWithType.id)
			});

			if (allowedKelasRecords.length > 0) {
				const allowedKelasIds = allowedKelasRecords.map((r) => r.kelasId);
				if (academicContext?.activeSemesterId) {
					// Prefer explicit assignments in the active semester
					daftarKelas = await db.query.tableKelas.findMany({
						columns: { id: true, nama: true, fase: true },
						with: { waliKelas: { columns: { id: true, nama: true } } },
						where: and(
							inArray(tableKelas.id, allowedKelasIds),
							eq(tableKelas.semesterId, academicContext.activeSemesterId)
						),
						orderBy: asc(tableKelas.nama)
					});
					// If no explicit matches, resolve assigned kelas names to active semester
					if (!daftarKelas.length) {
						const assignedKelas = await db.query.tableKelas.findMany({
							columns: { nama: true },
							where: inArray(tableKelas.id, allowedKelasIds)
						});
						const namaSet = new Set(assignedKelas.map((k) => k.nama));
						daftarKelas = await db.query.tableKelas.findMany({
							columns: { id: true, nama: true, fase: true },
							with: { waliKelas: { columns: { id: true, nama: true } } },
							where: and(
								inArray(tableKelas.nama, Array.from(namaSet)),
								eq(tableKelas.semesterId, academicContext.activeSemesterId),
								eq(tableKelas.sekolahId, sekolah.id)
							),
							orderBy: asc(tableKelas.nama)
						});
					}
				} else {
					daftarKelas = await db.query.tableKelas.findMany({
						columns: { id: true, nama: true, fase: true },
						with: { waliKelas: { columns: { id: true, nama: true } } },
						where: inArray(tableKelas.id, allowedKelasIds),
						orderBy: asc(tableKelas.nama)
					});
				}
			}
		} else {
			// Admin/other: get kelas from active semester only
			daftarKelas = await db.query.tableKelas.findMany({
				columns: { id: true, nama: true, fase: true },
				with: { waliKelas: { columns: { id: true, nama: true } } },
				where: academicContext?.activeSemesterId
					? and(
							eq(tableKelas.sekolahId, sekolah.id),
							eq(tableKelas.semesterId, academicContext.activeSemesterId)
						)
					: eq(tableKelas.sekolahId, sekolah.id),
				orderBy: asc(tableKelas.nama)
			});
		}
	}

	const kelasIdParam = url.searchParams.get('kelas_id');
	const kelasCookie = cookies.get(cookieNames.ACTIVE_KELAS_ID);

	let kelasAktif: (typeof daftarKelas)[number] | null = null;

	// 1) If explicit param provided, prefer it
	if (kelasIdParam != null) {
		const kelasIdNumber = Number(kelasIdParam);
		if (Number.isInteger(kelasIdNumber)) {
			if (user) {
				const userWithType = user as WaliKelasUser;
				if (userWithType.type === 'wali_kelas' && Number.isInteger(Number(userWithType.kelasId))) {
					const isAllowed = await verifyWaliKelasAccess(
						userWithType,
						kelasIdNumber,
						resolvedWaliOwnKelasIds,
						sekolah!.id
					);
					if (!isAllowed) {
						throw redirect(303, `/forbidden?required=kelas_id`);
					}
				}
			}
			kelasAktif = daftarKelas.find((kelas) => kelas.id === kelasIdNumber) ?? null;
		}
	}

	// 2) Fall back to cookie candidate
	if (!kelasAktif && kelasCookie) {
		const kelasCookieNumber = Number(kelasCookie);
		if (Number.isInteger(kelasCookieNumber)) {
			kelasAktif = daftarKelas.find((kelas) => kelas.id === kelasCookieNumber) ?? null;

			// For wali_kelas: verify cookie kelas is allowed (same rules as param)
			if (kelasAktif && user) {
				const userWithType = user as WaliKelasUser;
				if (userWithType.type === 'wali_kelas' && Number.isInteger(Number(userWithType.kelasId))) {
					try {
						const isAllowed = await verifyWaliKelasAccess(
							userWithType,
							kelasCookieNumber,
							resolvedWaliOwnKelasIds,
							sekolah!.id
						);
						if (!isAllowed) kelasAktif = null;
					} catch (err) {
						console.warn('[layout] cookie kelas verification failed', err);
						kelasAktif = null;
					}
				}
			}
		}
	}

	// 3) If no cookie match, and the user is a wali_kelas/kepala_sekolah, prefer their assigned kelas
	if (!kelasAktif && user) {
		const userWithType = user as { type?: string; kelasId?: number };
		if (userWithType.type === 'wali_kelas' && userWithType.kelasId) {
			const resolvedId =
				resolvedWaliOwnKelasIds.length > 0
					? resolvedWaliOwnKelasIds[0]
					: Number(userWithType.kelasId);
			if (Number.isInteger(resolvedId)) {
				kelasAktif = daftarKelas.find((kelas) => kelas.id === resolvedId) ?? null;
				if (!kelasAktif) {
					const kelasRecord = await db.query.tableKelas.findFirst({
						columns: { id: true, nama: true, fase: true },
						where: eq(tableKelas.id, resolvedId)
					});
					if (kelasRecord) {
						kelasAktif = daftarKelas.find((k) => k.nama === kelasRecord.nama) ?? null;
					}
				}
			}
		}
	}

	// 3.5) A kepala_sekolah who also serves as wali kelas (PLT keeping teaching
	// hours) defaults to their assigned class on first login (no cookie yet).
	// Runs after the cookie step so a manually chosen kelas is always respected.
	if (!kelasAktif && user && sekolah?.id) {
		const userWithType = user as { type?: string; pegawaiId?: number };
		if (userWithType.type === 'kepala_sekolah' && userWithType.pegawaiId) {
			const waliKelasRecord = await db.query.tableKelas.findFirst({
				columns: { id: true, nama: true, fase: true },
				where: academicContext?.activeSemesterId
					? and(
							eq(tableKelas.sekolahId, sekolah.id),
							eq(tableKelas.waliKelasId, userWithType.pegawaiId),
							eq(tableKelas.semesterId, academicContext.activeSemesterId)
						)
					: and(
							eq(tableKelas.sekolahId, sekolah.id),
							eq(tableKelas.waliKelasId, userWithType.pegawaiId)
						)
			});
			if (waliKelasRecord) {
				kelasAktif = daftarKelas.find((kelas) => kelas.id === waliKelasRecord.id) ?? null;
				if (!kelasAktif) {
					kelasAktif = daftarKelas.find((kelas) => kelas.nama === waliKelasRecord.nama) ?? null;
				}
			}
		}
	}

	if (!kelasAktif && daftarKelas.length) {
		kelasAktif = daftarKelas[0];
	}

	// Server-side guard: wali_kelas on non-own class cannot access wali-kelas-only pages.
	if (user?.type === 'wali_kelas' && kelasAktif) {
		const isOwnClass =
			resolvedWaliOwnKelasIds.length > 0
				? resolvedWaliOwnKelasIds.includes(kelasAktif.id)
				: kelasAktif.id === Number(user.kelasId);
		if (!isOwnClass) {
			const required = resolveRoutePermission(url.pathname);
			if (required && WALI_KELAS_ONLY_PERMISSIONS.has(required)) {
				throw redirect(303, `/forbidden?required=${required}`);
			}
		}
	}

	// Enrich user with pegawai name when possible so client can display the
	// human-readable name (e.g. in navbar alerts). Keep original shape
	// otherwise. Also attach a small permission flag so client can easily
	// disable UI for restricted 'user' accounts.
	// Start pegawai + hasMataPelajaran queries as promises (run in parallel via await below).
	let userForClient = user;
	let hasMataPelajaran = false;
	const pegawaiPromise =
		user?.pegawaiId
			? db.query.tablePegawai.findFirst({
					columns: { id: true, nama: true },
					where: eq(tablePegawai.id, Number(user.pegawaiId))
				})
			: null;
	const hasMapelPromise =
		user?.type === 'user' && !(user as { mataPelajaranId?: number | null }).mataPelajaranId && user.id
			? db.query.tableAuthUserMataPelajaran.findMany({
					columns: { id: true },
					where: eq(tableAuthUserMataPelajaran.authUserId, user.id),
					limit: 1
				})
			: null;

	// Resolve all parallel promises at once
	const [presensiSetting, pegawaiRecord, hasMapelRecords] = await Promise.all([
		presensiPromise,
		pegawaiPromise,
		hasMapelPromise
	]);
	if (presensiSetting) presensiGuruEnabled = presensiSetting.presensiGuruEnabled ?? true;

	if (user) {
		const userType = (user as { type?: string }).type;
		const canManageMapel = userType !== 'wali_asuh' && userType !== 'wali_asrama';
		const canEditUrutan =
			userType === 'admin' || userType === 'kepala_sekolah' || userType === 'wali_kelas';
		const canAddImportMapel = canEditUrutan;

		const resolvedKelasId =
			userType === 'wali_kelas' && resolvedWaliOwnKelasIds.length > 0
				? resolvedWaliOwnKelasIds[0]
				: user.kelasId;

		userForClient = Object.assign({}, user, {
			kelasId: resolvedKelasId,
			ownKelasIds: resolvedWaliOwnKelasIds,
			pegawaiName: pegawaiRecord?.nama ?? null,
			canManageMapel,
			canEditUrutan,
			canAddImportMapel
		});
	}

	if (user?.type === 'user') {
		const u = user as { id?: number; mataPelajaranId?: number | null };
		hasMataPelajaran = !!u.mataPelajaranId || (hasMapelRecords ? hasMapelRecords.length > 0 : false);
	}

	// Set cookies AFTER all async operations are complete
	const secure = locals.requestIsSecure ?? false;
	if (kelasAktif) {
		cookies.set(cookieNames.ACTIVE_KELAS_ID, String(kelasAktif.id), {
			path: '/',
			secure
		});
	} else {
		cookies.delete(cookieNames.ACTIVE_KELAS_ID, { path: '/', secure });
	}

	return {
		sekolah,
		meta,
		daftarKelas,
		kelasAktif,
		user: userForClient,
		hasMataPelajaran,
		presensiGuruEnabled,
		activeSemesterTipe: academicContext?.activeSemesterTipe ?? null,
		academicContext
	};
};
