<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { hideModal, setLoading } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';

	interface Props {
		onAction?: (actions: { submit: () => Promise<void>; cancel: () => void }) => void;
		existingKegiatan?: { kode: string; nama: string; durasi: number | null };
	}

	let { onAction, existingKegiatan }: Props = $props();

	let isEdit = $derived(existingKegiatan !== undefined);

	let submitting = $state(false);
	let nama = $state(existingKegiatan?.nama ?? '');
	let kode = $state(existingKegiatan?.kode ?? '');
	let durasi = $state(existingKegiatan?.durasi?.toString() ?? '');

	function normalizeKode(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
		kode = input.value;
	}

	async function handleSubmit() {
		if (!nama.trim() || !kode.trim()) {
			toast('Nama dan kode harus diisi', 'warning');
			return;
		}

		submitting = true;
		setLoading(true);
		const formData = new FormData();
		formData.append('nama', nama.trim());
		formData.append('kode', kode.trim());
		if (durasi) formData.append('durasi', durasi);
		if (isEdit) formData.append('kodeLama', existingKegiatan!.kode);

		try {
			const action = isEdit ? '?/editKegiatan' : '?/tambahKegiatan';
			const response = await fetch(action, {
				method: 'POST',
				body: formData,
				redirect: 'error'
			});

			if (!response.ok) {
				const err = await response
					.json()
					.catch(() => ({ fail: 'Gagal ' + (isEdit ? 'mengedit' : 'menambah') + ' kegiatan' }));
				throw new Error(err.fail ?? `Error ${response.status}`);
			}

			hideModal();
			toast(isEdit ? 'Kegiatan berhasil diedit' : 'Kegiatan berhasil ditambahkan', 'success');
			await invalidate('app:jadwal-bell');
		} catch (e) {
			toast(
				e instanceof Error
					? e.message
					: 'Gagal ' + (isEdit ? 'mengedit' : 'menambah') + ' kegiatan',
				'error'
			);
		} finally {
			submitting = false;
			setLoading(false);
		}
	}

	function handleCancel() {
		hideModal();
	}

	$effect(() => {
		onAction?.({ submit: handleSubmit, cancel: handleCancel });
	});
</script>

<div class="not-prose flex flex-col gap-4">
	<label class="fieldset flex flex-col gap-1">
		<span class="fieldset-legend text-sm font-semibold">Nama Kegiatan</span>
		<input
			type="text"
			class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
			bind:value={nama}
			placeholder="Contoh: Literasi, Senam Pagi"
			disabled={submitting}
		/>
	</label>
	<label class="fieldset flex flex-col gap-1">
		<span class="fieldset-legend text-sm font-semibold">Kode</span>
		<input
			type="text"
			class="input bg-base-200 dark:bg-base-300 w-full uppercase dark:border-none"
			bind:value={kode}
			oninput={normalizeKode}
			placeholder="Contoh: LIT, SP"
			maxlength={10}
			disabled={submitting}
		/>
		<p class="text-base-content/70 mt-1 text-xs">
			Kode akan otomatis dikapitalisasi. Maksimal 10 karakter.
		</p>
	</label>
	<label class="fieldset flex flex-col gap-1">
		<span class="fieldset-legend text-sm font-semibold">
			Durasi (menit)
			<span class="text-base-content/50 text-xs font-normal">
				— opsional, kosongkan jika sama dengan 1 jam pelajaran</span
			>
		</span>
		<input
			type="number"
			class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
			bind:value={durasi}
			placeholder="Contoh: 20"
			min="1"
			disabled={submitting}
		/>
	</label>
</div>
