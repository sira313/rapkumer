import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import net from 'net';
import os from 'os';

function timeStamp() {
	return new Date().toISOString();
}

async function ensureDir(dir) {
	try {
		await fsPromises.mkdir(dir, { recursive: true });
	} catch {
		void 0;
	}
}

async function appendLog(logFile, msg) {
	const line = `[${timeStamp()}] ${msg}\n`;
	try {
		await fsPromises.appendFile(logFile, line, { encoding: 'utf8' });
	} catch {
		try {
			fs.writeFileSync(logFile, line, { flag: 'a' });
		} catch {
			void 0;
		}
	}
}

async function waitForPort(port, attempts = 10, delayMs = 1000) {
	for (let i = 0; i < attempts; i++) {
		const ok = await new Promise((resolve) => {
			const socket = new net.Socket();
			socket.setTimeout(1000);
			socket.once('error', () => {
				socket.destroy();
				resolve(false);
			});
			socket.once('timeout', () => {
				socket.destroy();
				resolve(false);
			});
			socket.connect(port, '127.0.0.1', () => {
				socket.end();
				resolve(true);
			});
		});
		if (ok) return true;
		await new Promise((r) => setTimeout(r, delayMs));
	}
	return false;
}

async function ensureWeasyPrintVenv(appHome, logFile) {
	const standaloneExe = path.join(appHome, 'gtk-runtime', 'weasyprint.exe');
	if (fs.existsSync(standaloneExe)) {
		await appendLog(logFile, 'WeasyPrint standalone executable found, skipping venv creation.');
		return;
	}

	const venvDir = path.join(appHome, 'node_modules', '.weasyprint-venv');
	const weasyBin =
		process.platform === 'win32'
			? path.join(venvDir, 'Scripts', 'weasyprint.exe')
			: path.join(venvDir, 'bin', 'weasyprint');

	if (fs.existsSync(weasyBin)) {
		await appendLog(logFile, 'WeasyPrint venv already exists, skipping creation.');
		return;
	}

	await appendLog(logFile, 'WeasyPrint venv not found. Attempting to create it...');
	console.log('Menyiapkan WeasyPrint untuk cetak PDF...');

	const pythonCmds =
		process.platform === 'win32' ? ['python', 'python3', 'py'] : ['python3', 'python'];

	let pythonCmd = null;
	for (const cmd of pythonCmds) {
		try {
			execSync(`${cmd} --version`, { stdio: 'ignore' });
			pythonCmd = cmd;
			break;
		} catch {
			/* skip */
		}
	}

	if (!pythonCmd) {
		const msg =
			'Python 3 tidak ditemukan. Cetak PDF tidak akan berfungsi. Install Python 3 dan jalankan ulang aplikasi.';
		console.warn(msg);
		await appendLog(logFile, msg);
		return;
	}

	try {
		await appendLog(logFile, `Creating venv with ${pythonCmd}...`);
		execSync(`${pythonCmd} -m venv "${venvDir}"`, { stdio: 'inherit' });

		const pipDir = path.join(venvDir, process.platform === 'win32' ? 'Scripts' : 'bin');
		const pipCmd = path.join(pipDir, 'pip');

		await appendLog(logFile, 'Installing weasyprint via pip...');
		execSync(`"${pipCmd}" install weasyprint`, { stdio: 'inherit' });

		await appendLog(logFile, 'WeasyPrint venv created successfully.');
		console.log('WeasyPrint siap digunakan.');
	} catch (err) {
		const msg = `Gagal membuat WeasyPrint venv: ${String(err)}. Cetak PDF tidak akan berfungsi.`;
		console.warn(msg);
		await appendLog(logFile, msg);
	}
}

