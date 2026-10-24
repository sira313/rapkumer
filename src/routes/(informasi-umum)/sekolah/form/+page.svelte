<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- small page-level navigation helper calls */
	import { goto, invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import ImportDatabaseModal from '$lib/components/modals/import-database-modal.svelte';
	import SekolahModals from '$lib/components/sekolah/modals.svelte';
	import { jenjangPendidikanSederajat, nauganOptions } from '$lib/statics';
	import { modalRoute } from '$lib/utils';

	let { data } = $props();
	// svelte-ignore state_referenced_locally
	const isNew = data.isNew as boolean;
	// svelte-ignore state_referenced_locally
	const initialSekolah = (isNew ? undefined : data.sekolah) as Sekolah | undefined;

	// Combobox "Nama Kepala Sekolah" — aktif hanya bila data pendidik & tenaga
	// pendidik sudah ada di DB (hasil Sinkron Dapodik), logika sama dengan
	// "Nama Mata Pelajaran" pada Tambah Mata Pelajaran.
	type PegawaiOpsi = { id: number; nama: string; nip: string | null };
	const pegawaiOptions = $derived((data.pegawaiList ?? []) as PegawaiOpsi[]);
	const pakaiSelectPegawai = $derived(pegawaiOptions.length > 0);
	// Data Dapodik tersedia (mode edit) → kepala sekolah hanya bisa DIPILIH dari
	// daftar, tidak bisa diketik/direname; ubah nama/NIP via /pengaturan/profil.
	const kunciKepalaSekolah = $derived(Boolean(data.dapodikAktif) && Boolean(initialSekolah?.id));
	let kepalaQuery = $state(initialSekolah?.kepalaSekolah?.nama ?? '');
	let kepalaNip = $state(initialSekolah?.kepalaSekolah?.nip ?? '');
	let kepalaTerpilihId = $state<number | null>(initialSekolah?.kepalaSekolah?.id ?? null);
	let daftarKepalaTerbuka = $state(false);
	let indeksSorotKepala = $state(-1);
	const MAX_OPSI_TAMPIL = 80;
	const kepalaTersaring = $derived.by(() => {
		const q = kepalaQuery.trim().toLowerCase();
		if (!q) return pegawaiOptions;
		return pegawaiOptions.filter(
			(o) => o.nama.toLowerCase().includes(q) || (o.nip ?? '').includes(q)
		);
	});
	function pilihKepala(opsi: PegawaiOpsi) {
		kepalaQuery = opsi.nama;
		kepalaNip = opsi.nip ?? '';
		kepalaTerpilihId = opsi.id;
		daftarKepalaTerbuka = false;
		indeksSorotKepala = -1;
	}
	// Mode terkunci: teks terisi tapi belum memilih orang → blokir simpan.
	const kepalaBelumDipilih = $derived(
		kunciKepalaSekolah && kepalaQuery.trim() !== '' && kepalaTerpilihId === null
	);
	function sorotKepalaGeser(delta: number) {
		const total = Math.min(kepalaTersaring.length, MAX_OPSI_TAMPIL);
		if (total === 0) return;
		indeksSorotKepala = (indeksSorotKepala + delta + total) % total;
		document
			.getElementById(`kepala-opsi-${indeksSorotKepala}`)
			?.scrollIntoView({ block: 'nearest' });
	}
	function onKepalaKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			daftarKepalaTerbuka = false;
			return;
		}
		if (!daftarKepalaTerbuka || kepalaTersaring.length === 0) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			sorotKepalaGeser(1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			sorotKepalaGeser(-1);
		} else if (e.key === 'Enter' && indeksSorotKepala >= 0) {
			e.preventDefault();
			pilihKepala(kepalaTersaring[Math.min(indeksSorotKepala, kepalaTersaring.length - 1)]);
		}
	}

	// typed keys for jenjangPendidikanSederajat to avoid implicit `string` indexing errors
	const jenjangKeys = Object.keys(jenjangPendidikanSederajat) as Array<
		keyof typeof jenjangPendidikanSederajat
	>;

	// Group jenjang for UI (put SLB/PKBM/SRT under 'Sekolah Satu Atap')
	const groupedJenjang = (() => {
		const map = new Map<
			string,
			Array<{
				jenjKey: keyof typeof jenjangPendidikanSederajat;
				variant: { key: string; label: string };
			}>
		>();
		const ssaKeys = new Set(['slb', 'pkbm', 'srt']);
		for (const k of jenjangKeys) {
			const label = jenjangPendidikanSederajat[k][0].label;
			const groupLabel = ssaKeys.has(String(k)) ? 'Sekolah Satu Atap' : label;
			if (!map.has(groupLabel)) map.set(groupLabel, []);
			for (const v of jenjangPendidikanSederajat[k]) {
				map.get(groupLabel)?.push({ jenjKey: k, variant: v });
			}
		}
		return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
	})();

	// When editing, the form enhancer populates the select by jenjangPendidikan (base key).
	// Because options reuse the same value for multiple variants, the browser will select
	// the first matching option for that value (usually the base label). To show the
	// stored variant label (e.g., "Madrasah Ibtidaiyah (MI)") we programmatically
	// select the option whose data-variant matches initialSekolah.jenjangVariant.
	function handleImportDb() {
		showModal({
			title: 'Import Database',
			body: ImportDatabaseModal,
			dismissible: true
		});
	}

	onMount(() => {
		if (!initialSekolah?.jenjangVariant) return;
		// run after microtask to let any form population actions finish
		setTimeout(() => {
			const sel = document.querySelector<HTMLSelectElement>('select[name="jenjangPendidikan"]');
			if (!sel) return;
			const opt = Array.from(sel.options).find(
				(o) => o.dataset?.variant === initialSekolah.jenjangVariant
			);
			if (opt) {
				opt.selected = true;
				// ensure hidden input is in sync
				const hidden = sel.form?.elements.namedItem('jenjangVariant') as HTMLInputElement | null;
				if (hidden) hidden.value = String(initialSekolah.jenjangVariant ?? '');
			}
		}, 0);
	});
