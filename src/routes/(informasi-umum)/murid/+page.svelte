<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- local Set/URLSearchParams use and small navigation helpers */
	import { goto, invalidate, pushState } from '$app/navigation';
	import { page } from '$app/state';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { modalRoute, searchQueryMarker } from '$lib/utils';
	import { onDestroy } from 'svelte';
	import MuridModals from '$lib/components/murid/modals.svelte';

	type BulkModalData = {
		type: 'bulk';
		selectedMurids: {
			id: number;
			nama: string;
			nis: string;
			nisn: string;
		}[];
	};

	let { data } = $props();

	// Restrict editing for wali_asuh and user (guru mapel)
	const canEdit = $derived.by(() => {
		const u = page.data.user as { type?: string } | null | undefined;
		return u?.type !== 'wali_asuh' && u?.type !== 'user';
	});
	let searchTerm = $state(data.page.search ?? '');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	const currentPage = $derived.by(() => data.page.currentPage ?? 1);
	const totalPages = $derived.by(() => Math.max(1, data.page.totalPages ?? 1));
	const pages = $derived.by(() => Array.from({ length: totalPages }, (_, index) => index + 1));

	let selectedIds = $state<Set<number>>(new Set());
	const hasSelection = $derived.by(() => selectedIds.size > 0);
	const semuaDipilih = $derived.by(
		() => data.daftarMurid.length > 0 && selectedIds.size === data.daftarMurid.length
	);
	const selectedMurids = $derived.by(() =>
		data.daftarMurid.filter((murid) => selectedIds.has(murid.id))
	);

	$effect(() => {
		if (searchTimer) return;
		const latestSearchTerm = data.page.search ?? '';
		if (searchTerm !== latestSearchTerm) {
			searchTerm = latestSearchTerm;
		}
	});

	let selectAllCheckbox: HTMLInputElement | null = null;
	let formSubmitting = $state(false);
	let isBulkPhotoUploadOpen = $state(false);
	let dropdownToggle: HTMLButtonElement | null = $state(null);

	function handleSubmittingChange(value: boolean) {
		formSubmitting = value;
	}

	function openBulkPhotoUploadModal() {
		// Close dropdown first with small delay
		if (dropdownToggle) {
			dropdownToggle.blur();
		}
		// Open modal after dropdown closes
		setTimeout(() => {
			isBulkPhotoUploadOpen = true;
		}, 100);
	}

	function toggleSelect(id: number, checked: boolean) {
		const next = new Set(selectedIds);
		if (checked) {
			next.add(id);
		} else {
			next.delete(id);
		}
		selectedIds = next;
	}

	function toggleSelectAll(checked: boolean) {
		if (!data.daftarMurid.length) {
			selectedIds = new Set();
			return;
		}
		selectedIds = checked ? new Set(data.daftarMurid.map((murid) => murid.id)) : new Set<number>();
	}

	function openBulkDeleteModal() {
		if (!hasSelection) return;
		const modalData: BulkModalData = {
			type: 'bulk',
			selectedMurids: selectedMurids.map((murid) => ({
				id: murid.id,
				nama: murid.nama,
				nis: murid.nis,
				nisn: murid.nisn
			}))
		};
		pushState(`${page.url.pathname}${page.url.search}`, {
			modal: {
				name: 'delete-murid',
				data: modalData
			}
		});
	}

	import SvelteURLSearchParams from '$lib/svelte-helpers/url-search-params';

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

	async function gotoPage(pageNumber: number) {
		const target = buildPageUrl(pageNumber);
		if (!target) return;
		await goto(target, { replaceState: true, keepFocus: true });
	}

	function handlePageClick(pageNumber: number) {
		if (pageNumber === currentPage) return;
		void gotoPage(pageNumber);
	}

	function handleSearchInput(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		searchTerm = value;
		if (searchTimer) {
			clearTimeout(searchTimer);
		}
		searchTimer = setTimeout(() => {
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
		}
	});

	function submitBulkDelete(event: Event) {
		event.preventDefault();
		const form = document.getElementById('form-bulk-delete') as HTMLFormElement | null;
		if (!form || formSubmitting) return;
		form.requestSubmit();
	}

	async function handleBulkDeleteSuccess({ data }: { data?: Record<string, unknown> }) {
		const countBefore = selectedIds.size;
		await invalidate('app:murid');
		selectedIds = new Set();
		const message =
			typeof data?.message === 'string'
				? data.message
				: `${countBefore || 1} murid berhasil dihapus`;
		toast({ message, type: 'success', persist: true });
		if (page.state.modal?.name === 'delete-murid') {
			history.back();
		}
	}

	$effect(() => {
		const validIds = new Set(data.daftarMurid.map((murid) => murid.id));
		if (!validIds.size && selectedIds.size) {
			selectedIds = new Set();
			return;
		}
		let changed = false;
		for (const id of selectedIds) {
			if (!validIds.has(id)) {
				changed = true;
				break;
			}
		}
		if (changed) {
			selectedIds = new Set([...selectedIds].filter((id) => validIds.has(id)));
		}
	});

	$effect(() => {
		if (selectAllCheckbox) {
			selectAllCheckbox.indeterminate =
				selectedIds.size > 0 && selectedIds.size < data.daftarMurid.length;
		}
	});

	const academicContext = $derived(data.academicContext ?? null);
	const activeSemester = $derived.by(() => {
		const context = academicContext;
		if (!context?.activeSemesterId) return null;
		for (const tahun of context.tahunAjaranList ?? []) {
			const match = tahun.semester.find((item) => item.id === context.activeSemesterId);
			if (match) {
				return {
					...match,
					tahunAjaranNama: tahun.nama
				};
			}
		}
		return null;
	});

	const kelasAktif = $derived(page.data.kelasAktif ?? null);
	const kelasAktifLabel = $derived.by(() => {
		if (!kelasAktif) return null;
		return kelasAktif.fase ? `${kelasAktif.nama} - ${kelasAktif.fase}` : kelasAktif.nama;
	});

	// Calculate offset for pagination numbering
	const offset = $derived((currentPage - 1) * data.page.perPage);
