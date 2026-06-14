<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { hideModal } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import Icon from '$lib/components/icon.svelte';

	let {
		tanggal,
		labelTanggal,
		kelasId = 0
	}: {
		tanggal: string;
		labelTanggal: string;
		kelasId?: number;
	} = $props();

	let submitting = $state(false);

	async function handleDelete() {
		submitting = true;
		try {
			const fd = new FormData();
			fd.set('tanggal', tanggal);
			fd.set('kelasId', String(kelasId));
			const res = await fetch('?/deletePresensi', { method: 'POST', body: fd, redirect: 'error' });
			const body = await res.json().catch(() => null);
			if (!res.ok) {
				throw new Error(body?.fail ?? `Error ${res.status}`);
			}
			toast(body?.message ?? 'Semua data presensi berhasil dihapus', 'success');
			hideModal();
			await invalidate('app:absen');
		} catch (e) {
			toast(e instanceof Error ? e.message : 'Gagal menghapus data presensi', 'error');
		} finally {
			submitting = false;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<p class="text-base-content text-base leading-relaxed">
		Semua data presensi pada hari <strong>{labelTanggal}</strong> ini akan dihapus. Bapak/Ibu yakin?
	</p>
	<div class="flex justify-end gap-2">
		<button
			type="button"
			class="btn btn-soft shadow-none"
			onclick={hideModal}
			disabled={submitting}
		>
			Batal
		</button>
		<button
			type="button"
			class="btn btn-soft btn-error shadow-none"
			disabled={submitting}
			onclick={handleDelete}
		>
			{#if submitting}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			<Icon name="del" />
			Ya, Hapus
		</button>
	</div>
</div>
