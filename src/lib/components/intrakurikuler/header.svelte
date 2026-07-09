<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/icon.svelte';

	let {
		mapelDisplayName,
		mapelKelasNama,
		kelasAktifLabel,
		importTooltip,
		isImportDisabled,
		onOpenImport,
		showAgamaSelect,
		isAgamaSelectLocked = false,
		agamaSelectId,
		agamaOptions,
		selectedAgamaId,
		onAgamaChange,
		onAgamaElementMounted,
		onBack,
		handlePrimaryActionClick,
		isTambahTpDisabled,
		tambahTpTooltip,
		hasSelection,
		isInteractionLocked,
		isCreateModeActive,
		isEditModeActive,
		submitActiveForm,
		activeFormId,
		isFormSubmitting,
		isEditingBobot,
		hasGroups,
		toggleBobotEditing
	} = $props();

	let agamaEl = $state<HTMLSelectElement | null>(null);

	onMount(() => {
		if (onAgamaElementMounted && agamaEl) onAgamaElementMounted(agamaEl as HTMLSelectElement);
	});

	// Ensure the select element reflects the locked/disabled state for
	// accessibility and visual affordance. Use $effect (runes mode) instead
	// of legacy `$:` reactive statements.
	$effect(() => {
		if (!agamaEl) return;
		const el = agamaEl as HTMLSelectElement;
		el.disabled = Boolean(isAgamaSelectLocked);
		if (isAgamaSelectLocked) {
			el.setAttribute('aria-disabled', 'true');
			el.classList.add('opacity-50', 'pointer-events-none');
		} else {
			el.removeAttribute('aria-disabled');
			el.classList.remove('opacity-50', 'pointer-events-none');
		}
	});
</script>

<div class="mb-2 flex flex-col gap-3 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
	<h2 class="text-xl font-bold sm:flex-1">
		<span class="opacity-50">Mata Pelajaran:</span>
		{mapelDisplayName} – {mapelKelasNama}
		{#if kelasAktifLabel}
			<p class="text-base-content/70 text-sm">Kelas aktif: {kelasAktifLabel}</p>
		{:else}
			<p class="text-base-content/60 text-sm">
				Pilih kelas di navbar untuk melihat mata pelajaran intrakurikuler.
			</p>
		{/if}
	</h2>

	<button
		class="btn btn-soft w-full shadow-none max-sm:hidden sm:w-auto sm:max-w-40"
		type="button"
		onclick={() => onOpenImport && onOpenImport()}
		disabled={isImportDisabled}
		title={importTooltip}
	>
		<Icon name="import" />
		Import TP
	</button>
</div>

<button
	class="btn btn-soft mb-2 w-full shadow-none sm:hidden"
	type="button"
	onclick={() => onBack?.()}
>
	<Icon name="left" />
	Kembali
</button>

<button
	class="btn btn-soft mb-2 w-full shadow-none sm:hidden"
	type="button"
	onclick={() => onOpenImport && onOpenImport()}
	disabled={isImportDisabled}
	title={importTooltip}
>
	<Icon name="import" />
	Import TP
</button>

<!-- action row -->
<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
	<button class="btn btn-soft shadow-none max-sm:hidden" type="button" onclick={() => onBack?.()}>
		<Icon name="left" />
		Kembali
	</button>

	{#if showAgamaSelect}
		<div class="form-control overflow-hidden sm:w-60">
			<select
				class="select bg-base-200 w-full truncate shadow-none dark:border-none"
				id={agamaSelectId}
				bind:this={agamaEl}
				aria-label="Pilih Agama"
				value={selectedAgamaId}
				onchange={(e) => onAgamaChange && onAgamaChange(e)}
				disabled={isAgamaSelectLocked}
				title={isAgamaSelectLocked
					? 'Dipilih dan dikunci sesuai dengan tugas guru mapel agama'
					: undefined}
			>
				<option value="" disabled>Pilih Agama</option>
				{#each agamaOptions as option (option.id)}
					<option value={option.id.toString()}>{option.label}</option>
				{/each}
			</select>
		</div>
	{/if}

	<button
		class="btn btn-soft shadow-none sm:ml-auto sm:max-w-40"
		type="button"
		onclick={() => handlePrimaryActionClick && handlePrimaryActionClick()}
		disabled={isTambahTpDisabled}
		title={tambahTpTooltip}
		class:btn-error={hasSelection}
		class:btn-secondary={isInteractionLocked}
	>
		<Icon name={hasSelection ? 'del' : isInteractionLocked ? 'close' : 'plus'} />
		{hasSelection ? 'Hapus TP' : isInteractionLocked ? 'Batalkan' : 'Tambah TP'}
	</button>

	{#if isCreateModeActive || isEditModeActive}
		<button
			class="btn btn-primary shadow-none sm:max-w-40"
			type="button"
			onclick={() => submitActiveForm && submitActiveForm()}
			disabled={!activeFormId || isFormSubmitting}
			aria-busy={isFormSubmitting}
		>
			<Icon name="save" />
			Simpan
		</button>
	{:else}
		<button
			class="btn shadow-none sm:max-w-40 {isEditingBobot ? '' : 'btn-soft'}"
			type="button"
			onclick={() => toggleBobotEditing && toggleBobotEditing()}
			disabled={!hasGroups}
			class:btn-success={isEditingBobot}
		>
			<Icon name="percent" />
			{isEditingBobot ? 'Simpan Bobot' : 'Atur Bobot'}
		</button>
	{/if}
</div>
