<script lang="ts">
	import Icon from '../icon.svelte';

	let {
		list,
		startNumber = 0,
		canManage,
		isSubmitting = false,
		onUpdate,
		onRemove
	}: {
		list: string[];
		startNumber?: number;
		canManage: boolean;
		isSubmitting?: boolean;
		onUpdate: (index: number, value: string) => void;
		onRemove: (index: number) => void;
	} = $props();

	const filledCount = $derived(list.filter((item) => item.trim().length > 0).length);

	// Nomor urut melanjutkan baris yang sudah ada; baris kosong (slot tambahan) tidak bernomor
	const rowNumbers = $derived.by(() => {
		let number = startNumber;
		return list.map((item) => {
			if (item.trim().length > 0) {
				number += 1;
				return number;
			}
			return null;
		});
	});
</script>

{#each list as deskripsi, idx (idx)}
	<tr class="bg-base-200/40">
		<td class="align-top">
			<input type="checkbox" class="checkbox" disabled />
		</td>
		<td class="align-top">{rowNumbers[idx] ?? ''}</td>
		<td class="align-top">
			<textarea
				class="textarea bg-base-200 dark:bg-base-300 w-full dark:border-none"
				placeholder="Tulis tujuan pembelajaran keasramaan"
				name="tujuan.{idx}.deskripsi"
				form="tp-keasramaan-create"
				value={deskripsi}
				oninput={(e) => onUpdate(idx, e.currentTarget.value)}
				required={idx === 0 && filledCount === 0}
				disabled={!canManage}
				aria-busy={isSubmitting}></textarea>
		</td>
		<td class="align-top">
			<div class="flex">
				{#if list.length > 1 && (deskripsi.trim().length > 0 || idx !== list.length - 1)}
					<button
						type="button"
						class="btn btn-sm btn-soft btn-error shadow-none"
						onclick={() => onRemove(idx)}
						disabled={!canManage || isSubmitting}
						aria-disabled={!canManage || isSubmitting}
						title="Hapus tujuan"
					>
						<Icon name="del" />
					</button>
				{/if}
			</div>
		</td>
	</tr>
{/each}
