<script lang="ts">
	import { page } from '$app/state';
	import Icon from './icon.svelte';
	import TaskActiveList from './tasks/task-active-list.svelte';
	import TaskCompletedList from './tasks/task-completed-list.svelte';
	import TaskHeader from './tasks/task-header.svelte';
	import {
		createTask,
		deleteTasks,
		listTasks,
		splitTaskBuckets,
		updateTaskStatus
	} from './tasks/task-service';
	import type { TaskRecord } from './tasks/types';

	let { variant = 'sidebar' }: { variant?: 'sidebar' | 'modal' } = $props();

	const wrapperClass = $derived(
		variant === 'sidebar'
			? 'card bg-base-100 mb-4 min-w-70 max-w-70 shadow-md rounded-box'
			: 'card bg-base-100 shadow-md w-full'
	);

	const isSidebar = $derived(variant === 'sidebar');

	const listContainerClass = $derived(
		variant === 'sidebar'
			? 'flex flex-col max-h-60 min-h-60 overflow-y-auto'
			: 'flex flex-col max-h-[60vh] overflow-y-auto'
	);

	const kelasAktifId = $derived(page.data.kelasAktif?.id ?? null);
	const kelasLabel = $derived.by(() => {
		const kelas = page.data.kelasAktif ?? null;
		if (!kelas) return null;
		return kelas.fase ? `${kelas.nama} - ${kelas.fase}` : kelas.nama;
	});

	let activeTasks = $state<TaskRecord[]>([]);
	let completedTasks = $state<TaskRecord[]>([]);
	let isAdding = $state(false);
	let newTaskTitle = $state('');
	let isLoading = $state(false);
	let hasLoaded = $state(false);
	let isProcessing = $state(false);
	let errorMessage = $state('');
	let previousKelasId = $state<number | null>(null);
	let sidebarOpen = $state(true);
	let activeListRef = $state<{ focusInput: () => Promise<void> | void } | null>(null);

	const showInitialSpinner = $derived(isLoading && !hasLoaded);
	const hasActiveTasks = $derived(Boolean(activeTasks.length));
	const hasCompletedTasks = $derived(Boolean(completedTasks.length));
	const hasAnyTasks = $derived(hasActiveTasks || hasCompletedTasks);
	const canManageTasks = $derived(Boolean(kelasAktifId));
	const hasAnyTasksLoaded = $derived(canManageTasks && hasLoaded);
	const showEmptyState = $derived(hasAnyTasksLoaded && !isAdding && !hasActiveTasks);
	const showNoClass = $derived(!canManageTasks);

	const resetBuckets = () => {
		activeTasks = [];
		completedTasks = [];
	};

	const resetInput = () => {
		newTaskTitle = '';
		isAdding = false;
	};

	const assignBuckets = (tasks: TaskRecord[]) => {
		const { active, completed } = splitTaskBuckets(tasks);
		activeTasks = active;
		completedTasks = completed;
	};

	const ensureKelasAvailable = () => {
		if (!kelasAktifId) {
			errorMessage = 'Pilih kelas untuk mengelola tugas.';
			return false;
		}
		return true;
	};

	const loadTasks = async ({
		kelasId = kelasAktifId,
		showSpinner = false
	}: { kelasId?: number | null; showSpinner?: boolean } = {}) => {
		const targetKelasId = kelasId ?? null;
		if (!targetKelasId) {
			resetBuckets();
			hasLoaded = false;
			isLoading = false;
			return;
		}
		if (showSpinner) isLoading = true;
		errorMessage = '';
		try {
			const tasks = await listTasks(targetKelasId);
			if (kelasAktifId !== targetKelasId) return;
			assignBuckets(tasks);
		} catch (error) {
			console.error(error);
			if (kelasAktifId !== targetKelasId) return;
			resetBuckets();
			errorMessage = error instanceof Error ? error.message : 'Gagal memuat tugas.';
		} finally {
			if (kelasAktifId === targetKelasId) {
				hasLoaded = true;
				isLoading = false;
			}
		}
	};

	$effect(() => {
		if (kelasAktifId === previousKelasId) return;
		previousKelasId = kelasAktifId;
		resetInput();
		if (!kelasAktifId) {
			resetBuckets();
			hasLoaded = false;
			isLoading = false;
			errorMessage = '';
			return;
		}
		hasLoaded = false;
		void loadTasks({ kelasId: kelasAktifId, showSpinner: true });
	});

	const toggleAddTask = async () => {
		if (isProcessing) return;
		if (isAdding) {
			resetInput();
			return;
		}
		if (!ensureKelasAvailable()) return;
		isAdding = true;
		await activeListRef?.focusInput();
	};

	const saveTask = async () => {
		const title = newTaskTitle.trim();
		if (!title || isProcessing) return;
		if (!ensureKelasAvailable()) return;
		const kelasId = kelasAktifId!;
		isProcessing = true;
		errorMessage = '';
		try {
			await createTask(kelasId, title);
			resetInput();
			await loadTasks({ kelasId, showSpinner: false });
		} catch (error) {
			console.error(error);
			errorMessage = error instanceof Error ? error.message : 'Gagal menyimpan tugas.';
		} finally {
			isProcessing = false;
		}
	};

	const updateTask = async (taskId: number, status: 'active' | 'completed') => {
		if (isProcessing) return;
		if (!ensureKelasAvailable()) return;
		const kelasId = kelasAktifId!;
		isProcessing = true;
		errorMessage = '';
		try {
			await updateTaskStatus(kelasId, taskId, status);
			await loadTasks({ kelasId, showSpinner: false });
		} catch (error) {
			console.error(error);
			errorMessage = error instanceof Error ? error.message : 'Gagal memperbarui tugas.';
		} finally {
			isProcessing = false;
		}
	};

	const moveToCompleted = (taskId: number) => {
		void updateTask(taskId, 'completed');
	};

	const moveToActive = (taskId: number) => {
		void updateTask(taskId, 'active');
	};

	const removeTasks = async (payload: { id?: number; scope?: 'completed' | 'all' }) => {
		if (isProcessing) return;
		if (!ensureKelasAvailable()) return;
		const kelasId = kelasAktifId!;
		isProcessing = true;
		errorMessage = '';
		try {
			await deleteTasks(kelasId, payload);
			await loadTasks({ kelasId, showSpinner: false });
		} catch (error) {
			console.error(error);
			errorMessage = error instanceof Error ? error.message : 'Gagal menghapus tugas.';
		} finally {
			isProcessing = false;
		}
	};

	const removeTask = (taskId: number) => {
		void removeTasks({ id: taskId });
	};

	const clearCompleted = () => {
		if (!hasCompletedTasks) return;
		void removeTasks({ scope: 'completed' });
	};

	const clearAll = () => {
		if (!hasAnyTasks) return;
		void removeTasks({ scope: 'all' });
	};
