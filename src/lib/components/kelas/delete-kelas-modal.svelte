<script lang="ts">
	import { invalidate } from '$app/navigation';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import type { KelasCard } from './types';

	let dialogEl: HTMLDialogElement | null = null;
	let targetKelas = $state<KelasCard | null>(null);
	let purgeAck = $state(false);

	const needsPurgeAck = $derived.by(() => {
		const kelas = targetKelas;
		if (!kelas) return false;
		return (
			(kelas.jumlahMurid ?? 0) > 0 ||
			(kelas.jumlahMapel ?? 0) > 0 ||
			(kelas.jumlahEkstrakurikuler ?? 0) > 0 ||
			(kelas.jumlahKokurikuler ?? 0) > 0 ||
			Boolean(kelas.waliKelas)
		);
	});

	function resetState() {
		targetKelas = null;
		purgeAck = false;
	}

	export function open(kelas: KelasCard) {
		targetKelas = kelas;
		purgeAck = false;
		requestAnimationFrame(() => dialogEl?.showModal());
	}

	export function close() {
		dialogEl?.close();
		resetState();
	}

	async function handleDeleteSuccess() {
		await invalidate('app:kelas');
		close();
	}
</script>

<dialog
	class="modal"
	bind:this={dialogEl}
	aria-modal="true"
	role="alertdialog"
	onclose={resetState}
>
	{#if targetKelas}
		{@const kelas = targetKelas as KelasCard}
		<div class="modal-box max-h-[85vh] w-full max-w-2xl overflow-hidden p-0 sm:max-h-[90vh]">
			<FormEnhance action="?/delete" onsuccess={handleDeleteSuccess}>
				{#snippet children({ submitting })}
					<input name="id" value={kelas.id} hidden />
					<div class="flex max-h-[85vh] flex-col sm:max-h-[90vh]">
						<header class="border-base-300 bg-base-100 shrink-0 border-b p-4">
							<div class="flex items-start gap-3">
								<span
									class="bg-error/10 text-error flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
									aria-hidden="true"
								>
									<Icon name="warning" class="text-xl" />
								</span>
								<div class="flex flex-col gap-1">
									<h3 class="text-xl font-bold">Hapus kelas?</h3>
									<p class="text-base-content/70 text-sm">
										Yakin ingin menghapus kelas <span class="font-semibold">{kelas.nama}</span> dari daftar
										rombel?
									</p>
								</div>
							</div>
						</header>
						<section class="flex-1 overflow-y-auto p-4">
							<div class="space-y-4">
								<div class="space-y-1 text-sm">
									<p class="text-base font-semibold">{kelas.nama}</p>
									<p>Fase: {kelas.fase ?? '-'}</p>
									<p>Tahun Ajaran: {kelas.tahunAjaran?.nama ?? '-'}</p>
									<p>Semester: {kelas.semester?.nama ?? '-'}</p>
								</div>

								<div class="grid gap-3 sm:grid-cols-2">
									<div
										class="bg-base-200/70 dark:bg-base-300/60 border-base-300/60 rounded-lg border p-3"
									>
										<p class="text-base-content/60 text-xs font-semibold tracking-wide uppercase">
											Jumlah Murid
										</p>
										<p class="text-base-content text-lg font-bold">{kelas.jumlahMurid}</p>
									</div>
									<div
										class="bg-base-200/70 dark:bg-base-300/60 border-base-300/60 rounded-lg border p-3"
									>
										<p class="text-base-content/60 text-xs font-semibold tracking-wide uppercase">
											Mata Pelajaran
										</p>
										<p class="text-base-content text-lg font-bold">{kelas.jumlahMapel}</p>
									</div>
									<div
										class="bg-base-200/70 dark:bg-base-300/60 border-base-300/60 rounded-lg border p-3"
									>
										<p class="text-base-content/60 text-xs font-semibold tracking-wide uppercase">
											Ekstrakurikuler
										</p>
										<p class="text-base-content text-lg font-bold">{kelas.jumlahEkstrakurikuler}</p>
									</div>
									<div
										class="bg-base-200/70 dark:bg-base-300/60 border-base-300/60 rounded-lg border p-3"
									>
										<p class="text-base-content/60 text-xs font-semibold tracking-wide uppercase">
											Kokurikuler
										</p>
										<p class="text-base-content text-lg font-bold">{kelas.jumlahKokurikuler}</p>
									</div>
								</div>

								{#if needsPurgeAck}
									<div class="alert alert-warning">
										<Icon name="warning" />
										<span>
											Kelas masih memiliki relasi data. Centang persetujuan untuk menghapus seluruh
											data berikut secara permanen.
										</span>
									</div>
									<div
										class="bg-base-200/70 dark:bg-base-300/60 border-base-300/60 text-base-content/70 space-y-3 rounded-lg border p-4 text-sm"
									>
										<ul class="ml-5 list-disc space-y-1">
											<li>Seluruh murid dalam kelas</li>
											<li>Semua mata pelajaran termasuk Pendidikan Agama dan Budi Pekerti</li>
											<li>Tujuan pembelajaran, ekstrakurikuler, dan kokurikuler</li>
											<li>Wali kelas (pegawai) jika tidak digunakan di kelas atau sekolah lain</li>
											<li>
												Data orang tua/wali murid beserta alamat yang hanya dimiliki kelas ini
											</li>
										</ul>
										<label class="bg-error/5 text-error flex items-start gap-3 rounded-lg p-3">
											<input
												type="checkbox"
												class="checkbox checkbox-error mt-1"
												name="forceDelete"
												value="true"
												bind:checked={purgeAck}
												required
											/>
											<span
												>Saya paham tindakan ini tidak dapat dibatalkan dan ingin menghapus seluruh
												data tersebut secara permanen.</span
											>
										</label>
									</div>
								{:else}
									<p class="text-base-content/70 text-sm">
										Tindakan ini akan menghapus data kelas secara permanen, termasuk wali kelas,
										data orang tua/wali murid, serta alamat yang hanya dimiliki kelas ini.
									</p>
								{/if}
							</div>
						</section>
						<footer class="border-base-300 bg-base-100 shrink-0 border-t p-4">
							<div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
								<button class="btn btn-soft shadow-none sm:w-auto" type="button" onclick={close}>
									Batal
								</button>
								<button
									class="btn btn-error btn-soft shadow-none sm:w-auto"
									disabled={submitting || (needsPurgeAck && !purgeAck)}
								>
									{#if submitting}
										<div class="loading loading-spinner"></div>
									{:else}
										<Icon name="del" />
									{/if}
									Hapus
								</button>
							</div>
						</footer>
					</div>
				{/snippet}
			</FormEnhance>
		</div>
		<form method="dialog" class="modal-backdrop">
			<button>close</button>
		</form>
	{/if}
</dialog>
