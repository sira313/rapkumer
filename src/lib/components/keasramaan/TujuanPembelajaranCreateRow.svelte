<script lang="ts">
	import FormEnhance from '../form-enhance.svelte';
	import Icon from '../icon.svelte';

	let {
		indikatorId,
		canManage,
		onSuccess
	}: {
		indikatorId: number;
		canManage: boolean;
		onSuccess: () => void;
	} = $props();

	let deskripsiInput = $state('');
	let submitting = $state(false);
</script>

<tr class="bg-base-200/40">
	<td class="align-top">
		<input type="checkbox" class="checkbox" disabled />
	</td>
	<td class="align-top">1</td>
	<td class="align-top">
		<FormEnhance
			id="tp-keasramaan-create"
			action="?/create"
			onsuccess={() => {
				deskripsiInput = '';
				submitting = false;
				onSuccess();
			}}
			submitStateChange={(value) => (submitting = value)}
		>
			{#snippet children({ submitting: formSubmitting, invalid })}
				<input name="indikatorId" value={indikatorId} hidden />
				<textarea
					class="textarea bg-base-200 dark:bg-base-300 w-full dark:border-none"
					placeholder="Tulis tujuan pembelajaran keasramaan"
					name="deskripsi"
					bind:value={deskripsiInput}
					required
					disabled={!canManage}
					aria-invalid={invalid}
					aria-busy={formSubmitting}></textarea>
			{/snippet}
		</FormEnhance>
	</td>
	<td class="align-top">
		<div class="flex gap-2">
			<button
				class="btn btn-sm btn-primary shadow-none"
				type="submit"
				form="tp-keasramaan-create"
				disabled={submitting || !deskripsiInput.trim()}
				title="Simpan tujuan"
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
