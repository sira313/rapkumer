const TTL = 5 * 60 * 1000;

type PdfParams = {
	docType: string;
	muridId: number;
	kelasId?: number;
	tpMode?: string;
	kritCukup?: number;
	kritBaik?: number;
	template?: '1' | '2';
	bgLogo?: boolean;
	slug: string;
};

const store = new Map<string, { params: PdfParams; createdAt: number }>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
	if (cleanupTimer) return;
	cleanupTimer = setInterval(() => {
		const now = Date.now();
		for (const [key, entry] of store) {
			if (now - entry.createdAt > TTL) store.delete(key);
		}
	}, 60_000);
}

export function storePdfParams(params: PdfParams): string {
	startCleanup();
	const token = crypto.randomUUID();
	store.set(token, { params, createdAt: Date.now() });
	return token;
}

export function consumePdfParams(token: string): PdfParams | null {
	const entry = store.get(token);
	if (!entry) return null;
	if (Date.now() - entry.createdAt > TTL) {
		store.delete(token);
		return null;
	}
	store.delete(token);
	return entry.params;
}
