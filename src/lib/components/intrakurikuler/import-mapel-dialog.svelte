<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { invalidate } from '$app/navigation';

	interface Props {
		open?: boolean;
		onSuccess?: () => void;
		adaDataDapodik?: boolean;
	}

	let { open = $bindable(false), onSuccess, adaDataDapodik = false }: Props = $props();

	const fileInputId = 'import-mapel-file';
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
		<h3 class="mb-3 shrink-0 text-lg font-bold">Impor Mata Pelajaran</h3>

		<div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-1">
			{#if adaDataDapodik}
				<div role="alert" class="alert alert-warning alert-soft">
					<Icon name="alert" />
					<span class="text-sm">
						Terdeteksi mata pelajaran dari dapodik. Hati-hati dalam mengimpor mapel, jika ditemukan
						mapel yang tidak sesuai dengan kriteria dapodik akan menyebabkan gagal kirim ke dapodik
					</span>
				</div>
			{/if}
			<p class="text-base-content/70 text-sm">
				Unggah file Excel (.xlsx) sesuai format di bawah. Baris kosong akan diabaikan. <br />Jenis
				terdiri atas: wajib, pilihan, dan mulok.
			</p>

			<div class="overflow-auto rounded-lg text-sm">
				<table class="table-sm table-compact table-zebra table w-full border-collapse">
					<thead class="bg-base-300">
						<tr class="text-sm font-semibold">
							<th class="pl-2">Mata Pelajaran</th>
							<th>Kode</th>
							<th>Jenis</th>
							<th>KKM</th>
							<th>Lingkup Materi</th>
							<th>Tujuan Pembelajaran</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td class="pl-2 font-medium">Mapel 1</td>
							<td class="font-mono">MP001</td>
							<td>wajib</td>
							<td>70</td>
							<td>Lingkup A</td>
							<td>Tujuan A</td>
						</tr>
						<tr>
							<td></td>
							<td></td>
							<td></td>
							<td></td>
							<td></td>
							<td>Tujuan B</td>
						</tr>
						<tr>
							<td class="pl-2 font-medium">Mapel 2</td>
							<td class="font-mono">MP002</td>
							<td>pilihan</td>
							<td>70</td>
							<td>Lingkup 1</td>
							<td>Tujuan 1</td>
						</tr>
						<tr>
							<td></td>
							<td></td>
							<td></td>
							<td></td>
							<td></td>
							<td>Tujuan 2</td>
						</tr>
					</tbody>
				</table>
			</div>

			<FormEnhance
				id="import-mapel-form"
				action="?/import_mapel"
				enctype="multipart/form-data"
				showToast={true}
				submitStateChange={(v) => (submitting = v)}
				onsuccess={async ({ form }) => {
					await Promise.all([invalidate('app:mapel'), invalidate('app:asesmen-formatif')]);
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
							>Maksimal 2MB. Pastikan kolom Nama, Kode (opsional), Jenis
							(wajib/pilihan/mulok/kejuruan), dan KKM tersedia.</span
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
				form="import-mapel-form"
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
