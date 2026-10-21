<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- halaman statis, link untuk navigasi pengguna */
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import { groupedUserPermissions } from '../pengguna/permissions';

	// Key yang bukan permission, melainkan pembatas scope/role.
	const scopeLabels: Record<string, string> = {
		kelas_id: 'Kelas yang Anda ampu',
		mapel_id: 'Mata pelajaran yang Anda ampu',
		admin: 'Hanya admin sekolah',
		'admin/kepala_sekolah': 'Hanya admin atau kepala sekolah'
	};

	const permissionLabels = new Map<string, string>(
		Object.entries(groupedUserPermissions).flatMap(([group, { values }]) =>
			values.map((value) => [`${group}_${value[0]}`, value[1]] as [string, string])
		)
	);

	const required = $derived(
		(page.url.searchParams.get('required') ?? '')
			.split(',')
			.map((p) => p.trim())
			.filter(Boolean)
	);

	const needed = $derived([
		...new Set(required.map((key) => scopeLabels[key] ?? permissionLabels.get(key) ?? key))
	]);

	function goBack() {
		if (history.length > 1) history.back();
		else location.href = '/';
	}
</script>

<div class="flex items-center justify-center">
	<div class="card bg-base-100 w-full max-w-none shadow-md">
		<div class="card-body items-center text-center">
			<Icon name="lock" class="text-warning h-10 w-10" />

			<h1 class="text-2xl font-bold">Akses ditolak</h1>
			<p class="text-base-content/70 max-w-md text-sm">
				Akun Anda belum punya izin untuk membuka halaman ini.
			</p>

			{#if needed.length}
				<div class="bg-base-200 rounded-box mt-2 w-full px-4 py-3 text-left">
					<p class="text-sm font-semibold">Izin yang dibutuhkan</p>
					<ul class="mt-2 flex flex-wrap gap-2">
						{#each needed as item (item)}
							<li><span class="badge badge-soft badge-warning">{item}</span></li>
						{/each}
					</ul>
				</div>
			{/if}

			<p class="text-base-content/70 text-sm">
				Minta admin sekolah membuka izin ini di halaman Pengguna. Setelah izin masuk, buka lagi
				halaman tersebut.
			</p>

			<div class="card-actions mt-2 justify-center gap-3">
				<button type="button" class="btn btn-soft shadow-none" onclick={goBack}>Kembali</button>
				<a href="/" class="btn btn-primary shadow-none">Ke Dashboard</a>
			</div>
		</div>
	</div>
</div>
