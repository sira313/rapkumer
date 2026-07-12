<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- small goto call used for form navigation */
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import {
		agamaMapelNames,
		agamaParentName,
		pksMapelNames,
		pksParentName,
		jenisMapel
	} from '$lib/statics';

	const AGAMA_MAPEL_NAME_SET = new Set<string>(agamaMapelNames);
	const PKS_MAPEL_NAME_SET = new Set<string>(pksMapelNames);

	type KelasLite = {
		id?: number;
		nama?: string;
		fase?: string | null;
	};

	type FormMapel = {
		id?: number;
		nama?: string;
		jenis?: MataPelajaran['jenis'];
		kkm?: number | null;
		kode?: string | null;
		kelas?: KelasLite | null;
	} & Record<string, unknown>;

	type FormData = {
		mode?: 'add' | 'edit';
		mapel?: FormMapel | null;
		kelasAktif?: KelasLite | null;
	} & Record<string, unknown>;

	let { data }: { data: FormData } = $props();
	const mode: 'add' | 'edit' = data?.mode === 'edit' ? 'edit' : 'add';
	const mapel = data?.mapel ?? null;
	const kelasAktif = data?.kelasAktif ?? mapel?.kelas ?? null;
	const kelasAktifLabel = kelasAktif
		? kelasAktif.fase
			? `${kelasAktif.nama} - ${kelasAktif.fase}`
			: kelasAktif.nama
		: 'Belum ada kelas aktif';
	const isAgamaGroup = !!mapel?.nama && AGAMA_MAPEL_NAME_SET.has(mapel.nama);
	const isAgamaParent = !!mapel?.nama && mapel.nama === agamaParentName;
	const isPksGroup = !!mapel?.nama && PKS_MAPEL_NAME_SET.has(mapel.nama);
	const isPksParent = !!mapel?.nama && mapel.nama === pksParentName;
	const disableNama = !kelasAktif || (mode === 'edit' && (isAgamaGroup || isPksGroup));
	const disableJenis = !kelasAktif || (mode === 'edit' && isAgamaGroup);
	const formAction = mode === 'edit' ? '?/update' : '?/add';
	const invalidateTargets =
		mode === 'edit'
			? ['app:mapel', 'app:mapel_tp-rl', 'app:asesmen-formatif']
			: ['app:mapel', 'app:asesmen-formatif'];
	const formInit =
		mode === 'edit' && mapel
			? {
					nama: mapel.nama,
					kkm: mapel.kkm ?? '',
					jenis: mapel.jenis,
					kode: mapel.kode ?? ''
				}
			: undefined;
	let localKode = $state(mapel?.kode ?? '');
	if (mode === 'edit' && isAgamaGroup) {
		localKode = 'PAPB';
	}
	if (mode === 'edit' && isPksGroup) {
		localKode = 'PKS';
	}

	// Dapatkan jenjang varian dari sekolah (misalnya 'SMK')
	const jenjangVariant = $derived.by(() => {
		const sekolah = page.data.sekolah as { jenjangVariant?: string | null } | null | undefined;
		return sekolah?.jenjangVariant ?? null;
	});

	// Fungsi untuk mendapatkan label jenis mapel yang dinamis berdasarkan jenjang
	function getJenisMapelLabel(jenis: string): string {
		if (jenis === 'wajib' && jenjangVariant?.toUpperCase() === 'SMK') {
			return 'Mata Pelajaran Umum';
		}
		return jenisMapel[jenis as MataPelajaran['jenis']] ?? jenis;
	}

	// Derive displayable jenis mapel options
	const displayJenisMapel = $derived.by(() => {
		const result: Record<string, string> = {};
		for (const key of Object.keys(jenisMapel)) {
			// Sembunyikan opsi "kejuruan" jika bukan SMK
			if (key === 'kejuruan' && jenjangVariant?.toUpperCase() !== 'SMK') {
				continue;
			}
			// Sembunyikan opsi "pemberdayaan" jika bukan PKBM
			if (key === 'pemberdayaan' && jenjangVariant?.toUpperCase() !== 'PKBM') {
				continue;
			}
			result[key] = getJenisMapelLabel(key);
		}
		return result;
	});

	function onNamaInput(e: Event) {
		const v = ((e.target as HTMLInputElement)?.value ?? '').trim();
		if (AGAMA_MAPEL_NAME_SET.has(v)) {
			localKode = 'PAPB';
		} else if (PKS_MAPEL_NAME_SET.has(v)) {
			localKode = 'PKS';
		} else if (mode !== 'edit') {
			if (localKode === 'PAPB' || localKode === 'PKS') localKode = '';
		}
	}
	const heading = mode === 'edit' ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran';
	const namaPlaceholder =
		mode === 'edit' && isAgamaParent
			? 'Pendidikan Agama dan Budi Pekerti'
			: 'Contoh: Ilmu Pengetahuan Alam dan Sosial';
