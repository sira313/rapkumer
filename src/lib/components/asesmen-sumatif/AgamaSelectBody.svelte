<script lang="ts">
	import { onMount } from 'svelte';
	import { agamaVariantOptions } from '$lib/statics';

	interface Props {
		// callback supplied by caller to retrieve current selection
		setGetter?: (fn: () => string) => void;
		options?: { key: string; label: string; name: string }[];
	}

	let { setGetter, options = agamaVariantOptions }: Props = $props();

	let selectedKey = $state(options?.[0]?.key ?? 'islam');
	// unique id for label association
	let selectId = $state('agama-select-' + Math.random().toString(36).slice(2, 9));

	onMount(() => {
		if (typeof setGetter === 'function') {
			// expose a getter closure that reads the reactive selectedKey
			setGetter(() => selectedKey);
		}
	});
</script>

<fieldset class="fieldset">
	<legend class="fieldset-legend">Pilih Agama</legend>

	<select
		id={selectId}
		class="select dark:bg-base-200 w-full truncate dark:border-none"
		bind:value={selectedKey}
		aria-label="Pilih agama"
	>
		{#each options as opt (opt.key)}
			<option value={opt.key}>{opt.label}</option>
		{/each}
	</select>

	<p class="label">
		Contoh nama mapel di file: <strong>{options.find((o) => o.key === selectedKey)?.name}</strong>
	</p>
</fieldset>
