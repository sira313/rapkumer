import {
	applySessionCookie,
	createSession,
	deleteSessionsForUser,
	updateUserPassword,
	verifyUserPassword
} from '$lib/server/auth';
import db from '$lib/server/db';
import { tableAuthUser } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getAppVersion } from '$lib/server/app-info';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { networkInterfaces } from 'node:os';
import { isIPv4 } from 'node:net';
import { updateEnvFile, envFilePath } from '$lib/server/env-file';
import {
	copyFileIfMissing,
	copyMissingFiles,
	effectiveDataRoot,
	ensureStorageTree,
	getStorageInfo,
	launcherDataRootConfigPath,
	normalizeStoragePath,
	writeLauncherDataRootOverride
} from '$lib/server/storage-settings';
import { dataRoot, soundsDir, uploadsDir } from '$lib/server/data-dirs';
import { validatePasswordStrength } from '$lib/server/password-policy';
import {
	isBukuTamuPasskeySet,
	setBukuTamuPasskey,
	getBukuTamuPasskey
} from '$lib/server/buku-tamu-pass';
import {
	clearAiSettings,
	clearUserAiSettings,
	DEFAULT_AI_MODEL,
	getStoredAiSettings,
	getStoredUserAiSettings,
	maskApiKey,
	saveAiSettings,
	saveUserAiSettings
} from '$lib/server/ai';
import path from 'node:path';

interface AddressEntry {
	name: string;
	address: string;
	raw: string;
}

function collectIpv4Addresses(port: string | null): AddressEntry[] {
	const interfaces = networkInterfaces();
	const collected: AddressEntry[] = [];

	for (const [name, entries] of Object.entries(interfaces)) {
		for (const entry of entries ?? []) {
			if (entry.family === 'IPv4' && !entry.internal && entry.address) {
				const address = port ? `${entry.address}:${port}` : entry.address;
				collected.push({ name, address, raw: entry.address });
			}
		}
	}

	return collected;
}

function filterAddresses(entries: AddressEntry[], currentHost: string) {
	const hostIpv4 = isIPv4(currentHost) ? currentHost : null;

	if (hostIpv4) {
		const primaryInterfaces = new Set(
			entries.filter((entry) => entry.raw === hostIpv4).map((entry) => entry.name)
		);
		if (primaryInterfaces.size > 0) {
			const filtered = entries.filter((entry) => primaryInterfaces.has(entry.name));
			if (filtered.length) return filtered;
		}
	}

	const privateRanges = entries.filter((entry) => {
		if (entry.raw.startsWith('192.168.')) return true;
		const match172 = entry.raw.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./);
		return Boolean(match172);
	});

	if (privateRanges.length) {
		return privateRanges;
	}

	return entries;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const meta: PageMeta = {
		title: 'Pengaturan',
		description: 'Pengaturan Aplikasi Administrasi Guru Terpadu'
	};

	const secure = locals.requestIsSecure ?? url.protocol === 'https:';
	const protocol = secure ? 'https:' : 'http:';
	const port = url.port || (secure ? '443' : '80');
	const collected = collectIpv4Addresses(port);
	const filtered = filterAddresses(collected, url.hostname);
	const seen = new Set<string>();
	const addresses = filtered
		.map((entry) => entry.address)
		.filter((address) => {
			if (seen.has(address)) return false;
			seen.add(address);
			return true;
		});

	const hostWithPort = url.port ? url.host : `${url.hostname}:${port}`;
	if (isIPv4(url.hostname) && hostWithPort && !addresses.includes(hostWithPort)) {
		addresses.push(hostWithPort);
	}

	const isAdmin = locals.user?.type === 'admin';
	const isAdminOrKepalaSekolah = isAdmin || locals.user?.type === 'kepala_sekolah';
	const storage = isAdmin ? await getStorageInfo() : undefined;

	const forcePasswordChange =
		url.searchParams.get('force') === '1' || Boolean(locals.user?.mustChangePassword);

	const sekolahIdLoad = locals.sekolah?.id;
	const bukuTamuPasskeySet =
		isAdminOrKepalaSekolah && sekolahIdLoad ? await isBukuTamuPasskeySet(sekolahIdLoad) : false;
	const bukuTamuPasskey =
		isAdminOrKepalaSekolah && sekolahIdLoad ? await getBukuTamuPasskey(sekolahIdLoad) : null;

	const storedGemini = isAdminOrKepalaSekolah ? await getStoredAiSettings() : null;

	// Personal AI key card is offered to every non-admin role (guru mapel,
	// wali kelas, wali asuh) — each user must bring their own key.
	const isGuruOrUser =
		locals.user?.type === 'user' ||
		locals.user?.type === 'wali_kelas' ||
		locals.user?.type === 'wali_asuh';
	const storedPersonalAi =
		isGuruOrUser && locals.user ? await getStoredUserAiSettings(locals.user.id) : null;

	return {
		meta,
		appAddresses: addresses,
		protocol,
		appVersion: getAppVersion(),
		storage,
		forcePasswordChange,
		bukuTamuPasskeySet,
		bukuTamuPasskey,
		gemini: {
			keySet: Boolean(storedGemini),
			maskedKey: storedGemini ? maskApiKey(storedGemini.apiKey) : null,
			envKeyPresent: Boolean(process.env.GEMINI_API_KEY),
			model: storedGemini?.model ?? DEFAULT_AI_MODEL,
			baseUrl: storedGemini?.baseUrl ?? ''
		},
		personalAi: {
			keySet: Boolean(storedPersonalAi),
			maskedKey: storedPersonalAi ? maskApiKey(storedPersonalAi.apiKey) : null,
			model: storedPersonalAi?.model ?? '',
			baseUrl: storedPersonalAi?.baseUrl ?? '',
			envKeyPresent: Boolean(process.env.GEMINI_API_KEY)
		}
	};
};

