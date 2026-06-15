<script lang="ts">
	import { invalidate } from '$app/navigation';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { jenisKelamin } from '$lib/statics';
	// deletion handled elsewhere; removed unused modal/toast imports
	let { data } = $props();
	let activeTab = $state(0);
	const totalTabs = 5;

	// openDeleteModal removed — deletion moved to dedicated route/modal
</script>

<FormEnhance
	action="?/save"
	enctype="multipart/form-data"
	init={data.murid}
	onsuccess={async ({ data: res }) => {
		await invalidate('app:murid');
		// navigate back to detail modal first, then dispatch update event
		history.back();
		try {
			const foto = res?.foto ?? null;
			const id = res?.id ?? data.murid?.id;
			const t = Date.now();
			const waliAsuhNama = res?.waliAsuhNama ?? null;
			const waliAsuhNip = res?.waliAsuhNip ?? null;
			// delay dispatch slightly so the detail modal can mount its listener
			setTimeout(() => {
				window.dispatchEvent(
					new CustomEvent('murid:updated', { detail: { id, foto, t, waliAsuhNama, waliAsuhNip } })
				);
			}, 120);
		} catch {
			void 0;
		}
	}}
>
	{#snippet children({ submitting, invalid })}
		<p class="mb-6 text-xl font-bold">
			{data.murid?.id ? 'Formulir Edit Murid Manual' : 'Formulir Tambah Murid Manual'}
		</p>
		<div class="max-h-[60vh] overflow-y-auto sm:max-h-none sm:overflow-y-visible">
			<!-- Tab Isian -->
			<div class="tabs tabs-box">
				<!-- data Murid -->
				<input type="radio" bind:group={activeTab} value={0} class="tab" aria-label="Data Murid" />
				<div class="tab-content bg-base-100 p-4">
					<div class="flex flex-col gap-2 sm:flex-row">
						<!-- NIS -->
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">NIS</legend>
							<input
								required
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Contoh: 0030"
								name="nis"
							/>
						</fieldset>
						<!-- NISN -->
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">NISN</legend>
							<input
								required
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Contoh: 8371612"
								name="nisn"
							/>
						</fieldset>
					</div>

					<div class="flex flex-col gap-2 sm:flex-row">
						<!-- Nama Murid -->
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">Nama Murid</legend>
							<input
								required
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Contoh: Chairil Anwar"
								name="nama"
							/>
						</fieldset>

						<!-- Kelas -->
						<fieldset class="fieldset flex-1 overflow-hidden">
							<legend class="fieldset-legend">Kelas</legend>
							<select
								class="select bg-base-200 dark:bg-base-300 w-full truncate dark:border-none"
								title="Pilih kelas"
								name="kelasId"
								required
							>
								<option value="" disabled selected> Pilih Kelas </option>
								{#each data.daftarKelas as kelas (kelas.id)}
									<option value={kelas.id}>
										{kelas.nama} &bullet; {kelas.fase}
									</option>
								{:else}
									<option value="" disabled selected> Belum ada data kelas </option>
								{/each}
							</select>
						</fieldset>
					</div>

					<div class="flex flex-col gap-2 sm:flex-row">
						<!-- Tempat lahir -->
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">Tempat Lahir</legend>
							<input
								required
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Contoh: Kembayan"
								name="tempatLahir"
							/>
						</fieldset>
						<!-- Tanggal Lahir -->
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">Tanggal Lahir</legend>
							<input
								type="date"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								name="tanggalLahir"
								required
							/>
						</fieldset>
					</div>
					<div class="flex flex-col gap-2 sm:flex-row">
						<!-- Jenis Kelamin -->
						<fieldset class="fieldset flex-1 overflow-hidden">
							<legend class="fieldset-legend">Jenis Kelamin</legend>
							<select
								class="select validator bg-base-200 dark:bg-base-300 w-full truncate dark:border-none"
								name="jenisKelamin"
								required
							>
								<option value="" disabled selected>Pilih Jenis Kelamin</option>
								{#each Object.entries(jenisKelamin) as [value, label] (value)}
									<option {value}>{label}</option>
								{/each}
							</select>
						</fieldset>
						<!-- Agama -->
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">Agama</legend>
							<input
								required
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Contoh: Islam"
								name="agama"
							/>
						</fieldset>
					</div>
					<div class="flex flex-col gap-2 sm:flex-row">
						<!-- Pendidikan Sebelumnya -->
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">Pendidikan Sebelumnya</legend>
							<input
								required
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Contoh: TK Kencana Pertiwi"
								name="pendidikanSebelumnya"
							/>
						</fieldset>
						<!-- Tanggal Masuk Sekolah Ini -->
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">Tanggal masuk sekolah ini</legend>
							<input
								type="date"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								name="tanggalMasuk"
								required
							/>
						</fieldset>
					</div>
				</div>

				<!-- data Orang Tua -->
				<input
					type="radio"
					bind:group={activeTab}
					value={1}
					class="tab"
					aria-label="Data Orang Tua"
				/>
				<div class="tab-content bg-base-100 p-4">
					<div class="flex flex-col gap-2 sm:flex-row">
						<!-- Nama Ayah -->
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">Nama Ayah</legend>
							<input
								required
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Contoh: Agus"
								name="ayah.nama"
							/>
						</fieldset>
						<!-- Nama Ibu -->
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">Nama Ibu</legend>
							<input
								required
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Contoh: Ratih"
								name="ibu.nama"
							/>
						</fieldset>
					</div>
					<div class="flex flex-col gap-2 sm:flex-row">
						<!-- Pekerjaan Ayah -->
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">Pekerjaan Ayah</legend>
							<input
								required
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Contoh: Tani"
								name="ayah.pekerjaan"
							/>
						</fieldset>
						<!-- Pekerjaan Ibu -->
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">Pekerjaan Ibu</legend>
							<input
								required
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Contoh: IRT"
								name="ibu.pekerjaan"
							/>
						</fieldset>
					</div>
					<!-- Kontak -->
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Kontak</legend>
						<input
							required
							type="text"
							class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
							placeholder="Nomor telepon atau WhatsApp"
							name="ayah.kontak"
						/>
					</fieldset>
				</div>

				<!-- data Alamat Murid -->
				<input
					type="radio"
					bind:group={activeTab}
					value={2}
					class="tab"
					aria-label="Data Alamat Murid"
				/>
				<div class="tab-content bg-base-100 p-4">
					<!-- Alamat Jalan -->
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Jalan</legend>
						<input
							required
							type="text"
							class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
							placeholder="Contoh: Jalan Raya Noyan, Dusun Periji"
							name="alamat.jalan"
						/>
					</fieldset>
					<div class="flex flex-col gap-2 sm:flex-row">
						<!-- Kelurahan/Desa -->
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">Kelurahan/Desa</legend>
							<input
								required
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Contoh: Sungai Dangin"
								name="alamat.desa"
							/>
						</fieldset>
						<!-- Kecamatan -->
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">Kecamatan</legend>
							<input
								required
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Contoh: Noyan"
								name="alamat.kecamatan"
							/>
						</fieldset>
					</div>
					<div class="flex flex-col gap-2 sm:flex-row">
						<!-- Kabupaten -->
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">Kabupaten</legend>
							<input
								required
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Contoh: Sanggau"
								name="alamat.kabupaten"
							/>
						</fieldset>
						<!-- Provinsi -->
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">Provinsi</legend>
							<input
								required
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Contoh: Kalimantan Barat"
								name="alamat.provinsi"
							/>
						</fieldset>
					</div>
				</div>

				<!-- data Wali -->
				<input
					type="radio"
					bind:group={activeTab}
					value={3}
					class="tab"
					aria-label="Data Wali (Opsional)"
				/>
				<div class="tab-content bg-base-100 p-4">
					<div class="flex flex-col gap-2 sm:flex-row">
						<!-- Nama Wali -->
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">Nama Wali</legend>
							<input
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Contoh: Hendra"
								name="wali.nama"
							/>
						</fieldset>
						<!-- Pekerjaan Wali -->
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">Pekerjaan Wali</legend>
							<input
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Contoh: PNS"
								name="wali.pekerjaan"
							/>
						</fieldset>
					</div>
					<div class="flex flex-col gap-2 sm:flex-row">
						<!-- Alamat Wali -->
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">Alamat Wali</legend>
							<input
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Contoh: Jalan Raya Noyan, Dusun Periji"
								name="wali.alamat"
							/>
						</fieldset>
						<!-- Kontak Wali -->
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">Kontak</legend>
							<input
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Nomor telepon atau WhatsApp"
								name="wali.kontak"
							/>
						</fieldset>
					</div>
				</div>

				<!-- data Wali Asuh -->
				<input
					type="radio"
					bind:group={activeTab}
					value={4}
					class="tab"
					aria-label="Wali Asuh (Opsional)"
				/>
				<div class="tab-content bg-base-100 p-4">
					<div class="flex flex-col gap-2 sm:flex-row">
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">Nama Wali Asuh</legend>
							<input
								type="text"
								class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Contoh: Budi Santoso"
								name="waliAsuhNama"
							/>
						</fieldset>
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend"
								>NIP Wali Asuh <span class="text-xs text-gray-500">(Opsional)</span></legend
							>
							<input
								type="text"
								class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
								placeholder="Contoh: NIP 19940505 201803 1 008"
								name="waliAsuhNip"
							/>
						</fieldset>
					</div>
				</div>
			</div>
		</div>
		<div
			class="border-base-200 mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end"
		>
			{#if invalid}
				<button
					class="btn btn-primary shadow-none max-sm:w-full"
					type="button"
					onclick={() => (activeTab = (activeTab + 1) % totalTabs)}
				>
					<Icon name="double-arrow" class="h-4 w-4" />
					Selanjutnya
				</button>
			{/if}

			<div class="flex flex-row justify-between gap-2 max-sm:w-full sm:ml-2">
				<button class="btn btn-soft shadow-none" type="button" onclick={() => history.back()}>
					<Icon name="close-sm" />
					Batal
				</button>

				<div
					class="tooltip tooltip-left tooltip-error {data.murid?.id}"
					data-tip={submitting || invalid
						? 'Ada data lain yang belum terisi, mohon periksa terlebih dahulu!'
						: ''}
				>
					<button
						class="btn shadow-none {data.murid?.id ? 'btn-secondary' : 'btn-primary'}"
						type="submit"
						disabled={submitting || invalid}
					>
						{#if submitting}
							<span class="loading loading-spinner"></span>
						{:else}
							<Icon name="save" />
						{/if}
						Simpan
					</button>
				</div>
			</div>
		</div>
	{/snippet}
</FormEnhance>

<!-- delete-confirm modal logic merged into top-level script -->
