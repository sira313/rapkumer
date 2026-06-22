<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import { searchQueryMarker } from '$lib/utils';

	type KehadiranRow = {
		id: number;
		no: number;
		nama: string;
		hadir: boolean;
		keterangan: string | null;
		updatedAt: string | null;
	};

	type PageState = {
		search: string | null;
		currentPage: number;
		totalPages: number;
	};

	let {
		rows,
		search,
		canEdit,
		tableReady,
		tanggal,
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
		rows: KehadiranRow[];
		search: string | null;
		canEdit: boolean;
		tableReady: boolean;
		tanggal: string;
		editingRowId: number | null;
		editingValues: { keterangan: string };
		editingSubmitting: boolean;
		editingSaveDisabled: boolean;
		onStartEdit: (row: KehadiranRow) => void;
		onCancelEdit: () => void;
		onEditValueChange: (value: { keterangan: string }) => void;
		onUpdateSuccess: () => void;
		onSubmitStateChange: (v: boolean) => void;
	} = $props();

	function displayKeterangan(value: string | null | undefined) {
		if (value == null) return '-';
		const labels: Record<string, string> = {
			sakit: 'Sakit',
			izin: 'Izin',
			alfa: 'Alfa'
		};
		return labels[value] ?? value;
	}
</script>

<div
	class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
>
	<table class="border-base-200 table border dark:border-none">
		<thead>
			<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
				<th style="width: 50px; min-width: 40px;">No</th>
				<th class="w-full" style="min-width: 160px;">Nama</th>
				<th class="text-center" style="min-width: 100px;">Hadir</th>
				<th class="text-center" style="min-width: 120px;">Keterangan</th>
				<th class="text-center" style="min-width: 120px;">Aksi</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as murid (murid.id)}
				{@const isEditing = editingRowId === murid.id}
				{@const formId = `kehadiran-form-${murid.id}`}
				<tr class={isEditing ? 'bg-base-200/40' : undefined}>
					<td>{murid.no}</td>
					<td>{@html searchQueryMarker(search, murid.nama)}</td>
					<td class="text-center">
						<span
							class="badge badge-sm whitespace-nowrap {murid.hadir
								? 'badge-success'
								: 'badge-soft badge-error'}"
						>
							{murid.hadir ? 'Hadir' : 'Tidak hadir'}
						</span>
					</td>
					<td class="overflow-hidden text-center">
						{#if isEditing}
							<select
								class="select select-sm bg-base-200 dark:bg-base-300 w-full truncate text-center dark:border-none"
								value={editingValues.keterangan}
								onchange={(event) =>
									onEditValueChange({
										keterangan: (event.currentTarget as HTMLSelectElement).value
									})}
							>
								<option value="">-</option>
								<option value="sakit">Sakit</option>
								<option value="izin">Izin</option>
								<option value="alfa">Alfa</option>
							</select>
						{:else}
							{displayKeterangan(murid.keterangan)}
						{/if}
					</td>
					<td>
						<div class="flex items-center justify-center gap-2">
							{#if isEditing}
								<FormEnhance
									id={formId}
									action="?/update"
									submitStateChange={onSubmitStateChange}
									onsuccess={onUpdateSuccess}
									showToast
								>
									{#snippet children({ submitting })}
										<input
											type="hidden"
											name="muridId"
											value={murid.id}
											data-submitting={submitting ? '1' : '0'}
										/>
										<input type="hidden" name="keterangan" value={editingValues.keterangan} />
										<input type="hidden" name="tanggal" value={tanggal} />
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
									form={formId}
									disabled={editingSaveDisabled}
								>
									{#if editingSubmitting}
										<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
									{/if}
									<Icon name="save" />
								</button>
							{:else}
								<button
									type="button"
									class="btn btn-soft btn-sm shadow-none"
									onclick={() => onStartEdit(murid)}
									disabled={!tableReady || !canEdit}
									title={!canEdit ? 'Anda tidak memiliki izin untuk mengedit' : ''}
								>
									<Icon name="edit" />
									Edit
								</button>
							{/if}
						</div>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	:global(form[id^='kehadiran-form-']) {
		display: contents;
	}
</style>
