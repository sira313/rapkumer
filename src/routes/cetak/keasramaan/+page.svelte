<script lang="ts">
	/* eslint-disable @typescript-eslint/no-unused-vars */
	// Keasramaan Preview with Bulk Support - similar to rapor
	import { page } from '$app/state';
	import PreviewHeader from '$lib/components/cetak/PreviewHeader.svelte';
	import DocumentMuridSelector from '$lib/components/cetak/DocumentMuridSelector.svelte';
	import PreviewContent from '$lib/components/cetak/PreviewContent.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { onDestroy, tick } from 'svelte';
	import {
		loadSinglePreview,
		isPreviewableDocument,
		buildPreviewButtonTitle,
		type DocumentType,
		type MuridData,
		type PreviewPayload
	} from '$lib/single-preview-logic';
	import {
		loadBulkPreviews_robust,
		buildBulkErrorMessage,
		type BulkPreviewRequest
	} from '$lib/bulk-preview-logic';

	let { data } = $props();

	const documentOptions: Array<{ value: DocumentType; label: string }> = [
		{ value: 'keasramaan', label: 'Rapor Keasramaan' }
	];

	let selectedDocument = $state<DocumentType | ''>('keasramaan');
	let selectedMuridId = $state('');
	let searchTerm = $state('');
	let previewDocument = $state<DocumentType | ''>('');
	let previewMetaTitle = $state('');
	let previewData = $state<PreviewPayload | null>(null);
	let previewMurid = $state<MuridData | null>(null);
	let previewPrintable = $state<HTMLDivElement | null>(null);
	let previewLoading = $state(false);
	let previewError = $state<string | null>(null);
	let showBgLogo = $state(true);

	// show TP listing: 'compact' | 'full-desc'
	let fullTP = $state<'compact' | 'full-desc'>('compact');

	// bulk print state
	let isBulkMode = $state(false);
	let bulkPreviewData = $state<Array<{ murid: MuridData; data: PreviewPayload }>>([]);
	let bulkPrintableNodes = $state<HTMLDivElement[]>([]);
	let waitingForPrintable = $state(false);
	let bulkLoadProgress = $state<{ current: number; total: number } | null>(null);

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

	const navigationMuridIds = $derived.by(() => {
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

	const canNavigateMurid = $derived.by(() => {
		if (!selectedDocument) return false;
		return hasMurid;
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

	const previewDisabled = $derived.by(() => !selectedDocument || !hasMurid || !selectedMurid);
	const previewButtonTitle = $derived.by(() => {
		return buildPreviewButtonTitle(selectedDocument, hasMurid, selectedMurid, false);
	});

	const isPrintLoading = $derived.by(() => previewLoading || waitingForPrintable);
	const printDisabled = $derived.by(() => !previewDocument || !previewPrintable || isPrintLoading);
	const printButtonTitle = $derived.by(() => {
		if (!previewDocument) {
			return 'Preview dokumen terlebih dahulu sebelum mencetak';
		}
		if (isPrintLoading) {
			return isBulkMode && bulkPreviewData.length > 0
				? 'Menyiapkan dokumen untuk dicetak, tunggu sebentar...'
				: 'Preview sedang disiapkan untuk dicetak';
		}
		if (!previewPrintable) {
			return 'Preview sedang disiapkan untuk dicetak';
		}
		if (isBulkMode) {
			return `Cetak ${bulkPreviewData.length} rapor keasramaan untuk semua murid`;
		}
		const targetName = previewMurid?.nama ?? 'murid ini';
		return `Cetak rapor keasramaan untuk ${targetName}`;
	});

	let previewAbortController: AbortController | null = null;

	async function handlePreview(murid: MuridData) {
		const documentType = selectedDocument;
		if (!documentType || !isPreviewableDocument(documentType)) {
			return;
		}

		if (previewAbortController) {
			previewAbortController.abort();
		}
		const controller = new AbortController();
		previewAbortController = controller;

		previewLoading = true;
		previewError = null;

		try {
			const result = await loadSinglePreview({
				documentType,
				murid,
				kelasId: data.kelasId ? Number(data.kelasId) : undefined,
				tpMode: fullTP,
				criteria: { kritCukup: 85, kritBaik: 95 },
				signal: controller.signal
			});

			if (controller.signal.aborted) {
				return;
			}

			previewDocument = documentType;
			previewData = result.data;
			previewMetaTitle = result.title;
			previewMurid = murid;
		} catch (err) {
			if (controller.signal.aborted) {
				return;
			}
			console.error('Preview error:', err);
			const errorMsg = err instanceof Error ? err.message : 'Gagal memuat preview dokumen';
			previewError = errorMsg;
			toast(errorMsg, 'error');
		} finally {
			previewLoading = false;
			previewAbortController = null;
		}

		await tick();
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
		selectedMuridId = targetId;
		await tick();
		if (previewDocument === selectedDocument && selectedMurid) {
			await handlePreview(selectedMurid);
		}
	}

	async function handleBulkPreview() {
		const documentType = selectedDocument;
		if (!documentType || !isPreviewableDocument(documentType)) {
			return;
		}

		const muridList = daftarMurid;

		if (!muridList.length) {
			toast('Tidak ada murid yang dapat di-preview untuk kelas ini.', 'warning');
			return;
		}

		if (previewAbortController) {
			previewAbortController.abort();
		}
		const controller = new AbortController();
		previewAbortController = controller;

		previewLoading = true;
		previewError = null;

		try {
			let lastProgressUpdate = 0;
			const result = await loadBulkPreviews_robust({
				documentType,
				muridList,
				kelasId: data.kelasId ? Number(data.kelasId) : undefined,
				tpMode: fullTP,
				criteria: { kritCukup: 85, kritBaik: 95 },
				signal: controller.signal,
				onProgress: (current, total) => {
					// Debounce progress updates to avoid excessive re-renders
					const now = Date.now();
					if (now - lastProgressUpdate > 100) {
						bulkLoadProgress = { current, total };
						lastProgressUpdate = now;
					}
				}
			});

			if (controller.signal.aborted) {
				return;
			}

			if (!result.isValid) {
				const docLabel = selectedDocumentEntry?.label ?? 'dokumen';
				const errorMsg = buildBulkErrorMessage(docLabel, result.failureCount, result.failedMurids);
				previewError = errorMsg;
				toast(errorMsg, 'warning');

				// Still show successful ones if any
				if (result.data.length === 0) {
					previewAbortController = null;
					previewLoading = false;
					return;
				}
			}

			isBulkMode = true;
			bulkPreviewData = result.data;
			previewDocument = documentType;
			previewMetaTitle = `${selectedDocumentEntry?.label ?? 'Dokumen'} - Semua Murid`;
			bulkLoadProgress = null; // Clear progress indicator
			waitingForPrintable = true;
		} catch (err) {
			if (controller.signal.aborted) {
				return;
			}
			bulkLoadProgress = null;
			console.error('Bulk preview error:', err);
			const errorMsg = err instanceof Error ? err.message : 'Gagal memuat preview dokumen';
			previewError = errorMsg;
			toast(errorMsg, 'error');
		} finally {
			previewLoading = false;
			previewAbortController = null;
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
			// All nodes are ready
			const isRapor = previewDocument === 'rapor';

			// Delay calculation:
			// - Rapor: 600ms (reduced from 1.5s)
			// - Other docs: 200ms (reduced from 300ms)
			let delay = 200;
			if (isRapor) {
				delay = 600;
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
	});

	onDestroy(() => {
		if (previewAbortController) {
			previewAbortController.abort();
		}
	});
</script>

<svelte:head>
	<title>{headingTitle}</title>
</svelte:head>

<div class="page-container bg-base-100 min-h-screen">
	<PreviewHeader
		{headingTitle}
		kelasAktifLabel={null}
		academicContext={null}
	/>

	<div class="flex flex-col gap-6 px-4 py-6">
		<DocumentMuridSelector
			bind:selectedDocument
			bind:searchTerm
			{daftarMurid}
			selectedTemplate="1"
			piagamRankingOptions={[]}
			documentOptions={[{ value: 'keasramaan' as DocumentType, label: 'Rapor Keasramaan' }]}
			onPreviewMurid={handlePreview}
			onBulkDownload={handleBulkPreview}
			downloadDisabled={previewDisabled}
			downloadLoading={isPrintLoading}
			showTable={false}
			muridCount={daftarMurid.length ?? 0}
			isRaporSelected={false}
			isKeasramaanSelected={true}
			isBiodataSelected={false}
			tpMode={fullTP}
			onToggleFullTP={(value: 'compact' | 'full-desc') => {
				fullTP = value;
			}}
			kelasId={data.kelasId}
			{showBgLogo}
			onToggleBgLogo={(value: boolean) => {
				showBgLogo = value;
			}}
			onBgRefresh={() => {}}
			kritCukup={85}
			kritBaik={95}
			onSetKriteria={() => {}}
		/>

		<PreviewContent
			previewDocument={previewDocument as DocumentType | ''}
			{previewData}
			{previewError}
			selectedTemplate="1"
			bgRefreshKey={0}
			{showBgLogo}
			onPrintableReady={handlePrintableReady}
			onBulkPrintableReady={handleBulkPrintableReady}
		/>
	</div>
</div>

<style lang="postcss">
	:global(html) {
		scroll-behavior: smooth;
	}

	.page-container {
	}
</style>
