import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { uploadsDir } from '$lib/server/data-dirs';

export type KopSuratOrientasi = 'portrait' | 'landscape';

const ORIENTASI = ['portrait', 'landscape'];

export function isKopSuratOrientasi(value: string): value is KopSuratOrientasi {
	return ORIENTASI.includes(value);
}

export function kopSuratFilePath(sekolahId: number, orientasi: KopSuratOrientasi): string {
	return join(uploadsDir(), `sekolah-${sekolahId}-kop-surat-${orientasi}.png`);
}

// Data URI for PDF templates; null when the school has no custom kop surat.
export function kopSuratDataUri(
	sekolahId: number | undefined,
	orientasi: KopSuratOrientasi
): string | null {
	if (!sekolahId) return null;
	try {
		const buf = readFileSync(kopSuratFilePath(sekolahId, orientasi));
		return `data:image/png;base64,${buf.toString('base64')}`;
	} catch {
		return null;
	}
}
