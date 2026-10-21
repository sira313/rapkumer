import { applySessionCookie, authenticateUser, createSession } from '$lib/server/auth';
import {
	checkLoginBlocked,
	clearLoginAttempts,
	computeDelayMs,
	recordLoginAttempt,
	recentFailureCount,
	remainingAttempts,
	sleep
} from '$lib/server/login-guard';
import { getAppVersion } from '$lib/server/app-info';
import { isSecureRequest, resolveRequestProtocol } from '$lib/server/http';
import { cookieNames } from '$lib/utils';
import db from '$lib/server/db';
import { tableKelas, tableMataPelajaran } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import { ensureWaliAsramaAccount } from '../pengguna/consolidation.server';
import type { Actions, PageServerLoad } from './$types';

function resolveRedirectTarget(value: string | null) {
	if (!value) return null;
	if (!value.startsWith('/')) return null;
	if (value.startsWith('//')) return null;
	return value;
}

export const load: PageServerLoad = async ({ locals, url, getClientAddress }) => {
	if (locals.user) {
		const target = resolveRedirectTarget(url.searchParams.get('redirect')) ?? '/';
		throw redirect(303, target);
	}

	// Surface an active per-IP lockout right away (even before the user submits
	// the form) so the countdown survives page reloads. Per-username lockouts
	// are covered client-side via localStorage + the 429 response.
	let initialRetryAfterSeconds = 0;
	try {
		const block = await checkLoginBlocked(null, getClientAddress(), { silent: true });
		if (block.blocked) {
			initialRetryAfterSeconds = block.retryAfterSeconds;
		}
	} catch (err) {
		console.warn('[login load] failed to check login lockout', err);
	}

	const meta: PageMeta = {
		title: 'Masuk',
		description: 'Masuk ke Rapkumer untuk mengelola data administrasi guru.'
	};

	return { meta, appVersion: getAppVersion(), initialRetryAfterSeconds };
};

const LOGIN_LOG_PREFIX = '[login action]';

function logLoginEvent(message: string, details?: Record<string, unknown>) {
	const payload = details ? `${message} ${JSON.stringify(details)}` : message;
	console.info(`${LOGIN_LOG_PREFIX} ${payload}`);
}

