// TP Mode Builders - Robust & Testable
// Handles 'compact' and 'full-desc' modes for capaian kompetensi

const LOCALE_ID = 'id-ID';

export type PredikatKey = 'perlu-bimbingan' | 'cukup' | 'baik' | 'sangat-baik';

export interface PredikatDetail {
	key: PredikatKey;
	label: string;
	narrative: string;
}

export type TujuanScoreEntry = {
	tujuanPembelajaranId: number;
	deskripsi: string;
	nilai: number;
};

export type CapaianDescriptor = TujuanScoreEntry & {
	predikat: PredikatDetail;
};

const PREDIKAT_ORDER: Record<PredikatKey, number> = {
	'perlu-bimbingan': 0,
	cukup: 1,
	baik: 2,
	'sangat-baik': 3
};

// Determine predikat based on nilai, KKM, and optional criteria ranges
export function determinePredikat(
	nilai: number,
	kkm: number | null | undefined,
	kritCukup?: number,
	kritBaik?: number
): PredikatDetail {
	const numericKkm = typeof kkm === 'number' && Number.isFinite(kkm) ? Math.round(kkm) : 0;
	const baseKkm = Math.max(0, numericKkm);
	const cUpper =
		typeof kritCukup === 'number' && Number.isFinite(kritCukup) ? Math.round(kritCukup) : 85;
	const bUpper =
		typeof kritBaik === 'number' && Number.isFinite(kritBaik) ? Math.round(kritBaik) : 95;

	if (nilai < baseKkm) {
		return { key: 'perlu-bimbingan', label: 'Perlu Bimbingan', narrative: 'masih perlu bimbingan' };
	}

	if (nilai <= cUpper) {
		return { key: 'cukup', label: 'Cukup', narrative: 'menunjukkan penguasaan yang cukup' };
	}

	if (nilai <= bUpper) {
		return { key: 'baik', label: 'Baik', narrative: 'menunjukkan penguasaan yang baik' };
	}

	return {
		key: 'sangat-baik',
		label: 'Sangat Baik',
		narrative: 'menunjukkan penguasaan yang sangat baik'
	};
}

/**
 * Compare two descriptors for sorting
 */
export function compareDescriptorAscending(a: CapaianDescriptor, b: CapaianDescriptor): number {
	const predikatDiff = PREDIKAT_ORDER[a.predikat.key] - PREDIKAT_ORDER[b.predikat.key];
	if (predikatDiff !== 0) return predikatDiff;
	if (a.nilai !== b.nilai) return a.nilai - b.nilai;
	if (a.tujuanPembelajaranId !== b.tujuanPembelajaranId) {
		return a.tujuanPembelajaranId - b.tujuanPembelajaranId;
	}
	return a.deskripsi.localeCompare(b.deskripsi, LOCALE_ID);
}

// Build a single deskripsi line for a descriptor
function buildDeskripsiLine(muridNama: string, descriptor: CapaianDescriptor): string {
	const nama = muridNama.trim().length > 0 ? muridNama.trim() : muridNama;
	const narrative = descriptor.predikat.narrative;

	if (descriptor.predikat.key === 'cukup') {
		return `Ananda ${nama} cukup mampu ${descriptor.deskripsi}`;
	}

	return `Ananda ${nama} ${narrative} dalam ${descriptor.deskripsi}`;
}

// Build a combined line for multiple achieved descriptors (tercapai)
function buildCombinedTercapaiLine(muridNama: string, descriptors: CapaianDescriptor[]): string {
	const nama = muridNama.trim().length > 0 ? muridNama.trim() : muridNama;

	if (descriptors.length === 0) return '';
	if (descriptors.length === 1) return buildDeskripsiLine(muridNama, descriptors[0]);

	// Build sentence for each descriptor
	const sentences: string[] = [];

	for (let i = 0; i < descriptors.length; i++) {
		const d = descriptors[i];
		const cleanDesc = d.deskripsi.replace(/[.!?]+$/gu, '').trim();
		const narrative = d.predikat.narrative;

		let sentence = '';
		if (d.predikat.key === 'cukup') {
			sentence = `cukup mampu ${cleanDesc}`;
		} else {
			sentence = `${narrative} dalam ${cleanDesc}`;
		}

		// For first sentence, prepend nama
		if (i === 0) {
			sentences.push(`Ananda ${nama} ${sentence}`);
		} else {
			sentences.push(sentence);
		}
	}

	return sentences.join(', dan ') + '.';
}

// Join list of items with Indonesian grammar
function joinList(items: string[]): string {
	if (!items.length) return '';
	if (items.length === 1) return items[0];
	if (items.length === 2) return `${items[0]} dan ${items[1]}`;
	return items.slice(0, -1).join(', ') + ', dan ' + items.at(-1);
}

// Capitalize first letter
function capitalizeFirst(s: string) {
	if (!s) return s;
	return s.charAt(0).toUpperCase() + s.slice(1);
}

