<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import ImportMatevDialog from '$lib/components/keasramaan/import-matev-dialog.svelte';
	import MataEvaluasiDisplay from '$lib/components/keasramaan/MataEvaluasiDisplay.svelte';

	interface MataEvaluasi {
		id: number;
		nama: string;
		indikator: Array<{
			id: number;
			deskripsi: string;
		}>;
	}

	let { data } = $props<{ data: Record<string, unknown> }>();

	const mataEvaluasi = $derived((data.mataEvaluasi as MataEvaluasi[]) ?? []);
	const tableReady = $derived((data.tableReady as boolean) ?? true);
	const kelasAktif = $derived(
		data.kelasAktif as { id: number; nama: string; fase?: string } | null
	);

	const kelasLabel = $derived(
		kelasAktif
			? kelasAktif.fase
				? `${kelasAktif.nama} - ${kelasAktif.fase}`
				: kelasAktif.nama
			: '-'
	);

	const canEdit = $derived.by(() => {
		const u = page.data.user as { type?: string } | null | undefined;
		return u?.type !== 'user';
	});

	// eslint-disable-next-line svelte/no-navigation-without-resolve
	const navigateToMatEval = () => {
		if (!canEdit) return;
		goto('/keasramaan/mata-evaluasi');
	};

	const handleExport = async () => {
		if (!canEdit) return;
		try {
			const response = await fetch('/api/keasramaan/export', {
				method: 'POST'
			});

			if (!response.ok) {
				const errorData = await response.json();
				const message = errorData?.fail || 'Gagal mengekspor data';
				alert(message);
				return;
			}

			// Create blob and download
			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;

			// Extract filename from Content-Disposition header
			const contentDisposition = response.headers.get('Content-Disposition');
			let filename = 'Mata-Evaluasi-Keasramaan.xlsx';
			if (contentDisposition) {
				const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
				if (filenameMatch && filenameMatch[1]) {
					filename = filenameMatch[1];
				}
			}

			a.download = filename;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);
		} catch (error) {
			console.error('Export error:', error);
			alert('Terjadi kesalahan saat mengekspor data');
		}
	};
</script>

<div class="alert alert-info alert-soft mb-4 flex items-center gap-2 text-sm">
	<Icon name="info" />
	<span> Halaman ini khusus sekolah yang memiliki program keasramaan. </span>
</div>

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<!-- Judul dan tombol -->
	<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
		<!-- Judul -->
		<div>
			<h2 class="text-xl font-bold">Daftar Nilai Keasramaan</h2>
			<p class="text-base-content/70 text-sm">Kelas aktif: {kelasLabel}</p>
		</div>
		<!-- Tombol untuk mengelola mata evaluasi -->
		<div class="flex flex-row max-sm:w-full">
			<button
				type="button"
				class="btn btn-soft rounded-r-none shadow-none max-sm:flex-1"
				title="Kelola mata evaluasi keasramaan"
				disabled={!canEdit}
				onclick={navigateToMatEval}
			>
				<Icon name="edit" />
				Kelola Mata Evaluasi
			</button>
			<div class="dropdown dropdown-end">
				<button
					title="Export dan Import keasramaan"
					type="button"
					tabindex="0"
					class="btn btn-soft rounded-l-none shadow-none"
					disabled={!canEdit}
					aria-disabled={!canEdit}
				>
					<Icon name="down" />
				</button>
				<ul
					tabindex="-1"
					class="border-base-300 dropdown-content menu bg-base-100 z-50 mt-2 w-48 rounded-md border p-2 shadow-lg"
				>
					<li>
						<button
							type="button"
							class="w-full text-left"
							disabled={!canEdit}
							aria-disabled={!canEdit}
							onclick={() =>
								showModal({
									title: 'Impor Matev',
									body: ImportMatevDialog,
									dismissible: true
								})}
						>
							<Icon name="import" />
							Impor Matev
						</button>
					</li>
					<li>
						<button
							type="button"
							class="w-full text-left"
							disabled={!canEdit}
							aria-disabled={!canEdit}
							onclick={handleExport}
						>
							<Icon name="export" />
							Ekspor Matev
						</button>
					</li>
				</ul>
			</div>
		</div>
	</div>

	{#if !tableReady}
		<div class="alert border-error/60 bg-error/10 text-error-content mt-4 border border-dashed">
			<Icon name="warning" />
			<span>
				Database keasramaan belum siap. Jalankan <code>pnpm db:push</code> untuk menerapkan migrasi terbaru.
			</span>
		</div>
	{/if}

	<!-- Daftar Mata Evaluasi dengan Tabel Individual -->
	<MataEvaluasiDisplay {mataEvaluasi} {tableReady} {canEdit} />
</div>
