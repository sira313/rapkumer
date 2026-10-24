import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { networkInterfaces } from 'node:os';
import { env } from '$env/dynamic/private';
import { dataRoot } from '$lib/server/data-dirs';

// Use the shared user-data root (RAPKUMER_DATA_DIR -> LOCALAPPDATA\Rapkumer-data
// on Windows -> <cwd>/data), so trusted origins persist across upgrades.
const dataDir = dataRoot();

const ORIGINS_FILE = join(dataDir, 'csrf-origins.txt');
const CACHE_TTL = 5_000; // ms

let cache: { set: Set<string>; updatedAt: number } | null = null;

function normalizeOrigin(value: string | null | undefined): string | undefined {
	if (!value) return undefined;
	try {
		const origin = new URL(value).origin.toLowerCase();
		if (!origin.startsWith('http:') && !origin.startsWith('https:')) return undefined;
		return origin;
	} catch {
		return undefined;
	}
}

async function readFileOrigins(): Promise<Set<string>> {
	try {
		const raw = await readFile(ORIGINS_FILE, { encoding: 'utf8' });
		const entries = raw
			.split(/[,\n\r]+/) // allow CSV or newline separated
			.map((s) => s.trim())
			.filter(Boolean)
			.map((s) => normalizeOrigin(s))
			.filter((s): s is string => Boolean(s));
		return new Set(entries);
	} catch {
		// file may not exist or unreadable; treat as empty
		return new Set();
	}
}

async function readRepoDataFileOrigins(): Promise<Set<string>> {
	const repoPath = join(process.cwd(), 'data', 'csrf-origins.txt');
	try {
		const raw = await readFile(repoPath, { encoding: 'utf8' });
		const entries = raw
			.split(/[,\n\r]+/)
			.map((s) => s.trim())
			.filter(Boolean)
			.map((s) => normalizeOrigin(s))
			.filter((s): s is string => Boolean(s));
		return new Set(entries);
	} catch {
		return new Set();
	}
}

export async function getFileTrustedOrigins(): Promise<Set<string>> {
	const now = Date.now();
	if (cache && now - cache.updatedAt < CACHE_TTL) return cache.set;

	const set = await readFileOrigins();
	cache = { set, updatedAt: now };
	return set;
}

export async function writeFileTrustedOrigins(origins: string[]): Promise<void> {
	const normalized: string[] = [];
	for (const o of origins) {
		const n = normalizeOrigin(o);
		if (!n) throw new Error(`Invalid origin: ${o}`);
		normalized.push(n);
	}

	const out = normalized.join(',');
	const tmp = `${ORIGINS_FILE}.tmp`;
	// ensure parent directory exists (create if necessary)
	try {
		await mkdir(dirname(ORIGINS_FILE), { recursive: true });
	} catch {
		// ignore mkdir errors (will surface on write)
	}
	await writeFile(tmp, out, { encoding: 'utf8' });
	await rename(tmp, ORIGINS_FILE);
	// update cache immediately
	cache = { set: new Set(normalized), updatedAt: Date.now() };
}

export async function readCombinedOriginsFromEnvAndFile(): Promise<Set<string>> {
	const envRaw = env.RAPKUMER_CSRF_TRUSTED_ORIGINS || '';
	const envEntries = envRaw
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => normalizeOrigin(s))
		.filter((s): s is string => Boolean(s));

	const fileSet = await getFileTrustedOrigins();
	// Also always check repo ./data as an additional source (helpful for dev and
	// build tests). We prefer the repo-local file when present (so working tree
	// overrides an AppData persisted file during development). If the repo file
	// is missing, fall back to the persisted data dir file. The environment
	// variable is only used when no file-based sources exist at all.
	const repoSet = await readRepoDataFileOrigins();

	// Choose the primary source (repo file > persisted data dir > env)
	let primary: Set<string>;
	if (repoSet.size > 0) primary = new Set<string>(repoSet);
	else if (fileSet.size > 0) primary = new Set<string>(fileSet);
	else primary = new Set<string>(envEntries);

	// Always attempt to detect local IPv4 addresses on the host and add them
	// to the trusted origins set so LAN access works without manual editing.
	// Construct origins for both http/https and with/without port for
	// compatibility.
	const port = (env.RAPKUMER_PORT || env.PORT || '3000').toString();
	const detected = new Set<string>();
	try {
		const nets = networkInterfaces();
		for (const name of Object.keys(nets)) {
			const addrs = nets[name];
			if (!addrs) continue;
			for (const a of addrs) {
				if (a.family !== 'IPv4' || a.internal) continue;
				const ip = a.address;
				// add both with and without port, and both schemes
				detected.add(normalizeOrigin(`http://${ip}:${port}`) ?? '');
				detected.add(normalizeOrigin(`https://${ip}:${port}`) ?? '');
				detected.add(normalizeOrigin(`http://${ip}`) ?? '');
				detected.add(normalizeOrigin(`https://${ip}`) ?? '');
			}
		}
	} catch {
		// ignore detection errors
	}

	// Ensure localhost/loopback variants are trusted by default (with and
	// without port) so local browser requests to localhost:3000 aren't
	// rejected even when no file/env entries exist.
	const loopbacks = [
		`http://localhost:${port}`,
		`https://localhost:${port}`,
		`http://localhost`,
		`https://localhost`,
		`http://127.0.0.1:${port}`,
		`https://127.0.0.1:${port}`,
		`http://127.0.0.1`,
		`https://127.0.0.1`
	];

	for (const l of loopbacks) {
		const n = normalizeOrigin(l);
		if (n) detected.add(n);
	}

	// Merge detected (filter out invalid/empty entries via normalizeOrigin)
	for (const d of detected) {
		if (d) primary.add(d);
	}

	return primary;
}

export { normalizeOrigin };
