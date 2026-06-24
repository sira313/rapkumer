export type NextEventParams = {
	now: Date;
	bellActive: boolean;
	isHoliday: (date: Date) => boolean;
	hariList: string[];
	getTodayHari: (dayIdx: number) => string | undefined;
	maxJam: number;
	getFirstKode: (hari: string, jamKe: number) => string | null;
	computeWaktu: (hari: string, jamKe: number) => { start: string; end: string } | null;
	daftarKodeMapel: string[];
	isFirstSubjectPeriod: (hari: string, jamKe: number) => boolean;
	kegiatanCustom: Array<{ kode: string; nama: string }>;
};

function timeToMinutes(t: string): number {
	const [h, m] = t.split(':').map(Number);
	return h * 60 + m;
}

export function computeNextEventMessage(params: NextEventParams): string {
	const {
		now,
		bellActive,
		isHoliday,
		hariList,
		getTodayHari,
		maxJam,
		getFirstKode,
		computeWaktu,
		daftarKodeMapel,
		isFirstSubjectPeriod,
		kegiatanCustom
	} = params;

	if (!bellActive) return '';

	const dayIdx = now.getDay();
	const todayHari = getTodayHari(dayIdx);
	if (!todayHari || !hariList.includes(todayHari)) return '';

	if (isHoliday(now)) return '';

	const nowMinutes = now.getHours() * 60 + now.getMinutes();

	type Event = { minutes: number; kode: string; type: 'start' | 'end'; jamKe: number };
	let nearest: Event | null = null;
	let lastEndMinutes = -1;

	for (let jamKe = 1; jamKe <= maxJam; jamKe++) {
		const kode = getFirstKode(todayHari, jamKe);
		if (!kode) continue;
		const waktu = computeWaktu(todayHari, jamKe);
		if (!waktu) continue;

		const startMinutes = timeToMinutes(waktu.start);
		const endMinutes = timeToMinutes(waktu.end);

		if (endMinutes > lastEndMinutes) {
			lastEndMinutes = endMinutes;
		}

		if (nowMinutes < startMinutes) {
			if (!nearest || startMinutes < nearest.minutes) {
				nearest = { minutes: startMinutes, kode, type: 'start', jamKe };
			}
		}

		if (nowMinutes < endMinutes) {
			if (!nearest || endMinutes < nearest.minutes) {
				nearest = { minutes: endMinutes, kode, type: 'end', jamKe };
			}
		}
	}

	if (!nearest) {
		if (lastEndMinutes >= 0 && nowMinutes >= lastEndMinutes) {
			return 'Jam pelajaran telah usai';
		}
		return '';
	}

	const diffMin = nearest.minutes - nowMinutes;
	if (diffMin <= 0) return '';

	if (nearest.type === 'end') {
		if (daftarKodeMapel.includes(nearest.kode)) {
			const nextKode = getFirstKode(todayHari, nearest.jamKe + 1);
			if (nextKode === 'IST') return `${diffMin} menit lagi Istirahat`;
			if (nextKode === 'UPB') return `${diffMin} menit lagi upacara`;
			if (nextKode === 'PLG') return `${diffMin} menit lagi pulang`;
			const nextCustom = kegiatanCustom.find((k) => k.kode === nextKode);
			if (nextCustom) return `${diffMin} menit lagi ${nextCustom.nama}`;
			return `${diffMin} menit lagi pergantian jam`;
		}
		if (nearest.kode === 'IST') return `${diffMin} menit lagi selesai Istirahat`;
		if (nearest.kode === 'UPB') return `${diffMin} menit lagi selesai upacara`;
		if (nearest.kode === 'PLG') return `${diffMin} menit lagi pulang`;
		const custom = kegiatanCustom.find((k) => k.kode === nearest.kode);
		if (custom) return `${diffMin} menit lagi selesai ${custom.nama}`;
		return '';
	}

	if (nearest.jamKe > 1) {
		const prevKode = getFirstKode(todayHari, nearest.jamKe - 1);
		if (prevKode === 'IST') {
			return `${diffMin} menit lagi selesai Istirahat`;
		}
	}

	if (nearest.kode === 'UPB') return `${diffMin} menit lagi upacara`;
	if (nearest.kode === 'IST') return `${diffMin} menit lagi Istirahat`;
	if (nearest.kode === 'PLG') return `${diffMin} menit lagi pulang`;

	const custom = kegiatanCustom.find((k) => k.kode === nearest.kode);
	if (custom) return `${diffMin} menit lagi ${custom.nama}`;

	if (daftarKodeMapel.includes(nearest.kode)) {
		if (isFirstSubjectPeriod(todayHari, nearest.jamKe)) {
			return `${diffMin} menit lagi masuk`;
		}
		return `${diffMin} menit lagi pergantian jam`;
	}

	return `${diffMin} menit lagi pergantian jam`;
}