</script>

<FormEnhance
	action={formAction}
	init={formInit}
	onsuccess={async () => {
		await Promise.all(invalidateTargets.map((token) => invalidate(token)));
		if (typeof window !== 'undefined' && window.history?.state?.modal) {
			history.back();
		} else {
			await goto('/intrakurikuler', { replaceState: true });
		}
	}}
>
	{#snippet children({ submitting, invalid })}
		<p class="mb-2 text-xl font-bold">{heading}</p>
		{#if !kelasAktif}
			<div
				class="alert bg-warning/10 border-warning text-warning-content mb-4 flex items-center gap-2 border border-dashed"
			>
				<Icon name="info" />
				<span
					>Pilih kelas di navbar sebelum {mode === 'edit' ? 'mengubah' : 'menambah'} mata pelajaran.</span
				>
			</div>
		{/if}
		{#if mode === 'edit'}
			<input name="id" value={mapel?.id ?? ''} hidden />
		{/if}
		{#if mode === 'edit' && disableNama}
			<input name="nama" value={mapel?.nama ?? ''} hidden />
		{/if}
		{#if mode === 'edit' && disableJenis}
			<input name="jenis" value={mapel?.jenis ?? ''} hidden />
		{/if}
		<p class="text-base-content/70 mb-4 text-sm">Kelas aktif: {kelasAktifLabel}</p>
		<fieldset class="fieldset">
			<legend class="fieldset-legend">Nama Mata Pelajaran</legend>
			<input
				type="text"
				class="input validator bg-base-200 w-full dark:border-none"
				placeholder={namaPlaceholder}
				name="nama"
				required
				disabled={disableNama}
				value={mapel?.nama ?? ''}
				oninput={onNamaInput}
			/>
			<p class="label text-wrap">Nama mata pelajaran jangan disingkat!</p>
		</fieldset>
		<fieldset class="fieldset">
			<legend class="fieldset-legend">KKM</legend>
			<input
				type="number"
				class="input validator bg-base-200 w-full dark:border-none"
				placeholder="Contoh: 76"
				name="kkm"
				required
				disabled={!kelasAktif}
				min="0"
			/>
		</fieldset>
		<fieldset class="fieldset">
			<legend class="fieldset-legend">Kode</legend>
			<input
				type="text"
				class="input validator bg-base-200 w-full dark:border-none"
				placeholder="Contoh: PAPB"
				name="kode"
				bind:value={localKode}
				disabled={isAgamaGroup || isPksGroup ? true : !kelasAktif}
			/>
			<p class="label text-wrap">Singkatan/kode singkat untuk mata pelajaran (opsional).</p>
		</fieldset>
		<fieldset class="fieldset">
			<legend class="fieldset-legend">Jenis Mata Pelajaran</legend>
			<select
				class="select bg-base-200 w-full truncate dark:border-none"
				name="jenis"
				required
				disabled={disableJenis}
			>
				<option disabled selected>Pilih Jenis Mata Pelajaran</option>
				{#each Object.entries(displayJenisMapel) as [value, label] (value)}
					<option {value}>{label}</option>
				{/each}
			</select>
		</fieldset>
		{#if mode === 'edit' && isAgamaParent}
			<p class="text-base-content/70 mt-2 text-sm">
				Perubahan KKM akan diterapkan ke semua varian mata pelajaran Pendidikan Agama dan Budi
				Pekerti.
			</p>
		{/if}
		{#if mode === 'edit' && isPksParent}
			<p class="text-base-content/70 mt-2 text-sm">
				Perubahan KKM dan jenis akan diterapkan ke semua varian mata pelajaran Pendalaman Kitab
				Suci.
			</p>
		{/if}
		<div class="mt-6 flex justify-between gap-2">
			<button type="button" class="btn btn-soft shadow-none" onclick={() => history.back()}>
				<Icon name="close-sm" />
				Batal
			</button>
			<button
				type="submit"
				class="btn btn-primary shadow-none"
				disabled={submitting || invalid || !kelasAktif}
			>
				{#if submitting}
					<div class="loading loading-spinner"></div>
				{:else}
					<Icon name="save" />
				{/if}
				Simpan
			</button>
		</div>
	{/snippet}
</FormEnhance>
