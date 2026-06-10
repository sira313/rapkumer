<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve, @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any -- file-level: many intentional href/goto usages and loose any/unused vars */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import { autoSubmit, searchQueryMarker } from '$lib/utils';
	import { onDestroy } from 'svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { invalidate } from '$app/navigation';

	import SvelteURLSearchParams from '$lib/svelte-helpers/url-search-params';
	import SumatifBobotModal from '$lib/components/sumatif-bobot-modal.svelte';
	import { downloadTemplateXLSX } from '$lib/excel/template';
	import { showModal } from '$lib/components/global-modal.svelte';
	import AgamaSelectBody from '$lib/components/asesmen-sumatif/AgamaSelectBody.svelte';
	import { agamaVariantOptions, agamaParentName } from '$lib/statics';
	import ImportModalBody from '$lib/components/asesmen-sumatif/ImportModalBody.svelte';

	type MapelOption = { value: string; nama: string };
	type MuridRow = {
		id: number;
		no: number;
		nama: string;
		nilaiAkhir: number | null;
		nilaiAkhirRts: number | null;
		naLingkup: number | null;
		sts: number | null;
		sas: number | null;
		nilaiHref: string | null;
		canNilai: boolean;
	};

	type PageState = {
		search: string | null;
		currentPage: number;
		totalPages: number;
		// totalItems and perPage omitted when not used in this view
	};

	type PageData = {
		mapelList: MapelOption[];
		selectedMapelValue: string | null;
		selectedMapel: { id: number | null; nama: string } | null;
		kelasAktif?: { nama?: string; fase?: string } | null;
		daftarMurid: MuridRow[];
		allowedAgamaForUser?: string | null;
		page: PageState;
	};

	let { data }: { data: PageData } = $props();

	let selectedMapelValue = $state(data.selectedMapelValue ?? '');
	let searchTerm = $state(data.page.search ?? '');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	// Restrict editing for wali_asuh
	const canEdit = $derived.by(() => {
		const u = page.data.user as { type?: string } | null | undefined;
		return u?.type !== 'wali_asuh';
	});

	// Modal / bobot sumatif state
	let showBobotModal = $state(false);
	let bobotLingkup = $state<number>(60);
	let bobotSts = $state<number>(20);
	let bobotSas = $state<number>(20);
	let bobotLingkupRts = $state<number>(70);
	let bobotStsRts = $state<number>(30);
	let bobotLoading = $state(false);
	let bobotSaving = $state(false);
	let bobotError = $state<string | null>(null);

	async function resetBobotToDefault(rapor: string = 'ras') {
		bobotSaving = true;
		bobotError = null;
		try {
			const body =
				rapor === 'rts'
					? { lingkup: 70, sts: 30, rapor: 'rts' }
					: { lingkup: 60, sts: 20, sas: 20 };
			const res = await fetch('/api/sekolah/sumatif-bobot', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const payload = await res.json();
			if (!res.ok) {
				throw new Error(payload?.error ?? 'Gagal mengembalikan ke default.');
			}
			toast(payload?.message ?? 'Bobot dikembalikan ke default.', 'success');
			// update local state
			if (rapor === 'rts') {
				bobotLingkupRts = 70;
				bobotStsRts = 30;
			} else {
				bobotLingkup = 60;
				bobotSts = 20;
				bobotSas = 20;
			}
			bobotError = null;
			showBobotModal = false;
			await invalidate('app:asesmen-sumatif');
			await invalidate('app:asesmen-sumatif/formulir');
		} catch (err) {
			bobotError = String((err as Error)?.message ?? 'Gagal mengembalikan ke default.');
			toast(bobotError, 'error');
		} finally {
			bobotSaving = false;
		}
	}

	// Download template as Excel (.xlsx) — delegated to modular helper in $lib
	async function downloadTemplate() {
		try {
			// Fetch all students in the class (bypass pagination) so the template
			// includes every student, not just the current page.
			const kelasId = (data as any).kelasAktif?.id ?? null;
			let allMurid: { id: number; nama: string }[] | null = null;
			if (kelasId) {
				try {
					const res = await fetch(`/api/murid/daftar?kelas_id=${kelasId}`);
					if (res.ok) allMurid = await res.json();
				} catch (_) {
					// fall back to paginated list below
				}
			}
			const daftarMuridExport = allMurid ?? data.daftarMurid;

			// Determine which mata pelajaran to use
			const mapelIdStr =
				selectedMapelValue ?? data.selectedMapel?.id ?? data.mapelList?.[0]?.value ?? '';
			const mapelId = Number(mapelIdStr);
			let lingkupGroups: { name: string; tpCount: number }[] | undefined = undefined;
			if (Number.isInteger(mapelId) && mapelId > 0) {
				try {
					const res = await fetch(`/api/tujuan-count/${mapelId}`);
					if (res.ok) {
						const json = await res.json();
						if (json?.groups && Array.isArray(json.groups)) {
							lingkupGroups = json.groups.map((g: { name: string; count: number }) => ({
								name: String(g.name ?? ''),
								tpCount: Number(g.count || 0)
							}));
						}
					}
				} catch (_) {
					// ignore and use defaults
				}
			}

			const currentMapelName =
				data.selectedMapel?.nama ?? data.mapelList?.[0]?.nama ?? 'Nama Mata Pelajaran';
			// If the current mapel is the generic agama mapel, prompt to choose specific agama
			if (currentMapelName === agamaParentName) {
				let getter: () => string = () => agamaVariantOptions[0].key;
				showModal({
					title: 'Pilih Agama untuk Template',
					body: AgamaSelectBody,
					bodyProps: {
						setGetter: (fn: () => string) => (getter = fn),
						options: agamaVariantOptions
					},
					onPositive: {
						label: 'Download',
						icon: 'download',
						action: async ({ close }: { close: () => void }) => {
							const chosenKey = getter();
							const chosen =
								agamaVariantOptions.find((o) => o.key === chosenKey) ?? agamaVariantOptions[0];
							close();
							try {
								// Try to resolve a local mapel id for the chosen agama variant so
								// we can fetch accurate lingkup/TP counts from the DB and include
								// the resolved mapel id in the downloaded filename.
								let finalLingkupGroups = lingkupGroups;
								let resolvedMapelId: number | null = null;
								const kelasId = (data as any).kelasAktif?.id ?? null;
								if (kelasId && chosen && chosen.name) {
									try {
										const q = new URLSearchParams({ kelas_id: String(kelasId), name: chosen.name });
										const resResolve = await fetch(`/api/mapel/resolve-by-name?${q.toString()}`);
										if (resResolve.ok) {
											const body = await resResolve.json().catch(() => ({}) as any);
											const resolvedId = Number(body?.mapelId ?? NaN);
											if (Number.isInteger(resolvedId) && resolvedId > 0) {
												resolvedMapelId = resolvedId;
												try {
													const resGroups = await fetch(`/api/tujuan-count/${resolvedId}`);
													if (resGroups.ok) {
														const json = await resGroups.json().catch(() => ({}) as any);
														if (json?.groups && Array.isArray(json.groups)) {
															finalLingkupGroups = json.groups.map(
																(g: { name: string; count: number }) => ({
																	name: String(g.name ?? ''),
																	tpCount: Number(g.count || 0)
																})
															);
														}
													}
												} catch (_) {
													// ignore and fall back to defaults
												}
											}
										}
									} catch (_) {
										// ignore resolve errors
									}
								}
								await downloadTemplateXLSX({
									mapelName: chosen.name,
									kelasName: data.kelasAktif?.nama ?? 'Nama Kelas',
									daftarMurid: daftarMuridExport,
									lingkupGroups: finalLingkupGroups,
									mapelId: resolvedMapelId,
									kelasId: kelasId
								});
							} catch (err) {
								toast('Gagal membuat template: ' + String((err as Error)?.message ?? err), 'error');
							}
						}
					},
					onNegative: { label: 'Batal', icon: 'close' },
					dismissible: true
				});
				return;
			}

			await downloadTemplateXLSX({
				mapelName: currentMapelName,
				kelasName: data.kelasAktif?.nama ?? 'Nama Kelas',
				daftarMurid: daftarMuridExport,
				lingkupGroups,
				mapelId: Number.isInteger(mapelId) && mapelId > 0 ? mapelId : null,
				kelasId: (data as any).kelasAktif?.id ?? null
			});
		} catch (err) {
			toast('Gagal membuat template: ' + String((err as Error)?.message ?? err), 'error');
		}
	}

	async function openImportModal() {
		const currentMapelName =
			data.selectedMapel?.nama ?? data.mapelList?.[0]?.nama ?? 'Nama Mata Pelajaran';

		// If the selected mata pelajaran is the generic agama parent, open the
		// file-import modal and let that modal show the agama select (so we
		// don't use a separate "Pilih Agama untuk Import" modal).
		if (currentMapelName === agamaParentName) {
			openFileImportModal(null, { showAgamaSelect: true, agamaOptions: agamaVariantOptions });
			return;
		}

		// not agama parent — resolve a numeric id when possible
		const mapelIdStr =
			selectedMapelValue ?? data.selectedMapel?.id ?? data.mapelList?.[0]?.value ?? '';
		const mapelId = Number(mapelIdStr);
		openFileImportModal(Number.isInteger(mapelId) && mapelId > 0 ? mapelId : null);
	}

	function openFileImportModal(
		resolvedMapelId: number | null,
		opts?: {
			showAgamaSelect?: boolean;
			agamaOptions?: { key: string; label: string; name: string }[];
		}
	) {
		let uploader: () => File | null = () => null;
		let agamaGetter: () => string = () => agamaVariantOptions[0].key;

		showModal({
			title: 'Import Nilai dari Excel',
			body: ImportModalBody,
			bodyProps: {
				setUploader: (fn: () => File | null) => (uploader = fn),
				// if requested, let the modal expose a getter for chosen agama key
				...(opts?.showAgamaSelect
					? {
							showAgamaSelect: true,
							agamaOptions: opts?.agamaOptions,
							setAgamaGetter: (fn: () => string) => (agamaGetter = fn)
						}
					: {})
			},
			onPositive: {
				label: 'Import',
				icon: 'import',
				action: async ({ close }: { close: () => void }) => {
					const file = uploader();
					if (!file) {
						toast('Pilih file terlebih dahulu.', 'error');
						return;
					}
					try {
						const form = new FormData();
						form.append('file', file);

						let finalMapelId: number | null = resolvedMapelId;

						// if modal had agama selector, resolve chosen agama to a mapel id
						if (opts?.showAgamaSelect) {
							const chosenKey = agamaGetter();
							const chosen =
								(opts?.agamaOptions ?? agamaVariantOptions).find((o) => o.key === chosenKey) ??
								(opts?.agamaOptions ?? agamaVariantOptions)[0];
							const kelasId = (data as any).kelasAktif?.id;
							if (kelasId && chosen && chosen.name) {
								try {
									const q = new URLSearchParams({ kelas_id: String(kelasId), name: chosen.name });
									const resResolve = await fetch(`/api/mapel/resolve-by-name?${q.toString()}`);
									if (resResolve.ok) {
										const body = await resResolve.json().catch(() => ({}) as any);
										const resolvedId = Number(body?.mapelId ?? NaN);
										if (Number.isInteger(resolvedId) && resolvedId > 0) {
											finalMapelId = resolvedId;
										}
									}
								} catch (_) {
									// ignore resolve errors and fall back to selectedMapelValue
								}
							}
						}

						if (finalMapelId != null) form.append('mapel_id', String(finalMapelId));
						else
							form.append('mapel_id', selectedMapelValue ?? String(data.selectedMapel?.id ?? ''));

						const kelasId = (data as any).kelasAktif?.id;
						if (kelasId) form.append('kelas_id', String(kelasId));
						const res = await fetch('/api/asesmen-sumatif/import', { method: 'POST', body: form });
						const json = await res.json().catch(() => ({}) as any);
						if (!res.ok) {
							throw new Error(json?.error ?? 'Gagal mengimpor file.');
						}
						toast(json?.message ?? 'Import selesai.', 'success');
						close();
						await invalidate('app:asesmen-sumatif');
						await invalidate('app:asesmen-sumatif/formulir');
					} catch (err) {
						toast('Gagal mengimpor: ' + String((err as Error)?.message ?? err), 'error');
					}
				}
			},
			onNegative: { label: 'Batal', icon: 'close' },
			dismissible: true
		});
	}

	async function openBobotModal() {
		bobotLoading = true;
		bobotError = null;
		try {
			const res = await fetch('/api/sekolah/sumatif-bobot');
			if (!res.ok) throw new Error('Gagal memuat bobot.');
			const jsonData = await res.json();
			bobotLingkup = Number(jsonData.ras?.lingkup ?? 60);
			bobotSts = Number(jsonData.ras?.sts ?? 20);
			bobotSas = Number(jsonData.ras?.sas ?? 20);
			bobotLingkupRts = Number(jsonData.rts?.lingkup ?? 70);
			bobotStsRts = Number(jsonData.rts?.sts ?? 30);
			showBobotModal = true;
		} catch (err) {
			bobotError = String((err as Error)?.message ?? 'Gagal memuat bobot.');
			toast(bobotError, 'error');
		} finally {
			bobotLoading = false;
		}
	}

	async function saveBobot(event?: CustomEvent) {
		bobotSaving = true;
		bobotError = null;

		const rapor = event?.detail?.rapor ?? 'ras';

		if (rapor === 'rts') {
			const lingkupVal = event?.detail?.lingkup ?? bobotLingkupRts;
			const stsVal = event?.detail?.sts ?? bobotStsRts;

			const total = (Number(lingkupVal) || 0) + (Number(stsVal) || 0);
			if (total !== 100) {
				bobotError = 'Jumlah bobot harus berjumlah 100.';
				bobotSaving = false;
				return;
			}
			try {
				const res = await fetch('/api/sekolah/sumatif-bobot', {
					method: 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						lingkup: Math.round(Number(lingkupVal)),
						sts: Math.round(Number(stsVal)),
						rapor: 'rts'
					})
				});
				const payload = await res.json();
				if (!res.ok) {
					throw new Error(payload?.error ?? 'Gagal menyimpan bobot.');
				}
				toast(payload?.message ?? 'Bobot tersimpan.', 'success');
				bobotLingkupRts = Math.round(Number(lingkupVal));
				bobotStsRts = Math.round(Number(stsVal));
				showBobotModal = false;
				await invalidate('app:asesmen-sumatif');
				await invalidate('app:asesmen-sumatif/formulir');
			} catch (err) {
				bobotError = String((err as Error)?.message ?? 'Gagal menyimpan bobot.');
				toast(bobotError, 'error');
			} finally {
				bobotSaving = false;
			}
			return;
		}

		// RAS default
		const lingkupVal = event?.detail?.lingkup ?? bobotLingkup;
		const stsVal = event?.detail?.sts ?? bobotSts;
		const sasVal = event?.detail?.sas ?? bobotSas;

		const total = (Number(lingkupVal) || 0) + (Number(stsVal) || 0) + (Number(sasVal) || 0);
		if (total !== 100) {
			bobotError = 'Jumlah bobot harus berjumlah 100.';
			bobotSaving = false;
			return;
		}
		try {
			const res = await fetch('/api/sekolah/sumatif-bobot', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					lingkup: Math.round(Number(lingkupVal)),
					sts: Math.round(Number(stsVal)),
					sas: Math.round(Number(sasVal))
				})
			});
			const payload = await res.json();
			if (!res.ok) {
				throw new Error(payload?.error ?? 'Gagal menyimpan bobot.');
			}
			toast(payload?.message ?? 'Bobot tersimpan.', 'success');
			bobotLingkup = Math.round(Number(lingkupVal));
			bobotSts = Math.round(Number(stsVal));
			bobotSas = Math.round(Number(sasVal));
			showBobotModal = false;
			await invalidate('app:asesmen-sumatif');
			await invalidate('app:asesmen-sumatif/formulir');
		} catch (err) {
			bobotError = String((err as Error)?.message ?? 'Gagal menyimpan bobot.');
			toast(bobotError, 'error');
		} finally {
			bobotSaving = false;
		}
	}

	$effect(() => {
		const latestSelected = data.selectedMapelValue ?? '';
		if (selectedMapelValue !== latestSelected) {
			selectedMapelValue = latestSelected;
		}
	});

	$effect(() => {
		if (searchTimer) return;
		const latestSearch = data.page.search ?? '';
		if (searchTerm !== latestSearch) {
			searchTerm = latestSearch;
		}
	});

	const selectedMapelLabel = $derived.by(() => data.selectedMapel?.nama ?? null);
	const kelasAktifLabel = $derived.by(() => data.kelasAktif?.nama ?? null);
	const hasMapel = $derived(data.mapelList.length > 0);
	const currentPage = $derived.by(() => data.page.currentPage ?? 1);
	const totalPages = $derived.by(() => Math.max(1, data.page.totalPages ?? 1));
	const pages = $derived.by(() => Array.from({ length: totalPages }, (_, index) => index + 1));
	const searchActive = $derived(Boolean(data.page.search));
	const hasResults = $derived(data.daftarMurid.length > 0);

	function formatScore(value: number | null) {
		if (value == null || Number.isNaN(value)) return '—';
		return value.toFixed(2);
	}

	function buildSearchUrl(rawValue: string) {
		const params = new SvelteURLSearchParams(page.url.search);
		const cleaned = rawValue.trim();
		const current = params.get('q') ?? '';
		const searchChanged = cleaned !== current;
		if (cleaned) {
			params.set('q', cleaned);
		} else {
			params.delete('q');
		}
		if (searchChanged) {
			params.delete('page');
		}
		const nextQuery = params.toString();
		const nextUrl = `${page.url.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
		const currentUrl = `${page.url.pathname}${page.url.search}`;
		if (nextUrl === currentUrl) {
			return null;
		}
		return nextUrl;
	}

	async function applySearch(rawValue: string) {
		const target = buildSearchUrl(rawValue);
		if (!target) return;
		searchTimer = undefined;
		await goto(target, { replaceState: true, keepFocus: true });
	}

	function buildPageUrl(pageNumber: number) {
		const params = new SvelteURLSearchParams(page.url.search);
		const sanitized = pageNumber < 1 ? 1 : pageNumber;
		if (sanitized <= 1) {
			params.delete('page');
		} else {
			params.set('page', String(sanitized));
		}
		const nextQuery = params.toString();
		const nextUrl = `${page.url.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
		const currentUrl = `${page.url.pathname}${page.url.search}`;
		if (nextUrl === currentUrl) {
			return null;
		}
		return nextUrl;
	}

	async function gotoPageNumber(pageNumber: number) {
		const target = buildPageUrl(pageNumber);
		if (!target) return;
		await goto(target, { replaceState: true, keepFocus: true });
	}

	function handlePageClick(pageNumber: number) {
		if (pageNumber === currentPage) return;
		void gotoPageNumber(pageNumber);
	}

	function handleSearchInput(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		searchTerm = value;
		if (searchTimer) {
			clearTimeout(searchTimer);
		}
		searchTimer = setTimeout(() => {
			searchTimer = undefined;
			void applySearch(value);
		}, 400);
	}

	function submitSearch(event: Event) {
		event.preventDefault();
		if (searchTimer) {
			clearTimeout(searchTimer);
			searchTimer = undefined;
		}
		void applySearch(searchTerm);
	}

	onDestroy(() => {
		if (searchTimer) {
			clearTimeout(searchTimer);
			searchTimer = undefined;
		}
	});
</script>

<div class="card bg-base-100 cursor-default rounded-lg border-none p-4 shadow-md">
	<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
		<div>
			<h2 class="text-xl font-bold">
				Daftar Nilai Sumatif
				{#if selectedMapelLabel}
					- {selectedMapelLabel}
				{/if}
			</h2>

			{#if kelasAktifLabel}
				<p class="text-base-content/70 text-sm">Kelas aktif: {kelasAktifLabel}</p>
			{:else}
				<p class="text-base-content/60 text-sm">
					Pilih kelas di navbar untuk melihat mata pelajaran intrakurikuler.
				</p>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="btn btn-soft shadow-none"
				onclick={openBobotModal}
				disabled={!canEdit}
				title={!canEdit ? 'Anda tidak memiliki izin untuk mengatur bobot' : ''}
			>
				<Icon name="gear" />
				Atur Bobot
			</button>
		</div>
	</div>

	<div class="flex flex-col justify-between gap-2 sm:flex-row sm:flex-wrap">
		<form class="w-full sm:max-w-80 md:max-w-80" method="get" use:autoSubmit>
			<select
				class="select bg-base-200 w-full dark:border-none"
				title="Pilih mata pelajaran"
				name="mapel_id"
				bind:value={selectedMapelValue}
				disabled={!hasMapel}
			>
				{#if !hasMapel}
					<option value="">Belum ada mata pelajaran</option>
				{:else}
					<option value="" disabled selected={selectedMapelValue === ''}>
						Pilih Mata Pelajaran
					</option>
					{#each data.mapelList as mapel (mapel.value)}
						<option value={mapel.value}>{mapel.nama}</option>
					{/each}
				{/if}
			</select>
			{#if searchTerm.trim().length}
				<input type="hidden" name="q" value={searchTerm.trim()} />
			{/if}
		</form>
		<div class="flex flex-col gap-2 sm:flex-row">
			<button
				class="btn btn-soft shadow-none"
				onclick={downloadTemplate}
				disabled={!canEdit}
				title={!canEdit ? 'Anda tidak memiliki izin' : ''}
			>
				<Icon name="download" />
				Download Template
			</button>
			<button
				class="btn btn-soft shadow-none"
				onclick={openImportModal}
				disabled={!canEdit}
				title={!canEdit ? 'Anda tidak memiliki izin' : ''}
			>
				<Icon name="import" />
				Import Nilai
			</button>
		</div>
	</div>

	<form
		class="mt-2 w-full"
		data-sveltekit-keepfocus
		data-sveltekit-replacestate
		onsubmit={submitSearch}
	>
		<label class="input bg-base-200 dark:bg-base-300 w-full dark:border-none">
			<Icon name="search" />
			<input
				type="search"
				name="q"
				value={searchTerm}
				spellcheck="false"
				autocomplete="name"
				placeholder="Cari nama murid..."
				oninput={handleSearchInput}
			/>
		</label>
	</form>

	{#if !hasMapel}
		<div class="alert alert-soft alert-info mt-6">
			<Icon name="info" />
			<span>
				Belum ada mata pelajaran intrakurikuler untuk kelas ini. Tambahkan terlebih dahulu di menu
				<strong>Intrakurikuler</strong>.
			</span>
		</div>
	{:else if !hasResults}
		{#if searchActive}
			<div class="alert alert-soft alert-warning mt-6">
				<Icon name="alert" />
				<span>
					Tidak ditemukan murid dengan kata kunci
					<strong>"{data.page.search}"</strong>. Coba gunakan nama lain atau hapus pencarian.
				</span>
			</div>
		{:else}
			<div class="alert alert-soft alert-warning mt-6">
				<Icon name="alert" />
				<span>
					Belum ada data murid untuk kelas ini. Silakan tambah murid di menu <strong>Murid</strong>.
				</span>
			</div>
		{/if}
	{:else}
		<div
			class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
		>
			<table class="border-base-200 table min-w-140 border dark:border-none">
				<thead>
					<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
						<th style="width: 50px; min-width: 40px;">No</th>
						<th class="min-w-48">Nama</th>
						<th class="min-w-40">Nilai Tengah Semester</th>
						<th class="min-w-40">Nilai Rapor Semester</th>
						<th class="min-w-32">Aksi</th>
					</tr>
				</thead>
				<tbody>
					{#each data.daftarMurid as murid (murid.id)}
						<tr>
							<td>{murid.no}</td>
							<td>{@html searchQueryMarker(data.page.search, murid.nama)}</td>
							<td>
								{#if murid.nilaiAkhirRts != null}
									<p class="font-semibold">{formatScore(murid.nilaiAkhirRts)}</p>
									<div class="text-base-content/70 mt-1 text-xs">
										{#if murid.naLingkup != null}
											<p>Lingkup Materi: {formatScore(murid.naLingkup)}</p>
										{/if}
										{#if murid.sts != null}
											<p>STS: {formatScore(murid.sts)}</p>
										{/if}
									</div>
								{:else}
									<span class="text-base-content/60 text-sm italic">Belum dinilai</span>
								{/if}
							</td>
							<td>
								{#if murid.nilaiAkhir != null}
									<p class="font-semibold">{formatScore(murid.nilaiAkhir)}</p>
									<div class="text-base-content/70 mt-1 text-xs">
										{#if murid.naLingkup != null}
											<p>Lingkup Materi: {formatScore(murid.naLingkup)}</p>
										{/if}
										{#if murid.sts != null}
											<p>STS: {formatScore(murid.sts)}</p>
										{/if}
										{#if murid.sas != null}
											<p>SAS: {formatScore(murid.sas)}</p>
										{/if}
									</div>

									<!-- modal moved to component -->
								{:else}
									<span class="text-base-content/60 text-sm italic">Belum dinilai</span>
								{/if}
							</td>
							<td>
								{#if murid.nilaiHref && murid.canNilai && canEdit}
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- intentional prebuilt href -->
									<a class="btn btn-sm btn-soft shadow-none" href={murid.nilaiHref}>
										<Icon name="edit" />
										Nilai
									</a>
								{:else}
									<button
										type="button"
										class="btn btn-sm btn-disabled"
										disabled
										title={!canEdit
											? 'Anda tidak memiliki izin untuk menilai'
											: murid.canNilai
												? 'Pilih mata pelajaran'
												: data.allowedAgamaForUser
													? `Hanya untuk murid beragama ${data.allowedAgamaForUser}`
													: 'Anda tidak memiliki izin untuk menilai murid ini'}
									>
										<Icon name="edit" />
										Nilai
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="join mt-4 sm:mx-auto">
			{#each pages as pageNumber (pageNumber)}
				<button
					type="button"
					class="join-item btn"
					class:btn-active={pageNumber === currentPage}
					onclick={() => handlePageClick(pageNumber)}
					aria-current={pageNumber === currentPage ? 'page' : undefined}
				>
					{pageNumber}
				</button>
			{/each}
		</div>
	{/if}
</div>

<!-- Sumatif bobot modal moved outside the card to avoid card focus styles -->
<SumatifBobotModal
	open={showBobotModal}
	lingkup={bobotLingkup}
	sts={bobotSts}
	sas={bobotSas}
	lingkupRts={bobotLingkupRts}
	stsRts={bobotStsRts}
	loading={bobotLoading}
	saving={bobotSaving}
	error={bobotError}
	on:close={() => (showBobotModal = false)}
	on:reset={(e) => {
		void resetBobotToDefault(e.detail.rapor);
	}}
	on:save={saveBobot}
/>
