<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- goto with prebuilt query params is intentional here */
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/icon.svelte';

	type Option = { id: number; nama: string };

	let {
		basePath,
		kelasId,
		muridId,
		mapelId,
		assessmentParam = 'mapel_id',
		muridOptionsInitial = [],
		getDirty = () => false,
		confirmMessage
	}: {
		basePath: string;
		kelasId: number;
		muridId: number;
		mapelId: number;
		assessmentParam?: string;
		muridOptionsInitial?: Option[];
		getDirty?: () => boolean;
		confirmMessage: string;
	} = $props();

	const MAX_OPSI = 80;

	let muridQuery = $state('');
	let daftarTerbuka = $state(false);
	let indeksSorot = $state(-1);
	// svelte-ignore state_referenced_locally
	let muridOptions = $state<Option[]>(muridOptionsInitial);
	let muridLoading = $state(false);

	// Komponen tidak remount antar navigasi route sama — buang cache daftar
	// murid saat kelas/mapel berganti agar filter agama per mapel tetap akurat.
	$effect(() => {
		void kelasId;
		void mapelId;
		muridOptions = muridOptionsInitial;
	});

	async function loadMuridOptions() {
		if (muridOptionsInitial.length) return;
		if (muridOptions.length || muridLoading) return;
		muridLoading = true;
		try {
			const res = await fetch(`/api/murid/daftar?kelas_id=${kelasId}&mapel_id=${mapelId}`);
			if (res.ok) muridOptions = await res.json();
		} finally {
			muridLoading = false;
		}
	}

	const muridTersaring = $derived.by(() => {
		const q = muridQuery.trim().toLowerCase();
		if (!q) return muridOptions;
		return muridOptions.filter((o) => o.nama.toLowerCase().includes(q));
	});

	function sorotGeser(delta: number) {
		const total = Math.min(muridTersaring.length, MAX_OPSI);
		if (total === 0) return;
		indeksSorot = (indeksSorot + delta + total) % total;
		document
			.getElementById(`picker-murid-opsi-${indeksSorot}`)
			?.scrollIntoView({ block: 'nearest' });
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') e.preventDefault();
		if (e.key === 'Escape') {
			daftarTerbuka = false;
			return;
		}
		if (!daftarTerbuka || muridTersaring.length === 0) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			sorotGeser(1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			sorotGeser(-1);
		} else if (e.key === 'Enter' && indeksSorot >= 0) {
			pilihMurid(muridTersaring[Math.min(indeksSorot, muridTersaring.length - 1)]);
		}
	}

	async function pilihMurid(murid: Option) {
		daftarTerbuka = false;
		indeksSorot = -1;
		muridQuery = '';
		if (murid.id === muridId) return;
		if (!getDirty() || confirm(confirmMessage)) {
			await goto(`${basePath}?murid_id=${murid.id}&${assessmentParam}=${mapelId}`, {
				keepFocus: true
			});
		}
	}
</script>

<div class="relative">
	<label class="input bg-base-200 w-full dark:border-none">
		<Icon name="search" />
		<input
			type="search"
			class="w-full grow bg-transparent outline-none"
			placeholder="Ketik nama murid atau pilih di sini"
			autocomplete="off"
			role="combobox"
			aria-expanded={daftarTerbuka}
			aria-controls="daftar-murid-formulir"
			aria-activedescendant={daftarTerbuka && indeksSorot >= 0
				? `picker-murid-opsi-${indeksSorot}`
				: undefined}
			bind:value={muridQuery}
			onfocus={() => {
				void loadMuridOptions();
				daftarTerbuka = true;
				indeksSorot = -1;
			}}
			oninput={() => {
				daftarTerbuka = true;
				indeksSorot = -1;
			}}
			onblur={() => (daftarTerbuka = false)}
			onkeydown={onKeydown}
		/>
	</label>
	{#if daftarTerbuka && muridTersaring.length > 0}
		<ul
			id="daftar-murid-formulir"
			role="listbox"
			class="bg-base-200 absolute z-50 mt-1 max-h-60 w-full list-none overflow-y-auto rounded-box p-1 shadow-lg"
		>
			{#each muridTersaring.slice(0, MAX_OPSI) as opsi, i (opsi.id)}
				<li id={`picker-murid-opsi-${i}`} role="option" aria-selected={i === indeksSorot}>
					<button
						type="button"
						class="w-full truncate rounded px-2 py-1.5 text-left text-sm transition-colors duration-200 hover:bg-base-content/10 {i ===
						indeksSorot
							? 'bg-base-content/10'
							: ''}"
						onmousedown={(e) => e.preventDefault()}
						onclick={() => pilihMurid(opsi)}
					>
						{#if opsi.id === muridId}
							<Icon name="check" class="mr-1.5 inline size-4" />
						{/if}
						{opsi.nama}
					</button>
				</li>
			{/each}
			{#if muridTersaring.length > MAX_OPSI}
				<li class="px-2 py-1 text-sm opacity-60">
					{muridTersaring.length - MAX_OPSI} lainnya. Ketik untuk mempersempit.
				</li>
			{/if}
		</ul>
	{:else if daftarTerbuka && muridLoading}
		<ul
			role="listbox"
			class="bg-base-200 absolute z-50 mt-1 w-full list-none rounded-box p-2 shadow-lg"
		>
			<li class="text-sm opacity-60">Memuat...</li>
		</ul>
	{:else if daftarTerbuka}
		<ul
			role="listbox"
			class="bg-base-200 absolute z-50 mt-1 w-full list-none rounded-box p-2 shadow-lg"
		>
			<li class="text-sm opacity-60">Murid tidak ditemukan.</li>
		</ul>
	{/if}
</div>
