<script lang="ts">
	import FormEnhance from '../form-enhance.svelte';
	import Icon from '../icon.svelte';

	let {
		deleteModalTitle,
		deleteModalItem,
		deleteModalIds,
		deleteModalDisabled,
		isDeleteModalOpen,
		onClose
	}: {
		deleteModalTitle: string;
		deleteModalItem: { id: number; deskripsi: string } | null;
		deleteModalIds: number[];
		deleteModalDisabled: boolean;
		isDeleteModalOpen: boolean;
		onClose: () => void;
	} = $props();

	let submitting = $state(false);
</script>

{#if isDeleteModalOpen}
	<div
		class="modal modal-open"
		tabindex="-1"
		role="dialog"
		aria-modal="true"
		onkeydown={(event) => {
			if (event.key === 'Escape') onClose();
		}}
	>
		<dialog class="modal-box relative z-10 max-w-md" open aria-modal="true">
			<Icon name="warning" class="text-error" />
			<h3 class="mt-2 text-lg font-bold">{deleteModalTitle}</h3>
			{#if deleteModalItem}
				<p class="mt-2 text-sm">
					Yakin ingin menghapus tujuan
					<span class="font-semibold">"{deleteModalItem.deskripsi.slice(0, 80)}"</span>?
				</p>
			{:else}
				<p class="mt-2 text-sm">
					Yakin ingin menghapus {deleteModalIds.length} tujuan pembelajaran terpilih?
				</p>
			{/if}

			<FormEnhance
				id="form-delete-tp"
				action="?/delete"
				onsuccess={() => {
					submitting = false;
					onClose();
				}}
				submitStateChange={(value) => (submitting = value)}
			>
				{#snippet children()}
					{#each deleteModalIds as id (id)}
						<input name="ids" value={id} hidden />
					{/each}
				{/snippet}
			</FormEnhance>

			<div class="modal-action mt-6 flex gap-2">
				<button class="btn btn-soft shadow-none" type="button" onclick={onClose}>
					<Icon name="close" />
					Batal
				</button>
				<button
					class="btn btn-error shadow-none"
					type="submit"
					form="form-delete-tp"
					disabled={submitting || deleteModalDisabled}
				>
					{#if submitting}
						<div class="loading loading-spinner"></div>
					{:else}
						<Icon name="del" />
					{/if}
					Hapus
				</button>
			</div>
		</dialog>
		<form
			method="dialog"
			class="modal-backdrop"
			onsubmit={(event) => {
				event.preventDefault();
				onClose();
			}}
		>
			<button type="submit"> tutup </button>
		</form>
	</div>
{/if}
