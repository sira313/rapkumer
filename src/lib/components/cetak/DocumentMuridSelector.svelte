<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { onDestroy } from 'svelte';
	import { searchQueryMarker } from '$lib/utils';
	import PreviewFooter from './PreviewFooter.svelte';

	type DocumentType = 'cover' | 'biodata' | 'rapor' | 'piagam' | 'keasramaan' | 'jurnal-mengajar';
	type RaporPeriode = 'rts' | 'ras';

	type MuridData = {
		id: number;
		nama: string;
		nis?: string | null;
		nisn?: string | null;
	};

	type PiagamRankingOption = {
		muridId: number;
		nama: string;
		peringkat: number;
		nilaiRataRata: number | null;
	};

	let {
		selectedDocument = $bindable(''),
		selectedTemplate = $bindable<'1' | '2'>('1'),
		selectedRaporPeriode = $bindable<RaporPeriode>('ras'),
		searchTerm = $bindable(''),
		daftarMurid = [],
		piagamRankingOptions = [],
		documentOptions = [
			{ value: 'cover', label: 'Cover' },
			{ value: 'biodata', label: 'Biodata' },
			{ value: 'rapor', label: 'Rapor' },
			{ value: 'piagam', label: 'Piagam' },
			{ value: 'keasramaan', label: 'Rapor Keasramaan' }
		],
		onPreviewMurid,
		onBulkDownload,
		onPreviewJurnal = () => {},
		downloadDisabled = false,
		downloadLoading = false,
		jurnalTanggalMulai = $bindable(''),
		jurnalTanggalSelesai = $bindable(''),
		showTable = true,
		// preview footer props
		muridCount = 0,
		isRaporSelected = false,
		isKeasramaanSelected = false,
		isBiodataSelected = false,
		onBgRefresh = () => {},
		onSetKriteria = () => {},
		kritCukup = 85,
		kritBaik = 95,
		tpMode = 'compact',
		onToggleFullTP = () => {},
		kelasId = null,
		showBgLogo = false,
		onToggleBgLogo = () => {}
	}: {
		selectedDocument: DocumentType | '';
		selectedTemplate: '1' | '2';
		selectedRaporPeriode?: RaporPeriode | '';
		searchTerm: string;
		daftarMurid: MuridData[];
		piagamRankingOptions: PiagamRankingOption[];
		documentOptions?: Array<{ value: DocumentType; label: string }>;
		onPreviewMurid: (murid: MuridData) => void;
		onBulkDownload: () => void;
		onPreviewJurnal?: () => void;
		downloadDisabled?: boolean;
		downloadLoading?: boolean;
		jurnalTanggalMulai?: string;
		jurnalTanggalSelesai?: string;
		showTable?: boolean;
		muridCount?: number;
		isRaporSelected?: boolean;
		isKeasramaanSelected?: boolean;
		isBiodataSelected?: boolean;
		onBgRefresh?: () => void;
		onSetKriteria?: (cukup: number, baik: number) => void;
		kritCukup?: number;
		kritBaik?: number;
		tpMode?: 'compact' | 'full-desc';
		onToggleFullTP?: (value: 'compact' | 'full-desc') => void;
		kelasId?: string | number | null;
		showBgLogo?: boolean;
		onToggleBgLogo?: (value: boolean) => void;
	} = $props();

	const isPiagamSelected = $derived(selectedDocument === 'piagam');
	const isJurnalMengajar = $derived(selectedDocument === 'jurnal-mengajar');
	const hasMurid = $derived(daftarMurid.length > 0);
	const hasPiagamRankingOptions = $derived(piagamRankingOptions.length > 0);

	const hasSelectionOptions = $derived(isPiagamSelected ? hasPiagamRankingOptions : hasMurid);

	const filteredMurid = $derived.by(() => {
		if (!searchTerm.trim()) return daftarMurid;
		const q = searchTerm.trim().toLowerCase();
		return daftarMurid.filter((m) => m.nama.toLowerCase().includes(q));
	});

	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	let localSearch = $state(searchTerm);

	function handleSearchInput(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		localSearch = value;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			searchTimer = undefined;
			searchTerm = value;
			currentPage = 1;
		}, 300);
	}

	function submitSearch(event: Event) {
		event.preventDefault();
		if (searchTimer) {
			clearTimeout(searchTimer);
			searchTimer = undefined;
		}
		searchTerm = localSearch;
		currentPage = 1;
	}

	$effect(() => {
		void selectedDocument;
		currentPage = 1;
	});

	onDestroy(() => {
		if (searchTimer) clearTimeout(searchTimer);
	});

	const PER_PAGE = 10;
	let currentPage = $state(1);

	const filteredPiagamOptions = $derived.by(() => {
		if (!searchTerm.trim()) return piagamRankingOptions;
		const q = searchTerm.trim().toLowerCase();
		return piagamRankingOptions.filter((o) => o.nama.toLowerCase().includes(q));
	});

	const showPiagamTable = $derived(isPiagamSelected && hasPiagamRankingOptions);
	const currentItems = $derived(showPiagamTable ? filteredPiagamOptions : filteredMurid);
	const totalPages = $derived(Math.max(1, Math.ceil(currentItems.length / PER_PAGE)));

	const pages = $derived(Array.from({ length: totalPages }, (_, i) => i + 1));

	const paginatedMurid = $derived(
		!showPiagamTable
			? (currentItems as MuridData[]).slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE)
			: []
	);
	const paginatedPiagam = $derived(
		showPiagamTable
			? (currentItems as PiagamRankingOption[]).slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE)
			: []
	);

	$effect(() => {
		if (currentItems.length > 0 && currentPage > totalPages) {
			currentPage = totalPages;
		}
	});

	function handlePageClick(pageNumber: number) {
		if (pageNumber === currentPage) return;
		currentPage = pageNumber;
	}

	const showMuridTable = $derived(
		!isJurnalMengajar
		&& selectedDocument
		&& (
			(isPiagamSelected && hasPiagamRankingOptions)
			|| (showTable && hasMurid)
		)
	);
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-col gap-2 sm:flex-row">
		<div class="min-w-0 flex-1">
			<select
				class="select bg-base-200 w-full min-w-0 truncate dark:border-none"
				bind:value={selectedDocument}
				title="Pilih dokumen yang ingin dipreview"
			>
				<option value="" disabled selected>Pilih dokumen…</option>
				{#each documentOptions as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>
		{#if isPiagamSelected}
			<div class="min-w-0 flex-1">
				<select
					class="select bg-base-200 w-full min-w-0 truncate dark:border-none"
					bind:value={selectedTemplate}
					title="Pilih template piagam"
				>
					<option value="1">Template 1</option>
					<option value="2">Template 2</option>
				</select>
			</div>
		{/if}
		{#if selectedDocument === 'rapor'}
			<div class="min-w-0 flex-1">
				<select
					class="select bg-base-200 w-full min-w-0 truncate dark:border-none"
					bind:value={selectedRaporPeriode}
					title="Pilih periode rapor"
				>
					<option value="" disabled selected>Pilih periode…</option>
					<option value="ras">Rapor Akhir Semester</option>
					<option value="rts">Rapor Tengah Semester</option>
				</select>
			</div>
		{/if}
		{#if isJurnalMengajar}
			<fieldset class="fieldset min-w-0 flex-1 py-0">
				<input
					type="date"
					class="input bg-base-100 dark:bg-base-200 w-full dark:border-none"
					bind:value={jurnalTanggalMulai}
				/>
				<p class="text-wrap">Pilih tanggal mulai</p>
			</fieldset>
			<fieldset class="fieldset min-w-0 flex-1 py-0">
				<input
					type="date"
					class="input bg-base-100 dark:bg-base-200 w-full dark:border-none"
					bind:value={jurnalTanggalSelesai}
				/>
				<p class="text-wrap">Pilih tanggal selesai</p>
			</fieldset>
		{/if}
		<div class="flex flex-row gap-2">
			{#if isJurnalMengajar}
				<button
					class="btn btn-primary shadow-none"
					type="button"
					disabled={!jurnalTanggalMulai || !jurnalTanggalSelesai || downloadLoading}
					onclick={onPreviewJurnal}
					title={!jurnalTanggalMulai || !jurnalTanggalSelesai
						? 'Pilih rentang tanggal terlebih dahulu'
						: 'Preview Jurnal Mengajar'}
				>
					{#if downloadLoading}
						<span class="loading loading-spinner loading-sm"></span>
					{:else}
						<Icon name="eye" />
					{/if}
					Preview
				</button>
			{:else}
				<button
					class="btn btn-soft shadow-none"
					type="button"
					disabled={downloadDisabled}
					onclick={onBulkDownload}
					title="Download semua murid"
				>
					{#if downloadLoading}
						<span class="loading loading-spinner loading-sm"></span>
					{:else}
						<Icon name="download" />
					{/if}
					Semua
				</button>
			{/if}
		</div>
	</div>

	<PreviewFooter
		{hasMurid}
		muridCount={daftarMurid.length}
		{isPiagamSelected}
		{selectedTemplate}
		{onBgRefresh}
		{isRaporSelected}
		{tpMode}
		{onToggleFullTP}
		{onSetKriteria}
		{kritCukup}
		{kritBaik}
		{kelasId}
		{isBiodataSelected}
		{isKeasramaanSelected}
		{showBgLogo}
		{onToggleBgLogo}
		{isJurnalMengajar}
	/>

	{#if showMuridTable}
		<form
			class="flex flex-col gap-2"
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
					value={localSearch}
					placeholder="Cari nama murid..."
					oninput={handleSearchInput}
					autocomplete="off"
				/>
			</label>
		</form>

		{#if currentItems.length === 0}
			<div class="alert alert-soft alert-info mt-2">
				<Icon name="info" />
				<span>{isPiagamSelected ? 'Tidak ada peringkat piagam yang cocok dengan pencarian.' : 'Tidak ada murid yang cocok dengan pencarian.'}</span>
			</div>
		{:else}
			<div
				class="bg-base-100 dark:bg-base-200 overflow-x-auto rounded-md shadow-md dark:shadow-none"
			>
				<table class="table border-base-200 border dark:border-none">
					<thead>
						<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
							<th style="width: 50px; min-width: 40px;">No</th>
							{#if isPiagamSelected}
								<th style="min-width: 80px;">Peringkat</th>
							{/if}
							<th class="w-full" style="min-width: 160px;">Nama</th>
							{#if isPiagamSelected}
								<th style="min-width: 100px;">Nilai Rata-rata</th>
							{:else}
								<th style="min-width: 100px;">NISN</th>
							{/if}
							<th class="text-center" style="min-width: 120px;">Aksi</th>
						</tr>
					</thead>
					<tbody>
						{#if isPiagamSelected}
							{#each paginatedPiagam as item, i}
								<tr>
									<td>{(currentPage - 1) * PER_PAGE + i + 1}</td>
									<td>{item.peringkat}</td>
									<td>{@html searchQueryMarker(searchTerm || null, item.nama)}</td>
									<td>{item.nilaiRataRata != null ? item.nilaiRataRata.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
									<td class="text-center">
										<button
											type="button"
											class="btn btn-primary btn-soft btn-sm shadow-none"
											disabled={downloadLoading}
											onclick={() => onPreviewMurid({ id: item.muridId, nama: item.nama })}
											title="Preview piagam untuk {item.nama}"
										>
											<Icon name="eye" />
											Preview
										</button>
									</td>
								</tr>
							{/each}
						{:else}
							{#each paginatedMurid as murid, i (murid.id)}
								<tr>
									<td>{(currentPage - 1) * PER_PAGE + i + 1}</td>
									<td>{@html searchQueryMarker(searchTerm || null, murid.nama)}</td>
									<td>{murid.nisn ?? murid.nis ?? '-'}</td>
									<td class="text-center">
										<button
											type="button"
											class="btn btn-primary btn-soft btn-sm shadow-none"
											disabled={downloadLoading}
											onclick={() => onPreviewMurid(murid)}
											title="Preview dokumen untuk {murid.nama}"
										>
											<Icon name="eye" />
											Preview
										</button>
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
			{#if totalPages > 1}
				<div class="join mt-2 self-center sm:mx-auto">
					{#each pages as pageNumber (pageNumber)}
						<button
							type="button"
							class="join-item btn btn-sm"
							class:btn-active={pageNumber === currentPage}
							onclick={() => handlePageClick(pageNumber)}
							aria-current={pageNumber === currentPage ? 'page' : undefined}
						>
							{pageNumber}
						</button>
					{/each}
				</div>
			{/if}
		{/if}
	{/if}

	{#if !selectedDocument}
		<div class="alert alert-soft alert-info">
			<Icon name="info" />
			<span>Pilih dokumen terlebih dahulu untuk melihat daftar murid atau peringkat.</span>
		</div>
	{:else if !showTable && !isPiagamSelected}
		<!-- no table shown for jurnal -->
	{:else if !hasMurid && !isPiagamSelected}
		<div class="alert alert-soft alert-warning">
			<Icon name="alert" />
			<span>Belum ada murid di kelas ini. Tambahkan murid terlebih dahulu.</span>
		</div>
	{:else if isPiagamSelected && !hasPiagamRankingOptions}
		<div class="alert alert-soft alert-warning">
			<Icon name="alert" />
			<span>Belum ada data peringkat piagam untuk kelas ini.</span>
		</div>
	{/if}
</div>
