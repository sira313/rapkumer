<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- search param helpers and goto usage */
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import BulkFillModal from '$lib/components/catatan-wali/bulk-fill-modal.svelte';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { hideModal, showModal } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { searchQueryMarker } from '$lib/utils';
	import { onDestroy, tick } from 'svelte';

	let { data } = $props();
	let searchTerm = $state(data.page.search ?? '');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	let editingRowId = $state<number | null>(null);
	let editingTextarea = $state<HTMLTextAreaElement | null>(null);
	let editingCatatan = $state('');
	let editingOriginal = $state('');
	let editingSubmitting = $state(false);
	let bulkCatatan = $state('');
	const bulkFormId = 'bulk-catatan-form';

	const currentPage = $derived.by(() => data.page.currentPage ?? 1);
	const totalPages = $derived.by(() => Math.max(1, data.page.totalPages ?? 1));
	const pages = $derived.by(() => Array.from({ length: totalPages }, (_, index) => index + 1));

	const kelasAktif = $derived(page.data.kelasAktif ?? null);
	const kelasAktifLabel = $derived.by(() => {
		if (!kelasAktif) return null;
		return kelasAktif.fase ? `${kelasAktif.nama} - ${kelasAktif.fase}` : kelasAktif.nama;
	});

	// Restrict editing for wali_asuh
	const canEdit = $derived.by(() => {
		const u = page.data.user as { type?: string } | null | undefined;
		return u?.type !== 'wali_asuh';
	});

	const editingSaveDisabled = $derived.by(
		() =>
			editingRowId === null || editingSubmitting || editingCatatan.trim() === editingOriginal.trim()
	);
	const muridIds = $derived.by(() => data.daftarCatatan.map((item) => item.id));
	const bulkTargetCount = $derived.by(() => muridIds.length);
	const muridIdsPayload = $derived.by(() => JSON.stringify(muridIds));

	$effect(() => {
		if (searchTimer) return;
		const latestSearchTerm = data.page.search ?? '';
		if (searchTerm !== latestSearchTerm) {
			searchTerm = latestSearchTerm;
		}
	});

	$effect(() => {
		if (editingRowId === null) return;
		const row = data.daftarCatatan.find((item) => item.id === editingRowId);
		if (!row) {
			cancelEdit();
		}
	});

	$effect(() => {
		if (editingRowId !== null) {
			void tick().then(() => editingTextarea?.focus());
		}
	});

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

	function startEdit(row: { id: number; catatan: string | null }) {
		if (editingRowId === row.id) return;
		editingRowId = row.id;
		editingOriginal = row.catatan ?? '';
		editingCatatan = editingOriginal;
		editingSubmitting = false;
	}

	function cancelEdit() {
		editingRowId = null;
		editingOriginal = '';
		editingCatatan = '';
		editingSubmitting = false;
	}

	async function handleSaveSuccess() {
		cancelEdit();
		await invalidate('app:catatan-wali-kelas');
	}

	function openBulkDialog() {
		if (!bulkTargetCount) {
			toast('Tidak ada murid pada daftar ini.', 'warning');
			return;
		}
		bulkCatatan = '';
		showModal({
			title: 'Isi Catatan Sekaligus',
			body: BulkFillModal,
			bodyProps: {
				formId: bulkFormId,
				muridIdsPayload,
				targetCount: bulkTargetCount,
				catatan: bulkCatatan,
				onCatatanChange: (value: string) => {
					bulkCatatan = value;
				},
				onRequestClose: () => hideModal(),
				onSuccess: async () => {
					await handleBulkSuccess();
				}
			},
			dismissible: true,
			onClose: handleBulkDialogClose
		});
	}

	function handleBulkDialogClose() {
		bulkCatatan = '';
	}

	async function handleBulkSuccess() {
		hideModal();
		await invalidate('app:catatan-wali-kelas');
	}
