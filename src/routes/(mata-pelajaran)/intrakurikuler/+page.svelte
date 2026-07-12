<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- many navigation links built from data */
	import { page } from '$app/state';
	import { invalidate } from '$app/navigation';
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/icon.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import ImportMapelDialog from '$lib/components/intrakurikuler/import-mapel-dialog.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import {
		agamaMapelLabelByName,
		agamaMapelNames,
		agamaParentName,
		pksMapelLabelByName,
		pksMapelNames,
		pksParentName
	} from '$lib/statics';
	import { modalRoute } from '$lib/utils';
	import IntrakurikulerModals from '$lib/components/intrakurikuler/modals.svelte';

	type MapelWithIndicator = MataPelajaran & { tpCount: number; editTpMapelId?: number };
	let { data }: { data: { mapel: Record<string, MapelWithIndicator[]> } } = $props();

	const emptyStateMessage = 'Belum ada data mata pelajaran';
	const agamaMapelNameSet = new Set<string>(agamaMapelNames);
	const pksMapelNameSet = new Set<string>(pksMapelNames);

	const kelasAktifLabel = $derived.by(() => {
		const kelas = page.data.kelasAktif ?? null;
		if (!kelas) return null;
		return kelas.fase ? `${kelas.nama} - ${kelas.fase}` : kelas.nama;
	});

	const hasKelasAktif = $derived.by(() => !!page.data.kelasAktif);
	// server-provided small permission flag: if false, UI for managing
	// mata pelajaran should be disabled for this client (role 'user').
	const canManageMapel = $derived.by(() => {
		const u = page.data.user as { canManageMapel?: boolean } | null | undefined;
		// default to true for backwards compatibility
		return u?.canManageMapel ?? true;
	});

	// Dapatkan jenjang varian dari sekolah (misalnya 'SMK')
	const jenjangVariant = $derived.by(() => {
		const sekolah = page.data.sekolah as { jenjangVariant?: string | null } | null | undefined;
		return sekolah?.jenjangVariant ?? null;
	});

	// Fungsi khusus untuk jenjang SMK: ubah label "Wajib" menjadi "Umum"
	function getWajibLabel(): string {
		return jenjangVariant?.toUpperCase() === 'SMK' ? 'Umum' : 'Wajib';
	}

	// Fungsi untuk mengecek apakah section kejuruan harus ditampilkan (hanya untuk SMK)
	function shouldShowKejuruan(): boolean {
		return jenjangVariant?.toUpperCase() === 'SMK';
	}

	// Fungsi untuk mengecek apakah section pemberdayaan harus ditampilkan (hanya untuk PKBM)
	function shouldShowPemberdayaan(): boolean {
		return jenjangVariant?.toUpperCase() === 'PKBM';
	}

	const totalMapel = $derived.by(
		() =>
			data.mapel.daftarWajib.length +
			data.mapel.daftarPilihan.length +
			data.mapel.daftarMulok.length +
			(shouldShowKejuruan() ? data.mapel.daftarKejuruan.length : 0) +
			(shouldShowPemberdayaan() ? data.mapel.daftarPemberdayaan.length : 0)
	);

	function formatKkm(kkm: number | null | undefined) {
		return typeof kkm === 'number' && Number.isFinite(kkm) ? kkm : '—';
	}

	function handleDeleteClick(event: MouseEvent, mapel: Pick<MataPelajaran, 'nama'>) {
		if (event.defaultPrevented) return;
		if (event.shiftKey || event.metaKey || event.ctrlKey || event.button === 1) return;

		const isAgama = agamaMapelNameSet.has(mapel.nama);
		const isPks = pksMapelNameSet.has(mapel.nama);

		if (!isAgama && !isPks) return;

		let message = '';
		if (isAgama) {
			const label = agamaMapelLabelByName[mapel.nama];
			message =
				mapel.nama === agamaParentName
					? `Menghapus "<b>${mapel.nama}</b>" akan menghapus seluruh varian Pendidikan Agama dan Budi Pekerti pada kelas ini.`
					: `Menghapus "<b>${mapel.nama}</b>" akan menghapus varian Pendidikan Agama <b>${label}</b> beserta seluruh penilaian terkait.`;
		} else if (isPks) {
			const label = pksMapelLabelByName[mapel.nama];
			message =
				mapel.nama === pksParentName
					? `Menghapus "<b>${mapel.nama}</b>" akan menghapus seluruh varian Pendalaman Kitab Suci pada kelas ini.`
					: `Menghapus "<b>${mapel.nama}</b>" akan menghapus varian PKS <b>${label}</b> beserta seluruh penilaian terkait.`;
		}

		if (message) {
			toast({ message, type: 'warning', persist: true });
		}
	}
