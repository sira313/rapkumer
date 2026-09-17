<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { hideModal } from '$lib/components/global-modal.svelte';
	import { invalidate } from '$app/navigation';
	import {
		profilPelajarPancasilaDimensionLabelByKey,
		type DimensiProfilLulusanKey
	} from '$lib/statics';

	interface Props {
		onSuccess?: () => void;
	}

	let { onSuccess }: Props = $props();

	const fileInputId = 'import-kokurikuler-file';
	let fileInput: HTMLInputElement | null = null;
	let hasFile = $state(false);
	let fileName = $state('');

	const dimensiKeys = Object.keys(
		profilPelajarPancasilaDimensionLabelByKey
	) as DimensiProfilLulusanKey[];
	const dimensiExample = dimensiKeys.slice(0, 3).join(', ');

	function handleFileChange(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		const file = target.files?.[0];
		hasFile = Boolean(file);
		fileName = file ? file.name : '';
	}

	function resetForm(form?: HTMLFormElement | null) {
		hasFile = false;
		fileName = '';
		if (fileInput) fileInput.value = '';
		form?.reset();
	}

	function handleClose() {
		resetForm();
		hideModal();
	}
</script>

<div class="space-y-6">
	<p class="text-base-content/70 text-sm">
		Unggah file Excel (.xlsx) sesuai format di bawah. Baris kosong akan diabaikan.
	</p>

	<div class="overflow-auto rounded-lg text-sm">
		<table class="table-sm table-compact table-zebra table w-full border-collapse">
			<thead class="bg-base-300">
				<tr class="text-sm font-semibold">
					<th class="pl-2">Kode</th>
					<th>Dimensi</th>
					<th>Kegiatan</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td class="pl-2 font-mono text-xs">KOK1</td>
					<td class="text-xs">{dimensiExample}</td>
					<td>Menulis cerita tentang profile pelajar pancasila</td>
				</tr>
				<tr>
					<td class="pl-2 font-mono text-xs">KOK2</td>
					<td class="text-xs">{dimensiExample}</td>
					<td>Presentasi hasil diskusi kelompok</td>
				</tr>
			</tbody>
		</table>
	</div>

	<p class="text-base-content/50 text-xs">
		<strong>Dimensi</strong> dipisahkan koma. Gunakan salah satu dari:
		{#each dimensiKeys as key, i (key)}{#if i > 0},
			{/if}<code class="text-xs">{key}</code>{/each}.
	</p>

	<FormEnhance
		action="?/import_kokurikuler"
		enctype="multipart/form-data"
		showToast={true}
		onsuccess={async ({ form }) => {
			await invalidate('app:kokurikuler');
			onSuccess?.();
			resetForm(form);
			hideModal();
		}}
	>
		{#snippet children({ submitting })}
			<fieldset class="fieldset">
				<legend class="fieldset-legend font-semibold">Pilih File Excel (.xlsx)</legend>
				<input
					id={fileInputId}
					bind:this={fileInput}
					onchange={handleFileChange}
					required
					name="file"
					type="file"
					accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
					class="file-input file-input-ghost"
				/>
				<label class="label" for={fileInputId}>
					<span class="label-text-alt text-base-content/60 text-xs text-wrap"
						>Maksimal 2MB. Kolom Kode, Dimensi, dan Kegiatan wajib ada.</span
					>
					{#if fileName}
						<span class="label-text-alt text-base-content/60 text-xs"
							>File dipilih: <strong>{fileName}</strong></span
						>
					{/if}
				</label>
			</fieldset>

			<div class="flex justify-end gap-2">
				<button
					type="button"
					class="btn btn-soft shadow-none"
					onclick={handleClose}
					disabled={submitting}>Batal</button
				>
				<button
					type="submit"
					class="btn btn-primary btn-soft shadow-none"
					disabled={submitting || !hasFile}
				>
					{#if submitting}
						<span class="loading loading-spinner"></span>
					{:else}
						<Icon name="import" /> Import
					{/if}
				</button>
			</div>
		{/snippet}
	</FormEnhance>
</div>
