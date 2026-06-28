<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import type { TaskRecord } from './types';
	import { createEventDispatcher, tick } from 'svelte';

	const emit = createEventDispatcher<{
		updateTitle: string;
		save: void;
		cancel: void;
		complete: number;
		remove: number;
	}>();

	let {
		tasks = [],
		isAdding = false,
		isProcessing = false,
		newTaskTitle = '',
		canManage = true
	} = $props<{
		tasks?: TaskRecord[];
		isAdding?: boolean;
		isProcessing?: boolean;
		newTaskTitle?: string;
		canManage?: boolean;
	}>();

	let newTaskInput = $state<HTMLInputElement | null>(null);

	export async function focusInput() {
		await tick();
		newTaskInput?.focus();
	}

	const handleInput = (event: Event) => {
		const target = event.currentTarget as HTMLInputElement | null;
		emit('updateTitle', target?.value ?? '');
	};

	const handleKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			emit('save');
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			emit('cancel');
		}
	};
</script>

{#if isAdding || tasks.length}
	<div class="flex-1 overflow-y-auto">
		<table class="table w-full pl-2">
			<tbody>
				{#if isAdding}
					<tr class="border-base-300 dark:border-base-200">
						<td class="p-2" colspan="3">
							<div class="join w-full">
								<input
									bind:this={newTaskInput}
									value={newTaskTitle}
									placeholder="Nama tugas"
									class="input input-sm join-item input-bordered dark:bg-base-300 flex-1 dark:border-none"
									oninput={handleInput}
									onkeydown={handleKeydown}
									autocomplete="off"
									aria-label="Nama tugas baru"
								/>
								<button
									type="button"
									class="btn btn-primary join-item btn-sm shadow-none"
									onclick={() => emit('save')}
									title="Simpan tugas"
									disabled={isProcessing || !newTaskTitle.trim() || !canManage}
									aria-disabled={isProcessing || !newTaskTitle.trim() || !canManage}
								>
									<Icon name="save" />
								</button>
							</div>
						</td>
					</tr>
				{/if}
				{#each tasks as task (task.id)}
					<tr class="border-base-300 dark:border-base-200">
						<th class="w-0 align-middle">
							<input
								type="checkbox"
								class="checkbox checkbox-sm"
								onchange={() => emit('complete', task.id)}
								title="Tandai selesai"
								disabled={isProcessing || !canManage}
								aria-disabled={isProcessing || !canManage}
							/>
						</th>
						<td class="p-2"><p class="flex-1">{task.title}</p></td>
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
{/if}
