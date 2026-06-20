<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { EntryDraft } from './types';

	interface Props {
		entries: EntryDraft[];
		formatScore: (value: number | null) => string;
		getInputClass: (value: string) => string;
	}

	let { entries, formatScore, getInputClass }: Props = $props();

	const dispatch = createEventDispatcher<{
		nilaiChange: { index: number; value: string };
	}>();

	function handleInput(index: number, event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		dispatch('nilaiChange', { index, value: target.value });
	}
</script>

<div
	class="bg-base-100 dark:bg-base-200 border-base-200 mt-2 overflow-x-auto rounded-md shadow-md dark:shadow-none"
>
	<table class="border-base-200 table min-w-160 border dark:border-none">
		<thead>
			<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
				<th style="width: 40px; min-width: 40px;">No</th>
				<th class="w-full" style="min-width: 260px;">Tujuan Pembelajaran</th>
				<th style="min-width: 140px;">Nilai</th>
			</tr>
		</thead>
		<tbody>
			{#each entries as entry, index (entry.tujuanPembelajaranId)}
				<tr>
					<td>{entry.index}</td>
					<td>
						<p class="font-medium first-letter:uppercase">{entry.deskripsi}</p>
						<p class="text-base-content/60 mt-2 text-xs tracking-wide uppercase">
							{entry.lingkupMateri}
							{#if entry.bobot != null}
								<span class="ml-1 font-semibold">• Bobot {formatScore(entry.bobot)}%</span>
							{/if}
						</p>
						<input
							type="hidden"
							name={`entries.${index}.tujuanPembelajaranId`}
							value={entry.tujuanPembelajaranId}
						/>
					</td>
					<td>
						<input
							type="number"
							name={`entries.${index}.nilai`}
							class={getInputClass(entry.nilaiText)}
							value={entry.nilaiText}
							placeholder="Isi nilai"
							min="0"
							max="100"
							step="0.01"
							inputmode="decimal"
							title="Rentang 0-100 dengan maksimal 2 angka desimal"
							spellcheck="false"
							oninput={(event) => handleInput(index, event)}
						/>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
