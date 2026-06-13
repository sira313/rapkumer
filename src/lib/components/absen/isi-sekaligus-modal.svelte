<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { hideModal } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { searchQueryMarker } from '$lib/utils';

	type MuridItem = {
		id: number;
		nama: string;
		keterangan: string | null;
	};

	let {
		daftarMurid,
		kelasId = 0
	}: {
		daftarMurid: MuridItem[];
		kelasId?: number;
	} = $props();

	let step = $state<'pilih-mode' | 'pilih-murid'>('pilih-mode');
	let pilihanHadirSemua = $state<string>('');
	let searchTerm = $state('');
	let selectedIds = $state<number[]>([]);
	let keteranganMap = $state<Record<number, string>>({});
	let submitting = $state(false);

	$effect(() => {
		if (step === 'pilih-murid') {
			const ids: number[] = [];
			const map: Record<number, string> = {};
			for (const m of daftarMurid) {
				if (m.keterangan) {
					ids.push(m.id);
					map[m.id] = m.keterangan;
				}
			}
			selectedIds = ids;
			keteranganMap = map;
		}
	});

	const filteredMurid = $derived.by(() => {
		if (!searchTerm.trim()) return daftarMurid;
		const q = searchTerm.trim().toLowerCase();
		return daftarMurid.filter((m) => m.nama.toLowerCase().includes(q));
	});

	const allFilteredSelected = $derived.by(() => {
		if (filteredMurid.length === 0) return false;
		return filteredMurid.every((m) => selectedIds.includes(m.id));
	});

	function toggleSelect(id: number) {
		const idx = selectedIds.indexOf(id);
		if (idx === -1) {
			selectedIds = [...selectedIds, id];
			if (!keteranganMap[id]) {
				keteranganMap = { ...keteranganMap, [id]: 'alfa' };
			}
		} else {
			selectedIds = selectedIds.filter((x) => x !== id);
			const { [id]: _, ...rest } = keteranganMap;
			keteranganMap = rest;
		}
	}

	function toggleSelectAll() {
		if (allFilteredSelected) {
			const filteredIds = new Set(filteredMurid.map((m) => m.id));
			selectedIds = selectedIds.filter((id) => !filteredIds.has(id));
			const next = { ...keteranganMap };
			for (const id of filteredIds) {
				delete next[id];
			}
			keteranganMap = next;
		} else {
			const newIds = filteredMurid.map((m) => m.id);
			const existing = new Set(selectedIds);
			const toAdd = newIds.filter((id) => !existing.has(id));
			const next = { ...keteranganMap };
			for (const id of toAdd) {
				if (!next[id]) next[id] = 'alfa';
			}
			selectedIds = [...selectedIds, ...toAdd];
			keteranganMap = next;
		}
	}

	function setKeterangan(id: number, value: string) {
		keteranganMap = { ...keteranganMap, [id]: value };
	}

	function pilihTidak() {
		pilihanHadirSemua = 'tidak';
		step = 'pilih-murid';
	}

	async function submitHadirSemua() {
		submitting = true;
		try {
			const fd = new FormData();
			fd.set('mode', 'hadir_semua');
			fd.set('kelasId', String(kelasId));
			const res = await fetch('?/isiSekaligus', { method: 'POST', body: fd, redirect: 'error' });
			if (!res.ok) {
				const err = await res.json().catch(() => ({ fail: 'Gagal menyimpan' }));
				throw new Error(err.fail ?? `Error ${res.status}`);
			}
			hideModal();
			await invalidate('app:absen');
		} catch (e) {
			toast(e instanceof Error ? e.message : 'Gagal menyimpan', 'error');
		} finally {
			submitting = false;
		}
	}

	async function submitSelected() {
		submitting = true;
		try {
			const entries = selectedIds.map((id) => ({
				muridId: id,
				keterangan: keteranganMap[id] || 'alfa'
			}));
			const fd = new FormData();
			fd.set('mode', 'selected');
			fd.set('kelasId', String(kelasId));
			fd.set('entries', JSON.stringify(entries));
			const res = await fetch('?/isiSekaligus', { method: 'POST', body: fd, redirect: 'error' });
			if (!res.ok) {
				const err = await res.json().catch(() => ({ fail: 'Gagal menyimpan' }));
				throw new Error(err.fail ?? `Error ${res.status}`);
			}
			hideModal();
			await invalidate('app:absen');
		} catch (e) {
			toast(e instanceof Error ? e.message : 'Gagal menyimpan', 'error');
		} finally {
			submitting = false;
		}
	}
</script>

{#if step === 'pilih-mode'}
	<div class="flex flex-col gap-4">
		<p class="text-base-content text-lg font-medium">Apakah hadir semua hari ini?</p>
		<div class="flex gap-3">
			<button
				type="button"
				class="btn btn-success btn-soft flex-1 shadow-none"
				disabled={submitting}
				onclick={submitHadirSemua}
			>
				{#if submitting}
					<span class="loading loading-spinner loading-xs"></span>
				{/if}
				Ya
			</button>
			<button
				type="button"
				class="btn btn-error btn-soft flex-1 shadow-none"
				disabled={submitting}
				onclick={pilihTidak}
			>
				Tidak
			</button>
		</div>
	</div>
{:else}
	<div class="flex flex-col gap-3">
		<p class="text-base-content text-lg font-medium">Siapa yang tidak hadir?</p>

		<label class="input bg-base-200 dark:bg-base-300 w-full dark:border-none">
			<input
				type="search"
				placeholder="Cari nama murid..."
				bind:value={searchTerm}
				autocomplete="off"
			/>
		</label>

		<div class="bg-base-100 dark:bg-base-200 max-h-80 overflow-y-auto rounded-md shadow-md dark:shadow-none">
			<table class="border-base-200 table border dark:border-none">
				<thead>
					<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
						<th class="w-12">
							<input
								type="checkbox"
								class="checkbox checkbox-sm"
								checked={allFilteredSelected}
								onclick={toggleSelectAll}
							/>
						</th>
						<th>Nama</th>
						<th class="text-center" style="min-width: 120px;">Keterangan</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredMurid as murid (murid.id)}
						{@const checked = selectedIds.includes(murid.id)}
						<tr>
							<td>
								<input
									type="checkbox"
									class="checkbox checkbox-sm"
									checked={checked}
									onclick={() => toggleSelect(murid.id)}
								/>
							</td>
							<td>{@html searchQueryMarker(searchTerm, murid.nama)}</td>
							<td class="text-center">
								{#if checked}
									<select
										class="select select-sm bg-base-200 dark:bg-base-300 w-full text-center dark:border-none"
										value={keteranganMap[murid.id] || 'alfa'}
										onchange={(e) => setKeterangan(murid.id, (e.currentTarget as HTMLSelectElement).value)}
									>
										<option value="sakit">Sakit</option>
										<option value="izin">Izin</option>
										<option value="alfa">Alfa</option>
									</select>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="flex justify-end gap-2">
			<button
				type="button"
				class="btn btn-soft shadow-none"
				onclick={() => {
					step = 'pilih-mode';
					pilihanHadirSemua = '';
				}}
				disabled={submitting}
			>
				Kembali
			</button>
			<button
				type="button"
				class="btn btn-primary shadow-none"
				disabled={submitting || selectedIds.length === 0}
				onclick={submitSelected}
			>
				{#if submitting}
					<span class="loading loading-spinner loading-xs"></span>
				{/if}
				Simpan
			</button>
		</div>
	</div>
{/if}
