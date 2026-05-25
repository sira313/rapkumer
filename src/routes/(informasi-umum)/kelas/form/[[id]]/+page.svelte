<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- small page-level navigation patterns handled intentionally */
	import { goto, invalidate } from '$app/navigation';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';

	let { data } = $props();
	const disableAcademic = $derived.by(
		() => !data.academicLock?.tahunAjaranId || !data.academicLock?.semesterId
	);
	const tahunAjaranLabel = $derived.by(() => data.academicLock?.tahunAjaranLabel ?? 'Belum diatur');
	const semesterLabel = $derived.by(() => data.academicLock?.semesterLabel ?? 'Belum diatur');
</script>

<FormEnhance
	action="?/save"
	init={data.formInit}
	onsuccess={async () => {
		await goto('/kelas');
		await invalidate('app:kelas');
	}}
>
	{#snippet children({ submitting })}
		<div class="card bg-base-100 mx-auto rounded-lg p-4 shadow-md">
			<h2 class="mb-4 text-xl font-bold">Formulir Isian Data Kelas</h2>
			{#if disableAcademic}
				<div class="alert alert-warning mb-4 flex items-center gap-3">
					<Icon name="warning" />
					<span>
						Atur tahun ajaran dan semester aktif melalui menu Rapor sebelum membuat atau mengubah
						data kelas.
					</span>
				</div>
			{:else}
				<div class="alert alert-info mb-4 flex items-center gap-3">
					<Icon name="info" />
					<div class="leading-tight">
						<p>
							<span class="font-semibold">Tahun ajaran aktif:</span>
							{tahunAjaranLabel}
						</p>
						<p>
							<span class="font-semibold">Semester aktif:</span>
							{semesterLabel}
						</p>
					</div>
				</div>
			{/if}
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<!-- Nama Rombel -->
				<div class="fieldset">
					<legend class="fieldset-legend">Nama Rombel</legend>
					<input
						required
						type="text"
						class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
						placeholder="Contoh: VI (Kelas 6)"
						name="rombel"
					/>
				</div>

				<!-- Fase -->
				<div class="fieldset">
					<legend class="fieldset-legend">Fase</legend>
					<select
						class="select bg-base-200 dark:bg-base-300 w-full dark:border-none"
						title="Pilih tingkat pendidikan"
						name="fase"
						disabled={!data.tingkatOptions?.length}
					>
						<option value="" disabled selected>Pilih fase</option>
						{#each data.tingkatOptions ?? [] as option (option.fase)}
							<option value={option.fase}>{option.label}</option>
						{:else}
							<option value="" disabled>
								Atur data sekolah terlebih dahulu untuk memilih fase
							</option>
						{/each}
					</select>
				</div>

				<!-- Wali Kelas -->
				<div class="fieldset">
					<legend class="fieldset-legend">Wali Kelas</legend>
					<input
						type="text"
						class="input validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
						placeholder="Contoh: Damian Wayne, Bat"
						name="waliKelas.nama"
					/>
					<span>Khusus sekolah dengan program keasramaan.</span>
				</div>

				<!-- NIP Wali Kelas -->
				<div class="fieldset">
					<legend class="fieldset-legend">NIP Wali Kelas</legend>
					<input
						type="text"
						class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
						placeholder="Contoh: NIP 19940505 201803 1 008"
						name="waliKelas.nip"
					/>
					<span> Biarkan kosong jika wali kelas tidak memiliki NIP. </span>
				</div>

				<!-- Wali Asrama -->
				<div class="fieldset">
					<legend class="fieldset-legend"
						>Wali Asrama <span class="text-xs text-gray-500">(Opsional)</span></legend
					>
					<input
						type="text"
						class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
						placeholder="Contoh: Ahmad Rahman"
						name="waliAsrama.nama"
					/>
				</div>

				<!-- NIP Wali Asrama -->
				<div class="fieldset">
					<legend class="fieldset-legend"
						>NIP Wali Asrama <span class="text-xs text-gray-500">(Opsional)</span></legend
					>
					<input
						type="text"
						class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
						placeholder="Contoh: NIP 19940505 201803 1 008"
						name="waliAsrama.nip"
					/>
					<span> Biarkan kosong jika tidak ada wali asrama atau tidak memiliki NIP. </span>
				</div>
			</div>
			<div class="mt-6 flex justify-between gap-2">
				<a class="btn btn-soft shadow-none" href="/kelas" aria-label="kembali">
					<Icon name="left" />
					Kembali
				</a>
				<button
					class="btn shadow-none {data.kelas?.id ? 'btn-secondary' : 'btn-primary'}"
					disabled={submitting || disableAcademic}
				>
					{#if submitting}
						<div class="loading loading-spinner"></div>
					{:else if data.kelas?.id}
						<Icon name="edit" />
						Update
					{:else}
						<Icon name="plus" />
						Tambah
					{/if}
				</button>
			</div>
		</div>
	{/snippet}
</FormEnhance>
