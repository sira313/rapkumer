import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { tableKelas, tablePegawai, tableAuthUserKelas } from '$lib/server/db/schema';
import { cookieNames, findTitleByPath } from '$lib/utils.js';
import { redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';

export async function load({ url, locals, cookies }) {
	const meta: PageMeta = {
		title: url.pathname === '/' ? 'Rapor Kurikulum Merdeka' : findTitleByPath(url.pathname),
		description: ''
	};

	const sekolah = locals.sekolah;
	const user = locals.user ?? null;
	const academicContext = sekolah?.id ? await resolveSekolahAcademicContext(sekolah.id) : null;

	// Query daftarKelas: for wali_kelas, get ALL kelas they manage (not just active semester)
	// For user type (guru), get kelas from tableAuthUserKelas join table
	// For other users, get kelas from active semester only
	let daftarKelas: Array<{
		id: number;
		nama: string;
		fase: string | null;
		waliKelas: { id: number; nama: string } | null;
	}> = [];
	if (sekolah?.id) {
		const userWithType = user as { type?: string; id?: number; pegawaiId?: number } | null;
		if (userWithType?.type === 'wali_kelas' && userWithType.pegawaiId) {
			// Wali kelas: get ALL kelas where waliKelasId = pegawaiId (across all semesters)
			daftarKelas = await db.query.tableKelas.findMany({
				columns: { id: true, nama: true, fase: true },
				with: { waliKelas: { columns: { id: true, nama: true } } },
				where: and(
					eq(tableKelas.sekolahId, sekolah.id),
					eq(tableKelas.waliKelasId, userWithType.pegawaiId)
				),
				orderBy: asc(tableKelas.nama)
			});
		} else if (userWithType?.type === 'wali_asuh' && userWithType.pegawaiId) {
			// Wali asuh: get ALL kelas where waliAsuhId = pegawaiId (across all semesters)
			daftarKelas = await db.query.tableKelas.findMany({
				columns: { id: true, nama: true, fase: true },
				with: { waliKelas: { columns: { id: true, nama: true } } },
				where: and(
					eq(tableKelas.sekolahId, sekolah.id),
					eq(tableKelas.waliAsuhId, userWithType.pegawaiId)
				),
				orderBy: asc(tableKelas.nama)
			});
		} else if (userWithType?.type === 'user' && userWithType.id) {
			// User type (guru): get kelas from tableAuthUserKelas join table
			// First query join table to get allowed kelas IDs
			const allowedKelasRecords = await db.query.tableAuthUserKelas.findMany({
				columns: { kelasId: true },
				where: eq(tableAuthUserKelas.authUserId, userWithType.id)
			});

			if (allowedKelasRecords.length > 0) {
				const allowedKelasIds = allowedKelasRecords.map((r) => r.kelasId);
				daftarKelas = await db.query.tableKelas.findMany({
					columns: { id: true, nama: true, fase: true },
					with: { waliKelas: { columns: { id: true, nama: true } } },
					where: inArray(tableKelas.id, allowedKelasIds),
					orderBy: asc(tableKelas.nama)
				});
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
			// If the current user is a wali_kelas, they may only access their own kelas
			// unless they have explicit permission `kelas_pindah` AND they own that kelas
			if (user) {
				const userWithType = user as {
					type?: string;
					id?: number;
					kelasId?: number;
					pegawaiId?: number;
				};
				if (userWithType.type === 'wali_kelas' && Number.isInteger(Number(userWithType.kelasId))) {
					const allowed = Number(userWithType.kelasId);
					if (kelasIdNumber !== allowed) {
						// Check permission to access other kelas (via 'kelas_pindah')
						const authUser = user as AuthUser;
						const hasAccessOther = Array.isArray(authUser.permissions)
							? authUser.permissions.includes('kelas_pindah')
							: false;
						if (!hasAccessOther) {
							// Deny access when a wali_kelas tries to switch to another kelas via URL param
							throw redirect(303, `/forbidden?required=kelas_id`);
						}

						// ADDED: Verify bahwa kelas yang diminta benar-benar milik wali ini
						// (prevent user dari hacking URL ke kelas orang lain)
						try {
							const requestedKelas = await db.query.tableKelas.findFirst({
								columns: { id: true, waliKelasId: true },
								where: eq(tableKelas.id, kelasIdNumber)
							});

							// Wali hanya bisa akses kelas yang waliKelasId = pegawaiId mereka
							if (!requestedKelas || requestedKelas.waliKelasId !== userWithType.pegawaiId) {
								throw redirect(303, `/forbidden?required=kelas_id`);
							}
						} catch (err) {
							if (err instanceof Error && err.message.includes('redirect')) throw err;
							console.warn('[layout] failed to verify kelas ownership', err);
							throw redirect(303, `/forbidden?required=kelas_id`);
						}
					}
				} else if (userWithType.type === 'user' && userWithType.id) {
					// User type (guru): verify they have access to the requested kelas via tableAuthUserKelas
					const hasAccess = await db.query.tableAuthUserKelas.findFirst({
						columns: { id: true },
						where: and(
							eq(tableAuthUserKelas.authUserId, userWithType.id),
							eq(tableAuthUserKelas.kelasId, kelasIdNumber)
						)
					});

					if (!hasAccess) {
						// Deny access when a user type tries to switch to a kelas they don't have access to
						throw redirect(303, `/forbidden?required=kelas_id`);
					}
				}
			}
			kelasAktif = daftarKelas.find((kelas) => kelas.id === kelasIdNumber) ?? null;
		}
	}

	// 2) If no explicit param, and the user is a wali_kelas or wali_asuh, prefer their assigned kelas
	if (!kelasAktif && user) {
		const userWithType = user as { type?: string; kelasId?: number };
		if (
			(userWithType.type === 'wali_kelas' || userWithType.type === 'wali_asuh') &&
			userWithType.kelasId
		) {
			const waliKelasId = Number(userWithType.kelasId);
			if (Number.isInteger(waliKelasId)) {
				// prefer kelas from daftarKelas (same semester), otherwise attempt to load the kelas by id
				kelasAktif = daftarKelas.find((kelas) => kelas.id === waliKelasId) ?? null;
				if (!kelasAktif) {
					// load the kelas record by id even if it's not in the current semester list
					const kelasRecord = await db.query.tableKelas.findFirst({
						columns: { id: true, nama: true, fase: true },
						with: { waliKelas: { columns: { id: true, nama: true } } },
						where: eq(tableKelas.id, waliKelasId)
					});
					if (kelasRecord) kelasAktif = kelasRecord;
				}
			}
		}
	}

	// 3) Next, fall back to cookie candidate
	if (!kelasAktif && kelasCookie) {
		const kelasCookieNumber = Number(kelasCookie);
		if (Number.isInteger(kelasCookieNumber)) {
			kelasAktif = daftarKelas.find((kelas) => kelas.id === kelasCookieNumber) ?? null;
		}
	}

	// If no explicit candidate, and the user is a wali_kelas or wali_asuh, prefer their assigned kelas
	if (!kelasAktif && user) {
		const userWithType = user as { type?: string; kelasId?: number };
		if (
			(userWithType.type === 'wali_kelas' || userWithType.type === 'wali_asuh') &&
			userWithType.kelasId
		) {
			const waliKelasId = Number(userWithType.kelasId);
			if (Number.isInteger(waliKelasId)) {
				kelasAktif = daftarKelas.find((kelas) => kelas.id === waliKelasId) ?? null;
			}
		}
	}

	if (!kelasAktif && daftarKelas.length) {
		kelasAktif = daftarKelas[0];
	}

	// Enrich user with pegawai name when possible so client can display the
	// human-readable name (e.g. in navbar alerts). Keep original shape
	// otherwise. Also attach a small permission flag so client can easily
	// disable UI for restricted 'user' accounts.
	let userForClient = user;
	if (user) {
		// Permission logic:
		// - 'wali_asuh' should not be allowed to manage mata pelajaran
		// - 'user' (guru mapel) CAN manage mata pelajaran (they are filtered server-side)
		// - Other account types retain full access
		const userType = (user as { type?: string }).type;
		const canManageMapel = userType !== 'wali_asuh';

		if (user.pegawaiId) {
			const pegawaiRecord = await db.query.tablePegawai.findFirst({
				columns: { id: true, nama: true },
				where: eq(tablePegawai.id, Number(user.pegawaiId))
			});
			// avoid `any` cast by using Object.assign to create a shallow clone
			userForClient = Object.assign({}, user, {
				pegawaiName: pegawaiRecord?.nama ?? null,
				canManageMapel
			});
		} else {
			userForClient = Object.assign({}, user, { canManageMapel });
		}
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
		activeSemesterTipe: academicContext?.activeSemesterTipe ?? null
	};
}
