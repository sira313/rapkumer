<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { hideModal, setLoading } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import Icon from '$lib/components/icon.svelte';

	interface SemesterRange {
		start: string;
		end: string;
	}

	interface Props {
		tahunAjaranId: number | string;
		jamMasuk?: string;
		jamPulang?: string;
		hariSekolah?: number;
		tipePresensi?: string;
		jenisPresensi?: string;
		liburNasional?: string;
		liburSemester?: string;
		onAction?: (actions: { submit: () => Promise<void>; cancel: () => void }) => void;
	}

	let {
		tahunAjaranId,
		jamMasuk = '07:30',
		jamPulang = '15:00',
		hariSekolah = 6,
		tipePresensi = 'masuk_pulang',
		jenisPresensi = 'wali_kelas_saja',
		liburNasional = '[]',
		liburSemester = '[]',
		onAction
	}: Props = $props();

	let submitting = $state(false);
	let jamMasukValue = $state(jamMasuk);
	let jamPulangValue = $state(jamPulang);
	let hariSekolahValue = $state(String(hariSekolah));
	let tipePresensiValue = $state(tipePresensi);
	let jenisPresensiValue = $state(jenisPresensi);

	let liburDates = $state<string[]>([]);
	try {
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
		if (jamMasukValue >= jamPulangValue) return 'Jam masuk harus lebih awal dari jam pulang';
		if (!['5', '6'].includes(hariSekolahValue)) return 'Pilih hari sekolah';
		if (
			!['masuk_pulang', 'masuk_saja', 'awal_mapel', 'awal_akhir_mapel'].includes(tipePresensiValue)
		)
			return 'Pilih tipe presensi';
		if (
			['awal_mapel', 'awal_akhir_mapel'].includes(tipePresensiValue) &&
			jenisPresensiValue !== 'tiap_mapel'
		)
			return 'Tipe presensi Awal/Awal & Akhir Mapel hanya tersedia untuk jenis presensi Tiap Mapel';
		if (!['wali_kelas_saja', 'tiap_mapel'].includes(jenisPresensiValue))
			return 'Pilih jenis presensi';
		return null;
	});

	function validateBeforeSubmit() {
		if (!jamMasukValue || !jamPulangValue) {
			toast('Jam masuk dan jam pulang harus diisi', 'warning');
			return false;
		}
		if (jamMasukValue >= jamPulangValue) {
			toast('Jam masuk harus lebih awal dari jam pulang', 'warning');
			return false;
		}
		if (!['5', '6'].includes(hariSekolahValue)) {
			toast('Pilih hari sekolah', 'warning');
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
		formData.append('tipePresensi', tipePresensiValue);
		formData.append('jenisPresensi', jenisPresensiValue);
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

<div class="not-prose flex flex-col gap-6">
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<label class="fieldset flex flex-col gap-1">
			<span class="fieldset-legend text-sm font-semibold">Jam Masuk</span>
			<input
				type="time"
				class="time-input-bypass input bg-base-200 dark:bg-base-300 w-full dark:border-none"
				bind:value={jamMasukValue}
			/>
		</label>
		<label class="fieldset flex flex-col gap-1">
			<span class="fieldset-legend text-sm font-semibold">Jam Pulang</span>
			<input
				type="time"
				class="time-input-bypass input bg-base-200 dark:bg-base-300 w-full dark:border-none"
				bind:value={jamPulangValue}
			/>
		</label>
	</div>

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<label class="fieldset flex flex-col gap-1 overflow-hidden">
			<span class="fieldset-legend text-sm font-semibold">Hari Sekolah</span>
			<select
				class="select bg-base-200 dark:bg-base-300 w-full truncate dark:border-none"
				bind:value={hariSekolahValue}
			>
				<option value="5">5 Hari Sekolah (Senin - Jumat)</option>
				<option value="6">6 Hari Sekolah (Senin - Sabtu)</option>
			</select>
		</label>
		<label class="fieldset flex flex-col gap-1 overflow-hidden">
			<span class="fieldset-legend text-sm font-semibold">Tipe Presensi</span>
			<select
				class="select bg-base-200 dark:bg-base-300 w-full truncate dark:border-none"
				bind:value={tipePresensiValue}
			>
				<option value="masuk_pulang">Masuk Pulang</option>
				<option value="masuk_saja">Masuk Saja</option>
				<option value="awal_mapel" disabled={jenisPresensiValue !== 'tiap_mapel'}>
					Awal Mapel
				</option>
				<option value="awal_akhir_mapel" disabled={jenisPresensiValue !== 'tiap_mapel'}>
					Awal & Akhir Mapel
				</option>
			</select>
		</label>
	</div>

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<div class="flex flex-col gap-2">
			<span class="fieldset-legend text-sm font-semibold">Tanggal Libur Nasional</span>
			<div class="flex items-center gap-2">
				<input
					type="date"
					class="input bg-base-200 dark:bg-base-300 w-44 dark:border-none"
					bind:value={newLiburDate}
					disabled={submitting}
				/>
				<button
					type="button"
					class="btn btn-soft btn-sm shadow-none"
					onclick={addLiburDate}
					disabled={submitting || !newLiburDate}
				>
					Tambah
				</button>
			</div>
			{#if liburDates.length > 0}
				<div class="flex flex-wrap gap-1.5">
					{#each liburDates as date, i (date)}
						<div class="badge badge-outline gap-1 px-2 py-3 text-sm">
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
		</div>
		<label class="fieldset flex flex-col gap-1 overflow-hidden">
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
			<div class="flex items-center gap-2">
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

<style>
	:global(.time-input-bypass::-webkit-calendar-picker-indicator) {
		display: none;
	}
</style>
