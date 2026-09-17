<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { hideModal, setLoading } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { isValidTime } from '$lib/utils';
	import {
		HARI_SEKOLAH_KEYS,
		parseHariSekolahCustom,
		type HariSekolahKey
	} from '$lib/hari-sekolah';

	interface SemesterRange {
		start: string;
		end: string;
	}

	interface Props {
		tahunAjaranId: number | string;
		jamMasuk?: string;
		jamPulang?: string;
		hariSekolah?: number;
		hariSekolahCustom?: string | null;
		tipePresensi?: string;
		jenisPresensi?: string;
		presensiGuruEnabled?: boolean;
		liburNasional?: string;
		liburSemester?: string;
		onAction?: (actions: { submit: () => Promise<void>; cancel: () => void }) => void;
	}

	let {
		tahunAjaranId,
		jamMasuk = '07:30',
		jamPulang = '15:00',
		hariSekolah = 6,
		hariSekolahCustom = null,
		tipePresensi = 'masuk_pulang',
		jenisPresensi = 'wali_kelas_saja',
		presensiGuruEnabled = true,
		liburNasional = '[]',
		liburSemester = '[]',
		onAction
	}: Props = $props();

	let submitting = $state(false);
	// svelte-ignore state_referenced_locally
	let jamMasukValue = $state(jamMasuk);
	// svelte-ignore state_referenced_locally
	let jamPulangValue = $state(jamPulang);
	// svelte-ignore state_referenced_locally
	const parsedCustom = parseHariSekolahCustom(hariSekolahCustom);
	let hariSekolahValue = $state(
		parsedCustom && parsedCustom.length > 0
			? 'custom'
			: // svelte-ignore state_referenced_locally
				hariSekolah === 5 || hariSekolah === 6
				? // svelte-ignore state_referenced_locally
					String(hariSekolah)
				: '6'
	);
	let customDays = $state<HariSekolahKey[]>(parsedCustom ?? []);

	const customDayLabels: Record<HariSekolahKey, string> = {
		senin: 'Senin',
		selasa: 'Selasa',
		rabu: 'Rabu',
		kamis: 'Kamis',
		jumat: 'Jumat',
		sabtu: 'Sabtu',
		minggu: 'Minggu'
	};

	function toggleCustomDay(key: HariSekolahKey) {
		customDays = customDays.includes(key)
			? customDays.filter((x) => x !== key)
			: [...customDays, key];
	}
	// svelte-ignore state_referenced_locally
	let tipePresensiValue = $state(tipePresensi);
	// svelte-ignore state_referenced_locally
	let jenisPresensiValue = $state(jenisPresensi);
	// svelte-ignore state_referenced_locally
	let presensiGuruEnabledValue = $state(presensiGuruEnabled);

	let liburDates = $state<string[]>([]);
	try {
		// svelte-ignore state_referenced_locally
		const parsed = JSON.parse(liburNasional);
		if (Array.isArray(parsed)) liburDates = parsed;
	} catch {
		// invalid JSON, use empty array
	}

	let newLiburDate = $state('');

	function addLiburDate() {
		if (!newLiburDate) return;
		if (liburDates.includes(newLiburDate)) return;
		liburDates = [...liburDates, newLiburDate];
		newLiburDate = '';
	}

	function removeLiburDate(index: number) {
		liburDates = liburDates.filter((_, i) => i !== index);
	}

	let semesterRanges = $state<SemesterRange[]>([]);
	try {
		// svelte-ignore state_referenced_locally
		const parsed = JSON.parse(liburSemester);
		if (Array.isArray(parsed)) semesterRanges = parsed;
	} catch {
		// invalid JSON, use empty array
	}

	function addSemesterRange() {
		semesterRanges = [...semesterRanges, { start: '', end: '' }];
	}

	function removeSemesterRange(index: number) {
		semesterRanges = semesterRanges.filter((_, i) => i !== index);
	}

	function updateSemesterRange(index: number, field: 'start' | 'end', value: string) {
		const next = [...semesterRanges];
		next[index] = { ...next[index], [field]: value };
		semesterRanges = next;
	}

	const validationError = $derived.by(() => {
		if (!jamMasukValue || !jamPulangValue) return 'Jam masuk dan jam pulang harus diisi';
		if (!isValidTime(jamMasukValue)) return 'Format jam masuk tidak valid (HH:mm)';
		if (!isValidTime(jamPulangValue)) return 'Format jam pulang tidak valid (HH:mm)';
		if (jamMasukValue >= jamPulangValue) return 'Jam masuk harus lebih awal dari jam pulang';
		if (!['5', '6', 'custom'].includes(hariSekolahValue)) return 'Pilih hari sekolah';
		if (hariSekolahValue === 'custom' && customDays.length === 0)
			return 'Pilih minimal satu hari belajar';
		if (
			!['masuk_pulang', 'masuk_saja', 'awal_mapel', 'awal_akhir_mapel'].includes(tipePresensiValue)
		)
			return 'Pilih tipe presensi';
		if (
			['awal_mapel', 'awal_akhir_mapel'].includes(tipePresensiValue) &&
			jenisPresensiValue !== 'tiap_mapel'
		)
			return 'Tipe presensi Awal/Awal & Akhir Mapel hanya tersedia untuk jenis presensi Tiap Mapel';
		if (
			['masuk_pulang', 'masuk_saja'].includes(tipePresensiValue) &&
			jenisPresensiValue !== 'wali_kelas_saja'
		)
			return 'Tipe presensi Masuk Pulang/Masuk Saja hanya tersedia untuk jenis presensi Wali Kelas Saja';
		if (!['wali_kelas_saja', 'tiap_mapel'].includes(jenisPresensiValue))
			return 'Pilih jenis presensi';
		return null;
	});

	function validateBeforeSubmit() {
		if (!jamMasukValue || !jamPulangValue) {
			toast('Jam masuk dan jam pulang harus diisi', 'warning');
			return false;
		}
		if (!isValidTime(jamMasukValue)) {
			toast('Format jam masuk tidak valid (HH:mm)', 'warning');
			return false;
		}
		if (!isValidTime(jamPulangValue)) {
			toast('Format jam pulang tidak valid (HH:mm)', 'warning');
			return false;
		}
		if (jamMasukValue >= jamPulangValue) {
			toast('Jam masuk harus lebih awal dari jam pulang', 'warning');
			return false;
		}
		if (!['5', '6', 'custom'].includes(hariSekolahValue)) {
			toast('Pilih hari sekolah', 'warning');
			return false;
		}
		if (hariSekolahValue === 'custom' && customDays.length === 0) {
			toast('Pilih minimal satu hari belajar', 'warning');
			return false;
		}
		if (
			!['masuk_pulang', 'masuk_saja', 'awal_mapel', 'awal_akhir_mapel'].includes(tipePresensiValue)
		) {
			toast('Pilih tipe presensi', 'warning');
			return false;
		}
		if (
			['awal_mapel', 'awal_akhir_mapel'].includes(tipePresensiValue) &&
			jenisPresensiValue !== 'tiap_mapel'
		) {
			toast(
				'Tipe presensi Awal/Awal & Akhir Mapel hanya tersedia untuk jenis presensi Tiap Mapel',
				'warning'
			);
			return false;
		}
		if (
			['masuk_pulang', 'masuk_saja'].includes(tipePresensiValue) &&
			jenisPresensiValue !== 'wali_kelas_saja'
		) {
			toast(
				'Tipe presensi Masuk Pulang/Masuk Saja hanya tersedia untuk jenis presensi Wali Kelas Saja',
				'warning'
			);
			return false;
		}
		return true;
	}

	async function handleSubmit() {
		if (!validateBeforeSubmit()) return;

		submitting = true;
		setLoading(true);
		const formData = new FormData();
		formData.append('tahunAjaranId', String(tahunAjaranId));
		formData.append('jamMasuk', jamMasukValue);
		formData.append('jamPulang', jamPulangValue);
		formData.append('hariSekolah', hariSekolahValue);
		formData.append(
			'hariSekolahCustom',
			hariSekolahValue === 'custom' ? JSON.stringify(customDays) : ''
		);
		formData.append('tipePresensi', tipePresensiValue);
		formData.append('jenisPresensi', jenisPresensiValue);
		formData.append('presensiGuruEnabled', presensiGuruEnabledValue ? '1' : '0');
		formData.append('liburNasional', JSON.stringify(liburDates));
		formData.append(
			'liburSemester',
			JSON.stringify(semesterRanges.filter((r) => r.start && r.end))
		);

		try {
			const response = await fetch('?/savePresensiSettings', {
				method: 'POST',
				body: formData,
				redirect: 'error'
			});

			if (!response.ok) {
				const err = await response
					.json()
					.catch(() => ({ fail: 'Gagal menyimpan pengaturan presensi' }));
				throw new Error(err.fail ?? `Error ${response.status}`);
			}

			hideModal();
			toast('Pengaturan presensi berhasil disimpan', 'success');
			await invalidate('app:akademik');
			await invalidate('app:presensi-guru-enabled');
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Gagal menyimpan pengaturan presensi';
			toast(message, 'error');
		} finally {
			submitting = false;
			setLoading(false);
		}
	}

	function handleCancel() {
		hideModal();
	}

	$effect(() => {
		onAction?.({ submit: handleSubmit, cancel: handleCancel });
	});

	// Auto-set tipePresensi when jenisPresensi changes
	$effect(() => {
		jenisPresensiValue;
		if (jenisPresensiValue === 'tiap_mapel') {
			if (!['awal_mapel', 'awal_akhir_mapel'].includes(tipePresensiValue)) {
				tipePresensiValue = 'awal_mapel';
			}
		} else if (['awal_mapel', 'awal_akhir_mapel'].includes(tipePresensiValue)) {
			tipePresensiValue = 'masuk_pulang';
		}
	});
