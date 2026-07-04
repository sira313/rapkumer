<script lang="ts">
	import { capitalizeSentence } from './utils';
	import type { KeasramaanOption } from './types';

	type Props = {
		keasramaanList: KeasramaanOption[];
		selectedValue: string;
		disabled?: boolean;
		onChange?: (value: string) => void;
	};

	let { keasramaanList, selectedValue, disabled = false, onChange }: Props = $props();

	function handleChange(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		onChange?.(value);
	}
</script>

<label class="w-full md:max-w-80">
	<span class="sr-only">Pilih Matev Keasramaan</span>
	<select
		class="select bg-base-200 w-full truncate dark:border-none"
		title="Pilih Matev Keasramaan"
		bind:value={selectedValue}
		onchange={handleChange}
		{disabled}
	>
		{#if keasramaanList.length === 0}
			<option value="">Belum ada Matev Keasramaan</option>
		{:else}
			<option value="" disabled selected={selectedValue === ''}> Pilih Matev </option>
			{#each keasramaanList as item (item.id)}
				<option value={String(item.id)}>{capitalizeSentence(item.nama)}</option>
			{/each}
		{/if}
	</select>
</label>
