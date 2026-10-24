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
	import { jenisMapelLabel } from '$lib/jenis-mapel';

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
		namaLokal?: string | null;
		jenis?: MataPelajaran['jenis'];
		kkm?: number | null;
		kode?: string | null;
		kelas?: KelasLite | null;
	} & Record<string, unknown>;

	type FormData = {
		mode?: 'add' | 'edit';
		mapel?: FormMapel | null;
		kelasAktif?: KelasLite | null;
		dapodikMapelList?: Array<{ nama: string; kode: string | null }>;
		indukList?: Array<{ nama: string; pembelajaranId: string }>;
	} & Record<string, unknown>;

	let { data }: { data: FormData } = $props();
	const mode: 'add' | 'edit' = $derived(data?.mode === 'edit' ? 'edit' : 'add');
	const mapel = $derived(data?.mapel ?? null);
	const kelasAktif = $derived(data?.kelasAktif ?? mapel?.kelas ?? null);
	const kelasAktifLabel = $derived(
		kelasAktif
			? kelasAktif.fase
				? `${kelasAktif.nama} - ${kelasAktif.fase}`
				: kelasAktif.nama
			: 'Belum ada kelas aktif'
	);
	const isAgamaGroup = $derived(!!mapel?.nama && AGAMA_MAPEL_NAME_SET.has(mapel.nama));
	const isAgamaParent = $derived(!!mapel?.nama && mapel.nama === agamaParentName);
	const isPksGroup = $derived(!!mapel?.nama && PKS_MAPEL_NAME_SET.has(mapel.nama));
	const isPksParent = $derived(!!mapel?.nama && mapel.nama === pksParentName);
	const disableNama = $derived(!kelasAktif || (mode === 'edit' && (isAgamaGroup || isPksGroup)));
	const disableJenis = $derived(!kelasAktif || (mode === 'edit' && isAgamaGroup));
	const formAction = $derived(mode === 'edit' ? '?/update' : '?/add');
	const invalidateTargets = $derived(
		mode === 'edit'
			? ['app:mapel', 'app:mapel_tp-rl', 'app:asesmen-formatif']
			: ['app:mapel', 'app:asesmen-formatif']
	);
	const formInit = $derived(
		mode === 'edit' && mapel
			? {
					nama: mapel.nama,
					nama_lokal: mapel.namaLokal ?? '',
					kkm: mapel.kkm ?? '',
					jenis: mapel.jenis,
					kode: mapel.kode ?? ''
				}
			: undefined
	);
	function initialKode(): string {
		if (mode === 'edit' && isAgamaGroup) return 'PAPB';
		if (mode === 'edit' && isPksGroup) return 'PKS';
		return mapel?.kode ?? '';
	}
	let localKode = $state(initialKode());

	// Dapatkan jenjang varian dari sekolah (misalnya 'SMK')
	const jenjangVariant = $derived.by(() => {
		const sekolah = page.data.sekolah as { jenjangVariant?: string | null } | null | undefined;
		return sekolah?.jenjangVariant ?? null;
	});

	// Fungsi untuk mendapatkan label jenis mapel yang dinamis berdasarkan jenjang
	function getJenisMapelLabel(jenis: string): string {
		return jenisMapelLabel(jenis as MataPelajaran['jenis'], page.data.sekolah);
	}

	// Derive displayable jenis mapel options
	const displayJenisMapel = $derived.by(() => {
		const result: Record<string, string> = {};
		for (const key of Object.keys(jenisMapel)) {
			// "belum_dipetakan" hanya untuk hasil tarikan Dapodik — tidak bisa dipilih manual.
			if (key === 'belum_dipetakan') {
				continue;
			}
			// Sembunyikan opsi "kejuruan" jika bukan SMK
			if (key === 'kejuruan' && jenjangVariant?.toUpperCase() !== 'SMK') {
				continue;
			}
			// Sembunyikan opsi "pemberdayaan" jika bukan PKBM/SKB
			if (
				key === 'pemberdayaan' &&
				!['PKBM', 'SKB'].includes(jenjangVariant?.toUpperCase() ?? '')
			) {
				continue;
			}
			result[key] = getJenisMapelLabel(key);
		}
		return result;
	});

	function applyNamaRules(v: string) {
		if (AGAMA_MAPEL_NAME_SET.has(v)) {
			localKode = 'PAPB';
		} else if (PKS_MAPEL_NAME_SET.has(v)) {
			localKode = 'PKS';
		} else if (mode !== 'edit') {
			if (localKode === 'PAPB' || localKode === 'PKS') localKode = '';
		}
	}

	function onNamaInput(e: Event) {
		applyNamaRules(((e.target as HTMLInputElement)?.value ?? '').trim());
	}
	const heading = $derived(mode === 'edit' ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran');
	const namaPlaceholder = $derived(
		mode === 'edit' && isAgamaParent
			? 'Pendidikan Agama dan Budi Pekerti'
			: 'Contoh: Ilmu Pengetahuan Alam dan Sosial'
	);
	// Ada referensi Dapodik di DB (hasil Sinkronisasi) → mode tambah memakai select.
	const dapodikMapelOptions = $derived(data.dapodikMapelList ?? []);
	const pakaiSelectDapodik = $derived(dapodikMapelOptions.length > 0);
	// Kandidat pembelajaran induk (terdaftar di Dapodik) untuk Sub Pembelajaran.
	const indukList = $derived(data.indukList ?? []);
	// Combobox pencarian nama mapel (input + dropdown hasil filter).
	// Combobox pencarian nama mapel (input + dropdown hasil filter).
	// Mode edit diseed dengan nama mapel saat ini agar combobox konsisten
	// dengan mode tambah (keduanya memakai daftar Dapodik). Seed sekali saat
	// mount — modal di-{#key} per data sehingga aman.
	// svelte-ignore state_referenced_locally
	let namaQuery = $state(data?.mode === 'add' ? '' : (data?.mapel?.nama ?? ''));
	let daftarNamaTerbuka = $state(false);
	let indeksSorot = $state(-1);
	function normNamaMapel(nama: string): string {
		// Harus sinkron dengan normMapelName ($lib/server/dapodik).
		return nama
			.toLowerCase()
			.replace(/\(.*?\)/g, '')
			.replace(/\bkatholik\b/g, 'katolik')
			.replace(/\s+/g, ' ')
			.trim();
	}
	const indukTerdaftarSet = $derived(new Set(indukList.map((i) => normNamaMapel(i.nama))));
	// Nama efektif: hasil combobox (add & edit dengan data Dapodik), nama mapel
	// pada edit tanpa data Dapodik.
	const namaEfektif = $derived(
		pakaiSelectDapodik || mode === 'add' ? namaQuery.trim() : (mapel?.nama ?? '')
	);
	// Logika konsisten tambah & edit: nama tidak terdaftar sebagai pembelajaran
	// Dapodik → wajib pilih Mata Pelajaran Induk (Sub Pembelajaran).
	// Untuk varian agama pada mode edit, selalu tampilkan induk agar user bisa
	// mengatur sub-pembelajaran meskipun nama terdaftar di Dapodik.
	const tampilkanInduk = $derived(
		indukList.length > 0 &&
			namaEfektif !== '' &&
			(mode === 'edit' && isAgamaGroup ? true : !indukTerdaftarSet.has(normNamaMapel(namaEfektif)))
	);
	const MAX_OPSI_TAMPIL = 80;
	// Semua varian mapel agama (termasuk Kepercayaan) sudah dibuat otomatis oleh
	// ensureAgamaMapelForClasses — larang tambah manual via select Dapodik.
	// Cakup nama resmi ber-"Budi Pekerti" maupun versi Dapodik tanpa "Budi Pekerti"
	// (mis. "Pendidikan Agama", "Pendidikan Agama Kristen").
	const RE_MAPEL_AGAMA = /^pendidikan (agama|kepercayaan)/i;
	const agamaDapodikBlocked = $derived(
		pakaiSelectDapodik && mode === 'add' && RE_MAPEL_AGAMA.test(namaQuery.trim())
	);
	// PAPB & varian agama wajib sama dengan Dapodik → input "Nama Mata Pelajaran Lokal"
	// disembunyikan; input itu sendiri juga hanya tampil bila DB punya data Dapodik.
	const tampilNamaLokal = $derived(
		!AGAMA_MAPEL_NAME_SET.has(namaEfektif) &&
			!RE_MAPEL_AGAMA.test(namaEfektif) &&
			(dapodikMapelOptions.length > 0 || !!mapel?.namaLokal)
	);
	const namaTersaring = $derived.by(() => {
		const q = namaQuery.trim().toLowerCase();
		if (!q) return dapodikMapelOptions;
		return dapodikMapelOptions.filter((o) => o.nama.toLowerCase().includes(q));
	});
	function pilihNama(nama: string) {
		namaQuery = nama;
		daftarNamaTerbuka = false;
		indeksSorot = -1;
		applyNamaRules(nama);
	}
	function sorotGeser(delta: number) {
		const total = Math.min(namaTersaring.length, MAX_OPSI_TAMPIL);
		if (total === 0) return;
		indeksSorot = (indeksSorot + delta + total) % total;
		document.getElementById(`nama-opsi-${indeksSorot}`)?.scrollIntoView({ block: 'nearest' });
	}
	function onNamaKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			daftarNamaTerbuka = false;
			return;
		}
		if (!daftarNamaTerbuka || namaTersaring.length === 0) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			sorotGeser(1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			sorotGeser(-1);
		} else if (e.key === 'Enter' && indeksSorot >= 0) {
			e.preventDefault();
			pilihNama(namaTersaring[Math.min(indeksSorot, namaTersaring.length - 1)].nama);
		}
	}
