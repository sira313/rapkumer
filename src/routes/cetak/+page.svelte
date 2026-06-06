<script lang="ts">
	/* eslint-disable @typescript-eslint/no-unused-vars */
	import { page } from '$app/state';
	import PreviewHeader from '$lib/components/cetak/PreviewHeader.svelte';
	import DocumentMuridSelector from '$lib/components/cetak/DocumentMuridSelector.svelte';
	import PreviewFooter from '$lib/components/cetak/PreviewFooter.svelte';
	import PreviewContent from '$lib/components/cetak/PreviewContent.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { tick, onMount } from 'svelte';
	import {
		loadSinglePreview,
		isPreviewableDocument,
		type DocumentType,
		type MuridData,
		type PreviewPayload
	} from '$lib/single-preview-logic';
	import { loadBulkPreviews_robust, buildBulkErrorMessage } from '$lib/bulk-preview-logic';
	import { DEFAULT_RAPOR_CRITERIA, type RaporPeriode } from '$lib/rapor-params';
	let { data } = $props();

	const userType = $derived((page.data.user as { type?: string } | null)?.type);

	const documentOptions = $derived.by<Array<{ value: DocumentType; label: string }>>(() => {
		const all: Array<{ value: DocumentType; label: string }> = [
			{ value: 'cover', label: 'Cover' },
			{ value: 'biodata', label: 'Biodata' },
			{ value: 'rapor', label: 'Rapor' },
			{ value: 'piagam', label: 'Piagam' },
			{ value: 'keasramaan', label: 'Rapor Keasramaan' }
		];
		if (userType === 'wali_asuh') {
			return all.filter((o) => o.value === 'keasramaan');
		}
		return all;
	});

	let selectedDocument = $state<DocumentType | ''>('');
	let selectedRaporPeriode = $state<RaporPeriode | ''>('');
	let selectedMuridId = $state('');
	let selectedTemplate = $state<'1' | '2'>('1');
	let previewDocument = $state<DocumentType | ''>('');
	let previewMetaTitle = $state('');
	let previewData = $state<PreviewPayload | null>(null);
	let previewMurid = $state<MuridData | null>(null);
	let previewPrintable = $state<HTMLDivElement | null>(null);
	let previewLoading = $state(false);
	let previewError = $state<string | null>(null);
	let showBgLogo = $state(true);
	let downloadLoading = $state(false);

	let pdfViewerUrl = $state('');
	let pdfViewerTitle = $state('');
	let pdfViewerEl = $state<HTMLElement | null>(null);

	// show TP listing: 'compact' | 'full-desc'
	let fullTP = $state<'compact' | 'full-desc'>('compact');

	// Kriteria intrakurikuler (defaults per spec)

	let kritCukup = $state<number>(DEFAULT_RAPOR_CRITERIA.kritCukup);
	let kritBaik = $state<number>(DEFAULT_RAPOR_CRITERIA.kritBaik);

	// Load persisted criteria from localStorage (if available)
	// Load persisted criteria from server (if available). Falls back to defaults.
	onMount(async () => {
		try {
			const res = await fetch('/api/sekolah/rapor-kriteria');
			if (res.ok) {
				const json = await res.json();
				const lc = json?.cukup;
				const lb = json?.baik;
				if (lc !== undefined && !Number.isNaN(Number(lc))) kritCukup = Number(lc);
				if (lb !== undefined && !Number.isNaN(Number(lb))) kritBaik = Number(lb);
			}
		} catch {
			// ignore network errors — keep defaults
		}
	});

	// bulk print state
	let isBulkMode = $state(false);
	let bulkPreviewData = $state<Array<{ murid: MuridData; data: PreviewPayload }>>([]);
	let bulkPrintableNodes = $state<HTMLDivElement[]>([]);
	let waitingForPrintable = $state(false);
	let bulkLoadProgress = $state<{ current: number; total: number } | null>(null);

	// increment this to bust background cache after upload
	let bgRefreshKey = $state<number>(0);

	const academicContext = $derived(data.academicContext ?? null);

	const kelasAktif = $derived(page.data.kelasAktif ?? null);
	const kelasAktifLabel = $derived.by(() => {
		if (!kelasAktif) return null;
		return kelasAktif.fase ? `${kelasAktif.nama} - ${kelasAktif.fase}` : kelasAktif.nama;
	});

	const piagamRankingOptions = $derived(data.piagamRankingOptions ?? []);
	const hasPiagamRankingOptions = $derived.by(() => piagamRankingOptions.length > 0);
	const daftarMurid = $derived(data.daftarMurid ?? []);
	const muridCount = $derived.by(() => daftarMurid.length);
	const hasMurid = $derived.by(() => muridCount > 0);
	const selectedMurid = $derived.by<MuridData | null>(() => {
		const murid = daftarMurid.find((item) => String(item.id) === selectedMuridId);
		return murid
			? {
					id: murid.id,
					nama: murid.nama,
					nis: murid.nis,
					nisn: murid.nisn
				}
			: null;
	});
	const isPiagamSelected = $derived.by(() => selectedDocument === 'piagam');
	const navigationMuridIds = $derived.by(() => {
		if (isPiagamSelected) {
			return piagamRankingOptions.map((option) => String(option.muridId));
		}
		return daftarMurid.map((murid) => String(murid.id));
	});
	const selectedMuridIndex = $derived.by(() => {
		if (!selectedMuridId) return -1;
		return navigationMuridIds.findIndex((id) => id === selectedMuridId);
	});
	const hasPrevMurid = $derived.by(() => selectedMuridIndex > 0);
	const hasNextMurid = $derived.by(
		() => selectedMuridIndex >= 0 && selectedMuridIndex < navigationMuridIds.length - 1
	);
	const hasSelectionOptions = $derived.by(() =>
		isPiagamSelected ? hasPiagamRankingOptions : hasMurid
	);
	const canNavigateMurid = $derived.by(() => {
		if (!selectedDocument) return false;
		if (!hasSelectionOptions) return false;
		return selectedMuridIndex >= 0 && navigationMuridIds.length > 0;
	});
	const isPreviewMatchingSelection = $derived.by(() =>
		Boolean(previewDocument && selectedDocument && selectedDocument === previewDocument)
	);

	// Reset preview state when document selection changes
	$effect(() => {
		if (selectedDocument) {
			resetCetak();
		}
	});

	$effect(() => {
		if (isPiagamSelected) {
			const rankingOptions = piagamRankingOptions;
			if (!rankingOptions.length) {
				if (selectedMuridId) {
					selectedMuridId = '';
				}
				return;
			}
			if (
				selectedMuridId &&
				!rankingOptions.some((option) => String(option.muridId) === selectedMuridId)
			) {
				selectedMuridId = '';
			}
			return;
		}

		const list = daftarMurid;
		if (!list.length) {
			if (selectedMuridId) {
				selectedMuridId = '';
			}
			return;
		}
		if (selectedMuridId && !list.some((murid) => String(murid.id) === selectedMuridId)) {
			selectedMuridId = '';
		}
	});

	const selectedDocumentEntry = $derived.by(
		() => documentOptions.find((option) => option.value === selectedDocument) ?? null
	);
	const previewDocumentEntry = $derived.by(
		() => documentOptions.find((option) => option.value === previewDocument) ?? null
	);
	const headingDocumentLabel = $derived.by(() => {
		if (previewDocumentEntry?.label) return previewDocumentEntry.label;
		if (selectedDocumentEntry?.label) return selectedDocumentEntry.label;
		return 'Dokumen';
	});
	const headingMuridName = $derived.by(() => {
		if (previewMurid?.nama) return previewMurid.nama;
		if (selectedMurid?.nama) return selectedMurid.nama;
		return '';
	});
	const headingTitle = $derived.by(() => {
		const parts: string[] = ['Cetak'];
		const docLabel = headingDocumentLabel.trim();
		if (docLabel) parts.push(docLabel);
		const muridLabel = headingMuridName.trim();
		if (muridLabel) parts.push(muridLabel);
		return parts.join(' - ');
	});

	const downloadDisabled = $derived.by(
		() => !selectedDocument || !hasSelectionOptions || !selectedMurid || downloadLoading
	);
	const downloadButtonTitle = $derived.by(() => {
		if (!selectedDocument) return 'Pilih dokumen terlebih dahulu';
		if (!hasSelectionOptions) {
			return isPiagamSelected
				? 'Tidak ada data peringkat piagam untuk kelas ini'
				: 'Tidak ada murid di kelas ini';
		}
		if (!selectedMurid) {
			return isPiagamSelected ? 'Pilih peringkat piagam' : 'Pilih murid';
		}
		if (downloadLoading) return 'Sedang membuat PDF...';
		return `Download PDF ${selectedDocumentEntry?.label ?? 'dokumen'} untuk ${selectedMurid.nama}`;
	});

	let previewAbortController: AbortController | null = null;
	let keydownHandler: ((event: KeyboardEvent) => void) | null = null;

	function resetCetak() {
		previewDocument = '';
		previewMetaTitle = '';
		previewData = null;
		previewMurid = null;
		previewPrintable = null;
		isBulkMode = false;
		bulkPreviewData = [];
		bulkPrintableNodes = [];
		waitingForPrintable = false;
	}

	const docLabel = $derived.by(() => {
		const base =
			selectedDocumentEntry?.label?.replace(/\s+/g, '-')?.toLowerCase() ?? selectedDocument;
		if (selectedDocument === 'rapor' && selectedRaporPeriode === 'rts') {
			return 'rapor-tengah-semester';
		}
		return base;
	});

	async function handleDownloadSingle() {
		const documentType = selectedDocument;
		if (!documentType) {
			toast('Pilih dokumen terlebih dahulu', 'warning');
			return;
		}
		if (!isPreviewableDocument(documentType)) {
			return;
		}
		if (!hasSelectionOptions) {
			const message =
				documentType === 'piagam'
					? 'Tidak ada data peringkat piagam untuk kelas ini.'
					: 'Tidak ada murid di kelas ini.';
			toast(message, 'warning');
			return;
		}
		const murid = selectedMurid;
		if (!murid) {
			const message =
				documentType === 'piagam'
					? 'Pilih peringkat piagam yang ingin diunduh.'
					: 'Pilih murid yang ingin diunduh.';
			toast(message, 'warning');
			return;
		}

		await loadPdf(murid);
	}

	async function scrollToViewer() {
		await tick();
		pdfViewerEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	async function loadPdf(murid: MuridData) {
		const documentType = selectedDocument;
		if (!documentType) return;
		downloadLoading = true;
		try {
			const res = await fetch('/api/pdf/token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					docType: documentType,
					muridId: murid.id,
					kelasId: data.kelasId ? Number(data.kelasId) : undefined,
					tpMode: fullTP,
					kriteria: { kritCukup, kritBaik },
					template: documentType === 'piagam' ? selectedTemplate : undefined,
					docLabel,
					bgLogo: showBgLogo,
					raporPeriode:
						documentType === 'rapor' && selectedRaporPeriode ? selectedRaporPeriode : undefined
				})
			});
			if (!res.ok) throw new Error('Gagal mendapatkan token');
			const { token, slug } = await res.json();

			const pdfRes = await fetch(`/cetak/pdf/${slug}/${token}`);
			if (!pdfRes.ok) throw new Error('Gagal memuat PDF');
			const blob = await pdfRes.blob();

			if (pdfViewerUrl) URL.revokeObjectURL(pdfViewerUrl);
			pdfViewerUrl = URL.createObjectURL(blob);
			pdfViewerTitle = slug
				.split('-')
				.map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
				.join(' ');

			scrollToViewer();

			toast('PDF berhasil dimuat', 'success');
		} catch (err) {
			console.error('Download error:', err);
			toast('Gagal membuka PDF', 'error');
		} finally {
			downloadLoading = false;
		}
	}

	async function navigateMurid(direction: 'prev' | 'next') {
		if (!canNavigateMurid) return;
		const list = navigationMuridIds;
		const currentIndex = selectedMuridIndex;
		if (currentIndex < 0) return;
		const offset = direction === 'next' ? 1 : -1;
		const targetIndex = currentIndex + offset;
		if (targetIndex < 0 || targetIndex >= list.length) return;
		const targetId = list[targetIndex];
		const wasViewerOpen = !!pdfViewerUrl;
		selectedMuridId = targetId;
		await tick();
		if (wasViewerOpen) {
			const murid = selectedMurid;
			if (murid) loadPdf(murid);
		}
	}

	async function handleDownloadBulk() {
		const documentType = selectedDocument;
		if (!documentType) {
			toast('Pilih dokumen terlebih dahulu', 'warning');
			return;
		}
		if (!isPreviewableDocument(documentType)) {
			return;
		}

		const muridList = isPiagamSelected
			? piagamRankingOptions.map((option) => ({
					id: option.muridId,
					nama: option.nama,
					nis: null,
					nisn: null
				}))
			: daftarMurid;

		if (!muridList.length) {
			const message = isPiagamSelected
				? 'Tidak ada data peringkat piagam untuk kelas ini.'
				: 'Tidak ada murid di kelas ini.';
			toast(message, 'warning');
			return;
		}

		downloadLoading = true;

		try {
			const res = await fetch('/api/pdf/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					docType: documentType,
					muridIds: muridList.map((m) => m.id),
					kelasId: data.kelasId ? Number(data.kelasId) : undefined,
					tpMode: fullTP === 'full-desc' ? 'full-desc' : undefined,
					criteria: { kritCukup, kritBaik },
					template: documentType === 'piagam' ? selectedTemplate : undefined,
					docLabel: selectedDocumentEntry?.label ?? documentType,
					kelasLabel: kelasAktifLabel ? kelasAktifLabel.replace(/\s+/g, '') : 'Semua-Kelas',
					bgLogo: showBgLogo,
					raporPeriode:
						documentType === 'rapor' && selectedRaporPeriode ? selectedRaporPeriode : undefined
				})
			});

			if (!res.ok) {
				const errBody = await res.json().catch(() => ({}));
				throw new Error(errBody?.message || 'Gagal membuat PDF bulk');
			}

			const blob = await res.blob();
			const filename = `${selectedDocumentEntry?.label || documentType}-${kelasAktifLabel ? kelasAktifLabel.replace(/\s+/g, '') : 'Semua-Kelas'}-${muridList.length}murid.pdf`;
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);

			toast('PDF berhasil dibuat!', 'success');
		} catch (err) {
			console.error('Bulk download error:', err);
			const errorMsg = err instanceof Error ? err.message : 'Gagal membuat PDF';
			toast(errorMsg, 'error');
		} finally {
			downloadLoading = false;
		}
	}

	function handlePrintableReady(node: HTMLDivElement | null) {
		previewPrintable = node;
	}

	function handleBulkPrintableReady(index: number, node: HTMLDivElement | null) {
		if (node) {
			bulkPrintableNodes[index] = node;
		}
	}

	// Watch for all bulk printable nodes to be ready
	$effect(() => {
		if (!isBulkMode || bulkPreviewData.length === 0) {
			return;
		}

		const nodes = bulkPrintableNodes;
		const expectedCount = bulkPreviewData.length;
		const readyCount = nodes.filter(Boolean).length;

		if (readyCount === expectedCount) {
			// All nodes are ready, but for rapor we need to wait for pagination
			const isRapor = previewDocument === 'rapor';
			const isFullDesc = fullTP === 'full-desc';

			// Delay calculation:
			// - Rapor + Full Desc: 800ms (reduced from 3s)
			// - Rapor + Compact: 600ms (reduced from 1.5s)
			// - Other docs: 200ms (reduced from 300ms)
			let delay = 200;
			if (isRapor) {
				delay = isFullDesc ? 800 : 600;
			}

			const timeoutId = setTimeout(() => {
				const wrapper = document.createElement('div');
				nodes.forEach((n) => {
					if (n) {
						const clone = n.cloneNode(true) as HTMLDivElement;
						wrapper.appendChild(clone);
					}
				});
				previewPrintable = wrapper;
				waitingForPrintable = false;
			}, delay);

			return () => clearTimeout(timeoutId);
		}

		// Safety timeout - if nodes aren't ready after 15 seconds, give up and use what we have
		const timeoutId = setTimeout(() => {
			if (readyCount > 0) {
				const wrapper = document.createElement('div');
				nodes.forEach((n) => {
					if (n) {
						const clone = n.cloneNode(true) as HTMLDivElement;
						wrapper.appendChild(clone);
					}
				});
				previewPrintable = wrapper;
				waitingForPrintable = false;
				console.warn(
					`Bulk preview timeout: only ${readyCount}/${expectedCount} nodes ready, proceeding anyway`
				);
			}
		}, 15000);

		return () => clearTimeout(timeoutId);
	});

	// When bulk mode showBgLogo changes, reset bulk nodes to wait for re-render
	$effect(() => {
		if (!isBulkMode) {
			return;
		}
		void showBgLogo; // track dependency
		bulkPrintableNodes = [];
		waitingForPrintable = true;
	});

	async function handleBgRefresh() {
		bgRefreshKey = Date.now();
	}
