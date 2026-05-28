<script lang="ts">
	import { onMount } from 'svelte';

	type Props = {
		setUploader?: (fn: () => File | null) => void;
	};

	let { setUploader }: Props = $props();

	let fileInput: HTMLInputElement | undefined;
	let selectedFile: File | undefined;

	function onFileChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			selectedFile = file;
		}
	}

	onMount(() => {
		if (setUploader && typeof setUploader === 'function') {
			setUploader(() => selectedFile ?? null);
		}
	});

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
				bind:this={fileInput}
				onchange={onFileChange}
				aria-label="Pilih file Excel"
			/>
			<p class="label">Pilih file Excel (.xlsx) sesuai format "Download Template"</p>
		</fieldset>
	</div>
</div>