</script>

<div class="not-prose flex flex-col gap-2">
	<div class="alert alert-info alert-soft flex-wrap items-center justify-between gap-2">
		<div>
			<span class="fieldset-legend text-sm font-semibold">Presensi Guru</span>
			<p class="text-base-content/70 text-sm">
				Aktifkan agar guru dapat melakukan presensi dan menu Presensi Guru tampil.
			</p>
		</div>
		<label class="flex cursor-pointer items-center gap-2">
			<input
				type="checkbox"
				class="toggle toggle-success"
				bind:checked={presensiGuruEnabledValue}
				disabled={submitting}
			/>
			<span class="text-sm font-semibold">
				{#if presensiGuruEnabledValue}
					<span class="text-success">Aktif</span>
				{:else}
					<span class="text-error">Nonaktif</span>
				{/if}
			</span>
		</label>
	</div>

	<div class="divider divider-middle text-sm font-semibold">Presensi Murid</div>

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<label class="fieldset flex flex-col gap-1">
			<span class="fieldset-legend text-sm font-semibold">Jam Masuk</span>
			<input
				type="text"
				class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
				bind:value={jamMasukValue}
				pattern="[0-9]{2}:[0-9]{2}"
				inputmode="numeric"
				placeholder="HH:mm"
			/>
		</label>
		<label class="fieldset flex flex-col gap-1">
			<span class="fieldset-legend text-sm font-semibold">Jam Pulang</span>
			<input
				type="text"
				class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
				bind:value={jamPulangValue}
				pattern="[0-9]{2}:[0-9]{2}"
				inputmode="numeric"
				placeholder="HH:mm"
			/>
		</label>
	</div>

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<label class="fieldset flex flex-col gap-1">
			<span class="fieldset-legend text-sm font-semibold">Hari Sekolah</span>
			<select
				class="select bg-base-200 dark:bg-base-300 w-full truncate dark:border-none"
				bind:value={hariSekolahValue}
			>
				<option value="5">5 Hari Sekolah (Senin - Jumat)</option>
				<option value="6">6 Hari Sekolah (Senin - Sabtu)</option>
				<option value="custom">Kustom (pilih hari belajar)</option>
			</select>
			{#if hariSekolahValue === 'custom'}
				<div class="flex flex-wrap gap-1.5 pt-1">
					{#each HARI_SEKOLAH_KEYS as key (key)}
						<button
							type="button"
							class="badge badge-soft cursor-pointer px-2.5 py-3 {customDays.includes(key)
								? 'badge-success'
								: ''}"
							onclick={() => toggleCustomDay(key)}
						>
							{customDayLabels[key]}
						</button>
					{/each}
				</div>
			{/if}
		</label>
		<label class="fieldset flex flex-col gap-1">
			<span class="fieldset-legend text-sm font-semibold">Jenis Presensi</span>
			<select
				class="select bg-base-200 dark:bg-base-300 w-full truncate dark:border-none"
				bind:value={jenisPresensiValue}
			>
				<option value="wali_kelas_saja">Wali kelas saja</option>
				<option value="tiap_mapel">Tiap mapel</option>
			</select>
		</label>
	</div>

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<div class="flex flex-col gap-2 sm:order-2">
			<label class="fieldset flex flex-col gap-1">
				<span class="fieldset-legend text-sm font-semibold">Tipe Presensi</span>
				<select
					class="select bg-base-200 dark:bg-base-300 w-full truncate dark:border-none"
					bind:value={tipePresensiValue}
				>
					<option value="masuk_pulang" disabled={jenisPresensiValue === 'tiap_mapel'}>
						Masuk Pulang
					</option>
					<option value="masuk_saja" disabled={jenisPresensiValue === 'tiap_mapel'}>
						Masuk Saja
					</option>
					<option value="awal_mapel" disabled={jenisPresensiValue !== 'tiap_mapel'}>
						Awal Mapel
					</option>
					<option value="awal_akhir_mapel" disabled={jenisPresensiValue !== 'tiap_mapel'}>
						Awal & Akhir Mapel
					</option>
				</select>
			</label>
		</div>

		<div class="flex flex-col gap-2 sm:order-1">
			<span class="fieldset-legend text-sm font-semibold">Tanggal Libur Nasional</span>
			<div class="join">
				<input
					type="date"
					class="input bg-base-200 dark:bg-base-300 join-item w-full dark:border-none"
					bind:value={newLiburDate}
					disabled={submitting}
				/>
				<button
					type="button"
					class="btn btn-soft join-item shadow-none"
					onclick={addLiburDate}
					disabled={submitting || !newLiburDate}
				>
					Tambah
				</button>
			</div>
		</div>
	</div>

	{#if liburDates.length > 0}
		<div class="flex flex-wrap gap-1.5 my-2">
			{#each liburDates as date, i (date)}
				<div class="badge badge-soft gap-1 px-2 py-3 text-sm badge-error">
					{date}
					<button
						type="button"
						class="btn btn-xs btn-ghost btn-circle hover:bg-error/20 p-0 shadow-none"
						onclick={() => removeLiburDate(i)}
						disabled={submitting}
						aria-label="Hapus {date}"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-3 w-3"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg
						>
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<div class="flex flex-col gap-2">
		<div class="flex items-center justify-between">
			<span class="fieldset-legend text-sm font-semibold">Libur Semester</span>
			<button
				type="button"
				class="btn btn-soft btn-sm shadow-none"
				onclick={addSemesterRange}
				disabled={submitting}
			>
				Tambah Rentang
			</button>
		</div>
		{#each semesterRanges as range, i (i)}
			<div class="flex flex-wrap items-center gap-2">
				<input
					type="date"
					class="input bg-base-200 dark:bg-base-300 w-44 dark:border-none"
					value={range.start}
					onchange={(e) =>
						updateSemesterRange(i, 'start', (e.currentTarget as HTMLInputElement).value)}
				/>
				<span class="text-sm">s.d.</span>
				<input
					type="date"
					class="input bg-base-200 dark:bg-base-300 w-44 dark:border-none"
					value={range.end}
					onchange={(e) =>
						updateSemesterRange(i, 'end', (e.currentTarget as HTMLInputElement).value)}
				/>
				<button
					type="button"
					class="btn btn-soft btn-sm btn-error shadow-none"
					onclick={() => removeSemesterRange(i)}
					disabled={submitting}
					aria-label="Hapus rentang tanggal"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg
					>
				</button>
			</div>
		{/each}
		{#if semesterRanges.length === 0}
			<p class="text-base-content/50 text-xs">Belum ada rentang libur semester.</p>
		{/if}
	</div>

	{#if validationError}
		<div class="alert alert-soft alert-warning flex items-center gap-2" role="alert">
			<Icon name="warning" class="h-4 w-4 shrink-0" />
			<span class="text-sm">{validationError}</span>
		</div>
	{/if}
</div>
