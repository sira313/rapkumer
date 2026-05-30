// Robust Parameter & Criteria Management for Rapor Preview

export type RaporPeriode = 'rts' | 'ras';

export function parseRaporPeriode(value: string | null): RaporPeriode {
	if (value === 'rts' || value === 'ras') return value;
	return 'ras';
}

export interface RaporCriteria {
	kritCukup: number;
	kritBaik: number;
}

export const DEFAULT_RAPOR_CRITERIA: RaporCriteria = {
	kritCukup: 85,
	kritBaik: 95
};

export type TPMode = 'compact' | 'full-desc';

export const TP_MODES = {
	compact: 'compact' as const,
	fullDesc: 'full-desc' as const
};

export function isValidTPMode(value: unknown): value is TPMode {
	return value === 'compact' || value === 'full-desc';
}

export function parseTPMode(value: string | null): TPMode {
	if (!value) return 'compact';
	const normalized = String(value).toLowerCase();
	if (normalized === 'desc' || normalized === 'full-desc') return 'full-desc';
	return 'compact';
}

export function parseCriteria(cukupStr: string | null, baikStr: string | null): RaporCriteria {
	const kritCukup = parseCriteriaValue(cukupStr, DEFAULT_RAPOR_CRITERIA.kritCukup);
	const kritBaik = parseCriteriaValue(baikStr, DEFAULT_RAPOR_CRITERIA.kritBaik);

	// Validate logical order
	if (kritCukup > kritBaik) {
		return DEFAULT_RAPOR_CRITERIA;
	}

	return { kritCukup, kritBaik };
}

function parseCriteriaValue(value: string | null, defaultValue: number): number {
	if (!value) return defaultValue;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
		return defaultValue;
	}
	return Math.round(parsed);
}

export interface PreviewURLParams {
	muridId: number;
	kelasId?: number;
	tpMode: TPMode;
	criteria: RaporCriteria;
	raporPeriode: RaporPeriode;
}

export function buildPreviewURLParams(url: URL): PreviewURLParams {
	const muridIdStr = url.searchParams.get('murid_id');
	if (!muridIdStr || !Number.isInteger(Number(muridIdStr))) {
		throw new Error('Parameter murid_id wajib diisi dan harus berupa integer');
	}

	const kelasIdStr = url.searchParams.get('kelas_id');
	const kelasId = kelasIdStr ? Number(kelasIdStr) : undefined;

	const tpModeStr = url.searchParams.get('full_tp');
	const tpMode = parseTPMode(tpModeStr);

	const criteria = parseCriteria(
		url.searchParams.get('krit_cukup'),
		url.searchParams.get('krit_baik')
	);

	const raporPeriode = parseRaporPeriode(url.searchParams.get('rapor_periode'));

	return {
		muridId: Number(muridIdStr),
		kelasId,
		tpMode,
		criteria,
		raporPeriode
	};
}

export function createPreviewURLSearchParams(params: {
	muridId: number;
	kelasId?: number;
	tpMode?: TPMode;
	criteria?: RaporCriteria;
	raporPeriode?: RaporPeriode;
}): URLSearchParams {
	const searchParams = new URLSearchParams();
	searchParams.set('murid_id', String(params.muridId));

	if (params.kelasId) {
		searchParams.set('kelas_id', String(params.kelasId));
	}

	if (params.tpMode === 'full-desc') {
		searchParams.set('full_tp', 'desc');
	}

	const criteria = params.criteria ?? DEFAULT_RAPOR_CRITERIA;
	searchParams.set('krit_cukup', String(criteria.kritCukup));
	searchParams.set('krit_baik', String(criteria.kritBaik));

	if (params.raporPeriode && params.raporPeriode !== 'ras') {
		searchParams.set('rapor_periode', params.raporPeriode);
	}

	return searchParams;
}
