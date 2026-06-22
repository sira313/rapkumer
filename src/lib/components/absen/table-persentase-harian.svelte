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
		sessionStatuses: Record<string, { masuk: string; selesai: string }>;
		persentase: number;
	};

	let {
		subjects,
		rows,
		tipePresensi = 'awal_mapel'
	}: {
		subjects: PersentaseHarianSubject[];
		rows: PersentaseHarianRow[];
		tipePresensi?: string;
	} = $props();

	const isAwalAkhir = $derived(tipePresensi === 'awal_akhir_mapel');

	function statusClass(status: string) {
		if (status === 'H') return 'text-success font-bold';
		if (status === 'S') return 'text-warning font-bold';
		if (status === 'I') return 'text-info font-bold';
		if (status === 'TK') return 'text-error font-bold';
		return 'text-base-content/40';
	}

	function displayStatus(status: string) {
		return status || '-';
	}
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
				{#if isAwalAkhir}
					<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
						<th class="text-center" rowspan="2" style="width: 50px; min-width: 40px;">No</th>
						<th rowspan="2" style="min-width: 160px;">Nama</th>
						{#each subjects as subject (subject.kodeKegiatan)}
							<th class="text-center" colspan="2" style="min-width: 80px;">
								{subject.label}
							</th>
						{/each}
						<th class="text-center" rowspan="2" style="min-width: 100px;">%</th>
					</tr>
					<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left text-xs font-bold">
						{#each subjects as subject (subject.kodeKegiatan)}
							<th class="text-center">Masuk</th>
							<th class="text-center">Selesai</th>
						{/each}
					</tr>
				{:else}
					<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
						<th class="text-center" style="width: 50px; min-width: 40px;">No</th>
						<th style="min-width: 160px;">Nama</th>
						{#each subjects as subject (subject.kodeKegiatan)}
							<th class="text-center" style="min-width: 80px;">{subject.label}</th>
						{/each}
						<th class="text-center" style="min-width: 100px;">%</th>
					</tr>
				{/if}
			</thead>
			<tbody>
				{#each rows as row (row.muridId)}
					<tr>
						<td class="text-center">{row.no}</td>
						<td>{row.nama}</td>
						{#if isAwalAkhir}
							{#each subjects as subject (subject.kodeKegiatan)}
								{@const ss = row.sessionStatuses[subject.kodeKegiatan] ?? {
									masuk: '',
									selesai: ''
								}}
								<td class="text-center">
									<span class={statusClass(ss.masuk)}>{displayStatus(ss.masuk)}</span>
								</td>
								<td class="text-center">
									<span class={statusClass(ss.selesai)}>{displayStatus(ss.selesai)}</span>
								</td>
							{/each}
						{:else}
							{#each subjects as subject (subject.kodeKegiatan)}
								{@const status = row.subjects[subject.kodeKegiatan] ?? ''}
								<td class="text-center">
									<span class={statusClass(status)}>{displayStatus(status)}</span>
								</td>
							{/each}
						{/if}
						<td class="text-center font-semibold">{row.persentase}%</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
