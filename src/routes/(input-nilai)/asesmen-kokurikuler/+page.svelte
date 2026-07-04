<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import NilaiModal from '$lib/components/asesmen-kokurikuler/nilai-modal.svelte';
	import { searchQueryMarker } from '$lib/utils';
	import { onDestroy } from 'svelte';
	import type { DimensiProfilLulusanKey } from '$lib/statics';
	import type { NilaiKategori } from '$lib/kokurikuler';
	import { toast } from '$lib/components/toast.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import ActionButtons from '$lib/components/asesmen-kokurikuler/action-buttons.svelte';
	import ImportModalBody from '$lib/components/asesmen-kokurikuler/import-modal-body.svelte';
	import { downloadTemplate, importNilai } from '$lib/components/asesmen-kokurikuler/api';

	type DimensiDetail = {
		key: DimensiProfilLulusanKey;
		label: string;
	};

	type KokurikulerDetail = {
		id: number;
		kode: string;
		tujuan: string;
		dimensi: DimensiDetail[];
	};

	type MuridRow = {
		id: number;
		nama: string;
		no: number;
		deskripsi: string | null;
		nilaiByDimensi: Record<DimensiProfilLulusanKey, NilaiKategori | null>;
		hasNilai: boolean;
		lastUpdated: string | null;
	};

	type PaginationState = {
		currentPage: number;
		totalPages: number;
		// totalItems, perPage and search are omitted when not used by this view
	};

	type PageData = {
		kokurikulerList: KokurikulerDetail[];
		selectedKokurikulerId: number | null;
		selectedKokurikuler: KokurikulerDetail | null;
		kategoriOptions: Array<{ value: NilaiKategori; label: string }>;
		daftarMurid: MuridRow[];
		search: string | null;
		totalMurid: number;
		muridCount: number;
		// summary not used in this view; omitted to avoid unused prop lint
		page: PaginationState;
	};

	let { data }: { data: PageData } = $props();

	const hasKokurikuler = $derived.by(() => data.kokurikulerList.length > 0);
	const selectedKokurikuler = $derived.by(() => data.selectedKokurikuler);
	const selectedKokurikulerLabel = $derived.by(() =>
		selectedKokurikuler ? capitalizeSentence(selectedKokurikuler.tujuan) : null
	);
	const selectedKokurikulerHasDimensi = $derived.by(() =>
		selectedKokurikuler ? selectedKokurikuler.dimensi.length > 0 : false
	);
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

	let selectedKokurikulerValue = $state(
		data.selectedKokurikulerId ? String(data.selectedKokurikulerId) : ''
	);
	let searchTerm = $state(data.search ?? '');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	let modalOpen = $state(false);
	let activeMurid = $state<MuridRow | null>(null);
	let isDownloadingTemplate = $state(false);
	let isImportingFile = $state(false);

	$effect(() => {
		selectedKokurikulerValue = data.selectedKokurikulerId ? String(data.selectedKokurikulerId) : '';
		searchTerm = data.search ?? '';
	});

	$effect(() => {
		if (!hasKokurikuler) return;
		if (data.kokurikulerList.length !== 1) return;
		const onlyId = String(data.kokurikulerList[0].id);
		if (selectedKokurikulerValue === onlyId) return;
		selectedKokurikulerValue = onlyId;
		handleKokurikulerChange(onlyId);
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
		/* eslint-disable-next-line svelte/no-navigation-without-resolve -- intentional, builds URL then navigates */
		await goto(target, { replaceState: true, keepFocus: true });
	}

	function handleKokurikulerChange(value: string) {
		void applyNavigation((params) => {
			if (value) {
				params.set('kokurikuler_id', value);
			} else {
				params.delete('kokurikuler_id');
			}
			params.delete('page');
		});
	}

	async function applySearch(value: string) {
		await applyNavigation((params) => {
			const cleaned = value.trim();
			if (cleaned) {
				params.set('q', cleaned);
			} else {
				params.delete('q');
			}
			params.delete('page');
		});
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

	function openModalFor(murid: MuridRow) {
		activeMurid = murid;
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		activeMurid = null;
	}

	async function handleModalSuccess() {
		closeModal();
		await invalidate('app:asesmen-kokurikuler');
	}

	async function handleDownloadTemplate() {
		if (!selectedKokurikulerValue || !selectedKokurikulerHasDimensi || !kelasAktif?.id) {
			toast('Pilih kokurikuler terlebih dahulu', 'error');
			return;
		}

		isDownloadingTemplate = true;
		try {
			const success = await downloadTemplate(selectedKokurikulerValue, kelasAktif.id);
			if (success) {
				toast('Template berhasil diunduh', 'success');
			} else {
				toast('Gagal mengunduh template', 'error');
			}
		} catch (err) {
			console.error(err);
			toast('Terjadi kesalahan saat mengunduh template', 'error');
		} finally {
			isDownloadingTemplate = false;
		}
	}

	function openImportModal() {
		if (!selectedKokurikulerValue || !selectedKokurikulerHasDimensi || !kelasAktif?.id) {
			toast('Pilih kokurikuler terlebih dahulu', 'error');
			return;
		}

		let uploader: () => File | null = () => null;

		showModal({
			title: 'Import Nilai dari Excel',
			body: ImportModalBody,
			bodyProps: {
				setUploader: (fn: () => File | null) => (uploader = fn)
			},
			onPositive: {
				label: 'Import',
				icon: 'import',
				action: async ({ close }: { close: () => void }) => {
					const file = uploader();
					if (!file) {
						toast('Pilih file terlebih dahulu.', 'error');
						return;
					}

					isImportingFile = true;

					try {
						const result = await importNilai(file, selectedKokurikulerValue, kelasAktif?.id ?? 0);

						if (result.success) {
							toast(result.message || 'Nilai berhasil diimport', 'success');
							close();
							await invalidate('app:asesmen-kokurikuler');
							/* eslint-disable-next-line svelte/no-navigation-without-resolve */
							await goto(`?kokurikuler_id=${selectedKokurikulerValue}`);
						} else {
							toast(result.message || 'Gagal import nilai', 'error');
						}
					} catch (err) {
						console.error(err);
						toast(
							'Terjadi kesalahan saat import: ' + String((err as Error)?.message ?? err),
							'error'
						);
					} finally {
						isImportingFile = false;
					}
				}
			},
			onNegative: { label: 'Batal', icon: 'close' },
			dismissible: true
		});
	}

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

	function capitalizeSentence(value: string | null | undefined) {
		if (!value) return '';
		const trimmed = value.trimStart();
		if (!trimmed) return '';
		return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
	}
</script>

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h2 class="text-xl font-bold">
				Daftar Nilai Kokurikuler
				{#if selectedKokurikuler}
					- {capitalizeSentence(selectedKokurikuler.tujuan)}
				{/if}
			</h2>

			{#if kelasAktifLabel}
				<p class="text-base-content/80 block text-sm">{kelasAktifLabel}</p>
			{/if}
		</div>
	</div>

	<ActionButtons
		isDownloading={isDownloadingTemplate}
		isImporting={isImportingFile}
		disabled={!selectedKokurikulerHasDimensi || !canEdit}
		onDownload={handleDownloadTemplate}
		onImport={openImportModal}
	/>

	<div class="flex flex-col items-center gap-2 sm:flex-row">
		<label class="w-full md:max-w-80">
			<span class="sr-only">Pilih kokurikuler</span>
			<select
				class="select bg-base-200 w-full truncate dark:border-none"
				title={!canEdit
					? 'Anda tidak memiliki izin untuk mengubah'
					: (selectedKokurikulerLabel ?? 'Pilih kokurikuler')}
				bind:value={selectedKokurikulerValue}
				onchange={(event) =>
					handleKokurikulerChange((event.currentTarget as HTMLSelectElement).value)}
				disabled={!hasKokurikuler || !canEdit}
			>
				{#if !hasKokurikuler}
					<option value="">Belum ada kokurikuler</option>
				{:else}
					<option value="" disabled selected={selectedKokurikulerValue === ''}>
						Pilih Kokurikuler
					</option>
					{#each data.kokurikulerList as item (item.id)}
						<option value={String(item.id)}>{capitalizeSentence(item.tujuan)}</option>
					{/each}
				{/if}
			</select>
		</label>
		<form
			class="w-full"
			data-sveltekit-keepfocus
			data-sveltekit-replacestate
			autocomplete="off"
			onsubmit={submitSearch}
		>
			<label class="input bg-base-200 dark:bg-base-300 w-full dark:border-none">
				<Icon name="search" />
				<input
					type="search"
					name="q"
					value={searchTerm}
					autocomplete="name"
					placeholder="Cari nama murid..."
					oninput={handleSearchInput}
				/>
			</label>
		</form>
	</div>

	{#if !hasKokurikuler}
		<div class="alert alert-soft alert-info mt-6">
			<Icon name="info" />
			<span>
				Belum ada data kokurikuler untuk kelas ini. Tambahkan terlebih dahulu di menu
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<strong><a class="link" href="/kokurikuler">Kokurikuler</a></strong>.
			</span>
		</div>
	{:else if !selectedKokurikuler}
		<div class="alert alert-soft alert-warning mt-6">
			<Icon name="alert" />
			<span>Pilih kokurikuler untuk mulai menilai.</span>
		</div>
	{:else if data.muridCount === 0}
		<div class="alert alert-soft alert-warning mt-6">
			<Icon name="alert" />
			<span>
				Belum ada data murid di kelas ini. Tambahkan murid terlebih dahulu melalui menu
				<strong>Murid</strong>.
			</span>
		</div>
	{:else if data.totalMurid === 0}
		<div class="alert alert-soft alert-info mt-6">
			<Icon name="info" />
			<span>Tidak ada murid yang cocok dengan pencarian.</span>
		</div>
	{:else}
		<div
			class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
		>
			<table class="border-base-200 table min-w-150 border dark:border-none">
				<thead>
					<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
						<th style="width: 50px; min-width: 40px;">No</th>
						<th class="min-w-44">Nama</th>
						<th>Aksi</th>
						<th class="w-full" style="min-width: 240px;">Deskripsi</th>
					</tr>
				</thead>
				<tbody>
					{#each data.daftarMurid as murid (murid.id)}
						<tr>
							<td class="align-top">{murid.no}</td>
							<td class="align-top">
								{@html searchQueryMarker(data.search, murid.nama)}
							</td>
							<td class="align-top">
								<button
									type="button"
									class="btn btn-sm btn-soft shadow-none"
									onclick={() => openModalFor(murid)}
									disabled={!canEdit}
									title={!canEdit ? 'Anda tidak memiliki izin untuk menilai' : ''}
								>
									<Icon name="edit" />
									Nilai
								</button>
							</td>
							<td class="align-top">
								{#if murid.deskripsi}
									<p class="text-base-content text-sm">{murid.deskripsi}</p>
								{:else}
									<span class="text-base-content/70 text-sm italic"> Belum ada nilai </span>
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

<NilaiModal
	open={modalOpen}
	murid={activeMurid}
	kokurikuler={selectedKokurikuler}
	kategoriOptions={data.kategoriOptions}
	action="?/nilai"
	onClose={closeModal}
	onSuccess={handleModalSuccess}
/>
