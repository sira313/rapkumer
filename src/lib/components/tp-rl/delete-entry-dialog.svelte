<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import type { GroupEntry } from './types';

	interface Props {
		entry?: GroupEntry;
		onCancel: () => void;
		onConfirm: () => void;
	}

	let { entry, onCancel, onConfirm }: Props = $props();

	const label = $derived(entry?.deskripsi.trim() || 'Tujuan pembelajaran tanpa deskripsi');
	const canDelete = $derived(Boolean(entry));
</script>

<dialog class="modal" open onclose={onCancel}>
	<div class="modal-box">
		<h3 class="mb-3 text-xl font-bold">Hapus tujuan pembelajaran?</h3>
		<p class="mb-4">"{label}" akan dihapus.</p>
		<div class="modal-action">
			<button class="btn btn-soft shadow-none" type="button" onclick={onCancel}> Batal </button>
			<button
				type="button"
				class="btn btn-error btn-soft shadow-none"
				disabled={!canDelete}
				onclick={onConfirm}
			>
				<Icon name="del" />
				Hapus
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button onclick={onCancel}>close</button>
	</form>
</dialog>
