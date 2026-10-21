<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- search & pagination use replaceState navigation */
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import { searchQueryMarker } from '$lib/utils';
	import { toast } from '$lib/components/toast.svelte';
	import { onDestroy } from 'svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import DinasLuarFormModal from '$lib/components/dinas-luar/dinas-luar-form-modal.svelte';
	import DinasLuarDetailBody from '$lib/components/dinas-luar/dinas-luar-detail-body.svelte';
	import DinasLuarDetailDisetujuiBody from '$lib/components/dinas-luar/dinas-luar-detail-disetujui-body.svelte';
	import DinasLuarBuktiModal from '$lib/components/dinas-luar/dinas-luar-bukti-modal.svelte';
	import SvelteURLSearchParams from '$lib/svelte-helpers/url-search-params';

	import type { DinasLuarItem, DinasLuarPermohonanRow, SppdDisetujuiRow } from './+page.server';

	type PageState = {
		search: string | null;
		currentPage: number;
		totalPages: number;
		totalItems: number;
	};

	type PageData = {
		daftarItem: DinasLuarItem[];
		page: PageState;
		permohonanCount: number;
		disetujuiCount: number;
	};

	let { data }: { data: PageData } = $props();

	const currentPage = $derived.by(() => data.page?.currentPage ?? 1);
	const totalPages = $derived.by(() => Math.max(1, data.page?.totalPages ?? 1));
	const pages = $derived.by(() => Array.from({ length: totalPages }, (_, index) => index + 1));

	// svelte-ignore state_referenced_locally
	let searchTerm = $state(data.page.search ?? '');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if (searchTimer) return;
		const latestSearchTerm = data.page.search ?? '';
		if (searchTerm !== latestSearchTerm) {
			searchTerm = latestSearchTerm;
		}
	});

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
		}
		searchTimer = undefined;
		void applySearch(searchTerm);
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

	function formatTanggalShort(value: string | null | undefined): string {
		if (!value) return '';
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return value;
		return d.toLocaleDateString('id-ID', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function escapeHtml(value: string | null | undefined): string {
		if (!value) return '';
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	function openTambahModal() {
		showModal({
			title: 'Permohonan Perjalanan Dinas',
			body: DinasLuarFormModal,
			dismissible: true
		});
	}

	function viewDetail(permohonan: DinasLuarPermohonanRow) {
		showModal({
			title: 'Detail Perjalanan Dinas',
			body: DinasLuarDetailBody,
			bodyProps: { permohonan },
			dismissible: true,
			onNeutral: { label: 'Tutup' }
		});
	}

	function viewDisetujui(sppd: SppdDisetujuiRow) {
		const hasBukti = sppd.bukti.length > 0;
		showModal({
			title: 'Detail Dinas Luar',
			body: DinasLuarDetailDisetujuiBody,
			bodyProps: { sppd },
			dismissible: true,
			spreadActions: true,
			onPositive: {
				label: hasBukti ? 'Edit Bukti' : 'Unggah Bukti',
				icon: 'download',
				class: 'btn-primary',
				action: () => openBuktiUpload(sppd)
			},
			...(hasBukti
				? {
						onExtra: {
							label: 'Cetak Gabungan',
							icon: 'print',
							class: 'btn-primary btn-soft',
							href: `/api/dinas-luar/bukti/cetak?sppdId=${sppd.id}`
						}
					}
				: {}),
			onNeutral: { label: 'Tutup' }
		});
	}

	function openBuktiUpload(sppd: SppdDisetujuiRow) {
		showModal({
			title: 'Edit Bukti Perjalanan Dinas',
			body: DinasLuarBuktiModal,
			bodyProps: { sppdId: sppd.id, existing: sppd.bukti },
			dismissible: true
		});
	}

	async function handleDelete(permohonan: DinasLuarPermohonanRow) {
		showModal({
			title: 'Hapus Data Permohonan Perjalanan Dinas',
			body: `Hapus permohonan perjalanan dinas <strong>${escapeHtml(
				permohonan.maksud
			)}</strong>? Tindakan ini tidak dapat dibatalkan.`,
			dismissible: false,
			onPositive: {
				label: 'Hapus',
				class: 'btn-error',
				action: async ({ close }) => {
					try {
						const res = await fetch(`/api/dinas-luar?id=${permohonan.id}`, {
							method: 'DELETE'
						});
						if (res.ok) {
							toast('Permohonan perjalanan dinas berhasil dihapus', 'success');
							await invalidate('app:dinas-luar');
						} else {
							toast('Gagal menghapus data', 'error');
						}
					} catch {
						toast('Terjadi kesalahan', 'error');
					}
					close();
				}
			},
			onNegative: { label: 'Batal' }
		});
	}

	onDestroy(() => {
		if (searchTimer) {
			clearTimeout(searchTimer);
		}
		searchTimer = undefined;
	});

	const hasData = $derived(data.permohonanCount > 0 || data.disetujuiCount > 0);
	const hasFiltered = $derived(data.page.totalItems > 0);
</script>

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<div class="mb-4 flex items-start justify-between">
		<div>
			<h2 class="text-xl font-bold">Dinas Luar</h2>
			<p class="text-base-content/80 block text-sm">
				{data.permohonanCount} pengajuan, {data.disetujuiCount} perjalanan dinas disetujui
			</p>
		</div>
		<button
			type="button"
			class="btn btn-primary btn-soft shadow-none"
			onclick={openTambahModal}
			title="Tambah permohonan perjalanan dinas"
		>
			<Icon name="plus" />
			Ajukan Permohonan
		</button>
	</div>

	<form
		class="flex flex-col gap-2 sm:flex-row"
		data-sveltekit-keepfocus
		data-sveltekit-replacestate
		autocomplete="off"
		spellcheck="false"
		onsubmit={submitSearch}
	>
		<label class="input bg-base-200 dark:bg-base-300 w-full dark:border-none">
			<Icon name="search" />
			<input
				type="search"
				name="q"
				value={searchTerm}
				placeholder="Cari maksud perjalanan dinas..."
				oninput={handleSearchInput}
				autocomplete="off"
			/>
		</label>
	</form>

	{#if !hasData}
		<div class="alert alert-soft alert-warning mt-6">
			<Icon name="alert" />
			<span>Belum ada data dinas luar.</span>
		</div>
	{:else if !hasFiltered}
		<div class="alert alert-soft alert-info mt-6">
			<Icon name="info" />
			<span>Tidak ada data yang cocok dengan pencarian.</span>
		</div>
	{:else}
		<div
			class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
		>
			<table class="border-base-200 table border dark:border-none">
				<thead>
					<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
						<th style="width: 50px; min-width: 40px;">No</th>
						<th style="min-width: 110px;">Status</th>
						<th style="min-width: 110px;">Tanggal</th>
						<th style="min-width: 180px;">Nama Lengkap</th>
						<th class="text-center" style="min-width: 70px;">Jumlah</th>
						<th style="min-width: 200px;">Keterangan</th>
						<th class="text-center" style="min-width: 100px;">Aksi</th>
					</tr>
				</thead>
				<tbody>
					{#each data.daftarItem as item (item.status === 'pengajuan' ? `p-${item.permohonan.id}` : `s-${item.sppd.id}`)}
						<tr>
							<td>{item.no}</td>
							<td>
								{#if item.status === 'pengajuan'}
									<span class="badge badge-soft badge-warning">Pengajuan</span>
								{:else}
									<span class="badge badge-soft badge-success">Disetujui</span>
								{/if}
							</td>
							<td class="whitespace-nowrap">{formatTanggalShort(item.tanggal)}</td>
							<td class="whitespace-nowrap">{item.nama}</td>
							<td class="text-center">{item.jumlah}</td>
							<td class="max-w-60 truncate">
								{@html searchQueryMarker(data.page.search, item.maksud)}
							</td>
							<td class="text-center">
								<div class="flex items-center justify-center gap-1">
									{#if item.status === 'pengajuan'}
										<button
											type="button"
											class="btn btn-primary btn-soft btn-sm shadow-none"
											onclick={() => viewDetail(item.permohonan)}
											title="Lihat detail"
										>
											<Icon name="eye" />
										</button>
										<button
											type="button"
											class="btn btn-error btn-soft btn-sm shadow-none"
											onclick={() => handleDelete(item.permohonan)}
											title="Hapus"
										>
											<Icon name="del" />
										</button>
									{:else}
										<button
											type="button"
											class="btn btn-primary btn-soft btn-sm shadow-none"
											onclick={() => viewDisetujui(item.sppd)}
											title="Lihat detail dinas luar"
										>
											<Icon name="eye" />
										</button>
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="join mx-auto mt-4">
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
	{/if}
</div>
