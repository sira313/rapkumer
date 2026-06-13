<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import PresensiSettingsModal from '$lib/components/presensi/presensi-settings-modal.svelte';
	import ScannerModal from '$lib/components/absen/scanner-modal.svelte';
	import IsiSekaligusModal from '$lib/components/absen/isi-sekaligus-modal.svelte';
	import DownloadRekapModal from '$lib/components/absen/download-rekap-modal.svelte';
	import { searchQueryMarker } from '$lib/utils';
	import { onDestroy, onMount } from 'svelte';

	const hariList = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
	const bulanList = [
		'Januari',
		'Februari',
		'Maret',
		'April',
		'Mei',
		'Juni',
		'Juli',
		'Agustus',
		'September',
		'Oktober',
		'November',
		'Desember'
	];
	let waktuSekarang = $state('');
	let intervalTimer: ReturnType<typeof setInterval> | undefined;

	function updateWaktu() {
		const now = new Date();
		const hari = hariList[now.getDay()];
		const tgl = now.getDate();
		const bln = bulanList[now.getMonth()];
		const thn = now.getFullYear();
		const jam = String(now.getHours()).padStart(2, '0');
		const menit = String(now.getMinutes()).padStart(2, '0');
		waktuSekarang = `${hari}, ${tgl} ${bln} ${thn} ${jam}:${menit}`;
	}

	onMount(() => {
		updateWaktu();
		intervalTimer = setInterval(updateWaktu, 60000);
		return () => {
			if (intervalTimer) clearInterval(intervalTimer);
		};
	});

	type KehadiranRow = {
		id: number;
		no: number;
		nama: string;
		hadir: boolean;
		keterangan: string | null;
		updatedAt: string | null;
	};

	type PageState = {
		search: string | null;
		currentPage: number;
		totalPages: number;
		// totalItems and perPage intentionally omitted when not used in this view
	};

	type PresensiSettings = {
		jamMasuk: string;
		jamPulang: string;
		hariSekolah: number;
		tipePresensi: string;
	};

	type PageData = {
		page: PageState;
		daftarMurid: KehadiranRow[];
		semuaMurid: Array<{ id: number; nama: string; keterangan: string | null }>;
		tableReady: boolean;
		totalMurid: number;
		muridCount: number;
		presensiSettings: PresensiSettings | null;
		tanggal: string;
	};

	let { data }: { data: PageData } = $props();

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

	const getSearch = () => data.page.search ?? '';
	let searchTerm = $state(getSearch());
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	let editingRowId = $state<number | null>(null);
	let editingValues = $state<{ keterangan: string }>({
		keterangan: ''
	});
	let editingSubmitting = $state(false);

	$effect(() => {
		if (searchTimer) return;
		const latestSearchTerm = data.page.search ?? '';
		if (searchTerm !== latestSearchTerm) {
			searchTerm = latestSearchTerm;
		}
	});

	$effect(() => {
		if (editingRowId == null) {
			editingValues = { keterangan: '' };
		}
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
		/* eslint-disable-next-line svelte/no-navigation-without-resolve -- intentional URL build + goto */
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
			void applyNavigation((params) => {
				const cleaned = value.trim();
				if (cleaned) {
					params.set('q', cleaned);
				} else {
					params.delete('q');
				}
				params.delete('page');
			});
		}, 400);
	}

	function submitSearch(event: Event) {
		event.preventDefault();
		if (searchTimer) {
			clearTimeout(searchTimer);
			searchTimer = undefined;
		}
		void applyNavigation((params) => {
			const cleaned = searchTerm.trim();
			if (cleaned) {
				params.set('q', cleaned);
			} else {
				params.delete('q');
			}
			params.delete('page');
		});
	}

	onDestroy(() => {
		if (searchTimer) {
			clearTimeout(searchTimer);
			searchTimer = undefined;
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

	function displayKeterangan(value: string | null | undefined) {
		if (value == null) return '-';
		const labels: Record<string, string> = {
			sakit: 'Sakit',
			izin: 'Izin',
			alfa: 'Alfa'
		};
		return labels[value] ?? value;
	}

	function startEdit(row: KehadiranRow) {
		editingRowId = row.id;
		editingValues = {
			keterangan: row.keterangan ?? ''
		};
	}

	function cancelEdit() {
		editingRowId = null;
	}

	const editingSaveDisabled = $derived.by(() => editingRowId == null || editingSubmitting);

	async function handleUpdateSuccess() {
		editingRowId = null;
		await invalidate('app:absen');
	}

	const hasMurid = $derived.by(() => data.muridCount > 0);
	const hasFilteredMurid = $derived.by(() => data.totalMurid > 0);

	function openPresensiSettings() {
		const settings = data.presensiSettings;
		showModal({
			title: 'Pengaturan Presensi',
			body: PresensiSettingsModal,
			bodyProps: {
				jamMasuk: settings?.jamMasuk ?? '07:30',
				jamPulang: settings?.jamPulang ?? '15:00',
				hariSekolah: settings?.hariSekolah ?? 6,
				tipePresensi: settings?.tipePresensi ?? 'masuk_pulang'
			},
			dismissible: false
		});
	}

	let selectedTanggal = $state(data.tanggal);

	$effect(() => {
		selectedTanggal = data.tanggal;
	});

	const isToday = $derived.by(() => {
		const d = new Date();
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return data.tanggal === `${y}-${m}-${day}`;
	});

	function viewDate() {
		void applyNavigation((params) => {
			params.set('tanggal', selectedTanggal);
			params.delete('page');
			params.delete('q');
		});
	}

	function resetToToday() {
		void applyNavigation((params) => {
			params.delete('tanggal');
			params.delete('page');
			params.delete('q');
		});
	}

	function openDownloadRekap() {
		showModal({
			title: 'Download Rekap Kehadiran',
			body: DownloadRekapModal,
			dismissible: true
		});
	}

	function openScanner() {
		showModal({
			title: 'Scan QR Kehadiran',
			body: ScannerModal,
			bodyProps: {
				onscan: () => invalidate('app:absen')
			},
			dismissible: false
		});
	}
</script>

{#if !data.tableReady}
	<div class="alert alert-soft alert-warning mb-6 flex items-center gap-3">
		<Icon name="alert" />
		<span>
			Tabel ketidakhadiran harian belum tersedia. Jalankan <strong>pnpm db:push</strong> untuk menerapkan
			migrasi terbaru.
		</span>
	</div>
{/if}

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<div class="mb-4 flex items-start justify-between gap-2 max-sm:flex-col sm:flex-row">
		<div>
			<h2 class="text-xl font-bold">
				Kehadiran murid{isToday ? ' hari Ini' : ''} -
				<span class="text-primary">{waktuSekarang}</span>
			</h2>
			{#if kelasAktifLabel}
				<p class="text-base-content/80 block text-sm">{kelasAktifLabel}</p>
			{/if}
			{#if !isToday}
				<p class="text-base-content/60 block text-sm">Menampilkan data tanggal {data.tanggal}</p>
			{/if}
		</div>
		<div class="flex max-sm:w-full">
			<button
				type="button"
				class="btn btn-primary btn-soft flex-1 rounded-r-none shadow-none max-sm:flex-1"
				onclick={openScanner}
			>
				<Icon name="grid" />
				Scan QR
			</button>
			<div class="dropdown dropdown-end max-sm:flex-none">
				<button
					type="button"
					tabindex="0"
					class="btn btn-primary btn-soft rounded-l-none shadow-none"
				>
					<Icon name="down" />
				</button>
				<ul
					tabindex="-1"
					class="dropdown-content menu bg-base-100 border-base-300 z-50 mt-2 w-49 rounded-md border p-2 shadow-lg"
				>
					<li>
						<button
							type="button"
							class="w-full text-left"
							onclick={() =>
								showModal({
									title: 'Isi Kehadiran Sekaligus',
									body: IsiSekaligusModal,
									bodyProps: {
										daftarMurid: data.semuaMurid,
										kelasId: kelasAktif?.id ?? undefined,
										tanggal: data.tanggal
									},
									dismissible: true
								})}
						>
							Isi Sekaligus
						</button>
					</li>
				</ul>
			</div>
		</div>
	</div>

	<div class="mb-4 flex items-start justify-between gap-2 max-sm:flex-col sm:flex-row">
		<div class="flex flex-wrap items-center gap-2 max-sm:w-full">
			<button
				type="button"
				class="btn btn-soft shadow-none max-sm:w-full"
				onclick={openPresensiSettings}
			>
				<Icon name="gear" />
				Pengaturan Presensi
			</button>
			<div class="flex flex-row max-sm:w-full">
				<input
					type="date"
					class="input bg-base-200 dark:bg-base-300 w-full rounded-r-none max-sm:w-full dark:border-none"
					bind:value={selectedTanggal}
				/>
				<button
					type="button"
					class="btn btn-soft rounded-none shadow-none"
					aria-label="Lihat presensi"
					title="Lihat presensi"
					onclick={viewDate}
				>
					<Icon name="eye" />
				</button>
				<button
					type="button"
					class="btn btn-soft rounded-l-none shadow-none"
					aria-label="reset"
					title="reset"
					onclick={resetToToday}
					disabled={isToday}
				>
					<Icon name="repeat" />
				</button>
			</div>
		</div>
		<button
			type="button"
			class="btn btn-soft shadow-none max-sm:w-full sm:w-auto"
			onclick={openDownloadRekap}
		>
			<Icon name="download" />
			Download Rekap (.xlsx)
		</button>
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
						<th class="text-center" style="min-width: 100px;">Hadir</th>
						<th class="text-center" style="min-width: 120px;">Keterangan</th>
						<th class="text-center" style="min-width: 120px;">Aksi</th>
					</tr>
				</thead>
				<tbody>
					{#each data.daftarMurid as murid (murid.id)}
						{@const isEditing = editingRowId === murid.id}
						{@const formId = `kehadiran-form-${murid.id}`}
						<tr class={isEditing ? 'bg-base-200/40' : undefined}>
							<td>{murid.no}</td>
							<td>{@html searchQueryMarker(data.page.search, murid.nama)}</td>
							<td class="text-center">
								<span
									class="badge badge-sm whitespace-nowrap {murid.hadir
										? 'badge-success'
										: 'badge-soft badge-error'}"
								>
									{murid.hadir ? 'Hadir' : 'Tidak hadir'}
								</span>
							</td>
							<td class="text-center">
								{#if isEditing}
									<select
										class="select select-sm bg-base-200 dark:bg-base-300 w-full text-center dark:border-none"
										value={editingValues.keterangan}
										onchange={(event) =>
											(editingValues = {
												keterangan: (event.currentTarget as HTMLSelectElement).value
											})}
									>
										<option value="">-</option>
										<option value="sakit">Sakit</option>
										<option value="izin">Izin</option>
										<option value="alfa">Alfa</option>
									</select>
								{:else}
									{displayKeterangan(murid.keterangan)}
								{/if}
							</td>
							<td>
								<div class="flex items-center justify-center gap-2">
									{#if isEditing}
										<FormEnhance
											id={formId}
											action="?/update"
											submitStateChange={(value) => (editingSubmitting = value)}
											onsuccess={handleUpdateSuccess}
											showToast
										>
											{#snippet children({ submitting })}
												<input
													type="hidden"
													name="muridId"
													value={murid.id}
													data-submitting={submitting ? '1' : '0'}
												/>
												<input type="hidden" name="keterangan" value={editingValues.keterangan} />
												<input type="hidden" name="tanggal" value={data.tanggal} />
											{/snippet}
										</FormEnhance>
										<button
											type="button"
											class="btn btn-soft btn-sm btn-error shadow-none"
											title="Batalkan"
											onclick={cancelEdit}
											disabled={editingSubmitting}
										>
											<Icon name="close" />
										</button>
										<button
											type="submit"
											class="btn btn-primary btn-sm shadow-none"
											title="Simpan"
											form={formId}
											disabled={editingSaveDisabled}
										>
											{#if editingSubmitting}
												<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
											{/if}
											<Icon name="save" />
										</button>
									{:else}
										<button
											type="button"
											class="btn btn-soft btn-sm shadow-none"
											onclick={() => startEdit(murid)}
											disabled={!data.tableReady || !canEdit}
											title={!canEdit ? 'Anda tidak memiliki izin untuk mengedit' : ''}
										>
											<Icon name="edit" />
											Edit
										</button>
									{/if}
								</div>
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
	:global(form[id^='kehadiran-form-']) {
		display: contents;
	}
</style>
