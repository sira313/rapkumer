<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';

	interface Props {
		open: boolean;
		title: string;
		action: string;
		ids: number[];
		mode: 'single' | 'bulk';
		item?: { id: number; nama: string } | null;
		disabled?: boolean;
		onClose: () => void;
		onSuccess: () => void;
	}

	let {
		open,
		title,
		action,
		ids,
		mode,
		item,
		disabled = false,
		onClose,
		onSuccess
	}: Props = $props();

	let submitting = $state(false);
</script>

{#if open}
	<dialog class="modal" {open} onclose={onClose}>
		<div class="modal-box max-w-md">
			<FormEnhance
				id="form-delete-keasramaan"
				{action}
				onsuccess={onSuccess}
				submitStateChange={(v) => (submitting = v)}
			>
				{#snippet children()}
					<div class="mb-4 flex items-start gap-3">
						<Icon name="warning" class="text-error mt-1 shrink-0" />
						<div>
							<h3 class="text-lg font-bold">{title}</h3>
							{#if mode === 'single' && item}
								<p class="mt-2 text-sm">
									Yakin ingin menghapus mata evaluasi
									<span class="font-semibold">"{item.nama}"</span>?
								</p>
							{:else if mode === 'bulk'}
								<p class="mt-2 text-sm">
									Yakin ingin menghapus {ids.length} mata evaluasi terpilih?
								</p>
								<p class="mt-2 text-xs opacity-70">Tindakan ini tidak dapat dibatalkan.</p>
							{/if}
						</div>
					</div>

					{#each ids as id, idx (id)}
						<input name={`ids.${idx}`} value={id} hidden />
					{/each}
				{/snippet}
			</FormEnhance>

			<div class="modal-action mt-6 flex gap-2">
				<button class="btn btn-soft shadow-none" type="button" onclick={onClose}>
					<Icon name="close" />
					Batal
				</button>
				<button
					class="btn btn-error btn-soft shadow-none"
					type="submit"
					form="form-delete-keasramaan"
					disabled={submitting || disabled || ids.length === 0}
					aria-busy={submitting}
				>
					{#if submitting}
						<div class="loading loading-spinner"></div>
					{:else}
						<Icon name="del" />
					{/if}
					Hapus
				</button>
			</div>
		</div>
		<form method="dialog" class="modal-backdrop">
			<button
				type="submit"
				onclick={(event) => {
					event.preventDefault();
					onClose();
				}}
			>
				tutup
			</button>
		</form>
	</dialog>
{/if}
