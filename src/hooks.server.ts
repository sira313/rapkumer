import '$lib/server/load-env';
import { applySessionCookie, ensureDefaultAdmin, resolveSession } from '$lib/server/auth';
import db from '$lib/server/db';
import { tableSekolah } from '$lib/server/db/schema';
import { isSecureRequest, resolveRequestProtocol } from '$lib/server/http';
import { cookieNames } from '$lib/utils';
import { error, redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { eq } from 'drizzle-orm';
import {
	readCombinedOriginsFromEnvAndFile,
	normalizeOrigin as normalizeFileOrigin
} from '$lib/server/csrf-origins';

// Prevent crash from socket write-after-close errors
process.on('uncaughtException', (err) => {
	if (
		err &&
		(err as NodeJS.ErrnoException).code === 'EOF' &&
		(err as NodeJS.ErrnoException).syscall === 'write'
	) {
		console.warn('[server] Ignored socket write EOF');
		return;
	}
	console.error('[server] Uncaught exception:', err);
});

// Log combined trusted origins at startup to aid debugging in packaged prod builds.
(async () => {
	try {
		const _origins = await readCombinedOriginsFromEnvAndFile();
		try {
			console.info('[csrf] combined trusted origins at startup:', Array.from(_origins).join(','));
		} catch {
			// swallow any console formatting errors
		}
	} catch (err) {
		console.warn('[csrf] failed to read combined trusted origins at startup', err);
	}
})();

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const FORM_CONTENT_TYPES = [
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain'
];

const normalizeOrigin = (value: string | null) => {
	if (!value) return undefined;
	try {
		return new URL(value).origin.toLowerCase();
	} catch {
		return undefined;
	}
};

const parseTrustedOrigins = async () => {
	// Combine process.env and file-based origins (file has precedence for persistence)
	const combined = await readCombinedOriginsFromEnvAndFile();
	// Ensure values are normalized (use local normalizeOrigin for any env entries that slipped through)
	const normalized = new Set<string>();
	for (const entry of Array.from(combined)) {
		const n = normalizeOrigin(entry) ?? normalizeFileOrigin(entry) ?? entry;
		if (n) normalized.add(n);
	}
	return normalized;
};

const shouldCheckRequest = (request: Request) => {
	if (!MUTATING_METHODS.has(request.method.toUpperCase())) return false;
	const contentType = request.headers.get('content-type');
	return (
		!!contentType && FORM_CONTENT_TYPES.some((type) => contentType.toLowerCase().startsWith(type))
	);
};

const csrfGuard: Handle = async ({ event, resolve }) => {
	if (!shouldCheckRequest(event.request)) {
		return resolve(event);
	}

	const headerOrigin = event.request.headers.get('origin');
	const headerReferer = event.request.headers.get('referer');
	const incomingOrigin = normalizeOrigin(headerOrigin) ?? normalizeOrigin(headerReferer);
	if (!incomingOrigin) {
		throw error(403, 'Permintaan ditolak karena origin tidak valid.');
	}

	const requestOrigin = incomingOrigin;
	const currentOrigin = normalizeOrigin(event.url.origin);
	if (currentOrigin && requestOrigin === currentOrigin) {
		return resolve(event);
	}

	const trustedOrigins = await parseTrustedOrigins();
	if (trustedOrigins.has(requestOrigin)) {
		return resolve(event);
	}

	console.warn('CSRF guard blocked request from untrusted origin:', {
		origin: requestOrigin,
		method: event.request.method,
		path: event.url.pathname
	});
	throw error(403, 'Permintaan lintas origin tidak diizinkan.');
};

const PUBLIC_ROUTE_IDS = new Set(['/login', '/logout']);

let ensureDefaultAdminResolved = false;

function resolveRedirectTarget(value: string | null) {
	if (!value) return null;
	if (!value.startsWith('/')) return null;
	if (value.startsWith('//')) return null;
	return value;
}

const authGuard: Handle = async ({ event, resolve }) => {
	if (!ensureDefaultAdminResolved) {
		await ensureDefaultAdmin();
		ensureDefaultAdminResolved = true;
	}

	const sessionToken = event.cookies.get(cookieNames.AUTH_SESSION);
	const resolvedProtocol = resolveRequestProtocol(event.request, event.url);
	const secure = isSecureRequest(event.request, event.url);
	event.locals.requestIsSecure = secure;
	if (!sessionToken) {
		console.debug('[auth guard] No session cookie on incoming request', {
			path: event.url.pathname,
			protocol: event.url.protocol,
			resolvedProtocol,
			xForwardedProto: event.request.headers.get('x-forwarded-proto') ?? undefined,
			forwarded: event.request.headers.get('forwarded') ?? undefined,
			host: event.url.host
		});
	}

	if (sessionToken) {
		const resolved = await resolveSession(sessionToken);
		if (resolved) {
			// Expose key user fields on locals for downstream loaders/guards.
			event.locals.user = {
				id: resolved.user.id,
				username: resolved.user.username,
				permissions: resolved.user.permissions,
				type: resolved.user.type,
				kelasId: resolved.user.kelasId,
				pegawaiId: resolved.user.pegawaiId,
				// preferred/assigned mata pelajaran for 'user' accounts (may be undefined)
				mataPelajaranId:
					(resolved.user as unknown as { mataPelajaranId?: number }).mataPelajaranId ?? null
			};
			event.locals.session = {
				id: resolved.session.id,
				expiresAt: resolved.session.expiresAt,
				tokenHash: resolved.session.tokenHash
			};
			if (resolved.refreshed) {
				applySessionCookie(event.cookies, sessionToken, resolved.session.expiresAt, secure);
			}
		} else {
			console.warn('[auth guard] Provided session token invalid or expired', {
				path: event.url.pathname
			});
			event.locals.user = undefined;
			event.locals.session = undefined;
			event.cookies.delete(cookieNames.AUTH_SESSION, { path: '/', secure });
		}
	} else {
		event.locals.user = undefined;
		event.locals.session = undefined;
	}

	// Additional server-side guard: if request includes kelas_id param and the user
	// is a wali_kelas, ensure they either own that kelas or have the 'kelas_pindah'
	// permission (which grants both pindah + akses ke kelas lain). This prevents
	// bypass via direct URL.
	if (event.locals.user) {
		const kelasIdParam = event.url.searchParams.get('kelas_id');
		if (kelasIdParam != null) {
			const kelasIdNumber = Number(kelasIdParam);
			if (Number.isInteger(kelasIdNumber)) {
				const u = event.locals.user as { type?: string; kelasId?: number; permissions?: string[] };
				if (u.type === 'wali_kelas' && Number.isInteger(Number(u.kelasId))) {
					const allowed = Number(u.kelasId);
					if (kelasIdNumber !== allowed) {
						const hasAccessOther = Array.isArray(u.permissions)
							? u.permissions.includes('kelas_pindah')
							: false;
						if (!hasAccessOther) {
							throw redirect(303, `/forbidden?required=kelas_id`);
						}
					}
				} else if (u.type === 'wali_asuh' && Number.isInteger(Number(u.kelasId))) {
					// Same logic for wali_asuh
					const allowed = Number(u.kelasId);
					if (kelasIdNumber !== allowed) {
						const hasAccessOther = Array.isArray(u.permissions)
							? u.permissions.includes('kelas_pindah')
							: false;
						if (!hasAccessOther) {
							throw redirect(303, `/forbidden?required=kelas_id`);
						}
					}
				}
			}
		}
	}

	const routeId = event.route.id;
	const isPublicRoute = !routeId || PUBLIC_ROUTE_IDS.has(routeId);
	const isLoginPath = event.url.pathname === '/login';

	if (event.locals.user && isLoginPath) {
		const redirectTarget = resolveRedirectTarget(event.url.searchParams.get('redirect')) ?? '/';
		throw redirect(303, redirectTarget);
	}

	if (!event.locals.user && !isPublicRoute) {
		if (event.request.method === 'GET') {
			const redirectTarget = resolveRedirectTarget(`${event.url.pathname}${event.url.search}`);
			const query =
				redirectTarget && redirectTarget !== '/'
					? `?redirect=${encodeURIComponent(redirectTarget)}`
					: '';
			throw redirect(303, `/login${query}`);
		}
		throw redirect(303, '/login');
	}

	return resolve(event);
};

const cookieParser: Handle = async ({ event, resolve }) => {
	if (!event.locals.user) {
		return resolve(event);
	}

	const secure = event.locals.requestIsSecure ?? false;
	const sekolahId = Number(event.cookies.get(cookieNames.ACTIVE_SEKOLAH_ID) || '');
	if (sekolahId === event.locals.sekolah?.id && !event.locals.sekolahDirty) {
		return resolve(event);
	}

	let sekolah = await db.query.tableSekolah.findFirst({
		columns: { logo: false, logoDinas: false },
		with: { alamat: true, kepalaSekolah: true },
		where: sekolahId ? eq(tableSekolah.id, sekolahId) : undefined
	});

	if (!sekolah) {
		sekolah = await db.query.tableSekolah.findFirst({
			columns: { logo: false, logoDinas: false },
			with: { alamat: true, kepalaSekolah: true }
		});
		if (sekolah?.id) {
			event.cookies.set(cookieNames.ACTIVE_SEKOLAH_ID, String(sekolah.id), {
				path: '/',
				secure
			});
		} else if (sekolahId) {
			event.cookies.delete(cookieNames.ACTIVE_SEKOLAH_ID, { path: '/', secure });
		}
	} else if (!sekolahId) {
		event.cookies.set(cookieNames.ACTIVE_SEKOLAH_ID, String(sekolah.id), {
			path: '/',
			secure
		});
	}

	if (!sekolah?.id && event.route.id != '/(informasi-umum)/sekolah/form') {
		throw redirect(303, `/sekolah/form?init`);
	}

	event.locals.sekolah = sekolah as Omit<Sekolah, 'logo'> | undefined;
	return resolve(event);
};

function parseAsBytes(value: string | undefined, fallback = '512K') {
	const v = (value ?? fallback).trim();
	if (!v) return NaN;
	const last = v[v.length - 1].toUpperCase();
	const multiplier =
		{
			K: 1024,
			M: 1024 * 1024,
			G: 1024 * 1024 * 1024
		}[last] ?? 1;
	const numeric = multiplier !== 1 ? v.substring(0, v.length - 1) : v;
	return Number(numeric) * multiplier;
}

// Compose the middleware sequence but ensure every internal `resolve` call
// uses the `bodySizeLimit` derived from `process.env.BODY_SIZE_LIMIT` so
// parsing limits follow the .env configuration in dev and prod.
const _composed = sequence(csrfGuard, authGuard, cookieParser);
export const handle: Handle = async ({ event, resolve }) => {
	const bodySizeLimit = parseAsBytes(process.env.BODY_SIZE_LIMIT, '512K');
	// Expose the parsed limit on `locals` so other server-side code can
	// inspect it if needed. We avoid passing it to `resolve` because
	// SvelteKit's ResolveOptions type doesn't allow custom keys.
	// Note: this does not change how SvelteKit parses the raw request body
	// (that happens earlier), but makes the configured limit available.
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore -- allow adding a custom property to locals
	event.locals.bodySizeLimit = bodySizeLimit;
	return _composed({ event, resolve });
};

const sqliteErrors = {
	SQLITE_CONSTRAINT_UNIQUE: 'Terdapat duplikasi data',
	SQLITE_CONSTRAINT_FOREIGNKEY: 'Data memiliki relasi ke data lainnya yang masih utuh'
};

export const handleError = ({ error, message, status }: { error: unknown; message: string; status: number }) => {
	console.error(error);
	if (status >= 500) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const code = (error as any)?.cause?.code as keyof typeof sqliteErrors;
		const customMessage = sqliteErrors[code] || message;
		return { message: customMessage };
	}
	return { message };
};
