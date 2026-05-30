<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { createEventDispatcher } from 'svelte';

	export let open: boolean;
	export let lingkup: number;
	export let sts: number;
	export let sas: number;
	export let lingkupRts: number;
	export let stsRts: number;
	export let loading: boolean = false;
	export let saving: boolean = false;
	export let error: string | null = null;

	// RAS state
	let lingkupLocal: number | string = lingkup;
	let stsLocal: number | string = sts;
	let sasLocal: number | string = sas;

	let initialLingkup: number | string = lingkup;
	let initialSts: number | string = sts;
	let initialSas: number | string = sas;

	// RTS state
	let lingkupRtsLocal: number | string = lingkupRts;
	let stsRtsLocal: number | string = stsRts;

	let initialLingkupRts: number | string = lingkupRts;
	let initialStsRts: number | string = stsRts;

	let activeTab: string = 'ras';

	const dispatch = createEventDispatcher();

	$: totalRas =
		(Number(lingkupLocal) || 0) + (Number(stsLocal) || 0) + (Number(sasLocal) || 0);
	$: totalRts = (Number(lingkupRtsLocal) || 0) + (Number(stsRtsLocal) || 0);
	$: currentTotal = activeTab === 'ras' ? totalRas : totalRts;
	$: isComplete = currentTotal === 100;

	function close() {
		dispatch('close');
	}

	function reset() {
		if (activeTab === 'ras') {
			lingkupLocal = initialLingkup;
			stsLocal = initialSts;
			sasLocal = initialSas;
			dispatch('reset', {
				lingkup: Number(initialLingkup) || 0,
				sts: Number(initialSts) || 0,
				sas: Number(initialSas) || 0,
				rapor: 'ras'
			});
		} else {
			lingkupRtsLocal = initialLingkupRts;
			stsRtsLocal = initialStsRts;
			dispatch('reset', {
				lingkup: Number(initialLingkupRts) || 0,
				sts: Number(initialStsRts) || 0,
				rapor: 'rts'
			});
		}
	}

	function save() {
		if (activeTab === 'ras') {
			dispatch('save', {
				lingkup: Number(lingkupLocal) || 0,
				sts: Number(stsLocal) || 0,
				sas: Number(sasLocal) || 0,
				rapor: 'ras'
			});
		} else {
			dispatch('save', {
				lingkup: Number(lingkupRtsLocal) || 0,
				sts: Number(stsRtsLocal) || 0,
				rapor: 'rts'
			});
		}
	}

	$: if (open) {
		initialLingkup = lingkup;
		initialSts = sts;
		initialSas = sas;
		lingkupLocal = lingkup;
		stsLocal = sts;
		sasLocal = sas;

		initialLingkupRts = lingkupRts;
		initialStsRts = stsRts;
		lingkupRtsLocal = lingkupRts;
		stsRtsLocal = stsRts;
	}
</script>

<input id="sumatif-bobot-modal" type="checkbox" class="modal-toggle" bind:checked={open} hidden />
<div
	class="modal"
	aria-hidden={!open}
	onclick={(e) => {
		if (e.target === e.currentTarget) close();
	}}
>
	<div class="modal-box max-w-lg">
		<h3 class="text-lg font-bold">Atur Bobot Default - Sumatif</h3>
		<p class="text-base-content/70 text-sm">
			Atur distribusi bobot default untuk perhitungan nilai akhir sumatif.
		</p>

		<div role="tablist" class="tabs tabs-box mt-4">
			<input
				type="radio"
				name="sumatif-bobot-tab"
				class="tab"
				aria-label="Rapor Akhir Semester"
				bind:group={activeTab}
				value="ras"
			/>
			<div class="tab-content p-4">
				<div class="grid grid-cols-1 gap-3">
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Lingkup Materi (%)</legend>
						<input
							type="number"
							min="0"
							max="100"
							class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
							bind:value={lingkupLocal}
							disabled={loading || saving}
						/>
					</fieldset>
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Sumatif Tengah Semester (STS) (%)</legend>
						<input
							type="number"
							min="0"
							max="100"
							class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
							bind:value={stsLocal}
							disabled={loading || saving}
						/>
					</fieldset>
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Sumatif Akhir Semester (SAS) (%)</legend>
						<input
							type="number"
							min="0"
							max="100"
							class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
							bind:value={sasLocal}
							disabled={loading || saving}
						/>
					</fieldset>
				</div>
			</div>
			<input
				type="radio"
				name="sumatif-bobot-tab"
				class="tab"
				aria-label="Rapor Tengah Semester"
				bind:group={activeTab}
				value="rts"
			/>
			<div class="tab-content p-4">
				<div class="grid grid-cols-1 gap-3">
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Lingkup Materi (%)</legend>
						<input
							type="number"
							min="0"
							max="100"
							class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
							bind:value={lingkupRtsLocal}
							disabled={loading || saving}
						/>
					</fieldset>
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Sumatif Tengah Semester (STS) (%)</legend>
						<input
							type="number"
							min="0"
							max="100"
							class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
							bind:value={stsRtsLocal}
							disabled={loading || saving}
						/>
					</fieldset>
				</div>
			</div>
		</div>

		<div class="mt-4 text-sm">
			{#if loading}
				<p class="text-base-content/70 text-sm">Memuat bobot...</p>
			{/if}
			<p>
				Total: <strong>{currentTotal}%</strong>
			</p>
			{#if error}
				<p class="text-error mt-2">{error}</p>
			{:else if !isComplete}
				<p class="text-warning mt-2">Perhatian: jumlah bobot belum 100%.</p>
			{/if}
		</div>

		<div class="mt-4 flex flex-col gap-2 sm:flex-row">
			<button type="button" class="btn btn-soft shadow-none" onclick={close}>
				<Icon name="left" />Batal
			</button>
			<button
				type="button"
				class="btn btn-soft btn-error shadow-none sm:ml-auto"
				onclick={reset}
				disabled={saving}>Reset</button
			>
			<button
				type="button"
				class="btn btn-primary shadow-none"
				onclick={save}
				disabled={saving || !isComplete}
			>
				{#if saving}Menyimpan...{:else}Simpan{/if}
			</button>
		</div>
	</div>
</div>
