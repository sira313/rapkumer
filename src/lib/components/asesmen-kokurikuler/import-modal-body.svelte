<script lang="ts">
	type Props = {
		setUploader?: (fn: () => File | null) => void;
	};

	let { setUploader }: Props = $props();

	let selectedFile: File | undefined;

	function onFileChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			selectedFile = file;
		}
	}

	$effect(() => {
		if (setUploader && typeof setUploader === 'function') {
			setUploader(() => selectedFile ?? null);
		}
	});
</script>

<div class="p-2">
	<div class="form-control">
		<fieldset class="fieldset">
			<legend class="fieldset-legend">Import file excel</legend>
			<input
				type="file"
				class="file-input file-input-ghost"
				accept=".xlsx"
				onchange={onFileChange}
				aria-label="Pilih file Excel"
			/>
			<p class="label">Pilih file Excel (.xlsx) sesuai format "Download Template"</p>
		</fieldset>
	</div>
</div>
