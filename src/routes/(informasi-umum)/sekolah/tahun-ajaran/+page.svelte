<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import type { PageData } from './$types';

	type TahunAjaranRow = typeof import('$lib/server/db/schema').tableTahunAjaran.$inferSelect;
	type SemesterRow = typeof import('$lib/server/db/schema').tableSemester.$inferSelect;
	type TahunAjaranItem = TahunAjaranRow & { semester: SemesterRow[]; rombel: number };
	type SekolahSelected = Pick<Sekolah, 'id' | 'nama' | 'npsn' | 'jenjangPendidikan'>;

	const { data } = $props<{ data: PageData }>();
	const selectedSekolahId = data.selectedSekolahId ? String(data.selectedSekolahId) : '';
	const selectedSekolah = (data.selectedSekolah ?? null) as SekolahSelected | null;
	let tahunAjaranState = $state((data.tahunAjaran ?? []) as TahunAjaranItem[]);
	let selectedIdsSet = $state<Set<number>>(new Set());
	let editingId = $state<number | 'new' | null>(null);
	let masterCheckbox: HTMLInputElement | undefined;
	let createFormState = $state({ submitting: false, invalid: true });
	let editFormState = $state({ submitting: false, invalid: true });

	const syncCreateFormState = (submitting: boolean, invalid: boolean) => {
		queueMicrotask(() => {
			if (createFormState.submitting !== submitting || createFormState.invalid !== invalid) {
				createFormState = { submitting, invalid };
			}
		});
		return '';
	};

	const syncEditFormState = (submitting: boolean, invalid: boolean) => {
		queueMicrotask(() => {
			if (editFormState.submitting !== submitting || editFormState.invalid !== invalid) {
				editFormState = { submitting, invalid };
			}
		});
		return '';
	};

	const selectedIds = $derived([...selectedIdsSet]);
	const allSelected = $derived(
		selectedIds.length > 0 && selectedIds.length === tahunAjaranState.length
	);
	const hasSelection = $derived(selectedIds.length > 0);
	const isIndeterminate = $derived(
		selectedIds.length > 0 && selectedIds.length < tahunAjaranState.length
	);

	$effect(() => {
		if (masterCheckbox) masterCheckbox.indeterminate = isIndeterminate;
	});

	const toggleSelect = (id: number) => {
		const next = new Set(selectedIdsSet);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		selectedIdsSet = next;
	};

	const toggleSelectAll = () => {
		if (allSelected) {
			selectedIdsSet = new Set();
		} else {
			selectedIdsSet = new Set(tahunAjaranState.map((item) => item.id));
		}
	};

	const tahunAjaranInit = (item?: TahunAjaranItem | null) => ({
		id: item?.id,
		nama: item?.nama ?? '',
		sekolahId: selectedSekolahId
	});

	type TahunAjaranActionPayload = { tahunAjaran?: TahunAjaranItem[] };

	const applyLatestList = (payload?: TahunAjaranActionPayload) => {
		const next = payload?.tahunAjaran;
		if (next) tahunAjaranState = next;
	};

	const handleCreateRow = () => {
		selectedIdsSet = new Set();
		createFormState = { submitting: false, invalid: true };
		editingId = 'new';
	};

	const handleEditRow = (id: number) => {
		selectedIdsSet = new Set();
		editFormState = { submitting: false, invalid: false };
		editingId = id;
	};

	const cancelInline = () => {
		createFormState = { submitting: false, invalid: true };
		editFormState = { submitting: false, invalid: true };
		editingId = null;
	};

	const handleUpdateSuccess = ({ data }: { data?: TahunAjaranActionPayload }) => {
		applyLatestList(data);
		selectedIdsSet = new Set();
		editFormState = { submitting: false, invalid: true };
		editingId = null;
	};

	const handleCreateSuccess = ({ data }: { data?: TahunAjaranActionPayload }) => {
		applyLatestList(data);
		selectedIdsSet = new Set();
		createFormState = { submitting: false, invalid: true };
		editingId = null;
	};

	const handleDeleteSuccess = ({ data }: { data?: TahunAjaranActionPayload }) => {
		applyLatestList(data);
		selectedIdsSet = new Set();
		createFormState = { submitting: false, invalid: true };
		editFormState = { submitting: false, invalid: true };
		editingId = null;
	};
