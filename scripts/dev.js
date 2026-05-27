// @ts-check
import { spawn } from 'child_process';

const args = process.argv.slice(2);
const vite_args = ['dev', ...args];

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
