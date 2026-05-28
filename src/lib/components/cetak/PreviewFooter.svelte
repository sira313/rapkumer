<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import AturKriteriaModal from './AturKriteriaModal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { deletePiagamBg } from '$lib/components/piagam-bg.client';
	import PiagamBgUploadBody from '$lib/components/PiagamBgUploadBody.svelte';

	let {
		hasMurid = false,
		muridCount = 0,
		isPiagamSelected = false,
		selectedTemplate = '1',
		onBgRefresh,
		onSetKriteria = () => {},
		kritCukup = 85,
		kritBaik = 95,
		isRaporSelected = false,
		tpMode = 'compact',
		onToggleFullTP = () => {},
		kelasId = null,
		isBiodataSelected = false,
		isKeasramaanSelected = false,
		showBgLogo = false,
		onToggleBgLogo = () => {}
	}: {
		hasMurid: boolean;
		muridCount: number;
		isPiagamSelected: boolean;
		selectedTemplate: '1' | '2';
		onBgRefresh: () => void;
		isRaporSelected: boolean;
		tpMode: 'compact' | 'full-desc';
		onToggleFullTP: (value: 'compact' | 'full-desc') => void;
		onSetKriteria: (cukup: number, baik: number) => void;
		kritCukup: number;
		kritBaik: number;
		kelasId: string | number | null;
		isBiodataSelected?: boolean;
		isKeasramaanSelected?: boolean;
		showBgLogo?: boolean;
		onToggleBgLogo?: (value: boolean) => void;
	} = $props();

	async function handleDeleteBg() {
		showModal({
			title: 'Hapus Background Piagam',
			body: `Hapus background piagam template ${selectedTemplate}?<br />Ini akan mengembalikan background ke default.`,
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
						await deletePiagamBg(selectedTemplate);
						onBgRefresh();
						toast('Background piagam dikembalikan ke default.', 'success');
					} catch (err) {
						console.error(err);
						toast('Gagal menghapus background piagam.', 'error');
					} finally {
						close();
					}
				}
			}
		});
	}

	function handleUploadBg() {
		showModal({
			title: `Unggah Background Piagam — Template ${selectedTemplate}`,
			body: PiagamBgUploadBody,
			bodyProps: {
				template: selectedTemplate,
				onUploaded: onBgRefresh
			},
			dismissible: true
		});
	}

	let isDownloadingBA = $state(false);

	async function handleDownloadBA() {
		if (!kelasId) {
			toast('Kelas tidak ditemukan.', 'error');
			return;
		}

		isDownloadingBA = true;
		try {
			const response = await fetch('/api/cetak/ba', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ kelasId: Number(kelasId) })
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData?.error ?? 'Gagal membuat Berita Acara.');
			}

			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `BA_Rapor_${new Date().toLocaleDateString('id-ID', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit'
			})}.xlsx`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			toast('Berita Acara berhasil diunduh.', 'success');
		} catch (err) {
			console.error('Error downloading BA:', err);
			toast(err instanceof Error ? err.message : 'Gagal mendownload Berita Acara.', 'error');
		} finally {
			isDownloadingBA = false;
		}
	}
</script>

<div class="mt-4 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
	{#if hasMurid}
		<p>
			Terdapat <strong>{muridCount}</strong> murid di kelas ini. Download dokumen dalam bentuk PDF bisa
			dilakukan per murid atau semuanya dalam satu file.
		</p>
	{:else}
		<p class="text-warning">
			Belum ada data murid yang bisa di-preview. Tambahkan murid terlebih dahulu pada menu Informasi
			Umum › Murid.
		</p>
	{/if}
	<div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
		{#if isPiagamSelected}
			<button
				class="btn btn-sm btn-error btn-soft shadow-none"
				type="button"
				onclick={handleDeleteBg}
			>
				<Icon name="del" />
				Hapus BG
			</button>
			<button class="btn btn-sm btn-soft shadow-none" type="button" onclick={handleUploadBg}>
				<Icon name="image" />
				Ganti BG
			</button>
		{/if}

		{#if isRaporSelected}
			<button
				class="btn btn-sm btn-soft shadow-none"
				type="button"
				title="Download Berita Acara"
				disabled={!kelasId || isDownloadingBA}
				onclick={handleDownloadBA}
			>
				<Icon name="download" />
				BA
			</button>
			<button
				class="btn btn-sm btn-soft shadow-none"
				type="button"
				title="Atur Kriteria"
				onclick={() => {
					showModal({
						title: 'Atur Kriteria Penilaian Intrakurikuler',
						body: AturKriteriaModal,
						dismissible: true,
						onPositive: {
							label: 'Simpan',
							action: ({ close }: { close: () => void }) => {
								// read inputs from dialog DOM
								const cuk = document.getElementById('krit-cukup') as HTMLInputElement | null;
								const baik = document.getElementById('krit-baik') as HTMLInputElement | null;
								let cval = 85;
								let bval = 95;
								if (cuk) cval = Math.round(Number(cuk.value) || cval);
								if (baik) bval = Math.round(Number(baik.value) || bval);
								if (bval < cval) {
									const tmp = bval;
									bval = cval;
									cval = tmp;
								}
								onSetKriteria(cval, bval);
								close();
							}
						},
						bodyProps: { cukupUpper: kritCukup, baikUpper: kritBaik },
						// show cancel button too
						onNegative: { label: 'Batal' }
					});
				}}
			>
				<Icon name="gear" />
				Kriteria
			</button>
		{/if}

		{#if isRaporSelected || isKeasramaanSelected}
			<div class="flex flex-row gap-2">
				<label class="sr-only" for="tp-mode-select">TP mode</label>
				<select
					id="tp-mode-select"
					class="select select-sm dark:bg-base-200 w-full sm:w-35 dark:border-none"
					value={tpMode}
					onchange={(e) => {
						const val = (e.target as HTMLSelectElement).value as 'compact' | 'full-desc';
						onToggleFullTP(val);
					}}
				>
					<option value="compact">Compact TP</option>
					<option value="full-desc">Full desc</option>
				</select>
				{#if showBgLogo !== undefined}
					<label class="swap whitespace-nowrap shadow-none">
						<input
							type="checkbox"
							checked={showBgLogo}
							onchange={(e) => onToggleBgLogo((e.currentTarget as HTMLInputElement).checked)}
						/>
						<div
							class="btn btn-soft swap-on btn-sm shadow-none"
							title="Tambahkan watermark logo sekolah"
						>
							BG OFF
						</div>
						<div
							class="btn btn-soft swap-off btn-sm shadow-none"
							title="Hapus watermark logo sekolah"
						>
							BG ON
						</div>
					</label>
				{/if}
			</div>
		{/if}

		{#if isBiodataSelected}
			<label class="swap whitespace-nowrap shadow-none">
				<input
					type="checkbox"
					checked={showBgLogo}
					onchange={(e) => onToggleBgLogo((e.currentTarget as HTMLInputElement).checked)}
				/>
				<div
					class="btn btn-soft swap-on btn-sm shadow-none"
					title="Tambahkan watermark logo sekolah"
				>
					BG OFF
				</div>
				<div class="btn btn-soft swap-off btn-sm shadow-none" title="Hapus watermark logo sekolah">
					BG ON
				</div>
			</label>
		{/if}
	</div>
</div>
