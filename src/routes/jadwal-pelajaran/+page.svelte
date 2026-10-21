<script lang="ts">
	import type { PageData } from './$types';
	import Icon from '$lib/components/icon.svelte';
	import { getHariSekolahList } from '$lib/hari-sekolah';

	type BellSettingsRow = typeof import('$lib/server/db/schema').tableBellSettings.$inferSelect;
	type KegiatanCustomRow = typeof import('$lib/server/db/schema').tableKegiatanCustom.$inferSelect;
	type JadwalPelajaranRow =
		typeof import('$lib/server/db/schema').tableJadwalPelajaran.$inferSelect;

	const { data } = $props<{ data: PageData }>();

	const bellSettings = $derived(data.bellSettings as BellSettingsRow | null);
	const kegiatanCustom = $derived(data.kegiatanCustom as KegiatanCustomRow[]);
	const jadwalPelajaran = $derived(data.jadwalPelajaran as JadwalPelajaranRow[]);
	const daftarKodeMapel = $derived(data.daftarKodeMapel as string[]);
	const daftarKodeKokurikuler = $derived(data.daftarKodeKokurikuler as string[]);

	const daftarKelas = $derived((data.daftarKelas ?? []) as Array<{ id: number; nama: string }>);

	const hariLabel: Record<string, string> = {
		senin: 'Senin',
		selasa: 'Selasa',
		rabu: 'Rabu',
		kamis: 'Kamis',
		jumat: 'Jumat',
		sabtu: 'Sabtu'
	};

	const hariSekolah = $derived((data.hariSekolah as number) ?? 6);
	const hariSekolahCustom = $derived((data.hariSekolahCustom as string | null) ?? null);
	const hariList = $derived(getHariSekolahList(hariSekolah, hariSekolahCustom));

	const kodeTambahan = ['UPB', 'IST', 'PLG'];

	const kodeNamaMap = $derived(
		new Map<string, string>([
			['UPB', 'Upacara'],
			['IST', 'Istirahat'],
			['PLG', 'Pulang'],
			...kegiatanCustom.map((k) => [k.kode, k.nama] as [string, string]),
			...daftarKodeKokurikuler.map((k) => [k, k] as [string, string])
		])
	);

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

	const badgeColorMap: Record<string, string> = $derived.by(() => {
		const allKodes = new Set<string>(kodeTambahan);
		for (const kd of kegiatanCustom) allKodes.add((kd as { kode: string }).kode);
		for (const kode of daftarKodeMapel) allKodes.add(kode);
		for (const kode of daftarKodeKokurikuler) allKodes.add(kode);
		const sorted = [...allKodes].sort();
		const map: Record<string, string> = {};
		sorted.forEach((kode, i) => {
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
		return map;
	});

	const jadwalMatrix = $derived.by(() => {
		const matrix: Record<string, Record<number, Record<number, string>>> = {};
		for (const entry of jadwalPelajaran) {
			if (!matrix[entry.hari]) matrix[entry.hari] = {};
			if (!matrix[entry.hari][entry.jamKe]) matrix[entry.hari][entry.jamKe] = {};
			matrix[entry.hari][entry.jamKe][entry.kelasId] = entry.kodeKegiatan;
		}
		return matrix;
	});

	const kelasTerurut = $derived(
		[...daftarKelas].sort((a, b) => {
			const aNum = parseInt(a.nama.replace(/\D/g, '')) || 0;
			const bNum = parseInt(b.nama.replace(/\D/g, '')) || 0;
			return aNum - bNum;
		})
	);

	const kodeMerged = $derived(
		new Set(['UPB', 'IST', 'PLG', ...kegiatanCustom.map((k) => (k as { kode: string }).kode)])
	);
	const customDurationMap = $derived(
		new Map(kegiatanCustom.map((k) => [k.kode, (k as { durasi: number | null }).durasi]))
	);

	function timeToMinutes(t: string): number {
		const [h, m] = t.split(':').map(Number);
		return h * 60 + m;
	}

	function minutesToTime(m: number): string {
		const h = Math.floor(m / 60);
		const min = m % 60;
		return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
	}

	function getDurasiKode(kode: string, defaultDur: number): number {
		if (kode === 'UPB') return bellSettings?.durasiUpacara ?? 70;
		if (kode === 'IST') return bellSettings?.durasiIstirahat ?? 30;
		const customDur = customDurationMap.get(kode);
		if (customDur != null) return customDur;
		return defaultDur;
	}

	function computeWaktu(
		hari: string,
		jamKe: number,
		daySchedule?: Record<number, Record<number, string>>
	): { start: string; end: string } {
		const s = bellSettings;
		const jamMulai = s?.jamMulai ?? '07:00';
		const jamPelajaranMenit = s?.jamPelajaranMenit ?? 35;
		const jamMulaiMinutes = timeToMinutes(jamMulai);
		const ds = daySchedule ?? jadwalMatrix[hari] ?? {};

		let currentMinutes = jamMulaiMinutes;
		for (let prevJamKe = 1; prevJamKe < jamKe; prevJamKe++) {
			const prevCodes = kelasTerurut.map((k) => ds[prevJamKe]?.[k.id] ?? '');
			const uniquePrev = [...new Set(prevCodes.filter(Boolean))];
			let dur = jamPelajaranMenit;
			if (uniquePrev.length === 1) {
				dur = getDurasiKode(uniquePrev[0], dur);
			}
			currentMinutes += dur;
		}

		const codes = kelasTerurut.map((k) => ds[jamKe]?.[k.id] ?? '');
		const unique = [...new Set(codes.filter(Boolean))];
		let dur = jamPelajaranMenit;
		if (unique.length === 1) {
			dur = getDurasiKode(unique[0], dur);
		}

		return { start: minutesToTime(currentMinutes), end: minutesToTime(currentMinutes + dur) };
	}

	const maxJam = $derived.by(() => {
		const jamPelajaranMenit = bellSettings?.jamPelajaranMenit ?? 35;
		const jamMulaiMinutes = timeToMinutes(bellSettings?.jamMulai ?? '07:00');
		const jamPulangMinutes = timeToMinutes((data.jamPulang as string) ?? '15:00');
		const raw = (jamPulangMinutes - jamMulaiMinutes) / jamPelajaranMenit;
		const calculated = Math.max(1, Math.floor(raw));
		let maxFromData = 0;
		for (const hari of hariList) {
			const daySchedule = jadwalMatrix[hari];
			if (daySchedule) {
				const periods = Object.keys(daySchedule).map(Number);
				if (periods.length > 0) {
					maxFromData = Math.max(maxFromData, ...periods);
				}
			}
		}
		return Math.max(calculated, maxFromData) + 1;
	});

	const waktuMatrix = $derived.by(() => {
		const m: Record<string, Record<number, { start: string; end: string }>> = {};
		for (const hari of hariList) {
			m[hari] = {};
			const daySchedule = jadwalMatrix[hari] ?? {};
			for (let jamKe = 1; jamKe <= maxJam; jamKe++) {
				m[hari][jamKe] = computeWaktu(hari, jamKe, daySchedule);
			}
		}
		return m;
	});

	function computePlgAutoJam(hari: string): number {
		const jamPulangMinutes = timeToMinutes((data.jamPulang as string) ?? '15:00');
		for (let j = maxJam; j >= 1; j--) {
			const waktu = waktuMatrix[hari]?.[j];
			if (waktu) {
				const startMinutes = timeToMinutes(waktu.start);
				if (startMinutes < jamPulangMinutes) {
					return j;
				}
			}
		}
		return 1;
	}

	function computePlgPosisi(hari: string): number | null {
		const autoPlgJam = computePlgAutoJam(hari);
		const dayMatrix = jadwalMatrix[hari];
		if (!dayMatrix) return null;
		for (const jamKeStr of Object.keys(dayMatrix)) {
			const jk = Number(jamKeStr);
			if (jk === autoPlgJam) continue;
			const kelasEntries = dayMatrix[jk];
			if (!kelasEntries) continue;
			const codes = kelasTerurut.map((k) => kelasEntries[k.id]);
			if (codes.every((c) => c === 'PLG')) return jk;
		}
		return null;
	}

	const hariMaxJam = $derived.by(() => {
		const m: Record<string, number> = {};
		for (const hari of hariList) {
			m[hari] = computePlgPosisi(hari) ?? computePlgAutoJam(hari);
		}
		return m;
	});

	function getKode(hari: string, jamKe: number, kelasId: number): string {
		if (jamKe === hariMaxJam[hari]) return 'PLG';
		return jadwalMatrix[hari]?.[jamKe]?.[kelasId] ?? '';
	}

	function isAllSame(hari: string, jamKe: number): string | null {
		const codes = kelasTerurut.map((k) => getKode(hari, jamKe, k.id));
		const unique = [...new Set(codes.filter(Boolean))];
		if (unique.length === 1) return unique[0];
		return null;
	}

	function formatHari(hari: string): string {
		return hariLabel[hari] ?? hari.charAt(0).toUpperCase() + hari.slice(1);
	}
</script>

<svelte:head>
	<title>Jadwal Pelajaran</title>
</svelte:head>

<div class="mx-auto w-full max-w-7xl">
	<section class="card bg-base-100 rounded-lg border border-none p-6 shadow-md">
		<div class="space-y-6">
			<div class="flex flex-col gap-1">
				<h1 class="text-xl font-bold">Jadwal Pelajaran</h1>
				{#if data.namaSekolah}
					<p class="text-base-content/70 text-sm">{data.namaSekolah}</p>
				{/if}
			</div>

			{#if kelasTerurut.length === 0}
				<div class="text-base-content/50 py-12 text-center">
					<Icon name="info" class="mb-2 h-8 w-8" />
					<p>Belum ada data jadwal pelajaran</p>
				</div>
			{:else}
				<div
					class="bg-base-100 dark:bg-base-200 overflow-x-auto rounded-md shadow-md dark:shadow-none"
				>
					<table class="border-base-200 dark:border-base-100 table border">
						<thead class="sticky top-0 z-10">
							<tr class="bg-base-200 dark:bg-base-300 text-left font-bold">
								<th rowspan="2" class="w-0">Hari</th>
								<th rowspan="2" class="w-0">Jam</th>
								<th rowspan="2" class="w-0">Waktu</th>
								<th colspan={kelasTerurut.length} class="text-center">Kelas</th>
							</tr>
							<tr class="bg-base-200 dark:bg-base-300 text-left font-bold">
								{#each kelasTerurut as kelas (kelas.id)}
									<th class="min-w-[70px] max-w-[15ch] truncate text-center" title={kelas.nama}>
										{kelas.nama.slice(0, 15)}{kelas.nama.length > 15 ? '…' : ''}
									</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each hariList as hari (hari)}
								{#each Array.from({ length: hariMaxJam[hari] }, (_, i) => i + 1) as jamKe (jamKe)}
									{@const allSame = isAllSame(hari, jamKe)}
									{@const waktu = waktuMatrix[hari]?.[jamKe] ?? {
										start: '--:--',
										end: '--:--'
									}}
									<tr class="border-base-200 dark:border-base-100 border-b">
										{#if jamKe === 1}
											<td rowspan={hariMaxJam[hari]} class="align-top font-medium">
												{formatHari(hari)}
											</td>
										{/if}
										<td class="text-center text-sm">{jamKe}</td>
										<td class="text-xs whitespace-nowrap">
											{#if jamKe === hariMaxJam[hari]}
												{waktu.start}
											{:else}
												{waktu.start} - {waktu.end}
											{/if}
										</td>
										{#if allSame !== null && kodeMerged.has(allSame)}
											<td colspan={kelasTerurut.length} class="text-center align-middle">
												<div class="flex h-full w-full items-center justify-center">
													<span
														class="badge {badgeColorMap[allSame] ??
															'badge-primary'} badge-soft w-full"
													>
														{kodeNamaMap.get(allSame) ?? allSame}
													</span>
												</div>
											</td>
										{:else}
											{#each kelasTerurut as kelas (kelas.id)}
												{@const kode = getKode(hari, jamKe, kelas.id)}
												<td class="text-center">
													{#if kode}
														<span
															class="badge {badgeColorMap[kode] ??
																'badge-primary'} badge-soft text-xs"
															>{kodeNamaMap.get(kode) ?? kode}</span
														>
													{:else}
														<span class="text-base-content/30 text-xs">—</span>
													{/if}
												</td>
											{/each}
										{/if}
									</tr>
								{/each}
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</section>
</div>
