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
</script>

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
