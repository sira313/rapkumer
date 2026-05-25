<script lang="ts">
	import { invalidate } from '$app/navigation';
	import Icon from '$lib/components/icon.svelte';
	import TujuanPembelajaranToolbar from '$lib/components/keasramaan/TujuanPembelajaranToolbar.svelte';
	import TujuanPembelajaranCreateRow from '$lib/components/keasramaan/TujuanPembelajaranCreateRow.svelte';
	import TujuanPembelajaranEditRow from '$lib/components/keasramaan/TujuanPembelajaranEditRow.svelte';
	import TujuanPembelajaranDeleteModal from '$lib/components/keasramaan/TujuanPembelajaranDeleteModal.svelte';

	let {
		data
	}: {
		data: {
			indikator: {
				id: number;
				deskripsi: string;
				keasramaan: {
					id: number;
					nama: string;
				};
			};
			tujuan: Array<{
				id: number;
				deskripsi: string;
			}>;
			tujuanTableReady: boolean;
		};
	} = $props();

	let selectedIds = $state<number[]>([]);
	let selectAllCheckbox = $state<HTMLInputElement | null>(null);
	let formState = $state<
		{ mode: 'create' } | { mode: 'edit'; item: (typeof data.tujuan)[0] } | null
	>(null);
	let deskripsiInput = $state('');
	let deleteDialogState = $state<
		| { source: 'bulk'; ids: number[] }
		| { source: 'single'; ids: number[]; item: (typeof data.tujuan)[0] }
		| null
	>(null);

	const totalData = $derived.by(() => data.tujuan.length);
	const anySelected = $derived.by(() => selectedIds.length > 0);
	const canManage = $derived.by(() => data.tujuanTableReady);
	// formOpen removed (unused)
	const isCreateMode = $derived.by(() => formState?.mode === 'create');
	const isEditMode = $derived.by(() => formState?.mode === 'edit');
	const editingItemId = $derived.by(() => (formState?.mode === 'edit' ? formState.item.id : null));
	const isDeleteModalOpen = $derived.by(() => deleteDialogState !== null);
	const deleteModalIds = $derived.by(() => deleteDialogState?.ids ?? []);
	const deleteModalItem = $derived.by(() =>
		deleteDialogState?.source === 'single' ? deleteDialogState.item : null
	);
	const deleteModalTitle = $derived.by(() => {
		if (!deleteDialogState) return 'Hapus tujuan pembelajaran keasramaan';
		return deleteDialogState.source === 'bulk'
			? `Hapus ${deleteDialogState.ids.length} tujuan pembelajaran?`
			: 'Hapus tujuan pembelajaran keasramaan?';
	});
	const deleteModalDisabled = $derived.by(() => deleteModalIds.length === 0 || !canManage);

	$effect(() => {
		if (selectAllCheckbox) {
			selectAllCheckbox.indeterminate = selectedIds.length > 0 && selectedIds.length < totalData;
		}
	});

	$effect(() => {
		if (!selectedIds.length) return;
		const existingIds = new Set(data.tujuan.map((item) => item.id));
		const filtered = selectedIds.filter((id) => existingIds.has(id));
		if (filtered.length !== selectedIds.length) {
			selectedIds = filtered;
		}
	});

	$effect(() => {
		if (data.tujuanTableReady) return;
		if (selectedIds.length) selectedIds = [];
		if (formState) formState = null;
		if (deskripsiInput) deskripsiInput = '';
		if (deleteDialogState) deleteDialogState = null;
	});

	function toggleRowSelection(id: number, checked: boolean) {
		selectedIds = checked
			? [...new Set([...selectedIds, id])]
			: selectedIds.filter((selectedId) => selectedId !== id);
	}

	function handleSelectAll(checked: boolean) {
		selectedIds = checked ? data.tujuan.map((item) => item.id) : [];
	}

	function toggleCreateForm() {
		if (!canManage) return;
		if (isCreateMode) {
			formState = null;
			deskripsiInput = '';
		} else if (!isEditMode) {
			deskripsiInput = '';
			formState = { mode: 'create' };
		}
	}

	function openEditForm(item: (typeof data.tujuan)[0]) {
		if (!canManage || isEditMode) return;
		deskripsiInput = item.deskripsi;
		formState = { mode: 'edit', item };
	}

	function closeForm() {
		formState = null;
		deskripsiInput = '';
	}

	function openBulkDelete() {
		if (!canManage || !selectedIds.length) return;
		deleteDialogState = { source: 'bulk', ids: [...selectedIds] };
	}

	function openSingleDelete(item: (typeof data.tujuan)[0]) {
		if (!canManage) return;
		deleteDialogState = { source: 'single', ids: [item.id], item };
	}

	function closeDeleteModal() {
		deleteDialogState = null;
		selectedIds = selectedIds.filter((id) => !deleteModalIds.includes(id));
	}

	function handleCreateSuccess() {
		formState = null;
		deskripsiInput = '';
		invalidate('app:keasramaan:tp');
	}

	function handleEditSuccess() {
		formState = null;
		deskripsiInput = '';
		invalidate('app:keasramaan:tp');
	}

	function handleDeleteSuccess() {
		closeDeleteModal();
		invalidate('app:keasramaan:tp');
	}
