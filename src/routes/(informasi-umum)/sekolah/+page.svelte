<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- page intentionally uses href/goto for navigation */
	import Icon from '$lib/components/icon.svelte';
	import DeleteSekolahModal, {
		type DeleteSekolahModalHandle
	} from '$lib/components/sekolah/delete-sekolah-modal.svelte';
	import SekolahModals from '$lib/components/sekolah/modals.svelte';
	import type { SekolahCard } from '$lib/components/sekolah/types';
	import { jenjangPendidikanSederajat, nauganLabelByKey } from '$lib/statics.js';
	import { modalRoute } from '$lib/utils';

	import { page } from '$app/state';

	// single permission for sekolah management
	let canSekolahManage = $derived.by(() => {
		const perms = (page.data.user ?? { permissions: [] }).permissions ?? [];
		return (perms as string[]).includes('informasi_umum_sekolah');
	});

	let { data } = $props();
	const sekolahList = $derived((data.sekolahList ?? []) as SekolahCard[]);
	const activeSekolahId = $derived(data.sekolah?.id ?? null);
	const sortedSekolahList = $derived.by(() => {
		const list = sekolahList;
		const aktifId = activeSekolahId;
		return [...list].sort((a, b) => {
			if (a.id === aktifId) return -1;
			if (b.id === aktifId) return 1;
			return list.indexOf(a) - list.indexOf(b);
		});
	});

	const formatDate = (value?: string | null) => {
		if (!value) return '-';
		return new Date(value).toLocaleDateString('id-ID', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	};

	function plainAlamat(alamat?: Alamat | null) {
		if (!alamat) return '-';
		return `${alamat.jalan || '-'}, ${alamat.desa || '-'}, ${alamat.kecamatan || '-'}, ${alamat.kabupaten || '-'}, ${alamat.provinsi || '-'}, ${alamat.kodePos || '-'}`;
	}

	let deleteModalRef: DeleteSekolahModalHandle | null = null;

	function openDeleteSekolah(sekolah: SekolahCard) {
		try {
			console.debug('[sekolah page] delete button clicked for', sekolah && sekolah.id);
			if (canSekolahManage) deleteModalRef?.open(sekolah);
		} catch (err) {
			console.error('failed to open delete modal', err);
		}
	}

	function getJenjangLabel(key?: Sekolah['jenjangPendidikan'] | null) {
		if (!key) return '-';
		const label = (jenjangPendidikanSederajat[key] ?? [])[0]?.label;
		return label ?? String(key);
	}

	function getJenjangVariantLabel(variantKey?: Sekolah['jenjangVariant'] | null) {
		if (!variantKey) return null;
		// search across all jenjang groups for a variant with the matching key
		for (const groupKey of Object.keys(jenjangPendidikanSederajat)) {
			const variants =
				jenjangPendidikanSederajat[groupKey as keyof typeof jenjangPendidikanSederajat] ?? [];
			const found = variants.find((v) => v.key === variantKey);
			if (found) return found.label;
		}
		return String(variantKey);
	}
</script>

<div class="flex flex-col gap-4">
	{#if sortedSekolahList.length}
		{#each sortedSekolahList as sekolah (sekolah.id)}
			<div class="card bg-base-100 rounded-box shadow-md">
				<div class="card-body p-0">
					<div class="p-6 pb-2">
						<div class="flex items-start justify-between gap-4">
							<div class="flex items-center gap-4">
								<div class="avatar">
									<div class="rounded-box w-18">
										<img src={`/sekolah/logo/${sekolah.id}`} alt={`Logo ${sekolah.nama}`} />
									</div>
								</div>

								<div>
									<h2 class="card-title text-2xl font-bold">{sekolah.nama}</h2>
									<p class="text-base-content/70">Data Pokok Sekolah</p>
								</div>
							</div>
							{#if sekolah.id === activeSekolahId}
								<span class="badge badge-primary badge-soft self-start">Aktif</span>
							{/if}
						</div>
					</div>
					<div class="px-6 pb-2">
						{#if sekolah.tahunAjaranAktif}
							<div class="text-base-content/80 flex flex-wrap items-center gap-2 text-sm">
								<span class="badge badge-primary badge-soft">
									Tahun ajaran: {sekolah.tahunAjaranAktif.nama}
								</span>
								{#if sekolah.semesterAktif}
									<span class="badge badge-info badge-soft">
										Semester: {sekolah.semesterAktif.nama}
									</span>
									{#if sekolah.semesterAktif.tanggalBagiRaport}
										<span class="text-base-content/60 text-xs">
											Bagi rapor: {formatDate(sekolah.semesterAktif.tanggalBagiRaport)}
										</span>
									{/if}
								{:else}
									<span class="text-base-content/60 text-xs">Belum ada semester aktif</span>
								{/if}
							</div>
						{:else}
							<div
								class="border-warning/60 bg-warning/10 text-warning flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm"
							>
								<span aria-hidden="true">
									<Icon name="warning" class="h-4 w-4" />
								</span>
								<span>Belum ada tahun ajaran aktif. Atur melalui tombol "Tahun Ajaran".</span>
							</div>
						{/if}
					</div>

					<div class="border-base-300 dark:border-base-200 border"></div>

					<div class="p-6">
						<div class="space-y-4">
							<div class="grid grid-cols-1 items-center gap-2 md:grid-cols-3">
								<span class="text-base-content/70 font-semibold">Jenjang Pendidikan</span>
								<span class="text-base-content md:col-span-2">
									{#if sekolah.jenjangVariant}
										{getJenjangVariantLabel(sekolah.jenjangVariant)}
									{:else}
										{getJenjangLabel(sekolah.jenjangPendidikan)}
									{/if}
								</span>
							</div>

							<div class="grid grid-cols-1 items-center gap-2 md:grid-cols-3">
								<span class="text-base-content/70 font-semibold">Naungan</span>
								<span class="text-base-content md:col-span-2">
									{nauganLabelByKey[sekolah.naungan as keyof typeof nauganLabelByKey] ?? '-'}
								</span>
							</div>

							<div class="grid grid-cols-1 items-center gap-2 md:grid-cols-3">
								<span class="text-base-content/70 font-semibold">NPSN</span>
								<span class="text-base-content md:col-span-2">{sekolah.npsn}</span>
							</div>

							<div class="grid grid-cols-1 items-center gap-2 md:grid-cols-3">
								<span class="text-base-content/70 font-semibold">Kepala Sekolah</span>
								<div class="text-base-content sm:col-span-2">
									<div class="tooltip" data-tip={sekolah.kepalaSekolah?.nip}>
										{sekolah.kepalaSekolah?.nama ?? '-'}
									</div>
								</div>
							</div>

							<div class="grid grid-cols-1 items-start gap-2 md:grid-cols-3">
								<span class="text-base-content/70 font-semibold">Alamat</span>
								<span class="text-base-content md:col-span-2">
									{plainAlamat(sekolah.alamat)}
								</span>
							</div>

							<div class="grid grid-cols-1 items-center gap-2 md:grid-cols-3">
								<span class="text-base-content/70 font-semibold">Website Sekolah</span>
								<div class="sm:col-span-2">
									{#if sekolah.website}
										<a
											href={sekolah.website}
											target="_blank"
											class="text-primary break-all underline">{sekolah.website}</a
										>
									{:else}
										<span class="text-base-content/70 break-all">-</span>
									{/if}
								</div>
							</div>

							<div class="grid grid-cols-1 items-center gap-2 md:grid-cols-3">
								<span class="text-base-content/70 font-semibold">Email Sekolah</span>
								<div class="link link-accent break-all sm:col-span-2">
									{#if sekolah.email}
										<a href={`mailto:${sekolah.email}`} target="_blank">{sekolah.email}</a>
									{:else}
										-
									{/if}
								</div>
							</div>
						</div>

						<div class="mt-8 flex flex-col justify-between gap-2 md:flex-row">
							<div class="flex flex-col gap-2 order-1 md:order-2 md:flex-row">
								<a
									href="/sekolah/form/sync-dapodik"
									use:modalRoute={'sync-dapodik'}
									class="btn btn-soft shadow-none {!canSekolahManage
										? 'pointer-events-none opacity-50'
										: ''}"
									aria-label="Sync Dapodik"
									aria-disabled={!canSekolahManage}
									title={!canSekolahManage
										? 'Anda tidak memiliki izin untuk sinkronisasi Dapodik'
										: ''}
								>
									<Icon name="dapodik" />
									Sync Dapodik
								</a>
								<div class="grid grid-cols-2 gap-2 md:flex md:flex-row">
									<a
										href={`/sekolah/tahun-ajaran?sekolahId=${sekolah.id}`}
										class="btn btn-soft shadow-none {!canSekolahManage
											? 'pointer-events-none opacity-50'
											: ''}"
										aria-label="Lihat tahun ajaran"
										aria-disabled={!canSekolahManage}
										title={!canSekolahManage
											? 'Anda tidak memiliki izin untuk melihat Tahun Ajaran'
											: ''}
									>
										<Icon name="calendar" />
										<span class="ssm:hidden">TA</span>
										<span class="hidden ssm:inline">Tahun Ajaran</span>
									</a>
									<a
										href={`/sekolah/form?sekolahId=${sekolah.id}`}
										class="btn btn-soft shadow-none {!canSekolahManage
											? 'pointer-events-none opacity-50'
											: ''}"
										aria-label="Edit data sekolah"
										aria-disabled={!canSekolahManage}
										title={!canSekolahManage
											? 'Anda tidak memiliki izin untuk mengedit data sekolah'
											: ''}
									>
										<Icon name="edit" />
										Edit Sekolah
									</a>
								</div>
							</div>
							<button
								type="button"
								class="btn btn-error btn-soft shadow-none order-2 mt-4 md:order-1 md:mt-0"
								aria-label="hapus sekolah"
								onclick={() => openDeleteSekolah(sekolah)}
								disabled={!canSekolahManage}
								aria-disabled={!canSekolahManage}
								title={!canSekolahManage ? 'Anda tidak memiliki izin untuk menghapus sekolah' : ''}
							>
								<Icon name="del" />
								Hapus Sekolah
							</button>
						</div>
					</div>
				</div>
			</div>
		{/each}
	{:else}
		<div class="alert alert-info">Belum ada data sekolah. Tambahkan sekolah untuk memulai.</div>
	{/if}

	<a
		href="/sekolah/form?mode=new"
		class="card bg-base-100 rounded-box border-base-300 hover:bg-base-200 flex min-h-40 border-2 border-dashed transition-colors duration-300"
	>
		<div class="my-auto items-center justify-center text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-base-content/30 mx-auto h-12 w-12"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="1"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
			</svg>
			<p class="text-base-content/50 mt-2">Tambah sekolah baru</p>
		</div>
	</a>
</div>

<DeleteSekolahModal bind:this={deleteModalRef} />
<SekolahModals />
