<script lang="ts">
	import { hideModal } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';

	let file: File | null = $state(null);
	let input: HTMLInputElement;
	let { onAction } = $props<{ onAction?: (action: () => Promise<void>) => void }>();

	async function importFile() {
		if (!file) return;
		const form = new FormData();
		form.append('file', file);
		const response = await fetch('?/importPresensi', { method: 'POST', body: form });
		const result = await response.json();
		if (!response.ok) throw new Error(result?.data?.fail ?? result?.message ?? 'Import gagal');
		toast(result?.data?.success ?? 'Presensi berhasil diimport', 'success');
		hideModal();
		location.reload();
	}

	$effect(() => onAction?.(importFile));
</script>

<div class="space-y-3">
	<p class="text-sm">
		Gunakan file Excel dari tombol <b>Download Rekap</b> sebagai template, lalu unggah kembali setelah
		mengisi presensi.
	</p>
	<input
		bind:this={input}
		class="file-input file-input-bordered w-full"
		accept=".xlsx"
		type="file"
		onchange={(event) => (file = (event.currentTarget as HTMLInputElement).files?.[0] ?? null)}
	/>
	{#if file}<p class="text-sm text-base-content/70">{file.name}</p>{/if}
</div>
