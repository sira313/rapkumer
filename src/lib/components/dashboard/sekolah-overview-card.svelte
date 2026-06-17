<script lang="ts">
	let { sekolah } = $props<{ sekolah: Sekolah | null }>();

	const sekolahLogo = $derived(sekolah?.id ? `/sekolah/logo/${sekolah.id}` : '/sekolah.png');
	const sekolahNama = $derived(sekolah?.nama ?? 'Belum ada sekolah aktif');
	const sekolahNpsn = $derived(sekolah?.npsn ?? '-');
</script>

<div class="card bg-base-100 rounded-box shadow-md dark:border-none">
	<div class="card-body">
		{#if sekolah}
			<div class="flex items-center gap-4">
				<div class="avatar">
					<div class="w-24 rounded">
						<img src={sekolahLogo} alt={`Logo ${sekolahNama}`} />
					</div>
				</div>
				<div class="space-y-1">
					<h2 class="card-title">Identitas Sekolah</h2>
					<p class="text-lg font-bold">{sekolahNama}</p>
					<p class="text-sm">NPSN: {sekolahNpsn}</p>
				</div>
			</div>
		{:else}
			<div class="flex flex-col gap-2">
				<h2 class="card-title">Identitas Sekolah</h2>
				<p class="text-base-content/70">
					Belum ada sekolah aktif. Silakan pilih atau buat data sekolah melalui menu Identitas Sekolah.
				</p>
			</div>
		{/if}
	</div>
</div>