async function main() {
	const __filename = fileURLToPath(import.meta.url);
	const APP_HOME = path.dirname(__filename);

	const PORT = process.env.PORT || '3000';
	const NODE_ENV = process.env.NODE_ENV || 'production';

	const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
	const USER_STATE_ROOT = path.join(localAppData, 'Rapkumer-data');
	const LOG_DIR = path.join(USER_STATE_ROOT, 'logs');
	const LOG_FILE = path.join(LOG_DIR, 'rapkumer.log');

	await ensureDir(LOG_DIR);
	await ensureDir(USER_STATE_ROOT);

	await appendLog(LOG_FILE, `Starting Rapkumer (app home: ${APP_HOME})`);

	// Ensure database exists in user folder
	const srcDb = path.join(APP_HOME, '..', 'data', 'database.sqlite3');
	const dstDb = path.join(USER_STATE_ROOT, 'database.sqlite3');
	try {
		if (!fs.existsSync(dstDb)) {
			await appendLog(LOG_FILE, 'Menyalin basis data awal ke direktori pengguna...');
			if (fs.existsSync(srcDb)) {
				await fsPromises.copyFile(srcDb, dstDb);
				await appendLog(LOG_FILE, `Database awal disalin ke ${dstDb}`);
			} else {
				await appendLog(LOG_FILE, `Peringatan: file database sumber tidak ditemukan di ${srcDb}`);
			}
		}
	} catch (err) {
		await appendLog(LOG_FILE, `Error while ensuring database: ${String(err)}`);
	}

	// Ensure WeasyPrint virtual environment exists for PDF generation
	await ensureWeasyPrintVenv(APP_HOME, LOG_FILE);

	// Prepare DB URL (replace backslashes with slashes)
	const DB_URL = 'file:' + dstDb.replace(/\\/g, '/');

	await appendLog(LOG_FILE, `Using DB_URL=${DB_URL}`);

	console.log(`Menjalankan Rapkumer pada http://localhost:${PORT}`);
	await appendLog(
		LOG_FILE,
		`Starting Rapkumer using node start-build.mjs on port ${PORT} with DB_URL=${DB_URL}`
	);

	const childEnv = {
		...process.env,
		PORT: String(PORT),
		NODE_ENV,
		BODY_SIZE_LIMIT: '5242880',
		DB_URL,
		DATABASE_URL: DB_URL
	};
	const nodeBin = process.execPath || 'node';

	// Spawn the start-build script as a detached background process.
	// Redirect stdout/stderr directly into the log file so the parent can exit.
	let outFd = null;
	try {
		outFd = fs.openSync(LOG_FILE, 'a');
	} catch (e) {
		await appendLog(LOG_FILE, `Failed to open log file descriptor: ${String(e)}`);
	}

	const stdio = outFd !== null ? ['ignore', outFd, outFd] : ['ignore', 'ignore', 'ignore'];

	const child = spawn(nodeBin, ['start-build.mjs'], {
		cwd: APP_HOME,
		env: childEnv,
		detached: true,
		stdio,
		windowsHide: true
	});

	child.on('error', async (err) => {
		await appendLog(LOG_FILE, `Failed to spawn start-build.mjs: ${String(err)}`);
	});

	try {
		child.unref();
	} catch {
		void 0;
	}

	// Close our copy of the descriptor; the child has its own copy.
	if (outFd !== null) {
		try {
			fs.closeSync(outFd);
		} catch {
			void 0;
		}
	}

	// Wait for server to be available, then open browser on Windows
	const listening = await waitForPort(Number(PORT), 10, 1000);
	if (listening) {
		await appendLog(LOG_FILE, 'Server is listening on port ' + PORT);
		if (process.platform === 'win32') {
			const url = `http://localhost:${PORT}`;
			console.log('Sedang membuka Rapkumer...');
			await appendLog(LOG_FILE, `Opening browser to ${url}`);
			const cmdPath = process.env.ComSpec || 'cmd.exe';
			try {
				const opener = spawn(cmdPath, ['/c', 'start', '', url], {
					windowsHide: true,
					detached: true
				});
				opener.on('error', async (e) => {
					await appendLog(LOG_FILE, `Failed to open browser (spawn error): ${String(e)}`);
				});
				try {
					opener.unref();
				} catch {
					void 0;
				}
			} catch (err) {
				await appendLog(LOG_FILE, `Failed to open browser: ${String(err)}`);
			}

			// Exit parent process so the terminal closes, leaving the detached server running
			process.exit(0);
		}
	} else {
		await appendLog(LOG_FILE, 'Warning: server did not respond after waiting');
	}
}

main().catch(async (err) => {
	const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
	const LOG_FILE = path.join(localAppData, 'Rapkumer-data', 'logs', 'rapkumer.log');
	try {
		await appendLog(LOG_FILE, `Fatal: ${String(err)}`);
	} catch {
		void 0;
	}
	console.error(err);
	process.exit(1);
});