</script>

{#if data.isInit}
	<div role="alert" class="alert alert-success alert-soft mx-auto mb-4 max-w-4xl">
		<!-- TODO: sesuaikan pesan saat pertama kali setup -->
		<Icon name="info" />
		<span>Selamat datang! Pertama-tama, isi formulir sekolah terlebih dahulu!</span>
	</div>
{/if}

<FormEnhance
	action="?/save"
	init={initialSekolah}
	enctype="multipart/form-data"
	onsuccess={async () => {
		await invalidate('app:sekolah');
		await goto('/sekolah');
	}}
>
	{#snippet children({ submitting })}
		{#if initialSekolah?.id}
			<input name="id" value={initialSekolah.id} hidden />
		{/if}

		<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
			<div class="mb-4 flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
				<h2 class="text-xl font-bold">
					{#if isNew}
						Tambah Sekolah Baru
					{:else}
						Formulir Isian Identitas Sekolah
					{/if}
				</h2>
				<a
					class="btn btn-soft shadow-none w-full sm:w-auto"
					href="/sekolah/form/sync-dapodik"
					use:modalRoute={'sync-dapodik'}
				>
					<Icon name="dapodik" />
					Sync Dapodik
				</a>
			</div>

			<div class="grid grid-cols-1 items-center gap-2 md:grid-cols-2">
				<!-- Jenjang Pendidikan & Lokasi Tanda Tangan -->
				<div class="grid grid-cols-1 gap-2 md:col-span-2 md:grid-cols-2 md:items-end">
					<div class="fieldset">
						<legend class="fieldset-legend">Jenjang Pendidikan</legend>
						<select
							class="select bg-base-200 dark:bg-base-300 validator w-full truncate dark:border-none"
							name="jenjangPendidikan"
							required
							onchange={(e) => {
								// set hidden input jenjangVariant from the selected option's data-variant
								const sel = e.currentTarget as HTMLSelectElement;
								const option = sel.selectedOptions?.[0];
								const variant = option?.dataset?.variant ?? '';
								const hidden = sel.form?.elements.namedItem(
									'jenjangVariant'
								) as HTMLInputElement | null;
								if (hidden) hidden.value = variant;
							}}
						>
							<option value="" disabled selected>Pilih Jenjang Pendidikan</option>
							{#each groupedJenjang as group (group.label)}
								<optgroup label={group.label}>
									{#each group.items as item (item.variant.key)}
										<option
											value={item.jenjKey}
											data-variant={item.variant.key}
											selected={initialSekolah
												? initialSekolah.jenjangVariant === item.variant.key
												: undefined}
										>
											{item.variant.label}
										</option>
									{/each}
								</optgroup>
							{/each}
						</select>
						<input hidden name="jenjangVariant" value={initialSekolah?.jenjangVariant ?? ''} />
					</div>
					<div class="fieldset">
						<legend class="fieldset-legend">Lokasi Tanda Tangan</legend>
						<input
							required
							type="text"
							class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
							placeholder="Contoh: Periji"
							name="lokasiTandaTangan"
						/>
					</div>
				</div>

				<div class="fieldset">
					<!-- Nama Sekolah -->
					<legend class="fieldset-legend">Nama Sekolah</legend>
					<input
						required
						type="text"
						class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
						placeholder="Contoh: SD Negeri 19 Periji"
						name="nama"
					/>
				</div>

				<div class="fieldset">
					<!-- NPSN -->
					<legend class="fieldset-legend">NPSN</legend>
					<input
						required
						type="text"
						class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
						placeholder="Contoh: 69856875"
						name="npsn"
					/>
				</div>

				<div class="fieldset">
					<!-- Nama Kepala Sekolah -->
					<legend class="fieldset-legend">Nama Kepala Sekolah</legend>
					{#if pakaiSelectPegawai}
						<div class="relative">
							<input
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Pilih Kepala Sekolah"
								name="kepalaSekolah.nama"
								required
								autocomplete="off"
								role="combobox"
								aria-expanded={daftarKepalaTerbuka}
								aria-controls="daftar-nama-kepala"
								aria-activedescendant={daftarKepalaTerbuka && indeksSorotKepala >= 0
									? `kepala-opsi-${indeksSorotKepala}`
									: undefined}
								bind:value={kepalaQuery}
								onfocus={() => {
									daftarKepalaTerbuka = true;
									indeksSorotKepala = 0;
								}}
								oninput={() => {
									daftarKepalaTerbuka = true;
									indeksSorotKepala = 0;
									kepalaTerpilihId = null;
								}}
								onblur={() => (daftarKepalaTerbuka = false)}
								onkeydown={onKepalaKeydown}
							/>
							{#if daftarKepalaTerbuka && kepalaTersaring.length > 0}
								<ul
									id="daftar-nama-kepala"
									role="listbox"
									class="bg-base-200 absolute z-50 mt-1 max-h-60 w-full list-none overflow-y-auto rounded-box p-1 shadow-lg"
								>
									{#each kepalaTersaring.slice(0, MAX_OPSI_TAMPIL) as opsi, i (`${opsi.id}|${opsi.nama}`)}
										<li
											id={`kepala-opsi-${i}`}
											role="option"
											aria-selected={i === indeksSorotKepala}
										>
											<button
												type="button"
												class="w-full truncate rounded px-2 py-1.5 text-left text-sm transition-colors duration-200 hover:bg-base-content/10 {i ===
												indeksSorotKepala
													? 'bg-base-content/10'
													: ''}"
												onmousedown={(e) => e.preventDefault()}
												onclick={() => pilihKepala(opsi)}
											>
												{#if opsi.nip}
													<span class="mr-1.5 font-mono text-xs opacity-60">{opsi.nip}</span>
												{/if}
												{opsi.nama}
											</button>
										</li>
									{/each}
									{#if kepalaTersaring.length > MAX_OPSI_TAMPIL}
										<li class="px-2 py-1 text-sm opacity-60">
											{kepalaTersaring.length - MAX_OPSI_TAMPIL} lainnya — ketik untuk mempersempit.
										</li>
									{/if}
								</ul>
							{/if}
						</div>
					{:else}
						<input
							required
							type="text"
							class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
							placeholder="Contoh: Bruce Wayne, Bat"
							name="kepalaSekolah.nama"
						/>
					{/if}
					<span>
						{#if kunciKepalaSekolah}
							Otomatis dari Dapodik. Menambahkan gelar dilakukan melalui menu Pengaturan - Edit
							profil.
						{:else}
							Masukkan nama Kepala Sekolah lengkap dengan gelar.
						{/if}
					</span>
				</div>

				<div class="fieldset">
					<!-- NIP Kepala Sekolah -->
					<legend class="fieldset-legend">NIP Kepala Sekolah</legend>
					<input
						required
						type="text"
						class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
						placeholder="Contoh: NIP 19700305 199309 1 009"
						name="kepalaSekolah.nip"
						value={pakaiSelectPegawai ? kepalaNip : undefined}
						disabled={kunciKepalaSekolah}
						title={kunciKepalaSekolah
							? 'Mengikuti data Dapodik. Ubah melalui menu Pengaturan Profil akun yang bersangkutan'
							: undefined}
					/>
					{#if !pakaiSelectPegawai}
						<span>Biarkan kosong jika kepala sekolah tidak memiliki NIP.</span>
					{:else if kunciKepalaSekolah}
						<span>
							Otomatis berdasarkan pegawai yang dipilih. Edit melalui menu Pengaturan - Edit profil.
						</span>
					{/if}
				</div>

				<input type="hidden" name="kepalaSekolahId" value={kepalaTerpilihId ?? ''} />

				<div class="fieldset">
					<!-- Nama desa atau kelurahan -->
					<legend class="fieldset-legend">Desa atau Kelurahan</legend>
					<input
						required
						type="text"
						class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
						placeholder="Contoh: Desa Sungai Dangin atau Kelurahan Sungai Sengkuang"
						name="alamat.desa"
					/>
				</div>

				<div class="fieldset">
					<!-- Kecamatan -->
					<legend class="fieldset-legend">Kecamatan</legend>
					<input
						required
						type="text"
						class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
						placeholder="Contoh: Kecamatan Noyan"
						name="alamat.kecamatan"
					/>
				</div>

				<div class="fieldset">
					<!-- Kabupaten -->
					<legend class="fieldset-legend">Kabupaten</legend>
					<input
						required
						type="text"
						class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
						placeholder="Contoh: Kabupaten Sanggau"
						name="alamat.kabupaten"
					/>
				</div>

				<div class="fieldset">
					<!-- Provinsi -->
					<legend class="fieldset-legend">Provinsi</legend>
					<input
						required
						type="text"
						class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
						placeholder="Contoh: Kalimantan Barat"
						name="alamat.provinsi"
					/>
				</div>

				<div class="fieldset">
					<!-- Kode Pos -->
					<legend class="fieldset-legend">Kode POS</legend>
					<input
						required
						type="text"
						class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
						placeholder="Contoh: 78554"
						name="alamat.kodePos"
					/>
				</div>

				<div class="fieldset">
					<!-- Alamat Sekolah -->
					<legend class="fieldset-legend">Rincian Alamat Sekolah</legend>
					<input
						required
						type="text"
						class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
						placeholder="Contoh: Jalan Raya Noyan, RT 9 / RW 3, Dusun Periji"
						name="alamat.jalan"
					/>
				</div>

				<div class="fieldset">
					<!-- Website Sekolah -->
					<legend class="fieldset-legend">Website Sekolah</legend>
					<label class="input bg-base-200 dark:bg-base-300 validator w-full dark:border-none">
						<span class="label">https://</span>
						<input type="text" placeholder="Kosongkan bila tidak ada" name="website" />
					</label>
				</div>

				<div class="fieldset">
					<!-- Email Sekolah -->
					<legend class="fieldset-legend">Email Sekolah</legend>
					<input
						required
						type="text"
						class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
						placeholder="Contoh: cs@sdn19periji.sch.id"
						name="email"
					/>
				</div>

				<!-- Kementrian -->
				<div class="fieldset">
					<legend class="fieldset-legend">Pilih Naungan</legend>
					<select
						class="select bg-base-200 dark:bg-base-300 validator w-full truncate dark:border-none"
						name="naungan"
						required
					>
						{#each nauganOptions as option (option.key)}
							<option
								value={option.key}
								selected={initialSekolah?.naungan === option.key ||
									(!initialSekolah && option.key === 'kemendikbud')}
							>
								{option.label}
							</option>
						{/each}
					</select>
				</div>

				<!-- Status definitif plt -->
				<div class="fieldset">
					<legend class="fieldset-legend">Status Kepala Sekolah</legend>
					<select
						class="select bg-base-200 dark:bg-base-300 validator w-full truncate dark:border-none"
						name="statusKepalaSekolah"
						required
					>
						<option
							value="definitif"
							selected={initialSekolah?.statusKepalaSekolah === 'definitif'}
						>
							Definitif
						</option>
						<option value="plt" selected={initialSekolah?.statusKepalaSekolah === 'plt'}>
							PLT (Pelaksana Tugas)
						</option>
					</select>
				</div>
			</div>

			<!-- Upload logo sekolah dan dinas pendidikan -->
			<div class="mt-2 grid gap-2 md:grid-cols-2">
				<div class="fieldset">
					<legend class="fieldset-legend">Logo Sekolah</legend>
					<input type="file" class="file-input file-input-ghost" accept="image/*" name="logo" />
					<p class="label text-wrap">Format png, tanpa latar belakang, maksimal 300KB</p>
				</div>
				<div class="fieldset">
					<legend class="fieldset-legend">Logo Pemda</legend>
					<input
						type="file"
						class="file-input file-input-ghost"
						accept="image/*"
						name="logoDinas"
					/>
					<p class="label text-wrap">Format png, tanpa latar belakang, maksimal 300KB</p>
				</div>
			</div>

			<!-- Back and Save -->
			<div class="mt-6 flex flex-col justify-end gap-2 sm:flex-row">
				{#if !data.isInit}
					<div class="grid grid-cols-2 gap-2 sm:contents">
						<a
							class="btn btn-soft shadow-none sm:mr-auto sm:w-auto"
							href="/sekolah"
							aria-label="kembali"
						>
							<Icon name="left" />
							Kembali
						</a>
						<button
							type="button"
							class="btn btn-soft shadow-none sm:w-auto"
							onclick={handleImportDb}
						>
							<Icon name="import" />
							Import DB
						</button>
					</div>
				{:else}
					<button type="button" class="btn btn-soft shadow-none sm:w-auto" onclick={handleImportDb}>
						<Icon name="import" />
						Import DB
					</button>
				{/if}
				<button
					class="btn btn-primary shadow-none mt-4 sm:mt-0 sm:w-auto"
					disabled={submitting || kepalaBelumDipilih}
				>
					{#if submitting}
						<span class="loading loading-spinner"></span>
					{/if}
					<Icon name="save" />
					Simpan
				</button>
			</div>
		</div>
	{/snippet}
</FormEnhance>

<SekolahModals />
