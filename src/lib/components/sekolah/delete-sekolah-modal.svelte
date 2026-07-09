<script lang="ts" module>
	export type DeleteSekolahModalHandle = {
		open: (sekolah: import('./types').SekolahCard) => void;
		close: () => void;
	};
</script>

<script lang="ts">
	import { invalidate } from '$app/navigation';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import type { SekolahCard } from './types';

	let dialogEl: HTMLDialogElement | null = null;
	let targetSekolah = $state<SekolahCard | null>(null);
	let purgeAck = $state(false);

	const needsPurgeAck = $derived.by(() => {
		const sekolah = targetSekolah;
		if (!sekolah) return false;
		return (sekolah.jumlahRombel ?? 0) > 0 || (sekolah.jumlahMurid ?? 0) > 0;
	});

	function resetState() {
		targetSekolah = null;
		purgeAck = false;
	}

	export function open(sekolah: SekolahCard) {
		targetSekolah = sekolah;
		purgeAck = false;
		requestAnimationFrame(() => {
			try {
				console.debug('[DeleteSekolahModal] open() called for', sekolah && sekolah.id);
				dialogEl?.showModal();
			} catch (err) {
				// fallback: some envs/browsers may not support dialog.showModal or it may throw
				console.debug('[DeleteSekolahModal] showModal failed, applying fallback', err);
				if (dialogEl) {
					dialogEl.setAttribute('open', '');
					// add modal class on document to mimic dialog show if needed (daisyui uses .modal)
					document.documentElement.classList.add('modal-open');
				}
			}
		});
	}

	export function close() {
		dialogEl?.close();
		resetState();
	}

	async function handleDeleteSuccess() {
		await invalidate('app:sekolah');
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
	{#if targetSekolah}
		{@const sekolah = targetSekolah}
		<div class="modal-box max-h-[85vh] max-w-2xl overflow-hidden p-0 sm:max-h-[90vh] sm:w-full">
			<FormEnhance action="?/delete" onsuccess={handleDeleteSuccess}>
				{#snippet children({ submitting })}
					<input type="hidden" name="sekolahId" value={sekolah.id} />
					<div class="flex max-h-[85vh] flex-col sm:max-h-[90vh]">
						<header class="border-base-300 bg-base-100 shrink-0 border-b p-4">
							<div class="flex items-start gap-3">
								<span
									class="bg-error/10 text-error flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
									aria-hidden="true"
								>
									<Icon name="warning" class="text-xl" />
								</span>
								<div>
									<h3 class="text-xl font-bold">Hapus data sekolah?</h3>
									<p class="text-base-content/70 text-sm">
										Anda akan menghapus <b>{sekolah.nama}</b> dari daftar sekolah secara permanen.
									</p>
								</div>
							</div>
						</header>
						<section class="flex-1 overflow-y-auto p-4">
							<div class="space-y-4">
								<div class="grid gap-3 sm:grid-cols-2">
									<div
										class="bg-base-200/70 dark:bg-base-300/60 border-base-300/60 rounded-lg border p-3"
									>
										<p class="text-base-content/60 text-xs font-semibold tracking-wide uppercase">
											Total Rombel
										</p>
										<p class="text-base-content text-lg font-bold">{sekolah.jumlahRombel}</p>
									</div>
									<div
										class="bg-base-200/70 dark:bg-base-300/60 border-base-300/60 rounded-lg border p-3"
									>
										<p class="text-base-content/60 text-xs font-semibold tracking-wide uppercase">
											Total Murid
										</p>
										<p class="text-base-content text-lg font-bold">{sekolah.jumlahMurid}</p>
									</div>
								</div>

								{#if needsPurgeAck}
									<div class="alert alert-warning">
										<Icon name="warning" />
										<span>
											Sekolah masih memiliki rombel atau murid. Anda dapat menghapus semuanya
											sekaligus dengan opsi di bawah.
										</span>
									</div>
									<div
										class="bg-base-200/70 dark:bg-base-300/60 border-base-300/60 text-base-content/70 space-y-3 rounded-lg border p-4 text-sm"
									>
										<p>Centang persetujuan untuk menghapus seluruh data berikut secara permanen:</p>
										<ul class="ml-5 list-disc space-y-1">
											<li>
												Semua rombel dan mata pelajaran, termasuk Pendidikan Agama dan Budi Pekerti
											</li>
											<li>Tujuan pembelajaran, ekstrakurikuler, dan kokurikuler</li>
											<li>Seluruh murid beserta data pendukungnya</li>
											<li>Tahun ajaran aktif dan riwayat tugas terkait sekolah</li>
											<li>
												Kepala sekolah dan wali kelas (pegawai) yang tidak digunakan di sekolah lain
											</li>
											<li>
												Data orang tua/wali murid serta alamat sekolah dan alamat murid yang hanya
												dimiliki sekolah ini
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
											<span>
												Saya paham tindakan ini tidak dapat dibatalkan dan ingin menghapus seluruh
												data sekolah.
											</span>
										</label>
									</div>
								{:else}
									<p class="text-base-content/70 text-sm">
										Tindakan ini akan menghapus data sekolah secara permanen, termasuk kepala
										sekolah, wali kelas, alamat terkait, serta data orang tua/wali murid yang masih
										terhubung.
									</p>
								{/if}
							</div>
						</section>
						<footer class="border-base-300 bg-base-100 shrink-0 border-t p-4">
							<div class="modal-action">
								<button
									type="button"
									class="btn btn-ghost shadow-none sm:w-auto"
									onclick={close}
									disabled={submitting}
								>
									<Icon name="close" />
									Batal
								</button>
								<button
									type="submit"
									class="btn btn-error btn-soft shadow-none sm:w-auto"
									disabled={submitting || (needsPurgeAck && !purgeAck)}
								>
									{#if submitting}
										<span class="loading loading-spinner" aria-hidden="true"></span>
										<span class="sr-only">Menghapus sekolah...</span>
									{:else}
										<Icon name="del" />
									{/if}
									Hapus Sekolah
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
