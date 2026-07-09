<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import MataEvaluasiIndicators from './MataEvaluasiIndicators.svelte';

	interface MataEvaluasi {
		id: number;
		nama: string;
		indikator: Array<{
			id: number;
			deskripsi: string;
		}>;
	}

	interface Props {
		mataEvaluasi: MataEvaluasi[];
		tableReady: boolean;
		selectedGroups: Set<number>;
		editingGroupId: number | null;
		editingGroupData: { nama: string; indikator: Array<{ id?: number; deskripsi: string }> } | null;
		isSubmitting: boolean;
		onToggleSelection: (id: number) => void;
		onToggleSelectAll: (checked: boolean) => void;
		onEdit: (group: MataEvaluasi) => void;
		onDelete: (id: number) => void;
		onUpdateIndicator: (index: number, value: string) => void;
		onRemoveIndicator: (index: number) => void;
		onSave: () => void;
		onCancel: () => void;
	}

	let {
		mataEvaluasi,
		tableReady,
		selectedGroups,
		editingGroupId,
		editingGroupData,
		isSubmitting,
		onToggleSelection,
		onToggleSelectAll,
		onEdit,
		onDelete,
		onUpdateIndicator,
		onRemoveIndicator,
		onSave,
		onCancel
	}: Props = $props();

	const isEditMode = $derived(editingGroupId !== null);
</script>

<div class="bg-base-100 dark:bg-base-200 mt-6 overflow-x-auto rounded-md shadow-md">
	<table class="border-base-200 table border dark:border-none">
		<thead>
			<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
				<th style="width: 50px; min-width: 40px;">
					<input
						type="checkbox"
						class="checkbox"
						aria-label="Pilih semua mata evaluasi"
						checked={mataEvaluasi.length > 0 && selectedGroups.size === mataEvaluasi.length}
						indeterminate={selectedGroups.size > 0 && selectedGroups.size < mataEvaluasi.length}
						onchange={(event) =>
							onToggleSelectAll((event.currentTarget as HTMLInputElement).checked)}
						disabled={isEditMode || !tableReady || mataEvaluasi.length === 0}
					/>
				</th>
				<th style="width: 50px; min-width: 40px;">No</th>
				<th style="width: 30%;">Mata Evaluasi</th>
				<th style="width: 60%">Indikator</th>
				<th>Aksi</th>
			</tr>
		</thead>
		<tbody>
			{#if mataEvaluasi.length > 0}
				{#each mataEvaluasi as group, idx (group.id)}
					{#if isEditMode && editingGroupId === group.id && editingGroupData}
						<!-- Edit Mode Row -->
						<tr>
							<td class="align-top"><input type="checkbox" class="checkbox" disabled /></td>
							<td class="text-primary animate-pulse align-top font-semibold">{idx + 1}</td>
							<td class="align-top">
								<textarea
									class="textarea textarea-bordered validator bg-base-200 dark:bg-base-300 border-base-300 h-24 w-full"
									value={editingGroupData.nama}
									oninput={(e) => {
										editingGroupData.nama = e.currentTarget.value;
									}}
									placeholder="Tuliskan mata evaluasi"
									disabled={isSubmitting}
									required></textarea>
							</td>
							<td class="align-top">
								<MataEvaluasiIndicators
									indicators={editingGroupData.indikator}
									onUpdate={onUpdateIndicator}
									onRemove={onRemoveIndicator}
									{isSubmitting}
									mode="edit"
								/>
							</td>
							<td class="align-top">
								<div class="flex">
									<button
										type="button"
										class="btn btn-sm btn-soft rounded-r-none shadow-none"
										onclick={onCancel}
										disabled={isSubmitting}
										title="Batalkan"
									>
										<Icon name="close" />
									</button>
									<button
										type="button"
										class="btn btn-sm btn-primary rounded-l-none shadow-none"
										onclick={onSave}
										disabled={isSubmitting}
										aria-busy={isSubmitting}
										title="Simpan"
									>
										<Icon name="save" />
									</button>
								</div>
							</td>
						</tr>
					{:else}
						<!-- Display Mode Row -->
						<tr class="hover:bg-base-200/50 dark:hover:bg-base-700/50">
							<td class="align-top">
								<input
									type="checkbox"
									class="checkbox"
									aria-label={`Pilih ${group.nama}`}
									checked={selectedGroups.has(group.id)}
									onchange={() => onToggleSelection(group.id)}
									disabled={isEditMode || !tableReady}
								/>
							</td>
							<td class="align-top">{idx + 1}</td>
							<td class="align-top font-semibold">{group.nama}</td>
							<td class="align-top">
								<MataEvaluasiIndicators
									indicators={group.indikator}
									onUpdate={() => {}}
									onRemove={() => {}}
									mode="view"
								/>
							</td>
							<td class="align-top">
								<div class="flex">
									<button
										type="button"
										class="btn btn-sm btn-soft rounded-r-none shadow-none"
										onclick={() => onEdit(group)}
										disabled={isEditMode || !tableReady}
										title="Edit mata evaluasi"
									>
										<Icon name="edit" />
									</button>
									<button
										type="button"
										class="btn btn-sm btn-error btn-soft rounded-r-none shadow-none"
										onclick={() => onDelete(group.id)}
										disabled={isEditMode || !tableReady}
										title="Hapus mata evaluasi"
									>
										<Icon name="del" />
									</button>
								</div>
							</td>
						</tr>
					{/if}
				{/each}
			{:else if tableReady}
				<tr>
					<td class="py-8 text-center italic opacity-50" colspan="5">Belum ada mata evaluasi</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>
