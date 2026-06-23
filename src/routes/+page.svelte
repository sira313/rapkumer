<script lang="ts">
	import SekolahOverviewCard from '$lib/components/dashboard/sekolah-overview-card.svelte';
	import RombelMuridStats from '$lib/components/dashboard/rombel-murid-stats.svelte';
	import MapelEkstrakurikulerStats from '$lib/components/dashboard/mapel-ekstrakurikuler-stats.svelte';
	import ProgressCard from '$lib/components/dashboard/progress-card.svelte';
	import QuickActionsCard from '$lib/components/dashboard/quick-actions-card.svelte';
	import TimeCard from '$lib/components/dashboard/time-card.svelte';
	import { computeNextEventMessage } from '$lib/utils/next-event-message';
	import BellStatus from '$lib/components/jadwal-bell/bell-status.svelte';

	let { data } = $props();
	const sekolah = (data.sekolah ?? null) as Sekolah | null;
	const statistikDashboard = $derived(
		data.statistikDashboard ?? {
			rombel: { total: 0, perFase: [] },
			murid: { total: 0 },
			mapel: { total: 0, wajib: 0, mulok: 0, kokurikuler: 0, lainnya: 0 },
			ekstrakurikuler: { total: 0 },
			progress: {
				akademik: { percentage: 0, completed: 0, total: 0 },
				ekstrakurikuler: { percentage: 0, completed: 0, total: 0 },
				kokurikuler: { percentage: 0, completed: 0, total: 0 }
			}
		}
	);
	const mapelStats = $derived(
		statistikDashboard.mapel ?? { total: 0, wajib: 0, mulok: 0, kokurikuler: 0, lainnya: 0 }
	);
	const progressStats = $derived(
		statistikDashboard.progress ?? {
			akademik: { percentage: 0, completed: 0, total: 0 },
			ekstrakurikuler: { percentage: 0, completed: 0, total: 0 },
			kokurikuler: { percentage: 0, completed: 0, total: 0 }
		}
	);
	const ekstrakurikulerStats = $derived(statistikDashboard.ekstrakurikuler ?? { total: 0 });
	const bellActive = $derived(data.bellActive ?? false);
	const hariSekolah = $derived((data.hariSekolah as number) ?? 6);
	const liburNasional = $derived((data.liburNasional as string[]) ?? []);
	const liburSemester = $derived(
		(data.liburSemester as Array<{ start: string; end: string }>) ?? []
	);

	const bellSettings = $derived(
		(data.bellSettings as {
			jamMulai: string;
			jamPelajaranMenit: number;
			durasiIstirahat: number;
			durasiUpacara: number;
		} | null) ?? null
	);
	const kegiatanCustom = $derived(
		(data.kegiatanCustom as Array<{ kode: string; nama: string; durasi: number | null }>) ?? []
	);
	const jadwalPelajaran = $derived(
		(data.jadwalPelajaran as Array<{
			hari: string;
			jamKe: number;
			kelasId: number;
			kodeKegiatan: string;
		}>) ?? []
	);
	const daftarKodeMapel = $derived((data.daftarKodeMapel as string[]) ?? []);
	const daftarKelas = $derived((data.daftarKelas as Array<{ id: number; nama: string }>) ?? []);

	const hariList = $derived(
		hariSekolah === 5
			? ['senin', 'selasa', 'rabu', 'kamis', 'jumat']
			: ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu']
	);

	const hariNamaList = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

	const hariIndexMap: Record<number, string> = {
		1: 'senin',
		2: 'selasa',
		3: 'rabu',
		4: 'kamis',
		5: 'jumat',
		6: 'sabtu'
	};

	function toDateStr(date: Date): string {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, '0');
		const d = String(date.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}

	function isHoliday(date: Date): boolean {
		const dayOfWeek = date.getDay();
		if (hariSekolah === 5 && (dayOfWeek === 0 || dayOfWeek === 6)) return true;
		if (hariSekolah === 6 && dayOfWeek === 0) return true;
		const dateStr = toDateStr(date);
		if (liburNasional.includes(dateStr)) return true;
		for (const range of liburSemester) {
			if (dateStr >= range.start && dateStr <= range.end) return true;
		}
		return false;
	}

	function timeToMinutes(t: string): number {
		const [h, m] = t.split(':').map(Number);
		return h * 60 + m;
	}

	function minutesToTime(m: number): string {
		const h = Math.floor(m / 60);
		const min = m % 60;
		return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
	}


	function getDurasiKode(kode: string, defaultDur: number): number {
		if (kode === 'UPB') return bellSettings?.durasiUpacara ?? 70;
		if (kode === 'IST') return bellSettings?.durasiIstirahat ?? 30;
		const custom = kegiatanCustom.find((k) => k.kode === kode);
		if (custom?.durasi != null) return custom.durasi;
		return defaultDur;
	}

	const kelasTerurut = $derived(
		[...daftarKelas].sort((a, b) => {
			const aNum = parseInt(a.nama.replace(/\D/g, '')) || 0;
			const bNum = parseInt(b.nama.replace(/\D/g, '')) || 0;
			return aNum - bNum;
		})
	);

	const jadwalMatrix = $derived.by(() => {
		const matrix: Record<string, Record<number, Record<number, string>>> = {};
		for (const entry of jadwalPelajaran) {
			if (!matrix[entry.hari]) matrix[entry.hari] = {};
			if (!matrix[entry.hari][entry.jamKe]) matrix[entry.hari][entry.jamKe] = {};
			matrix[entry.hari][entry.jamKe][entry.kelasId] = entry.kodeKegiatan;
		}
		return matrix;
	});

	function isAllSame(hari: string, jamKe: number): string | null {
		const codes = kelasTerurut.map((k) => jadwalMatrix[hari]?.[jamKe]?.[k.id] ?? '');
		const unique = [...new Set(codes.filter(Boolean))];
		if (unique.length === 1) return unique[0];
		return null;
	}

	function isFirstSubjectPeriod(hari: string, jamKe: number): boolean {
		for (let j = 1; j < jamKe; j++) {
			const codes = kelasTerurut.map((k) => jadwalMatrix[hari]?.[j]?.[k.id] ?? '');
			for (const c of codes) {
				if (c && daftarKodeMapel.includes(c)) return false;
			}
		}
		return true;
	}

	function computeWaktu(hari: string, jamKe: number): { start: string; end: string } | null {
		const jamMulai = bellSettings?.jamMulai ?? '07:00';
		const jamPelajaranMenit = bellSettings?.jamPelajaranMenit ?? 35;
		const jamMulaiMinutes = timeToMinutes(jamMulai);
		const daySchedule = jadwalMatrix[hari] ?? {};

		let currentMinutes = jamMulaiMinutes;
		for (let prevJamKe = 1; prevJamKe < jamKe; prevJamKe++) {
			const prevCodes = kelasTerurut.map((k) => daySchedule[prevJamKe]?.[k.id] ?? '');
			const uniquePrev = [...new Set(prevCodes.filter(Boolean))];
			let dur = jamPelajaranMenit;
			if (uniquePrev.length === 1) {
				dur = getDurasiKode(uniquePrev[0], dur);
			}
			currentMinutes += dur;
		}

		const codes = kelasTerurut.map((k) => daySchedule[jamKe]?.[k.id] ?? '');
		const unique = [...new Set(codes.filter(Boolean))];
		let dur = jamPelajaranMenit;
		if (unique.length === 1) {
			dur = getDurasiKode(unique[0], dur);
		}

		return { start: minutesToTime(currentMinutes), end: minutesToTime(currentMinutes + dur) };
	}

	const maxJam = $derived.by(() => {
		let max = 0;
		for (const hari of hariList) {
			const daySchedule = jadwalMatrix[hari];
			if (daySchedule) {
				const periods = Object.keys(daySchedule).map(Number);
				if (periods.length > 0) {
					max = Math.max(max, ...periods);
				}
			}
		}
		return max;
	});

	let _now = $state(new Date());
	$effect(() => {
		const id = setInterval(() => (_now = new Date()), 60_000);
		return () => clearInterval(id);
	});

	let nextEventMessage = $state('');
	$effect(() => {
		nextEventMessage = computeNextEventMessage({
			now: _now,
			bellActive,
			isHoliday,
			hariList,
			getTodayHari: (dayIdx) => hariIndexMap[dayIdx],
			maxJam,
			getFirstKode: (hari, jamKe) => {
				let kode = isAllSame(hari, jamKe);
				if (!kode) {
					const daySchedule = jadwalMatrix[hari]?.[jamKe];
					if (daySchedule) {
						for (const kelas of kelasTerurut) {
							const c = daySchedule[kelas.id];
							if (c) return c;
						}
					}
				}
				return kode;
			},
			computeWaktu,
			daftarKodeMapel,
			isFirstSubjectPeriod,
			kegiatanCustom
		});
	});

	const hariIni = $derived.by(() => {
		const status = isHoliday(_now) ? 'Libur' : 'Hari Belajar';
		const hariNama = hariNamaList[_now.getDay()];
		const tgl = _now.toLocaleDateString('id-ID', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
		return `${hariNama}, ${tgl} - ${status}`;
	});
</script>

<BellStatus {bellActive} {hariIni} {nextEventMessage} class="alert alert-info alert-soft mb-4" />

<!-- Kontainer Utama Grid -->
<div class="grid w-full grid-cols-1 gap-5 md:grid-cols-2">
	<!-- Kolom 1: Data Utama & Statistik -->
	<div class="flex flex-col gap-5">
		<SekolahOverviewCard {sekolah} />
		<RombelMuridStats rombel={statistikDashboard.rombel} murid={statistikDashboard.murid} />
		<MapelEkstrakurikulerStats mapel={mapelStats} ekstrakurikuler={ekstrakurikulerStats} />
		<TimeCard />
	</div>

	<!-- Kolom 2: Progress & Aksi -->
	<div class="flex flex-col gap-6">
		<ProgressCard progress={progressStats} />
		<QuickActionsCard />
	</div>
</div>
