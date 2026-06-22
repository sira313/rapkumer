export type BellSettingsData = {
	jamMulai: string | null;
	jamPelajaranMenit: number | null;
	durasiIstirahat: number | null;
	durasiUpacara: number | null;
};

export type CustomKegiatanData = {
	kode: string;
	durasi: number | null;
};

export function computeJamKeFromTime(
	simJam: string | null,
	jadwalHariIni: Array<{ kodeKegiatan: string; jamKe: number }>,
	bellSettings: BellSettingsData | null,
	kegiatanCustom: CustomKegiatanData[],
	jamMasukFallback: string
): number {
	const jamMulai = bellSettings?.jamMulai ?? jamMasukFallback;
	const jamPelajaranMenit = bellSettings?.jamPelajaranMenit ?? 45;
	const durasiIstirahat = bellSettings?.durasiIstirahat ?? 30;
	const durasiUpacara = bellSettings?.durasiUpacara ?? 40;

	const customDurasi = new Map<string, number>();
	for (const c of kegiatanCustom) {
		if (c.kode && c.durasi != null) customDurasi.set(c.kode.toUpperCase(), c.durasi);
	}

	const [h, m] = jamMulai.split(':').map(Number);
	const jamMulaiMin = h * 60 + m;

	const targetMin = (() => {
		if (simJam) {
			const [sh, sm] = simJam.split(':').map(Number);
			return sh * 60 + sm;
		}
		const now = new Date();
		return now.getHours() * 60 + now.getMinutes();
	})();

	if (targetMin < jamMulaiMin) return 1;

	const jamKeKode = new Map<number, string>();
	for (const j of jadwalHariIni) {
		if (!jamKeKode.has(j.jamKe)) {
			jamKeKode.set(j.jamKe, j.kodeKegiatan.toUpperCase());
		}
	}

	let currentMin = jamMulaiMin;
	for (let jk = 1; jk <= 20; jk++) {
		const kode = jamKeKode.get(jk);
		let dur = jamPelajaranMenit;
		if (kode === 'UPB') dur = durasiUpacara;
		else if (kode === 'IST') dur = durasiIstirahat;
		else if (kode && customDurasi.has(kode)) dur = customDurasi.get(kode)!;

		const start = currentMin;
		const end = currentMin + dur;

		if (targetMin >= start && targetMin < end) return jk;
		if (targetMin < start) return Math.max(1, jk - 1);

		currentMin = end;
	}

	const maxJk = Math.max(...jadwalHariIni.map((j) => j.jamKe), 0);
	return maxJk || 1;
}