</script>

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h2 class="text-xl font-bold">Rekapitulasi Catatan Wali Kelas</h2>
			{#if kelasAktifLabel}
				<p class="text-base-content/80 block text-sm">{kelasAktifLabel}</p>
			{/if}
		</div>
		<button
			type="button"
			class="btn btn-primary btn-soft gap-2 self-start shadow-none sm:self-center"
			onclick={openBulkDialog}
			disabled={!bulkTargetCount || editingRowId !== null || !canEdit}
			title={!canEdit
				? 'Anda tidak memiliki izin untuk mengedit'
				: 'Isi catatan yang sama untuk seluruh murid pada halaman ini'}
		>
			<Icon name="copy" />
			<span>Isi Sekaligus</span>
		</button>
	</div>

	<form
		class="flex flex-col items-center gap-2 sm:flex-row"
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
				placeholder="Cari nama murid..."
				autocomplete="name"
				oninput={handleSearchInput}
			/>
		</label>
	</form>

	<div
		class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
	>
		<table class="border-base-200 table min-w-[720px] border dark:border-none">
			<thead>
				<tr class="bg-base-200 dark:bg-base-300 text-left font-bold">
					<th style="width: 60px;">No</th>
					<th style="width: 30%;">Nama</th>
					<th class="w-full">Catatan</th>
					<th style="width: 160px; min-width: 120px;">Aksi</th>
				</tr>
			</thead>
			<tbody>
				{#each data.daftarCatatan as item (item.id)}
					{@const formId = `edit-catatan-form-${item.id}`}
					<tr class={editingRowId === item.id ? 'bg-base-200/40' : undefined}>
						<td class="align-top">{item.no}</td>
						<td class="align-top">{@html searchQueryMarker(data.page.search, item.nama)}</td>
						<td class="align-top">
							{#if editingRowId === item.id}
								<FormEnhance
									id={formId}
									action="?/save"
									submitStateChange={(value) => (editingSubmitting = value)}
									onsuccess={() => {
										void handleSaveSuccess();
									}}
								>
									{#snippet children({ submitting, invalid })}
										<input name="muridId" value={item.id} hidden />
										<label class="flex flex-col gap-2" aria-busy={submitting}>
											<textarea
												bind:this={editingTextarea}
												class="textarea textarea-bordered bg-base-200 dark:bg-base-300 w-full dark:border-none"
												name="catatan"
												rows="4"
												bind:value={editingCatatan}
												placeholder={`Tuliskan catatan untuk ${item.nama}`}
												spellcheck="false"
												aria-invalid={invalid}
											></textarea>
											<small class="text-base-content/60 text-xs">
												Kosongkan catatan dan simpan untuk menghapus.
											</small>
										</label>
									{/snippet}
								</FormEnhance>
							{:else if item.catatan}
								<p class="whitespace-pre-line">{item.catatan}</p>
							{:else}
								<span class="italic opacity-60">Belum ada catatan</span>
							{/if}
						</td>
						<td class="align-top">
							{#if editingRowId === item.id}
								<div class="flex justify-end gap-2">
									<button
										type="button"
										class="btn btn-soft btn-sm btn-error shadow-none"
										onclick={cancelEdit}
										disabled={editingSubmitting}
										title="Batalkan edit catatan"
									>
										<Icon name="close" />
									</button>
									<button
										class="btn btn-sm btn-primary shadow-none"
										form={formId}
										type="submit"
										disabled={editingSaveDisabled}
										title="Simpan catatan"
									>
										{#if editingSubmitting}
											<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
										{/if}
										<Icon name="save" />
									</button>
								</div>
							{:else}
								<div class="flex justify-end">
									<button
										type="button"
										class="btn btn-sm btn-soft shadow-none"
										onclick={() => startEdit(item)}
										disabled={editingRowId !== null || !canEdit}
										title={!canEdit ? 'Anda tidak memiliki izin untuk mengedit' : ''}
									>
										<Icon name="edit" />
										Edit
									</button>
								</div>
							{/if}
						</td>
					</tr>
				{:else}
					<tr>
						<td class="p-7 text-center italic opacity-60" colspan="4"
							>Belum ada murid pada kelas ini</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

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
