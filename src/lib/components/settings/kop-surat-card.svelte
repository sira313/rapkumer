<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import { onMount } from 'svelte';

	type Orientasi = 'portrait' | 'landscape';

	const SECTIONS = [
		{
			orientasi: 'portrait',
			title: 'Portrait (A4)',
			usage: 'Dipakai pada cetak PDF "Surat Perintah Perjalanan Dinas".'
		},
		{
			orientasi: 'landscape',
			title: 'Landscape (A4)',
			usage: 'Dipakai pada cetak PDF Piagam template 1.'
		}
	] as const;

	let status = $state<Record<Orientasi, { has: boolean; rev: number }>>({
		portrait: { has: false, rev: 0 },
		landscape: { has: false, rev: 0 }
	});
	let busy = $state<Orientasi | null>(null);

	function urlFor(orientasi: Orientasi, rev: number) {
		return `/api/sekolah/kop-surat/${orientasi}?v=${rev}`;
	}

	onMount(async () => {
		for (const { orientasi } of SECTIONS) {
			const res = await fetch(urlFor(orientasi, 0), { cache: 'no-store' }).catch(() => null);
			if (res?.ok) status[orientasi] = { has: true, rev: 0 };
		}
	});

	async function handleFile(orientasi: Orientasi, event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (file.type !== 'image/png') {
			toast('File harus berformat PNG.', 'warning');
			return;
		}

		busy = orientasi;
		try {
			const fd = new FormData();
			fd.append('kop', file);
			const res = await fetch(`/api/sekolah/kop-surat/${orientasi}`, {
				method: 'POST',
				body: fd
			});
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				throw new Error(text || `HTTP ${res.status}`);
			}
			toast('Kop surat berhasil diunggah.', 'success');
			status[orientasi] = { has: true, rev: status[orientasi].rev + 1 };
		} catch (err) {
			console.error(err);
			toast('Gagal mengunggah kop surat. Coba lagi.', 'error');
		} finally {
			busy = null;
		}
	}

	function handleDelete(orientasi: Orientasi) {
		showModal({
			title: 'Hapus Kop Surat',
			body: `Hapus kop surat ${orientasi}?<br />Cetak akan kembali memakai kop surat bawaan.`,
			dismissible: true,
			onNegative: {
				label: 'Batal',
				action: ({ close }) => close()
			},
			onPositive: {
				label: 'Hapus',
				icon: 'del',
				action: async ({ close }) => {
					try {
						const res = await fetch(`/api/sekolah/kop-surat/${orientasi}`, {
							method: 'DELETE'
						});
						if (!res.ok) {
							const text = await res.text().catch(() => '');
							throw new Error(text || `HTTP ${res.status}`);
						}
						toast('Kop surat dikembalikan ke bawaan.', 'success');
						status[orientasi] = { has: false, rev: status[orientasi].rev + 1 };
					} catch (err) {
						console.error(err);
						toast('Gagal menghapus kop surat.', 'error');
					} finally {
						close();
					}
				}
			}
		});
	}
</script>

<section class="card bg-base-100 rounded-lg border border-none p-6 shadow-md">
	<header class="mb-4 space-y-2">
		<h2 class="text-xl font-semibold">Kop Surat Gambar</h2>
		<p class="text-base-content/70 text-sm">
			Unggah kop surat berbentuk gambar PNG untuk menggantikan kop surat bawaan pada cetak PDF.
			Gunakan background transparan agar hasil lebih rapi. Bila tidak diunggah, kop surat bawaan
			tetap dipakai.
		</p>
	</header>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		{#each SECTIONS as section (section.orientasi)}
			{@const s = status[section.orientasi]}
			<div class="bg-base-200 rounded-lg border border-base-300 p-4">
				<h3 class="font-semibold">{section.title}</h3>
				<p class="text-base-content/70 mt-1 text-xs">{section.usage}</p>

				<div
					class="bg-base-100 mt-3 flex min-h-24 items-center justify-center rounded border border-base-300 p-2"
				>
					{#if s.has}
						<img
							src={urlFor(section.orientasi, s.rev)}
							alt={`Kop surat ${section.title}`}
							class="max-h-28 w-full object-contain"
						/>
					{:else}
						<span class="text-base-content/50 text-sm">Belum diunggah — memakai kop bawaan</span>
					{/if}
				</div>

				<div class="mt-3 flex flex-wrap items-center gap-2">
					<label
						class="btn btn-sm btn-soft shadow-none"
						class:btn-disabled={busy === section.orientasi}
					>
						<Icon name="import" />
						{busy === section.orientasi ? 'Mengunggah…' : s.has ? 'Ganti' : 'Unggah'}
						<input
							type="file"
							accept="image/png"
							class="sr-only"
							disabled={busy === section.orientasi}
							onchange={(e) => handleFile(section.orientasi, e)}
						/>
					</label>
					{#if s.has}
						<button
							class="btn btn-sm btn-error btn-soft shadow-none"
							type="button"
							disabled={busy === section.orientasi}
							onclick={() => handleDelete(section.orientasi)}
						>
							<Icon name="del" />
							Hapus
						</button>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</section>