</script>

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<h2 class="mb-4 text-xl font-bold">Daftar tahun ajaran</h2>

	{#if selectedSekolah}
		<p class="text-base-content/70 text-sm">
			Sekolah: <span class="text-base-content font-semibold">{selectedSekolah.nama}</span>
		</p>
	{/if}

	<div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
		<button class="btn btn-soft shadow-none sm:w-auto" type="button" onclick={() => history.back()}>
			<Icon name="left" />
			Kembali
		</button>
		<div class="flex flex-col gap-2 sm:ml-auto sm:flex-row">
			<FormEnhance action="?/delete" onsuccess={handleDeleteSuccess}>
				{#snippet children({ submitting })}
					{#if hasSelection}
						{#each selectedIds as id (id)}
							<input type="hidden" name="ids" value={id} />
						{/each}
						<input type="hidden" name="sekolahId" value={selectedSekolahId} />
					{/if}
					<button
						class={hasSelection
							? 'btn btn-error btn-soft w-full shadow-none sm:max-w-40'
							: 'btn btn-soft w-full shadow-none sm:max-w-40'}
						type={hasSelection ? 'submit' : 'button'}
						onclick={!hasSelection ? handleCreateRow : undefined}
						disabled={hasSelection
							? !selectedSekolahId || editingId !== null || submitting
							: !selectedSekolahId || editingId !== null}
					>
						<Icon name={hasSelection ? 'del' : 'plus'} />
						{hasSelection ? (submitting ? 'Menghapus…' : 'Hapus TA') : 'Tambah TA'}
					</button>
				{/snippet}
			</FormEnhance>
		</div>
	</div>

	<div
		class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
	>
		<table class="border-base-200 table border dark:border-none">
			<thead>
				<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
					<th>
						<input
							class="checkbox"
							type="checkbox"
							bind:this={masterCheckbox}
							checked={allSelected}
							onchange={toggleSelectAll}
						/>
					</th>
					<th style="width: 50px; min-width: 40px;">No</th>
					<th class="w-full" style="min-width: 100px;">Tahun Ajaran</th>
					<th style="width: 120px;">Rombel</th>
					<th style="width: 160px;">Aksi</th>
				</tr>
			</thead>
			<tbody>
				{#if !selectedSekolahId}
					<tr>
						<td colspan="5" class="text-base-content/70 py-8 text-center"
							>Pilih sekolah terlebih dahulu.</td
						>
					</tr>
				{:else}
					{#if editingId === 'new'}
						{@const createFormId = 'ta-create-form'}
						<tr>
							<td>
								<input class="checkbox" type="checkbox" disabled />
							</td>
							<td>-</td>
							<td>
								<FormEnhance
									id={createFormId}
									action="?/create"
									init={tahunAjaranInit(null)}
									onsuccess={handleCreateSuccess}
								>
									{#snippet children({ submitting, invalid })}
										{syncCreateFormState(submitting, invalid)}
										<input type="hidden" name="sekolahId" value={selectedSekolahId} />
										<input
											class="input input-sm input-bordered w-full"
											name="nama"
											placeholder="2025/2026"
											required
										/>
									{/snippet}
								</FormEnhance>
							</td>
							<td>-</td>
							<td>
								<div class="flex justify-end gap-2">
									<button
										class="btn btn-sm btn-error btn-soft shadow-none"
										type="button"
										onclick={cancelInline}
									>
										Batal
									</button>
									<button
										class="btn btn-sm btn-primary shadow-none"
										type="submit"
										form={createFormId}
										disabled={createFormState.invalid || createFormState.submitting}
									>
										{createFormState.submitting ? 'Menyimpan…' : 'Simpan'}
									</button>
								</div>
							</td>
						</tr>
					{/if}

					{#if !tahunAjaranState.length && editingId !== 'new'}
						<tr>
							<td colspan="5" class="text-base-content/70 py-8 text-center">
								Belum ada tahun ajaran yang tercatat untuk sekolah ini.
							</td>
						</tr>
					{:else}
						{#each tahunAjaranState as item, index (item.id)}
							{#if editingId === item.id}
								{@const editFormId = `ta-edit-form-${item.id}`}
								<tr class="bg-base-200">
									<td>
										<input class="checkbox" type="checkbox" disabled />
									</td>
									<td>{index + 1}</td>
									<td>
										<FormEnhance
											id={editFormId}
											action="?/update"
											init={tahunAjaranInit(item)}
											onsuccess={handleUpdateSuccess}
										>
											{#snippet children({ submitting, invalid })}
												{syncEditFormState(submitting, invalid)}
												<input type="hidden" name="id" />
												<input type="hidden" name="sekolahId" value={selectedSekolahId} />
												<input class="input input-sm input-bordered w-full" name="nama" required />
											{/snippet}
										</FormEnhance>
									</td>
									<td>{item.rombel ?? 0}</td>
									<td>
										<div class="flex justify-end gap-2">
											<button
												class="btn btn-sm btn-ghost shadow-none"
												type="button"
												onclick={cancelInline}
											>
												Batal
											</button>
											<button
												class="btn btn-sm btn-primary shadow-none"
												type="submit"
												form={editFormId}
												disabled={editFormState.invalid || editFormState.submitting}
											>
												{editFormState.submitting ? 'Menyimpan…' : 'Simpan'}
											</button>
										</div>
									</td>
								</tr>
							{:else}
								<tr class={item.isAktif ? 'bg-base-200' : ''}>
									<td>
										<input
											class="checkbox"
											type="checkbox"
											checked={selectedIdsSet.has(item.id)}
											onchange={() => toggleSelect(item.id)}
										/>
									</td>
									<td>{index + 1}</td>
									<td>
										<span class="text-base-content font-semibold">{item.nama}</span>
									</td>
									<td>{item.rombel ?? 0}</td>
									<td>
										<button
											class="btn btn-sm btn-soft shadow-none"
											type="button"
											onclick={() => handleEditRow(item.id)}
										>
											<Icon name="edit" />
											Edit
										</button>
									</td>
								</tr>
							{/if}
						{/each}
					{/if}
				{/if}
			</tbody>
		</table>
	</div>
</div>
