<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- small URLSearchParams helpers and goto use */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import { autoSubmit, searchQueryMarker } from '$lib/utils';
	import { onDestroy } from 'svelte';

	import SvelteURLSearchParams from '$lib/svelte-helpers/url-search-params';

	type ProgressCategory = 'sangat-baik' | 'baik' | 'perlu-pendalaman' | 'perlu-bimbingan';
	type PaginationState = {
		currentPage: number;
		totalPages: number;
		totalItems: number;
		perPage: number;
		search: string | null;
	};
	type PageData = {
		mapelList: Array<{ value: string; nama: string }>;
		selectedMapelValue: string | null;
		daftarMurid: Array<{
			id: number;
			nama: string;
			no: number;
			progressText: string | null;
			progressSummaryParts: Array<{
				kategori: ProgressCategory;
				kategoriLabel: string;
				lingkupMateri: string;
				tuntas: number;
				totalTujuan: number;
			}>;
			hasPenilaian: boolean;
			nilaiHref: string | null;
			canNilai?: boolean;
		}>;
		jumlahTujuan: number;
		selectedMapel?: { id: number | null; nama: string } | null;
		search: string | null;
		page: PaginationState;
		allowedAgamaForUser?: string | null;
	};

	let { data }: { data: PageData } = $props();

	const CATEGORY_TEXT_CLASS: Record<ProgressCategory, string> = {
		'sangat-baik': 'text-info',
		baik: 'text-primary',
		'perlu-pendalaman': 'text-warning',
		'perlu-bimbingan': 'text-error'
	};

	let selectedMapelValue = $state(data.selectedMapelValue ?? '');
	let searchTerm = $state(data.search ?? '');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	const currentPage = $derived.by(() => data.page?.currentPage ?? 1);
	const totalPages = $derived.by(() => Math.max(1, data.page?.totalPages ?? 1));
	const pages = $derived.by(() => Array.from({ length: totalPages }, (_, index) => index + 1));

	const kelasAktifLabel = $derived.by(() => {
		const kelas = page.data.kelasAktif ?? null;
		if (!kelas) return null;
		return kelas.fase ? `${kelas.nama} - ${kelas.fase}` : kelas.nama;
	});

	// Restrict editing for wali_asuh
	const canEdit = $derived.by(() => {
		const u = page.data.user as { type?: string } | null | undefined;
		return u?.type !== 'wali_asuh';
	});

	$effect(() => {
		selectedMapelValue = data.selectedMapelValue ?? '';
		searchTerm = data.search ?? '';
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

	function handleSearchInput(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		searchTerm = value;
		if (searchTimer) {
			clearTimeout(searchTimer);
		}
		searchTimer = setTimeout(() => {
			void applySearch(value);
		}, 400);
	}

	function submitSearch(event: Event) {
		event.preventDefault();
		if (searchTimer) {
			clearTimeout(searchTimer);
			searchTimer = undefined;
		}
		void applySearch(searchTerm);
	}

	onDestroy(() => {
		if (searchTimer) {
			clearTimeout(searchTimer);
		}
	});

	function escapeHtml(value: string) {
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function summaryWithHighlights(murid: (typeof data.daftarMurid)[number]) {
		if (!murid.progressSummaryParts.length || !murid.progressText) {
			return murid.progressText ?? '';
		}

		const source = escapeHtml(murid.progressText);
		let cursor = 0;
		let html = '';
		for (const part of murid.progressSummaryParts) {
			const token = `${part.tuntas}/${part.totalTujuan} TP`;
			const nextIndex = source.indexOf(token, cursor);
			if (nextIndex === -1) {
				continue;
			}
			html += source.slice(cursor, nextIndex);
			html += `<span class="${CATEGORY_TEXT_CLASS[part.kategori]} font-semibold">${token}</span>`;
			cursor = nextIndex + token.length;
		}
		html += source.slice(cursor);
		return html;
	}
</script>

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
		<div>
			<h2 class="text-xl font-bold">
				Daftar Nilai Formatif
				{#if data.selectedMapel}
					- {data.selectedMapel.nama}
				{/if}
			</h2>
			{#if kelasAktifLabel}
				<p class="text-base-content/70 text-sm">Kelas aktif: {kelasAktifLabel}</p>
			{:else}
				<p class="text-base-content/60 text-sm">
					Pilih kelas di navbar untuk melihat mata pelajaran intrakurikuler.
				</p>
			{/if}
		</div>
	</div>

	<div class="flex flex-col items-center gap-2 sm:flex-row">
		<form class="w-full md:max-w-80" method="get" use:autoSubmit>
			<select
				class="select bg-base-200 w-full truncate dark:border-none"
				title="Pilih mata pelajaran"
				name="mapel_id"
				bind:value={selectedMapelValue}
				disabled={data.mapelList.length === 0 ||
					(page.data.user?.type === 'user' && page.data.user?.mataPelajaranId != null)}
			>
				{#if data.mapelList.length === 0}
					<option value="">Belum ada mata pelajaran</option>
				{:else}
					<option value="" disabled selected={selectedMapelValue === ''}>
						Pilih Mata Pelajaran
					</option>
					{#each data.mapelList as mapel (mapel.value)}
						<option value={mapel.value}>{mapel.nama}</option>
					{/each}
				{/if}
			</select>
		</form>
		<form
			class="w-full"
			data-sveltekit-keepfocus
			data-sveltekit-replacestate
			autocomplete="off"
			onsubmit={submitSearch}
		>
			<!-- Cari nama murid -->
			<label class="input bg-base-200 dark:bg-base-300 w-full dark:border-none">
				<Icon name="search" />
				<input
					type="search"
					name="q"
					value={searchTerm}
					spellcheck="false"
					autocomplete="name"
					placeholder="Cari nama murid..."
					oninput={handleSearchInput}
				/>
			</label>
		</form>
	</div>

	{#if data.mapelList.length === 0}
		<div class="alert alert-soft alert-info mt-6">
			<Icon name="info" />
			<span>
				Belum ada mata pelajaran intrakurikuler di kelas ini. Tambahkan terlebih dahulu di menu
				<strong>Intrakurikuler</strong>.
			</span>
		</div>
	{:else if data.daftarMurid.length === 0}
		<div class="alert alert-soft alert-warning mt-6">
			<Icon name="alert" />
			<span>
				Belum ada data murid untuk kelas ini. Silakan tambah murid di menu <strong>Murid</strong>.
			</span>
		</div>
	{:else}
		<div
			class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
		>
			<table class="border-base-200 table min-w-150 border dark:border-none">
				<thead>
					<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
						<th style="width: 50px; min-width: 40px;">No</th>
						<th class="min-w-40">Nama</th>
						<th>Aksi</th>
						<th class="w-full" style="min-width: 220px;">Progres</th>
					</tr>
				</thead>
				<tbody>
					{#each data.daftarMurid as murid (murid.id)}
						<tr>
							<td class="align-top">{murid.no}</td>
							<td class="align-top">{@html searchQueryMarker(data.search, murid.nama)}</td>
							<td class="align-top">
								{#if murid.nilaiHref && canEdit}
									<a class="btn btn-sm btn-soft shadow-none" href={murid.nilaiHref}>
										<Icon name="edit" />
										Nilai
									</a>
								{:else}
									<button
										type="button"
										class="btn btn-sm btn-disabled"
										disabled
										title={!canEdit
											? 'Anda tidak memiliki izin untuk menilai'
											: data.allowedAgamaForUser
												? `Hanya untuk murid beragama ${data.allowedAgamaForUser}`
												: 'Pilih mata pelajaran'}
									>
										<Icon name="edit" />
										Nilai
									</button>
								{/if}
							</td>
							<td class="align-top">
								{#if murid.progressText}
									<p
										class={murid.progressSummaryParts.length
											? 'text-base-content text-sm'
											: 'text-base-content/70 text-sm italic'}
									>
										{@html summaryWithHighlights(murid)}
									</p>
								{:else}
									<span class="text-base-content/70 text-sm italic"
										>Pilih mata pelajaran untuk melihat progres</span
									>
								{/if}
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
					class="join-item btn"
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
