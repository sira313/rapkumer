<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '../icon.svelte';

	let {
		isCreateMode,
		isEditMode,
		anySelected,
		canManage,
		onToggleCreateForm,
		onOpenBulkDelete,
		children
	}: {
		isCreateMode: boolean;
		isEditMode: boolean;
		anySelected: boolean;
		canManage: boolean;
		onToggleCreateForm: () => void;
		onOpenBulkDelete: () => void;
		children?: Snippet;
	} = $props();
</script>

<div class="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
	<div class="grid grid-cols-2 gap-2 sm:contents">
		<button
			class="btn btn-soft w-full shadow-none sm:w-auto"
			type="button"
			onclick={() => history.back()}
		>
			<Icon name="left" />
			Kembali
		</button>
		{#if anySelected}
			<button
				class="btn btn-error btn-soft w-full shadow-none sm:ml-auto sm:max-w-40"
				type="button"
				onclick={onOpenBulkDelete}
				disabled={!anySelected || !canManage}
			>
				<Icon name="del" />
				Hapus TP
			</button>
		{:else}
			<button
				class={`btn btn-soft shadow-none sm:ml-auto ${isCreateMode ? 'btn-error' : ''}`}
				type="button"
				onclick={onToggleCreateForm}
				disabled={!canManage || isEditMode}
			>
				<Icon name={isCreateMode ? 'close' : 'plus'} />
				{isCreateMode ? 'Batal' : 'Tambah TP'}
			</button>
		{/if}
	</div>

	{#if children}
		{@render children()}
	{/if}
</div>