</script>

{#if academicContext}
	{#if academicContext.activeSemesterId}
		<div class="alert alert-info alert-soft mb-6 flex items-center gap-3">
			<Icon name="info" />
			<span>
				Menampilkan data murid untuk
				{#if activeSemester}
					<strong>{activeSemester.nama}</strong>
					({activeSemester.tahunAjaranNama})
				{:else}
					semester aktif
				{/if}.
			</span>
		</div>
	{:else}
		<div class="alert alert-warning mb-6 flex items-center gap-3">
			<Icon name="warning" />
			<span>Setel semester aktif di menu Rapor untuk mulai mengelola data kelas per periode.</span>
		</div>
	{/if}
{/if}

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<div class="mb-6">
		<div class="flex flex-col sm:flex-row sm:justify-between">
			<div>
				<h2 class="text-xl font-bold">Formulir Dan Tabel Isian Data Murid</h2>
				{#if kelasAktifLabel}
					<p class="text-base-content/80 block text-sm">{kelasAktifLabel}</p>
				{/if}
			</div>
			<!-- Tombol Tambah Manual (dipindahkan ke kanan judul) -->
			{#if hasSelection}
				<button
					class="btn btn-soft btn-error mt-4 shadow-none sm:mt-0"
					type="button"
					disabled={!hasSelection || formSubmitting || !canEdit}
					onclick={openBulkDeleteModal}
					title={!canEdit
						? 'Anda tidak memiliki izin untuk menghapus'
						: hasSelection
							? 'Hapus murid terpilih'
							: 'Pilih murid terlebih dahulu'}
				>
					<Icon name="del" />
					Hapus
				</button>
			{:else}
				<div class="flex flex-row">
					{#if canEdit}
						<a
							class="btn btn-soft mt-4 flex items-center rounded-r-none shadow-none sm:mt-0"
							href="/murid/form"
							use:modalRoute={'add-murid'}
						>
							<Icon name="plus" />
							Tambah Murid
						</a>
					{:else}
						<button
							type="button"
							class="btn btn-disabled mt-4 flex items-center rounded-r-none shadow-none sm:mt-0"
							disabled
							title="Anda tidak memiliki izin untuk menambah murid"
						>
							<Icon name="plus" />
							Tambah Murid
						</button>
					{/if}
					<div class="dropdown dropdown-end">
						<button
							bind:this={dropdownToggle}
							type="button"
							tabindex="0"
							class="btn btn-soft rounded-l-none shadow-none"
						>
							<Icon name="down" />
						</button>
						<ul
							tabindex="-1"
							class="dropdown-content menu bg-base-100 rounded-box border-base-300 z-1 mt-2 w-50 border p-2 shadow-lg"
						>
							<li><a href="/murid/photos">Lihat Semua Foto</a></li>
							{#if canEdit}
								<li>
									<button type="button" onclick={openBulkPhotoUploadModal} class="text-left">
										Upload Semua Foto
									</button>
								</li>
							{/if}
							<li>
								<a href="/api/murid/download-excel" class="text-left"> Download Murid </a>
							</li>
						</ul>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<form
		class="flex flex-col items-center gap-2 sm:flex-row"
		data-sveltekit-keepfocus
		data-sveltekit-replacestate
		onsubmit={submitSearch}
	>
		<!-- Cari nama murid -->
		<label class="input bg-base-200 dark:bg-base-300 w-full dark:border-none">
			<Icon name="search" />
			<input
				type="search"
				name="q"
				value={searchTerm}
				spellcheck="false"
				placeholder="Cari nama murid..."
				autocomplete="name"
				oninput={handleSearchInput}
			/>
		</label>
	</form>

	<FormEnhance
		id="form-bulk-delete"
		action="?/deleteSelected"
		submitStateChange={handleSubmittingChange}
		onsuccess={handleBulkDeleteSuccess}
		showToast={false}
	>
		{#snippet children({ submitting })}
			<div
				class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
			>
				<table class="border-base-200 table border dark:border-none">
					<!-- head -->
					<thead>
						<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
							<th>
								<input
									type="checkbox"
									class="checkbox"
									bind:this={selectAllCheckbox}
									checked={semuaDipilih}
									onchange={(event) => toggleSelectAll(event.currentTarget.checked)}
									aria-label="Pilih semua murid"
									disabled={submitting}
								/>
							</th>
							<th style="width: 50px; min-width: 40px;">No</th>
							<th style="width: 45%;">Nama</th>
							<th>Agama</th>
							<th>Tempat Lahir</th>
							<th>Tanggal Lahir</th>
							<th>Aksi</th>
						</tr>
					</thead>
					<tbody>
						{#each data.daftarMurid as murid, index (murid)}
							<tr>
								<td>
									<input
										type="checkbox"
										class="checkbox"
										name="muridIds"
										value={murid.id}
										checked={selectedIds.has(murid.id)}
										onchange={(event) => toggleSelect(murid.id, event.currentTarget.checked)}
										aria-label={`Pilih ${murid.nama}`}
										disabled={submitting}
									/>
								</td>
								<td>{offset + index + 1}</td>
								<td>{@html searchQueryMarker(data.page.search, murid.nama)}</td>
								<td>{murid.agama}</td>
								<td>{murid.tempatLahir}</td>
								<td>{murid.tanggalLahir}</td>
								<td>
									<div class="flex flex-row">
										<a
											class="btn btn-sm btn-soft rounded-r-none shadow-none pointer-events-auto"
											href="/murid/{murid.id}"
											use:modalRoute={'detail-murid'}
											title="Lihat detail murid"
										>
											<Icon name="eye" />
										</a>

										{#if canEdit}
											<a
												class="btn btn-sm btn-error btn-soft rounded-l-none shadow-none"
												href="/murid/{murid.id}/delete"
												use:modalRoute={'delete-murid'}
												title="Hapus data murid"
											>
												<Icon name="del" />
											</a>
										{:else}
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
								<td class="text-center p-7" colspan="7">
									<em class="opacity-50">Belum ada data murid</em>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/snippet}
	</FormEnhance>
	<!-- pagination -->
	<div class="join mt-4 sm:mx-auto">
		{#each pages as pageNumber (pageNumber)}
			<button
				type="button"
				class="join-item btn pointer-events-auto"
				class:btn-active={pageNumber === currentPage}
				onclick={() => handlePageClick(pageNumber)}
				aria-current={pageNumber === currentPage ? 'page' : undefined}
			>
				{pageNumber}
			</button>
		{/each}
	</div>
</div>

<MuridModals {formSubmitting} {submitBulkDelete} bind:isBulkPhotoUploadOpen />
