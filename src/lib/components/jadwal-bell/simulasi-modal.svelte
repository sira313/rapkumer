<script lang="ts">
	import { onDestroy } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
import { isValidTime } from '$lib/utils';

	type SimEvent = {
		jamKe: number;
		type: 'start' | 'end';
		targetMinutes: number;
		kode: string;
	};

	interface Props {
		hariList: string[];
		formatHari: (hari: string) => string;
		maxJam: number;
		kelasTerurut: Array<{ id: number; nama: string }>;
		isAllSame: (hari: string, jamKe: number) => string | null;
		getKode: (hari: string, jamKe: number, kelasId: number) => string;
		computeWaktu: (hari: string, jamKe: number) => { start: string; end: string };
		timeToMinutes: (t: string) => number;
		kegiatanCustom: Array<{ kode: string; nama: string; durasi?: number | null }>;
		daftarKodeMapel: string[];
		isFirstSubjectPeriod: (today: string, jamKe: number) => boolean;
		playSoundForKode: (kode: string, today?: string, jamKe?: number) => void;
		playTipeSound: (tipe: string) => void;
	}

	let {
		hariList,
		formatHari,
		maxJam,
		kelasTerurut,
		isAllSame,
		getKode,
		computeWaktu,
		timeToMinutes,
		kegiatanCustom,
		daftarKodeMapel,
		isFirstSubjectPeriod,
		playSoundForKode,
		playTipeSound
	}: Props = $props();

	let simulasiHari = $state(hariList[0] ?? 'senin');
	let simulasiJam = $state('07:00');
	let simulasiRunning = $state(false);
	let simulasiCountdown = $state(0);
	let simulasiNextLabel = $state('');
	let simulasiNextSound = $state('');
	let simulasiTimer: ReturnType<typeof setInterval> | null = null;

	onDestroy(() => {
		stopSimulasi();
	});

	function formatDetik(detik: number): string {
		const m = Math.floor(detik / 60);
		const d = detik % 60;
		return `${m} menit ${String(d).padStart(2, '0')} detik`;
	}

	function getSimulasiSoundType(kode: string, today: string, jamKe: number): string {
		if (jamKe > 1) {
			const prevKode = isAllSame(today, jamKe - 1);
			if (prevKode === 'IST') return 'selesai_istirahat';
		}
		if (kode === 'UPB') return 'upacara';
		if (kode === 'IST') return 'istirahat';
		if (kode === 'PLG') return 'pulang';
		if (kegiatanCustom.some((k) => k.kode === kode)) {
			const nama = kegiatanCustom.find((k) => k.kode === kode)?.nama ?? kode;
			return `"Waktunya ${nama}."`;
		}
		if (daftarKodeMapel.includes(kode)) {
			return isFirstSubjectPeriod(today, jamKe) ? 'masuk' : 'pergantian';
		}
		return 'pergantian';
	}

	function stopSimulasi() {
		if (simulasiTimer) {
			clearInterval(simulasiTimer);
			simulasiTimer = null;
		}
		simulasiRunning = false;
		simulasiCountdown = 0;
	}

	function startSimulasi() {
		stopSimulasi();
		if (!isValidTime(simulasiJam)) {
			simulasiNextLabel = '—';
			simulasiNextSound = 'Format jam tidak valid (HH:mm)';
			return;
		}
		const [h, m] = simulasiJam.split(':').map(Number);
		const currentMinutes = h * 60 + m;

		// Record first kode per jamKe for display when slot is mixed
		const firstKodeCache = new Map<number, string>();

		function getFirstKode(jamKe: number): string | null {
			if (firstKodeCache.has(jamKe)) return firstKodeCache.get(jamKe) ?? null;
			const kode = isAllSame(simulasiHari, jamKe);
			if (kode) {
				firstKodeCache.set(jamKe, kode);
				return kode;
			}
			const first =
				kelasTerurut.map((k) => getKode(simulasiHari, jamKe, k.id)).find(Boolean) ?? null;
			if (first) firstKodeCache.set(jamKe, first);
			return first;
		}

		let nearest: { event: SimEvent; diffMin: number } | null = null;

		for (let jamKe = 1; jamKe <= maxJam; jamKe++) {
			const kode = getFirstKode(jamKe);
			if (!kode) continue;
			const waktu = computeWaktu(simulasiHari, jamKe);
			if (!waktu) continue;
			const startMinutes = timeToMinutes(waktu.start);
			const endMinutes = timeToMinutes(waktu.end);

			// Period start in the future (or exactly now)
			if (currentMinutes <= startMinutes) {
				const diff = startMinutes - currentMinutes;
				if (!nearest || diff < nearest.diffMin) {
					nearest = {
						event: { jamKe, type: 'start', targetMinutes: startMinutes, kode },
						diffMin: diff
					};
				} else if (diff === nearest.diffMin && nearest.event.type !== 'start') {
					// Tie: prefer start over end (start always has a sound)
					nearest = {
						event: { jamKe, type: 'start', targetMinutes: startMinutes, kode },
						diffMin: diff
					};
				}
			}

			// Period end in the future
			if (currentMinutes < endMinutes) {
				const diff = endMinutes - currentMinutes;
				if (!nearest || diff < nearest.diffMin) {
					nearest = {
						event: { jamKe, type: 'end', targetMinutes: endMinutes, kode },
						diffMin: diff
					};
				}
			}
		}

		if (!nearest) {
			simulasiNextLabel = '—';
			simulasiNextSound = 'Tidak ada jadwal tersisa untuk hari ini.';
			simulasiRunning = false;
			return;
		}

		const { event } = nearest;
		const diffMin = nearest.diffMin * 60;
		const waktu = computeWaktu(simulasiHari, event.jamKe);
		simulasiNextLabel = `${waktu?.start}-${waktu?.end} | ${event.kode}`;

		if (event.type === 'start') {
			const soundType = getSimulasiSoundType(event.kode, simulasiHari, event.jamKe);
			simulasiNextSound = `suara "${soundType}"`;
		} else {
			const isSubject = daftarKodeMapel.includes(event.kode);
			simulasiNextSound = isSubject ? 'suara "pergantian"' : '(tidak ada suara)';
		}

		if (diffMin <= 0) {
			simulasiRunning = false;
			fireEvent(event);
			return;
		}

		simulasiRunning = true;
		simulasiCountdown = diffMin;
		simulasiTimer = setInterval(() => {
			simulasiCountdown--;
			if (simulasiCountdown <= 0) {
				stopSimulasi();
				fireEvent(event);
			}
		}, 1000);
	}

	function fireEvent(event: SimEvent) {
		if (event.type === 'start') {
			playSoundForKode(event.kode, simulasiHari, event.jamKe);
		} else if (daftarKodeMapel.includes(event.kode)) {
			playTipeSound('pergantian');
		}
	}
