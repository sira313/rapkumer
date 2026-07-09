<script lang="ts">
	import { page } from '$app/state';
	import PreviewHeader from '$lib/components/cetak/PreviewHeader.svelte';
	import DocumentMuridSelector from '$lib/components/cetak/DocumentMuridSelector.svelte';
	import PdfPreviewModal from '$lib/components/cetak/PdfPreviewModal.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { onDestroy, onMount } from 'svelte';
	import { DEFAULT_RAPOR_CRITERIA, type RaporPeriode } from '$lib/rapor-params';

	type DocumentType = 'cover' | 'biodata' | 'rapor' | 'piagam' | 'keasramaan' | 'jurnal-mengajar';
	type MuridData = {
		id: number;
		nama: string;
		nis?: string | null;
		nisn?: string | null;
	};

	let { data } = $props();

	const userType = $derived((page.data.user as { type?: string } | null)?.type);

	const documentOptions = $derived.by<Array<{ value: DocumentType; label: string }>>(() => {
		const all: Array<{ value: DocumentType; label: string }> = [
			{ value: 'cover', label: 'Cover' },
			{ value: 'biodata', label: 'Biodata' },
			{ value: 'rapor', label: 'Rapor' },
			{ value: 'piagam', label: 'Piagam' },
			{ value: 'keasramaan', label: 'Rapor Keasramaan' },
			{ value: 'jurnal-mengajar', label: 'Jurnal Mengajar' }
		];
		if (userType === 'wali_asuh') {
			return all.filter((o) => o.value === 'keasramaan');
		}
		if (userType === 'user') {
			return all.filter((o) => o.value === 'jurnal-mengajar');
		}
		return all;
	});

	let selectedDocument = $state<DocumentType | ''>('');
	let selectedRaporPeriode = $state<RaporPeriode | ''>('');
	let selectedTemplate = $state<'1' | '2'>('1');
	let searchTerm = $state('');
	let showBgLogo = $state(true);
	let downloadLoading = $state(false);

	// show TP listing: 'compact' | 'full-desc'
	let fullTP = $state<'compact' | 'full-desc'>('compact');

	let kritCukup = $state<number>(DEFAULT_RAPOR_CRITERIA.kritCukup);
	let kritBaik = $state<number>(DEFAULT_RAPOR_CRITERIA.kritBaik);

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
			// ignore
		}
	});

	onDestroy(() => {
		if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
	});

	// Jurnal mengajar date range
	let jurnalTanggalMulai = $state('');
	let jurnalTanggalSelesai = $state('');

	$effect(() => {
		jurnalTanggalMulai = data.tanggalMasuk || '';
		jurnalTanggalSelesai = data.tanggalBagiRaport || '';
	});
	const isJurnalMengajar = $derived(selectedDocument === 'jurnal-mengajar');
	const isPiagamSelected = $derived(selectedDocument === 'piagam');

	const academicContext = $derived(data.academicContext ?? null);
	const kelasAktif = $derived(page.data.kelasAktif ?? null);
	const kelasAktifLabel = $derived.by(() => {
		if (!kelasAktif) return null;
		return kelasAktif.fase ? `${kelasAktif.nama} - ${kelasAktif.fase}` : kelasAktif.nama;
	});

	const piagamRankingOptions = $derived(data.piagamRankingOptions ?? []);
	const hasPiagamRankingOptions = $derived(piagamRankingOptions.length > 0);
	const daftarMurid = $derived(data.daftarMurid ?? []);
	const muridCount = $derived(daftarMurid.length);
	const hasMurid = $derived(muridCount > 0);

	const hasSelectionOptions = $derived(
		isJurnalMengajar
			? Boolean(jurnalTanggalMulai && jurnalTanggalSelesai)
			: isPiagamSelected
				? hasPiagamRankingOptions
				: hasMurid
	);

	const downloadDisabled = $derived(!selectedDocument || !hasSelectionOptions || downloadLoading);

	const selectedDocumentEntry = $derived(
		documentOptions.find((option) => option.value === selectedDocument) ?? null
	);

	const headingTitle = $derived.by(() => {
		const parts: string[] = ['Cetak'];
		const docLabel = selectedDocumentEntry?.label?.trim();
		if (docLabel) parts.push(docLabel);
		return parts.join(' - ');
	});

	const docLabel = $derived.by(() => {
		const base =
			selectedDocumentEntry?.label?.replace(/\s+/g, '-')?.toLowerCase() ?? selectedDocument;
		if (selectedDocument === 'rapor' && selectedRaporPeriode === 'rts') {
			return 'rapor-tengah-semester';
		}
		return base;
	});

	// PDF preview modal state
	let pdfPreviewUrl = $state('');
	let pdfPreviewTitle = $state('');
	let pdfModalOpen = $state(false);

	// preview navigation (prev/next murid within filtered list)
	let previewMuridList = $state<MuridData[]>([]);
	let previewMuridIndex = $state(-1);
	const hasPrevMurid = $derived(previewMuridIndex > 0);
	const hasNextMurid = $derived(previewMuridIndex < previewMuridList.length - 1);

	function closePdfModal() {
		if (pdfPreviewUrl) {
			URL.revokeObjectURL(pdfPreviewUrl);
		}
		pdfPreviewUrl = '';
		pdfPreviewTitle = '';
		pdfModalOpen = false;
		previewMuridList = [];
		previewMuridIndex = -1;
	}

	async function navigateMurid(direction: 'prev' | 'next') {
		const list = previewMuridList;
		const currentIndex = previewMuridIndex;
		if (currentIndex < 0) return;
		const offset = direction === 'next' ? 1 : -1;
		const targetIndex = currentIndex + offset;
		if (targetIndex < 0 || targetIndex >= list.length) return;
		const murid = list[targetIndex];
		if (!murid) return;
		previewMuridIndex = targetIndex;
		await handlePreviewMurid(murid);
	}

	function handleNavigatePrev() {
		navigateMurid('prev');
	}

	function handleNavigateNext() {
		navigateMurid('next');
	}

	async function handlePreviewMurid(murid: MuridData) {
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

			closePdfModal();

			let navList: MuridData[];
			if (isPiagamSelected) {
				const q = searchTerm.trim().toLowerCase();
				navList = piagamRankingOptions
					.filter((o) => !q || o.nama.toLowerCase().includes(q))
					.map((o) => ({ id: o.muridId, nama: o.nama }));
			} else {
				const q = searchTerm.trim().toLowerCase();
				navList = daftarMurid.filter((m) => !q || m.nama.toLowerCase().includes(q));
			}
			const navIdx = navList.findIndex((m) => m.id === murid.id);
			if (navIdx >= 0) {
				previewMuridList = navList;
				previewMuridIndex = navIdx;
			} else {
				previewMuridList = [];
				previewMuridIndex = -1;
			}

			if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
			pdfPreviewUrl = URL.createObjectURL(blob);
			pdfPreviewTitle = `${selectedDocumentEntry?.label ?? 'Dokumen'} - ${murid.nama}`;
			pdfModalOpen = true;
		} catch (err) {
			console.error('Preview error:', err);
			toast('Gagal membuka PDF', 'error');
		} finally {
			downloadLoading = false;
		}
	}

	async function handlePreviewJurnal() {
		if (!isJurnalMengajar) return;
		if (!jurnalTanggalMulai || !jurnalTanggalSelesai) {
			toast('Pilih rentang tanggal terlebih dahulu', 'warning');
			return;
		}

		downloadLoading = true;
		try {
			const params = new URLSearchParams({
				tanggal_mulai: jurnalTanggalMulai,
				tanggal_selesai: jurnalTanggalSelesai
			});
			const res = await fetch(`/api/pdf/jurnal-mengajar?${params}`);
			if (!res.ok) throw new Error('Gagal membuat PDF');
			const blob = await res.blob();

			closePdfModal();
			pdfPreviewUrl = URL.createObjectURL(blob);
			pdfPreviewTitle = `Jurnal Mengajar ${jurnalTanggalMulai} - ${jurnalTanggalSelesai}`;
			pdfModalOpen = true;
		} catch (err) {
			console.error('Jurnal preview error:', err);
			toast('Gagal membuat PDF Jurnal Mengajar', 'error');
		} finally {
			downloadLoading = false;
		}
	}

	async function handleDownloadBulk() {
		const documentType = selectedDocument;
		if (!documentType) {
			toast('Pilih dokumen terlebih dahulu', 'warning');
			return;
		}

		let muridList: MuridData[];
		if (isPiagamSelected) {
			muridList = piagamRankingOptions.map((option) => ({
				id: option.muridId,
				nama: option.nama,
				nis: null,
				nisn: null
			}));
		} else {
			muridList = daftarMurid;
		}

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

</script>

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<PreviewHeader
		{headingTitle}
		{kelasAktifLabel}
		{academicContext}
	/>

	<DocumentMuridSelector
		bind:selectedDocument
		bind:selectedTemplate
		bind:selectedRaporPeriode
		bind:searchTerm
		{daftarMurid}
		{piagamRankingOptions}
		{documentOptions}
		onPreviewMurid={handlePreviewMurid}
		onBulkDownload={handleDownloadBulk}
		{downloadDisabled}
		{downloadLoading}
		bind:jurnalTanggalMulai
		bind:jurnalTanggalSelesai
		muridCount={daftarMurid.length}
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
			kritCukup = cukup;
			kritBaik = baik;
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
		onBgRefresh={() => {}}
		onPreviewJurnal={handlePreviewJurnal}
	/>
</div>

<PdfPreviewModal
	bind:open={pdfModalOpen}
	pdfUrl={pdfPreviewUrl}
	pdfTitle={pdfPreviewTitle}
	hasPrev={hasPrevMurid}
	hasNext={hasNextMurid}
	loading={downloadLoading}
	onPrev={handleNavigatePrev}
	onNext={handleNavigateNext}
	onClose={closePdfModal}
/>
