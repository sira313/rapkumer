import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import db from '$lib/server/db';
import { tableBukuTamuSettings } from '$lib/server/db/schema';
import { cookieNames } from '$lib/utils';
import type { Cookies } from '@sveltejs/kit';

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MAX_UNLOCK_ATTEMPTS = 5;
const UNLOCK_WINDOW_MS = 10 * 60 * 1000;
const UNLOCK_LOCKOUT_MS = 15 * 60 * 1000;

interface BukuTamuSettingsRow {
	id: number;
	sekolahId: number;
	passkey: string | null;
	passkeyHash: string | null;
	passkeySalt: string | null;
	unlockToken: string | null;
}

function hashPasskey(passkey: string, salt?: string) {
	const resolvedSalt = salt ?? randomBytes(SALT_BYTES).toString('hex');
	const derived = scryptSync(passkey, resolvedSalt, KEY_LENGTH);
	return { hash: derived.toString('hex'), salt: resolvedSalt };
}

export function verifyPasskey(passkey: string, hash: string, salt: string) {
	try {
		const derived = scryptSync(passkey, salt, KEY_LENGTH);
		return timingSafeEqual(Buffer.from(hash, 'hex'), derived);
	} catch {
		return false;
	}
}

function safeEqual(a: string | null, b: string | null) {
	if (!a || !b || a.length !== b.length) return false;
	return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Resolve the sekolah to scope the passkey to. Public /tamu requests have no
 * authenticated user (so `locals.sekolah` is unset) — fall back to the first
 * sekolah, mirroring `resolveSekolahContext` in the buku-tamu API.
 */
export async function resolveBukuTamuSekolahId(sekolahId?: number | null): Promise<number | null> {
	if (sekolahId) return sekolahId;
	const sekolah = await db.query.tableSekolah.findFirst({
		columns: { id: true }
	});
	return sekolah?.id ?? null;
}

export async function getBukuTamuSettings(sekolahId: number): Promise<BukuTamuSettingsRow | null> {
	const row = await db.query.tableBukuTamuSettings.findFirst({
		where: eq(tableBukuTamuSettings.sekolahId, sekolahId)
	});
	return (row as BukuTamuSettingsRow | undefined) ?? null;
}

export async function isBukuTamuPasskeySet(sekolahId: number): Promise<boolean> {
	const row = await getBukuTamuSettings(sekolahId);
	return Boolean(row?.passkeyHash && row?.passkeySalt);
}

/** True when the visitor may use the guest book: no passkey configured, or the unlock cookie is valid. */
export async function isBukuTamuUnlocked(cookies: Cookies, sekolahId: number): Promise<boolean> {
	const row = await getBukuTamuSettings(sekolahId);
	if (!row?.passkeyHash || !row?.passkeySalt) return true;
	const token = cookies.get(cookieNames.BUKU_TAMU_PASS) ?? null;
	return safeEqual(token, row.unlockToken);
}

export async function getBukuTamuGateState(cookies: Cookies, sekolahId: number | null) {
	if (!sekolahId) return { passkeySet: false, unlocked: true };
	const row = await getBukuTamuSettings(sekolahId);
	const passkeySet = Boolean(row?.passkeyHash && row?.passkeySalt);
	if (!passkeySet) return { passkeySet: false, unlocked: true };
	const token = cookies.get(cookieNames.BUKU_TAMU_PASS) ?? null;
	return { passkeySet, unlocked: safeEqual(token, row?.unlockToken ?? null) };
}

export async function setBukuTamuPasskey(sekolahId: number, passkey: string | null) {
	const now = new Date().toISOString();
	const existing = await getBukuTamuSettings(sekolahId);
	if (!passkey) {
		if (existing) {
			await db.delete(tableBukuTamuSettings).where(eq(tableBukuTamuSettings.id, existing.id));
		}
		return;
	}
	const { hash, salt } = hashPasskey(passkey);
	const unlockToken = randomBytes(32).toString('base64url');
	if (existing) {
		await db
			.update(tableBukuTamuSettings)
			.set({ passkey, passkeyHash: hash, passkeySalt: salt, unlockToken, updatedAt: now })
			.where(eq(tableBukuTamuSettings.id, existing.id));
	} else {
		await db.insert(tableBukuTamuSettings).values({
			sekolahId,
			passkey,
			passkeyHash: hash,
			passkeySalt: salt,
			unlockToken,
			createdAt: now,
			updatedAt: now
		});
	}
}

export async function getBukuTamuPasskey(sekolahId: number): Promise<string | null> {
	const row = await getBukuTamuSettings(sekolahId);
	return row?.passkey ?? null;
}

export function applyBukuTamuUnlockCookie(cookies: Cookies, token: string, secure: boolean) {
	cookies.set(cookieNames.BUKU_TAMU_PASS, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure
	});
}

// Simple in-memory per-IP limiter for passkey unlock attempts. The login guard
// is DB-backed, but the guest-book passkey is a low-sensitivity gate, so a
// process-local counter is sufficient (single-instance adapter-node server).
const unlockAttempts = new Map<string, number[]>();

function pruneAttempts(ip: string) {
	const now = Date.now();
	const list = (unlockAttempts.get(ip) ?? []).filter((t) => now - t < UNLOCK_WINDOW_MS);
	if (list.length === 0) unlockAttempts.delete(ip);
	else unlockAttempts.set(ip, list);
	return list;
}

export function checkUnlockBlocked(ip: string): { blocked: boolean; retryAfterSeconds?: number } {
	const list = pruneAttempts(ip);
	if (list.length < MAX_UNLOCK_ATTEMPTS) return { blocked: false };
	const oldest = list[list.length - MAX_UNLOCK_ATTEMPTS];
	const unlockAt = oldest + UNLOCK_LOCKOUT_MS;
	const now = Date.now();
	if (now < unlockAt) {
		return { blocked: true, retryAfterSeconds: Math.ceil((unlockAt - now) / 1000) };
	}
	unlockAttempts.delete(ip);
	return { blocked: false };
}

export function recordUnlockFailure(ip: string) {
	const list = pruneAttempts(ip);
	list.push(Date.now());
	unlockAttempts.set(ip, list);
	return MAX_UNLOCK_ATTEMPTS - list.length;
}

export function clearUnlockFailures(ip: string) {
	unlockAttempts.delete(ip);
}
