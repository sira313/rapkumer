<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	type TahunAjaranRow = typeof import('$lib/server/db/schema').tableTahunAjaran.$inferSelect;
	type SemesterRow = typeof import('$lib/server/db/schema').tableSemester.$inferSelect;
	type TahunAjaranWithSemester = TahunAjaranRow & { semester: SemesterRow[] };

	const { data } = $props<{ data: PageData }>();
	const sekolahList = (data.sekolahList ?? []) as Sekolah[];
	const tahunAjaranList = (data.tahunAjaranList ?? []) as TahunAjaranWithSemester[];
	let activeSekolahId = $state(data.activeSekolahId ?? null);
	const activeTahunAjaranId = data.activeTahunAjaranId ?? null;
	const activeSemesterId = data.activeSemesterId ?? null;
	const tanggalBagiRaport = data.tanggalBagiRaport as {
		ganjilId?: number;
		ganjil?: string | null;
		genapId?: number;
		genap?: string | null;
	};
	const tanggalMasuk = data.tanggalMasuk as {
		ganjilId?: number;
		ganjil?: string | null;
		genapId?: number;
		genap?: string | null;
	};

	let selectedSekolahId = $derived(activeSekolahId ? String(activeSekolahId) : '');
	let selectedTahunAjaranId = $state(activeTahunAjaranId ? String(activeTahunAjaranId) : '');
	let selectedSemesterId = $state(activeSemesterId ? String(activeSemesterId) : '');
	let tanggalRaporGanjil = $state(tanggalBagiRaport.ganjil ?? '');
	let tanggalRaporGenap = $state(tanggalBagiRaport.genap ?? '');
	let tanggalMasukGanjil = $state(tanggalMasuk.ganjil ?? '');
	let tanggalMasukGenap = $state(tanggalMasuk.genap ?? '');

	let tahunAjaranOptions = $state(tahunAjaranList);
	const disabledSekolahActions = sekolahList.length === 0;

	let semesterOptions = $state<SemesterRow[]>([]);
	let semesterGanjil = $state<SemesterRow | null>(null);
	let semesterGenap = $state<SemesterRow | null>(null);
	let selectedSemesterRecord = $state<SemesterRow | null>(null);
	let disabledSave = $state(false);
	const disableTanggalInputs = $derived(!semesterGanjil && !semesterGenap);
	const selectedTipe = $derived(selectedSemesterRecord?.tipe ?? null);
	const showGanjil = $derived(!selectedTipe || selectedTipe === 'ganjil');
	const showGenap = $derived(!selectedTipe || selectedTipe === 'genap');
	const canCopySemester = $derived.by(() => {
		const target = selectedSemesterRecord;
		if (!target) return false;
		if (target.tipe !== 'genap') return false;
		return Boolean(semesterGanjil);
	});
	const copyButtonTooltip = $derived.by(() => {
		if (!selectedSemesterRecord) {
			return 'Pilih semester terlebih dahulu';
		}
		if (selectedSemesterRecord.tipe !== 'genap') {
			return 'Salin hanya tersedia saat semester genap dipilih';
		}
		if (!semesterGanjil) {
			return 'Semester ganjil belum tersedia untuk disalin';
		}
		return null;
	});

	$effect(() => {
		const tahunId = Number(selectedTahunAjaranId);
		const nextTahun =
			Number.isFinite(tahunId) && tahunId
				? (tahunAjaranOptions.find((item) => item.id === tahunId) ?? null)
				: null;

		const nextSemesterList = nextTahun?.semester ?? [];
		semesterOptions = nextSemesterList;

		if (!nextSemesterList.some((item) => String(item.id) === selectedSemesterId)) {
			const fallback =
				nextSemesterList.find((item) => item.isAktif) ?? nextSemesterList.at(0) ?? null;
			selectedSemesterId = fallback ? String(fallback.id) : '';
		}

		semesterGanjil = nextSemesterList.find((item) => item.tipe === 'ganjil') ?? null;
		semesterGenap = nextSemesterList.find((item) => item.tipe === 'genap') ?? null;
		selectedSemesterRecord =
			nextSemesterList.find((item) => String(item.id) === selectedSemesterId) ?? null;

		const noTahun = tahunAjaranOptions.length === 0;
		const noSemester = nextSemesterList.length === 0;
		const noTanggal = disableTanggalInputs;
		disabledSave = disabledSekolahActions || (noTahun && noSemester && noTanggal);
	});

	let prevGanjilId: number | null = null;
	$effect(() => {
		const currentId = semesterGanjil?.id ?? null;
		if (currentId !== prevGanjilId) {
			tanggalRaporGanjil = semesterGanjil?.tanggalBagiRaport ?? '';
			tanggalMasukGanjil = semesterGanjil?.tanggalMasuk ?? '';
			prevGanjilId = currentId;
		}
	});

	let prevGenapId: number | null = null;
	$effect(() => {
		const currentId = semesterGenap?.id ?? null;
		if (currentId !== prevGenapId) {
			tanggalRaporGenap = semesterGenap?.tanggalBagiRaport ?? '';
			tanggalMasukGenap = semesterGenap?.tanggalMasuk ?? '';
			prevGenapId = currentId;
		}
	});

	let formInitSekolah = $derived({
		sekolahId: activeSekolahId ? String(activeSekolahId) : ''
	});

	let formInitPengaturan = $state<Record<string, string>>({
		tahunAjaranId: activeTahunAjaranId ? String(activeTahunAjaranId) : '',
		semesterId: activeSemesterId ? String(activeSemesterId) : '',
		'ganjil.id': tanggalBagiRaport.ganjilId ? String(tanggalBagiRaport.ganjilId) : '',
		'ganjil.tanggalBagiRaport': tanggalBagiRaport.ganjil ?? '',
		'ganjil.tanggalMasuk': tanggalMasuk.ganjil ?? '',
		'genap.id': tanggalBagiRaport.genapId ? String(tanggalBagiRaport.genapId) : '',
		'genap.tanggalBagiRaport': tanggalBagiRaport.genap ?? '',
		'genap.tanggalMasuk': tanggalMasuk.genap ?? ''
	});

	type AcademicPayload = {
		tahunAjaranList?: TahunAjaranWithSemester[];
		activeSekolahId?: number;
		activeTahunAjaranId?: number | null;
		activeSemesterId?: number | null;
		tanggalBagiRaport?: {
			ganjilId?: number;
			ganjil?: string | null;
			genapId?: number;
			genap?: string | null;
		};
		tanggalMasuk?: {
			ganjilId?: number;
			ganjil?: string | null;
			genapId?: number;
			genap?: string | null;
		};
	};

	const applyAcademicContext = (data?: AcademicPayload) => {
		if (!data) return;

		if (data.tahunAjaranList) {
			tahunAjaranOptions = data.tahunAjaranList;
		}

		if (data.activeSekolahId !== undefined) {
			activeSekolahId = data.activeSekolahId ?? null;
		}

		if ('activeTahunAjaranId' in data) {
			selectedTahunAjaranId = data.activeTahunAjaranId ? String(data.activeTahunAjaranId) : '';
		}

		if ('activeSemesterId' in data) {
			selectedSemesterId = data.activeSemesterId ? String(data.activeSemesterId) : '';
		}

		const rapor = data.tanggalBagiRaport ?? {
			ganjilId: formInitPengaturan['ganjil.id']
				? Number(formInitPengaturan['ganjil.id'])
				: undefined,
			ganjil: tanggalRaporGanjil || null,
			genapId: formInitPengaturan['genap.id'] ? Number(formInitPengaturan['genap.id']) : undefined,
			genap: tanggalRaporGenap || null
		};

		const masuk = data.tanggalMasuk ?? {
			ganjilId: formInitPengaturan['ganjil.id']
				? Number(formInitPengaturan['ganjil.id'])
				: undefined,
			ganjil: tanggalMasukGanjil || null,
			genapId: formInitPengaturan['genap.id'] ? Number(formInitPengaturan['genap.id']) : undefined,
			genap: tanggalMasukGenap || null
		};

		tanggalRaporGanjil = rapor.ganjil ?? '';
		tanggalRaporGenap = rapor.genap ?? '';
		tanggalMasukGanjil = masuk.ganjil ?? '';
		tanggalMasukGenap = masuk.genap ?? '';

		formInitPengaturan = {
			tahunAjaranId: selectedTahunAjaranId,
			semesterId: selectedSemesterId,
			'ganjil.id': rapor.ganjilId ? String(rapor.ganjilId) : '',
			'ganjil.tanggalBagiRaport': rapor.ganjil ?? '',
			'ganjil.tanggalMasuk': masuk.ganjil ?? '',
			'genap.id': rapor.genapId ? String(rapor.genapId) : '',
			'genap.tanggalBagiRaport': rapor.genap ?? '',
			'genap.tanggalMasuk': masuk.genap ?? ''
		};
	};

	const handleSwitchSuccess = ({ data }: { data?: AcademicPayload }) => {
		applyAcademicContext(data);
	};

	const handleSaveSuccess = ({ data }: { data?: AcademicPayload }) => {
		applyAcademicContext(data);
	};

	// permission runes (single permission for managing rapor)
	import { page } from '$app/state';
	let canRaporManage = $derived.by(() => {
		const perms = (page.data.user ?? { permissions: [] }).permissions ?? [];
		return (perms as string[]).includes('rapor_manage');
	});

	// Check if selected school is different from active school
	let isSekolahChanged = $derived.by(() => {
		if (!activeSekolahId || !selectedSekolahId) return false;
		return String(activeSekolahId) !== selectedSekolahId;
	});

	import { showModal } from '$lib/components/global-modal.svelte';
	import PresensiSettingsModal from '$lib/components/presensi/presensi-settings-modal.svelte';

	type PresensiSettingRow =
		typeof import('$lib/server/db/schema').tablePresensiSettings.$inferSelect;
	const presensiSettingsList = $derived(data.presensiSettingsList as PresensiSettingRow[]);
	const presensiTahunSet = $derived(new Set(presensiSettingsList.map((p) => p.tahunAjaranId)));

	const selectedTahunAjaranNum = $derived(Number(selectedTahunAjaranId));
	const hasPresensiSettings = $derived(
		Number.isFinite(selectedTahunAjaranNum) && selectedTahunAjaranNum > 0
			? presensiTahunSet.has(selectedTahunAjaranNum)
			: false
	);

	function openPresensiSettings() {
		const tahunId = Number(selectedTahunAjaranId);
		if (!tahunId) return;
		const existing = presensiSettingsList.find((p) => p.tahunAjaranId === tahunId) ?? null;
		let actions: { submit: () => Promise<void>; cancel: () => void };
		showModal({
			title: 'Pengaturan Presensi',
			body: PresensiSettingsModal,
			bodyProps: {
				tahunAjaranId: tahunId,
				jamMasuk: existing?.jamMasuk ?? '07:30',
				jamPulang: existing?.jamPulang ?? '15:00',
				hariSekolah: existing?.hariSekolah ?? 6,
				tipePresensi: existing?.tipePresensi ?? 'masuk_pulang',
				jenisPresensi: existing?.jenisPresensi ?? 'wali_kelas_saja',
				liburNasional: existing?.liburNasional ?? '[]',
				liburSemester: existing?.liburSemester ?? '[]',
				onAction: (a) => {
					actions = a;
				}
			},
			onPositive: {
				label: 'Simpan',
				action: () => actions.submit()
			},
			onNegative: {
				label: 'Batal'
			},
			dismissible: false
		});
	}

	let presensiBtnClass = $derived(
		hasPresensiSettings ? 'btn-success shadow-none' : 'btn-error shadow-none'
	);

	const presensiJadwalReady = $derived(
		hasPresensiSettings && !!selectedSemesterRecord?.tanggalMasuk
	);

	function openJadwalBell() {
		goto(resolve('/akademik/jadwal-pelajaran'));
	}

	const jadwalBellDisabled = $derived(!presensiJadwalReady || !canRaporManage);
