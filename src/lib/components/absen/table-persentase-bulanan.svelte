<script lang="ts">
	let {
		rows,
		namaBulan,
		totalHariBelajar,
		jenisPresensi = 'wali_kelas_saja',
		tipePresensi = '',
		totalPertemuan = 0
	}: {
		rows: Array<{
			no: number;
			nama: string;
			persentase: number;
			hadir: number;
			sakit: number;
			izin: number;
			alfa: number;
		}>;
		namaBulan: string;
		totalHariBelajar: number;
		jenisPresensi?: string;
		tipePresensi?: string;
		totalPertemuan?: number;
	} = $props();

	const totalPresensi = $derived(
		jenisPresensi === 'wali_kelas_saja' && tipePresensi === 'masuk_pulang'
			? totalHariBelajar * 2
			: null
	);
</script>

<div
	class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
>
	<table class="border-base-200 table border text-xs sm:text-sm dark:border-none">
		<thead>
			<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
				<th class="text-center" style="width: 50px; min-width: 40px;">No</th>
				<th class="w-full" style="min-width: 160px;">Nama</th>
				<th class="text-right" style="width: 50px; min-width: 40px;">H</th>
				<th class="text-right" style="width: 50px; min-width: 40px;">S</th>
				<th class="text-right" style="width: 50px; min-width: 40px;">I</th>
				<th class="text-right" style="width: 50px; min-width: 40px;">TK</th>
				<th class="text-right" style="min-width: 180px;">
					Persentase bulan {namaBulan}
					{#if totalHariBelajar > 0}
						<span class="text-base-content/60 block text-xs font-normal">
							({totalHariBelajar} hari belajar{jenisPresensi === 'tiap_mapel' && totalPertemuan > 0
								? ` ${totalPertemuan} ${tipePresensi === 'awal_akhir_mapel' ? 'presensi' : 'mapel'}`
								: totalPresensi != null
									? ` ${totalPresensi} presensi`
									: ''})
						</span>
					{/if}
				</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.no)}
				<tr>
					<td class="text-center">{row.no}</td>
					<td>{row.nama}</td>
					<td class="text-right">{row.hadir || ''}</td>
					<td class="text-right">{row.sakit || ''}</td>
					<td class="text-right">{row.izin || ''}</td>
					<td class="text-right">{row.alfa || ''}</td>
					<td class="text-right">
						{#if row.persentase >= 80}
							<span class="text-success font-bold">{row.persentase}%</span>
						{:else if row.persentase >= 60}
							<span class="text-warning font-bold">{row.persentase}%</span>
						{:else}
							<span class="text-error font-bold">{row.persentase}%</span>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
