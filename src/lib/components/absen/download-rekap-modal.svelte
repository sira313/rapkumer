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
	let liburDates = $state<string[]>([]);

	let submitting = $state(false);

	function addLiburDate() {
		liburDates = [...liburDates, ''];
	}

	function removeLiburDate(index: number) {
		liburDates = liburDates.filter((_, i) => i !== index);
	}

	function updateLiburDate(index: number, value: string) {
		const next = [...liburDates];
		next[index] = value;
		liburDates = next;
	}

	async function handleDownload() {
		submitting = true;
		try {
			const filteredLibur = liburDates.filter((d) => d.trim() !== '');
			const response = await fetch('/api/absen/download-rekap', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					bulan,
					tahun,
					liburNasional: filteredLibur
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
		} finally {
			submitting = false;
		}
	}

	function handleCancel() {
		hideModal();
	}
</script>

<div class="not-prose flex flex-col gap-6">
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<label class="fieldset flex flex-col gap-1">
			<span class="fieldset-legend text-sm font-semibold">Bulan</span>
			<select
				class="select bg-base-200 dark:bg-base-300 w-full dark:border-none"
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

	<div class="flex flex-col gap-2">
		<div class="flex items-center justify-between">
			<span class="fieldset-legend text-sm font-semibold">Tanggal Libur Nasional</span>
			<button
				type="button"
				class="btn btn-soft btn-sm shadow-none"
				onclick={addLiburDate}
				disabled={submitting}
			>
				Tambah Tanggal
			</button>
		</div>
		{#each liburDates as date, i (i)}
			<div class="flex items-center gap-2">
				<input
					type="date"
					class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
					value={date}
					onchange={(e) => updateLiburDate(i, (e.currentTarget as HTMLInputElement).value)}
				/>
				<button
					type="button"
					class="btn btn-soft btn-sm btn-error shadow-none"
					onclick={() => removeLiburDate(i)}
					disabled={submitting}
				>
					Hapus
				</button>
			</div>
		{/each}
	</div>

	<div class="modal-action mt-2">
		<button
			type="button"
			class="btn btn-soft gap-2 shadow-none"
			onclick={handleCancel}
			disabled={submitting}
		>
			Batal
		</button>
		<button
			type="button"
			class="btn btn-primary gap-2 shadow-none"
			onclick={handleDownload}
			disabled={submitting}
		>
			{#if submitting}
				<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
			{/if}
			Download
		</button>
	</div>
</div>
