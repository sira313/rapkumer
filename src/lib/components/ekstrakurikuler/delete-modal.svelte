<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import type { EkstrakurikulerRow } from './types';

	let { open, title, action, ids, mode, item, canManage, disabled, onClose, onSuccess } = $props<{
		open: boolean;
		title: string;
		action: string;
		ids: number[];
		mode: 'single' | 'bulk';
		item: EkstrakurikulerRow | null;
		canManage: boolean;
		disabled: boolean;
		onClose: () => void;
		onSuccess: () => void;
	}>();

	let submitting = $state(false);
</script>

{#if open}
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
			<h3 class="mt-2 text-lg font-bold">{title}</h3>
			{#if mode === 'single' && item}
				<p class="mt-2 text-sm">
					Yakin ingin menghapus ekstrakurikuler
					<span class="font-semibold">{item.nama}</span>?
				</p>
			{:else if mode === 'bulk'}
				<p class="mt-2 text-sm">
					Yakin ingin menghapus {ids.length} ekstrakurikuler terpilih?
				</p>
			{/if}

			<FormEnhance
				id="form-delete-ekstrakurikuler"
				{action}
				onsuccess={() => {
					onSuccess();
				}}
				submitStateChange={(v) => (submitting = v)}
			>
				{#snippet children()}
					{#each ids as id (id)}
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
					class="btn btn-error btn-soft shadow-none"
					type="submit"
					form="form-delete-ekstrakurikuler"
					disabled={submitting || disabled || !canManage}
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
	</div>
{/if}
