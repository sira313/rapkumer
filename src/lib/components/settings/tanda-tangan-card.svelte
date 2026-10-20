<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import { onMount } from 'svelte';

	type Jenis = 'ttd' | 'stempel';

	const SECTIONS = [
		{
			jenis: 'ttd' as const,
			title: 'Tanda Tangan Kepala Sekolah',
			usage: 'Ditempatkan tepat di atas nama kepala sekolah pada dokumen cetak.'
		},
		{
			jenis: 'stempel' as const,
			title: 'Stempel Sekolah',
			usage: 'Menimpa tanda tangan, sedikit ke kiri, pada dokumen cetak.'
		}
	];

	let status = $state<Record<Jenis, { has: boolean; rev: number }>>({
		ttd: { has: false, rev: 0 },
		stempel: { has: false, rev: 0 }
	});
	let busy = $state<Jenis | null>(null);

	function urlFor(jenis: Jenis, rev: number) {
		return `/api/sekolah/tanda-tangan/${jenis}?v=${rev}`;
	}

	onMount(async () => {
		for (const { jenis } of SECTIONS) {
			const res = await fetch(urlFor(jenis, 0), { cache: 'no-store' }).catch(() => null);
			if (res?.ok) status[jenis] = { has: true, rev: 0 };
		}
	});

	async function handleFile(jenis: Jenis, event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (file.type !== 'image/png') {
			toast('File harus berformat PNG.', 'warning');
			return;
		}

		busy = jenis;
		try {
			const fd = new FormData();
			fd.append('gambar', file);
			const res = await fetch(`/api/sekolah/tanda-tangan/${jenis}`, {
				method: 'POST',
				body: fd
			});
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				throw new Error(text || `HTTP ${res.status}`);
			}
			toast('Gambar berhasil diunggah.', 'success');
			status[jenis] = { has: true, rev: status[jenis].rev + 1 };
		} catch (err) {
			console.error(err);
			toast('Gagal mengunggah gambar. Coba lagi.', 'error');
		} finally {
			busy = null;
		}
	}

	function handleDelete(section: (typeof SECTIONS)[number]) {
		showModal({
			title: `Hapus ${section.title}`,
			body: `Hapus ${section.title.toLowerCase()}?<br />Dokumen cetak akan kembali tanpa gambar ini.`,
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
						const res = await fetch(`/api/sekolah/tanda-tangan/${section.jenis}`, {
							method: 'DELETE'
						});
						if (!res.ok) {
							const text = await res.text().catch(() => '');
							throw new Error(text || `HTTP ${res.status}`);
						}
						toast('Gambar dihapus.', 'success');
						status[section.jenis] = { has: false, rev: status[section.jenis].rev + 1 };
					} catch (err) {
						console.error(err);
						toast('Gagal menghapus gambar.', 'error');
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
		<h2 class="text-xl font-semibold">Tanda Tangan &amp; Stempel</h2>
		<p class="text-base-content/70 text-sm">
			Unggah tanda tangan kepala sekolah dan stempel sekolah berformat PNG (background transparan
			disarankan). Keduanya otomatis diterapkan pada dokumen cetak seperti rapor, biodata, piagam,
			SPPD, rapor keasramaan, jurnal mengajar, dan presensi guru. Bila tidak diunggah, dokumen tetap
			dicetak tanpa gambar ini.
		</p>
	</header>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		{#each SECTIONS as section (section.jenis)}
			{@const s = status[section.jenis]}
			<div class="bg-base-200 rounded-lg border border-base-300 p-4">
				<h3 class="font-semibold">{section.title}</h3>
				<p class="text-base-content/70 mt-1 text-xs">{section.usage}</p>

				<div
					class="bg-base-100 mt-3 flex min-h-24 items-center justify-center rounded border border-base-300 p-2"
				>
					{#if s.has}
						<img
							src={urlFor(section.jenis, s.rev)}
							alt={section.title}
							class="max-h-28 w-full object-contain"
						/>
					{:else}
						<span class="text-base-content/50 text-sm">Belum diunggah</span>
					{/if}
				</div>

				<div class="mt-3 flex flex-wrap items-center gap-2">
					<label
						class="btn btn-sm btn-soft shadow-none"
						class:btn-disabled={busy === section.jenis}
					>
						<Icon name="import" />
						{busy === section.jenis ? 'Mengunggah…' : s.has ? 'Ganti' : 'Unggah'}
						<input
							type="file"
							accept="image/png"
							class="sr-only"
							disabled={busy === section.jenis}
							onchange={(e) => handleFile(section.jenis, e)}
						/>
					</label>
					{#if s.has}
						<button
							class="btn btn-sm btn-error btn-soft shadow-none"
							type="button"
							disabled={busy === section.jenis}
							onclick={() => handleDelete(section)}
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
