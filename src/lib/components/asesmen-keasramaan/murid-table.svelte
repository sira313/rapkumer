<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import DeskripsiCell from '$lib/components/nilai-ekstrakurikuler/deskripsi-cell.svelte';
	import { searchQueryMarker } from '$lib/utils';
	import type { MuridRow } from './types';

	type Props = {
		muridList: MuridRow[];
		search?: string | null;
		disabled?: boolean;
		onNilaiClick?: (muridId: number) => void;
	};

	let { muridList, search, disabled = false, onNilaiClick }: Props = $props();

	function handleNilaiClick(muridId: number) {
		if (disabled) return;
		const m = muridList.find((m) => m.id === muridId);
		if (!m || !m.isAsuhanku) return;
		onNilaiClick?.(muridId);
	}

	function isDisabled(murid: MuridRow) {
		return disabled || !murid.isAsuhanku;
	}
</script>

<div
	class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
>
	<table class="border-base-200 table min-w-150 border dark:border-none">
		<thead>
			<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
				<th style="width: 50px; min-width: 40px;">No</th>
				<th class="min-w-48">Nama</th>
				<th class="min-w-32">Aksi</th>
				<th class="w-full" style="min-width: 240px;">Deskripsi Nilai</th>
			</tr>
		</thead>
		<tbody>
			{#each muridList as murid (murid.id)}
				<tr>
					<td class="align-top">{murid.no}</td>
					<td class="align-top">
						{@html searchQueryMarker(search, murid.nama)}
					</td>
					<td class="align-top">
						<button
							type="button"
							class="btn btn-sm btn-soft shadow-none"
							onclick={() => handleNilaiClick(murid.id)}
							class:btn-disabled={isDisabled(murid)}
							aria-disabled={isDisabled(murid)}
						>
							<Icon name="edit" />
							Nilai
						</button>
					</td>
					<td class="align-top">
						<DeskripsiCell text={murid.deskripsi} />
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