</script>

<div class="card bg-base-100 rounded-box w-full border border-none p-4 shadow-md">
	<!-- Breadcrumb -->
	<div class="mb-4 text-sm opacity-70">
		<span>{data.indikator.keasramaan.nama}</span>
		<span class="mx-2">/</span>
		<span class="font-semibold">{data.indikator.deskripsi}</span>
	</div>

	<h2 class="mb-6 text-xl font-bold">
		<span class="opacity-50">Indikator:</span>
		{data.indikator.deskripsi}
	</h2>

	<TujuanPembelajaranToolbar
		{isCreateMode}
		{isEditMode}
		{anySelected}
		{canManage}
		onToggleCreateForm={toggleCreateForm}
		onOpenBulkDelete={openBulkDelete}
	/>

	{#if !data.tujuanTableReady}
		<div class="alert border-error/60 bg-error/10 text-error-content mb-4 border border-dashed">
			<Icon name="warning" />
			<span>
				Database tujuan pembelajaran keasramaan belum siap. Jalankan <code>pnpm db:push</code> untuk menerapkan
				migrasi terbaru.
			</span>
		</div>
	{/if}

	<div class="bg-base-100 dark:bg-base-200 overflow-x-auto rounded-md shadow-md dark:shadow-none">
		<table class="border-base-200 table min-w-[720px] border dark:border-none">
			<thead>
				<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
					<th style="width: 50px; min-width: 40px;">
						<input
							type="checkbox"
							class="checkbox"
							bind:this={selectAllCheckbox}
							disabled={!data.tujuan.length || !canManage}
							checked={data.tujuan.length > 0 && selectedIds.length === data.tujuan.length}
							onchange={(event) => handleSelectAll(event.currentTarget.checked)}
						/>
					</th>
					<th style="width: 60px; min-width: 40px;">No</th>
					<th class="w-full">Tujuan Pembelajaran</th>
					<th style="width: 160px; min-width: 140px;">Aksi</th>
				</tr>
			</thead>
			<tbody>
				{#if isCreateMode}
					<TujuanPembelajaranCreateRow
						indikatorId={data.indikator.id}
						{canManage}
						onSuccess={handleCreateSuccess}
					/>
				{/if}

				{#if data.tujuan.length}
					{#each data.tujuan as item, index (item.id)}
						{@const rowNumber = index + 1 + (isCreateMode ? 1 : 0)}
						{#if isEditMode && editingItemId === item.id}
							<TujuanPembelajaranEditRow
								{item}
								indikatorId={data.indikator.id}
								{deskripsiInput}
								{canManage}
								onSuccess={handleEditSuccess}
								onCancel={closeForm}
							/>
						{:else}
							<tr>
								<td class="align-top">
									<input
										type="checkbox"
										class="checkbox"
										checked={selectedIds.includes(item.id)}
										disabled={!canManage}
										onchange={(event) => toggleRowSelection(item.id, event.currentTarget.checked)}
									/>
								</td>
								<td class="align-top">{rowNumber}</td>
								<td class="align-top">
									{item.deskripsi}
								</td>
								<td class="align-top">
									<div class="flex">
										<button
											class="btn btn-sm btn-soft rounded-r-none shadow-none"
											type="button"
											title="Edit tujuan"
											disabled={!canManage}
											onclick={() => openEditForm(item)}
										>
											<Icon name="edit" />
										</button>
										<button
											class="btn btn-sm btn-soft btn-error rounded-l-none shadow-none"
											type="button"
											title="Hapus tujuan"
											disabled={!canManage}
											onclick={() => openSingleDelete(item)}
										>
											<Icon name="del" />
										</button>
									</div>
								</td>
							</tr>
						{/if}
					{/each}
				{:else}
					<tr>
						<td class="py-6 text-center italic opacity-60" colspan="4">
							Belum ada tujuan pembelajaran
						</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>

<TujuanPembelajaranDeleteModal
	{deleteModalTitle}
	{deleteModalItem}
	{deleteModalIds}
	{deleteModalDisabled}
	{isDeleteModalOpen}
	onClose={() => {
		const ids = deleteModalIds;
		if (ids.length) {
			selectedIds = selectedIds.filter((selectedId) => !ids.includes(selectedId));
		}
		closeDeleteModal();
		handleDeleteSuccess();
	}}
/>
