<script lang="ts">
	import Icon from '$lib/components/icon.svelte';

	interface Indicator {
		id?: number;
		deskripsi: string;
	}

	interface Props {
		indicators: Indicator[];
		onUpdate: (index: number, value: string) => void;
		onRemove: (index: number) => void;
		isSubmitting?: boolean;
		mode?: 'view' | 'edit';
	}

	let { indicators, onUpdate, onRemove, isSubmitting = false, mode = 'view' }: Props = $props();
</script>

{#if mode === 'view'}
	<div class="space-y-1">
		{#each indicators as indicator, indIdx (indicator.id)}
			<div class="flex gap-2 text-sm">
				<span class="shrink-0">{indIdx + 1}.</span>
				<span>{indicator.deskripsi}</span>
			</div>
		{/each}
		{#if indicators.length === 0}
			<p class="text-base-content/50 text-sm italic">-</p>
		{/if}
	</div>
{:else}
	<div class="flex flex-col gap-2">
		{#each indicators as indicator, indicatorIdx (indicatorIdx)}
			<div class="flex flex-col gap-2 sm:flex-row">
				<textarea
					class="textarea textarea-bordered validator bg-base-200 dark:bg-base-300 border-base-300 w-full dark:border-none"
					value={indicator.deskripsi}
					oninput={(e) => onUpdate(indicatorIdx, e.currentTarget.value)}
					placeholder="Tuliskan indikator"
					disabled={isSubmitting}
					required={indicatorIdx === 0}></textarea>
				{#if indicators.length > 1 && indicator.deskripsi.trim().length > 0}
					<button
						type="button"
						class="btn btn-sm btn-soft btn-error shadow-none"
						onclick={() => onRemove(indicatorIdx)}
						disabled={isSubmitting}
						title="Hapus indikator"
					>
						<Icon name="del" />
					</button>
				{/if}
			</div>
		{/each}
	</div>
{/if}
