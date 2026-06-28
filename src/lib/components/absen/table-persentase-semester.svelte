<script lang="ts">
	let {
		rows,
		tanggalMulai,
		tanggalAkhir,
		totalHariBelajar
	}: {
		rows: Array<{ no: number; nama: string; persentase: number }>;
		tanggalMulai: string;
		tanggalAkhir: string;
		totalHariBelajar: number;
	} = $props();
</script>

<div
	class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
>
	<table class="border-base-200 table border text-xs sm:text-sm dark:border-none">
		<thead>
			<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
				<th class="text-center" style="width: 50px; min-width: 40px;">No</th>
				<th style="min-width: 160px;">Nama</th>
				<th class="text-right" style="min-width: 180px;">
					Persentase Semester
					{#if totalHariBelajar > 0}
						<span class="text-base-content/60 block text-xs font-normal">
							({totalHariBelajar} hari belajar)
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
