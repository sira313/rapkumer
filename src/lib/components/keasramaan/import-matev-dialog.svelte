<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { invalidate } from '$app/navigation';

	interface Props {
		open?: boolean;
		onSuccess?: () => void;
	}

	let { open = $bindable(false), onSuccess }: Props = $props();

	const fileInputId = 'import-matev-file';
	let fileInput: HTMLInputElement | null = null;
	let hasFile = $state(false);
	let fileName = $state('');
	let submitting = $state(false);
	let dialogRef: HTMLDialogElement | null = $state(null);

	$effect(() => {
		if (open && dialogRef && !dialogRef.open) {
			dialogRef.showModal?.();
		} else if (!open && dialogRef?.open) {
			dialogRef.close();
		}
	});

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
		open = false;
	}
</script>

<dialog bind:this={dialogRef} class="modal" aria-modal="true" onclose={() => (open = false)}>
	<div class="modal-box flex max-h-[85vh] flex-col p-4 sm:max-w-2xl">
		<h3 class="mb-3 shrink-0 text-lg font-bold">Impor Matev</h3>

		<div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-1">
			<p class="text-base-content/70 text-sm">
				Unggah file Excel (.xlsx) sesuai format di bawah. Baris kosong akan diabaikan.
			</p>

			<div class="overflow-auto rounded-lg text-sm">
				<table class="table-sm table-compact table-zebra table w-full border-collapse">
					<thead class="bg-base-300">
						<tr class="text-sm font-semibold">
							<th class="pl-2">Matev</th>
							<th>Indikator</th>
							<th>Tujuan Pembelajaran</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td class="pl-2 font-medium">Kepemimpinan</td>
							<td>Kemampuan menjalin relasi dengan baik</td>
							<td>Tujuan 1</td>
						</tr>
						<tr>
							<td></td>
							<td></td>
							<td>Tujuan 2</td>
						</tr>
						<tr>
							<td></td>
							<td>Kemampuan memberikan instruksi</td>
							<td>Tujuan 1</td>
						</tr>
						<tr>
							<td></td>
							<td></td>
							<td>Tujuan 2</td>
						</tr>
						<tr>
							<td class="pl-2 font-medium">KETAATAN IBADAH</td>
							<td>Etika beribadah</td>
							<td>Tujuan 1</td>
						</tr>
						<tr>
							<td></td>
							<td></td>
							<td>Tujuan 2</td>
						</tr>
						<tr>
							<td></td>
							<td>Konsistensi beribadah</td>
							<td>Tujuan 1</td>
						</tr>
						<tr>
							<td></td>
							<td></td>
							<td>Tujuan 2</td>
						</tr>
					</tbody>
				</table>
			</div>

			<FormEnhance
				id="import-matev-form"
				action="?/import_matev"
				enctype="multipart/form-data"
				showToast={true}
				submitStateChange={(v) => (submitting = v)}
				onsuccess={async ({ form }) => {
					await invalidate('app:keasramaan');
					onSuccess?.();
					resetForm(form);
					open = false;
				}}
			>
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
							>Maksimal 2MB. Pastikan kolom Matev, Indikator, dan Tujuan Pembelajaran tersedia.</span
						>
						{#if fileName}
							<span class="label-text-alt text-base-content/60 text-xs"
								>File dipilih: <strong>{fileName}</strong></span
							>
						{/if}
					</label>
				</fieldset>
			</FormEnhance>
		</div>

		<div class="modal-action sticky bottom-0 z-10 shrink-0 pt-2">
			<button
				type="button"
				class="btn btn-soft shadow-none mr-auto"
				onclick={handleClose}
				disabled={submitting}>Batal</button
			>
			<button
				type="submit"
				form="import-matev-form"
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
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>
