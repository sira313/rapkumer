<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { createEventDispatcher, onDestroy } from 'svelte';

	let { open, currentVersion }: { open: boolean; currentVersion: string } = $props();

	const dispatch = createEventDispatcher<{ close: void }>();

	type DownloadPhase = UpdateDownloadState | 'idle';

	interface DownloadUiState {
		id: string | null;
		version: string;
		assetName: string;
		status: DownloadPhase;
		downloadedBytes: number;
		totalBytes: number | null;
		error: string | null;
		installScheduled: boolean;
	}

	let checkingUpdate = $state(false);
	let checkError = $state<string | null>(null);
	let latestRelease = $state<ReleaseSummary | null>(null);
	let updateAvailable = $state(false);
	let downloadState = $state<DownloadUiState>(createInitialDownloadState());
	let installingUpdate = $state(false);

	let downloadPollHandle: ReturnType<typeof setInterval> | null = null;

	const selectedAsset = $derived.by(() => pickPreferredAsset(latestRelease));
	const downloadProgress = $derived.by(() => {
		if (!downloadState.totalBytes || downloadState.totalBytes <= 0) return null;
		if (!Number.isFinite(downloadState.downloadedBytes)) return null;
		return Math.min(1, Math.max(0, downloadState.downloadedBytes / downloadState.totalBytes));
	});
	const downloadProgressPercent = $derived.by(() =>
		downloadProgress === null ? null : Math.round(downloadProgress * 100)
	);

	onDestroy(() => {
		clearDownloadPolling();
	});

	$effect(() => {
		if (open) {
			if (!latestRelease && !checkingUpdate) {
				void checkForUpdate(true);
			}
			return;
		}

		clearDownloadPolling();
	});

	function createInitialDownloadState(): DownloadUiState {
		return {
			id: null,
			version: '',
			assetName: '',
			status: 'idle',
			downloadedBytes: 0,
			totalBytes: null,
			error: null,
			installScheduled: false
		};
	}

	function pickPreferredAsset(release: ReleaseSummary | null): UpdateAsset | null {
		if (!release || !release.assets?.length) return null;
		const exe = release.assets.find((asset) => asset.name.toLowerCase().endsWith('.exe'));
		return exe ?? release.assets[0] ?? null;
	}

	function formatBytes(bytes: number) {
		if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB'];
		let value = bytes;
		let index = 0;
		while (value >= 1024 && index < units.length - 1) {
			value /= 1024;
			index += 1;
		}
		const precision = value < 10 && index > 0 ? 1 : 0;
		return `${value.toFixed(precision)} ${units[index]}`;
	}

	function formatDateTime(value: string) {
		if (!value) return '-';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return date.toLocaleString('id-ID', {
			dateStyle: 'medium',
			timeStyle: 'short',
			hour12: false
		});
	}

	function clearDownloadPolling() {
		if (downloadPollHandle) {
			clearInterval(downloadPollHandle);
			downloadPollHandle = null;
		}
	}

	function resetDownloadState(release: ReleaseSummary | null) {
		const asset = pickPreferredAsset(release);
		downloadState = {
			id: null,
			version: release?.version ?? '',
			assetName: asset?.name ?? '',
			status: 'idle',
			downloadedBytes: 0,
			totalBytes: asset?.size ?? null,
			error: null,
			installScheduled: false
		};
	}

	async function checkForUpdate(force = false) {
		if (checkingUpdate) return;
		if (!force && latestRelease) return;

		checkingUpdate = true;
		checkError = null;

		try {
			const response = await fetch('/api/updates/latest', {
				method: 'GET',
				credentials: 'same-origin',
				cache: 'no-store'
			});

			if (!response.ok) {
				const message = await response.text().catch(() => '');
				throw new Error(message || 'Gagal memeriksa pembaruan.');
			}

			const payload = (await response.json()) as UpdateCheckResponse;
			latestRelease = payload.latest ?? null;
			updateAvailable = Boolean(payload.updateAvailable && latestRelease);

			if (!updateAvailable) {
				resetDownloadState(null);
			} else if (!downloadState.id || payload.latest?.version !== downloadState.version) {
				resetDownloadState(payload.latest);
			}
		} catch (error) {
			checkError = error instanceof Error ? error.message : 'Gagal memeriksa pembaruan.';
			updateAvailable = false;
		} finally {
			checkingUpdate = false;
		}
	}

	function startDownloadPolling(id: string) {
		clearDownloadPolling();
		downloadPollHandle = setInterval(async () => {
			try {
				const response = await fetch(`/api/updates/status/${id}`, {
					cache: 'no-store',
					credentials: 'same-origin'
				});

				if (!response.ok) {
					if (response.status === 404) {
						clearDownloadPolling();
						downloadState = {
							...downloadState,
							status: 'failed',
							error: 'Status unduhan tidak ditemukan.'
						};
					}
					return;
				}

				const status = (await response.json()) as UpdateDownloadStatus;
				downloadState = {
					...downloadState,
					id: status.id,
					version: status.version,
					assetName: status.assetName,
					status: status.status,
					downloadedBytes: status.downloadedBytes,
					totalBytes: status.totalBytes,
					error: status.error,
					installScheduled: status.installScheduled
				};

				if (status.status === 'completed' || status.status === 'failed') {
					clearDownloadPolling();
				}
			} catch (error) {
				console.error('Gagal memeriksa status unduhan', error);
			}
		}, 1000);
	}

	async function downloadUpdate() {
		if (!latestRelease) return;
		const asset = selectedAsset;
		if (!asset) {
			toast({ message: 'Berkas rilis tidak tersedia. Unduh manual di GitHub.', type: 'warning' });
			return;
		}

		clearDownloadPolling();
		downloadState = {
			id: null,
			version: latestRelease.version,
			assetName: asset.name,
			status: 'pending',
			downloadedBytes: 0,
			totalBytes: asset.size ?? null,
			error: null,
			installScheduled: false
		};

		try {
			const response = await fetch('/api/updates/download', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ version: latestRelease.version, assetId: asset.id }),
				credentials: 'same-origin'
			});

			if (!response.ok) {
				const message = await response.text().catch(() => '');
				throw new Error(message || 'Gagal memulai unduhan pembaruan.');
			}

			const payload = (await response.json()) as UpdateDownloadStatus;
			downloadState = {
				id: payload.id,
				version: payload.version,
				assetName: payload.assetName,
				status: payload.status,
				downloadedBytes: payload.downloadedBytes,
				totalBytes: payload.totalBytes,
				error: payload.error,
				installScheduled: payload.installScheduled
			};
			startDownloadPolling(payload.id);
		} catch (error) {
			downloadState = {
				...downloadState,
				status: 'failed',
				error: error instanceof Error ? error.message : 'Gagal mengunduh pembaruan.'
			};
			toast({
				message: downloadState.error ?? 'Gagal mengunduh pembaruan.',
				type: 'error'
			});
		}
	}

	async function stopServerForInstaller() {
		const showSuccess = () =>
			toast({
				message:
					'Server dihentikan. Tutup jendela Rapkumer ini lalu jalankan ulang bila diperlukan.',
				type: 'info',
				persist: true
			});

		try {
			const response = await fetch('/api/runtime/stop', { method: 'POST', keepalive: true });
			if (response.ok) {
				showSuccess();
				return;
			}

			const details = await response.text().catch(() => '');
			console.error(
				'Gagal menghentikan server setelah menjalankan installer',
				response.status,
				details
			);
			toast({
				message:
					'Gagal menghentikan server otomatis. Tutup Rapkumer secara manual sebelum melanjutkan pemasangan.',
				type: 'warning',
				persist: true
			});
		} catch (error) {
			console.warn(
				'Permintaan penghentian server untuk pemasangan mungkin berhasil walau tanpa respons.',
				error
			);
			showSuccess();
		}
	}

	async function installUpdate() {
		if (!downloadState.id) {
			toast({ message: 'Unduh pembaruan terlebih dahulu.', type: 'warning' });
			return;
		}
		if (downloadState.status !== 'completed') {
			toast({ message: 'Unduhan pembaruan belum selesai.', type: 'warning' });
			return;
		}
		if (installingUpdate || downloadState.installScheduled) return;

		installingUpdate = true;
		try {
			const response = await fetch('/api/updates/install', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ downloadId: downloadState.id }),
				credentials: 'same-origin'
			});

			if (!response.ok) {
				const message = await response.text().catch(() => '');
				throw new Error(message || 'Gagal menjadwalkan pemasangan pembaruan.');
			}

			downloadState = {
				...downloadState,
				installScheduled: true
			};
			toast({
				message:
					'Installer dijalankan. Ikuti petunjuk untuk menyelesaikan pembaruan. Server akan dimatikan otomatis.',
				type: 'success',
				persist: true
			});
			void stopServerForInstaller();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Gagal memasang pembaruan.';
			downloadState = {
				...downloadState,
				error: message
			};
			toast({ message, type: 'error' });
		} finally {
			installingUpdate = false;
		}
	}

	function requestClose() {
		dispatch('close');
	}

	function handleCancel(event: Event) {
		event.preventDefault();
		requestClose();
	}
