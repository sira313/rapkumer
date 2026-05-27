#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const MSYS2_REPO = 'https://repo.msys2.org/mingw/mingw64';

const REQUIRED_PACKAGES = [
	'mingw-w64-x86_64-glib2',
	'mingw-w64-x86_64-pango',
	'mingw-w64-x86_64-harfbuzz',
	'mingw-w64-x86_64-fontconfig',
	'mingw-w64-x86_64-freetype',
	'mingw-w64-x86_64-fribidi',
	'mingw-w64-x86_64-expat',
	'mingw-w64-x86_64-libpng',
	'mingw-w64-x86_64-pcre2',
	'mingw-w64-x86_64-libffi',
	'mingw-w64-x86_64-gettext',
	'mingw-w64-x86_64-libiconv',
	'mingw-w64-x86_64-zlib',
	'mingw-w64-x86_64-bzip2',
	'mingw-w64-x86_64-graphite2',
	'mingw-w64-x86_64-gcc-libs', // libgcc_s_seh-1.dll, libstdc++-6.dll
	'mingw-w64-x86_64-libthai', // libthai-0.dll
	'mingw-w64-x86_64-brotli', // libbrotlidec.dll
	'mingw-w64-x86_64-cairo', // libcairo-2.dll
	'mingw-w64-x86_64-libwinpthread', // libwinpthread-1.dll
	'mingw-w64-x86_64-libdatrie', // libdatrie-1.dll
	'mingw-w64-x86_64-pixman' // libpixman-1-0.dll
];

function run(cmd, args = [], opts = {}) {
	console.info(`  > ${[cmd, ...args].join(' ')}`);
	const res = spawnSync(cmd, args, { stdio: 'inherit', timeout: 120000, ...opts });
	if (res.error) throw new Error(`Command error: ${res.error.message}`);
	if (res.status !== 0) throw new Error(`Exited with code ${res.status}: ${cmd} ${args.join(' ')}`);
	return res;
}

function runOutput(cmd, args = [], opts = {}) {
	const res = spawnSync(cmd, args, { stdio: 'pipe', timeout: 120000, ...opts });
	if (res.error) throw new Error(`Command error: ${res.error.message}`);
	if (res.status !== 0) throw new Error(`Exited with code ${res.status}: ${cmd} ${args.join(' ')}`);
	return res.stdout.toString().trim();
}

async function main() {
	const targetDir = process.argv[2];
	if (!targetDir) {
		console.error('Usage: bundle-gtk-dlls.mjs <target-directory>');
		process.exit(1);
	}

	const absTarget = path.resolve(projectRoot, targetDir);
	mkdirSync(absTarget, { recursive: true });
	console.info(`[bundle-gtk-dlls] Target: ${absTarget}`);

	const cacheDir = path.join(projectRoot, '.gtk-cache');
	mkdirSync(cacheDir, { recursive: true });

	// Fetch MSYS2 package index (cached)
	const indexCache = path.join(cacheDir, 'mingw64-index.html');
	if (!existsSync(indexCache)) {
		console.info('[bundle-gtk-dlls] Downloading MSYS2 package index (6.9 MiB)...');
		run('curl', ['-sL', '--max-time', '60', '-o', indexCache, MSYS2_REPO + '/']);
	} else {
		console.info('[bundle-gtk-dlls] Using cached package index');
	}

	// Read index and find latest package versions
	const indexHtml = readFileSync(indexCache, 'utf-8');

	const downloaded = [];
	for (const pkg of REQUIRED_PACKAGES) {
		// Match only the main package (not -docs, -devel, -tools subpackages).
		// Main packages have a version starting with a digit right after the name.
		const pattern = new RegExp(`href="(${pkg}-\\d[^"]*\\.pkg\\.tar\\.zst)"`, 'g');
		let match;
		let latest = '';
		while ((match = pattern.exec(indexHtml)) !== null) {
			if (match[1] > latest) latest = match[1];
		}
		if (!latest) {
			console.warn(`[bundle-gtk-dlls] WARNING: No package found for ${pkg}`);
			continue;
		}

		const url = `${MSYS2_REPO}/${latest}`;
		const cachePath = path.join(cacheDir, latest);

		if (!existsSync(cachePath)) {
			console.info(`[bundle-gtk-dlls] Downloading ${latest}...`);
			run('curl', ['-sL', '--max-time', '120', '-o', cachePath, url]);
		} else {
			console.info(`[bundle-gtk-dlls] Using cached ${latest}`);
		}
		downloaded.push(cachePath);
	}

	// Extract DLLs from mingw64/bin/ into target
	console.info('[bundle-gtk-dlls] Extracting DLLs...');
	let extractedCount = 0;
	for (const pkgPath of downloaded) {
		try {
			run('bsdtar', [
				'-xf',
				pkgPath,
				'--strip-components',
				'2',
				'-C',
				absTarget,
				'--include=*/bin/*.dll'
			]);
			extractedCount++;
		} catch (err) {
			console.warn(`  Failed to extract ${path.basename(pkgPath)}: ${err.message}`);
		}
	}

	console.info(`[bundle-gtk-dlls] Extracted ${extractedCount} packages.`);

	// Extract fontconfig config files (mingw-w64-x86_64-fontconfig package)
	{
		const fontconfigPkg = downloaded.find((p) =>
			path.basename(p).startsWith('mingw-w64-x86_64-fontconfig-')
		);
		if (fontconfigPkg) {
			console.info('[bundle-gtk-dlls] Extracting fontconfig config files...');
			try {
				run('bsdtar', [
					'-xf',
					fontconfigPkg,
					'--strip-components',
					'3',
					'-C',
					absTarget,
					'--include=*/etc/fonts/*'
				]);
				// fonts.dtd is at share/xml/fontconfig/fonts.dtd (4 components)
				run('bsdtar', [
					'-xf',
					fontconfigPkg,
					'--strip-components',
					'4',
					'-C',
					absTarget,
					'--include=*/share/xml/fontconfig/fonts.dtd'
				]);
				console.info('[bundle-gtk-dlls] Fontconfig config files extracted.');
			} catch (err) {
				console.warn(`  Failed to extract fontconfig config: ${err.message}`);
			}
		} else {
			console.warn('[bundle-gtk-dlls] Fontconfig package not found, skipping config extraction.');
		}
	}

	const files = readdirSync(absTarget)
		.filter((f) => f.endsWith('.dll'))
		.sort();
	console.info(`[bundle-gtk-dlls] Total DLLs: ${files.length}`);
	for (const f of files) {
		console.info(`  ${f}`);
	}
}

main().catch((err) => {
	console.error('[bundle-gtk-dlls] Fatal:', err.message || err);
	process.exitCode = 1;
});
