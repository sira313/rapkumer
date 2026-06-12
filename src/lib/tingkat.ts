const ROMAN_MAP: Record<string, number> = {
	I: 1,
	II: 2,
	III: 3,
	IV: 4,
	V: 5,
	VI: 6,
	VII: 7,
	VIII: 8,
	IX: 9,
	X: 10,
	XI: 11,
	XII: 12
};

export const lastGradeOfFase: Record<string, number> = {
	'Fase A': 2,
	'Fase B': 4,
	'Fase C': 6,
	'Fase D': 9,
	'Fase E': 10,
	'Fase F': 12
};

const GRADUATING_FASES = ['Fase C', 'Fase D', 'Fase F'];
const GRADUATING_GRADES = [6, 9, 12];

function parseToken(token: string): number | null {
	const arab = parseInt(token, 10);
	if (Number.isFinite(arab)) return arab;
	const roman = ROMAN_MAP[token?.toUpperCase()];
	return roman ?? null;
}

export function parseTingkat(namaKelas: string): number | null {
	const tokens = namaKelas.split(' ').filter(Boolean);
	if (!tokens.length) return null;

	const first = parseToken(tokens[0]);
	if (first !== null) return first;

	// Handle "Kelas X IPA 1" → skip "Kelas"
	if (tokens.length > 1 && /^kelas$/i.test(tokens[0])) {
		return parseToken(tokens[1]);
	}

	return null;
}

export function isGraduatingFase(fase: string): boolean {
	return GRADUATING_FASES.includes(fase);
}

export function isGraduatingGrade(tingkat: number | null): boolean {
	return tingkat !== null && GRADUATING_GRADES.includes(tingkat);
}
