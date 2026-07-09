<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import type { TaskRecord } from './types';
	import { createEventDispatcher } from 'svelte';

	const emit = createEventDispatcher<{
		restore: number;
		remove: number;
	}>();

	let {
		tasks = [],
		isProcessing = false,
		showInitialSpinner = false,
		canManage = true
	} = $props<{
		tasks?: TaskRecord[];
		isProcessing?: boolean;
		showInitialSpinner?: boolean;
		canManage?: boolean;
	}>();
</script>

<div class="bg-base-300 dark:bg-base-200 collapse-plus collapse mt-6">
	<input type="checkbox" />
	<div class="collapse-title text-sm font-bold">Tugas sudah selesai</div>
	<div class="collapse-content p-0 text-sm">
		<table class="table pl-2">
			<tbody>
				{#if showInitialSpinner}
					<tr>
						<td colspan="3" class="p-4 text-center text-sm">
							<span class="loading loading-spinner loading-sm" aria-hidden="true"></span>
							<span class="sr-only">Memuat tugas selesai</span>
						</td>
					</tr>
				{:else if !tasks.length}
					<tr>
						<td colspan="3" class="text-base-content/60 p-4 text-center text-sm">
							Belum ada tugas yang selesai.
						</td>
					</tr>
				{/if}
				{#each tasks as task (task.id)}
					<tr class="border-base-100">
						<th class="w-0 p-2 align-middle">
							<input
								type="checkbox"
								class="checkbox"
								checked
								onchange={() => emit('restore', task.id)}
								title="Kembalikan ke tugas aktif"
								disabled={isProcessing || !canManage}
								aria-disabled={isProcessing || !canManage}
							/>
						</th>
						<td class="p-2"><p class="flex-1"><s>{task.title}</s></p></td>
						<td class="p-2 text-right">
							<button
								type="button"
								class="btn btn-sm btn-circle btn-ghost"
								title="Hapus tugas"
								onclick={() => emit('remove', task.id)}
								disabled={isProcessing || !canManage}
								aria-disabled={isProcessing || !canManage}
							>
								<Icon name="del" class="text-error" />
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