</script>

<FormEnhance
	action={formAction}
	class="flex min-h-0 flex-1 flex-col"
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
		<h3 class="mb-3 text-lg font-bold">{heading}</h3>
		<div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-1">
			{#if !kelasAktif}
				<div
					class="alert bg-warning/10 border-warning text-warning-content flex items-center gap-2 border border-dashed"
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
			<p class="text-base-content/70 text-sm">Kelas aktif: {kelasAktifLabel}</p>
			<fieldset class="fieldset">
				<legend class="fieldset-legend">Nama Mata Pelajaran</legend>
				{#if pakaiSelectDapodik}
					<div class="relative">
						<input
							type="text"
							class="input validator bg-base-200 w-full dark:border-none"
							placeholder="Pilih Mata Pelajaran"
							name="nama"
							required={!disableNama}
							disabled={disableNama}
							autocomplete="off"
							role="combobox"
							aria-expanded={daftarNamaTerbuka}
							aria-controls="daftar-nama-mapel"
							aria-activedescendant={daftarNamaTerbuka && indeksSorot >= 0
								? `nama-opsi-${indeksSorot}`
								: undefined}
							bind:value={namaQuery}
							onfocus={() => {
								daftarNamaTerbuka = true;
								indeksSorot = 0;
							}}
							oninput={() => {
								daftarNamaTerbuka = true;
								indeksSorot = 0;
								applyNamaRules(namaQuery.trim());
							}}
							onblur={() => (daftarNamaTerbuka = false)}
							onkeydown={onNamaKeydown}
						/>
						{#if daftarNamaTerbuka && namaTersaring.length > 0}
							<ul
								id="daftar-nama-mapel"
								role="listbox"
								class="bg-base-200 absolute z-50 mt-1 max-h-60 w-full list-none overflow-y-auto rounded-box p-1 shadow-lg"
							>
								{#each namaTersaring.slice(0, MAX_OPSI_TAMPIL) as opsi, i (`${opsi.kode ?? ''}|${opsi.nama}`)}
									<li id={`nama-opsi-${i}`} role="option" aria-selected={i === indeksSorot}>
										<button
											type="button"
											class="w-full truncate rounded px-2 py-1.5 text-left text-sm transition-colors duration-200 hover:bg-base-content/10 {i ===
											indeksSorot
												? 'bg-base-content/10'
												: ''}"
											onmousedown={(e) => e.preventDefault()}
											onclick={() => pilihNama(opsi.nama)}
										>
											{#if opsi.kode}
												<span class="mr-1.5 font-mono text-xs opacity-60">{opsi.kode}</span>
											{/if}
											{opsi.nama}
										</button>
									</li>
								{/each}
								{#if namaTersaring.length > MAX_OPSI_TAMPIL}
									<li class="px-2 py-1 text-sm opacity-60">
										{namaTersaring.length - MAX_OPSI_TAMPIL} lainnya. Ketik untuk mempersempit.
									</li>
								{/if}
							</ul>
						{/if}
					</div>
				{:else}
					<input
						type="text"
						class="input validator bg-base-200 w-full dark:border-none"
						placeholder={namaPlaceholder}
						name="nama"
						required={!disableNama}
						disabled={disableNama}
						value={mapel?.nama ?? ''}
						oninput={onNamaInput}
					/>
				{/if}
				<p class="label text-wrap">
					{#if pakaiSelectDapodik}
						Ketik untuk mencari, lalu pilih dari daftar. Nama mata pelajaran jangan disingkat!
					{:else}
						Nama mata pelajaran jangan disingkat!
					{/if}
				</p>
				{#if agamaDapodikBlocked}
					<div class="alert alert-soft alert-warning mt-2 flex items-center gap-2" role="alert">
						<Icon name="alert" />
						<span
							>Tidak dapat menambahkan mapel agama karena termasuk ke dalam PAPB dan sub mapel yang
							sudah ada secara otomatis di tabel</span
						>
					</div>
				{/if}
			</fieldset>
			{#if tampilNamaLokal}
				<fieldset class="fieldset">
					<legend class="fieldset-legend">Nama Mata Pelajaran Lokal</legend>
					<input
						type="text"
						class="input validator bg-base-200 w-full dark:border-none"
						placeholder="Kosongkan bila sama dengan Dapodik"
						name="nama_lokal"
						maxlength="100"
						disabled={!kelasAktif}
					/>
					<p class="label text-wrap">
						Nama lokal mata pelajaran di Dapodik (opsional). Kosongkan bila sama dengan Nama Mata
						Pelajaran.
					</p>
				</fieldset>
			{/if}
			{#if tampilkanInduk}
				<fieldset class="fieldset">
					<legend class="fieldset-legend">Mata Pelajaran Induk</legend>
					<select
						name="induk_pembelajaran_id"
						required={!isAgamaGroup && !isPksGroup}
						class="select bg-base-200 w-full truncate dark:border-none"
					>
						<option disabled selected={mode === 'add' || !mapel?.dapodikIndukPembelajaranId}>
							Pilih Pembelajaran Induk (terdaftar di Dapodik)
						</option>
						{#each indukList as induk (induk.pembelajaranId)}
							<option
								value={induk.pembelajaranId}
								selected={mode === 'edit' &&
									mapel?.dapodikIndukPembelajaranId === induk.pembelajaranId}
							>
								{induk.nama}
							</option>
						{/each}
					</select>
					<p class="label text-wrap">
						{#if mode === 'edit' && isAgamaGroup}
							Jika salah satu varian agama sudah terdaftar di Dapodik, ia akan menjadi mapel induk.
							Varian tanpa padanan Dapodik akan dikirim sebagai Sub Pembelajaran. Pilihan berlaku
							untuk semua varian agama di kelas ini.
						{:else}
							"{namaEfektif}" belum terdaftar sebagai pembelajaran Dapodik, akan dikirim sebagai Sub
							Pembelajaran dari mata pelajaran induk yang dipilih.
						{/if}
					</p>
				</fieldset>
			{/if}
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
					<legend class="fieldset-legend">Singkatan/kode</legend>
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
			</div>
			<fieldset class="fieldset">
				<legend class="fieldset-legend">Jenis Mata Pelajaran</legend>
				<select
					class="select bg-base-200 w-full truncate dark:border-none"
					name="jenis"
					required={!disableJenis}
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
		</div>
		<div class="modal-action">
			<button type="button" class="btn btn-soft shadow-none mr-auto" onclick={() => history.back()}>
				<Icon name="close-sm" />
				Batal
			</button>
			<button
				type="submit"
				class="btn btn-primary shadow-none"
				disabled={submitting ||
					(invalid && !isAgamaParent && !isPksParent) ||
					!kelasAktif ||
					agamaDapodikBlocked}
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
