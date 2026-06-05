<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- per-row links use simple hrefs */
	import Icon from '$lib/components/icon.svelte';
	import { page } from '$app/state';

	let { data } = $props();
	const status = $derived(data.status ?? 'empty');
	const murid = $derived(data.murid ?? null);
	const daftarEkstrakurikuler = $derived(
		status === 'ready' ? (data.daftarEkstrakurikuler ?? []) : []
	);
	const kelasAktif = $derived(page.data.kelasAktif ?? null);
	const kelasAktifLabel = $derived.by(() => {
		if (!kelasAktif) return null;
		return kelasAktif.fase ? `${kelasAktif.nama} - ${kelasAktif.fase}` : kelasAktif.nama;
	});

	function formatScore(value: number | null) {
		if (value == null) return '&mdash;';
		return value.toLocaleString('id-ID', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}
</script>

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<div class="mb-2 flex flex-col gap-2 sm:flex-row">
		<a href="/nilai-akhir/" class="btn btn-soft shadow-none">
			<Icon name="left" />
			Kembali
		</a>
	</div>

	{#if status === 'ready' && murid}
		<div class="border-base-200 flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-center">
			<div>
				<h2 class="text-xl font-bold">Nilai Ekstrakurikuler</h2>
				<p class="text-base-content/80">{murid.nama}</p>
				{#if kelasAktifLabel}
					<p class="text-base-content/60 text-sm">Kelas {kelasAktifLabel}</p>
				{/if}
			</div>
		</div>

		<div class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none">
			<table class="border-base-200 table border dark:border-none">
				<thead>
					<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
						<th style="width: 50px; min-width: 40px;">No</th>
						<th class="w-full" style="min-width: 200px;">Ekstrakurikuler</th>
						<th style="min-width: 120px;">Nilai Akhir</th>
						<th style="min-width: 200px;">Kriteria</th>
					</tr>
				</thead>
				<tbody>
					{#if daftarEkstrakurikuler.length}
						{#each daftarEkstrakurikuler as item (item.id)}
							<tr>
								<td>{item.no}</td>
								<td>
									<div class="font-semibold">{item.nama ?? '—'}</div>
									<div class="text-base-content/60 text-xs">{item.tujuanCount ?? 0} tujuan</div>
								</td>
								<td
									class={`font-semibold${item.sudahDinilai ? '' : ' text-base-content/60 italic'}`}
								>
									{@html formatScore(item.nilaiAkhir)}
								</td>
								<td>
									{#if item.kriteria}
										<span class="badge badge-outline">{item.kriteria}</span>
									{:else}
										<em class="opacity-60">Belum dinilai</em>
									{/if}
								</td>
							</tr>
						{/each}
					{:else}
						<tr>
							<td colspan="4" class="p-8 text-center">
								<em class="opacity-60"
									>Belum ada data ekstrakurikuler untuk kelas ini atau murid belum dinilai.</em
								>
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="alert alert-soft alert-warning mt-4 flex items-start gap-3">
			<Icon name="warning" class="text-xl" />
			<span>
				<p class="font-semibold">Pilih murid terlebih dahulu.</p>
				<p class="text-base-content/70 text-sm">
					Gunakan tombol "Lihat" pada halaman Rekap Nilai Akhir untuk membuka rincian.
				</p>
			</span>
		</div>
	{/if}
</div>
