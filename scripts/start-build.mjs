import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function loadDotEnv() {
	try {
		const envPath = path.resolve(process.cwd(), '.env');
		if (!fs.existsSync(envPath)) return;
		const raw = fs.readFileSync(envPath, 'utf8');
		for (const line of raw.split(/\r?\n/)) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const m = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
			if (!m) continue;
			const key = m[1];
			let val = m[2] ?? '';
			if (
				(val.startsWith('"') && val.endsWith('"')) ||
				(val.startsWith("'") && val.endsWith("'"))
			) {
				val = val.slice(1, -1);
			}
			if (process.env[key] === undefined) process.env[key] = val;
		}
	} catch (e) {
		console.warn('[start-build] failed to read .env file', e);
	}
}

loadDotEnv();

// Helpful debug: show the BODY_SIZE_LIMIT that will be used by the built server
try {
	console.info('[start-build] BODY_SIZE_LIMIT=', process.env.BODY_SIZE_LIMIT);
} catch (e) {
	console.debug('[start-build] failed to read BODY_SIZE_LIMIT from env', e);
}

// Resolve the built server entry (`build/index.js`) from a few likely locations
// so this script works both in-repo (scripts/) and when installed to a
// top-level `Rapkumer` folder (where `start-build.mjs` may live alongside `build/`).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const candidates = [
	path.join(__dirname, 'build', 'index.js'),
	path.join(__dirname, '..', 'build', 'index.js'),
	path.join(process.cwd(), 'build', 'index.js')
];

(async () => {
	for (const cand of candidates) {
		try {
			if (fs.existsSync(cand)) {
				const url = pathToFileURL(cand).href;
				await import(url);
				return;
			}
		} catch (err) {
			console.warn('[start-build] failed to load candidate:', cand, err && (err.message || err));
		}
	}

	// Fallback to the original relative import to preserve previous behavior and error message
	import('../build/index.js').catch((err) => {
		console.error('[start-build] failed to start built server', err);

		// Detect @libsql native addon failure and suggest VC++ Redistributable
		const msg = (err && (err.message || String(err))) || '';
		if (
			msg.includes('@libsql') &&
			(msg.includes('index.node') || msg.includes('ERR_DLOPEN_FAILED'))
		) {
			console.error('');
			console.error('=====================================================================');
			console.error('KESALAHAN: Native addon @libsql/win32-x64-msvc gagal dimuat.');
			console.error('');
			console.error('Kemungkinan penyebab: Microsoft Visual C++ Redistributable');
			console.error('2015-2022 (x64) belum terinstall di komputer ini.');
			console.error('');
			console.error('Solusi: Jalankan ulang installer Rapkumer, atau unduh dan');
			console.error('install langsung dari Microsoft:');
			console.error('  https://aka.ms/vs/17/release/vc_redist.x64.exe');
			console.error('=====================================================================');
		}

		process.exit(1);
	});
})();
