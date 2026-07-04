<script lang="ts">
	import Icon from '$lib/components/icon.svelte';

	const {
		group,
		rowIndex,
		isSubmitting,
		onUpdateNama,
		onUpdateIndicator,
		onRemoveIndicator,
		onSave,
		onCancel
	} = $props();
</script>

<tr>
	<td class="align-top"><input type="checkbox" class="checkbox" disabled /></td>
	<td class="text-primary animate-pulse align-top font-semibold">{rowIndex + 1}</td>
	<td class="align-top">
		<textarea
			class="textarea textarea-bordered validator bg-base-200 dark:bg-base-300 border-base-300 h-24 w-full"
			value={group.nama}
			oninput={(e) => onUpdateNama(e.currentTarget.value)}
			placeholder="Tuliskan mata evaluasi"
			disabled={isSubmitting}
			required></textarea>
	</td>
	<td class="align-top">
		<div class="flex flex-col gap-2">
			{#each group.indikator as indicator, indicatorIdx (indicatorIdx)}
				<div class="flex flex-col gap-2 sm:flex-row">
					<textarea
						class="textarea textarea-bordered validator bg-base-200 dark:bg-base-300 border-base-300 w-full dark:border-none"
						value={indicator.deskripsi}
						oninput={(e) => onUpdateIndicator(indicatorIdx, e.currentTarget.value)}
						placeholder="Tuliskan indikator"
						disabled={isSubmitting}
						required={indicatorIdx === 0}></textarea>
					{#if group.indikator.length > 1 && indicator.deskripsi.trim().length > 0}
						<button
							type="button"
							class="btn btn-sm btn-soft btn-error shadow-none"
							onclick={() => onRemoveIndicator(indicatorIdx)}
							disabled={isSubmitting}
							title="Hapus indikator"
						>
							<Icon name="del" />
						</button>
					{/if}
				</div>
			{/each}
		</div>
	</td>
	<td class="align-top">
		<div class="flex">
			<button
				type="button"
				class="btn btn-sm btn-soft rounded-r-none shadow-none"
				onclick={onCancel}
				disabled={isSubmitting}
				title="Batalkan"
			>
				<Icon name="close" />
			</button>
			<button
				type="button"
				class="btn btn-sm btn-primary rounded-l-none shadow-none"
				onclick={onSave}
				disabled={isSubmitting}
				aria-busy={isSubmitting}
				title="Simpan"
			>
				<Icon name="save" />
			</button>
		</div>
	</td>
</tr>
