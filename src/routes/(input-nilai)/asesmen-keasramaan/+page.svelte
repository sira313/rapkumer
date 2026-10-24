<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- file-level: intentional prebuilt hrefs and small navigation helpers */
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { onDestroy } from 'svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import KeasramaanSelector from '$lib/components/asesmen-keasramaan/keasramaan-selector.svelte';
	import SearchForm from '$lib/components/asesmen-keasramaan/search-form.svelte';
	import ActionButtons from '$lib/components/asesmen-keasramaan/action-buttons.svelte';
	import MuridTable from '$lib/components/asesmen-keasramaan/murid-table.svelte';
	import PaginationControls from '$lib/components/asesmen-keasramaan/pagination-controls.svelte';
	import EmptyStates from '$lib/components/asesmen-keasramaan/empty-states.svelte';
	import ImportModalBody from '$lib/components/asesmen-keasramaan/import-modal-body.svelte';
	import { capitalizeSentence, buildNilaiLink } from '$lib/components/asesmen-keasramaan/utils';
	import SvelteURLSearchParams from '$lib/svelte-helpers/url-search-params';
	import { downloadTemplate, importNilai } from '$lib/components/asesmen-keasramaan/api';
	import type { PageData } from '$lib/components/asesmen-keasramaan/types';

	let { data }: { data: PageData } = $props();

	const hasKeasramaan = $derived.by(() => data.keasramaanList.length > 0);
	const selectedKeasraam = $derived.by(() => data.selectedKeasramaan);
	const selectedKeasraamHasTujuan = $derived.by(() =>
		selectedKeasraam ? selectedKeasraam.tujuan.length > 0 : false
	);
	const currentPage = $derived.by(() => data.page?.currentPage ?? 1);
	const totalPages = $derived.by(() => Math.max(1, data.page?.totalPages ?? 1));

	// svelte-ignore state_referenced_locally
	let selectedKeasramaanValue = $state(
		data.selectedKeasramaanId ? String(data.selectedKeasramaanId) : ''
	);
	// svelte-ignore state_referenced_locally
	let searchTerm = $state(data.search ?? '');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	let isDownloadingTemplate = $state(false);
	let isImportingFile = $state(false);

	const kelasAktif = $derived(page.data.kelasAktif ?? null);
	const kelasAktifLabel = $derived.by(() => {
		if (!kelasAktif) return null;
		return kelasAktif.fase ? `${kelasAktif.nama} - ${kelasAktif.fase}` : kelasAktif.nama;
	});

	// Create navigation helper functions yang selalu gunakan URL terkini dari $page
	const nav = {
		async selectKeasramaan(value: string) {
			const params = new SvelteURLSearchParams(page.url.search);
			if (value) {
				params.set('keasramaan_id', value);
			} else {
				params.delete('keasramaan_id');
			}
			params.delete('page');
			const nextQuery = params.toString();
			const nextUrl = `${page.url.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
			await goto(nextUrl, { replaceState: true, keepFocus: true });
		},

		async applySearch(value: string) {
			const params = new SvelteURLSearchParams(page.url.search);
			const cleaned = value.trim();
			if (cleaned) {
				params.set('q', cleaned);
			} else {
				params.delete('q');
			}
			params.delete('page');
			const nextQuery = params.toString();
			const nextUrl = `${page.url.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
			await goto(nextUrl, { replaceState: true, keepFocus: true });
		},

		async gotoPage(pageNumber: number) {
			const params = new SvelteURLSearchParams(page.url.search);
			const sanitized = pageNumber < 1 ? 1 : pageNumber;
			if (sanitized <= 1) {
				params.delete('page');
			} else {
				params.set('page', String(sanitized));
			}
			const nextQuery = params.toString();
			const nextUrl = `${page.url.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
			await goto(nextUrl, { replaceState: true, keepFocus: true });
		}
	};

	$effect(() => {
		// Sinkronisasi state dengan data dari server
		// Jika server mengirim selectedKeasramaanId, gunakan nilai tersebut
		// Jika tidak, pertahankan nilai yang sudah ada di state (untuk kasus pagination)
		if (data.selectedKeasramaanId) {
			const newValue = String(data.selectedKeasramaanId);
			if (selectedKeasramaanValue !== newValue) {
				selectedKeasramaanValue = newValue;
			}
		}
		searchTerm = data.search ?? '';
	});

	$effect(() => {
		if (!hasKeasramaan) return;
		if (data.keasramaanList.length !== 1) return;
		const onlyId = String(data.keasramaanList[0].id);
		if (selectedKeasramaanValue === onlyId) return;
		selectedKeasramaanValue = onlyId;
		void nav.selectKeasramaan(onlyId);
	});

	async function handleDownloadTemplate() {
		if (!selectedKeasramaanValue || !selectedKeasraamHasTujuan || !kelasAktif?.id) {
			toast('Pilih Matev dan pastikan memiliki tujuan pembelajaran terlebih dahulu', 'error');
			return;
		}

		isDownloadingTemplate = true;
		try {
			const success = await downloadTemplate(selectedKeasramaanValue, kelasAktif.id);
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
		if (!selectedKeasramaanValue || !selectedKeasraamHasTujuan || !kelasAktif?.id) {
			toast('Pilih Matev dan pastikan memiliki tujuan pembelajaran terlebih dahulu', 'error');
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
						const result = await importNilai(file, selectedKeasramaanValue, kelasAktif?.id ?? 0);

						if (result.success) {
							toast(result.message || 'Nilai berhasil diimport', 'success');
							close();
							await invalidate('app:asesmen-keasramaan');
							// Tetap di halaman yang sama dengan keasramaan yang dipilih
							await goto(`?keasramaan_id=${selectedKeasramaanValue}`);
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
			onNeutral: { label: 'Batal', icon: 'close' },
			spreadActions: true,
			dismissible: true
		});
	}

	async function handleFileImport() {
		openImportModal();
	}

	function handleSearchInput(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		searchTerm = value;
		if (searchTimer) {
			clearTimeout(searchTimer);
		}
		searchTimer = setTimeout(() => {
			void nav.applySearch(value);
		}, 400);
	}

	function submitSearch(event: Event) {
		event.preventDefault();
		if (searchTimer) {
			clearTimeout(searchTimer);
			searchTimer = undefined;
		}
		void nav.applySearch(searchTerm);
	}

	onDestroy(() => {
		if (searchTimer) {
			clearTimeout(searchTimer);
		}
	});

	function handleNilaiClick(muridId: number) {
		if (!selectedKeasraam) return;
		const link = buildNilaiLink(muridId, selectedKeasraam.id, page.url.pathname, page.url.search);
		window.location.href = link;
	}
</script>

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h2 class="text-xl font-bold">
				Daftar Asesmen Keasramaan
				{#if selectedKeasraam}
					- {capitalizeSentence(selectedKeasraam.nama)}
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
		disabled={!selectedKeasraamHasTujuan}
		onDownload={handleDownloadTemplate}
		onImport={handleFileImport}
	/>

	<div class="flex flex-col items-center gap-2 sm:flex-row">
		<KeasramaanSelector
			keasramaanList={data.keasramaanList}
			selectedValue={selectedKeasramaanValue}
			disabled={!hasKeasramaan}
			onChange={(value) => void nav.selectKeasramaan(value)}
		/>
		<SearchForm value={searchTerm} onInput={handleSearchInput} onSubmit={submitSearch} />
	</div>

	{#if !hasKeasramaan}
		<EmptyStates state="no-keasramaan" />
	{:else if !selectedKeasraam}
		<EmptyStates state="no-selection" />
	{:else if !selectedKeasraamHasTujuan}
		<EmptyStates state="no-tujuan" />
	{:else if data.muridCount === 0}
		<EmptyStates state="no-murid" />
	{:else if data.totalMurid === 0}
		<EmptyStates state="no-results" />
	{:else}
		<MuridTable
			muridList={data.daftarMurid}
			search={data.search}
			disabled={!selectedKeasraamHasTujuan}
			onNilaiClick={handleNilaiClick}
		/>
		{#if totalPages > 1}
			<PaginationControls
				{currentPage}
				{totalPages}
				onPageClick={(pageNumber) => void nav.gotoPage(pageNumber)}
			/>
		{/if}
	{/if}
</div>