// Compact mode: Show exactly 2 TP with new logic
// - tercapai (achieved): cukup, baik, sangat baik - digabung jadi 1 baris
// - belum tercapai (not achieved): perlu bimbingan
export function buildCompactMode(muridNama: string, descriptors: CapaianDescriptor[]): string {
	if (!descriptors.length) {
		return 'Belum ada penilaian sumatif.';
	}

	// Separate tercapai from belum tercapai
	const tercapai: CapaianDescriptor[] = [];
	const belumTercapai: CapaianDescriptor[] = [];

	for (const d of descriptors) {
		if (d.predikat.key === 'perlu-bimbingan') {
			belumTercapai.push(d);
		} else {
			tercapai.push(d);
		}
	}

	// Sort tercapai by nilai (highest first), then by ID for consistency
	tercapai.sort((a, b) => {
		const nilaiDiff = b.nilai - a.nilai; // descending
		if (nilaiDiff !== 0) return nilaiDiff;
		return a.tujuanPembelajaranId - b.tujuanPembelajaranId;
	});

	// Sort belumTercapai by nilai (lowest first) for consistency
	belumTercapai.sort((a, b) => {
		const nilaiDiff = a.nilai - b.nilai; // ascending
		if (nilaiDiff !== 0) return nilaiDiff;
		return a.tujuanPembelajaranId - b.tujuanPembelajaranId;
	});

	// Build result based on availability
	const lines: string[] = [];

	// If all tercapai: combine up to 2 TP into 1 baris
	if (belumTercapai.length === 0) {
		if (tercapai.length === 1) {
			return buildDeskripsiLine(muridNama, tercapai[0]);
		}
		// Take max 2 highest (sorted descending by nilai) and combine them
		const toDisplay = tercapai.slice(0, 2);
		return buildCombinedTercapaiLine(muridNama, toDisplay);
	}

	// If there are belumTercapai: 1st line tercapai (highest), 2nd line belumTercapai (lowest)
	if (tercapai.length > 0) {
		lines.push(buildDeskripsiLine(muridNama, tercapai[0]));
	}

	if (belumTercapai.length > 0) {
		lines.push(buildDeskripsiLine(muridNama, belumTercapai[0]));
	}

	return lines.join('\n');
}

// Full-desc mode: Paragraph-style with sentences grouped as tercapai/tidak tercapai
export function buildFullDescMode(muridNama: string, descriptors: CapaianDescriptor[]): string {
	if (!descriptors.length) {
		return 'Belum ada penilaian sumatif.';
	}

	const sorted = descriptors.slice().sort(compareDescriptorAscending);

	const groups: Record<PredikatKey, CapaianDescriptor[]> = {
		'sangat-baik': [],
		baik: [],
		cukup: [],
		'perlu-bimbingan': []
	};

	for (const d of sorted) {
		groups[d.predikat.key].push(d);
	}

	const achievedOrder: PredikatKey[] = ['sangat-baik', 'baik', 'cukup'];
	const achievedSentences: string[] = [];

	for (let i = 0; i < achievedOrder.length; i++) {
		const key = achievedOrder[i];
		const list = groups[key];
		if (!list.length) continue;

		const descs = list.map((it) => it.deskripsi.replace(/[.!?]+$/gu, '').trim());
		const joined = joinList(descs);

		let phrase = '';
		if (key === 'sangat-baik') phrase = `menunjukkan penguasaan yang sangat baik dalam ${joined}.`;
		else if (key === 'baik') phrase = `menunjukkan penguasaan yang baik dalam ${joined}.`;
		else phrase = `cukup mampu ${joined}.`;

		if (achievedSentences.length === 0) {
			achievedSentences.push(`Ananda ${muridNama} ${phrase}`);
		} else {
			achievedSentences.push(capitalizeFirst(phrase));
		}
	}

	const achievedParagraph = achievedSentences.length ? achievedSentences.join(' ') : '';

	// Build "tidak tercapai" paragraph
	const needList = groups['perlu-bimbingan'];
	let notAchievedParagraph = '';
	if (needList.length) {
		const descs = needList.map((it) => it.deskripsi.replace(/[.!?]+$/gu, '').trim());
		const joined = joinList(descs);
		notAchievedParagraph = `Ananda ${muridNama} masih perlu bimbingan dalam ${joined}.`;
	}

	if (achievedParagraph && notAchievedParagraph) {
		return `${achievedParagraph}\n${notAchievedParagraph}`;
	}
	if (achievedParagraph) return achievedParagraph;
	if (notAchievedParagraph) return notAchievedParagraph;
	return '';
}

// Main builder function - orchestrates all modes
export function buildCapaianKompetensi(
	muridNama: string,
	tujuanScores: TujuanScoreEntry[],
	kkm: number | null | undefined,
	mode: 'compact' | 'full-desc' = 'compact',
	kritCukup?: number,
	kritBaik?: number
): string {
	if (!tujuanScores.length) {
		return 'Belum ada penilaian sumatif.';
	}

	// Build descriptors
	const descriptors = tujuanScores.map<CapaianDescriptor>((entry) => ({
		...entry,
		predikat: determinePredikat(entry.nilai, kkm, kritCukup, kritBaik)
	}));

	// Route to appropriate mode builder
	switch (mode) {
		case 'full-desc':
			return buildFullDescMode(muridNama, descriptors);
		default:
			return buildCompactMode(muridNama, descriptors);
	}
}
