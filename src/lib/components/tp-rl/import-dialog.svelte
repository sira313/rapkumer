<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';

	interface Props {
		onCancel: () => void;
		onSuccess: (data?: Record<string, unknown>) => void;
	}

	let { onCancel, onSuccess }: Props = $props();

	const fileInputId = 'tp-rl-import-file';
	let fileInput: HTMLInputElement | null = null;
	let hasFile = $state(false);
	let fileName = $state('');
	let submitting = $state(false);

	function handleFileChange(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const file = target.files?.[0];
		hasFile = Boolean(file);
		fileName = file ? file.name : '';
	}

	function resetForm(form?: HTMLFormElement | null) {
		hasFile = false;
		fileName = '';
		if (fileInput) {
			fileInput.value = '';
		}
		form?.reset();
	}

	function handleCancel() {
		resetForm();
		onCancel();
	}
</script>

<dialog class="modal" open onclose={handleCancel}>
	<div class="modal-box max-w-2xl">
		<h3 class="mb-2 text-xl font-bold">Import Tujuan Pembelajaran</h3>
		<p class="text-base-content/70 mb-4 text-sm">
			Unggah file Excel berekstensi <code>.xlsx</code> dengan format seperti contoh berikut. Baris kosong
			akan diabaikan otomatis.
		</p>

		<div
			class="bg-base-200 border-base-300 dark:bg-base-300 mb-4 overflow-x-auto rounded-lg border p-3 text-sm"
		>
			<table class="table-compact table">
				<thead>
					<tr>
						<th class="bg-base-300 dark:bg-base-200">Lingkup Materi</th>
						<th class="bg-base-300 dark:bg-base-200">Tujuan Pembelajaran</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>Lingkup Materi 1</td>
						<td>Tujuan 1</td>
					</tr>
					<tr>
						<td></td>
						<td>Tujuan 2</td>
					</tr>
					<tr>
						<td>Lingkup Materi 2</td>
						<td>Tujuan A</td>
					</tr>
					<tr>
						<td></td>
						<td>Tujuan B</td>
					</tr>
				</tbody>
			</table>
		</div>

		<FormEnhance
			id="form-import-tp"
			action="?/import"
			enctype="multipart/form-data"
			showToast={true}
			onsuccess={({ form, data }) => {
				onSuccess(data);
				resetForm(form);
			}}
			submitStateChange={(v) => (submitting = v)}
		>
			{#snippet children()}
				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Pilih File Excel (.xlsx)</legend>
					<input
						type="file"
						name="file"
						accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
						class="file-input file-input-ghost"
						id={fileInputId}
						required
						onchange={handleFileChange}
						bind:this={fileInput}
					/>
					<label class="label" for={fileInputId}>
						<span class="label-text-alt text-base-content/60 text-xs text-wrap">
							Maksimal 2MB. Pastikan kolom <strong>Lingkup Materi</strong> dan
							<strong>Tujuan Pembelajaran</strong> tersedia.
						</span>
						{#if fileName}
							<span class="label-text-alt text-base-content/60 text-xs">
								File dipilih: <span class="text-base-content font-semibold">{fileName}</span>
							</span>
						{/if}
					</label>
				</fieldset>
			{/snippet}
		</FormEnhance>

		<div class="modal-action">
			<button
				class="btn btn-soft shadow-none"
				type="button"
				onclick={handleCancel}
				disabled={submitting}
			>
				Batal
			</button>
			<button
				class="btn btn-primary btn-soft shadow-none"
				type="submit"
				form="form-import-tp"
				disabled={submitting || !hasFile}
			>
				{#if submitting}
					<span class="loading loading-spinner"></span>
				{:else}
					<Icon name="import" />
				{/if}
				Import
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button onclick={handleCancel}>close</button>
	</form>
</dialog>
