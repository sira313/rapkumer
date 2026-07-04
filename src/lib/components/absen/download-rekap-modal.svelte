<script lang="ts">
	import { hideModal } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';

	const bulanList = [
		'Januari',
		'Februari',
		'Maret',
		'April',
		'Mei',
		'Juni',
		'Juli',
		'Agustus',
		'September',
		'Oktober',
		'November',
		'Desember'
	];

	const now = new Date();
	let bulan = $state(now.getMonth() + 1);
	let tahun = $state(now.getFullYear());

	let { onAction } = $props<{
		onAction?: (actions: { download: () => Promise<void>; cancel: () => void }) => void;
	}>();

	async function handleDownload() {
		try {
			const response = await fetch('/api/absen/download-rekap', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					bulan,
					tahun
				})
			});

			if (!response.ok) {
				const err = await response.json().catch(() => ({ message: 'Gagal mengunduh rekap' }));
				throw new Error(err.message ?? `Error ${response.status}`);
			}

			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `Rekap_Kehadiran_${bulanList[bulan - 1]}_${tahun}.xlsx`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			hideModal();
			toast('Rekap berhasil diunduh', 'success');
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Gagal mengunduh rekap';
			toast(message, 'error');
		}
	}

	function handleCancel() {
		hideModal();
	}

	$effect(() => {
		onAction?.({ download: handleDownload, cancel: handleCancel });
	});
</script>

<div class="not-prose flex flex-col gap-6">
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<label class="fieldset flex flex-col gap-1">
			<span class="fieldset-legend text-sm font-semibold">Bulan</span>
			<select
				class="select bg-base-200 dark:bg-base-300 w-full truncate dark:border-none"
				bind:value={bulan}
			>
				{#each bulanList as nama, i (nama)}
					<option value={i + 1}>{nama}</option>
				{/each}
			</select>
		</label>
		<label class="fieldset flex flex-col gap-1">
			<span class="fieldset-legend text-sm font-semibold">Tahun</span>
			<input
				type="number"
				class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
				bind:value={tahun}
				min="2000"
				max="2099"
			/>
		</label>
	</div>
</div>
