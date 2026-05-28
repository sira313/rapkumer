<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- file-level: intentional prebuilt hrefs and small navigation helpers */
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import DeskripsiCell from '$lib/components/nilai-ekstrakurikuler/deskripsi-cell.svelte';
	import { searchQueryMarker } from '$lib/utils';
	import type { EkstrakurikulerNilaiKategori } from '$lib/ekstrakurikuler';
	import { onDestroy } from 'svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import ActionButtons from '$lib/components/nilai-ekstrakurikuler/action-buttons.svelte';
	import ImportModalBody from '$lib/components/nilai-ekstrakurikuler/import-modal-body.svelte';
	import { downloadTemplate, importNilai } from '$lib/components/nilai-ekstrakurikuler/api';

	type EkstrakurikulerOption = {
		id: number;
		nama: string;
		tujuanCount: number;
	};

	type EkstrakurikulerDetail = {
		id: number;
		nama: string;
		tujuan: Array<{ id: number; deskripsi: string }>;
	};

	type NilaiEntry = {
		tujuanId: number;
		tujuan: string;
		kategori: EkstrakurikulerNilaiKategori | null;
		kategoriLabel: string | null;
		timestamp: string | null;
	};

	type MuridRow = {
		id: number;
		nama: string;
		no: number;
		nilai: NilaiEntry[];
		deskripsi: string | null;
		hasNilai: boolean;
		lastUpdated: string | null;
	};

	type PaginationState = {
		currentPage: number;
		totalPages: number;
		// totalItems, perPage and search omitted when not used in this view
	};

	type PageData = {
		ekstrakurikulerList: EkstrakurikulerOption[];
		selectedEkstrakurikulerId: number | null;
		selectedEkstrakurikuler: EkstrakurikulerDetail | null;
		daftarMurid: MuridRow[];
		totalMurid: number;
		muridCount: number;
		search?: string | null;
		page: PaginationState;
	};

	let { data }: { data: PageData } = $props();

	const hasEkstrakurikuler = $derived.by(() => data.ekstrakurikulerList.length > 0);
	const selectedEkstrak = $derived.by(() => data.selectedEkstrakurikuler);
	const selectedEkstrakHasTujuan = $derived.by(() =>
		selectedEkstrak ? selectedEkstrak.tujuan.length > 0 : false
	);
	const currentPage = $derived.by(() => data.page?.currentPage ?? 1);
	const totalPages = $derived.by(() => Math.max(1, data.page?.totalPages ?? 1));
	const pages = $derived.by(() => Array.from({ length: totalPages }, (_, index) => index + 1));

	let selectedEkstrakValue = $state(
		data.selectedEkstrakurikulerId ? String(data.selectedEkstrakurikulerId) : ''
	);
	let searchTerm = $state(data.search ?? '');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	let isDownloadingTemplate = $state(false);
	let isImportingFile = $state(false);
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

	$effect(() => {
		selectedEkstrakValue = data.selectedEkstrakurikulerId
			? String(data.selectedEkstrakurikulerId)
			: '';
		searchTerm = data.search ?? '';
	});

	$effect(() => {
		if (!hasEkstrakurikuler) return;
		if (data.ekstrakurikulerList.length !== 1) return;
		const onlyId = String(data.ekstrakurikulerList[0].id);
		if (selectedEkstrakValue === onlyId) return;
		selectedEkstrakValue = onlyId;
		handleEkstrakChange(onlyId);
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
		await goto(target, { replaceState: true, keepFocus: true });
	}

	function handleEkstrakChange(value: string) {
		void applyNavigation((params) => {
			if (value) {
				params.set('ekstrakurikuler_id', value);
			} else {
				params.delete('ekstrakurikuler_id');
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

	async function handleDownloadTemplate() {
		if (!selectedEkstrakValue || !selectedEkstrakHasTujuan || !kelasAktif?.id) {
			toast(
				'Pilih ekstrakurikuler dan pastikan memiliki tujuan pembelajaran terlebih dahulu',
				'error'
			);
			return;
		}

		isDownloadingTemplate = true;
		try {
			const success = await downloadTemplate(selectedEkstrakValue, kelasAktif.id);
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
		if (!selectedEkstrakValue || !selectedEkstrakHasTujuan || !kelasAktif?.id) {
			toast(
				'Pilih ekstrakurikuler dan pastikan memiliki tujuan pembelajaran terlebih dahulu',
				'error'
			);
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
						const result = await importNilai(file, selectedEkstrakValue, kelasAktif?.id ?? 0);

						if (result.success) {
							toast(result.message || 'Nilai berhasil diimport', 'success');
							close();
							await invalidate('app:nilai-ekstrakurikuler');
							await goto(`?ekstrakurikuler_id=${selectedEkstrakValue}`);
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

	async function handleFileImport() {
		openImportModal();
	}

	function buildNilaiLink(muridId: number) {
		if (!selectedEkstrak) return '#';
		const redirectTarget = encodeURIComponent(`${page.url.pathname}${page.url.search}`);
		return `/nilai-ekstrakurikuler/form-asesmen?murid_id=${muridId}&ekstrakurikuler_id=${selectedEkstrak.id}&redirect=${redirectTarget}`;
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
				Daftar Nilai Ekstrakurikuler
				{#if selectedEkstrak}
					- {capitalizeSentence(selectedEkstrak.nama)}
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
		disabled={!selectedEkstrakHasTujuan || !canEdit}
		onDownload={handleDownloadTemplate}
		onImport={handleFileImport}
	/>

	<div class="flex flex-col items-center gap-2 sm:flex-row">
		<label class="w-full md:max-w-80">
			<span class="sr-only">Pilih ekstrakurikuler</span>
			<select
				class="select bg-base-200 w-full truncate dark:border-none"
				title={!canEdit ? 'Anda tidak memiliki izin untuk mengubah' : 'Pilih ekstrakurikuler'}
				bind:value={selectedEkstrakValue}
				onchange={(event) => handleEkstrakChange((event.currentTarget as HTMLSelectElement).value)}
				disabled={!hasEkstrakurikuler || !canEdit}
			>
				{#if !hasEkstrakurikuler}
					<option value="">Belum ada ekstrakurikuler</option>
				{:else}
					<option value="" disabled selected={selectedEkstrakValue === ''}>
						Pilih Ekstrakurikuler
					</option>
					{#each data.ekstrakurikulerList as item (item.id)}
						<option value={String(item.id)}>{capitalizeSentence(item.nama)}</option>
					{/each}
				{/if}
			</select>
		</label>
		<form
			class="w-full"
			autocomplete="off"
			data-sveltekit-keepfocus
			data-sveltekit-replacestate
			onsubmit={submitSearch}
		>
			<label class="input bg-base-200 dark:bg-base-300 w-full dark:border-none">
				<Icon name="search" />
				<input
					type="search"
					name="q"
					value={searchTerm}
					autocomplete="off"
					placeholder="Cari nama murid..."
					oninput={handleSearchInput}
				/>
			</label>
		</form>
	</div>

	{#if !hasEkstrakurikuler}
		<div class="alert alert-soft alert-info mt-6">
			<Icon name="info" />
			<span>
				Belum ada data ekstrakurikuler untuk kelas ini. Tambahkan terlebih dahulu di menu
				<strong>Ekstrakurikuler</strong>.
			</span>
		</div>
	{:else if !selectedEkstrak}
		<div class="alert alert-soft alert-warning mt-6">
			<Icon name="alert" />
			<span>Pilih ekstrakurikuler untuk mulai menilai.</span>
		</div>
	{:else if !selectedEkstrakHasTujuan}
		<div class="alert alert-soft alert-warning mt-6">
			<Icon name="alert" />
			<span>
				Ekstrakurikuler ini belum memiliki tujuan pembelajaran. Tambahkan tujuan terlebih dahulu
				melalui menu <strong>Ekstrakurikuler &gt; Tujuan</strong>.
			</span>
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
						<th class="min-w-48">Nama</th>
						<th class="min-w-32">Aksi</th>
						<th class="w-full" style="min-width: 240px;">Deskripsi Nilai</th>
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
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- intentional prebuilt href -->
								<a
									class="btn btn-sm btn-soft shadow-none"
									href={buildNilaiLink(murid.id)}
									class:btn-disabled={!selectedEkstrakHasTujuan || !canEdit}
									aria-disabled={!selectedEkstrakHasTujuan || !canEdit}
									title={!canEdit ? 'Anda tidak memiliki izin untuk menilai' : ''}
								>
									<Icon name="edit" />
									Nilai
								</a>
							</td>
							<td class="align-top">
								<DeskripsiCell text={murid.deskripsi} />
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
