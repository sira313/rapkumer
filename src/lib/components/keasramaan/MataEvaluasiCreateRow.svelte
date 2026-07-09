<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import MataEvaluasiIndicators from './MataEvaluasiIndicators.svelte';

	interface FormData {
		nama: string;
		indikator: Array<{ deskripsi: string }>;
	}

	interface Props {
		newGroupData: FormData | null;
		isSubmitting: boolean;
		onUpdateNama: (value: string) => void;
		onUpdateIndicator: (index: number, value: string) => void;
		onRemoveIndicator: (index: number) => void;
		onSave: () => void;
		onCancel: () => void;
	}

	let {
		newGroupData,
		isSubmitting,
		onUpdateNama,
		onUpdateIndicator,
		onRemoveIndicator,
		onSave,
		onCancel
	}: Props = $props();
</script>

{#if newGroupData}
	<tr>
		<td class="align-top"><input type="checkbox" class="checkbox" disabled /></td>
		<td class="text-primary animate-pulse align-top font-semibold">1</td>
		<td class="align-top">
			<textarea
				class="textarea textarea-bordered validator bg-base-200 dark:bg-base-300 border-base-300 h-24 w-full"
				value={newGroupData.nama}
				oninput={(e) => onUpdateNama(e.currentTarget.value)}
				placeholder="Contoh: Kepemimpinan"
				disabled={isSubmitting}
				required></textarea>
		</td>
		<td class="align-top">
			<MataEvaluasiIndicators
				indicators={newGroupData.indikator}
				onUpdate={onUpdateIndicator}
				onRemove={onRemoveIndicator}
				{isSubmitting}
				mode="edit"
			/>
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
					disabled={isSubmitting || !newGroupData.nama.trim()}
					aria-busy={isSubmitting}
					title="Simpan"
				>
					<Icon name="save" />
				</button>
			</div>
		</td>
	</tr>
{/if}