</script>

<div class="card bg-base-100 rounded-box border border-none p-4 shadow-md">
	<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h2 class="text-xl font-bold">Daftar Mata Pelajaran Intrakurikuler</h2>
			{#if kelasAktifLabel}
				<p class="text-base-content/70 text-sm">Kelas aktif: {kelasAktifLabel}</p>
			{:else}
				<p class="text-base-content/60 text-sm">
					Pilih kelas di navbar untuk melihat mata pelajaran intrakurikuler.
				</p>
			{/if}
		</div>
		<div class="mt-2 flex max-sm:w-full sm:mt-0">
			<a
				class={`btn btn-soft rounded-r-none shadow-none max-sm:flex-1 ${!canManageMapel ? 'pointer-events-none opacity-50' : ''}`}
				href={canManageMapel ? '/intrakurikuler/form' : '#'}
				use:modalRoute={canManageMapel ? 'add-mapel' : ''}
				aria-disabled={!canManageMapel}
			>
				<Icon name="plus" />
				Tambah Mapel
			</a>

			<!-- dropdown yang tergabung (perhatikan join-item dan hilangkan margin m-1) -->
			<div class="dropdown dropdown-end">
				<!-- trigger: gunakan button bertipe btn supaya tampil seperti item lain -->
				<button
					title="Export dan Import mata pelajaran"
					type="button"
					tabindex="0"
					class={`btn btn-soft rounded-l-none shadow-none ${!canManageMapel ? 'opacity-50' : ''}`}
					disabled={!canManageMapel}
					aria-disabled={!canManageMapel}
				>
					<Icon name="down" />
				</button>

				<!-- menu dropdown -->
				<ul
					tabindex="-1"
					class="dropdown-content menu bg-base-100 border-base-300 z-50 mt-2 w-49 rounded-md border p-2 shadow-lg"
				>
					<li>
						<button
							type="button"
							class={`w-full text-left ${!canManageMapel ? 'pointer-events-none opacity-50' : ''}`}
							disabled={!canManageMapel}
							aria-disabled={!canManageMapel}
							onclick={() =>
								showModal({
									title: 'Impor Mata Pelajaran',
									body: ImportMapelDialog,
									dismissible: true
								})}
						>
							<Icon name="import" />
							Impor Mapel
						</button>
					</li>
					<li>
						<button
							type="button"
							class={`w-full text-left ${!canManageMapel ? 'pointer-events-none opacity-50' : ''}`}
							disabled={!canManageMapel}
							aria-disabled={!canManageMapel}
							onclick={async () => {
								try {
									const resp = await fetch('/intrakurikuler/export_mapel', { method: 'GET' });
									if (!resp.ok) {
										const body = await resp.json().catch(() => ({}));
										return toast({
											message: body?.fail || 'Gagal mengekspor data.',
											type: 'error'
										});
									}
									const blob = await resp.blob();
									const url = URL.createObjectURL(blob);
									// prefer filename from Content-Disposition header set by server
									let filename = `mapel-${new Date().toISOString().slice(0, 10)}.xlsx`;
									try {
										const cd =
											resp.headers.get('content-disposition') ||
											resp.headers.get('Content-Disposition');
										if (cd) {
											// match filename*=UTF-8''encoded or filename="name"
											const mStar = cd.match(/filename\*=UTF-8''([^;\n\r]+)/i);
											const mBasic = cd.match(/filename="?([^";]+)"?/i);
											if (mStar && mStar[1]) filename = decodeURIComponent(mStar[1]);
											else if (mBasic && mBasic[1]) filename = mBasic[1];
										}
									} catch {
										/* ignore and fallback */
									}
									const a = document.createElement('a');
									a.href = url;
									a.download = filename;
									document.body.appendChild(a);
									a.click();
									a.remove();
									URL.revokeObjectURL(url);
								} catch (err) {
									console.error(err);
									toast({ message: 'Terjadi kesalahan saat mengekspor.', type: 'error' });
								}
							}}
						>
							<Icon name="export" />
							Ekspor Mapel
						</button>
					</li>
					<li>
						<form
							method="POST"
							action="?/tambah_pks"
							class="w-full"
							use:enhance={() => {
								toast({ message: 'Menambahkan mata pelajaran PKS...', type: 'info' });
								return async ({ result }) => {
									if (result.type === 'success') {
										await Promise.all([
											invalidate('app:mapel'),
											invalidate('app:asesmen-formatif')
										]);
										const data = result.data as { success?: string } | undefined;
										toast({
											message: data?.success || 'Mata pelajaran PKS berhasil ditambahkan.',
											type: 'success'
										});
									} else if (result.type === 'failure') {
										const data = result.data as { fail?: string } | undefined;
										toast({
											message: data?.fail || 'Gagal menambahkan mata pelajaran PKS.',
											type: 'error'
										});
									}
								};
							}}
						>
							<button
								type="submit"
								class={`flex w-full items-center gap-2 ${!canManageMapel || !hasKelasAktif ? 'pointer-events-none opacity-50' : ''}`}
								disabled={!canManageMapel || !hasKelasAktif}
								aria-disabled={!canManageMapel || !hasKelasAktif}
							>
								<Icon name="plus" />
								<span>Tambah PKS</span>
							</button>
						</form>
					</li>
				</ul>
			</div>
		</div>
	</div>

	<div
		class="stats stats-horizontal border-base-200 bg-base-100 dark:bg-base-200 text-base-content mt-4 w-full border shadow-md dark:shadow-none"
	>
		<div class="stat place-items-start">
			<div class="stat-title">Mapel {getWajibLabel()}</div>
			<div class="stat-value text-2xl">{data.mapel.daftarWajib.length}</div>
		</div>
		<div class="stat place-items-start">
			<div class="stat-title">Mapel Pilihan</div>
			<div class="stat-value text-2xl">{data.mapel.daftarPilihan.length}</div>
		</div>
		<div class="stat place-items-start">
			<div class="stat-title">Muatan Lokal</div>
			<div class="stat-value text-2xl">{data.mapel.daftarMulok.length}</div>
		</div>
		{#if shouldShowKejuruan()}
			<div class="stat place-items-start">
				<div class="stat-title">Kejuruan</div>
				<div class="stat-value text-2xl">{data.mapel.daftarKejuruan.length}</div>
			</div>
		{/if}
		{#if shouldShowPemberdayaan()}
			<div class="stat place-items-start">
				<div class="stat-title">Pemberdayaan & Keterampilan</div>
				<div class="stat-value text-2xl">{data.mapel.daftarPemberdayaan.length}</div>
			</div>
		{/if}
		<div class="stat place-items-start">
			<div class="stat-title">Total Mapel</div>
			<div class="stat-value text-2xl">{totalMapel}</div>
		</div>
	</div>

	{#if !hasKelasAktif}
		<div
			class="alert border-warning/60 bg-warning/10 text-warning-content mt-6 border border-dashed"
		>
			<Icon name="info" />
			<span>Pilih kelas aktif agar daftar mata pelajaran dapat ditampilkan.</span>
		</div>
	{/if}

	{#if hasKelasAktif && totalMapel === 0}
		<div class="alert border-info/60 bg-info/10 mt-6 border border-dashed">
			<Icon name="info" />
			<span
				>Belum ada data mata pelajaran untuk kelas ini. Gunakan tombol &ldquo;Tambah Mata
				Pelajaran&rdquo; di atas.</span
			>
		</div>
	{/if}

	{#each [{ key: 'wajib', title: `Mata Pelajaran ${getWajibLabel()}`, items: data.mapel.daftarWajib }, { key: 'pilihan', title: 'Mata Pelajaran Pilihan', items: data.mapel.daftarPilihan }, { key: 'mulok', title: 'Muatan Lokal', items: data.mapel.daftarMulok }, ...(shouldShowKejuruan() ? [{ key: 'kejuruan', title: 'Mata Pelajaran Kejuruan', items: data.mapel.daftarKejuruan }] : []), ...(shouldShowPemberdayaan() ? [{ key: 'pemberdayaan', title: 'Muatan Pemberdayaan dan Keterampilan', items: data.mapel.daftarPemberdayaan }] : [])] as section (section.key)}
		<fieldset class="fieldset mt-8">
			<legend class="fieldset-legend">{section.title}</legend>
			<div
				class="bg-base-100 dark:bg-base-200 overflow-x-auto rounded-md shadow-md dark:shadow-none"
			>
				<table class="border-base-200 table border dark:border-none">
					<thead>
						<tr class="bg-base-200 dark:bg-base-300 text-left font-bold">
							<th style="width: 60px;">No</th>
							<th style="min-width: 240px;">Mata Pelajaran</th>
							<th style="width: 120px;">Kode</th>
							<th style="width: 100px;">KKM</th>
							<th style="width: 180px;">Tujuan Pembelajaran</th>
							<th>Aksi</th>
						</tr>
					</thead>
					<tbody>
						{#each section.items as mapel, index (mapel.id)}
							<tr>
								<td>{index + 1}</td>
								<td class="font-medium">{mapel.nama}</td>
								<td class="font-mono text-sm"
									>{mapel.kode ?? (mapel.nama === agamaParentName ? 'PAPB' : '—')}</td
								>
								<td>{formatKkm(mapel.kkm)}</td>
								<td>
									<div class="indicator">
										<span
											class="indicator-item indicator-end badge badge-xs"
											class:badge-success={mapel.tpCount > 0}
											class:badge-error={mapel.tpCount === 0}
											aria-label={`Status tujuan pembelajaran: ${
												mapel.tpCount > 0 ? 'sudah terisi' : 'belum terisi'
											}`}
											role="status"
										></span>
										{#if canManageMapel}
											<a
												class="btn btn-sm btn-soft shadow-none"
												href={`/intrakurikuler/${mapel.editTpMapelId ?? mapel.id}/tp-rl`}
											>
												<Icon name="edit" />
												Edit TP
											</a>
										{:else}
											<button
												type="button"
												class="btn btn-sm btn-disabled shadow-none"
												disabled
												title="Anda tidak memiliki izin untuk mengedit"
											>
												<Icon name="edit" />
												Edit TP
											</button>
										{/if}
									</div>
								</td>
								<td>
									<div class="flex flex-row">
										{#if canManageMapel}
											<a
												class="btn btn-sm btn-soft rounded-r-none shadow-none"
												href={`/intrakurikuler/${mapel.id}/edit`}
												title="Edit data mata pelajaran"
												use:modalRoute={'edit-mapel'}
											>
												<Icon name="edit" />
											</a>
											<a
												class="btn btn-sm btn-error btn-soft rounded-l-none shadow-none"
												href={`/intrakurikuler/${mapel.id}/delete`}
												title="Hapus mata pelajaran"
												use:modalRoute={'delete-mapel'}
												onclick={(event) => handleDeleteClick(event, mapel)}
											>
												<Icon name="del" />
											</a>
										{:else}
											<button
												type="button"
												class="btn btn-sm btn-disabled rounded-r-none shadow-none"
												disabled
												title="Anda tidak memiliki izin untuk mengedit"
											>
												<Icon name="edit" />
											</button>
											<button
												type="button"
												class="btn btn-sm btn-disabled rounded-l-none shadow-none"
												disabled
												title="Anda tidak memiliki izin untuk menghapus"
											>
												<Icon name="del" />
											</button>
										{/if}
									</div>
								</td>
							</tr>
						{:else}
							<tr>
								<td class="py-6 text-center italic opacity-60" colspan="6">{emptyStateMessage}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</fieldset>
	{/each}
</div>

<IntrakurikulerModals />
