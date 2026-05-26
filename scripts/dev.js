// @ts-check
import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const vite_args = ['dev', ...args];

const venvDir = join('node_modules', '.weasyprint-venv');
const weasyBin =
	process.platform === 'win32'
		? join(venvDir, 'Scripts', 'weasyprint.exe')
		: join(venvDir, 'bin', 'weasyprint');

if (!existsSync(weasyBin)) {
	console.log('🔄 Creating WeasyPrint virtual environment...');
	try {
		const python = process.platform === 'win32' ? 'python' : 'python3';
		const pipDir = join(venvDir, process.platform === 'win32' ? 'Scripts' : 'bin');
		execSync(`${python} -m venv "${venvDir}"`, { stdio: 'inherit' });
		execSync(`"${join(pipDir, 'pip')}" install weasyprint`, { stdio: 'inherit' });
	} catch {
		console.error('Gagal membuat virtual environment WeasyPrint. Pastikan Python 3 tersedia.');
		process.exit(1);
	}
}

const icon_process = spawn('node', ['scripts/icon.js'], { stdio: 'inherit' });
const vite_process = spawn('npx', ['vite', ...vite_args], { stdio: 'inherit', shell: true });

/** @param {string} name */
const on_exit = (name) => {
	return /** @param {number} code */ (code) => {
		if (code !== 0) {
			console.error(`Process "${name}" exited with code ${code}`);
			process.exit(code);
		}
	};
};

icon_process.on('exit', on_exit('icon'));
vite_process.on('exit', on_exit('vite'));
