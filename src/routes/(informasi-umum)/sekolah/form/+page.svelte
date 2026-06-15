<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- small page-level navigation helper calls */
	import { goto, invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import ImportDatabaseModal from '$lib/components/modals/import-database-modal.svelte';
	import { jenjangPendidikanSederajat, nauganOptions } from '$lib/statics';

	let { data } = $props();
	const isNew = data.isNew as boolean;
	const initialSekolah = (isNew ? undefined : data.sekolah) as Sekolah | undefined;

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
			<h2 class="mb-4 text-xl font-bold">
				{#if isNew}
					Tambah Sekolah Baru
				{:else}
					Formulir Isian Data Sekolah
				{/if}
			</h2>

			<div class="grid grid-cols-1 items-center gap-2 md:grid-cols-2">
				<!-- Jenjang Pendidikan & Lokasi Tanda Tangan -->
				<div class="grid grid-cols-1 gap-2 md:col-span-2 md:grid-cols-2 md:items-end">
					<div class="fieldset overflow-hidden">
						<legend class="fieldset-legend">Jenjang Pendidikan</legend>
						<select
							class="select bg-base-200 dark:bg-base-300 validator w-full truncate border dark:border-none"
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
					<input
						required
						type="text"
						class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
						placeholder="Contoh: Bruce Wayne, Bat"
						name="kepalaSekolah.nama"
					/>
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
					/>
				</div>

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
				<div class="fieldset overflow-hidden">
					<legend class="fieldset-legend">Pilih Naungan</legend>
					<select
						class="select bg-base-200 dark:bg-base-300 validator w-full truncate border dark:border-none"
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
				<div class="fieldset overflow-hidden">
					<legend class="fieldset-legend">Status Kepala Sekolah</legend>
					<select
						class="select bg-base-200 dark:bg-base-300 validator w-full truncate border dark:border-none"
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
					<a class="btn btn-soft shadow-none sm:w-auto" href="/sekolah" aria-label="kembali">
						<Icon name="left" />
						Kembali
					</a>
				{/if}

				<button type="button" class="btn btn-soft shadow-none sm:w-auto" onclick={handleImportDb}>
					<Icon name="import" />
					Import DB
				</button>
				<button class="btn btn-primary shadow-none sm:w-auto" disabled={submitting}>
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
