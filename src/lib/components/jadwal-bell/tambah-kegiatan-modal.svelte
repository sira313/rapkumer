<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { showModal, hideModal, setLoading } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import Icon from '$lib/components/icon.svelte';

	interface Props {
		onAction?: (actions: { submit: () => Promise<void>; cancel: () => void }) => void;
		existingKegiatan?: {
			kode: string;
			nama: string;
			durasi: number | null;
			soundFileName?: string | null;
		};
	}

	let { onAction, existingKegiatan }: Props = $props();

	let isEdit = $derived(existingKegiatan !== undefined);

	let submitting = $state(false);
	let nama = $state(existingKegiatan?.nama ?? '');
	let kode = $state(existingKegiatan?.kode ?? '');
	let durasi = $state(existingKegiatan?.durasi?.toString() ?? '');
	let soundFile: File | null = $state(null);
	let soundFileName = $state(existingKegiatan?.soundFileName ?? '');
	let hapusSound = $state(false);

	$effect(() => {
		nama = existingKegiatan?.nama ?? '';
		kode = existingKegiatan?.kode ?? '';
		durasi = existingKegiatan?.durasi?.toString() ?? '';
		soundFileName = existingKegiatan?.soundFileName ?? '';
		soundFile = null;
		hapusSound = false;
	});

	function normalizeKode(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
		kode = input.value;
	}

	function handleFileSelect(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			if (file.size > 2 * 1024 * 1024) {
				toast('Ukuran file maksimal 2MB', 'warning');
				input.value = '';
				return;
			}
			if (!file.name.toLowerCase().endsWith('.mp3') && file.type !== 'audio/mpeg') {
				showModal({
					title: 'Format Tidak Didukung',
					body: 'Hanya file MP3 yang dapat diterima. Silakan convert file Anda ke format MP3 terlebih dahulu.',
					onPositive: { label: 'OK', action: async ({ close }) => close() },
					dismissible: false
				});
				input.value = '';
				return;
			}
			soundFile = file;
			soundFileName = file.name;
			hapusSound = false;
		}
	}

	function handleHapusSound() {
		soundFile = null;
		soundFileName = '';
		hapusSound = true;
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
		if (isEdit) {
			formData.append('kodeLama', existingKegiatan!.kode);
			if (hapusSound) formData.append('hapusSound', '1');
		}
		if (soundFile) formData.append('sound', soundFile);

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
	<fieldset class="fieldset">
		<legend class="fieldset-legend">Nama Kegiatan</legend>
		<input
			type="text"
			class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
			bind:value={nama}
			placeholder="Contoh: Literasi, Senam Pagi"
			disabled={submitting}
		/>
	</fieldset>
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<fieldset class="fieldset min-w-0">
			<legend class="fieldset-legend">Kode</legend>
			<input
				type="text"
				class="input bg-base-200 dark:bg-base-300 w-full uppercase dark:border-none"
				bind:value={kode}
				oninput={normalizeKode}
				placeholder="Contoh: LIT, SP"
				maxlength={10}
				disabled={submitting}
			/>
			<p class="label w-full text-wrap">
				Kode akan otomatis dikapitalisasi. Maksimal 10 karakter.
			</p>
		</fieldset>
		<fieldset class="fieldset min-w-0">
			<legend class="fieldset-legend">Durasi (menit)</legend>
			<input
				type="number"
				class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
				bind:value={durasi}
				placeholder="Contoh: 20"
				min="1"
				disabled={submitting}
			/>
			<p class="label w-full text-wrap">
				— opsional, kosongkan jika sama dengan 1 jam pelajaran
			</p>
		</fieldset>
	</div>
	<fieldset class="fieldset">
		<legend class="fieldset-legend">Sound Kegiatan (opsional)</legend>
		<div class="flex items-center gap-2">
			<input
				type="file"
				class="file-input file-input-soft bg-base-200 file-input-sm w-full dark:border-none"
				accept=".mp3,audio/mpeg"
				onchange={handleFileSelect}
				disabled={submitting}
			/>
			{#if soundFileName}
				<button
					type="button"
					class="btn btn-ghost btn-sm text-error shadow-none"
					onclick={handleHapusSound}
					aria-label="Hapus sound"
				>
					<Icon name="del" />
				</button>
			{/if}
		</div>
		<p class="label w-full text-wrap">
			MP3/audio, maksimal 2MB. Akan dibunyikan saat kegiatan ini dimulai.
		</p>
	</fieldset>
</div>