</script>

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<PreviewHeader
		{headingTitle}
		{kelasAktifLabel}
		{academicContext}
		{canNavigateMurid}
		{hasPrevMurid}
		{hasNextMurid}
		loading={downloadLoading}
		onNavigatePrev={() => navigateMurid('prev')}
		onNavigateNext={() => navigateMurid('next')}
	/>

	<DocumentMuridSelector
		bind:selectedDocument
		bind:selectedTemplate
		bind:selectedRaporPeriode
		bind:selectedMuridId
		{daftarMurid}
		{piagamRankingOptions}
		{documentOptions}
		onDownload={handleDownloadSingle}
		onBulkDownload={handleDownloadBulk}
		{downloadDisabled}
		{downloadButtonTitle}
		{downloadLoading}
	/>

	<PreviewFooter
		{hasMurid}
		{muridCount}
		{isPiagamSelected}
		{selectedTemplate}
		isRaporSelected={selectedDocument === 'rapor'}
		isBiodataSelected={selectedDocument === 'biodata'}
		isKeasramaanSelected={selectedDocument === 'keasramaan'}
		{kritCukup}
		{kritBaik}
		tpMode={fullTP}
		kelasId={data.kelasId}
		{showBgLogo}
		onToggleBgLogo={(value: boolean) => {
			showBgLogo = value;
		}}
		onSetKriteria={(cukup: number, baik: number) => {
			// optimistic update in UI
			kritCukup = cukup;
			kritBaik = baik;
			// persist to server (requires sekolah_manage permission)
			fetch('/api/sekolah/rapor-kriteria', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ cukup: kritCukup, baik: kritBaik })
			})
				.then(async (res) => {
					if (res.ok) {
						toast('Kriteria rapor tersimpan di server.', 'success');
					} else {
						const payload = await res.json().catch(() => ({}));
						console.error('Gagal menyimpan kriteria rapor', payload);
						toast(payload?.error ?? 'Gagal menyimpan kriteria rapor.', 'error');
					}
				})
				.catch((err) => {
					console.error('Error saving kriteria rapor', err);
					toast('Gagal menyimpan kriteria rapor (jaringan).', 'error');
				});
		}}
		onToggleFullTP={(value: 'compact' | 'full-desc') => {
			fullTP = value;
		}}
		onBgRefresh={handleBgRefresh}
	/>
</div>

{#if pdfViewerUrl}
	<object
		bind:this={pdfViewerEl}
		data={pdfViewerUrl}
		type="application/pdf"
		class="rounded-box mt-4 h-[85vh] w-full"
		title={pdfViewerTitle}
	>
		<embed src={pdfViewerUrl} type="application/pdf" class="h-full w-full" />
	</object>
{/if}

<PreviewContent
	{previewDocument}
	{previewData}
	{previewError}
	{selectedTemplate}
	{bgRefreshKey}
	{showBgLogo}
	onPrintableReady={handlePrintableReady}
	onBulkPrintableReady={handleBulkPrintableReady}
/>
