<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import { onMount } from 'svelte';

	let has = $state(false);
	let rev = $state(0);
	let busy = $state(false);

	function url() {
		return `/api/guru/tanda-tangan?v=${rev}`;
	}

	onMount(async () => {
		const res = await fetch(url(), { cache: 'no-store' }).catch(() => null);
		if (res?.ok) has = true;
	});

	async function handleFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (file.type !== 'image/png') {
			toast('File harus berformat PNG.', 'warning');
			return;
		}

		busy = true;
		try {
			const fd = new FormData();
			fd.append('gambar', file);
			const res = await fetch('/api/guru/tanda-tangan', { method: 'POST', body: fd });
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				throw new Error(text || `HTTP ${res.status}`);
			}
			toast('Gambar berhasil diunggah.', 'success');
			has = true;
			rev += 1;
		} catch (err) {
			console.error(err);
			toast('Gagal mengunggah gambar. Coba lagi.', 'error');
		} finally {
			busy = false;
		}
	}

	function handleDelete() {
		showModal({
			title: 'Hapus Tanda Tangan',
			body: 'Hapus tanda tangan Anda?<br />Dokumen cetak akan kembali tanpa gambar ini.',
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
						const res = await fetch('/api/guru/tanda-tangan', { method: 'DELETE' });
						if (!res.ok) {
							const text = await res.text().catch(() => '');
							throw new Error(text || `HTTP ${res.status}`);
						}
						toast('Gambar dihapus.', 'success');
						has = false;
						rev += 1;
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
		<h2 class="text-xl font-semibold">Tanda Tangan</h2>
		<p class="text-base-content/70 text-sm">
			Unggah tanda tangan Anda berformat PNG (background transparan disarankan). Gambar ini
			digunakan pada dokumen cetak yang ditandatangani wali kelas. Bila tidak diunggah, dokumen
			tetap dicetak tanpa gambar ini.
		</p>
	</header>

	<div class="bg-base-200 rounded-lg border border-base-300 p-4">
		<div
			class="bg-base-100 flex min-h-24 items-center justify-center rounded border border-base-300 p-2"
		>
			{#if has}
				<img src={url()} alt="Tanda tangan wali kelas" class="max-h-28 w-full object-contain" />
			{:else}
				<span class="text-base-content/50 text-sm">Belum diunggah</span>
			{/if}
		</div>

		<div class="mt-3 flex flex-wrap items-center gap-2">
			<label class="btn btn-sm btn-soft shadow-none" class:btn-disabled={busy}>
				<Icon name="import" />
				{busy ? 'Mengunggah…' : has ? 'Ganti' : 'Unggah'}
				<input
					type="file"
					accept="image/png"
					class="sr-only"
					disabled={busy}
					onchange={(e) => handleFile(e)}
				/>
			</label>
			{#if has}
				<button
					class="btn btn-sm btn-error btn-soft shadow-none"
					type="button"
					disabled={busy}
					onclick={handleDelete}
				>
					<Icon name="del" />
					Hapus
				</button>
			{/if}
		</div>
	</div>
</section>