export const actions: Actions = {
	'change-password': async ({ request, locals, cookies, getClientAddress, url }) => {
		const logContext = {
			userId: locals.user?.id,
			client: getClientAddress(),
			origin: request.headers.get('origin') ?? undefined,
			referer: request.headers.get('referer') ?? undefined
		};
		if (!locals.user) {
			console.warn('[change-password] user missing', logContext);
			throw redirect(303, '/login');
		}

		const formData = await request.formData();
		const currentPassword = String(formData.get('currentPassword') ?? '');
		const newPassword = String(formData.get('newPassword') ?? '');
		const confirmPassword = String(formData.get('confirmPassword') ?? '');

		if (!currentPassword || !newPassword || !confirmPassword) {
			console.warn('[change-password] missing fields', logContext);
			return fail(400, { message: 'Semua kolom kata sandi wajib diisi.' });
		}

		const passwordError = validatePasswordStrength(newPassword);
		if (passwordError) {
			console.warn('[change-password] password rejected', { ...logContext, reason: passwordError });
			return fail(400, { message: passwordError });
		}

		if (newPassword !== confirmPassword) {
			console.warn('[change-password] confirmation mismatch', logContext);
			return fail(400, { message: 'Konfirmasi kata sandi tidak cocok.' });
		}

		const valid = await verifyUserPassword(locals.user.id, currentPassword);
		if (!valid) {
			console.warn('[change-password] invalid current password', logContext);
			return fail(400, { message: 'Kata sandi lama tidak sesuai.' });
		}

		await updateUserPassword(locals.user.id, newPassword);
		await deleteSessionsForUser(locals.user.id);
		const session = await createSession(locals.user.id, {
			userAgent: request.headers.get('user-agent'),
			ipAddress: getClientAddress()
		});

		// If the account was forced to change its password (default admin), clear
		// the flag so normal navigation is unlocked again.
		try {
			await db
				.update(tableAuthUser)
				.set({ mustChangePassword: false, updatedAt: new Date().toISOString() })
				.where(eq(tableAuthUser.id, locals.user.id));
		} catch (err) {
			console.warn('[change-password] failed to clear mustChangePassword flag', err);
		}

		console.info('[change-password] success', {
			...logContext,
			sessionExpiresAt: session.expiresAt
		});

		const secure = locals.requestIsSecure ?? url.protocol === 'https:';
		applySessionCookie(cookies, session.token, session.expiresAt, secure);

		return { message: 'Kata sandi berhasil diperbarui.' };
	},
	'change-admin-username': async ({ request, locals }) => {
		const logContext = { userId: locals.user?.id };
		if (!locals.user) {
			console.warn('[change-admin-username] user missing', logContext);
			return fail(403, { message: 'Autentikasi diperlukan.' });
		}

		// Allow the currently authenticated user to change their own username.
		// Require current password for confirmation and ensure username uniqueness.
		const form = await request.formData();
		const newUsername = String(form.get('adminUsername') ?? '').trim();
		const currentPassword = String(form.get('adminPassword') ?? '');

		if (!newUsername) return fail(400, { message: 'Username baru wajib diisi.' });
		if (!currentPassword)
			return fail(400, { message: 'Masukkan kata sandi Anda untuk konfirmasi.' });

		// Verify current password
		const valid = await verifyUserPassword(locals.user.id, currentPassword);
		if (!valid) return fail(400, { message: 'Kata sandi konfirmasi tidak sesuai.' });

		// Server-side validation: match client-side pattern (letters, numbers, dot, underscore, dash) and min length 3
		const usernamePattern = /^[A-Za-z0-9._-]{3,}$/;
		if (!usernamePattern.test(newUsername)) {
			return fail(400, {
				message:
					'Username tidak valid. Gunakan huruf, angka, titik, underscore atau minus. Minimal 3 karakter.'
			});
		}

		const normalized = newUsername.trim().toLowerCase();

		// Check uniqueness excluding current user
		const existing = await db.query.tableAuthUser.findFirst({
			where: eq(tableAuthUser.usernameNormalized, normalized)
		});
		if (existing && existing.id !== locals.user.id)
			return fail(400, { message: 'Username sudah digunakan.' });

		const now = new Date().toISOString();

		await db
			.update(tableAuthUser)
			.set({ username: newUsername, usernameNormalized: normalized, updatedAt: now })
			.where(eq(tableAuthUser.id, locals.user.id));

		return { message: 'Username berhasil diperbarui.' };
	},
	'update-storage-location': async ({ request, locals }) => {
		if (locals.user?.type !== 'admin') {
			return fail(403, { message: 'Hanya admin yang dapat mengubah lokasi data.' });
		}

		const form = await request.formData();
		const rawRoot = String(form.get('dataRoot') ?? '').trim();
		const rawUploads = String(form.get('uploads') ?? '').trim();
		const rawSounds = String(form.get('sounds') ?? '').trim();

		let rootValue: string | null;
		let uploadsValue: string | null;
		let soundsValue: string | null;
		try {
			rootValue = normalizeStoragePath(rawRoot);
			uploadsValue = normalizeStoragePath(rawUploads);
			soundsValue = normalizeStoragePath(rawSounds);
		} catch (err) {
			return fail(400, { message: (err as Error).message });
		}

		const oldRoot = dataRoot();
		const oldUploads = uploadsDir();
		const oldSounds = soundsDir();
		// On Windows the launcher (start-rapkumer.mjs) forces the root on every
		// start, so the setting is persisted there instead of `.env`; uploads and
		// sounds still go through `.env`. On other platforms RAPKUMER_DATA_DIR is
		// written to `.env` directly.
		const launcherManagedRoot =
			process.platform === 'win32' && Boolean(process.env.RAPKUMER_DATA_DIR);
		const newRoot = effectiveDataRoot(rootValue);
		const newUploads = uploadsValue ?? path.join(newRoot, 'uploads');
		const newSounds = soundsValue ?? path.join(newRoot, 'sounds');

		try {
			const envUpdates: Record<string, string> = {
				photo: uploadsValue ? `file:${uploadsValue}` : '',
				sounds: soundsValue ? `file:${soundsValue}` : ''
			};
			if (!launcherManagedRoot) {
				envUpdates.RAPKUMER_DATA_DIR = rootValue ?? '';
			}
			// Persist `.env` first — on launcher installs `{app}\.env` is the more
			// likely write to fail — then the launcher override, so a failure never
			// leaves the root pointing at a location whose data was not copied.
			await updateEnvFile(envUpdates);
		} catch {
			return fail(500, {
				message: `Gagal menulis file .env (${envFilePath()}). Periksa izin tulis lalu coba lagi.`
			});
		}

		if (launcherManagedRoot) {
			try {
				await writeLauncherDataRootOverride(rootValue);
			} catch {
				return fail(500, {
					message: `Gagal menulis konfigurasi peluncur (${launcherDataRootConfigPath()}). Periksa izin tulis lalu coba lagi.`
				});
			}
		}

		// Move existing data to the new locations (only files missing in the
		// target are copied; nothing is deleted). Uses the values the new .env
		// will resolve to after restart, so relative DB paths keep working.
		let copied = 0;
		try {
			// Create the standard tree (ttd/{guru,tamu}, dinas-luar, uploads,
			// sounds) so picking a root once is enough.
			await ensureStorageTree(newRoot, newUploads, newSounds);
			if (oldRoot !== newRoot) {
				copied += await copyMissingFiles(path.join(oldRoot, 'ttd'), path.join(newRoot, 'ttd'));
				copied += await copyMissingFiles(
					path.join(oldRoot, 'dinas-luar'),
					path.join(newRoot, 'dinas-luar')
				);
				copied += await copyFileIfMissing(
					path.join(oldRoot, 'csrf-origins.txt'),
					path.join(newRoot, 'csrf-origins.txt')
				);
			}
			if (oldUploads !== newUploads) {
				copied += await copyMissingFiles(oldUploads, newUploads);
			}
			if (oldSounds !== newSounds) {
				copied += await copyMissingFiles(oldSounds, newSounds);
			}
		} catch (err) {
			return fail(500, {
				message: launcherManagedRoot
					? `Lokasi tersimpan di konfigurasi peluncur, tetapi sebagian file gagal dipindahkan: ${(err as Error).message}`
					: `Lokasi tersimpan di .env, tetapi sebagian file gagal dipindahkan: ${(err as Error).message}`
			});
		}

		const movedNote = copied > 0 ? ` ${copied} file dipindahkan ke lokasi baru.` : '';
		return {
			message: `Lokasi data berhasil disimpan.${movedNote} Mulai ulang server agar perubahan berlaku.`
		};
	},
	'buku-tamu-passkey': async ({ request, locals }) => {
		if (locals.user?.type !== 'admin' && locals.user?.type !== 'kepala_sekolah') {
			return fail(403, {
				message: 'Hanya admin/kepala sekolah yang dapat mengatur passkey buku tamu.'
			});
		}
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) {
			return fail(400, { message: 'Belum ada data sekolah.' });
		}

		const form = await request.formData();
		const passkey = String(form.get('passkey') ?? '');
		const confirm = String(form.get('confirmPasskey') ?? '');

		if (!passkey) {
			return fail(400, { message: 'Passkey wajib diisi.' });
		}
		if (passkey !== confirm) {
			return fail(400, { message: 'Konfirmasi passkey tidak cocok.' });
		}
		if (passkey.length < 4 || passkey.length > 64) {
			return fail(400, { message: 'Passkey harus 4–64 karakter.' });
		}

		await setBukuTamuPasskey(sekolahId, passkey);
		return { message: 'Passkey buku tamu berhasil disimpan.' };
	},
	'buku-tamu-passkey-clear': async ({ locals }) => {
		if (locals.user?.type !== 'admin' && locals.user?.type !== 'kepala_sekolah') {
			return fail(403, {
				message: 'Hanya admin/kepala sekolah yang dapat menonaktifkan passkey buku tamu.'
			});
		}
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) {
			return fail(400, { message: 'Belum ada data sekolah.' });
		}

		await setBukuTamuPasskey(sekolahId, null);
		return { message: 'Passkey buku tamu berhasil dinonaktifkan.' };
	},
	'save-gemini-key': async ({ request, locals }) => {
		if (locals.user?.type !== 'admin' && locals.user?.type !== 'kepala_sekolah') {
			return fail(403, {
				message: 'Hanya admin/kepala sekolah yang dapat mengatur kunci API.'
			});
		}

		const form = await request.formData();
		const apiKey = String(form.get('apiKey') ?? '').trim();
		if (!apiKey) {
			return fail(400, { message: 'Kunci API wajib diisi.' });
		}
		if (apiKey.length < 10) {
			return fail(400, { message: 'Kunci API tidak valid.' });
		}

		const model = String(form.get('model') ?? '').trim() || DEFAULT_AI_MODEL;
		const baseUrl = String(form.get('baseUrl') ?? '').trim();
		if (!baseUrl) {
			return fail(400, { message: 'Base URL wajib diisi.' });
		}

		await saveAiSettings(apiKey, model, baseUrl);
		return { message: 'Kunci API berhasil disimpan.' };
	},
	'clear-gemini-key': async ({ locals }) => {
		if (locals.user?.type !== 'admin' && locals.user?.type !== 'kepala_sekolah') {
			return fail(403, {
				message: 'Hanya admin/kepala sekolah yang dapat mengatur kunci API.'
			});
		}

		await clearAiSettings();
		return { message: 'Kunci API berhasil dihapus.' };
	},
	'save-my-ai-key': async ({ request, locals }) => {
		if (
			locals.user?.type !== 'user' &&
			locals.user?.type !== 'wali_kelas' &&
			locals.user?.type !== 'wali_asuh'
		) {
			return fail(403, {
				message:
					'Hanya guru (guru mapel/wali kelas/wali asuh) yang dapat mengatur kunci API pribadi.'
			});
		}
		const userId = locals.user.id;

		const form = await request.formData();
		const apiKey = String(form.get('apiKey') ?? '').trim();
		if (!apiKey) {
			return fail(400, { message: 'Kunci API wajib diisi.' });
		}
		if (apiKey.length < 10) {
			return fail(400, { message: 'Kunci API tidak valid.' });
		}

		const model = String(form.get('model') ?? '').trim();
		const baseUrl = String(form.get('baseUrl') ?? '').trim();

		await saveUserAiSettings(userId, apiKey, model, baseUrl);
		return { message: 'Kunci API pribadi berhasil disimpan.' };
	},
	'clear-my-ai-key': async ({ locals }) => {
		if (
			locals.user?.type !== 'user' &&
			locals.user?.type !== 'wali_kelas' &&
			locals.user?.type !== 'wali_asuh'
		) {
			return fail(403, {
				message:
					'Hanya guru (guru mapel/wali kelas/wali asuh) yang dapat mengatur kunci API pribadi.'
			});
		}

		await clearUserAiSettings(locals.user.id);
		return { message: 'Kunci API pribadi berhasil dihapus.' };
	}
};
