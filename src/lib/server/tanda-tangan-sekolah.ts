import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { uploadsDir } from '$lib/server/data-dirs';

export type TandaTanganJenis = 'ttd' | 'stempel';

const JENIS = ['ttd', 'stempel'];

export function isTandaTanganJenis(value: string): value is TandaTanganJenis {
	return JENIS.includes(value);
}

export function tandaTanganFilePath(sekolahId: number, jenis: TandaTanganJenis): string {
	return join(uploadsDir(), `sekolah-${sekolahId}-${jenis}.png`);
}

export function tandaTanganDataUri(
	sekolahId: number | null | undefined,
	jenis: TandaTanganJenis
): string | null {
	if (!sekolahId) return null;
	try {
		const buf = readFileSync(tandaTanganFilePath(sekolahId, jenis));
		return `data:image/png;base64,${buf.toString('base64')}`;
	} catch {
		return null;
	}
}

// Fixed sizes so both images render identically on every page, regardless of
// the container each template provides (mm-based spacers vary per template).
const TTD_HEIGHT = '27.5mm';
const STEMPEL_HEIGHT = '35mm';
const STEMPEL_SHIFT = '15mm';
// Nudge the whole pair down and left slightly from the anchor point.
const DOWN_SHIFT = '3mm';
const LEFT_SHIFT = '3mm';

/**
 * Signature + stamp block that sits right above the kepala sekolah name in PDF
 * templates: the signature is centered, the stamp overlaps it slightly to the
 * left. Images are absolutely positioned and painted behind the text (like
 * Word's "behind text" wrap) so they never resize or shift the existing
 * layout — the box keeps the caller's spacer height even when they overflow.
 */
export function ttdStempelBoxHTML(
	sekolahId: number | null | undefined,
	height: string,
	leftShift: string = LEFT_SHIFT,
	downShift: string = DOWN_SHIFT,
	sigShift: string = '0mm',
	sigDown: string = '0mm'
): string {
	const ttd = tandaTanganDataUri(sekolahId, 'ttd');
	const stempel = tandaTanganDataUri(sekolahId, 'stempel');
	const box = `position:relative;width:100%;height:${height}`;
	if (!ttd && !stempel) return `<div style="${box}"></div>`;
	const sig = ttd
		? `<img src="${ttd}" alt="" style="position:absolute;left:50%;bottom:calc(-1 * ${downShift} - ${sigDown});transform:translateX(calc(-50% - ${leftShift} - ${sigShift}));height:${TTD_HEIGHT};width:auto;max-width:100%;object-fit:contain;z-index:-1;">`
		: '';
	const stamp = stempel
		? `<img src="${stempel}" alt="" style="position:absolute;left:50%;bottom:calc(-1 * ${downShift});transform:translateX(calc(-50% - ${leftShift} - ${ttd ? STEMPEL_SHIFT : '0mm'}));height:${STEMPEL_HEIGHT};width:auto;max-width:100%;object-fit:contain;z-index:-1;">`
		: '';
	return `<div style="${box}">${sig}${stamp}</div>`;
}
