<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import type { NilaiAkhirCategory } from './types';

	interface Props {
		title?: string;
		nilaiAkhir: number | null;
		nilaiAkhirCategory: NilaiAkhirCategory | null;
		kkm: number;
		formatScore: (value: number | null) => string;
		// optional sekolah-level weights (sas optional for RTS display)
		sumatifWeights?: { lingkup: number; sts: number; sas?: number };
	}

	let {
		title = 'Nilai Rapor Semester',
		nilaiAkhir,
		nilaiAkhirCategory,
		kkm,
		formatScore,
		sumatifWeights
	}: Props = $props();

	const fallbackClass = 'alert-soft alert-warning';
</script>

<div
	class={`alert rounded-box ${nilaiAkhirCategory ? nilaiAkhirCategory.className : fallbackClass} mt-6`}
>
	<span class="text-2xl">
		<Icon name={nilaiAkhirCategory ? nilaiAkhirCategory.icon : 'alert'} />
	</span>
	<span>
		<p class="text-lg">{title}</p>
		<p class="text-2xl font-bold">{formatScore(nilaiAkhir)}</p>
		<p class="text-sm">
			{#if sumatifWeights}
				Pembobotan default — Lingkup Materi {sumatifWeights.lingkup}%, STS {sumatifWeights.sts}%{sumatifWeights.sas !=
				null
					? `, SAS ${sumatifWeights.sas}%`
					: ''} (komponen kosong diabaikan)
			{:else}
				Rata-rata dari NA Sumatif Lingkup Materi dan NA Sumatif Akhir Semester
			{/if}
		</p>
		<p class="text-sm font-semibold">
			KKM {kkm}
			{#if nilaiAkhir == null}
				— Lengkapi penilaian untuk menghitung nilai akhir
			{:else}
				— {nilaiAkhirCategory?.label}
			{/if}
		</p>
		{#if nilaiAkhirCategory}
			<p class="text-sm">{nilaiAkhirCategory.description}</p>
		{/if}
	</span>
</div>
