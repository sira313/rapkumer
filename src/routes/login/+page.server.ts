import { applySessionCookie, authenticateUser, createSession } from '$lib/server/auth';
import { isSecureRequest, resolveRequestProtocol } from '$lib/server/http';
import { cookieNames } from '$lib/utils';
import db from '$lib/server/db';
import { tableKelas, tableMataPelajaran } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

function resolveRedirectTarget(value: string | null) {
	if (!value) return null;
	if (!value.startsWith('/')) return null;
	if (value.startsWith('//')) return null;
	return value;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) {
		const target = resolveRedirectTarget(url.searchParams.get('redirect')) ?? '/';
		throw redirect(303, target);
	}

	const meta: PageMeta = {
		title: 'Masuk',
		description: 'Masuk ke Rapkumer untuk mengelola data sekolah Anda'
	};

	return { meta };
};

const LOGIN_LOG_PREFIX = '[login action]';

function logLoginEvent(message: string, details?: Record<string, unknown>) {
	const payload = details ? `${message} ${JSON.stringify(details)}` : message;
	console.info(`${LOGIN_LOG_PREFIX} ${payload}`);
}

export const actions: Actions = {
	login: async ({ request, cookies, getClientAddress, url }) => {
		const formData = await request.formData();
		const username = String(formData.get('username') ?? '').trim();
		const password = String(formData.get('password') ?? '');

		logLoginEvent('Attempt received', {
			username,
			client: getClientAddress(),
			origin: request.headers.get('origin') ?? undefined,
			referer: request.headers.get('referer') ?? undefined
		});

		if (!username || !password) {
			logLoginEvent('Missing credentials', { username });
			return fail(400, { message: 'Nama pengguna dan kata sandi wajib diisi.' });
		}

		const user = await authenticateUser(username, password);
		if (!user) {
			logLoginEvent('Invalid credentials', { username });
			return fail(401, { message: 'Nama pengguna atau kata sandi tidak valid.' });
		}

		const session = await createSession(user.id, {
			userAgent: request.headers.get('user-agent'),
			ipAddress: getClientAddress()
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

		// If the authenticated user is a wali_kelas, set the active-kelas-id cookie
		// so the UI will select their assigned class immediately after login.
		try {
			const authUser = user as AuthUser;
			if (authUser.type === 'wali_kelas' && authUser.kelasId) {
				cookies.set(cookieNames.ACTIVE_KELAS_ID, String(authUser.kelasId), {
					path: '/',
					secure
				});

				// Also set the active sekolah cookie to the sekolah that owns the kelas
				try {
					const kelas = await db.query.tableKelas.findFirst({
						columns: { sekolahId: true },
						where: eq(tableKelas.id, authUser.kelasId)
					});
					if (kelas && kelas.sekolahId) {
						cookies.set(cookieNames.ACTIVE_SEKOLAH_ID, String(kelas.sekolahId), {
							path: '/',
							secure
						});
					}
				} catch (err) {
					console.warn('[login action] failed to resolve kelas->sekolah mapping', err);
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

		const target = resolveRedirectTarget(url.searchParams.get('redirect')) ?? '/';
		logLoginEvent('Redirecting after success', { username, target });
		throw redirect(303, target);
	}
};
