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
		kodeMapel,
		kodeTambahan,
		kodeKokurikuler,
		kegiatanCustom,
		canManage,
		onHapusKegiatan,
		onEditKegiatan,
		onDrag
	}: {
		kodeMapel: string[];
		kodeTambahan: string[];
		kodeKokurikuler: string[];
		kegiatanCustom: Array<{ kode: string; nama: string; durasi: number | null }>;
		canManage: boolean;
		onHapusKegiatan: (kode: string) => void;
		onEditKegiatan?: (kegiatan: { kode: string; nama: string; durasi: number | null }) => void;
		onDrag?: () => void;
	} = $props();

	let kodeColorMap = $state<Record<string, string>>({});
	$effect(() => {
		void kodeMapel;
		void kegiatanCustom;
		void kodeKokurikuler;
		const allKodes = [
			...new Set([
				...kodeTambahan,
				...kegiatanCustom.map((k) => k.kode),
				...kodeMapel,
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

	function handleDragStart(e: DragEvent, kode: string) {
		onDrag?.();
		const dt = e.dataTransfer;
		if (!dt) return;
		dt.setData('text/plain', kode);
		const el = e.currentTarget as HTMLElement;
		if (el) dt.setDragImage(el, 0, 0);
	}
</script>

<div class="flex flex-wrap gap-1.5">
	{#each kodeMapel as kode (kode)}
		<span
			role="button"
			tabindex="-1"
			class="badge {kodeColorMap[kode] ?? 'badge-primary'} badge-soft cursor-grab"
			draggable="true"
			ondragstart={(e) => handleDragStart(e, kode)}
		>
			{kode}
		</span>
	{/each}
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
