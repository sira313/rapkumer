<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { createEventDispatcher } from 'svelte';

	const emit = createEventDispatcher<{
		toggleAdd: void;
		clearCompleted: void;
		clearAll: void;
	}>();

	let {
		isAdding = false,
		isProcessing = false,
		canManage = true,
		showInitialSpinner = false,
		hasCompletedTasks = false,
		hasAnyTasks = false,
		kelasLabel = null
	} = $props<{
		isAdding?: boolean;
		isProcessing?: boolean;
		canManage?: boolean;
		showInitialSpinner?: boolean;
		hasCompletedTasks?: boolean;
		hasAnyTasks?: boolean;
		kelasLabel?: string | null;
	}>();
</script>

<div class="flex flex-col gap-1 p-4">
	<div class="flex flex-row items-center">
		<h2 class="text-sm font-bold">Daftar tugas</h2>
		{#if showInitialSpinner}
			<span class="loading loading-spinner loading-xs text-primary ml-2" aria-hidden="true"></span>
		{/if}
		<div class="flex-1"></div>
		<div class="join">
			<button
				type="button"
				class="btn btn-sm join-item shadow-none"
				onclick={() => emit('toggleAdd')}
				title={isAdding ? 'Batalkan tambah tugas' : 'Tambah tugas'}
				disabled={isProcessing || !canManage}
				aria-disabled={isProcessing || !canManage}
			>
				<Icon name={isAdding ? 'close' : 'plus'} />
			</button>
			<div class="dropdown dropdown-end">
				<div tabindex="0" role="button" title="Tombol hapus" class="join-item btn btn-sm shadow-none">
					<Icon name="del" class="text-error" />
					<Icon name="collapse-all" class="text-error" />
				</div>
				<ul
					class="border-base-300 menu dropdown-content bg-base-100 rounded-box z-1 mt-2 w-43 border p-2 shadow-md"
				>
					<li>
						<button
							type="button"
							class="btn btn-ghost btn-sm justify-start"
							onclick={() => emit('clearCompleted')}
							disabled={!hasCompletedTasks || isProcessing || !canManage}
						>
							Hapus tugas selesai
						</button>
					</li>
					<li>
						<button
							type="button"
							class="btn btn-ghost btn-sm text-error justify-start"
							onclick={() => emit('clearAll')}
							disabled={!hasAnyTasks || isProcessing || !canManage}
						>
							Hapus semua tugas
						</button>
					</li>
				</ul>
			</div>
		</div>
	</div>
	{#if kelasLabel}
		<p class="text-base-content/60 text-xs">Kelas aktif: {kelasLabel}</p>
	{/if}
</div>
