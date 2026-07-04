<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import IsiSekaligusModal from '$lib/components/absen/isi-sekaligus-modal.svelte';
	import DownloadRekapModal from '$lib/components/absen/download-rekap-modal.svelte';
	import HapusPresensiModal from '$lib/components/absen/hapus-presensi-modal.svelte';
	import TableHarian from '$lib/components/absen/table-harian.svelte';
	import TableBulanan from '$lib/components/absen/table-bulanan.svelte';
	import TableRapor from '$lib/components/absen/table-rapor.svelte';
	import TablePersentaseHarian from '$lib/components/absen/table-persentase-harian.svelte';
	import TablePersentaseBulanan from '$lib/components/absen/table-persentase-bulanan.svelte';
	import TablePersentaseSemester from '$lib/components/absen/table-persentase-semester.svelte';
	import AbsenPagination from '$lib/components/absen/absen-pagination.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { onDestroy } from 'svelte';
	import { serverTime } from '$lib/server-time.svelte';

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

	type KehadiranRow = {
		id: number;
		no: number;
		nama: string;
		hadir: boolean;
		keterangan: string | null;
		keteranganPulang: string | null;
		updatedAt: string | null;
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

	type PageData = {
		page: PageState;
		daftarMurid: KehadiranRow[];
		semuaMurid: Array<{ id: number; nama: string; keterangan: string | null }>;
		tableReady: boolean;
		totalMurid: number;
		muridCount: number;
		tanggal: string;
		mode:
			| 'harian'
			| 'bulanan'
			| 'rapor'
			| 'persentase_harian'
			| 'persentase_bulanan'
			| 'persentase_semester';
		bulan: number;
		tahun: number;
		daysInMonth: number;
		bulananRows: Array<{
			no: number;
			nama: string;
			statusPerDay: Array<'' | 'H' | 'S' | 'I' | 'TK'>;
			countS: number;
			countI: number;
			countTK: number;
			countHadir: number;
		}>;
		raporRows: RaporRow[];
		redDays: number[];
		persentaseSemesterRows: Array<{
			no: number;
			nama: string;
			persentase: number;
			hadir: number;
			sakit: number;
			izin: number;
			alfa: number;
		}>;
		totalHariBelajar: number;
		totalPertemuan: number;
		persentaseBulananRows: Array<{
			no: number;
			nama: string;
			persentase: number;
			hadir: number;
			sakit: number;
			izin: number;
			alfa: number;
		}>;
		tanggalMulaiRapor: string;
		tanggalAkhirRapor: string;
		presensiReady: boolean;
		presensiWarningMessage: string;
		jenisPresensi: string;
		persentaseHarianSubjects: Array<{ kodeKegiatan: string; label: string }>;
		persentaseHarianRows: Array<{
			no: number;
			muridId: number;
			nama: string;
			subjects: Record<string, string>;
			sessionStatuses: Record<string, { masuk: string; selesai: string }>;
			persentase: number;
		}>;
		tipePresensi: string;
		jadwalSaatIni: {
			mataPelajaranId: number | null;
			namaMataPelajaran: string;
			jamKe: number;
			perkiraanJam: string;
		} | null;
		guruMapelSubject: { id: number; nama: string } | null;
		isMapelOnJadwal: boolean;
		harianMapelId: number | null;
		simulasiHari: string | null;
		simulasiJam: string | null;
		isLibur: boolean;
	};

	let { data }: { data: PageData } = $props();

	const kelasAktif = $derived(page.data.kelasAktif ?? null);
	const kelasAktifLabel = $derived.by(() => {
		if (!kelasAktif) return null;
		const base = kelasAktif.fase ? `${kelasAktif.nama} - ${kelasAktif.fase}` : kelasAktif.nama;
		const presensiLabel = data.jenisPresensi === 'tiap_mapel' ? 'Per Mapel' : 'Presensi Wali Kelas';
		const tipeLabel =
			data.tipePresensi === 'masuk_pulang'
				? 'Masuk Pulang'
				: data.tipePresensi === 'awal_akhir_mapel'
					? 'Awal & Akhir Mapel'
					: data.tipePresensi === 'awal_mapel'
						? 'Awal Mapel'
						: 'Masuk Saja';
		return `${base} - ${presensiLabel} - ${tipeLabel}`;
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
	let editingValues = $state<{ keterangan: string; keteranganPulang: string }>({
		keterangan: '',
		keteranganPulang: ''
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
			editingValues = { keterangan: '', keteranganPulang: '' };
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

	function startEdit(row: KehadiranRow) {
		editingRowId = row.id;
		editingValues = {
			keterangan: row.keterangan ?? '',
			keteranganPulang: row.keteranganPulang ?? ''
		};
	}

	function cancelEdit() {
		editingRowId = null;
	}

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
		const y = serverTime.now.getFullYear();
		const m = String(serverTime.now.getMonth() + 1).padStart(2, '0');
		const day = String(serverTime.now.getDate()).padStart(2, '0');
		return data.tanggal === `${y}-${m}-${day}`;
	});

	let selectedMode = $state<
		| 'harian'
		| 'bulanan'
		| 'rapor'
		| 'persentase_harian'
		| 'persentase_bulanan'
		| 'persentase_semester'
	>(data.mode);
	let selectedBulan = $state(
		data.mode === 'bulanan' || data.mode === 'persentase_bulanan'
			? data.bulan
			: serverTime.now.getMonth() + 1
	);
	let selectedTahun = $state(
		data.mode === 'bulanan' || data.mode === 'persentase_bulanan'
			? data.tahun
			: serverTime.now.getFullYear()
	);

	$effect(() => {
		selectedMode = data.mode;
	});

	$effect(() => {
		if (data.mode === 'bulanan' || data.mode === 'persentase_bulanan') {
			selectedBulan = data.bulan;
			selectedTahun = data.tahun;
		}
	});

	let simulasiHari = $state(page.url.searchParams.get('simHari') ?? 'Senin');
	let simulasiJam = $state(page.url.searchParams.get('simJam') ?? '07:00');
	let showSimulasi = $state(false);
	const simActive = $derived(!!page.url.searchParams.get('simHari'));

	function applySimulasi() {
		if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(simulasiJam)) {
			toast('Format jam tidak valid (HH:mm)', 'warning');
			return;
		}
		void applyNavigation((params) => {
			params.set('simHari', simulasiHari);
			params.set('simJam', simulasiJam);
		});
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
			} else if (selectedMode === 'persentase_bulanan') {
				params.set('mode', 'persentase_bulanan');
				params.set('bulan', String(selectedBulan));
				params.set('tahun', String(selectedTahun));
				params.delete('tanggal');
			} else if (selectedMode === 'persentase_semester') {
				params.set('mode', 'persentase_semester');
				params.delete('bulan');
				params.delete('tahun');
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
		if (data.mode === 'bulanan' || data.mode === 'persentase_bulanan') {
			void applyNavigation((params) => {
				params.set('mode', data.mode);
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
		} else if (data.mode === 'rapor' || data.mode === 'persentase_semester') {
			// No date navigation for rapor/persentase_semester mode
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
		if (data.mode !== 'bulanan' && data.mode !== 'persentase_bulanan') return false;
		return (
			data.bulan === serverTime.now.getMonth() + 1 && data.tahun === serverTime.now.getFullYear()
		);
	});

	function resetToCurrentBulan() {
		void applyNavigation((params) => {
			params.set('mode', data.mode);
			params.set('bulan', String(serverTime.now.getMonth() + 1));
			params.set('tahun', String(serverTime.now.getFullYear()));
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

	const jadwalBelumDimulai = $derived(false);

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
				{:else if data.mode === 'persentase_bulanan'}
					Persentase Kehadiran bulan -
					<span class="text-primary">{bulanList[data.bulan - 1]} {data.tahun}</span>
				{:else if data.mode === 'persentase_semester'}
					Persentase Kehadiran Semester
					{#if data.tanggalMulaiRapor && data.tanggalAkhirRapor}
						-
						<span class="text-primary"
							>{formatTanggal(data.tanggalMulaiRapor)} - {formatTanggal(
								data.tanggalAkhirRapor
							)}</span
						>
					{/if}
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
					<span class="text-primary">{formatTanggal(data.tanggal)}</span>
				{:else}
					Kehadiran murid -
					<span class="text-primary">{formatTanggal(data.tanggal)}</span>
				{/if}
			</h2>
			{#if kelasAktifLabel}
				<p class="text-base-content/80 block text-sm">
					{kelasAktifLabel}
					{#if data.mode === 'harian' || data.mode === 'persentase_harian'}
						- {data.isLibur ? 'Libur' : 'Masuk'}
					{/if}
				</p>
			{/if}
		</div>
		{#if data.mode === 'rapor' || data.mode === 'persentase_bulanan' || data.mode === 'persentase_semester' || data.mode === 'bulanan'}{:else}
			{@const currentMapel = data.jadwalSaatIni}
			<div class="flex max-sm:w-full">
				<button
					type="button"
					class="btn btn-primary btn-soft flex-1 rounded-r-none shadow-none max-sm:flex-1"
					disabled={!canEdit && page.data.user?.type !== 'user'}
					title={!canEdit && page.data.user?.type !== 'user'
						? 'Anda tidak memiliki izin untuk mengisi sekaligus'
						: ''}
					onclick={() => {
						if (!data.presensiReady) {
							presensiNotReady();
							return;
						}
						if (jadwalBelumDimulai) {
							toast({ message: 'Jam pelajaran bapak/ibu belum dimulai', type: 'warning' });
							return;
						}
						if (page.data.user?.type === 'user' && !data.isMapelOnJadwal) {
							toast({
								message: 'Mata pelajaran tidak dijadwalkan pada tanggal ini',
								type: 'warning'
							});
							return;
						}
						const useMapelData = page.data.user?.type === 'user';
						const fallbackSubject = data.guruMapelSubject;
						const isiMapelId = useMapelData
							? (currentMapel?.mataPelajaranId ?? fallbackSubject?.id ?? null)
							: (data.harianMapelId ?? null);
						showModal({
							title: 'Isi Kehadiran Sekaligus',
							body: IsiSekaligusModal,
							bodyProps: {
								daftarMurid: data.semuaMurid,
								kelasId: kelasAktif?.id ?? undefined,
								tanggal: data.tanggal,
								mataPelajaranId: isiMapelId,
								namaMataPelajaran: useMapelData
									? (currentMapel?.namaMataPelajaran ?? fallbackSubject?.nama ?? undefined)
									: undefined,
								perkiraanJam: useMapelData ? (currentMapel?.perkiraanJam ?? undefined) : undefined,
								simulasiHari: data.simulasiHari,
								simulasiJam: data.simulasiJam,
								tipePresensi: data.tipePresensi,
								jenisPresensi: data.jenisPresensi
							},
							dismissible: true
						});
					}}
				>
					<Icon name="copy" /> Isi Sekaligus
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
								class="w-full text-left {simActive ? 'text-warning' : ''}"
								aria-label="Simulasi hari & jam"
								title={simActive
									? `Simulasi: ${data.simulasiHari} ${data.simulasiJam}`
									: 'Simulasi hari & jam'}
								onclick={() => (showSimulasi = !showSimulasi)}
							>
								<Icon name={simActive ? 'pause' : 'play'} />
								Simulasi
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
				{#if data.mode === 'bulanan' || data.mode === 'persentase_bulanan'}
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
				{:else if data.mode === 'persentase_semester'}
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
					disabled={data.mode === 'rapor' || data.mode === 'persentase_semester'}
				>
					<Icon name="eye" />
				</button>
				<button
					type="button"
					class="btn btn-soft rounded-none shadow-none"
					aria-label={data.mode === 'bulanan' || data.mode === 'persentase_bulanan'
						? 'Kembali ke bulan ini'
						: 'Kembali ke hari ini'}
					title={data.mode === 'bulanan' || data.mode === 'persentase_bulanan'
						? 'Kembali ke bulan ini'
						: 'Kembali ke hari ini'}
					onclick={data.mode === 'bulanan' || data.mode === 'persentase_bulanan'
						? resetToCurrentBulan
						: resetToToday}
					disabled={data.mode === 'bulanan' || data.mode === 'persentase_bulanan'
						? isCurrentBulan
						: data.mode === 'rapor' || data.mode === 'persentase_semester'
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
							: data.mode === 'persentase_bulanan'
								? 'Tidak dapat menghapus dalam mode persentase bulanan'
								: data.mode === 'rapor'
									? 'Tidak dapat menghapus dalam mode rapor'
									: data.mode === 'persentase_semester'
										? 'Tidak dapat menghapus dalam mode persentase semester'
										: data.mode === 'persentase_harian'
											? 'Tidak dapat menghapus dalam mode persentase harian'
											: !canEdit
												? 'Anda tidak memiliki izin untuk menghapus presensi'
												: 'Hapus data presensi tanggal ini'}
					onclick={openDeleteConfirm}
					disabled={data.mode === 'bulanan' ||
						data.mode === 'persentase_bulanan' ||
						data.mode === 'rapor' ||
						data.mode === 'persentase_semester' ||
						data.mode === 'persentase_harian' ||
						!canEdit ||
						isGuruMapelMode}
				>
					<Icon name="del" />
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
		<div class="bg-base-200 rounded-box mb-4 p-3 shadow-md dark:shadow-none">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-end">
				<label class="flex flex-col gap-1 sm:flex-1">
					<span class="text-sm font-semibold">Hari</span>
					<select
						class="select select-sm bg-base-100 w-full dark:border-none"
						bind:value={simulasiHari}
					>
						{#each ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as h (h)}
							<option>{h}</option>
						{/each}
					</select>
				</label>
				<label class="flex flex-col gap-1 sm:flex-1">
					<span class="text-sm font-semibold">Jam</span>
					<input
						type="text"
						class="input input-sm bg-base-100 w-full dark:border-none"
						bind:value={simulasiJam}
						pattern="[0-9]{2}:[0-9]{2}"
						inputmode="numeric"
						placeholder="HH:mm"
					/>
				</label>
				<button type="button" class="btn btn-primary btn-sm shadow-none" onclick={applySimulasi}>
					<Icon name="play" /> Terapkan
				</button>
				{#if simActive}
					<button type="button" class="btn btn-soft btn-sm shadow-none" onclick={resetSimulasi}>
						Reset
					</button>
				{:else}
					<button
						type="button"
						class="btn btn-soft btn-sm shadow-none"
						onclick={() => (showSimulasi = false)}
					>
						Tutup
					</button>
				{/if}
			</div>
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
						| 'persentase_harian'
						| 'persentase_bulanan'
						| 'persentase_semester';
					handleModeChange();
				}}
			>
				<option value="harian">Harian</option>
				<option value="bulanan">Bulanan</option>
				{#if data.jenisPresensi === 'tiap_mapel'}
					<option value="persentase_harian">Persentase Harian</option>
				{/if}
				<option value="persentase_bulanan">Persentase Bulanan</option>
				<option value="persentase_semester">Persentase Semester</option>
				<option value="rapor">Rapor</option>
			</select>
		</div>
	</form>

	{#if !hasMurid}
		<div class="alert alert-soft alert-warning mt-6">
			<Icon name="alert" />
			<span>Belum ada murid di kelas ini. Tambahkan murid terlebih dahulu.</span>
		</div>
	{:else if (data.mode === 'persentase_harian' || data.mode === 'persentase_bulanan') && !data.presensiReady && data.presensiWarningMessage}
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
	{:else if data.mode === 'persentase_semester' && !data.presensiReady && data.presensiWarningMessage}
		<div class="alert alert-soft alert-warning mt-6">
			<Icon name="alert" />
			<span>{data.presensiWarningMessage}</span>
		</div>
	{:else if data.mode === 'persentase_semester' && (!data.tanggalMulaiRapor || !data.tanggalAkhirRapor)}
		<div class="alert alert-soft alert-warning mt-6">
			<Icon name="alert" />
			<span
				>Tanggal masuk semester atau tanggal bagi rapor belum diatur. Atur di halaman /akademik.</span
			>
		</div>
	{:else if data.mode === 'bulanan'}
		<TableBulanan
			rows={data.bulananRows}
			daysInMonth={data.daysInMonth}
			redDays={data.redDays}
			search={data.page.search}
		/>
		<AbsenPagination {pages} {currentPage} onPageClick={handlePageClick} />
	{:else if data.mode === 'rapor'}
		<TableRapor
			rows={data.raporRows}
			search={data.page.search}
			{canEdit}
			tableReady={data.tableReady}
			editingRowId={raporEditingRowId}
			editingValues={raporEditingValues}
			editingSubmitting={raporEditingSubmitting}
			editingSaveDisabled={raporEditingSaveDisabled}
			totalHariBelajar={data.totalHariBelajar}
			onStartEdit={startRaporEdit}
			onCancelEdit={cancelRaporEdit}
			onEditValueChange={(v) => (raporEditingValues = v)}
			onUpdateSuccess={handleRaporUpdateSuccess}
			onSubmitStateChange={(v) => (raporEditingSubmitting = v)}
		/>
		<AbsenPagination {pages} {currentPage} onPageClick={handlePageClick} />
	{:else if data.mode === 'persentase_bulanan'}
		<TablePersentaseBulanan
			rows={data.persentaseBulananRows}
			namaBulan={bulanList[data.bulan - 1] ?? ''}
			totalHariBelajar={data.totalHariBelajar}
			jenisPresensi={data.jenisPresensi}
			tipePresensi={data.tipePresensi}
			totalPertemuan={data.totalPertemuan}
		/>
		<AbsenPagination {pages} {currentPage} onPageClick={handlePageClick} />
	{:else if data.mode === 'persentase_harian'}
		<TablePersentaseHarian
			subjects={data.persentaseHarianSubjects}
			rows={data.persentaseHarianRows}
			tipePresensi={data.tipePresensi}
		/>
	{:else if data.mode === 'persentase_semester'}
		<TablePersentaseSemester
			rows={data.persentaseSemesterRows}
			tanggalMulai={data.tanggalMulaiRapor}
			tanggalAkhir={data.tanggalAkhirRapor}
			totalHariBelajar={data.totalHariBelajar}
			jenisPresensi={data.jenisPresensi}
			tipePresensi={data.tipePresensi}
			totalPertemuan={data.totalPertemuan}
		/>
		<AbsenPagination {pages} {currentPage} onPageClick={handlePageClick} />
	{:else}
		<TableHarian
			rows={data.daftarMurid}
			search={data.page.search}
			{canEdit}
			tableReady={data.tableReady}
			tanggal={data.tanggal}
			kelasId={kelasAktif?.id ?? null}
			{editingRowId}
			{editingValues}
			{editingSubmitting}
			onStartEdit={startEdit}
			onCancelEdit={cancelEdit}
			onEditValueChange={(v) => (editingValues = v)}
			onUpdateSuccess={handleUpdateSuccess}
			onSubmitStateChange={(v) => (editingSubmitting = v)}
			jenisPresensi={data.jenisPresensi}
			tipePresensi={data.tipePresensi}
			harianMapelId={data.harianMapelId}
		/>
		<AbsenPagination {pages} {currentPage} onPageClick={handlePageClick} />
	{/if}
</div>
