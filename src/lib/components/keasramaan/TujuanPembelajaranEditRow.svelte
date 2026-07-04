<script lang="ts">
	/* eslint-disable svelte/prefer-writable-derived */
	import FormEnhance from '../form-enhance.svelte';
	import Icon from '../icon.svelte';

	let {
		item,
		indikatorId,
		deskripsiInput,
		canManage,
		onSuccess,
		onCancel
	}: {
		item: { id: number };
		indikatorId: number;
		deskripsiInput: string;
		canManage: boolean;
		onSuccess: () => void;
		onCancel: () => void;
	} = $props();

	let submitting = $state(false);
	let localDeskripsi = $state(deskripsiInput);

	$effect(() => {
		localDeskripsi = deskripsiInput;
	});
</script>

<tr class="bg-base-200/40">
	<td class="align-top">
		<input type="checkbox" class="checkbox" disabled />
	</td>
	<td class="align-top">1</td>
	<td class="align-top">
		<FormEnhance
			id={`tp-keasramaan-edit-${item.id}`}
			action="?/update"
			onsuccess={() => {
				localDeskripsi = '';
				submitting = false;
				onSuccess();
			}}
			submitStateChange={(value) => (submitting = value)}
		>
			{#snippet children({ submitting: formSubmitting, invalid })}
				<input name="indikatorId" value={indikatorId} hidden />
				<input name="id" value={item.id} hidden />
				<textarea
					class="textarea dark:bg-base-300 w-full dark:border-none"
					placeholder="Tulis tujuan pembelajaran keasramaan"
					name="deskripsi"
					bind:value={localDeskripsi}
					required
					disabled={!canManage}
					aria-invalid={invalid}
					aria-busy={formSubmitting}></textarea>
			{/snippet}
		</FormEnhance>
	</td>
	<td class="align-top">
		<div class="flex">
			<button
				class="btn btn-sm btn-soft rounded-r-none shadow-none"
				type="button"
				title="Batal"
				onclick={onCancel}
			>
				<Icon name="close" />
			</button>
			<button
				class="btn btn-sm btn-primary rounded-l-none shadow-none"
				type="submit"
				form={`tp-keasramaan-edit-${item.id}`}
				disabled={submitting || !localDeskripsi.trim()}
				title="Simpan perubahan"
			>
				{#if submitting}
					<div class="loading loading-spinner loading-xs"></div>
				{:else}
					<Icon name="save" />
				{/if}
			</button>
		</div>
	</td>
</tr>