</script>

<div class="not-prose flex flex-col gap-4">
	<div class="flex flex-wrap items-end gap-3">
		<label class="flex flex-1 flex-col gap-1">
			<span class="fieldset-legend text-sm font-semibold">Hari</span>
			<select
				class="select bg-base-200 dark:bg-base-300 w-full truncate dark:border-none"
				bind:value={simulasiHari}
				disabled={simulasiRunning}
			>
				{#each hariList as h (h)}
					<option value={h}>{formatHari(h)}</option>
				{/each}
			</select>
		</label>
		<label class="flex flex-1 flex-col gap-1">
			<span class="fieldset-legend text-sm font-semibold">Jam</span>
			<input
				type="text"
				class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
				bind:value={simulasiJam}
				disabled={simulasiRunning}
				pattern="[0-9]{2}:[0-9]{2}"
				inputmode="numeric"
				placeholder="HH:mm"
			/>
		</label>
		<div class="flex gap-2">
			{#if simulasiRunning}
				<button type="button" class="btn btn-error shadow-none" onclick={stopSimulasi}>
					<Icon name="pause" />
					Stop
				</button>
			{:else}
				<button type="button" class="btn btn-primary shadow-none" onclick={startSimulasi}>
					<Icon name="play" />
					Mulai
				</button>
			{/if}
		</div>
	</div>

	<div class="bg-base-200 dark:bg-base-300 rounded-box flex flex-col gap-1 p-4 text-sm">
		<div class="flex justify-between">
			<span class="text-base-content/70">Event berikutnya:</span>
			<span class="font-medium">{simulasiNextLabel || '—'}</span>
		</div>
		<div class="flex justify-between">
			<span class="text-base-content/70">Suara:</span>
			<span class="font-medium">{simulasiNextSound || '—'}</span>
		</div>
		{#if simulasiRunning}
			<div class="border-base-content/20 mt-2 flex justify-between border-t pt-2">
				<span class="text-base-content/70">Countdown:</span>
				<span class="text-info font-mono text-lg font-bold">
					{formatDetik(simulasiCountdown)}
				</span>
			</div>
		{/if}
	</div>
</div>
