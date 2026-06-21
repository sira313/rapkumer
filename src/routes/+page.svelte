<script lang="ts">
	import SekolahOverviewCard from '$lib/components/dashboard/sekolah-overview-card.svelte';
	import RombelMuridStats from '$lib/components/dashboard/rombel-murid-stats.svelte';
	import MapelEkstrakurikulerStats from '$lib/components/dashboard/mapel-ekstrakurikuler-stats.svelte';
	import ProgressCard from '$lib/components/dashboard/progress-card.svelte';
	import QuickActionsCard from '$lib/components/dashboard/quick-actions-card.svelte';
	import TimeCard from '$lib/components/dashboard/time-card.svelte';

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

	let _now = $state(new Date());
	$effect(() => {
		const id = setInterval(() => (_now = new Date()), 60_000);
		return () => clearInterval(id);
	});

	const hariIni = $derived.by(() => {
		const status = isHoliday(_now) ? 'Libur' : 'Hari Belajar';
		const hariNama = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][
			_now.getDay()
		];
		const tgl = _now.toLocaleDateString('id-ID', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
		return `${hariNama}, ${tgl} - ${status}`;
	});
</script>

{#if bellActive}
	<div class="alert alert-info alert-soft mb-4 flex items-center gap-2 text-sm">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-5 w-5 shrink-0"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path
				d="M13.73 21a2 2 0 0 1-3.46 0"
			/></svg
		>
		<div class="flex flex-col gap-0.5">
			<span>Sistem bell sedang berjalan — memonitor jadwal pelajaran secara otomatis.</span>
			<span class="opacity-70">{hariIni}</span>
		</div>
	</div>
{/if}

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
