export interface SimAbsensiEntry {
	muridId: number;
	mataPelajaranId: number | null;
	waktu: string;
}

export interface SimKetidakhadiranEntry {
	muridId: number;
	tanggal: string;
	keterangan: string | null;
	mataPelajaranId: number | null;
	updatedAt: string;
}

interface SimCacheEntry {
	absensi: Map<string, SimAbsensiEntry[]>;
	ketidakhadiran: Map<string, SimKetidakhadiranEntry>;
}

const cache = new Map<string, SimCacheEntry>();

function cacheKey(
	sekolahId: number,
	kelasId: number,
	tanggal: string,
	simHari: string | null | undefined,
	simJam: string | null | undefined
): string {
	return `${sekolahId}:${kelasId}:${tanggal}:${(simHari ?? '').toLowerCase()}:${simJam ?? ''}`;
}

function getOrCreate(
	sekolahId: number,
	kelasId: number,
	tanggal: string,
	simHari?: string | null,
	simJam?: string | null
): SimCacheEntry {
	const key = cacheKey(sekolahId, kelasId, tanggal, simHari, simJam);
	let entry = cache.get(key);
	if (!entry) {
		entry = { absensi: new Map(), ketidakhadiran: new Map() };
		cache.set(key, entry);
	}
	return entry;
}

function absKey(muridId: number, mataPelajaranId: number | null): string {
	return `${muridId}:${mataPelajaranId ?? ''}`;
}

export function simWriteAbsensi(
	sekolahId: number,
	kelasId: number,
	tanggal: string,
	muridId: number,
	mataPelajaranId: number | null,
	simHari?: string | null,
	simJam?: string | null
) {
	const entry = getOrCreate(sekolahId, kelasId, tanggal, simHari, simJam);
	const key = absKey(muridId, mataPelajaranId);
	const list = entry.absensi.get(key) ?? [];
	list.push({ muridId, mataPelajaranId, waktu: new Date().toISOString() });
	entry.absensi.set(key, list);
}

export function simDeleteAbsensi(
	sekolahId: number,
	kelasId: number,
	tanggal: string,
	muridIds: number[],
	mataPelajaranId?: number | null,
	simHari?: string | null,
	simJam?: string | null
) {
	const entry = getOrCreate(sekolahId, kelasId, tanggal, simHari, simJam);
	for (const mid of muridIds) {
		const key = absKey(mid, mataPelajaranId ?? null);
		entry.absensi.delete(key);
	}
}

export function simWriteKetidakhadiran(
	sekolahId: number,
	kelasId: number,
	tanggal: string,
	muridId: number,
	keterangan: string | null,
	mataPelajaranId: number | null,
	simHari?: string | null,
	simJam?: string | null
) {
	const entry = getOrCreate(sekolahId, kelasId, tanggal, simHari, simJam);
	const key = absKey(muridId, mataPelajaranId);
	entry.ketidakhadiran.set(key, {
		muridId,
		tanggal,
		keterangan,
		mataPelajaranId,
		updatedAt: new Date().toISOString()
	});
}

export function simDeleteKetidakhadiran(
	sekolahId: number,
	kelasId: number,
	tanggal: string,
	muridId: number,
	mataPelajaranId?: number | null,
	simHari?: string | null,
	simJam?: string | null
) {
	const entry = getOrCreate(sekolahId, kelasId, tanggal, simHari, simJam);
	const key = absKey(muridId, mataPelajaranId ?? null);
	entry.ketidakhadiran.delete(key);
}

export function simGetAbsensi(
	sekolahId: number,
	kelasId: number,
	tanggal: string,
	simHari?: string | null,
	simJam?: string | null
): SimAbsensiEntry[] {
	const entry = getOrCreate(sekolahId, kelasId, tanggal, simHari, simJam);
	const result: SimAbsensiEntry[] = [];
	for (const list of entry.absensi.values()) {
		result.push(...list);
	}
	return result;
}

export function simGetKetidakhadiran(
	sekolahId: number,
	kelasId: number,
	tanggal: string,
	simHari?: string | null,
	simJam?: string | null
): SimKetidakhadiranEntry[] {
	const entry = getOrCreate(sekolahId, kelasId, tanggal, simHari, simJam);
	return Array.from(entry.ketidakhadiran.values());
}

export function simClear(
	sekolahId: number,
	kelasId: number,
	tanggal: string,
	simHari?: string | null,
	simJam?: string | null
) {
	const key = cacheKey(sekolahId, kelasId, tanggal, simHari, simJam);
	cache.delete(key);
}
