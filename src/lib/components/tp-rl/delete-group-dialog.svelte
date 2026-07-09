<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';

	interface Props {
		lingkupMateri: string;
		ids: number[];
		onCancel: () => void;
		onSuccess: () => void;
	}

	let { lingkupMateri, ids, onCancel, onSuccess }: Props = $props();

	let submitting = $state(false);
</script>

<dialog class="modal" open onclose={onCancel}>
	<div class="modal-box">
		<FormEnhance
			id="form-delete-group"
			action="?/delete"
			onsuccess={onSuccess}
			submitStateChange={(v) => (submitting = v)}
		>
			{#snippet children()}
				{#each ids as idValue (idValue)}
					<input name="ids" value={idValue} hidden />
				{/each}

				<h3 class="mb-4 text-xl font-bold">Hapus lingkup materi?</h3>
				<p class="mb-2">"{lingkupMateri}" beserta seluruh tujuan pembelajaran akan dihapus.</p>
				<p class="text-sm opacity-70">Jumlah tujuan pembelajaran: {ids.length}</p>
			{/snippet}
		</FormEnhance>

		<div class="modal-action">
			<button class="btn btn-soft shadow-none" type="button" onclick={onCancel}> Batal </button>
			<button
				class="btn btn-error btn-soft shadow-none"
				type="submit"
				form="form-delete-group"
				disabled={submitting}
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
		<button onclick={onCancel}>close</button>
	</form>
</dialog>