</script>

{#snippet taskList()}
	{#if errorMessage}
		<div class="px-4 pb-2">
			<div class="alert alert-error flex items-center gap-2 rounded-lg p-3 text-sm">
				<Icon name="error" class="h-4 w-4" />
				<span>{errorMessage}</span>
			</div>
		</div>
	{/if}
	<div class={listContainerClass}>
		{#if showInitialSpinner}
			<div class="flex-1 overflow-y-auto">
				<table class="table w-full pl-2">
					<tbody>
						<tr>
							<td colspan="3" class="p-4 text-center text-sm">
								<span class="loading loading-spinner loading-sm" aria-hidden="true"></span>
								<span class="sr-only">Memuat daftar tugas</span>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		{:else if showNoClass}
			<div
				class="text-base-content/60 flex flex-1 items-center justify-center px-4 py-6 text-center text-sm"
			>
				Pilih kelas untuk melihat daftar tugas.
			</div>
		{:else}
			<TaskActiveList
				bind:this={activeListRef}
				tasks={activeTasks}
				{isAdding}
				{isProcessing}
				{newTaskTitle}
				canManage={canManageTasks}
				on:updateTitle={(event: CustomEvent<string>) => (newTaskTitle = event.detail)}
				on:save={() => void saveTask()}
				on:cancel={resetInput}
				on:complete={(event: CustomEvent<number>) => void moveToCompleted(event.detail)}
				on:remove={(event: CustomEvent<number>) => void removeTask(event.detail)}
			/>
			{#if showEmptyState}
				<div
					class="text-base-content/60 flex flex-1 items-center justify-center px-4 py-6 text-center text-sm"
				>
					Belum ada tugas aktif. Tambahkan tugas baru untuk memulai.
				</div>
			{/if}
		{/if}
		<div class="m-2 mt-auto">
			<TaskCompletedList
				tasks={completedTasks}
				{isProcessing}
				{showInitialSpinner}
				canManage={canManageTasks}
				on:restore={(event: CustomEvent<number>) => void moveToActive(event.detail)}
				on:remove={(event: CustomEvent<number>) => void removeTask(event.detail)}
			/>
		</div>
	</div>
{/snippet}

{#if isSidebar}
	<div class="hidden xl:block">
		<div class={wrapperClass}>
			<div class="p-4">
				<div class="flex flex-row items-center gap-2">
					<h2 class="text-sm font-bold">Daftar tugas</h2>
					{#if showInitialSpinner}
						<span class="loading loading-spinner loading-xs text-primary" aria-hidden="true"></span>
					{/if}
					<div class="flex-1"></div>
					<div class="join">
						<button
							type="button"
							class="btn btn-sm join-item btn-soft {isAdding ? 'btn-error' : ''} shadow-none"
							onclick={(e) => {
								e.stopPropagation();
								toggleAddTask();
							}}
							title={isAdding ? 'Batalkan tambah tugas' : 'Tambah tugas'}
							disabled={isProcessing || !canManageTasks}
							aria-disabled={isProcessing || !canManageTasks}
						>
							<Icon name={isAdding ? 'close' : 'plus'} />
						</button>
						<div class="dropdown dropdown-end">
							<div
								tabindex="0"
								role="button"
								title="Tombol hapus"
								class="join-item btn btn-sm shadow-none"
							>
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
										onclick={(e) => {
											e.stopPropagation();
											clearCompleted();
										}}
										disabled={!hasCompletedTasks || isProcessing || !canManageTasks}
									>
										Hapus tugas selesai
									</button>
								</li>
								<li>
									<button
										type="button"
										class="btn btn-ghost btn-sm text-error justify-start"
										onclick={(e) => {
											e.stopPropagation();
											clearAll();
										}}
										disabled={!hasAnyTasks || isProcessing || !canManageTasks}
									>
										Hapus semua tugas
									</button>
								</li>
							</ul>
						</div>
						<button
							type="button"
							class="btn btn-sm join-item px-2 shadow-none"
							onclick={() => (sidebarOpen = !sidebarOpen)}
							title={sidebarOpen ? 'Tutup daftar tugas' : 'Buka daftar tugas'}
						>
							<Icon name={sidebarOpen ? 'up' : 'down'} />
						</button>
					</div>
				</div>
				{#if kelasLabel}
					<p class="text-base-content/60 text-xs">Kelas aktif: {kelasLabel}</p>
				{/if}
			</div>
			{#if sidebarOpen}
				<div class="p-0">
					{@render taskList()}
				</div>
			{/if}
		</div>
	</div>
{:else}
	<div class={wrapperClass}>
		<TaskHeader
			{isAdding}
			{isProcessing}
			canManage={canManageTasks}
			{showInitialSpinner}
			{hasCompletedTasks}
			{hasAnyTasks}
			{kelasLabel}
			on:toggleAdd={toggleAddTask}
			on:clearCompleted={clearCompleted}
			on:clearAll={clearAll}
		/>
		{@render taskList()}
	</div>
{/if}
