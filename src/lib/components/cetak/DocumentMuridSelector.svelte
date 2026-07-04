<script lang="ts">
	import Icon from '$lib/components/icon.svelte';

	type DocumentType =
		| 'cover'
		| 'biodata'
		| 'rapor'
		| 'piagam'
		| 'keasramaan'
		| 'kartu-murid'
		| 'jurnal-mengajar';
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
		selectedMuridId = $bindable(''),
		daftarMurid = [],
		piagamRankingOptions = [],
		documentOptions = [
			{ value: 'cover', label: 'Cover' },
			{ value: 'biodata', label: 'Biodata' },
			{ value: 'rapor', label: 'Rapor' },
			{ value: 'piagam', label: 'Piagam' },
			{ value: 'keasramaan', label: 'Rapor Keasramaan' }
		],
		onDownload,
		onBulkDownload,
		downloadDisabled = false,
		downloadButtonTitle = '',
		downloadLoading = false,
		jurnalTanggalMulai = $bindable(''),
		jurnalTanggalSelesai = $bindable('')
	}: {
		selectedDocument: DocumentType | '';
		selectedTemplate: '1' | '2';
		selectedRaporPeriode?: RaporPeriode | '';
		selectedMuridId: string;
		daftarMurid: MuridData[];
		piagamRankingOptions: PiagamRankingOption[];
		documentOptions?: Array<{ value: DocumentType; label: string }>;
		onDownload: () => void;
		onBulkDownload: () => void;
		downloadDisabled?: boolean;
		downloadButtonTitle?: string;
		downloadLoading?: boolean;
		jurnalTanggalMulai?: string;
		jurnalTanggalSelesai?: string;
	} = $props();

	const isPiagamSelected = $derived.by(() => selectedDocument === 'piagam');
	const isJurnalMengajar = $derived.by(() => selectedDocument === 'jurnal-mengajar');
	const hasMurid = $derived.by(() => daftarMurid.length > 0);
	const hasPiagamRankingOptions = $derived.by(() => piagamRankingOptions.length > 0);

	const averageFormatter = new Intl.NumberFormat('id-ID', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});

	const piagamSelectOptions = $derived.by(() =>
		piagamRankingOptions.map((option) => {
			const formattedAverage =
				option.nilaiRataRata != null ? averageFormatter.format(option.nilaiRataRata) : null;
			const label = formattedAverage
				? `Peringkat ${option.peringkat} — ${option.nama} (${formattedAverage})`
				: `Peringkat ${option.peringkat} — ${option.nama}`;
			return {
				value: String(option.muridId),
				label
			};
		})
	);

	const hasSelectionOptions = $derived.by(() =>
		isPiagamSelected ? hasPiagamRankingOptions : hasMurid
	);
</script>

<div class="mb-2 flex flex-col gap-2 sm:flex-row">
	<div class="min-w-0 flex-1 overflow-hidden">
		<select
			class="select bg-base-200 w-full min-w-0 truncate dark:border-none"
			bind:value={selectedDocument}
			title="Pilih dokumen yang ingin dipreview"
		>
			<option value="">Pilih dokumen…</option>
			{#each documentOptions as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</div>
	{#if isPiagamSelected}
		<div class="min-w-0 flex-1 overflow-hidden">
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
		<div class="min-w-0 flex-1 overflow-hidden">
			<select
				class="select bg-base-200 w-full min-w-0 truncate dark:border-none"
				bind:value={selectedRaporPeriode}
				title="Pilih periode rapor"
			>
				<option value="">Pilih periode…</option>
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
	{:else if isPiagamSelected}
		<div class="min-w-0 flex-1 overflow-hidden">
			<select
				class="select bg-base-200 w-full min-w-0 truncate dark:border-none"
				bind:value={selectedMuridId}
				title="Pilih peringkat piagam yang ingin dipreview"
				disabled={!hasPiagamRankingOptions}
			>
				<option value="">Pilih peringkat…</option>
				{#each piagamSelectOptions as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>
	{:else}
		<div class="min-w-0 flex-1 overflow-hidden">
			<select
				class="select bg-base-200 w-full min-w-0 truncate dark:border-none"
				bind:value={selectedMuridId}
				title="Pilih murid yang ingin dipreview dokumennya"
				disabled={!hasMurid}
			>
				<option value="">Pilih murid…</option>
				{#each daftarMurid as murid (murid.id)}
					<option value={String(murid.id)}>
						{murid.nama}
						{#if murid.nisn}
							— {murid.nisn}
						{:else if murid.nis}
							— {murid.nis}
						{/if}
					</option>
				{/each}
			</select>
		</div>
	{/if}
	<div class="flex flex-row">
		<button
			class="btn btn-soft flex-1 shadow-none"
			class:rounded-r-none={!isJurnalMengajar}
			type="button"
			title={downloadButtonTitle}
			disabled={downloadDisabled}
			onclick={onDownload}
		>
			{#if downloadLoading}
				<span class="loading loading-spinner loading-sm"></span>
			{:else}
				<Icon name="eye" />
			{/if}
			Preview
		</button>
		{#if !isJurnalMengajar}
			<div class="dropdown dropdown-end">
				<div
					tabindex="0"
					role="button"
					class="btn btn-primary rounded-l-none shadow-none"
					class:btn-disabled={!selectedDocument}
					title={selectedDocument ? 'Opsi download lainnya' : 'Pilih dokumen terlebih dahulu'}
				>
					<Icon name="down" />
				</div>
				<ul
					tabindex="-1"
					class="dropdown-content menu bg-base-100 rounded-box border-base-300 z-1 mt-2 w-38 border p-2 shadow-xl"
				>
					<li>
						<button
							type="button"
							onclick={onBulkDownload}
							disabled={!selectedDocument || !hasSelectionOptions}
						>
							Semua Murid
						</button>
					</li>
				</ul>
			</div>
		{/if}
	</div>
</div>
