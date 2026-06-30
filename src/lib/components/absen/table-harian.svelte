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
		keteranganPulang: string | null;
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
		kelasId,
		editingRowId,
		editingValues,
		editingSubmitting,
		onStartEdit,
		onCancelEdit,
		onEditValueChange,
		onUpdateSuccess,
		onSubmitStateChange,
		jenisPresensi = 'wali_kelas_saja',
		tipePresensi = 'masuk_pulang'
	}: {
		rows: KehadiranRow[];
		search: string | null;
		canEdit: boolean;
		tableReady: boolean;
		tanggal: string;
		kelasId: number | null;
		editingRowId: number | null;
		editingValues: { keterangan: string; keteranganPulang: string };
		editingSubmitting: boolean;
		onStartEdit: (row: KehadiranRow) => void;
		onCancelEdit: () => void;
		onEditValueChange: (value: { keterangan: string; keteranganPulang: string }) => void;
		onUpdateSuccess: () => void;
		onSubmitStateChange: (v: boolean) => void;
		jenisPresensi?: string;
		tipePresensi?: string;
	} = $props();

	let editingSaveDisabled = $derived(editingRowId == null || editingSubmitting);

	const isWaliKelasMasukSaja = $derived(
		jenisPresensi === 'wali_kelas_saja' && tipePresensi === 'masuk_saja'
	);
	const isWaliKelasMasukPulang = $derived(
		jenisPresensi === 'wali_kelas_saja' && tipePresensi === 'masuk_pulang'
	);
	const isSingleColumnMode = $derived(
		isWaliKelasMasukSaja ||
			(jenisPresensi === 'tiap_mapel' &&
				(tipePresensi === 'awal_mapel' || tipePresensi === 'awal_akhir_mapel'))
	);

	function displayKeterangan(value: string | null | undefined) {
		if (value == null) return 'Hadir';
		const labels: Record<string, string> = {
			sakit: 'Sakit',
			izin: 'Izin',
			alfa: 'Alfa'
		};
		return labels[value] ?? value;
	}

	function keteranganColor(value: string | null | undefined) {
		if (value == null) return 'badge-soft badge-success';
		const colors: Record<string, string> = {
			sakit: 'badge-soft badge-warning',
			izin: 'badge-soft badge-info',
			alfa: 'badge-soft badge-error'
		};
		return colors[value] ?? '';
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
				{#if isWaliKelasMasukPulang}
					<th class="text-center" style="min-width: 100px;">Masuk</th>
					<th class="text-center" style="min-width: 100px;">Pulang</th>
				{:else if isSingleColumnMode}
					<th class="text-center" style="min-width: 100px;">Hadir</th>
				{:else}
					<th class="text-center" style="min-width: 100px;">Hadir</th>
					<th class="text-center" style="min-width: 120px;">Keterangan</th>
				{/if}
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

					{#if isWaliKelasMasukPulang}
						<td class="text-center">
							{#if isEditing}
								<select
									class="select select-sm bg-base-200 dark:bg-base-300 w-full truncate text-center dark:border-none"
									value={editingValues.keterangan}
									onchange={(event) =>
										onEditValueChange({
											...editingValues,
											keterangan: (event.currentTarget as HTMLSelectElement).value
										})}
								>
									<option value="">Hadir</option>
									<option value="sakit">Sakit</option>
									<option value="izin">Izin</option>
									<option value="alfa">Alfa</option>
								</select>
							{:else}
								<span class="badge badge-sm whitespace-nowrap {keteranganColor(murid.keterangan)}">
									{displayKeterangan(murid.keterangan)}
								</span>
							{/if}
						</td>
						<td class="text-center">
							{#if isEditing}
								<select
									class="select select-sm bg-base-200 dark:bg-base-300 w-full truncate text-center dark:border-none"
									value={editingValues.keteranganPulang}
									onchange={(event) =>
										onEditValueChange({
											...editingValues,
											keteranganPulang: (event.currentTarget as HTMLSelectElement).value
										})}
								>
									<option value="">Hadir</option>
									<option value="sakit">Sakit</option>
									<option value="izin">Izin</option>
									<option value="alfa">Alfa</option>
								</select>
							{:else}
								<span
									class="badge badge-sm whitespace-nowrap {keteranganColor(murid.keteranganPulang)}"
								>
									{displayKeterangan(murid.keteranganPulang)}
								</span>
							{/if}
						</td>
				{:else if isSingleColumnMode}
					<td class="text-center">
							{#if isEditing}
								<select
									class="select select-sm bg-base-200 dark:bg-base-300 w-full truncate text-center dark:border-none"
									value={editingValues.keterangan}
									onchange={(event) =>
										onEditValueChange({
											...editingValues,
											keterangan: (event.currentTarget as HTMLSelectElement).value
										})}
								>
									<option value="">Hadir</option>
									<option value="sakit">Sakit</option>
									<option value="izin">Izin</option>
									<option value="alfa">Alfa</option>
								</select>
							{:else}
								<span class="badge badge-sm whitespace-nowrap {keteranganColor(murid.keterangan)}">
									{displayKeterangan(murid.keterangan)}
								</span>
							{/if}
						</td>
					{:else}
						<td class="text-center">
							<span
								class="badge badge-sm whitespace-nowrap {murid.hadir
									? 'badge-soft badge-success'
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
											...editingValues,
											keterangan: (event.currentTarget as HTMLSelectElement).value
										})}
								>
									<option value="">-</option>
									<option value="sakit">Sakit</option>
									<option value="izin">Izin</option>
									<option value="alfa">Alfa</option>
								</select>
							{:else if murid.keterangan}
								{displayKeterangan(murid.keterangan)}
							{:else}
								-
							{/if}
						</td>
					{/if}

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
										<input
											type="hidden"
											name="keteranganPulang"
											value={editingValues.keteranganPulang}
										/>
										<input type="hidden" name="tanggal" value={tanggal} />
										<input type="hidden" name="kelasId" value={kelasId ?? ''} />
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
