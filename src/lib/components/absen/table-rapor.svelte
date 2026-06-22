<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import { searchQueryMarker } from '$lib/utils';

	type RaporRow = {
		id: number;
		no: number;
		nama: string;
		hadir: number;
		sakit: number;
		izin: number;
		alfa: number;
		overridden: boolean;
	};

	let {
		rows,
		search,
		canEdit,
		tableReady,
		editingRowId,
		editingValues,
		editingSubmitting,
		editingSaveDisabled,
		onStartEdit,
		onCancelEdit,
		onEditValueChange,
		onUpdateSuccess,
		onSubmitStateChange
	}: {
		rows: RaporRow[];
		search: string | null;
		canEdit: boolean;
		tableReady: boolean;
		editingRowId: number | null;
		editingValues: { sakit: number; izin: number; alfa: number };
		editingSubmitting: boolean;
		editingSaveDisabled: boolean;
		onStartEdit: (row: RaporRow) => void;
		onCancelEdit: () => void;
		onEditValueChange: (value: { sakit: number; izin: number; alfa: number }) => void;
		onUpdateSuccess: () => void;
		onSubmitStateChange: (v: boolean) => void;
	} = $props();
</script>

<div
	class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
>
	<table class="border-base-200 table border dark:border-none">
		<thead>
			<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
				<th style="width: 50px; min-width: 40px;">No</th>
				<th class="w-full" style="min-width: 160px;">Nama</th>
				<th class="text-center" style="min-width: 80px;">Hadir</th>
				<th class="text-center" style="min-width: 80px;">Sakit</th>
				<th class="text-center" style="min-width: 80px;">Izin</th>
				<th class="text-center" style="min-width: 80px;">Alfa</th>
				<th class="text-center" style="min-width: 160px;">Aksi</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.id)}
				{@const isEditing = editingRowId === row.id}
				{@const updateFormId = `rapor-update-form-${row.id}`}
				{@const resetFormId = `rapor-reset-form-${row.id}`}
				<tr class={isEditing ? 'bg-base-200/40' : undefined}>
					<td>{row.no}</td>
					<td>{@html searchQueryMarker(search, row.nama)}</td>
					<td class="text-center font-bold">{row.hadir || ''}</td>
					<td class="text-center">
						{#if isEditing}
							<input
								type="number"
								class="input input-sm bg-base-200 dark:bg-base-300 w-16 text-center dark:border-none"
								value={editingValues.sakit}
								onchange={(e) =>
									onEditValueChange({
										...editingValues,
										sakit: Number((e.currentTarget as HTMLInputElement).value)
									})}
								min="0"
							/>
						{:else}
							{row.sakit || ''}
						{/if}
					</td>
					<td class="text-center">
						{#if isEditing}
							<input
								type="number"
								class="input input-sm bg-base-200 dark:bg-base-300 w-16 text-center dark:border-none"
								value={editingValues.izin}
								onchange={(e) =>
									onEditValueChange({
										...editingValues,
										izin: Number((e.currentTarget as HTMLInputElement).value)
									})}
								min="0"
							/>
						{:else}
							{row.izin || ''}
						{/if}
					</td>
					<td class="text-center">
						{#if isEditing}
							<input
								type="number"
								class="input input-sm bg-base-200 dark:bg-base-300 w-16 text-center dark:border-none"
								value={editingValues.alfa}
								onchange={(e) =>
									onEditValueChange({
										...editingValues,
										alfa: Number((e.currentTarget as HTMLInputElement).value)
									})}
								min="0"
							/>
						{:else}
							{row.alfa || ''}
						{/if}
					</td>
					<td>
						<div class="flex items-center justify-center gap-2">
							{#if isEditing}
								<FormEnhance
									id={updateFormId}
									action="?/updateRapor"
									submitStateChange={onSubmitStateChange}
									onsuccess={onUpdateSuccess}
									showToast
								>
									{#snippet children({ submitting })}
										<input type="hidden" name="muridId" value={row.id} />
										<input
											type="hidden"
											name="sakit"
											value={editingValues.sakit}
											data-submitting={submitting ? '1' : '0'}
										/>
										<input type="hidden" name="izin" value={editingValues.izin} />
										<input type="hidden" name="alfa" value={editingValues.alfa} />
									{/snippet}
								</FormEnhance>
								<button
									type="button"
									class="btn btn-soft btn-sm btn-error shadow-none"
									title="Batalkan"
									onclick={onCancelEdit}
									disabled={editingSubmitting}
								>
									<Icon name="close" />
								</button>
								<button
									type="submit"
									class="btn btn-primary btn-sm shadow-none"
									title="Simpan"
									form={updateFormId}
									disabled={editingSaveDisabled}
								>
									{#if editingSubmitting}
										<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
									{/if}
									<Icon name="save" />
								</button>
							{:else}
								<div class="flex flex-row">
									<button
										type="button"
										class="btn btn-soft btn-sm rounded-r-none shadow-none"
										onclick={() => onStartEdit(row)}
										disabled={!tableReady || !canEdit}
										title={!canEdit
											? 'Anda tidak memiliki izin untuk mengedit'
											: 'Edit nilai ketidakhadiran'}
									>
										<Icon name="edit" />
									</button>
									<FormEnhance
										id={resetFormId}
										action="?/resetRapor"
										onsuccess={onUpdateSuccess}
										showToast
									>
										<input type="hidden" name="muridId" value={row.id} />
									</FormEnhance>
									<button
										type="submit"
										class="btn btn-soft btn-warning btn-sm rounded-l-none shadow-none"
										title="Reset ke nilai asli"
										form={resetFormId}
										disabled={!tableReady || !canEdit || !row.overridden}
									>
										<Icon name="repeat" />
									</button>
								</div>
							{/if}
						</div>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	:global(form[id^='rapor-update-form-']),
	:global(form[id^='rapor-reset-form-']) {
		display: contents;
	}
</style>