</script>

<div class="grid grid-cols-1 gap-6">
	<section class="card bg-base-100 rounded-lg border border-none p-6 shadow-md">
		<div class="space-y-6">
			<header>
				<h1 class="text-2xl font-bold">Manajemen Akademik</h1>
				<p class="text-base-content/70 text-sm">
					Kelola sekolah aktif, tahun ajaran, semester, presensi, dan jadwal pelajaran.
				</p>
			</header>

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Ganti sekolah</legend>
				<FormEnhance action="?/switch" init={formInitSekolah} onsuccess={handleSwitchSuccess}>
					{#snippet children({ submitting })}
						<div class="flex flex-row">
							<div class="min-w-0 flex-1 overflow-hidden">
								<select
									class="select bg-base-200 dark:bg-base-300 w-full truncate rounded-r-none dark:border-none"
									name="sekolahId"
									bind:value={selectedSekolahId}
									required
									disabled={disabledSekolahActions || submitting || !canRaporManage}
								>
									<option value="" disabled>Pilih Sekolah</option>
									{#if sekolahList.length === 0}
										<option disabled value="">Belum ada data sekolah</option>
									{:else}
										{#each sekolahList as item (item.id)}
											<option value={String(item.id)}>{item.nama}</option>
										{/each}
									{/if}
								</select>
							</div>
							<button
								class="btn btn-primary rounded-l-none shadow-none"
								type="submit"
								disabled={submitting ||
									disabledSekolahActions ||
									!canRaporManage ||
									!isSekolahChanged}
								aria-disabled={!canRaporManage || !isSekolahChanged}
								title={!canRaporManage
									? 'Anda tidak memiliki izin untuk mengganti sekolah'
									: !isSekolahChanged
										? 'Sekolah ini sudah aktif'
										: ''}
							>
								<Icon name="repeat" />
								{submitting ? 'Menyimpan…' : 'Ganti'}
							</button>
						</div>
					{/snippet}
				</FormEnhance>
				<p class="text-base-content/70 mt-1 text-xs">
					Operator dapat memilih sekolah aktif di sini.
				</p>
			</fieldset>

			<FormEnhance
				action="?/save"
				init={formInitPengaturan}
				onsuccess={handleSaveSuccess}
				enctype="multipart/form-data"
			>
				{#snippet children({ submitting, invalid })}
					<input
						type="hidden"
						name="ganjil.id"
						value={semesterGanjil
							? String(semesterGanjil.id)
							: (formInitPengaturan['ganjil.id'] ?? '')}
					/>
					<input
						type="hidden"
						name="genap.id"
						value={semesterGenap
							? String(semesterGenap.id)
							: (formInitPengaturan['genap.id'] ?? '')}
					/>
					<input type="hidden" name="targetSemesterId" value={selectedSemesterId} />
					<input
						type="hidden"
						name="sourceSemesterId"
						value={semesterGanjil ? String(semesterGanjil.id) : ''}
					/>
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<fieldset class="fieldset overflow-hidden">
							<legend class="fieldset-legend">Tahun Ajaran</legend>
							<select
								class="select bg-base-200 dark:bg-base-300 w-full truncate dark:border-none"
								name="tahunAjaranId"
								bind:value={selectedTahunAjaranId}
								required
								disabled={!canRaporManage}
							>
								<option value="" disabled>Pilih Tahun Ajaran</option>
								{#each tahunAjaranOptions as item (item.id)}
									<option value={String(item.id)}>
										{item.nama}
										{item.isAktif ? ' (aktif)' : ''}
									</option>
								{/each}
							</select>
						</fieldset>

						<fieldset class="fieldset overflow-hidden">
							<legend class="fieldset-legend">Semester</legend>
							<select
								class="select bg-base-200 dark:bg-base-300 w-full truncate dark:border-none"
								name="semesterId"
								bind:value={selectedSemesterId}
								required
								disabled={semesterOptions.length === 0 || !canRaporManage}
							>
								<option value="" disabled>Pilih Semester</option>
								{#each semesterOptions as item (item.id)}
									<option value={String(item.id)}>
										{item.nama}
										{item.isAktif ? ' (aktif)' : ''}
									</option>
								{/each}
							</select>
						</fieldset>

						{#if showGanjil}
							<fieldset class="fieldset">
								<legend class="fieldset-legend">Tanggal masuk semester ganjil</legend>
								<input
									class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
									type="date"
									name="ganjil.tanggalMasuk"
									bind:value={tanggalMasukGanjil}
									disabled={!canRaporManage}
								/>
								<p class="text-base-content/70 mt-2 text-xs">
									Tanggal ini akan menjadi acuan mulai presensi semester ganjil.
								</p>
							</fieldset>
						{:else}
							<input type="hidden" name="ganjil.tanggalMasuk" value={tanggalMasukGanjil} />
						{/if}

						{#if showGenap}
							<fieldset class="fieldset">
								<legend class="fieldset-legend">Tanggal masuk semester genap</legend>
								<input
									class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
									type="date"
									name="genap.tanggalMasuk"
									bind:value={tanggalMasukGenap}
									disabled={!canRaporManage}
								/>
								<p class="text-base-content/70 mt-2 text-xs">
									Tanggal ini akan menjadi acuan mulai presensi semester genap.
								</p>
							</fieldset>
						{:else}
							<input type="hidden" name="genap.tanggalMasuk" value={tanggalMasukGenap} />
						{/if}

						{#if showGanjil}
							<fieldset class="fieldset">
								<legend class="fieldset-legend">Tanggal bagi rapor semester ganjil</legend>
								<input
									class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
									type="date"
									name="ganjil.tanggalBagiRaport"
									bind:value={tanggalRaporGanjil}
									disabled={!canRaporManage}
								/>
								<p class="text-base-content/70 mt-2 text-xs">
									Tanggal ini akan muncul di catatan rapor semester ganjil.
								</p>
							</fieldset>
						{:else}
							<input type="hidden" name="ganjil.tanggalBagiRaport" value={tanggalRaporGanjil} />
						{/if}

						{#if showGenap}
							<fieldset class="fieldset">
								<legend class="fieldset-legend">Tanggal bagi rapor semester genap</legend>
								<input
									class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
									type="date"
									name="genap.tanggalBagiRaport"
									bind:value={tanggalRaporGenap}
									disabled={!canRaporManage}
								/>
								<p class="text-base-content/70 mt-2 text-xs">
									Tanggal ini akan muncul di catatan rapor semester genap.
								</p>
							</fieldset>
						{:else}
							<input type="hidden" name="genap.tanggalBagiRaport" value={tanggalRaporGenap} />
						{/if}

						<fieldset class="fieldset md:col-span-2">
							<legend class="fieldset-legend">Import data siswa dan kelas</legend>
							<input
								type="file"
								class="file-input file-input-ghost"
								accept=".xlsx, .xls"
								name="data"
								disabled={!canRaporManage}
								aria-disabled={!canRaporManage}
								title={!canRaporManage ? 'Anda tidak memiliki izin untuk mengimpor data siswa' : ''}
							/>
							<p class="text-base-content/70 mt-1 text-xs">
								File daftar siswa dengan format excel dari dapodik. Pastikan file dapat dibuka
								sebelum import.
							</p>
						</fieldset>
					</div>

					<div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
						<div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
							<button
								class="btn btn-soft shadow-none max-sm:w-full"
								type="submit"
								formaction="?/copy-semester"
								disabled={submitting || !canCopySemester || !canRaporManage}
								aria-disabled={!canRaporManage}
								title={!canRaporManage
									? 'Anda tidak memiliki izin untuk menyalin semester'
									: (copyButtonTooltip ?? undefined)}
							>
								<Icon name="copy" />
								Salin Semester Ganjil
							</button>
							<button
								type="button"
								class="btn {presensiBtnClass} max-sm:w-full"
								onclick={openPresensiSettings}
								disabled={!selectedTahunAjaranId || !canRaporManage}
								aria-disabled={!canRaporManage}
								title={!canRaporManage ? 'Anda tidak memiliki izin untuk mengatur presensi' : ''}
							>
								<Icon name="gear" />
								Pengaturan Presensi
							</button>
							<button
								type="button"
								class="btn btn-soft shadow-none max-sm:w-full"
								onclick={openJadwalBell}
								disabled={jadwalBellDisabled}
								aria-disabled={jadwalBellDisabled}
								title={!presensiJadwalReady
									? 'Atur presensi dan tanggal masuk semester terlebih dahulu'
									: !canRaporManage
										? 'Anda tidak memiliki izin'
										: ''}
							>
								<Icon name="table" />
								Jadwal dan Bell
							</button>
						</div>
						<button
							class="btn btn-primary shadow-none max-sm:w-full"
							type="submit"
							disabled={submitting || invalid || disabledSave || !canRaporManage}
							aria-disabled={!canRaporManage}
							title={!canRaporManage
								? 'Anda tidak memiliki izin untuk menyimpan pengaturan rapor'
								: ''}
						>
							<Icon name="save" />
							{submitting ? 'Menyimpan…' : 'Simpan'}
						</button>
					</div>
				{/snippet}
			</FormEnhance>
		</div>
	</section>
</div>
