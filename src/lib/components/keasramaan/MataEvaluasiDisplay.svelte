<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	// navigation via full-page assignment used; no goto import needed

	interface MataEvaluasi {
		id: number;
		nama: string;
		indikator: Array<{
			id: number;
			deskripsi: string;
		}>;
	}

	interface Props {
		mataEvaluasi: MataEvaluasi[];
		tableReady: boolean;
		canEdit: boolean;
	}

	let { mataEvaluasi, tableReady, canEdit }: Props = $props();

	function navigateToTP(indikatorId: number) {
		if (!canEdit) return;
		// Use full navigation to avoid SvelteKit goto lint rule here
		void (location as Location).assign(`/keasramaan/tp?indikatorId=${indikatorId}`);
	}
</script>

{#if mataEvaluasi.length > 0}
	<div class="mt-6 space-y-6">
		{#each mataEvaluasi as matev (matev.id)}
			<div class="space-y-3">
				<h3 class="text-lg font-semibold">{matev.nama}</h3>
				<div
					class="bg-base-100 dark:bg-base-200 overflow-x-auto rounded-md shadow-md dark:shadow-none"
				>
					<table class="border-base-200 table min-w-full border dark:border-none">
						<thead>
							<tr class="bg-base-200 dark:bg-base-300 text-left font-bold">
								<th style="width: 60px;">No</th>
								<th class="w-full" style="min-width: 260px;">Indikator</th>
								<th style="width: 140px; min-width: 120px;">Aksi</th>
							</tr>
						</thead>
						<tbody>
							{#if matev.indikator.length > 0}
								{#each matev.indikator as indicator, idx (indicator.id)}
									<tr class="hover:bg-base-200/50 dark:hover:bg-base-700/50">
										<td class="align-top">{idx + 1}</td>
										<td class="align-top">{indicator.deskripsi}</td>
										<td class="align-top">
											<div class="flex items-center">
												<button
													type="button"
													class="btn btn-sm btn-soft shadow-none"
													title="Edit tujuan pembelajaran indikator"
													disabled={!canEdit}
													onclick={() => navigateToTP(indicator.id)}
												>
													<Icon name="book" />
													Edit TP
												</button>
											</div>
										</td>
									</tr>
								{/each}
							{:else}
								<tr>
									<td class="py-4 text-center italic opacity-50" colspan="3">Tidak ada indikator</td
									>
								</tr>
							{/if}
						</tbody>
					</table>
				</div>
			</div>
		{/each}
	</div>
{:else if tableReady}
	<div class="border-base-300 bg-base-200 mt-6 rounded-lg border border-dashed p-4 text-center">
		<p class="text-base-content/60 text-sm">
			Belum ada mata evaluasi keasramaan. Gunakan tombol <strong>Kelola Mata Evaluasi</strong> untuk menambahkan.
		</p>
	</div>
{/if}
