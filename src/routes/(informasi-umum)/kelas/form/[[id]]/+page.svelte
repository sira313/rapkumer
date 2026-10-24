<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- small page-level navigation patterns handled intentionally */
	import { goto, invalidate } from '$app/navigation';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import ResetWalasBody from '$lib/components/kelas/reset-walas-body.svelte';

	let { data } = $props();
	const disableAcademic = $derived.by(
		() => !data.academicLock?.tahunAjaranId || !data.academicLock?.semesterId
	);
	const tahunAjaranLabel = $derived.by(() => data.academicLock?.tahunAjaranLabel ?? 'Belum diatur');
	const semesterLabel = $derived.by(() => data.academicLock?.semesterLabel ?? 'Belum diatur');

	// Combobox "Wali Kelas" — aktif bila daftar PTK hasil Sinkron Dapodik tersedia
	// (logika sama dengan "Nama Mata Pelajaran" pada Tambah Mata Pelajaran).
	type PtkOpsi = { id: number; nama: string; nip: string | null };
	const ptkOptions = $derived((data.ptkList ?? []) as PtkOpsi[]);
	const pakaiSelectWalas = $derived(Boolean(data.dapodikAktif));
	// svelte-ignore state_referenced_locally
	const initialWalas = (data.formInit?.waliKelas ?? null) as { nama?: string; nip?: string } | null;
	let walasQuery = $state(initialWalas?.nama ?? '');
	let walasNip = $state(initialWalas?.nip ?? '');
	let daftarWalasTerbuka = $state(false);
	let indeksSorotWalas = $state(-1);
	// Pegawai terpilih (mode Dapodik) — dikirim sebagai ID agar server tidak
	// pernah menebak/membuat orang baru dari teks bebas.
	// svelte-ignore state_referenced_locally
	let walasTerpilihId = $state<number | null>(data.kelas?.waliKelasId ?? null);
	const MAX_OPSI_TAMPIL = 80;
	const walasTersaring = $derived.by(() => {
		const q = walasQuery.trim().toLowerCase();
		if (!q) return ptkOptions;
		return ptkOptions.filter((o) => o.nama.toLowerCase().includes(q) || (o.nip ?? '').includes(q));
	});
	function pilihWalas(opsi: PtkOpsi) {
		walasQuery = opsi.nama;
		walasNip = opsi.nip ?? '';
		walasTerpilihId = opsi.id;
		daftarWalasTerbuka = false;
		indeksSorotWalas = -1;
	}
	// Mode Dapodik: teks terisi tapi belum memilih orang dari daftar → blokir simpan
	const walasBelumDipilih = $derived(
		pakaiSelectWalas && walasQuery.trim() !== '' && walasTerpilihId === null
	);
	function sorotWalasGeser(delta: number) {
		const total = Math.min(walasTersaring.length, MAX_OPSI_TAMPIL);
		if (total === 0) return;
		indeksSorotWalas = (indeksSorotWalas + delta + total) % total;
		document.getElementById(`walas-opsi-${indeksSorotWalas}`)?.scrollIntoView({ block: 'nearest' });
	}
	function onWalasKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			daftarWalasTerbuka = false;
			return;
		}
		if (!daftarWalasTerbuka || walasTersaring.length === 0) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			sorotWalasGeser(1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			sorotWalasGeser(-1);
		} else if (e.key === 'Enter' && indeksSorotWalas >= 0) {
			e.preventDefault();
			pilihWalas(walasTersaring[Math.min(indeksSorotWalas, walasTersaring.length - 1)]);
		}
	}

	function confirmResetWalas() {
		showModal({
			title: 'Reset Wali Kelas',
			body: ResetWalasBody,
			dismissible: true,
			spreadActions: true,
			onNeutral: {
				label: 'Tidak',
				action: ({ close }) => close()
			},
			onPositive: {
				label: 'Ya, tambahkan',
				action: ({ close }) => {
					close();
					const form = document.getElementById('reset-walas-form') as HTMLFormElement | null;
					form?.requestSubmit();
				}
			}
		});
	}
</script>

<FormEnhance
	action="?/save"
	init={data.formInit}
	onsuccess={async () => {
		await goto('/kelas');
		await invalidate('app:kelas');
	}}
