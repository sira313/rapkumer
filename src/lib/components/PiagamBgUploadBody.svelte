<script lang="ts">
	import { toast } from '$lib/components/toast.svelte';
	import { hideModal } from '$lib/components/global-modal.svelte';

	let {
		template = '1',
		onUploaded = null
	}: {
		template: '1' | '2';
		onUploaded: (() => Promise<void> | void) | null;
	} = $props();

	let fileInput: HTMLInputElement | null = $state(null);
	let previewUrl: string | null = $state(null);
	let uploading = $state(false);

	async function handleFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		if (file.type !== 'image/png') {
			toast('File harus berformat PNG.', 'warning');
			input.value = '';
			return;
		}

		previewUrl = URL.createObjectURL(file);
	}

	async function upload() {
		if (!fileInput) return;
		const file = fileInput.files?.[0];
		if (!file) {
			toast('Pilih file terlebih dahulu.', 'warning');
			return;
		}
		uploading = true;

		try {
			const fd = new FormData();
			fd.append('bg', file);
			const res = await fetch(`/api/sekolah/piagam-bg/${template}`, {
				method: 'POST',
				body: fd
			});
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				throw new Error(text || `HTTP ${res.status}`);
			}
			toast('Background piagam berhasil diunggah.', 'success');
			if (onUploaded) await onUploaded();
			hideModal();
		} catch (err) {
			console.error(err);
			toast('Gagal mengunggah background. Coba lagi.', 'error');
		} finally {
			uploading = false;
		}
	}
</script>

<div class="w-full">
	<p class="mt-2 text-sm">Pastikan gambar berorientasi landscape dan berformat PNG.</p>

	<div class="mt-4 flex flex-col gap-3">
		<input
			bind:this={fileInput}
			type="file"
			accept="image/png"
			class="file-input file-input-ghost"
			onchange={handleFileChange}
		/>

		{#if previewUrl}
			<div class="bg-base-100 rounded border p-2">
				<img src={previewUrl} alt="Preview" class="w-full object-contain" />
			</div>
		{/if}
	</div>

	<div class="mt-4 flex justify-end gap-2">
		<button class="btn" type="button" onclick={() => hideModal()} disabled={uploading}>Batal</button
		>
		<button class="btn btn-primary" type="button" onclick={upload} disabled={uploading}>
			{#if uploading}
				<span class="loading loading-spinner loading-sm"></span>
			{/if}
			Unggah
		</button>
	</div>
</div>
