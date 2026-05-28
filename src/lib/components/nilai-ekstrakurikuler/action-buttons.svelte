<script lang="ts">
	import Icon from '$lib/components/icon.svelte';

	type Props = {
		isDownloading?: boolean;
		isImporting?: boolean;
		disabled?: boolean;
		onDownload?: () => void;
		onImport?: () => void;
	};

	let {
		isDownloading = false,
		isImporting = false,
		disabled = false,
		onDownload,
		onImport
	}: Props = $props();
</script>

<div class="mb-4 flex flex-col justify-between gap-2 sm:flex-row">
	<button
		type="button"
		class="btn btn-soft shadow-none"
		onclick={onDownload}
		disabled={isDownloading || disabled}
	>
		{#if isDownloading}
			<span class="loading loading-spinner loading-sm"></span>
		{:else}
			<Icon name="download" />
		{/if}
		Download template
	</button>
	<button
		type="button"
		class="btn btn-soft shadow-none"
		onclick={onImport}
		disabled={isImporting || disabled}
	>
		{#if isImporting}
			<span class="loading loading-spinner loading-sm"></span>
		{:else}
			<Icon name="import" />
		{/if}
		Import nilai
	</button>
</div>
