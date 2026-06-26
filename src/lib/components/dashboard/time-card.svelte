<script lang="ts">
import { serverTime } from '$lib/server-time.svelte';

const timeString = $derived(
	serverTime.now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
);
const dateString = $derived(
	serverTime.now.toLocaleDateString('id-ID', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	})
);
</script>

<div class="stats stats-vertical lg:stats-horizontal rounded-box bg-base-100 w-full shadow-md">
	<div class="stat">
		<div class="stat-title">Tanggal</div>
		<div class="stat-value text-2xl">{dateString}</div>
		<div class="stat-desc">Waktu server</div>
	</div>

	<div class="stat">
		<div class="stat-title">Jam</div>
		<div class="stat-value">{timeString}</div>
		<div class="stat-desc">Waktu server</div>
	</div>
</div>
