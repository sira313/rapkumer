<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { hideModal } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import Icon from '$lib/components/icon.svelte';

	interface Props {
		jamMasuk?: string;
		jamPulang?: string;
		hariSekolah?: number;
		tipePresensi?: string;
	}

	let {
		jamMasuk = '07:30',
		jamPulang = '15:00',
		hariSekolah = 6,
		tipePresensi = 'masuk_pulang'
	}: Props = $props();

	let submitting = $state(false);
	let jamMasukValue = $state(jamMasuk);
	let jamPulangValue = $state(jamPulang);
	let hariSekolahValue = $state(String(hariSekolah));
	let tipePresensiValue = $state(tipePresensi);

	const validationError = $derived.by(() => {
		if (!jamMasukValue || !jamPulangValue) return 'Jam masuk dan jam pulang harus diisi';
		if (jamMasukValue >= jamPulangValue) return 'Jam masuk harus lebih awal dari jam pulang';
		if (!['5', '6'].includes(hariSekolahValue)) return 'Pilih hari sekolah';
		if (!['masuk_pulang', 'masuk_saja'].includes(tipePresensiValue)) return 'Pilih tipe presensi';
		return null;
	});

	function validateBeforeSubmit() {
		if (!jamMasukValue || !jamPulangValue) {
			toast('Jam masuk dan jam pulang harus diisi', 'warning');
			return false;
		}
		if (jamMasukValue >= jamPulangValue) {
			toast('Jam masuk harus lebih awal dari jam pulang', 'warning');
			return false;
		}
		if (!['5', '6'].includes(hariSekolahValue)) {
			toast('Pilih hari sekolah', 'warning');
			return false;
		}
		if (!['masuk_pulang', 'masuk_saja'].includes(tipePresensiValue)) {
			toast('Pilih tipe presensi', 'warning');
			return false;
		}
		return true;
	}

	async function handleSubmit() {
		if (!validateBeforeSubmit()) return;

		submitting = true;
		const formData = new FormData();
		formData.append('jamMasuk', jamMasukValue);
		formData.append('jamPulang', jamPulangValue);
		formData.append('hariSekolah', hariSekolahValue);
		formData.append('tipePresensi', tipePresensiValue);

		try {
			const response = await fetch('?/savePresensiSettings', {
				method: 'POST',
				body: formData,
				redirect: 'error'
			});

			if (!response.ok) {
				const err = await response
					.json()
					.catch(() => ({ fail: 'Gagal menyimpan pengaturan presensi' }));
				throw new Error(err.fail ?? `Error ${response.status}`);
			}

			hideModal();
			toast('Pengaturan presensi berhasil disimpan', 'success');
			await invalidate('app:absen');
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Gagal menyimpan pengaturan presensi';
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
			<span class="fieldset-legend text-sm font-semibold">Jam Masuk</span>
			<input
				type="time"
				class="time-input-bypass input bg-base-200 dark:bg-base-300 w-full dark:border-none"
				bind:value={jamMasukValue}
			/>
		</label>
		<label class="fieldset flex flex-col gap-1">
			<span class="fieldset-legend text-sm font-semibold">Jam Pulang</span>
			<input
				type="time"
				class="time-input-bypass input bg-base-200 dark:bg-base-300 w-full dark:border-none"
				bind:value={jamPulangValue}
			/>
		</label>
	</div>

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<label class="fieldset flex flex-col gap-1">
			<span class="fieldset-legend text-sm font-semibold">Hari Sekolah</span>
			<select
				class="select bg-base-200 dark:bg-base-300 w-full dark:border-none"
				bind:value={hariSekolahValue}
			>
				<option value="5">5 Hari Sekolah (Senin - Jumat)</option>
				<option value="6">6 Hari Sekolah (Senin - Sabtu)</option>
			</select>
		</label>
		<label class="fieldset flex flex-col gap-1">
			<span class="fieldset-legend text-sm font-semibold">Tipe Presensi</span>
			<select
				class="select bg-base-200 dark:bg-base-300 w-full dark:border-none"
				bind:value={tipePresensiValue}
			>
				<option value="masuk_pulang">Masuk Pulang</option>
				<option value="masuk_saja">Masuk Saja</option>
			</select>
		</label>
	</div>

	{#if validationError}
		<div class="alert alert-soft alert-warning flex items-center gap-2" role="alert">
			<Icon name="warning" class="h-4 w-4 shrink-0" />
			<span class="text-sm">{validationError}</span>
		</div>
	{/if}

	<div class="modal-action mt-2">
		<button
			type="button"
			class="btn btn-soft gap-2 shadow-none"
			onclick={handleCancel}
			disabled={submitting}
		>
			<Icon name="close" />
			<span>Batal</span>
		</button>
		<button
			type="button"
			class="btn btn-primary gap-2 shadow-none"
			onclick={handleSubmit}
			disabled={submitting || !!validationError}
		>
			{#if submitting}
				<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
			{:else}
				<Icon name="save" />
			{/if}
			<span>Simpan</span>
		</button>
	</div>
</div>

<style>
	:global(.time-input-bypass::-webkit-calendar-picker-indicator) {
		display: none;
	}
</style>
