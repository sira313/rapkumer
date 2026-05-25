import { spawn } from 'node:child_process';

const WEASYPRINT_BIN = '/tmp/weasyprint-venv/bin/weasyprint';

export async function renderPDF(html: string): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		const proc = spawn(WEASYPRINT_BIN, ['-', '-'], {
			stdio: ['pipe', 'pipe', 'pipe']
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
