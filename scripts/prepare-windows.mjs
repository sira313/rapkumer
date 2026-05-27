#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function run(cmd, args = [], opts = {}) {
	console.info(`\n> ${[cmd, ...args].join(' ')}`);
	const res = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
	if (res.error) {
		console.error('Failed to run:', res.error);
		throw res.error;
	}
	if (res.status !== 0) throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
}

function hasCommand(cmd) {
	try {
		const r = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
		return !r.error && r.status === 0;
	} catch {
		return false;
	}
}

function main() {
	const args = process.argv.slice(2);
	const skipBuild = args.includes('--skip-build');
	const outputDir = 'dist/windows';

	const absOutput = path.resolve(projectRoot, outputDir);
	const stageRoot = path.join(absOutput, 'stage');
	const appStage = path.join(stageRoot, 'Rapkumer');

	const hasPnpm = hasCommand('pnpm');

	// 1) Build
	if (!skipBuild) {
		if (hasPnpm) {
			run('pnpm', ['build'], { cwd: projectRoot });
		} else {
			if (!hasCommand('npm')) throw new Error('Neither pnpm nor npm found on PATH');
			run('npm', ['install'], { cwd: projectRoot });
			run('npm', ['run', 'build'], { cwd: projectRoot });
		}
	} else {
		console.info('Skipping build step as requested.');
	}

	// 2) Clean & create staging
	if (fs.existsSync(stageRoot)) {
		fs.rmSync(stageRoot, { recursive: true, force: true });
	}
	fs.mkdirSync(appStage, { recursive: true });

	// 3) Copy build artifacts
	console.info('Copying build artifacts...');
	const buildDir = path.join(projectRoot, 'build');
	if (fs.existsSync(buildDir)) {
		fs.cpSync(buildDir, path.join(appStage, 'build'), { recursive: true, force: true });
	} else {
		console.warn('build/ not found; skipping.');
	}

	// 4) Copy static assets
	console.info('Copying static assets...');
	const staticDir = path.join(projectRoot, 'static');
	if (fs.existsSync(staticDir)) {
		fs.cpSync(staticDir, path.join(appStage, 'static'), { recursive: true, force: true });
	}

	// 5) Copy icon
	const icoPath = path.join(projectRoot, 'static', 'logo.ico');
	if (fs.existsSync(icoPath)) {
		fs.copyFileSync(icoPath, path.join(appStage, 'rapkumer.ico'));
	} else {
		console.warn('File static/logo.ico tidak ditemukan; ikon installer tidak akan diperbarui.');
	}

	// 6) DB migration
	console.info('Running database migration (db:push)...');
	if (hasPnpm) {
		run('pnpm', ['db:push'], { cwd: projectRoot });
	} else {
		if (!hasCommand('npm')) {
			console.warn('npm not found; skipping db:push.');
		} else {
			run('npm', ['install'], { cwd: projectRoot });
			run('npm', ['run', 'db:push'], { cwd: projectRoot });
		}
	}

	// 7) Bundle database
	const dbPath = path.join(projectRoot, 'data', 'database.sqlite3');
	if (fs.existsSync(dbPath)) {
		console.info('Bundling default SQLite database...');
		const dataDir = path.join(appStage, 'data');
		fs.mkdirSync(dataDir, { recursive: true });
		fs.copyFileSync(dbPath, path.join(dataDir, 'database.sqlite3'));
	} else {
		console.warn(
			'Default SQLite database not found; continuing without bundling data/database.sqlite3.'
		);
	}

	// 8) Generate runtime package.json
	console.info('Generating runtime package manifest...');
	const pkgJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));
	const runtimePkg = {
		name: pkgJson.name,
		version: pkgJson.version,
		private: true,
		type: 'module',
		scripts: { start: 'node build/index.js' },
		dependencies: pkgJson.dependencies
	};
	fs.writeFileSync(path.join(appStage, 'package.json'), JSON.stringify(runtimePkg, null, 2));

	// 9) Copy helper scripts
	console.info('Copying runtime helper scripts...');
	const installerDir = path.join(projectRoot, 'installer');

	const startMjs = path.join(installerDir, 'files', 'start-rapkumer.mjs');
	if (fs.existsSync(startMjs)) fs.copyFileSync(startMjs, path.join(appStage, 'start-rapkumer.mjs'));

	const startBuildSrc = path.join(projectRoot, 'scripts', 'start-build.mjs');
	if (fs.existsSync(startBuildSrc))
		fs.copyFileSync(startBuildSrc, path.join(appStage, 'start-build.mjs'));

	const batSrc = path.join(installerDir, 'run-migrations.bat');
	if (fs.existsSync(batSrc)) fs.copyFileSync(batSrc, path.join(appStage, 'run-migrations.bat'));

	// migrate-installed-db.mjs
	const migrateSrc = path.join(projectRoot, 'scripts', 'migrate-installed-db.mjs');
	if (fs.existsSync(migrateSrc)) {
		const sDir = path.join(appStage, 'scripts');
		fs.mkdirSync(sDir, { recursive: true });
		fs.copyFileSync(migrateSrc, path.join(sDir, 'migrate-installed-db.mjs'));
	}

	// Required scripts
	const requiredScripts = [
		'ensure-columns.mjs',
		'fix-drizzle-indexes.mjs',
		'seed-default-admin.mjs',
		'grant-admin-permissions.mjs',
		'notify-server-reload.mjs',
		'start-build.mjs'
	];
	for (const s of requiredScripts) {
		const src = path.join(projectRoot, 'scripts', s);
		if (fs.existsSync(src)) {
			const sDir = path.join(appStage, 'scripts');
			if (!fs.existsSync(sDir)) fs.mkdirSync(sDir, { recursive: true });
			fs.copyFileSync(src, path.join(sDir, s));
		} else {
			console.warn(`Required script ${s} not found; migrator on target may fail.`);
		}
	}

	// 10) Drizzle config, migrations, schema
	console.info('Copying drizzle configuration...');
	const drizzleConfig = path.join(projectRoot, 'drizzle.config.js');
	if (fs.existsSync(drizzleConfig))
		fs.copyFileSync(drizzleConfig, path.join(appStage, 'drizzle.config.js'));

	const drizzleDir = path.join(projectRoot, 'drizzle');
	if (fs.existsSync(drizzleDir))
		fs.cpSync(drizzleDir, path.join(appStage, 'drizzle'), { recursive: true, force: true });

	const schemaSrc = path.join(projectRoot, 'src', 'lib', 'server', 'db', 'schema.ts');
	if (fs.existsSync(schemaSrc)) {
		const schemaDestDir = path.join(appStage, 'src', 'lib', 'server', 'db');
		fs.mkdirSync(schemaDestDir, { recursive: true });
		fs.copyFileSync(schemaSrc, path.join(schemaDestDir, 'schema.ts'));
	}

	// 11) .env.example and .env
	const envExample = path.join(projectRoot, '.env.example');
	if (fs.existsSync(envExample)) fs.copyFileSync(envExample, path.join(appStage, '.env.example'));

	const envTarget = path.join(appStage, '.env');
	if (!fs.existsSync(envTarget)) {
		const envContent =
			'DB_URL=file:%LOCALAPPDATA%/Rapkumer-data/database.sqlite3\nBODY_SIZE_LIMIT=5M\n';
		fs.writeFileSync(envTarget, envContent);
		console.info('Wrote default .env to', envTarget);
	} else {
		console.info('.env already exists in staged app; skipping creation.');
	}

	// 12) Install production dependencies (targeting Windows platform so native
	//     bindings like @libsql/win32-x64-msvc are bundled instead of Linux ones)
	console.info('Installing production dependencies with npm (omit dev, platform=win32)...');
	const nodeModules = path.join(appStage, 'node_modules');
	if (fs.existsSync(nodeModules)) fs.rmSync(nodeModules, { recursive: true, force: true });
	const pkgLock = path.join(appStage, 'package-lock.json');
	if (fs.existsSync(pkgLock)) fs.unlinkSync(pkgLock);
	const winEnv = { ...process.env, npm_config_platform: 'win32', npm_config_arch: 'x64' };
	run('npm', ['install', '--omit=dev', '--no-package-lock'], {
		cwd: appStage,
		env: winEnv
	});

	// 13) Install drizzle-kit
	console.info('Installing drizzle-kit into staged app...');
	try {
		run('npm', ['install', '--no-package-lock', '--no-save', 'drizzle-kit'], {
			cwd: appStage,
			env: winEnv
		});
	} catch {
		console.warn(
			'Failed to install drizzle-kit into staged app; migrations on target may not be possible.'
		);
	}

	// 14) Explicitly install Windows native binding for libsql.
	//     Doing this after all npm operations because npm may prune the package
	//     when it doesn't match the current Linux platform.
	console.info('Installing Windows native binding @libsql/win32-x64-msvc...');
	// NOTE: deliberately omit winEnv here — passing npm_config_platform=win32 makes
	// npm think the package is "up to date" when it really isn't. We use --force to
	// bypass the OS check instead.
	try {
		run('npm', ['install', '--no-save', '--no-package-lock', '--force', '@libsql/win32-x64-msvc'], {
			cwd: appStage
		});
	} catch {
		console.warn('Failed to install @libsql/win32-x64-msvc; server may fail on Windows.');
	}

	// Remove Linux-specific bindings to reduce installer size
	for (const pkg of ['@libsql/linux-x64-gnu', '@libsql/linux-x64-musl']) {
		const p = path.join(appStage, 'node_modules', '@libsql', pkg.replace('@libsql/', ''));
		if (fs.existsSync(p)) {
			fs.rmSync(p, { recursive: true, force: true });
			console.info('Removed', p);
		}
	}

	console.info('\nStaging complete. Contents available at', appStage);
}

main();
