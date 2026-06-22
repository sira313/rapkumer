<script lang="ts">
	import { searchQueryMarker } from '$lib/utils';

	type StatusPerDay = '' | 'H' | 'S' | 'I' | 'TK';

	type BulananRow = {
		no: number;
		nama: string;
		statusPerDay: StatusPerDay[];
		countS: number;
		countI: number;
		countTK: number;
		countHadir: number;
	};

	let {
		rows,
		daysInMonth,
		redDays,
		search
	}: {
		rows: BulananRow[];
		daysInMonth: number;
		redDays: number[];
		search: string | null;
	} = $props();
</script>

<div
	class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
>
	<table class="border-base-200 table border text-xs sm:text-sm dark:border-none">
		<thead>
			<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
				<th
					class="bg-base-200 dark:bg-base-300 sticky left-0 z-10 text-center"
					style="width: 40px; min-width: 36px;">No</th
				>
				<th class="bg-base-200 dark:bg-base-300 sticky left-[40px] z-10" style="min-width: 140px;"
					>Nama</th
				>
				{#each Array(daysInMonth) as _, i}
					{@const isRed = redDays.includes(i + 1)}
					<th class="text-center {isRed ? 'text-error' : ''}" style="width: 30px; min-width: 26px;"
						>{i + 1}</th
					>
				{/each}
				<th class="text-center" style="width: 34px; min-width: 30px;">S</th>
				<th class="text-center" style="width: 34px; min-width: 30px;">I</th>
				<th class="text-center" style="width: 34px; min-width: 30px;">TK</th>
				<th class="text-center" style="width: 38px; min-width: 34px;">JLH</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.no)}
				<tr class="hover:bg-base-200/30">
					<td class="bg-base-100 dark:bg-base-200 sticky left-0 z-10 text-center">{row.no}</td>
					<td class="bg-base-100 dark:bg-base-200 sticky left-[40px] z-10"
						>{@html searchQueryMarker(search, row.nama)}</td
					>
					{#each row.statusPerDay as status, i}
						{@const isRed = redDays.includes(i + 1)}
						<td class="text-center font-mono {isRed ? 'bg-error/5' : ''}">
							{#if status === 'H'}
								<span class="text-success font-bold">{status}</span>
							{:else if status === 'S'}
								<span class="text-warning font-bold">{status}</span>
							{:else if status === 'I'}
								<span class="text-info font-bold">{status}</span>
							{:else if status === 'TK'}
								<span class="text-error font-bold">{status}</span>
							{:else}
								<span class="text-base-content/20">-</span>
							{/if}
						</td>
					{/each}
					<td class="text-center font-bold">{row.countS || ''}</td>
					<td class="text-center font-bold">{row.countI || ''}</td>
					<td class="text-center font-bold">{row.countTK || ''}</td>
					<td class="text-center font-bold">{row.countHadir || ''}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
