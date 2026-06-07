<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import { searchQueryMarker } from '$lib/utils';
	import { onDestroy } from 'svelte';
	import SvelteURLSearchParams from '$lib/svelte-helpers/url-search-params';

	type KeputusanRow = {
		id: number;
		no: number;
		nama: string;
		naik: boolean;
	};

	type PageState = {
		search: string | null;
		currentPage: number;
		totalPages: number;
		totalItems: number;
		perPage: number;
	};

	type PageData = {
		daftarMurid: KeputusanRow[];
		isGraduating: boolean;
		page: PageState;
		tableReady: boolean;
		muridCount: number;
	};

	let { data }: { data: PageData } = $props();

	const kelasAktif = $derived(page.data.kelasAktif ?? null);
	const kelasAktifLabel = $derived.by(() => {
		if (!kelasAktif) return null;
		return kelasAktif.fase ? `${kelasAktif.nama} - ${kelasAktif.fase}` : kelasAktif.nama;
	});

	const canEdit = $derived.by(() => {
		const u = page.data.user as { type?: string } | null | undefined;
		return u?.type !== 'wali_asuh' && u?.type !== 'user';
	});

	const currentPage = $derived.by(() => data.page?.currentPage ?? 1);
	const totalPages = $derived.by(() => Math.max(1, data.page?.totalPages ?? 1));
	const pages = $derived.by(() => Array.from({ length: totalPages }, (_, index) => index + 1));

	let searchTerm = $state(data.page.search ?? '');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if (searchTimer) return;
		const latestSearchTerm = data.page.search ?? '';
		if (searchTerm !== latestSearchTerm) {
			searchTerm = latestSearchTerm;
		}
	});

	function buildSearchUrl(rawValue: string) {
		const params = new SvelteURLSearchParams(page.url.search);
		const cleaned = rawValue.trim();
		const current = params.get('q') ?? '';
		const searchChanged = cleaned !== current;
		if (cleaned) {
			params.set('q', cleaned);
		} else {
			params.delete('q');
		}
		if (searchChanged) {
			params.delete('page');
		}
		const nextQuery = params.toString();
		const nextUrl = `${page.url.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
		const currentUrl = `${page.url.pathname}${page.url.search}`;
		if (nextUrl === currentUrl) {
			return null;
		}
		return nextUrl;
	}

	async function applySearch(rawValue: string) {
		const target = buildSearchUrl(rawValue);
		if (!target) return;
		searchTimer = undefined;
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
			void applySearch(value);
		}, 400);
	}

	function submitSearch(event: Event) {
		event.preventDefault();
		if (searchTimer) {
			clearTimeout(searchTimer);
		}
		searchTimer = undefined;
		void applySearch(searchTerm);
	}

	function buildPageUrl(pageNumber: number) {
		const params = new SvelteURLSearchParams(page.url.search);
		const sanitized = pageNumber < 1 ? 1 : pageNumber;
		if (sanitized <= 1) {
			params.delete('page');
		} else {
			params.set('page', String(sanitized));
		}
		const nextQuery = params.toString();
		const nextUrl = `${page.url.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
		const currentUrl = `${page.url.pathname}${page.url.search}`;
		if (nextUrl === currentUrl) {
			return null;
		}
		return nextUrl;
	}

	async function gotoPage(pageNumber: number) {
		const target = buildPageUrl(pageNumber);
		if (!target) return;
		await goto(target, { replaceState: true, keepFocus: true });
	}

	function handlePageClick(pageNumber: number) {
		if (pageNumber === currentPage) return;
		void gotoPage(pageNumber);
	}

	onDestroy(() => {
		if (searchTimer) {
			clearTimeout(searchTimer);
		}
		searchTimer = undefined;
	});

	let isEditing = $state(false);
	let editingSubmitting = $state(false);
	let editingValues = $state<Record<number, boolean>>({});

	function startEdit() {
		isEditing = true;
		editingValues = {};
		for (const murid of data.daftarMurid) {
			editingValues[murid.id] = murid.naik;
		}
	}

	function cancelEdit() {
		isEditing = false;
		editingValues = {};
	}

	function setNaik(muridId: number, value: boolean) {
		editingValues = { ...editingValues, [muridId]: value };
	}

	async function handleSaveSuccess() {
		isEditing = false;
		editingValues = {};
		await invalidate('app:keputusan');
	}

	const statusLabelNaik = $derived(data.isGraduating ? 'Lulus' : 'Naik Kelas');
	const statusLabelTidak = $derived(data.isGraduating ? 'Tidak Lulus' : 'Tidak Naik Kelas');

	const hasMurid = $derived(data.muridCount > 0);
	const hasFilteredMurid = $derived(data.page.totalItems > 0);
</script>

{#if !data.tableReady}
	<div class="alert alert-soft alert-warning mb-6 flex items-center gap-3">
		<Icon name="alert" />
		<span>
			Tabel keputusan belum tersedia. Jalankan <strong>pnpm db:push</strong> untuk menerapkan migrasi
			terbaru.
		</span>
	</div>
{/if}

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<div class="mb-4 flex items-start justify-between">
		<div>
			<h2 class="text-xl font-bold">Keputusan Kenaikan Kelas</h2>
			{#if kelasAktifLabel}
				<p class="text-base-content/80 block text-sm">{kelasAktifLabel}</p>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			{#if isEditing}
				<FormEnhance
					id="keputusan-form"
					action="?/save"
					submitStateChange={(value) => (editingSubmitting = value)}
					onsuccess={handleSaveSuccess}
					showToast
				>
					{#snippet children({ submitting })}
						{#each data.daftarMurid as murid (murid.id)}
							<input type="hidden" name="muridId" value={murid.id} />
							<input type="hidden" name="naik" value={String(editingValues[murid.id] ?? true)} />
						{/each}
						<button type="submit" class="btn btn-primary btn-sm shadow-none" disabled={submitting}>
							{#if submitting}
								<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
							{/if}
							<Icon name="save" />
							Simpan
						</button>
					{/snippet}
				</FormEnhance>
				<button
					type="button"
					class="btn btn-soft btn-sm btn-error shadow-none"
					onclick={cancelEdit}
					disabled={editingSubmitting}
				>
					<Icon name="close" />
					Batal
				</button>
			{:else}
				<button
					type="button"
					class="btn btn-soft btn-sm shadow-none"
					onclick={startEdit}
					disabled={!data.tableReady || !canEdit}
					title={!canEdit ? 'Anda tidak memiliki izin untuk mengedit' : ''}
				>
					<Icon name="edit" />
					Edit
				</button>
			{/if}
		</div>
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
						<th class="text-center" style="min-width: 200px;">Status</th>
					</tr>
				</thead>
				<tbody>
					{#each data.daftarMurid as murid (murid.id)}
						<tr class={isEditing ? 'bg-base-200/40' : undefined}>
							<td>{murid.no}</td>
							<td>{@html searchQueryMarker(data.page.search, murid.nama)}</td>
							<td class="text-center">
								{#if isEditing}
									<div class="flex items-center justify-center gap-4">
										<label class="flex cursor-pointer items-center gap-1">
											<input
												type="radio"
												name="naik-{murid.id}"
												class="radio radio-sm radio-success"
												checked={editingValues[murid.id] === true}
												onchange={() => setNaik(murid.id, true)}
											/>
											<span class="text-success text-xs font-medium">{statusLabelNaik}</span>
										</label>
										<label class="flex cursor-pointer items-center gap-1">
											<input
												type="radio"
												name="naik-{murid.id}"
												class="radio radio-sm radio-error"
												checked={editingValues[murid.id] === false}
												onchange={() => setNaik(murid.id, false)}
											/>
											<span class="text-error text-xs font-medium">{statusLabelTidak}</span>
										</label>
									</div>
								{:else}
									<span
										class="badge {murid.naik
											? 'badge-success'
											: 'badge-error'} badge-sm font-medium"
									>
										{murid.naik ? statusLabelNaik : statusLabelTidak}
									</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="join mx-auto mt-4">
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
	:global(form#keputusan-form) {
		display: contents;
	}
</style>
