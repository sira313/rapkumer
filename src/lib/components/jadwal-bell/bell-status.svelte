<script lang="ts">
	let {
		bellActive,
		hariIni,
		nextEventMessage,
		class: className = ''
	}: {
		bellActive: boolean;
		hariIni: string;
		nextEventMessage: string;
		class?: string;
	} = $props();
</script>

{#if bellActive}
	<div class="flex items-center gap-2 {className}">
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
		<div class="flex flex-col gap-0.5 text-sm">
			<span
				>Sistem bell aktif - memonitor jadwal secara otomatis. Pastikan waktu dan tanggal pada
				sistem sesuai real time.</span
			>
			<span class="font-bold">
				{hariIni}
				{#if nextEventMessage}
					- {nextEventMessage}
				{/if}
			</span>
		</div>
	</div>
{/if}
