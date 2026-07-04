<script lang="ts">
	import { invalidate } from '$app/navigation';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';

	let {
		data
	}: {
		data: {
			ekstrakurikuler: Ekstrakurikuler;
			tujuan: EkstrakurikulerTujuan[];
			tujuanTableReady: boolean;
		};
	} = $props();

	let selectedIds = $state<number[]>([]);
	let selectAllCheckbox: HTMLInputElement | null = null;
	let formState = $state<{ mode: 'create' } | { mode: 'edit'; item: EkstrakurikulerTujuan } | null>(
		null
	);
	let deskripsiInput = $state('');
	let createFormSubmitting = $state(false);
	let editFormSubmitting = $state(false);
	let deleteDialogState = $state<
		| { source: 'bulk'; ids: number[] }
		| { source: 'single'; ids: number[]; item: EkstrakurikulerTujuan }
		| null
	>(null);

	const totalData = $derived.by(() => data.tujuan.length);
	const anySelected = $derived.by(() => selectedIds.length > 0);
	const allSelected = $derived.by(() => totalData > 0 && selectedIds.length === totalData);
	const canManage = $derived.by(() => data.tujuanTableReady);
	const formOpen = $derived.by(() => formState !== null);
	const isCreateMode = $derived.by(() => formState?.mode === 'create');
	const isEditMode = $derived.by(() => formState?.mode === 'edit');
	const isDeleteModalOpen = $derived.by(() => deleteDialogState !== null);
	const deleteModalIds = $derived.by(() => deleteDialogState?.ids ?? []);
	const deleteModalItem = $derived.by(() =>
		deleteDialogState?.source === 'single' ? deleteDialogState.item : null
	);
	const deleteModalTitle = $derived.by(() => {
		if (!deleteDialogState) return 'Hapus tujuan ekstrakurikuler';
		return deleteDialogState.source === 'bulk'
			? `Hapus ${deleteDialogState.ids.length} tujuan ekstrakurikuler?`
			: 'Hapus tujuan ekstrakurikuler?';
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

	function openCreateForm() {
		if (!canManage || formOpen) return;
		deskripsiInput = '';
		createFormSubmitting = false;
		formState = { mode: 'create' };
	}

	function openEditForm(item: EkstrakurikulerTujuan) {
		if (!canManage || (formState && formState.mode === 'create')) return;
		deskripsiInput = item.deskripsi;
		editFormSubmitting = false;
		formState = { mode: 'edit', item };
	}

	function closeForm() {
		if (formState === null && !deskripsiInput) return;
		formState = null;
		deskripsiInput = '';
		createFormSubmitting = false;
		editFormSubmitting = false;
	}

	function openBulkDelete() {
		if (!canManage || !selectedIds.length) return;
		deleteDialogState = { source: 'bulk', ids: [...selectedIds] };
	}

	function openSingleDelete(item: EkstrakurikulerTujuan) {
		if (!canManage) return;
		deleteDialogState = { source: 'single', ids: [item.id], item };
	}

	function closeDeleteModal() {
		if (!deleteDialogState) return;
		deleteDialogState = null;
	}
</script>

<div class="card bg-base-100 rounded-box w-full border border-none p-4 shadow-md">
	<h2 class="mb-6 text-xl font-bold">
		<span class="opacity-50">Ekstrakurikuler:</span>
		{data.ekstrakurikuler.nama}
	</h2>

	<div class="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<button class="btn btn-soft shadow-none" type="button" onclick={() => history.back()}>
			<Icon name="left" />
			Kembali
		</button>
		{#if anySelected}
			<button
				class="btn btn-error btn-soft shadow-none sm:ml-auto sm:max-w-40"
				type="button"
				onclick={openBulkDelete}
				disabled={!anySelected || !canManage}
			>
				<Icon name="del" />
				Hapus TP
			</button>
		{:else}
			<button
				class={`btn btn-soft shadow-none sm:max-w-40 ${isCreateMode ? 'btn-error' : ''}`}
				type="button"
				onclick={isCreateMode ? closeForm : openCreateForm}
				disabled={!canManage || isEditMode}
			>
				<Icon name={isCreateMode ? 'close' : 'plus'} />
				{isCreateMode ? 'Batal' : 'Tambah TP'}
			</button>
		{/if}
	</div>

	{#if !data.tujuanTableReady}
		<div class="alert border-error/60 bg-error/10 text-error-content mb-4 border border-dashed">
			<Icon name="warning" />
			<span>
				Database tujuan ekstrakurikuler belum siap. Jalankan <code>pnpm db:push</code> untuk menerapkan
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
							checked={allSelected}
							onchange={(event) => handleSelectAll(event.currentTarget.checked)}
						/>
					</th>
					<th style="width: 60px; min-width: 40px;">No</th>
					<th class="w-full">Tujuan Pembelajaran</th>
					<th style="width: 160px; min-width: 140px;">Aksi</th>
				</tr>
			</thead>
			<tbody>
				{#if formState?.mode === 'create'}
					{@const createFormId = 'tp-ekstra-create'}
					<tr class="bg-base-200/40">
						<td class="align-top">
							<input type="checkbox" class="checkbox" disabled />
						</td>
						<td class="align-top">1</td>
						<td class="align-top">
							<FormEnhance
								id={createFormId}
								action="?/create"
								onsuccess={({ form }) => {
									form.reset();
									deskripsiInput = '';
									formState = null;
									createFormSubmitting = false;
									invalidate('app:ekstrakurikuler:tp');
								}}
								submitStateChange={(value) => (createFormSubmitting = value)}
							>
								{#snippet children({ submitting, invalid })}
									<input name="ekstrakurikulerId" value={data.ekstrakurikuler.id} hidden />
									<textarea
										class="textarea bg-base-200 dark:bg-base-300 w-full dark:border-none"
										placeholder="Tulis tujuan pembelajaran ekstrakurikuler"
										name="deskripsi"
										bind:value={deskripsiInput}
										required
										disabled={!canManage}
										aria-invalid={invalid}
										aria-busy={submitting}></textarea>
								{/snippet}
							</FormEnhance>
						</td>
						<td class="align-top">
							<div class="flex gap-2">
								<button
									class="btn btn-sm btn-primary shadow-none"
									type="submit"
									form={createFormId}
									disabled={createFormSubmitting || !deskripsiInput.trim()}
									title="Simpan tujuan"
								>
									{#if createFormSubmitting}
										<div class="loading loading-spinner loading-xs"></div>
									{:else}
										<Icon name="save" />
									{/if}
								</button>
							</div>
						</td>
					</tr>
				{/if}

				{#if data.tujuan.length}
					{#each data.tujuan as item, index (item.id)}
						{@const rowNumber = index + 1 + (isCreateMode ? 1 : 0)}
						{#if formState?.mode === 'edit' && formState.item.id === item.id}
							{@const editFormId = `tp-ekstra-edit-${item.id}`}
							<tr class="bg-base-200/40">
								<td class="align-top">
									<input
										type="checkbox"
										class="checkbox"
										disabled
										checked={selectedIds.includes(item.id)}
									/>
								</td>
								<td class="align-top">{rowNumber}</td>
								<td class="align-top">
									<FormEnhance
										id={editFormId}
										action="?/update"
										onsuccess={({ form }) => {
											form.reset();
											deskripsiInput = '';
											formState = null;
											editFormSubmitting = false;
											invalidate('app:ekstrakurikuler:tp');
										}}
										submitStateChange={(value) => (editFormSubmitting = value)}
									>
										{#snippet children({ submitting, invalid })}
											<input name="ekstrakurikulerId" value={data.ekstrakurikuler.id} hidden />
											<input name="id" value={item.id} hidden />
											<textarea
												class="textarea dark:bg-base-300 w-full dark:border-none"
												placeholder="Tulis tujuan pembelajaran ekstrakurikuler"
												name="deskripsi"
												bind:value={deskripsiInput}
												required
												disabled={!canManage}
												aria-invalid={invalid}
												aria-busy={submitting}></textarea>
										{/snippet}
									</FormEnhance>
								</td>
								<td class="align-top">
									<div class="flex gap-2">
										<button
											class="btn btn-sm btn-soft shadow-none"
											type="button"
											title="Batal"
											onclick={closeForm}
										>
											<Icon name="close" />
										</button>
										<button
											class="btn btn-sm btn-primary shadow-none"
											type="submit"
											form={editFormId}
											disabled={editFormSubmitting || !deskripsiInput.trim()}
											title="Simpan perubahan"
										>
											{#if editFormSubmitting}
												<div class="loading loading-spinner loading-xs"></div>
											{:else}
												<Icon name="save" />
											{/if}
										</button>
									</div>
								</td>
							</tr>
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
									<div class="flex gap-2">
										<button
											class="btn btn-sm btn-soft shadow-none"
											type="button"
											title="Edit tujuan"
											disabled={!canManage}
											onclick={() => openEditForm(item)}
										>
											<Icon name="edit" />
										</button>
										<button
											class="btn btn-sm btn-soft btn-error shadow-none"
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
							Belum ada tujuan ekstrakurikuler
						</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>

{#if isDeleteModalOpen}
	<div
		class="modal modal-open"
		tabindex="-1"
		role="dialog"
		aria-modal="true"
		onkeydown={(event) => {
			if (event.key === 'Escape') closeDeleteModal();
		}}
	>
		<dialog class="modal-box relative z-10 max-w-md" open aria-modal="true">
			<Icon name="warning" class="text-error" />
			<h3 class="mt-2 text-lg font-bold">{deleteModalTitle}</h3>
			{#if deleteDialogState?.source === 'single' && deleteModalItem}
				<p class="mt-2 text-sm">
					Yakin ingin menghapus tujuan
					<span class="font-semibold">"{deleteModalItem.deskripsi.slice(0, 80)}"</span>?
				</p>
			{:else}
				<p class="mt-2 text-sm">
					Yakin ingin menghapus {deleteModalIds.length} tujuan ekstrakurikuler terpilih?
				</p>
			{/if}

			<FormEnhance
				action="?/delete"
				onsuccess={() => {
					const ids = deleteDialogState?.ids ?? [];
					if (ids.length) {
						selectedIds = selectedIds.filter((selectedId) => !ids.includes(selectedId));
					}
					closeDeleteModal();
					invalidate('app:ekstrakurikuler:tp');
				}}
			>
				{#snippet children({ submitting })}
					{#each deleteModalIds as id (id)}
						<input name="ids" value={id} hidden />
					{/each}

					<div class="modal-action mt-6 flex gap-2">
						<button class="btn btn-soft shadow-none" type="button" onclick={closeDeleteModal}>
							<Icon name="close" />
							Batal
						</button>
						<button class="btn btn-error shadow-none" disabled={submitting || deleteModalDisabled}>
							{#if submitting}
								<div class="loading loading-spinner"></div>
							{:else}
								<Icon name="del" />
							{/if}
							Hapus
						</button>
					</div>
				{/snippet}
			</FormEnhance>
		</dialog>
		<form method="dialog" class="modal-backdrop">
			<button
				type="submit"
				onclick={(event) => {
					event.preventDefault();
					closeDeleteModal();
				}}
			>
				tutup
			</button>
		</form>
	</div>
{/if}
