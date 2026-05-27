import { spawn } from 'node:child_process';
import { join } from 'node:path';

function resolveWeasyPrintBin(): string {
	if (process.env.WEASYPRINT_BIN) return process.env.WEASYPRINT_BIN;
	if (process.platform === 'win32') return join('gtk-runtime', 'weasyprint.exe');
	const venvDir = join('node_modules', '.weasyprint-venv');
	return join(venvDir, 'bin', 'weasyprint');
}

const WEASYPRINT_BIN = resolveWeasyPrintBin();

export async function renderPDF(html: string): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		const proc = spawn(WEASYPRINT_BIN, ['-', '-'], {
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true
		});

		const chunks: Buffer[] = [];
		const errorChunks: Buffer[] = [];

		proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
		proc.stderr.on('data', (chunk: Buffer) => errorChunks.push(chunk));

		proc.on('close', (code) => {
			if (code === 0) {
				resolve(Buffer.concat(chunks));
			} else {
				reject(
					new Error(`WeasyPrint exited with code ${code}: ${Buffer.concat(errorChunks).toString()}`)
				);
			}
		});

		proc.on('error', (err) => reject(err));

		proc.stdin.write(html);
		proc.stdin.end();
	});
}
