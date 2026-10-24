<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- delete page intentionally uses goto for redirect */
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { agamaMapelLabelByName, agamaMapelNames, agamaParentName } from '$lib/statics.js';
	import { jenisMapelLabel } from '$lib/jenis-mapel';

	let { data } = $props();
	let confirmDelete = $state(false);
	const invalidateTargets = ['app:mapel', 'app:mapel_tp-rl', 'app:asesmen-formatif'];
	const AGAMA_MAPEL_NAME_SET = new Set<string>(agamaMapelNames);
	// svelte-ignore state_referenced_locally
	const isAgamaMapel = AGAMA_MAPEL_NAME_SET.has(data.mapel.nama);
	// svelte-ignore state_referenced_locally
	const agamaLabel = agamaMapelLabelByName[data.mapel.nama] ?? '';

	// Fungsi untuk mendapatkan label jenis mapel yang dinamis berdasarkan jenjang
	function getJenisMapelLabel(jenis: string): string {
		return jenisMapelLabel(jenis as MataPelajaran['jenis'], page.data.sekolah);
	}
</script>

<FormEnhance
	action="?/delete"
	onsuccess={async () => {
		await Promise.all(invalidateTargets.map((token) => invalidate(token)));
		if (typeof window !== 'undefined' && window.history?.state?.modal) {
			history.back();
		} else {
			await goto('/intrakurikuler', { replaceState: true });
		}
	}}
>
	{#snippet children({ submitting })}
		<h3 class="mb-4 text-xl font-bold">Hapus data mata pelajaran:</h3>
		<p>Nama: {data.mapel.nama}</p>
		<p>KKM: {data.mapel.kkm}</p>
		<p>Jenis: {getJenisMapelLabel(data.mapel.jenis)}</p>

		{#if isAgamaMapel}
			<div class="alert alert-warning mt-4 items-start gap-3" role="alert">
				<Icon name="warning" />
				<div class="space-y-1 text-sm">
					<p class="font-semibold">Perhatian: mata pelajaran ini memiliki perlakuan khusus.</p>
					<p>
						Terdapat beberapa sub-mata pelajaran Pendidikan Agama
						{#if data.mapel.nama !== agamaParentName && agamaLabel}
							(<strong>{agamaLabel}</strong>)
						{/if}
						yang saling terhubung dengan data agama siswa. Menghapus mata pelajaran ini dapat merusak
						logika nilai dan keterkaitan tersebut.
					</p>
				</div>
			</div>
		{/if}

		<!-- Konfirmasi eksplisit sebelum menghapus -->
		<div class="form-control mt-4">
			<label class="label cursor-pointer gap-3">
				<input
					type="checkbox"
					class="checkbox"
					name="confirm"
					bind:checked={confirmDelete}
					value="1"
				/>
				<span class="label-text text-sm text-wrap"
					>Saya mengerti bahwa menghapus mata pelajaran ini akan menghapus Tujuan Pembelajaran dan
					data terkait.</span
				>
			</label>
		</div>

		<div class="mt-4 flex justify-end gap-2">
			<button class="btn btn-soft shadow-none mr-auto" type="button" onclick={() => history.back()}>
				<Icon name="close" />
				Batal
			</button>

			<button
				class="btn btn-error btn-soft shadow-none"
				type="submit"
				disabled={submitting || !confirmDelete}
			>
				{#if submitting}
					<div class="loading loading-spinner"></div>
				{:else}
					<Icon name="del" />
				{/if}
				Hapus
			</button>
		</div>
	{/snippet}
</FormEnhance>
