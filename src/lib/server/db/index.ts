import { env } from '$env/dynamic/private';
import path from 'node:path';
import fs from 'node:fs';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql/node';
import * as schema from './schema';

const defaultDbUrl = 'file:./data/database.sqlite3';

// Try to read a local `.env` file at runtime (dependency-free) so a built `node` run
// can pick up `DB_URL` / `DB_AUTH_TOKEN` without requiring an external loader.
function loadDotEnvIfPresent() {
	if (process.env.DB_URL || process.env.DB_AUTH_TOKEN) return;

	try {
		const envPath = path.resolve(process.cwd(), '.env');
		if (!fs.existsSync(envPath)) return;
		const raw = fs.readFileSync(envPath, 'utf8');
		for (const line of raw.split(/\r?\n/)) {
			const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
			if (!m) continue;
			const key = m[1];
			let val = m[2] ?? '';
			// Remove surrounding quotes if present
			if (
				(val.startsWith('"') && val.endsWith('"')) ||
				(val.startsWith("'") && val.endsWith("'"))
			) {
				val = val.slice(1, -1);
			}
			if (key === 'DB_URL' || key === 'DB_AUTH_TOKEN') {
				process.env[key] = val;
			}
		}
	} catch (e) {
		// Non-fatal: if reading fails, just continue and fall back to other heuristics
		console.warn('[db] failed to read .env file:', e);
	}
}

loadDotEnvIfPresent();

function resolveInstalledDbUrl() {
	// Prefer an explicit runtime `process.env.DB_URL` first (allows .env or env vars at node runtime),
	// then SvelteKit's dynamic `env.DB_URL`.
	if (process.env.DB_URL) return process.env.DB_URL;
	if (env.DB_URL) return env.DB_URL;

	// If user didn't set DB_URL, prefer the repository-local database file so
	// local development and packaged runs default to `data/database.sqlite3`.
	return defaultDbUrl;
}
const clientKey = '__rapkumerLibsqlClient';

async function enableWAL(client: Client) {
	try {
		await client.execute('PRAGMA journal_mode=WAL');
		await client.execute('PRAGMA busy_timeout=5000');
	} catch (e) {
		console.warn('[db] failed to enable WAL mode, concurrency may be limited:', e);
	}
}

function createClientInstance(): Client {
	const url = resolveInstalledDbUrl();
	const authToken = env.DB_AUTH_TOKEN;
	console.info(
		`[db] creating libsql client; DB_URL=${url ? url : '(none)'}${authToken ? ' (auth token present)' : ''}`
	);
	const client = createClient({ url, authToken });
	enableWAL(client);
	return client;
}

// create or reuse a client stored on globalThis so hot-reloads keep using same connection
function initClient(): Client {
	const store = globalThis as unknown as Record<string, Client | undefined>;
	const existing = store[clientKey];
	if (existing) return existing;

	const client = createClientInstance();
	store[clientKey] = client;
	return client;
}

let currentClient: Client = initClient();
let currentDb = drizzle(currentClient, { casing: 'snake_case', schema });

export async function reloadDbClient() {
	try {
		const store = globalThis as unknown as Record<string, Client | undefined>;
		const existing = store[clientKey];
		if (existing) {
			const maybeClose = (existing as unknown as { close?: () => Promise<void> | void }).close;
			if (typeof maybeClose === 'function') {
				try {
					await maybeClose.call(existing);
				} catch (e) {
					console.warn('[db] error closing existing client:', e);
				}
			}
		}
		delete store[clientKey];
		currentClient = initClient();
		currentDb = drizzle(currentClient, { casing: 'snake_case', schema });
		console.info('[db] reloaded libsql client and drizzle instance');
	} catch (e) {
		console.error('[db] failed to reload client', e);
	}
}

// Export a proxy that forwards calls to the current drizzle instance so callers can keep
// the same imported object while we swap the underlying instance on import/reset.
const dbProxy = new Proxy(
	{},
	{
		get(_t, prop) {
			const target = currentDb as unknown as Record<string, unknown>;
			const v = (target as Record<string, unknown>)[String(prop)];
			if (typeof v === 'function')
				return (v as unknown as (...args: unknown[]) => unknown).bind(target);
			return v;
		},
		set(_t, prop, value) {
			(currentDb as unknown as Record<string, unknown>)[String(prop)] = value;
			return true;
		}
	}
);

export default dbProxy as unknown as typeof currentDb;
