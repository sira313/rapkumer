<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { hideModal, setLoading } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { isValidTime } from '$lib/utils';

	interface Props {
		jamPelajaranMenit?: number;
		durasiIstirahat?: number;
		durasiUpacara?: number;
		jamMulai?: string;
		bellSounds?: Array<{ tipe: string; fileName: string; ttsMessage?: string | null }>;
		onAction?: (actions: { submit: () => Promise<void>; cancel: () => void }) => void;
	}

	let {
		jamPelajaranMenit = 35,
		durasiIstirahat = 30,
		durasiUpacara = 70,
		jamMulai = '07:00',
		bellSounds = [],
		onAction
	}: Props = $props();

	let submitting = $state(false);
	let jamPelajaranMenitValue = $state(String(jamPelajaranMenit));
	let durasiIstirahatValue = $state(String(durasiIstirahat));
	let durasiUpacaraValue = $state(String(durasiUpacara));
	let jamMulaiValue = $state(jamMulai);

	let uploadingTipe = $state<string | null>(null);
	let playingTipe = $state<string | null>(null);

	const soundTipes = [
		{ tipe: 'upacara', label: 'Upacara' },
		{ tipe: 'masuk', label: 'Masuk' },
		{ tipe: 'istirahat', label: 'Istirahat' },
		{ tipe: 'selesai_istirahat', label: 'Selesai Istirahat' },
		{ tipe: 'pergantian', label: 'Pergantian Jam' },
		{ tipe: 'pulang', label: 'Pulang' },
		{ tipe: 'custom', label: 'Bell' }
	];

	function getSoundFileName(tipe: string): string | undefined {
		return bellSounds.find((s) => s.tipe === tipe)?.fileName;
	}

	async function handleUploadSound(tipe: string) {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.mp3,audio/*';
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;
			if (file.size > 2 * 1024 * 1024) {
				toast('Ukuran file maksimal 2MB', 'warning');
				return;
			}
			uploadingTipe = tipe;
			try {
				const fd = new FormData();
				fd.append('file', file);
				const res = await fetch(`/api/bell-sound/${tipe}`, { method: 'POST', body: fd });
				if (!res.ok) {
					const err = await res.json().catch(() => ({ fail: 'Gagal upload' }));
					throw new Error(err.fail ?? `Error ${res.status}`);
				}
				toast('Sound berhasil diupload', 'success');
				await invalidateAll();
			} catch (e) {
				toast(e instanceof Error ? e.message : 'Gagal upload sound', 'error');
			} finally {
				uploadingTipe = null;
			}
		};
		input.click();
	}

	async function handlePlaySound(tipe: string) {
		playingTipe = tipe;
		try {
			const res = await fetch('/api/bell/play', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tipe })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({ fail: 'Gagal memutar sound' }));
				throw new Error(err.fail ?? `Error ${res.status}`);
			}
		} catch (e) {
			toast(e instanceof Error ? e.message : 'Gagal memutar sound di server', 'error');
		}
		playingTipe = null;
	}

	async function handleDeleteSound(tipe: string) {
		try {
			const res = await fetch(`/api/bell-sound/${tipe}`, { method: 'DELETE' });
			if (!res.ok) {
				const err = await res.json().catch(() => ({ fail: 'Gagal hapus' }));
				throw new Error(err.fail ?? `Error ${res.status}`);
			}
			toast('Sound berhasil dihapus', 'success');
			await invalidateAll();
		} catch (e) {
			toast(e instanceof Error ? e.message : 'Gagal hapus sound', 'error');
		}
	}

	async function handleSubmit() {
		if (!isValidTime(jamMulaiValue)) {
			toast('Format jam mulai tidak valid (HH:mm)', 'warning');
			return;
		}
		submitting = true;
		setLoading(true);
		const formData = new FormData();
		formData.append('jamPelajaranMenit', jamPelajaranMenitValue);
		formData.append('durasiIstirahat', durasiIstirahatValue);
		formData.append('durasiUpacara', durasiUpacaraValue);
		formData.append('jamMulai', jamMulaiValue);

		try {
			const response = await fetch('?/saveSettings', {
				method: 'POST',
				body: formData,
				redirect: 'error'
			});

			if (!response.ok) {
				const err = await response.json().catch(() => ({ fail: 'Gagal menyimpan pengaturan' }));
				throw new Error(err.fail ?? `Error ${response.status}`);
			}

			hideModal();
			toast('Pengaturan berhasil disimpan', 'success');
			await invalidateAll();
		} catch (e) {
			toast(e instanceof Error ? e.message : 'Gagal menyimpan pengaturan', 'error');
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

<div class="not-prose flex flex-col gap-6">
	<fieldset class="fieldset">
		<legend class="fieldset-legend">Durasi</legend>
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<label class="flex flex-col gap-1">
				<span class="fieldset-legend text-sm font-semibold">Menit per Jam Pelajaran</span>
				<input
					type="number"
					class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
					bind:value={jamPelajaranMenitValue}
					min="1"
					max="60"
					disabled={submitting}
				/>
			</label>
			<label class="flex flex-col gap-1">
				<span class="fieldset-legend text-sm font-semibold">Durasi Istirahat (menit)</span>
				<input
					type="number"
					class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
					bind:value={durasiIstirahatValue}
					min="1"
					max="60"
					disabled={submitting}
				/>
			</label>
			<label class="flex flex-col gap-1">
				<span class="fieldset-legend text-sm font-semibold">Durasi Upacara (menit)</span>
				<input
					type="number"
					class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
					bind:value={durasiUpacaraValue}
					min="1"
					max="120"
					disabled={submitting}
				/>
			</label>
			<label class="flex flex-col gap-1">
				<span class="fieldset-legend text-sm font-semibold">Jam Mulai Sekolah</span>
				<input
					type="text"
					class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
					bind:value={jamMulaiValue}
					disabled={submitting}
					pattern="[0-9]{2}:[0-9]{2}"
					inputmode="numeric"
					placeholder="HH:mm"
				/>
			</label>
		</div>
	</fieldset>

	<fieldset class="fieldset">
		<legend class="fieldset-legend">Upload Sound</legend>
		<p class="text-base-content/70 mb-2 text-xs">
			Upload file MP3. Maksimal 2MB per file. Jika tidak ada upload, akan menggunakan sound default
			dari folder <code>static/sounds/</code>.
		</p>
		<div class="flex flex-col gap-1">
			{#each soundTipes as { tipe, label } (tipe)}
				<div class="bg-base-200/50 flex items-center justify-between gap-3 rounded-md p-2">
					<div class="flex flex-col gap-0.5">
						<span class="text-sm font-medium">{label}</span>
						{#if getSoundFileName(tipe)}
							<span class="text-base-content/60 text-xs">{getSoundFileName(tipe)}</span>
						{:else}
							<span class="text-base-content/40 text-xs">Default: {tipe}.mp3</span>
						{/if}
					</div>
					<div class="flex items-center gap-1">
						<div class="join">
							<button
								type="button"
								class="btn btn-soft btn-sm join-item shadow-none"
								onclick={() => handleUploadSound(tipe)}
								disabled={submitting || uploadingTipe !== null}
							>
								{#if uploadingTipe === tipe}
									<span class="loading loading-spinner loading-sm"></span>
									Uploading…
								{:else}
									<Icon name="import" />
									Upload
								{/if}
							</button>
						</div>
						{#if getSoundFileName(tipe)}
							<button
								type="button"
								class="btn btn-ghost btn-sm text-error shadow-none"
								onclick={() => handleDeleteSound(tipe)}
								disabled={submitting}
								aria-label="Hapus sound {label}"
							>
								<Icon name="del" />
							</button>
						{/if}
						<button
							type="button"
							class="btn btn-ghost btn-sm text-success shadow-none"
							onclick={() => handlePlaySound(tipe)}
							disabled={submitting || playingTipe !== null}
							aria-label="Test sound {label}"
						>
							{#if playingTipe === tipe}
								<span class="loading loading-spinner loading-sm"></span>
							{:else}
								<Icon name="play" />
							{/if}
						</button>
					</div>
				</div>
			{/each}
		</div>
	</fieldset>
</div>
