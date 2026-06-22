<script lang="ts">
	import Icon from '$lib/components/icon.svelte';

	type PersentaseHarianSubject = {
		kodeKegiatan: string;
		label: string;
	};

	type PersentaseHarianRow = {
		no: number;
		muridId: number;
		nama: string;
		subjects: Record<string, string>;
		persentase: number;
	};

	let {
		subjects,
		rows
	}: {
		subjects: PersentaseHarianSubject[];
		rows: PersentaseHarianRow[];
	} = $props();
</script>

{#if subjects.length === 0}
	<div class="alert alert-soft alert-warning mt-6">
		<Icon name="alert" />
		<span
			>Tidak ada jadwal pelajaran untuk hari ini. Persentase kehadiran per mapel tidak tersedia.</span
		>
	</div>
{:else}
	<div
		class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
	>
		<table class="border-base-200 table border text-xs sm:text-sm dark:border-none">
			<thead>
				<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
					<th class="text-center" style="width: 50px; min-width: 40px;">No</th>
					<th style="min-width: 160px;">Nama</th>
					{#each subjects as subject (subject.kodeKegiatan)}
						<th class="text-center" style="min-width: 80px;">{subject.label}</th>
					{/each}
					<th class="text-center" style="min-width: 100px;">%</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.muridId)}
					<tr>
						<td class="text-center">{row.no}</td>
						<td>{row.nama}</td>
						{#each subjects as subject (subject.kodeKegiatan)}
							{@const status = row.subjects[subject.kodeKegiatan] ?? ''}
							<td class="text-center">
								{#if status === 'H'}
									<span class="text-success font-bold">H</span>
								{:else if status === 'S'}
									<span class="text-warning font-bold">S</span>
								{:else if status === 'I'}
									<span class="text-info font-bold">I</span>
								{:else if status === 'TK'}
									<span class="text-error font-bold">TK</span>
								{:else}
									<span class="text-base-content/40">-</span>
								{/if}
							</td>
						{/each}
						<td class="text-center font-semibold">{row.persentase}%</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
