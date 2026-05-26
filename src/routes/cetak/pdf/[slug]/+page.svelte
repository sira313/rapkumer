<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	let slug = $derived(page.params.slug ?? '');
	let title = $derived(
		slug
			.split('-')
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(' ')
	);

	let pdfUrl = $state('');
	let loadError = $state(false);

	onMount(async () => {
		const token = page.url.searchParams.get('token');
		if (!token) {
			loadError = true;
			return;
		}

		history.replaceState(null, '', `/cetak/pdf/${slug}/`);

		try {
			const res = await fetch(`/cetak/pdf/${slug}/${token}`);
			if (!res.ok) throw new Error('Gagal memuat PDF');
			const blob = await res.blob();
			pdfUrl = URL.createObjectURL(blob);
		} catch {
			loadError = true;
		}
	});
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<div class="w-full h-screen">
	{#if pdfUrl}
		<object data={pdfUrl} type="application/pdf" class="w-full h-full" title={title}>
			<embed src={pdfUrl} type="application/pdf" class="w-full h-full" />
		</object>
	{:else if loadError}
		<div class="flex items-center justify-center h-full p-8">
			<div class="text-center">
				<p class="text-lg font-semibold text-error mb-4">Gagal memuat PDF</p>
				<p class="text-base-content/70 mb-6">Token tidak valid atau sudah kedaluwarsa.</p>
				<button onclick={() => window.close()} class="btn btn-primary">Tutup</button>
			</div>
		</div>
	{:else}
		<div class="flex items-center justify-center h-full">
			<div class="text-center">
				<span class="loading loading-spinner loading-lg mb-4"></span>
				<p class="text-base-content/70">Memuat PDF...</p>
			</div>
		</div>
	{/if}
</div>