>
	{#snippet children({ submitting })}
		<div class="card bg-base-100 mx-auto rounded-lg p-4 shadow-md">
			<input type="hidden" name="waliKelasId" value={walasTerpilihId ?? ''} />
			<h2 class="mb-4 text-xl font-bold">Formulir Isian Data Kelas</h2>
			{#if disableAcademic}
				<div class="alert alert-warning mb-4 flex items-center gap-3">
					<Icon name="warning" />
					<span>
						Atur tahun ajaran dan semester aktif melalui menu Rapor sebelum membuat atau mengubah
						data kelas.
					</span>
				</div>
			{:else}
				<div class="alert alert-info mb-4 flex items-center gap-3">
					<Icon name="info" />
					<div class="leading-tight">
						<p>
							<span class="font-semibold">Tahun ajaran aktif:</span>
							{tahunAjaranLabel}
						</p>
						<p>
							<span class="font-semibold">Semester aktif:</span>
							{semesterLabel}
						</p>
						<p>
							NIP harus ditulis lengkap apakah NIP, NIPPPK, NIY, atau NIPY. Misalnya: "NIPPPK.
							199004052020212001"
						</p>
					</div>
				</div>
			{/if}
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<!-- Nama Rombel -->
				<div class="fieldset">
					<legend class="fieldset-legend">Nama Rombel</legend>
					<input
						required
						type="text"
						class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
						placeholder="Contoh: VI (Kelas 6)"
						name="rombel"
					/>
				</div>

				<!-- Fase -->
				<div class="fieldset">
					<legend class="fieldset-legend">Fase</legend>
					<select
						class="select bg-base-200 dark:bg-base-300 w-full truncate dark:border-none"
						title="Pilih tingkat pendidikan"
						name="fase"
						disabled={!data.tingkatOptions?.length}
					>
						<option value="" disabled selected>Pilih fase</option>
						{#each data.tingkatOptions ?? [] as option (option.fase)}
							<option value={option.fase}>{option.label}</option>
						{:else}
							<option value="" disabled>
								Atur data sekolah terlebih dahulu untuk memilih fase
							</option>
						{/each}
					</select>
				</div>

				<!-- Wali Kelas -->
				<div class="fieldset">
					<legend class="fieldset-legend">Wali Kelas</legend>
					{#if pakaiSelectWalas}
						<div class="relative">
							<input
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Pilih Wali Kelas"
								name="waliKelas.nama"
								autocomplete="off"
								role="combobox"
								aria-expanded={daftarWalasTerbuka}
								aria-controls="daftar-nama-walas"
								aria-activedescendant={daftarWalasTerbuka && indeksSorotWalas >= 0
									? `walas-opsi-${indeksSorotWalas}`
									: undefined}
								bind:value={walasQuery}
								onfocus={() => {
									daftarWalasTerbuka = true;
									indeksSorotWalas = 0;
								}}
								oninput={() => {
									daftarWalasTerbuka = true;
									indeksSorotWalas = 0;
									walasTerpilihId = null;
								}}
								onblur={() => (daftarWalasTerbuka = false)}
								onkeydown={onWalasKeydown}
							/>
							{#if daftarWalasTerbuka && walasTersaring.length > 0}
								<ul
									id="daftar-nama-walas"
									role="listbox"
									class="bg-base-200 absolute z-50 mt-1 max-h-60 w-full list-none overflow-y-auto rounded-box p-1 shadow-lg"
								>
									{#each walasTersaring.slice(0, MAX_OPSI_TAMPIL) as opsi, i (`${opsi.id}|${opsi.nama}`)}
										<li id={`walas-opsi-${i}`} role="option" aria-selected={i === indeksSorotWalas}>
											<button
												type="button"
												class="w-full truncate rounded px-2 py-1.5 text-left text-sm transition-colors duration-200 hover:bg-base-content/10 {i ===
												indeksSorotWalas
													? 'bg-base-content/10'
													: ''}"
												onmousedown={(e) => e.preventDefault()}
												onclick={() => pilihWalas(opsi)}
											>
												{#if opsi.nip}
													<span class="mr-1.5 font-mono text-xs opacity-60">{opsi.nip}</span>
												{/if}
												{opsi.nama}
											</button>
										</li>
									{/each}
									{#if walasTersaring.length > MAX_OPSI_TAMPIL}
										<li class="px-2 py-1 text-sm opacity-60">
											{walasTersaring.length - MAX_OPSI_TAMPIL} lainnya — ketik untuk mempersempit.
										</li>
									{/if}
								</ul>
							{/if}
						</div>
						<span>Ketik untuk mencari, lalu pilih dari daftar.</span>
					{:else}
						<input
							type="text"
							class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
							placeholder="Contoh: Damian Wayne, Bat"
							name="waliKelas.nama"
						/>
					{/if}
				</div>

				<!-- NIP Wali Kelas -->
				<div class="fieldset">
					<legend class="fieldset-legend">NIP Wali Kelas</legend>
					<input
						type="text"
						class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
						placeholder="Contoh: NIP 19940505 201803 1 008"
						name="waliKelas.nip"
						value={pakaiSelectWalas ? walasNip : undefined}
						disabled={pakaiSelectWalas}
						title={pakaiSelectWalas
							? 'Mengikuti data Dapodik. Ubah melalui menu Pengaturan Profil akun yang bersangkutan'
							: undefined}
					/>
					{#if pakaiSelectWalas}
						<span class="text-xs text-gray-500">
							Terkunci karena data Dapodik sudah ada. Perubahan nama/NIP dilakukan lewat Pengaturan
							Profil masing-masing akun.
						</span>
					{:else}
						<span> Biarkan kosong jika wali kelas tidak memiliki NIP. </span>
					{/if}
				</div>

				<!-- Wali Asrama -->
				<div class="fieldset">
					<legend class="fieldset-legend"
						>Wali Asrama <span class="text-xs text-gray-500">(Opsional)</span></legend
					>
					<input
						type="text"
						class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
						placeholder="Contoh: Ahmad Rahman"
						name="waliAsrama.nama"
					/>
					<span>Khusus sekolah dengan program keasramaan.</span>
				</div>

				<!-- NIP Wali Asrama -->
				<div class="fieldset">
					<legend class="fieldset-legend"
						>NIP Wali Asrama <span class="text-xs text-gray-500">(Opsional)</span></legend
					>
					<input
						type="text"
						class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
						placeholder="Contoh: NIP 19940505 201803 1 008"
						name="waliAsrama.nip"
					/>
					<span> Biarkan kosong jika tidak ada wali asrama atau tidak memiliki NIP. </span>
				</div>
			</div>
			<!-- mobile: 2-col grid -->
			<div class="mt-6 grid grid-cols-2 gap-2 md:hidden">
				<a class="btn btn-soft shadow-none" href="/kelas" aria-label="kembali">
					<Icon name="left" />
					Kembali
				</a>
				<button
					class="btn shadow-none {data.kelas?.id ? 'btn-secondary' : 'btn-primary'}"
					disabled={submitting || disableAcademic || walasBelumDipilih}
				>
					{#if submitting}
						<div class="loading loading-spinner"></div>
					{:else if data.kelas?.id}
						<Icon name="edit" />
						Update
					{:else}
						<Icon name="plus" />
						Tambah
					{/if}
				</button>
				{#if data.canResetWalas && data.kelas?.id && pakaiSelectWalas}
					<button
						type="button"
						class="col-span-2 btn btn-soft btn-warning shadow-none"
						disabled={disableAcademic}
						onclick={confirmResetWalas}
					>
						<Icon name="repeat" />
						Reset Walas
					</button>
				{/if}
			</div>
			<!-- desktop: original flex layout -->
			<div class="mt-6 hidden justify-between gap-2 md:flex">
				<a class="btn btn-soft shadow-none" href="/kelas" aria-label="kembali">
					<Icon name="left" />
					Kembali
				</a>
				<div class="flex flex-wrap justify-end gap-2">
					<button
						class="btn shadow-none {data.kelas?.id ? 'btn-secondary' : 'btn-primary'}"
						disabled={submitting || disableAcademic || walasBelumDipilih}
					>
						{#if submitting}
							<div class="loading loading-spinner"></div>
						{:else if data.kelas?.id}
							<Icon name="edit" />
							Update
						{:else}
							<Icon name="plus" />
							Tambah
						{/if}
					</button>
					{#if data.canResetWalas && data.kelas?.id && pakaiSelectWalas}
						<button
							type="button"
							class="btn btn-soft btn-warning shadow-none"
							disabled={disableAcademic}
							onclick={confirmResetWalas}
						>
							<Icon name="repeat" />
							Reset Walas
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/snippet}
</FormEnhance>