</script>

{#if open}
	<dialog
		class="modal modal-open modal-middle"
		open
		aria-modal="true"
		oncancel={handleCancel}
		onkeydown={(event) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				requestClose();
			}
		}}
	>
		<div class="modal-box max-w-2xl">
			<div class="space-y-1">
				<h2 class="text-xl font-semibold">Cek Pembaruan</h2>
				<p class="text-base-content/70 text-sm">Versi terpasang: v{currentVersion}</p>
			</div>

			<div class="mt-4 space-y-4">
				{#if checkError}
					<div class="alert alert-error">
						<Icon name="error" />
						<div>
							<p class="font-semibold">Gagal memeriksa pembaruan</p>
							<p class="text-sm">{checkError}</p>
						</div>
						<button class="btn btn-sm" type="button" onclick={() => checkForUpdate(true)}>
							Coba lagi
						</button>
					</div>
				{/if}

				{#if checkingUpdate}
					<div class="rounded-box bg-base-200/60 p-4">
						<p class="text-sm font-medium">Memeriksa pembaruan…</p>
						<progress class="progress progress-primary mt-3 w-full"></progress>
					</div>
				{/if}

				{#if updateAvailable && latestRelease}
					<section class="space-y-3">
						<div>
							<p class="text-base-content/70 text-sm">Versi terbaru</p>
							<h3 class="text-lg font-semibold">Rapkumer v{latestRelease.version}</h3>
							<p class="text-base-content/60 text-xs">
								Dirilis {formatDateTime(latestRelease.publishedAt)}
							</p>
						</div>
						{#if selectedAsset}
							<div class="rounded-box bg-base-200/60 p-3 text-sm leading-5">
								<p class="font-medium">Berkas: {selectedAsset.name}</p>
								<p class="text-base-content/70">
									Ukuran: {formatBytes(selectedAsset.size)}
								</p>
							</div>
						{:else}
							<div class="alert alert-warning">
								<Icon name="warning" />
								<span>Berkas rilis tidak ditemukan. Unduh manual di GitHub.</span>
							</div>
						{/if}
						{#if latestRelease.notes}
							<div class="rounded-box bg-base-200/40 p-3 text-sm">
								<p class="font-medium">Catatan rilis</p>
								<p class="text-base-content/80 whitespace-pre-wrap">
									{latestRelease.notes}
								</p>
							</div>
						{/if}
					</section>
				{:else if !checkingUpdate}
					<div class="rounded-box bg-base-200/60 space-y-1 p-4 text-sm">
						<p class="font-medium">Anda sudah menggunakan versi terbaru Rapkumer.</p>
						<p class="text-base-content/70 text-xs">Tetap cek berkala untuk fitur terbaru.</p>
					</div>
				{/if}

				{#if updateAvailable && selectedAsset}
					<div class="space-y-3">
						{#if downloadState.status === 'downloading' || downloadState.status === 'pending'}
							<div class="rounded-box bg-base-200/50 space-y-2 p-3 text-sm">
								<p class="font-medium">Mengunduh pembaruan…</p>
								{#if downloadProgressPercent !== null}
									<progress
										class="progress progress-primary w-full"
										max="100"
										value={downloadProgressPercent}
									></progress>
								{:else}
									<progress class="progress progress-primary w-full"></progress>
								{/if}
								<p class="text-base-content/70 text-xs">
									{formatBytes(downloadState.downloadedBytes)}
									dari
									{downloadState.totalBytes
										? formatBytes(downloadState.totalBytes)
										: 'ukuran tidak diketahui'}
								</p>
							</div>
						{/if}

						{#if downloadState.status === 'failed' && downloadState.error}
							<div class="alert alert-error">
								<Icon name="error" />
								<span>{downloadState.error}</span>
							</div>
						{/if}

						{#if downloadState.installScheduled}
							<div class="alert alert-info">
								<Icon name="info" />
								<span>
									Installer telah dibuka. Ikuti petunjuk pemasangan, lalu jalankan ulang Rapkumer.
								</span>
							</div>
						{/if}

						<div class="flex flex-wrap gap-2">
							<button
								class="btn btn-primary"
								type="button"
								onclick={downloadUpdate}
								disabled={checkingUpdate ||
									downloadState.status === 'downloading' ||
									downloadState.status === 'pending'}
							>
								{#if downloadState.status === 'downloading' || downloadState.status === 'pending'}
									<span class="loading loading-spinner loading-sm"></span>
									Mengunduh…
								{:else}
									<Icon name="download" />
									Download
								{/if}
							</button>

							{#if downloadState.status === 'completed'}
								<button
									class="btn btn-success"
									type="button"
									onclick={installUpdate}
									disabled={installingUpdate || downloadState.installScheduled}
								>
									{#if installingUpdate}
										<span class="loading loading-spinner loading-sm"></span>
										Menyiapkan…
									{:else if downloadState.installScheduled}
										<Icon name="check" />
										Installer Dibuka
									{:else}
										<Icon name="check" />
										Install Update
									{/if}
								</button>
							{/if}
						</div>
					</div>
				{/if}

				<div class="flex justify-end">
					<button
						class="btn btn-outline btn-sm"
						type="button"
						onclick={() => checkForUpdate(true)}
						disabled={checkingUpdate}
					>
						<Icon name="activity" />
						Periksa ulang
					</button>
				</div>
			</div>
		</div>
		<form
			method="dialog"
			class="modal-backdrop"
			onsubmit={(event) => {
				event.preventDefault();
				requestClose();
			}}
		>
			<button type="submit">tutup</button>
		</form>
	</dialog>
{/if}
