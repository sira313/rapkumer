<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { hideModal, setLoading } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import Icon from '$lib/components/icon.svelte';

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
	let editingTipe = $state<string | null>(null);
	let editingText = $state('');

	const defaultTtsMessages: Record<string, string> = {
		upacara: 'Upacara bendera akan segera dimulai, mohon bersiap di lapangan.',
		istirahat: 'Waktunya beristirahat. Silahkan nikmati waktu istirahat anda.',
		pergantian: 'Satu jam pelajaran telah berlalu.',
		masuk: 'Jam pelajaran telah dimulai, silahkan berbaris sebelum masuk ke kelas masing-masing.',
		pulang: 'Pelajaran telah selesai, waktunya pulang.'
	};

	let ttsMessages = $state<Record<string, string>>({ ...defaultTtsMessages });

	$effect(() => {
		const msgs: Record<string, string> = { ...defaultTtsMessages };
		for (const s of bellSounds) {
			if (s.ttsMessage) msgs[s.tipe] = s.ttsMessage;
		}
		Object.assign(ttsMessages, msgs);
	});

	const soundTipes = [
		{ tipe: 'upacara', label: 'Upacara' },
		{ tipe: 'masuk', label: 'Masuk' },
		{ tipe: 'istirahat', label: 'Istirahat' },
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

	async function playUrl(url: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const audio = new Audio(url);
			const timeout = setTimeout(() => {
				URL.revokeObjectURL(url);
				reject(new Error('timeout'));
			}, 10_000);
			audio.onended = () => {
				clearTimeout(timeout);
				URL.revokeObjectURL(url);
				resolve();
			};
			audio.onerror = () => {
				clearTimeout(timeout);
				URL.revokeObjectURL(url);
				reject();
			};
			audio.play().catch((e) => {
				clearTimeout(timeout);
				URL.revokeObjectURL(url);
				reject(e);
			});
		});
	}

	async function playBellSound(): Promise<boolean> {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 10_000);
			const res = await fetch('/api/bell-sound/custom', { signal: controller.signal });
			clearTimeout(timeout);
			if (res.ok) {
				const blob = await res.blob();
				await playUrl(URL.createObjectURL(blob));
				return true;
			}
		} catch {
			// fallback
		}
		try {
			const audio = new Audio('/universfield-new-notification.mp3');
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error('timeout')), 10_000);
				audio.onended = () => {
					clearTimeout(timeout);
					resolve();
				};
				audio.onerror = () => {
					clearTimeout(timeout);
					reject();
				};
				audio.play().catch((e) => {
					clearTimeout(timeout);
					reject(e);
				});
			});
			return true;
		} catch {
			return false;
		}
	}

	async function playTipeSound(tipe: string): Promise<void> {
		if (tipe === 'custom') return;
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 10_000);
			const res = await fetch(`/api/bell-sound/${tipe}`, { signal: controller.signal });
			clearTimeout(timeout);
			if (res.ok) {
				const blob = await res.blob();
				await playUrl(URL.createObjectURL(blob));
				return;
			}
		} catch {
			// fallback
		}
		const msg = ttsMessages[tipe];
		if (msg && 'speechSynthesis' in window) {
			try {
				speechSynthesis.cancel();
				const u = new SpeechSynthesisUtterance(msg);
				u.lang = 'id-ID';
				speechSynthesis.speak(u);
			} catch {
				// silently ignore
			}
		}
	}

	async function handlePlaySound(tipe: string) {
		playingTipe = tipe;
		const bellPromise = playBellSound();
		await new Promise((r) => setTimeout(r, 1500));
		await playTipeSound(tipe);
		await bellPromise;
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

	function handleEditTTS(tipe: string) {
		editingText = ttsMessages[tipe] ?? '';
		editingTipe = tipe;
	}

	async function handleSaveTTS() {
		if (!editingTipe) return;
		const trimmed = editingText.trim();
		try {
			const fd = new FormData();
			fd.append('tipe', editingTipe);
			fd.append('message', trimmed);
			const res = await fetch('?/saveTts', { method: 'POST', body: fd });
			if (!res.ok) {
				const err = await res.json().catch(() => ({ fail: 'Gagal menyimpan teks' }));
				throw new Error(err.fail ?? `Error ${res.status}`);
			}
			ttsMessages[editingTipe] = trimmed || defaultTtsMessages[editingTipe] || '';
			toast(trimmed ? 'Teks berhasil disimpan' : 'Teks dikembalikan ke default', 'success');
		} catch (e) {
			toast(e instanceof Error ? e.message : 'Gagal menyimpan teks', 'error');
		}
		editingTipe = null;
		editingText = '';
	}

	function handleResetTTS() {
		if (editingTipe && defaultTtsMessages[editingTipe]) {
			editingText = defaultTtsMessages[editingTipe];
		}
	}

	function handleCancelEditTTS() {
		editingTipe = null;
		editingText = '';
	}

	async function handleSubmit() {
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
					type="time"
					class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
					bind:value={jamMulaiValue}
					disabled={submitting}
				/>
			</label>
		</div>
	</fieldset>

	<fieldset class="fieldset">
		<legend class="fieldset-legend">Upload Sound</legend>
		<p class="text-base-content/70 mb-2 text-xs">
			Upload file MP3. Maksimal 2MB per file. Jika sound tidak tersedia, akan menggunakan speech
			synthesis browser.
		</p>
		<div class="flex flex-col gap-1">
			{#each soundTipes as { tipe, label } (tipe)}
				<div class="bg-base-200/50 flex items-center justify-between gap-3 rounded-md p-2">
					<div class="flex flex-col gap-0.5">
						<span class="text-sm font-medium">{label}</span>
						{#if getSoundFileName(tipe)}
							<span class="text-base-content/60 text-xs">{getSoundFileName(tipe)}</span>
						{:else}
							<span class="text-base-content/40 text-xs">Belum ada file</span>
						{/if}
					</div>
					<div class="flex items-center gap-1">
						<div class="join">
							{#if tipe !== 'custom'}
								<button
									type="button"
									class="btn btn-soft btn-sm join-item shadow-none"
									onclick={() => handleEditTTS(tipe)}
									disabled={submitting}
									aria-label="Edit teks {label}"
								>
									<Icon name="edit" />
									Text
								</button>
							{/if}
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

{#if editingTipe}
	<div class="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50">
		<div class="modal-box flex max-h-[80vh] w-full max-w-lg flex-col">
			<h3 class="text-lg font-bold">Edit Teks To Speech</h3>
			<p class="text-base-content/70 mb-3 text-sm">
				Teks ini akan digunakan sebagai fallback ketika file sound tidak tersedia.
			</p>
			<textarea
				class="textarea textarea-bordered bg-base-200 h-32 w-full resize-none"
				bind:value={editingText}
				disabled={submitting}
			></textarea>
			<div class="modal-action justify-between">
				<button type="button" class="btn btn-soft btn-warning shadow-none" onclick={handleResetTTS}>
					Reset
				</button>
				<div class="flex gap-2">
					<button type="button" class="btn btn-soft shadow-none" onclick={handleCancelEditTTS}>
						Batal
					</button>
					<button type="button" class="btn btn-primary shadow-none" onclick={handleSaveTTS}>
						Simpan
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
