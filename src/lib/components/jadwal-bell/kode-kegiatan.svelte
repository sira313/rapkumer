<script lang="ts">
	import Icon from '$lib/components/icon.svelte';

	const badgeColors = [
		'badge-neutral',
		'badge-primary',
		'badge-secondary',
		'badge-accent',
		'badge-info',
		'badge-success',
		'badge-warning',
		'badge-error'
	];

	let {
		kodeMapelPerKelas = [],
		kodeTambahan,
		kodeKokurikuler,
		kegiatanCustom,
		canManage,
		onHapusKegiatan,
		onEditKegiatan,
		onDrag
	}: {
		kodeMapelPerKelas?: Array<{ kelasId: number; namaKelas: string; kodeMapel: string[] }>;
		kodeTambahan: string[];
		kodeKokurikuler: string[];
		kegiatanCustom: Array<{
			kode: string;
			nama: string;
			durasi: number | null;
			soundFileName?: string | null;
		}>;
		canManage: boolean;
		onHapusKegiatan: (kode: string) => void;
		onEditKegiatan?: (kegiatan: {
			kode: string;
			nama: string;
			durasi: number | null;
			soundFileName?: string | null;
		}) => void;
		onDrag?: () => void;
	} = $props();

	const allKodeMapel = $derived(kodeMapelPerKelas.flatMap((k) => k.kodeMapel));

	let kodeColorMap = $state<Record<string, string>>({});
	$effect(() => {
		void allKodeMapel;
		void kegiatanCustom;
		void kodeKokurikuler;
		const allKodes = [
			...new Set([
				...kodeTambahan,
				...kegiatanCustom.map((k) => k.kode),
				...allKodeMapel,
				...kodeKokurikuler
			])
		].sort();
		const map: Record<string, string> = {};
		allKodes.forEach((kode, i) => {
			if (kode === 'UPB') {
				map[kode] = 'badge-warning';
			} else if (kode === 'IST') {
				map[kode] = 'badge-success';
			} else if (kode === 'PLG') {
				map[kode] = 'badge-error';
			} else {
				map[kode] = badgeColors[i % badgeColors.length];
			}
		});
		kodeColorMap = map;
	});

	function handleDragStart(e: DragEvent, kode: string, kelasId?: number) {
		onDrag?.();
		const dt = e.dataTransfer;
		if (!dt) return;
		dt.setData('text/plain', kode);
		if (kelasId !== undefined) {
			dt.setData('application/x-kelas-id', String(kelasId));
		}
		const el = e.currentTarget as HTMLElement;
		if (el) dt.setDragImage(el, 0, 0);
	}

	let activeTab = $state<string | number>('umum');
</script>

<select
	class="select select-sm dark:bg-base-300 dark:border-none mb-3 w-full"
	bind:value={activeTab}
>
	<option value="umum">Umum</option>
	{#each kodeMapelPerKelas as kelasGroup (kelasGroup.kelasId)}
		<option value={kelasGroup.kelasId}>{kelasGroup.namaKelas}</option>
	{/each}
	{#if kodeKokurikuler.length > 0}
		<option value="ekstra">Ekstra</option>
	{/if}
</select>

{#if activeTab === 'umum'}
	<div class="flex flex-wrap gap-1.5">
		{#each kodeTambahan as kode (kode)}
			<span
				role="button"
				tabindex="-1"
				class="badge {kodeColorMap[kode] ?? 'badge-info'} badge-soft cursor-grab"
				draggable="true"
				ondragstart={(e) => handleDragStart(e, kode)}
			>
				{kode}
			</span>
		{/each}
		{#each kegiatanCustom as kegiatan (kegiatan.kode)}
			<span
				role="button"
				tabindex="-1"
				class="badge {kodeColorMap[kegiatan.kode] ?? 'badge-secondary'} badge-soft cursor-grab"
				draggable="true"
				ondragstart={(e) => handleDragStart(e, kegiatan.kode)}
			>
				{kegiatan.kode}
				{#if canManage}
					<button
						type="button"
						class="btn btn-xs btn-ghost hover:text-info ml-0.5 h-4 w-4 p-0 shadow-none"
						onclick={() => onEditKegiatan?.(kegiatan)}
						aria-label="Edit {kegiatan.kode}"
					>
						<Icon name="edit" class="h-3 w-3" />
					</button>
					<button
						type="button"
						class="btn btn-xs btn-ghost hover:text-error h-4 w-4 p-0 shadow-none"
						onclick={() => onHapusKegiatan(kegiatan.kode)}
						aria-label="Hapus {kegiatan.kode}"
					>
						<Icon name="close-sm" class="h-3 w-3" />
					</button>
				{/if}
			</span>
		{/each}
	</div>
{:else if activeTab === 'ekstra'}
	<div class="flex flex-wrap gap-1.5">
		{#each kodeKokurikuler as kode (kode)}
			<span
				role="button"
				tabindex="-1"
				class="badge {kodeColorMap[kode] ?? 'badge-accent'} badge-soft cursor-grab"
				draggable="true"
				ondragstart={(e) => handleDragStart(e, kode)}
			>
				{kode}
			</span>
		{/each}
	</div>
{:else}
	{#each kodeMapelPerKelas as kelasGroup (kelasGroup.kelasId)}
		{#if activeTab === kelasGroup.kelasId}
			<div class="flex flex-wrap gap-1.5">
				{#each kelasGroup.kodeMapel as kode (kode)}
					<span
						role="button"
						tabindex="-1"
						class="badge {kodeColorMap[kode] ?? 'badge-primary'} badge-soft cursor-grab"
						draggable="true"
						ondragstart={(e) => handleDragStart(e, kode, kelasGroup.kelasId)}
					>
						{kode}
					</span>
				{/each}
			</div>
		{/if}
	{/each}
{/if}