export const actions: Actions = {
	login: async ({ request, cookies, getClientAddress, url }) => {
		const formData = await request.formData();
		const usernameRaw = String(formData.get('username') ?? '').trim();
		const password = String(formData.get('password') ?? '');
		const username = usernameRaw.toLowerCase();
		const client = getClientAddress();

		logLoginEvent('Attempt received', {
			username,
			client,
			origin: request.headers.get('origin') ?? undefined,
			referer: request.headers.get('referer') ?? undefined
		});

		if (!usernameRaw || !password) {
			await recordLoginAttempt(username || null, client, false);
			await sleep(300);
			logLoginEvent('Missing credentials', { username, client });
			const remaining = remainingAttempts(await recentFailureCount(username || null, client));
			const suffix = remaining > 0 ? ` Sisa ${remaining}x percobaan sebelum akun terkunci.` : '';
			return fail(400, { message: `Nama pengguna dan kata sandi wajib diisi.${suffix}` });
		}

		// Rate limiting / lockout (brute-force protection). A blocked attempt is
		// still recorded so continued hammering keeps extending the lockout.
		const block = await checkLoginBlocked(username, client);
		if (block.blocked) {
			const failures = await recentFailureCount(username, client);
			await recordLoginAttempt(username, client, false);
			await sleep(computeDelayMs(failures + 1));
			logLoginEvent('Blocked by login guard', {
				username,
				client,
				source: block.source,
				retryAfterSeconds: block.retryAfterSeconds
			});
			const minutes = Math.ceil(block.retryAfterSeconds / 60);
			return fail(429, {
				message: `Terlalu banyak percobaan gagal. Coba lagi dalam ${minutes} menit.`,
				retryAfterSeconds: block.retryAfterSeconds
			});
		}

		const user = await authenticateUser(username, password);
		if (!user) {
			const failures = await recentFailureCount(username, client);
			await recordLoginAttempt(username, client, false);
			await sleep(computeDelayMs(failures + 1));
			logLoginEvent('Invalid credentials', { username, client });
			const remaining = remainingAttempts(failures + 1);
			const suffix = remaining > 0 ? ` Sisa ${remaining}x percobaan sebelum akun terkunci.` : '';
			return fail(401, {
				message: `Nama pengguna atau kata sandi tidak valid.${suffix}`
			});
		}

		// Successful login: clear the user's own accumulated failures. Per-IP
		// failures from other usernames are left to age out of the window so a
		// shared (NAT) IP cannot be reset by an unrelated successful login.
		await clearLoginAttempts(username);
		await recordLoginAttempt(username, client, true);

		// Sinkronkan permission wali asrama (mis. default baru ditambahkan)
		// sebelum sesi dibuat, supaya menu sesuai permission terbaru.
		if (user.type === 'wali_asrama' && user.pegawaiId) {
			try {
				await ensureWaliAsramaAccount(user.pegawaiId);
			} catch (err) {
				console.warn('[login action] gagal sinkron permission wali asrama', err);
			}
		}

		const session = await createSession(user.id, {
			userAgent: request.headers.get('user-agent'),
			ipAddress: client
		});

		logLoginEvent('Authentication success', {
			username,
			userId: user.id,
			expiresAt: session.expiresAt
		});

		const secure = isSecureRequest(request, url);
		const resolvedProtocol = resolveRequestProtocol(request, url);
		logLoginEvent('Setting session cookie', {
			secure,
			protocol: url.protocol,
			resolvedProtocol,
			xForwardedProto: request.headers.get('x-forwarded-proto') ?? undefined,
			forwarded: request.headers.get('forwarded') ?? undefined,
			host: url.host
		});
		applySessionCookie(cookies, session.token, session.expiresAt, secure);

		// If the user record contains a preferred sekolahId, persist it into
		// the active-sekolah cookie so that accounts (e.g. admin) retain their
		// last-active sekolah across restarts/logins.
		try {
			const authUser = user as AuthUser & { sekolahId?: number };
			if (authUser.sekolahId) {
				cookies.set(cookieNames.ACTIVE_SEKOLAH_ID, String(authUser.sekolahId), {
					path: '/',
					secure
				});
			}
		} catch (err) {
			console.warn('[login action] failed to set sekolah from user record', err);
		}

		// If the authenticated user is a wali_kelas, resolve their actual wali kelas
		// via tableKelas.waliKelasId (the auth_user.kelasId may be stale) and set
		// the active-kelas-id cookie so the UI selects their class immediately.
		try {
			const authUser = user as AuthUser;
			if (authUser.type === 'wali_kelas' && authUser.pegawaiId) {
				const waliKelas = await db.query.tableKelas.findFirst({
					columns: { id: true, sekolahId: true },
					where: eq(tableKelas.waliKelasId, authUser.pegawaiId)
				});
				if (waliKelas) {
					cookies.set(cookieNames.ACTIVE_KELAS_ID, String(waliKelas.id), {
						path: '/',
						secure
					});
					if (waliKelas.sekolahId) {
						cookies.set(cookieNames.ACTIVE_SEKOLAH_ID, String(waliKelas.sekolahId), {
							path: '/',
							secure
						});
					}
				}
			} else if (authUser.type === 'wali_asrama' && authUser.pegawaiId) {
				// Wali asrama: kelas yang diampunya (kelas.waliAsramaId).
				const waliAsrama = await db.query.tableKelas.findFirst({
					columns: { id: true, sekolahId: true },
					where: eq(tableKelas.waliAsramaId, authUser.pegawaiId)
				});
				if (waliAsrama) {
					cookies.set(cookieNames.ACTIVE_KELAS_ID, String(waliAsrama.id), {
						path: '/',
						secure
					});
					if (waliAsrama.sekolahId) {
						cookies.set(cookieNames.ACTIVE_SEKOLAH_ID, String(waliAsrama.sekolahId), {
							path: '/',
							secure
						});
					}
				}
			} else if (authUser.type === 'user') {
				// For users assigned to a mata pelajaran: if the system has multiple
				// sekolah, prefer the sekolah that owns the mata pelajaran's kelas.
				try {
					const mpId = (authUser as AuthUser).mataPelajaranId;
					// First prefer an explicit sekolah saved on the user record (if present)
					const explicitSekolahId = (authUser as AuthUser & { sekolahId?: number }).sekolahId;
					if (explicitSekolahId) {
						cookies.set(cookieNames.ACTIVE_SEKOLAH_ID, String(explicitSekolahId), {
							path: '/',
							secure
						});
					} else if (mpId) {
						// Attempt to resolve mata_pelajaran -> kelas -> sekolahId and set the
						// active sekolah cookie. Do this unconditionally so 'user' accounts
						// always land on the sekolah that was chosen at account creation.
						try {
							const mpRow = await db.query.tableMataPelajaran.findFirst({
								columns: { kelasId: true },
								where: eq(tableMataPelajaran.id, mpId)
							});
							if (mpRow && mpRow.kelasId) {
								const kelas = await db.query.tableKelas.findFirst({
									columns: { sekolahId: true },
									where: eq(tableKelas.id, mpRow.kelasId)
								});
								if (kelas && kelas.sekolahId) {
									cookies.set(cookieNames.ACTIVE_SEKOLAH_ID, String(kelas.sekolahId), {
										path: '/',
										secure
									});
								}
							}
						} catch (err) {
							console.warn(
								'[login action] failed to resolve mata_pelajaran->kelas->sekolah mapping',
								err
							);
						}
					}
				} catch (err) {
					console.warn('[login action] failed to set sekolah for mata pelajaran user', err);
				}
			} else {
				// ensure we don't leave a stale kelas cookie for other user types
				cookies.delete(cookieNames.ACTIVE_KELAS_ID, { path: '/', secure });
			}
		} catch (err) {
			// non-critical: log but don't block login flow
			console.warn('[login action] failed to set active kelas cookie', err);
		}

		// Accounts flagged with mustChangePassword (e.g. the default Admin) are
		// sent straight to the password-change screen before anything else.
		if (user.mustChangePassword) {
			logLoginEvent('Forcing password change', { username, userId: user.id });
			throw redirect(303, '/pengaturan?force=1');
		}

		const target = resolveRedirectTarget(url.searchParams.get('redirect')) ?? '/';
		logLoginEvent('Redirecting after success', { username, target });
		throw redirect(303, target);
	}
};
