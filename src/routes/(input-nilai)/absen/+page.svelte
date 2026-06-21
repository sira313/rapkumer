<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import ScannerModal from '$lib/components/absen/scanner-modal.svelte';
	import IsiSekaligusModal from '$lib/components/absen/isi-sekaligus-modal.svelte';
	import DownloadRekapModal from '$lib/components/absen/download-rekap-modal.svelte';
	import HapusPresensiModal from '$lib/components/absen/hapus-presensi-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
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

	type StatusPerDay = '' | 'H' | 'S' | 'I' | 'TK';

	type BulananRow = {
		no: number;
		nama: string;
		statusPerDay: StatusPerDay[];
		countS: number;
		countI: number;
		countTK: number;
		countHadir: number;
	};

	type RaporRow = {
		id: number;
		no: number;
		nama: string;
		hadir: number;
		sakit: number;
		izin: number;
		alfa: number;
		overridden: boolean;
	};

	type PageState = {
		search: string | null;
		currentPage: number;
		totalPages: number;
		// totalItems and perPage intentionally omitted when not used in this view
	};

	type PersentaseHarianSubject = {
		kodeKegiatan: string;
		label: string;
	};

	type PersentaseHarianRow = {
		no: number;
		muridId: number;
		nama: string;
		subjects: Record<string, string>;
		persentase: number;
	};

	type JadwalSaatIni = {
		mataPelajaranId: number | null;
		namaMataPelajaran: string;
		jamKe: number;
		perkiraanJam: string;
	};

	type PageData = {
		page: PageState;
		daftarMurid: KehadiranRow[];
		semuaMurid: Array<{ id: number; nama: string; keterangan: string | null }>;
		tableReady: boolean;
		totalMurid: number;
		muridCount: number;
		tanggal: string;
		mode: 'harian' | 'bulanan' | 'rapor' | 'persentase_harian';
		bulan: number;
		tahun: number;
		daysInMonth: number;
		bulananRows: BulananRow[];
		raporRows: RaporRow[];
		redDays: number[];
		tanggalMulaiRapor: string;
		tanggalAkhirRapor: string;
		presensiReady: boolean;
		presensiWarningMessage: string;
		jenisPresensi: string;
		persentaseHarianSubjects: PersentaseHarianSubject[];
		persentaseHarianRows: PersentaseHarianRow[];
		jadwalSaatIni: JadwalSaatIni | null;
		simulasiHari: string | null;
		simulasiJam: string | null;
	};

	let { data }: { data: PageData } = $props();

	const kelasAktif = $derived(page.data.kelasAktif ?? null);
	const kelasAktifLabel = $derived.by(() => {
		if (!kelasAktif) return null;
		return kelasAktif.fase ? `${kelasAktif.nama} - ${kelasAktif.fase}` : kelasAktif.nama;
	});

	// Restrict editing: only admin and wali_kelas can edit
	const canEdit = $derived.by(() => {
		const u = page.data.user as { type?: string } | null | undefined;
		return u?.type === 'admin' || u?.type === 'wali_kelas';
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

	let raporEditingRowId = $state<number | null>(null);
	let raporEditingValues = $state<{ sakit: number; izin: number; alfa: number }>({
		sakit: 0,
		izin: 0,
		alfa: 0
	});
	let raporEditingSubmitting = $state(false);

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

	$effect(() => {
		if (raporEditingRowId == null) {
			raporEditingValues = { sakit: 0, izin: 0, alfa: 0 };
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

	const raporEditingSaveDisabled = $derived.by(
		() => raporEditingRowId == null || raporEditingSubmitting
	);

	function startRaporEdit(row: RaporRow) {
		raporEditingRowId = row.id;
		raporEditingValues = {
			sakit: row.sakit,
			izin: row.izin,
			alfa: row.alfa
		};
	}

	function cancelRaporEdit() {
		raporEditingRowId = null;
	}

	async function handleRaporUpdateSuccess() {
		raporEditingRowId = null;
		await invalidate('app:absen');
	}

	const hasMurid = $derived.by(() => data.muridCount > 0);
	const hasFilteredMurid = $derived.by(() => data.totalMurid > 0);

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

	let selectedMode = $state<'harian' | 'bulanan' | 'rapor' | 'persentase_harian'>(data.mode);
	let selectedBulan = $state(data.mode === 'bulanan' ? data.bulan : new Date().getMonth() + 1);
	let selectedTahun = $state(data.mode === 'bulanan' ? data.tahun : new Date().getFullYear());

	$effect(() => {
		selectedMode = data.mode;
	});

	$effect(() => {
		if (data.mode === 'bulanan') {
			selectedBulan = data.bulan;
			selectedTahun = data.tahun;
		}
	});

	let simulasiHari = $state(page.url.searchParams.get('simHari') ?? 'Senin');
	let simulasiJam = $state(page.url.searchParams.get('simJam') ?? '07:00');
	let showSimulasi = $state(false);
	const simActive = $derived(!!page.url.searchParams.get('simHari'));

	function applySimulasi() {
		void applyNavigation((params) => {
			params.set('simHari', simulasiHari);
			params.set('simJam', simulasiJam);
		});
		showSimulasi = false;
	}

	function resetSimulasi() {
		void applyNavigation((params) => {
			params.delete('simHari');
			params.delete('simJam');
		});
		showSimulasi = false;
	}

	function handleModeChange() {
		void applyNavigation((params) => {
			if (selectedMode === 'bulanan') {
				params.set('mode', 'bulanan');
				params.set('bulan', String(selectedBulan));
				params.set('tahun', String(selectedTahun));
				params.delete('tanggal');
			} else if (selectedMode === 'rapor') {
				params.set('mode', 'rapor');
				params.delete('bulan');
				params.delete('tahun');
				params.delete('tanggal');
			} else if (selectedMode === 'persentase_harian') {
				params.set('mode', 'persentase_harian');
				params.delete('bulan');
				params.delete('tahun');
			} else {
				params.set('mode', 'harian');
				params.delete('bulan');
				params.delete('tahun');
			}
			params.delete('page');
			const cleaned = searchTerm.trim();
			if (cleaned) {
				params.set('q', cleaned);
			} else {
				params.delete('q');
			}
		});
	}

	function viewDate() {
		if (data.mode === 'bulanan') {
			void applyNavigation((params) => {
				params.set('mode', 'bulanan');
				params.set('bulan', String(selectedBulan));
				params.set('tahun', String(selectedTahun));
				params.delete('page');
				params.delete('tanggal');
				if (searchTerm.trim()) {
					params.set('q', searchTerm.trim());
				} else {
					params.delete('q');
				}
			});
		} else if (data.mode === 'rapor') {
			// No date navigation for rapor mode
			return;
		} else if (data.mode === 'persentase_harian') {
			void applyNavigation((params) => {
				params.set('mode', 'persentase_harian');
				params.set('tanggal', selectedTanggal);
				params.delete('page');
				params.delete('q');
				params.delete('bulan');
				params.delete('tahun');
			});
		} else {
			void applyNavigation((params) => {
				params.set('tanggal', selectedTanggal);
				params.delete('page');
				params.delete('q');
			});
		}
	}

	function resetToToday() {
		void applyNavigation((params) => {
			params.delete('tanggal');
			params.delete('page');
			params.delete('q');
		});
	}

	const isCurrentBulan = $derived.by(() => {
		if (data.mode !== 'bulanan') return false;
		const now = new Date();
		return data.bulan === now.getMonth() + 1 && data.tahun === now.getFullYear();
	});

	function resetToCurrentBulan() {
		const now = new Date();
		void applyNavigation((params) => {
			params.set('mode', 'bulanan');
			params.set('bulan', String(now.getMonth() + 1));
			params.set('tahun', String(now.getFullYear()));
			params.delete('page');
			params.delete('tanggal');
			params.delete('q');
		});
	}

	function openDownloadRekap() {
		let actions: { download: () => Promise<void>; cancel: () => void };
		showModal({
			title: 'Download Rekap Kehadiran',
			body: DownloadRekapModal,
			bodyProps: {
				onAction: (a) => {
					actions = a;
				}
			},
			onPositive: {
				label: 'Download',
				action: () => actions.download()
			},
			onNegative: {
				label: 'Batal'
			},
			dismissible: true
		});
	}

	function presensiNotReady() {
		showModal({
			title: 'Pengaturan Presensi',
			body: data.presensiWarningMessage,
			onPositive: {
				label: 'Atur sekarang',
				class: 'btn-primary',
				action: ({ close }) => {
					close();
					goto('/akademik');
				}
			},
			onNeutral: {
				label: 'Tutup'
			},
			dismissible: true
		});
	}

	const isGuruMapelMode = $derived(
		page.data.user?.type === 'user' && data.jenisPresensi === 'tiap_mapel'
	);

	const jadwalBelumDimulai = $derived(isGuruMapelMode && !data.jadwalSaatIni);

	function openScanner(mapelId?: number | null) {
		if (!data.presensiReady) {
			presensiNotReady();
			return;
		}
		if (jadwalBelumDimulai) {
			toast({ message: 'Jam pelajaran bapak/ibu belum dimulai', type: 'warning' });
			return;
		}
		showModal({
			title: 'Scan QR Kehadiran',
			body: ScannerModal,
			bodyProps: {
				onscan: () => invalidate('app:absen'),
				mataPelajaranId: mapelId ?? null
			},
			dismissible: false
		});
	}

	function formatTanggal(dateStr: string) {
		const d = new Date(dateStr + 'T00:00:00');
		const hari = hariList[d.getDay()];
		const tgl = d.getDate();
		const bln = bulanList[d.getMonth()];
		const thn = d.getFullYear();
		return `${hari}, ${tgl} ${bln} ${thn}`;
	}

	function openDeleteConfirm() {
		showModal({
			title: 'Hapus Data Presensi',
			body: HapusPresensiModal,
			bodyProps: {
				tanggal: data.tanggal,
				labelTanggal: formatTanggal(data.tanggal),
				kelasId: kelasAktif?.id ?? undefined
			},
			dismissible: true
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
				{#if data.mode === 'bulanan'}
					Kehadiran murid bulan -
					<span class="text-primary">{bulanList[data.bulan - 1]} {data.tahun}</span>
				{:else if data.mode === 'rapor'}
					Rekap Kehadiran Rapor
					{#if data.tanggalMulaiRapor && data.tanggalAkhirRapor}
						-
						<span class="text-primary"
							>{formatTanggal(data.tanggalMulaiRapor)} - {formatTanggal(
								data.tanggalAkhirRapor
							)}</span
						>
					{/if}
				{:else if data.mode === 'persentase_harian'}
					Persentase Kehadiran per Mapel -
					<span class="text-primary">{formatTanggal(data.tanggal)}</span>
				{:else if isToday}
					Kehadiran murid hari Ini -
					<span class="text-primary">{waktuSekarang}</span>
				{:else}
					Kehadiran murid -
					<span class="text-primary">{formatTanggal(data.tanggal)}</span>
				{/if}
			</h2>
			{#if kelasAktifLabel}
				<p class="text-base-content/80 block text-sm">{kelasAktifLabel}</p>
			{/if}
		</div>
		{#if data.mode === 'rapor'}{:else}
			{@const currentMapel = data.jadwalSaatIni}
			<div class="flex max-sm:w-full">
				<button
					type="button"
					class="btn btn-primary btn-soft flex-1 rounded-r-none shadow-none max-sm:flex-1"
					onclick={() => openScanner(currentMapel?.mataPelajaranId)}
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
							disabled={!canEdit && page.data.user?.type !== 'user'}
							title={!canEdit && page.data.user?.type !== 'user' ? 'Anda tidak memiliki izin untuk mengisi sekaligus' : ''}
							onclick={() => {
								if (!data.presensiReady) {
									presensiNotReady();
									return;
								}
								if (jadwalBelumDimulai) {
									toast({ message: 'Jam pelajaran bapak/ibu belum dimulai', type: 'warning' });
									return;
								}
								const useMapelData = page.data.user?.type === 'user' || data.mode === 'persentase_harian';
								showModal({
									title: 'Isi Kehadiran Sekaligus',
									body: IsiSekaligusModal,
									bodyProps: {
										daftarMurid: data.semuaMurid,
										kelasId: kelasAktif?.id ?? undefined,
										tanggal: data.tanggal,
										mataPelajaranId: useMapelData ? (currentMapel?.mataPelajaranId ?? null) : null,
										namaMataPelajaran: useMapelData ? (currentMapel?.namaMataPelajaran ?? undefined) : undefined,
										perkiraanJam: useMapelData ? (currentMapel?.perkiraanJam ?? undefined) : undefined
									},
									dismissible: true
								});
							}}
						>
							Isi Sekaligus
							</button>
						</li>
					</ul>
				</div>
			</div>
		{/if}
	</div>

	<div class="mb-4 flex items-start justify-between gap-2 max-sm:flex-col sm:flex-row">
		<div class="flex flex-wrap items-center gap-2 max-sm:w-full">
			<div class="flex flex-row max-sm:w-full">
				{#if data.mode === 'bulanan'}
					<div class="min-w-0 flex-1 overflow-hidden">
						<select
							class="select bg-base-200 dark:bg-base-300 w-full truncate rounded-r-none max-sm:w-full dark:border-none"
							bind:value={selectedBulan}
						>
							{#each bulanList as nama, i (nama)}
								<option value={i + 1}>{nama}</option>
							{/each}
						</select>
					</div>
					<input
						type="number"
						class="input bg-base-200 dark:bg-base-300 w-24 rounded-none max-sm:flex-1 dark:border-none"
						bind:value={selectedTahun}
						min="2000"
						max="2099"
					/>
				{:else if data.mode === 'rapor'}
					<span
						class="input bg-base-200 dark:bg-base-300 flex w-full items-center rounded-r-none text-sm dark:border-none"
					>
						{data.tanggalMulaiRapor && data.tanggalAkhirRapor
							? `${formatTanggal(data.tanggalMulaiRapor)} - ${formatTanggal(data.tanggalAkhirRapor)}`
							: 'Rentang tanggal tidak tersedia'}
					</span>
				{:else if data.mode === 'persentase_harian'}
					<input
						type="date"
						class="input bg-base-200 dark:bg-base-300 w-full rounded-r-none max-sm:w-full dark:border-none"
						bind:value={selectedTanggal}
					/>
				{:else}
					<input
						type="date"
						class="input bg-base-200 dark:bg-base-300 w-full rounded-r-none max-sm:w-full dark:border-none"
						bind:value={selectedTanggal}
					/>
				{/if}
				<button
					type="button"
					class="btn btn-soft rounded-none shadow-none"
					aria-label="Lihat presensi"
					title="Lihat presensi"
					onclick={viewDate}
					disabled={data.mode === 'rapor'}
				>
					<Icon name="eye" />
				</button>
				<button
					type="button"
					class="btn btn-soft rounded-none shadow-none"
					aria-label={data.mode === 'bulanan' ? 'Kembali ke bulan ini' : 'Kembali ke hari ini'}
					title={data.mode === 'bulanan' ? 'Kembali ke bulan ini' : 'Kembali ke hari ini'}
					onclick={data.mode === 'bulanan' ? resetToCurrentBulan : resetToToday}
					disabled={data.mode === 'bulanan'
						? isCurrentBulan
						: data.mode === 'rapor'
							? true
							: isToday}
				>
					<Icon name="repeat" />
				</button>
				<button
					type="button"
					class="btn btn-soft btn-error rounded-l-none shadow-none"
					aria-label="Hapus data presensi"
					title={isGuruMapelMode
						? 'Guru mapel tidak dapat menghapus presensi'
						: data.mode === 'bulanan'
							? 'Tidak dapat menghapus dalam mode bulanan'
							: data.mode === 'rapor'
								? 'Tidak dapat menghapus dalam mode rapor'
								: data.mode === 'persentase_harian'
									? 'Tidak dapat menghapus dalam mode persentase harian'
									: !canEdit
										? 'Anda tidak memiliki izin untuk menghapus presensi'
										: 'Hapus data presensi tanggal ini'}
					onclick={openDeleteConfirm}
					disabled={data.mode === 'bulanan' ||
						data.mode === 'rapor' ||
						data.mode === 'persentase_harian' ||
						!canEdit ||
						isGuruMapelMode}
				>
					<Icon name="del" />
				</button>
				<button
					type="button"
					class="btn btn-soft rounded-none shadow-none {simActive ? 'btn-warning' : ''}"
					aria-label="Simulasi hari & jam"
					title={simActive
						? `Simulasi: ${data.simulasiHari} ${data.simulasiJam}`
						: 'Simulasi hari & jam'}
					onclick={() => (showSimulasi = !showSimulasi)}
				>
					<Icon name={simActive ? 'pause' : 'play'} />
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

	{#if showSimulasi}
		<div class="bg-base-200 rounded-box mb-4 flex flex-wrap items-end gap-3 p-3">
			<label class="flex flex-col gap-1">
				<span class="text-sm font-semibold">Hari</span>
				<select class="select select-sm bg-base-100 w-32" bind:value={simulasiHari}>
					{#each ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as h (h)}
						<option>{h}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-sm font-semibold">Jam</span>
				<input type="time" class="input input-sm bg-base-100 w-32" bind:value={simulasiJam} />
			</label>
			<button type="button" class="btn btn-primary btn-sm shadow-none" onclick={applySimulasi}>
				<Icon name="play" /> Terapkan
			</button>
			{#if simActive}
				<button type="button" class="btn btn-soft btn-sm shadow-none" onclick={resetSimulasi}>
					Reset
				</button>
			{/if}
		</div>
	{/if}

	<form
		class="flex flex-col gap-2 sm:flex-row"
		data-sveltekit-keepfocus
		data-sveltekit-replacestate
		autocomplete="off"
		spellcheck="false"
		onsubmit={submitSearch}
	>
		<div class="join w-full overflow-hidden">
			<label class="input bg-base-200 dark:bg-base-300 join-item grow dark:border-none">
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
			<select
				class="select bg-base-200 dark:bg-base-300 join-item w-auto shrink truncate dark:border-none"
				value={selectedMode}
				title="Pilih mode presensi"
				onchange={(e) => {
					selectedMode = (e.currentTarget as HTMLSelectElement).value as
						| 'harian'
						| 'bulanan'
						| 'rapor'
						| 'persentase_harian';
					handleModeChange();
				}}
			>
				<option value="harian">Harian</option>
				<option value="bulanan">Bulanan</option>
				<option value="rapor">Rapor</option>
				{#if data.jenisPresensi === 'tiap_mapel'}
					<option value="persentase_harian">Persentase Harian</option>
				{/if}
			</select>
		</div>
	</form>

	{#if !hasMurid}
		<div class="alert alert-soft alert-warning mt-6">
			<Icon name="alert" />
			<span>Belum ada murid di kelas ini. Tambahkan murid terlebih dahulu.</span>
		</div>
	{:else if data.mode === 'persentase_harian' && !data.presensiReady && data.presensiWarningMessage}
		<div class="alert alert-soft alert-warning mt-6">
			<Icon name="alert" />
			<span>{data.presensiWarningMessage}</span>
		</div>
	{:else if !hasFilteredMurid}
		<div class="alert alert-soft alert-info mt-6">
			<Icon name="info" />
			<span>Tidak ada murid yang cocok dengan pencarian.</span>
		</div>
	{:else if data.mode === 'rapor' && !data.presensiReady && data.presensiWarningMessage}
		<div class="alert alert-soft alert-warning mt-6">
			<Icon name="alert" />
			<span>{data.presensiWarningMessage}</span>
		</div>
	{:else if data.mode === 'rapor' && (!data.tanggalMulaiRapor || !data.tanggalAkhirRapor)}
		<div class="alert alert-soft alert-warning mt-6">
			<Icon name="alert" />
			<span
				>Tanggal masuk semester atau tanggal bagi rapor belum diatur. Atur di halaman /akademik.</span
			>
		</div>
	{:else if data.mode === 'bulanan'}
		<div
			class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
		>
			<table class="border-base-200 table border text-xs sm:text-sm dark:border-none">
				<thead>
					<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
						<th
							class="bg-base-200 dark:bg-base-300 sticky left-0 z-10 text-center"
							style="width: 40px; min-width: 36px;">No</th
						>
						<th
							class="bg-base-200 dark:bg-base-300 sticky left-[40px] z-10"
							style="min-width: 140px;">Nama</th
						>
						{#each Array(data.daysInMonth) as _, i}
							{@const isRed = data.redDays.includes(i + 1)}
							<th
								class="text-center {isRed ? 'text-error' : ''}"
								style="width: 30px; min-width: 26px;">{i + 1}</th
							>
						{/each}
						<th class="text-center" style="width: 34px; min-width: 30px;">S</th>
						<th class="text-center" style="width: 34px; min-width: 30px;">I</th>
						<th class="text-center" style="width: 34px; min-width: 30px;">TK</th>
						<th class="text-center" style="width: 38px; min-width: 34px;">JLH</th>
					</tr>
				</thead>
				<tbody>
					{#each data.bulananRows as row (row.no)}
						<tr class="hover:bg-base-200/30">
							<td class="bg-base-100 dark:bg-base-200 sticky left-0 z-10 text-center">{row.no}</td>
							<td class="bg-base-100 dark:bg-base-200 sticky left-[40px] z-10">{row.nama}</td>
							{#each row.statusPerDay as status, i}
								{@const isRed = data.redDays.includes(i + 1)}
								<td class="text-center font-mono {isRed ? 'bg-error/5' : ''}">
									{#if status === 'H'}
										<span class="text-success font-bold">{status}</span>
									{:else if status === 'S'}
										<span class="text-warning font-bold">{status}</span>
									{:else if status === 'I'}
										<span class="text-info font-bold">{status}</span>
									{:else if status === 'TK'}
										<span class="text-error font-bold">{status}</span>
									{:else}
										<span class="text-base-content/20">-</span>
									{/if}
								</td>
							{/each}
							<td class="text-center font-bold">{row.countS || ''}</td>
							<td class="text-center font-bold">{row.countI || ''}</td>
							<td class="text-center font-bold">{row.countTK || ''}</td>
							<td class="text-center font-bold">{row.countHadir || ''}</td>
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
	{:else if data.mode === 'rapor'}
		<div
			class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
		>
			<table class="border-base-200 table border dark:border-none">
				<thead>
					<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
						<th style="width: 50px; min-width: 40px;">No</th>
						<th class="w-full" style="min-width: 160px;">Nama</th>
						<th class="text-center" style="min-width: 80px;">Hadir</th>
						<th class="text-center" style="min-width: 80px;">Sakit</th>
						<th class="text-center" style="min-width: 80px;">Izin</th>
						<th class="text-center" style="min-width: 80px;">Alfa</th>
						<th class="text-center" style="min-width: 160px;">Aksi</th>
					</tr>
				</thead>
				<tbody>
					{#each data.raporRows as row (row.id)}
						{@const isEditing = raporEditingRowId === row.id}
						{@const updateFormId = `rapor-update-form-${row.id}`}
						{@const resetFormId = `rapor-reset-form-${row.id}`}
						<tr class={isEditing ? 'bg-base-200/40' : undefined}>
							<td>{row.no}</td>
							<td>{@html searchQueryMarker(data.page.search, row.nama)}</td>
							<td class="text-center font-bold">{row.hadir || ''}</td>
							<td class="text-center">
								{#if isEditing}
									<input
										type="number"
										class="input input-sm bg-base-200 dark:bg-base-300 w-16 text-center dark:border-none"
										value={raporEditingValues.sakit}
										onchange={(e) =>
											(raporEditingValues = {
												...raporEditingValues,
												sakit: Number((e.currentTarget as HTMLInputElement).value)
											})}
										min="0"
									/>
								{:else}
									{row.sakit || ''}
								{/if}
							</td>
							<td class="text-center">
								{#if isEditing}
									<input
										type="number"
										class="input input-sm bg-base-200 dark:bg-base-300 w-16 text-center dark:border-none"
										value={raporEditingValues.izin}
										onchange={(e) =>
											(raporEditingValues = {
												...raporEditingValues,
												izin: Number((e.currentTarget as HTMLInputElement).value)
											})}
										min="0"
									/>
								{:else}
									{row.izin || ''}
								{/if}
							</td>
							<td class="text-center">
								{#if isEditing}
									<input
										type="number"
										class="input input-sm bg-base-200 dark:bg-base-300 w-16 text-center dark:border-none"
										value={raporEditingValues.alfa}
										onchange={(e) =>
											(raporEditingValues = {
												...raporEditingValues,
												alfa: Number((e.currentTarget as HTMLInputElement).value)
											})}
										min="0"
									/>
								{:else}
									{row.alfa || ''}
								{/if}
							</td>
							<td>
								<div class="flex items-center justify-center gap-2">
									{#if isEditing}
										<FormEnhance
											id={updateFormId}
											action="?/updateRapor"
											submitStateChange={(value) => (raporEditingSubmitting = value)}
											onsuccess={handleRaporUpdateSuccess}
											showToast
										>
											{#snippet children({ submitting })}
												<input type="hidden" name="muridId" value={row.id} />
												<input
													type="hidden"
													name="sakit"
													value={raporEditingValues.sakit}
													data-submitting={submitting ? '1' : '0'}
												/>
												<input type="hidden" name="izin" value={raporEditingValues.izin} />
												<input type="hidden" name="alfa" value={raporEditingValues.alfa} />
											{/snippet}
										</FormEnhance>
										<button
											type="button"
											class="btn btn-soft btn-sm btn-error shadow-none"
											title="Batalkan"
											onclick={cancelRaporEdit}
											disabled={raporEditingSubmitting}
										>
											<Icon name="close" />
										</button>
										<button
											type="submit"
											class="btn btn-primary btn-sm shadow-none"
											title="Simpan"
											form={updateFormId}
											disabled={raporEditingSaveDisabled}
										>
											{#if raporEditingSubmitting}
												<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
											{/if}
											<Icon name="save" />
										</button>
									{:else}
										<div class="flex flex-row">
											<button
												type="button"
												class="btn btn-soft btn-sm rounded-r-none shadow-none"
												onclick={() => startRaporEdit(row)}
												disabled={!data.tableReady || !canEdit}
												title={!canEdit
													? 'Anda tidak memiliki izin untuk mengedit'
													: 'Edit nilai ketidakhadiran'}
											>
												<Icon name="edit" />
											</button>
											<FormEnhance
												id={resetFormId}
												action="?/resetRapor"
												onsuccess={handleRaporUpdateSuccess}
												showToast
											>
												<input type="hidden" name="muridId" value={row.id} />
											</FormEnhance>
											<button
												type="submit"
												class="btn btn-soft btn-warning btn-sm rounded-l-none shadow-none"
												title="Reset ke nilai asli"
												form={resetFormId}
												disabled={!data.tableReady || !canEdit || !row.overridden}
											>
												<Icon name="repeat" />
											</button>
										</div>
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
	{:else if data.mode === 'persentase_harian'}
		{#if data.persentaseHarianSubjects.length === 0}
			<div class="alert alert-soft alert-warning mt-6">
				<Icon name="alert" />
				<span
					>Tidak ada jadwal pelajaran untuk hari ini. Persentase kehadiran per mapel tidak tersedia.</span
				>
			</div>
		{:else}
			<div
				class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
			>
				<table class="border-base-200 table border text-xs sm:text-sm dark:border-none">
					<thead>
						<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
							<th class="text-center" style="width: 50px; min-width: 40px;">No</th>
							<th style="min-width: 160px;">Nama</th>
							{#each data.persentaseHarianSubjects as subject (subject.kodeKegiatan)}
								<th class="text-center" style="min-width: 80px;">{subject.label}</th>
							{/each}
							<th class="text-center" style="min-width: 100px;">%</th>
						</tr>
					</thead>
					<tbody>
						{#each data.persentaseHarianRows as row (row.muridId)}
							<tr>
								<td class="text-center">{row.no}</td>
								<td>{row.nama}</td>
								{#each data.persentaseHarianSubjects as subject (subject.kodeKegiatan)}
									{@const status = row.subjects[subject.kodeKegiatan] ?? ''}
									<td class="text-center">
										{#if status === 'H'}
											<span class="text-success font-bold">H</span>
										{:else if status === 'S'}
											<span class="text-warning font-bold">S</span>
										{:else if status === 'I'}
											<span class="text-info font-bold">I</span>
										{:else if status === 'TK'}
											<span class="text-error font-bold">TK</span>
										{:else}
											<span class="text-base-content/40">-</span>
										{/if}
									</td>
								{/each}
								<td class="text-center font-semibold">{row.persentase}%</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
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
							<td class="overflow-hidden text-center">
								{#if isEditing}
									<select
										class="select select-sm bg-base-200 dark:bg-base-300 w-full truncate text-center dark:border-none"
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
	:global(form[id^='rapor-update-form-']),
	:global(form[id^='rapor-reset-form-']) {
		display: contents;
	}
</style>
