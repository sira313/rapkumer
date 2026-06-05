<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import { searchQueryMarker } from '$lib/utils';
	import { onDestroy } from 'svelte';

	type KehadiranRow = {
		id: number;
		no: number;
		nama: string;
		sakit: number;
		izin: number;
		alfa: number;
		updatedAt: string | null;
	};

	type PageState = {
		search: string | null;
		currentPage: number;
		totalPages: number;
		// totalItems and perPage intentionally omitted when not used in this view
	};

	type PageData = {
		page: PageState;
		daftarMurid: KehadiranRow[];
		tableReady: boolean;
		totalMurid: number;
		muridCount: number;
	};

	let { data }: { data: PageData } = $props();

	const kelasAktif = $derived(page.data.kelasAktif ?? null);
	const kelasAktifLabel = $derived.by(() => {
		if (!kelasAktif) return null;
		return kelasAktif.fase ? `${kelasAktif.nama} - ${kelasAktif.fase}` : kelasAktif.nama;
	});

	// Restrict editing for wali_asuh
	const canEdit = $derived.by(() => {
		const u = page.data.user as { type?: string } | null | undefined;
		return u?.type !== 'wali_asuh';
	});

	const currentPage = $derived.by(() => data.page?.currentPage ?? 1);
	const totalPages = $derived.by(() => Math.max(1, data.page?.totalPages ?? 1));
	const pages = $derived.by(() => Array.from({ length: totalPages }, (_, index) => index + 1));

	let searchTerm = $state(data.page.search ?? '');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	let editingRowId = $state<number | null>(null);
	let editingValues = $state<{ sakit: string; izin: string; alfa: string }>({
		sakit: '0',
		izin: '0',
		alfa: '0'
	});
	let editingSubmitting = $state(false);

	$effect(() => {
		if (searchTimer) return;
		const latestSearchTerm = data.page.search ?? '';
		if (searchTerm !== latestSearchTerm) {
			searchTerm = latestSearchTerm;
		}
	});

	$effect(() => {
		if (editingRowId == null) {
			editingValues = { sakit: '0', izin: '0', alfa: '0' };
		}
	});

	import SvelteURLSearchParams from '$lib/svelte-helpers/url-search-params';

	function buildUrl(updateParams: (params: SvelteURLSearchParams) => void) {
		const params = new SvelteURLSearchParams(page.url.search);
		updateParams(params);
		const nextQuery = params.toString();
		const nextUrl = `${page.url.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
		const currentUrl = `${page.url.pathname}${page.url.search}`;
		return nextUrl === currentUrl ? null : nextUrl;
	}

	async function applyNavigation(updateParams: (params: SvelteURLSearchParams) => void) {
		const target = buildUrl(updateParams);
		if (!target) return;
		/* eslint-disable-next-line svelte/no-navigation-without-resolve -- intentional URL build + goto */
		await goto(target, { replaceState: true, keepFocus: true });
	}

	function handleSearchInput(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		searchTerm = value;
		if (searchTimer) {
			clearTimeout(searchTimer);
		}
		searchTimer = setTimeout(() => {
			searchTimer = undefined;
			void applyNavigation((params) => {
				const cleaned = value.trim();
				if (cleaned) {
					params.set('q', cleaned);
				} else {
					params.delete('q');
				}
				params.delete('page');
			});
		}, 400);
	}

	function submitSearch(event: Event) {
		event.preventDefault();
		if (searchTimer) {
			clearTimeout(searchTimer);
			searchTimer = undefined;
		}
		void applyNavigation((params) => {
			const cleaned = searchTerm.trim();
			if (cleaned) {
				params.set('q', cleaned);
			} else {
				params.delete('q');
			}
			params.delete('page');
		});
	}

	onDestroy(() => {
		if (searchTimer) {
			clearTimeout(searchTimer);
			searchTimer = undefined;
		}
	});

	function gotoPage(pageNumber: number) {
		const sanitized = pageNumber < 1 ? 1 : pageNumber;
		void applyNavigation((params) => {
			if (sanitized <= 1) {
				params.delete('page');
			} else {
				params.set('page', String(sanitized));
			}
		});
	}

	function handlePageClick(pageNumber: number) {
		if (pageNumber === currentPage) return;
		gotoPage(pageNumber);
	}

	function displayCount(value: number | null | undefined) {
		if (!value) return '-';
		return value;
	}

	function startEdit(row: KehadiranRow) {
		editingRowId = row.id;
		editingValues = {
			sakit: String(row.sakit ?? 0),
			izin: String(row.izin ?? 0),
			alfa: String(row.alfa ?? 0)
		};
	}

	function cancelEdit() {
		editingRowId = null;
	}

	function updateEditingValue(key: keyof typeof editingValues, value: string) {
		const sanitized = value.replace(/[^0-9]/g, '');
		editingValues = { ...editingValues, [key]: sanitized };
	}

	function parseEditingValue(raw: string) {
		if (!raw.trim()) return 0;
		const parsed = Number(raw);
		if (!Number.isInteger(parsed) || parsed < 0) return null;
		return parsed;
	}

	const editingNumbers = $derived.by(() => ({
		sakit: parseEditingValue(editingValues.sakit),
		izin: parseEditingValue(editingValues.izin),
		alfa: parseEditingValue(editingValues.alfa)
	}));

	const editingInvalid = $derived.by(
		() =>
			editingRowId != null &&
			(editingNumbers.sakit == null || editingNumbers.izin == null || editingNumbers.alfa == null)
	);

	const editingSaveDisabled = $derived.by(
		() => editingRowId == null || editingInvalid || editingSubmitting
	);

	async function handleUpdateSuccess() {
		editingRowId = null;
		await invalidate('app:absen');
	}

	const hasMurid = $derived.by(() => data.muridCount > 0);
	const hasFilteredMurid = $derived.by(() => data.totalMurid > 0);
</script>

{#if !data.tableReady}
	<div class="alert alert-soft alert-warning mb-6 flex items-center gap-3">
		<Icon name="alert" />
		<span>
			Tabel kehadiran belum tersedia. Jalankan <strong>pnpm db:push</strong> untuk menerapkan migrasi
			terbaru.
		</span>
	</div>
{/if}

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<div class="mb-4">
		<h2 class="text-xl font-bold">Rekapitulasi Kehadiran Murid</h2>
		{#if kelasAktifLabel}
			<p class="text-base-content/80 block text-sm">{kelasAktifLabel}</p>
		{/if}
	</div>

	<form
		class="flex flex-col gap-2 sm:flex-row"
		data-sveltekit-keepfocus
		data-sveltekit-replacestate
		autocomplete="off"
		spellcheck="false"
		onsubmit={submitSearch}
	>
		<label class="input bg-base-200 dark:bg-base-300 w-full dark:border-none">
			<Icon name="search" />
			<input
				type="search"
				name="q"
				value={searchTerm}
				placeholder="Cari nama murid..."
				oninput={handleSearchInput}
				autocomplete="off"
			/>
		</label>
	</form>

	{#if !hasMurid}
		<div class="alert alert-soft alert-warning mt-6">
			<Icon name="alert" />
			<span>Belum ada murid di kelas ini. Tambahkan murid terlebih dahulu.</span>
		</div>
	{:else if !hasFilteredMurid}
		<div class="alert alert-soft alert-info mt-6">
			<Icon name="info" />
			<span>Tidak ada murid yang cocok dengan pencarian.</span>
		</div>
	{:else}
		<div
			class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
		>
			<table class="border-base-200 table border dark:border-none">
				<thead>
					<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
						<th style="width: 50px; min-width: 40px;">No</th>
						<th class="w-full" style="min-width: 160px;">Nama</th>
						<th class="text-center" style="min-width: 90px;">Sakit</th>
						<th class="text-center" style="min-width: 90px;">Izin</th>
						<th class="text-center" style="min-width: 90px;">Alfa</th>
						<th class="text-center" style="min-width: 120px;">Aksi</th>
					</tr>
				</thead>
				<tbody>
					{#each data.daftarMurid as murid (murid.id)}
						{@const isEditing = editingRowId === murid.id}
						{@const formId = `kehadiran-form-${murid.id}`}
						<tr class={isEditing ? 'bg-base-200/40' : undefined}>
							<td>{murid.no}</td>
							<td>{@html searchQueryMarker(data.page.search, murid.nama)}</td>
							<td class="text-center">
								{#if isEditing}
									<input
										class="input input-sm bg-base-200 dark:bg-base-300 w-full text-center dark:border-none"
										type="text"
										inputmode="numeric"
										value={editingValues.sakit}
										oninput={(event) =>
											updateEditingValue('sakit', (event.currentTarget as HTMLInputElement).value)}
										placeholder="0"
										maxlength="3"
									/>
								{:else}
									{displayCount(murid.sakit)}
								{/if}
							</td>
							<td class="text-center">
								{#if isEditing}
									<input
										class="input input-sm bg-base-200 dark:bg-base-300 w-full text-center dark:border-none"
										type="text"
										inputmode="numeric"
										value={editingValues.izin}
										oninput={(event) =>
											updateEditingValue('izin', (event.currentTarget as HTMLInputElement).value)}
										placeholder="0"
										maxlength="3"
									/>
								{:else}
									{displayCount(murid.izin)}
								{/if}
							</td>
							<td class="text-center">
								{#if isEditing}
									<input
										class="input input-sm bg-base-200 dark:bg-base-300 w-full text-center dark:border-none"
										type="text"
										inputmode="numeric"
										value={editingValues.alfa}
										oninput={(event) =>
											updateEditingValue('alfa', (event.currentTarget as HTMLInputElement).value)}
										placeholder="0"
										maxlength="3"
									/>
								{:else}
									{displayCount(murid.alfa)}
								{/if}
							</td>
							<td>
								<div class="flex items-center justify-center gap-2">
									{#if isEditing}
										<FormEnhance
											id={formId}
											action="?/update"
											submitStateChange={(value) => (editingSubmitting = value)}
											onsuccess={handleUpdateSuccess}
											showToast
										>
											{#snippet children({ submitting })}
												<input
													type="hidden"
													name="muridId"
													value={murid.id}
													data-submitting={submitting ? '1' : '0'}
												/>
												<input type="hidden" name="sakit" value={editingNumbers.sakit ?? ''} />
												<input type="hidden" name="izin" value={editingNumbers.izin ?? ''} />
												<input type="hidden" name="alfa" value={editingNumbers.alfa ?? ''} />
											{/snippet}
										</FormEnhance>
										<button
											type="button"
											class="btn btn-soft btn-sm btn-error shadow-none"
											title="Batalkan"
											onclick={cancelEdit}
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
											onclick={() => startEdit(murid)}
											disabled={!data.tableReady || !canEdit}
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

		<div class="join mt-4 sm:mx-auto">
			{#each pages as pageNumber (pageNumber)}
				<button
					type="button"
					class="join-item btn pointer-events-auto"
					class:btn-active={pageNumber === currentPage}
					onclick={() => handlePageClick(pageNumber)}
					aria-current={pageNumber === currentPage ? 'page' : undefined}
				>
					{pageNumber}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	:global(form[id^='kehadiran-form-']) {
		display: contents;
	}
</style>
