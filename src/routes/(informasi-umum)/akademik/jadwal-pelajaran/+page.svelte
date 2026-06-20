<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/state';
	import { invalidate } from '$app/navigation';
	import { showModal, hideModal } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import Icon from '$lib/components/icon.svelte';
	import KodeKegiatan from '$lib/components/jadwal-bell/kode-kegiatan.svelte';
	import PengaturanModal from '$lib/components/jadwal-bell/pengaturan-modal.svelte';
	import TambahKegiatanModal from '$lib/components/jadwal-bell/tambah-kegiatan-modal.svelte';
	import SimulasiModal from '$lib/components/jadwal-bell/simulasi-modal.svelte';
	import { jadwalIsEditing } from '$lib/stores/jadwal-edit';
	import type { PageData } from './$types';

	type BellSettingsRow = typeof import('$lib/server/db/schema').tableBellSettings.$inferSelect;
	type KegiatanCustomRow = typeof import('$lib/server/db/schema').tableKegiatanCustom.$inferSelect;
	type JadwalPelajaranRow =
		typeof import('$lib/server/db/schema').tableJadwalPelajaran.$inferSelect;
	type BellSoundsRow = typeof import('$lib/server/db/schema').tableBellSounds.$inferSelect;

	const { data } = $props<{ data: PageData }>();

	const bellSettings = $derived(data.bellSettings as BellSettingsRow | null);
	const kegiatanCustom = $derived(data.kegiatanCustom as KegiatanCustomRow[]);
	let jadwalPelajaran = $state(data.jadwalPelajaran as JadwalPelajaranRow[]);
	const daftarKodeMapel = $derived(data.daftarKodeMapel as string[]);
	const daftarKodeKokurikuler = $derived(data.daftarKodeKokurikuler as string[]);
	const bellSounds = $derived(data.bellSounds as BellSoundsRow[]);

	const daftarKelas = (page.data.daftarKelas ?? []) as Array<{ id: number; nama: string }>;
	const canManage = $derived(
		((page.data.user as { permissions?: string[] })?.permissions ?? []).includes('rapor_manage')
	);

	const hariLabel: Record<string, string> = {
		senin: 'Senin',
		selasa: 'Selasa',
		rabu: 'Rabu',
		kamis: 'Kamis',
		jumat: 'Jumat',
		sabtu: 'Sabtu'
	};

	const hariSekolah = $derived((data.hariSekolah as number) ?? 6);
	const hariList = $derived(
		hariSekolah === 5
			? ['senin', 'selasa', 'rabu', 'kamis', 'jumat']
			: ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu']
	);

	const kodeTambahan = ['UPB', 'IST', 'PLG'];
	const kodeMerged = $derived(
		new Set([
			'UPB',
			'IST',
			'PLG',
			...kegiatanCustom.map((k) => (k as { kode: string }).kode)
		])
	);
	const customDurationMap = $derived(
		new Map(kegiatanCustom.map((k) => [k.kode, (k as { durasi: number | null }).durasi]))
	);

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
	let badgeColorMap = $state<Record<string, string>>({});

	$effect(() => {
		void kegiatanCustom;
		void daftarKodeMapel;
		void daftarKodeKokurikuler;
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
		badgeColorMap = map;
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

	const liburNasional = $derived((data.liburNasional as string[]) ?? []);
	const liburSemester = $derived(
		(data.liburSemester as Array<{ start: string; end: string }>) ?? []
	);

	function toDateStr(date: Date): string {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, '0');
		const d = String(date.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}

	function isHoliday(date: Date): boolean {
		const dayOfWeek = date.getDay();
		if (hariSekolah === 5 && (dayOfWeek === 0 || dayOfWeek === 6)) return true;
		if (hariSekolah === 6 && dayOfWeek === 0) return true;

		const dateStr = toDateStr(date);
		if (liburNasional.includes(dateStr)) return true;
		for (const range of liburSemester) {
			if (dateStr >= range.start && dateStr <= range.end) return true;
		}
		return false;
	}

	let _now = $state(new Date());
	$effect(() => {
		const id = setInterval(() => (_now = new Date()), 60_000);
		return () => clearInterval(id);
	});

	const hariIni = $derived.by(() => {
		const status = isHoliday(_now) ? 'Libur' : 'Hari Belajar';
		const hariNama = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][
			_now.getDay()
		];
		const tgl = _now.toLocaleDateString('id-ID', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
		return `${hariNama}, ${tgl} - ${status}`;
	});

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
		void editing;
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

	const kelasTerurut = $derived(
		[...daftarKelas].sort((a, b) => {
			const aNum = parseInt(a.nama.replace(/\D/g, '')) || 0;
			const bNum = parseInt(b.nama.replace(/\D/g, '')) || 0;
			return aNum - bNum;
		})
	);

	let editing = $state<Record<string, Record<number, Record<number, string>>>>({});
	let dirty = $state(false);
	let saving = $state(false);
	let isEditing = $state(false);
	$effect(() => {
		jadwalIsEditing.set(isEditing);
	});
	let dragSource = $state<{ hari: string; jamKe: number; kelasId?: number; kode: string } | null>(
		null
	);

	let plgPosisi = $state<Record<string, number | null>>({});
	let autoPlgHidden = $state<Record<string, boolean>>({});

	function recomputePlgPosisi() {
		const m: Record<string, number | null> = {};
		for (const hari of hariList) {
			const autoPlgJam = computePlgAutoJam(hari);
			const dayEdit = editing[hari];
			let found: number | null = null;
			if (dayEdit) {
				for (const jamKeStr of Object.keys(dayEdit)) {
					const jk = Number(jamKeStr);
					if (jk === autoPlgJam) continue;
					const kelasEntries = dayEdit[jk];
					if (!kelasEntries) continue;
					const codes = kelasTerurut.map((k) => kelasEntries[k.id]);
					if (codes.every((c) => c === 'PLG')) {
						found = jk;
						break;
					}
				}
			}
			if (found === null) {
				const dayMatrix = jadwalMatrix[hari];
				if (dayMatrix) {
					for (const jamKeStr of Object.keys(dayMatrix)) {
						const jk = Number(jamKeStr);
						if (jk === autoPlgJam) continue;
						const kelasEntries = dayMatrix[jk];
						if (!kelasEntries) continue;
						const codes = kelasTerurut.map((k) => {
							// editing override takes precedence over saved data
							if (editing[hari]?.[jk]?.[k.id] !== undefined) {
								return editing[hari][jk][k.id];
							}
							return kelasEntries[k.id];
						});
						if (codes.every((c) => c === 'PLG')) {
							found = jk;
							break;
						}
					}
				}
			}
			m[hari] = found;
		}
		plgPosisi = m;
	}

	$effect(() => {
		void hariList;
		void maxJam;
		void editing;
		void jadwalMatrix;
		void waktuMatrix;
		void kelasTerurut;
		recomputePlgPosisi();
	});

	const hasAnyPlgManual = $derived(
		Object.values(plgPosisi).some((v) => v !== null) || Object.values(autoPlgHidden).some((v) => v)
	);

	const hariMaxJam = $derived.by(() => {
		const m: Record<string, number> = {};
		for (const hari of hariList) {
			const pos = plgPosisi[hari];
			m[hari] = pos ?? computePlgAutoJam(hari);
		}
		return m;
	});

	function getKode(hari: string, jamKe: number, kelasId: number): string {
		if (jamKe === hariMaxJam[hari] && !autoPlgHidden[hari]) return 'PLG';
		if (editing[hari]?.[jamKe]?.[kelasId] !== undefined) {
			return editing[hari][jamKe][kelasId];
		}
		return jadwalMatrix[hari]?.[jamKe]?.[kelasId] ?? '';
	}

	function resetJamPulang() {
		for (const hari of hariList) {
			const pos = plgPosisi[hari];
			if (pos === null) continue;
			for (const k of kelasTerurut) setKode(hari, pos, k.id, '');
		}
		autoPlgHidden = {};
		recomputePlgPosisi();
	}

	function setKode(hari: string, jamKe: number, kelasId: number, kode: string) {
		if (!canManage) return;
		if (!editing[hari]) editing[hari] = {};
		if (!editing[hari][jamKe]) editing[hari][jamKe] = {};
		editing[hari][jamKe][kelasId] = kode;
		dirty = true;
	}

	function isAllSame(hari: string, jamKe: number): string | null {
		const codes = kelasTerurut.map((k) => getKode(hari, jamKe, k.id));
		const unique = [...new Set(codes.filter(Boolean))];
		if (unique.length === 1) return unique[0];
		return null;
	}

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

		function getCode(jk: number, kelasId: number): string {
			if (editing[hari]?.[jk]?.[kelasId] !== undefined) {
				return editing[hari][jk][kelasId];
			}
			return ds[jk]?.[kelasId] ?? '';
		}

		let currentMinutes = jamMulaiMinutes;
		for (let prevJamKe = 1; prevJamKe < jamKe; prevJamKe++) {
			const prevCodes = kelasTerurut.map((k) => getCode(prevJamKe, k.id));
			const uniquePrev = [...new Set(prevCodes.filter(Boolean))];
			let dur = jamPelajaranMenit;
			if (uniquePrev.length === 1) {
				dur = getDurasiKode(uniquePrev[0], dur);
			}
			currentMinutes += dur;
		}

		const codes = kelasTerurut.map((k) => getCode(jamKe, k.id));
		const unique = [...new Set(codes.filter(Boolean))];
		let dur = jamPelajaranMenit;
		if (unique.length === 1) {
			dur = getDurasiKode(unique[0], dur);
		}

		return { start: minutesToTime(currentMinutes), end: minutesToTime(currentMinutes + dur) };
	}

	function openPengaturan() {
		let actions: { submit: () => Promise<void>; cancel: () => void };
		showModal({
			title: 'Pengaturan Jadwal & Bell',
			body: PengaturanModal,
			bodyProps: {
				jamPelajaranMenit: bellSettings?.jamPelajaranMenit ?? 35,
				durasiIstirahat: bellSettings?.durasiIstirahat ?? 30,
				durasiUpacara: bellSettings?.durasiUpacara ?? 70,
				jamMulai: bellSettings?.jamMulai ?? '07:00',
				bellSounds,
				onAction: (a: typeof actions) => {
					actions = a;
				}
			},
			onPositive: {
				label: 'Simpan',
				action: () => actions!.submit()
			},
			onNegative: { label: 'Batal' },
			dismissible: false
		});
	}

	function openTambahKegiatan() {
		let actions: { submit: () => Promise<void>; cancel: () => void };
		showModal({
			title: 'Tambah Kegiatan',
			body: TambahKegiatanModal,
			bodyProps: {
				onAction: (a: typeof actions) => {
					actions = a;
				}
			},
			onPositive: {
				label: 'Simpan',
				action: () => actions!.submit()
			},
			onNegative: { label: 'Batal' },
			dismissible: false
		});
	}

	function openEditKegiatan(kegiatan: { kode: string; nama: string; durasi: number | null }) {
		let actions: { submit: () => Promise<void>; cancel: () => void };
		showModal({
			title: 'Edit Kegiatan',
			body: TambahKegiatanModal,
			bodyProps: {
				onAction: (a: typeof actions) => {
					actions = a;
				},
				existingKegiatan: kegiatan
			},
			onPositive: {
				label: 'Simpan',
				action: () => actions!.submit()
			},
			onNegative: { label: 'Batal' },
			dismissible: false
		});
	}

	let cardEl: HTMLElement | null = null;
	let tableScrollEl: HTMLDivElement | null = null;

	$effect(() => {
		if (!cardEl || !tableScrollEl) return;
		function update() {
			const tableRect = tableScrollEl!.getBoundingClientRect();
			const cardRect = cardEl!.getBoundingClientRect();
			const spaceBelow = Math.max(0, cardRect.bottom - tableRect.bottom);
			const remaining = window.innerHeight - tableRect.top - spaceBelow - 28;
			tableScrollEl!.style.maxHeight = `${Math.max(200, remaining)}px`;
		}
		update();
		const ro = new ResizeObserver(update);
		ro.observe(cardEl);
		window.addEventListener('resize', update);
		return () => {
			ro.disconnect();
			window.removeEventListener('resize', update);
		};
	});

	let bellActive = $state(bellSettings?.isActive === 1);

	function openSimulasi() {
		showModal({
			title: 'Simulasi Bell',
			body: SimulasiModal,
			bodyProps: {
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
			},
			onNegative: { label: 'Tutup' },
			dismissible: true
		});
	}

	function openKodeKegiatan() {
		showModal({
			title: 'Kode Kegiatan',
			body: KodeKegiatan,
			bodyProps: {
				kodeMapel: daftarKodeMapel,
				kodeTambahan,
				kodeKokurikuler: daftarKodeKokurikuler,
				kegiatanCustom,
				canManage: canManage && isEditing,
				onHapusKegiatan: handleHapusKegiatan,
				onEditKegiatan: openEditKegiatan,
				onDrag: () => requestAnimationFrame(() => hideModal())
			},
			onNegative: { label: 'Tutup' },
			dismissible: true
		});
	}

	function startBell() {
		_lastTriggeredPeriod = new Set();
		_lastPergantianPeriod = new Set();
		if (_bellTimer) clearInterval(_bellTimer);
		_bellTimer = setInterval(tickBell, 15000);
	}

	function stopBell() {
		if (_bellTimer) {
			clearInterval(_bellTimer);
			_bellTimer = null;
		}
		_lastTriggeredPeriod = new Set();
		_lastPergantianPeriod = new Set();
	}

	function toggleBell() {
		if (!canManage) return;
		const next = !bellActive;
		bellActive = next;

		if (next) startBell();
		else stopBell();

		toast(next ? 'Bell sistem diaktifkan' : 'Bell sistem dinonaktifkan', 'success');

		const formData = new FormData();
		formData.append('isActive', next ? '1' : '0');
		fetch('?/toggleBell', { method: 'POST', body: formData, redirect: 'error' })
			.then((res) => {
				if (!res.ok) throw new Error();
			})
			.catch(() => {
				bellActive = !next;
				if (next) stopBell();
				else startBell();
				toast('Gagal menyimpan status bell', 'error');
			});
	}

	async function handleSaveJadwal() {
		if (!dirty || !canManage) return;
		saving = true;

		let entries: Array<{ hari: string; jamKe: number; kodeKegiatan: string; kelasId: number }> = [];

		// Start with all existing data
		const seen = new Set<string>();
		for (const e of jadwalPelajaran) {
			if (!e.kodeKegiatan) continue;
			const key = `${e.hari}-${e.jamKe}-${e.kelasId}`;
			if (seen.has(key)) continue;
			seen.add(key);
			entries.push({
				hari: e.hari,
				jamKe: e.jamKe,
				kodeKegiatan: e.kodeKegiatan,
				kelasId: e.kelasId
			});
		}

		// Override with editing changes
		for (const [hari, dayEdit] of Object.entries(editing)) {
			for (const jamKeStr of Object.keys(dayEdit)) {
				const jamKe = Number(jamKeStr);
				const kelasEntries = dayEdit[jamKe];
				if (!kelasEntries) continue;
				for (const kelasIdStr of Object.keys(kelasEntries)) {
					const kelasId = Number(kelasIdStr);
					const kode = kelasEntries[kelasId];
					const key = `${hari}-${jamKe}-${kelasId}`;
					const existingIdx = entries.findIndex(
						(e) => e.hari === hari && e.jamKe === jamKe && e.kelasId === kelasId
					);
					if (kode) {
						if (existingIdx >= 0) {
							entries[existingIdx].kodeKegiatan = kode;
						} else {
							if (!seen.has(key)) {
								seen.add(key);
								entries.push({ hari, jamKe, kodeKegiatan: kode, kelasId });
							}
						}
					} else if (existingIdx >= 0) {
						entries.splice(existingIdx, 1);
					}
				}
			}
		}

		// Remove entries beyond per-day max jam (after manual PLG)
		entries = entries.filter((e) => e.jamKe <= (hariMaxJam[e.hari] ?? maxJam));

		const formData = new FormData();
		formData.append('data', JSON.stringify(entries));

		try {
			const res = await fetch('?/saveJadwal', {
				method: 'POST',
				body: formData,
				redirect: 'error'
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ fail: 'Gagal menyimpan jadwal' }));
				throw new Error(err.fail ?? `Error ${res.status}`);
			}

			editing = {};
			dirty = false;
			isEditing = false;
			jadwalPelajaran = entries.map((e) => ({
				id: 0,
				sekolahId: 0,
				hari: e.hari,
				jamKe: e.jamKe,
				kodeKegiatan: e.kodeKegiatan,
				kelasId: e.kelasId
			})) as JadwalPelajaranRow[];
			toast('Jadwal berhasil disimpan', 'success');
		} catch (e) {
			toast(e instanceof Error ? e.message : 'Gagal menyimpan jadwal', 'error');
		} finally {
			saving = false;
		}
	}

	async function handleHapusKegiatan(kode: string) {
		if (!canManage || !isEditing) return;
		const formData = new FormData();
		formData.append('kode', kode);

		try {
			const res = await fetch('?/hapusKegiatan', {
				method: 'POST',
				body: formData,
				redirect: 'error'
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ fail: 'Gagal menghapus kegiatan' }));
				throw new Error(err.fail ?? `Error ${res.status}`);
			}

			toast('Kegiatan berhasil dihapus', 'success');
			await invalidate('app:jadwal-bell');
		} catch (e) {
			toast(e instanceof Error ? e.message : 'Gagal menghapus kegiatan', 'error');
		}
	}

	const defaultTtsMessages: Record<string, string> = {
		upacara: 'Upacara bendera akan segera dimulai, mohon bersiap di lapangan.',
		istirahat: 'Waktunya beristirahat. Silahkan nikmati waktu istirahat anda.',
		selesai_istirahat:
			'waktu istirahat telah selesai, silahkan masuk kembali ke kelas masing-masing.',
		pergantian: 'Satu jam pelajaran telah berlalu.',
		masuk: 'Jam pelajaran telah dimulai, silahkan berbaris sebelum masuk ke kelas masing-masing.',
		pulang: 'Pelajaran telah selesai, waktunya pulang.'
	};

	const ttsMessageMap = $derived(new Map(bellSounds.map((s) => [s.tipe, s.ttsMessage])));

	function getTtsMessage(tipe: string): string {
		return ttsMessageMap.get(tipe) ?? defaultTtsMessages[tipe] ?? 'Bell berbunyi.';
	}

	function playAudioOnce(url: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const audio = new Audio(url);
			const timeout = setTimeout(() => {
				URL.revokeObjectURL(url);
				reject(new Error('timeout'));
			}, 10_000);
			audio.onended = () => {
				clearTimeout(timeout);
				URL.revokeObjectURL(url);
				resolve();
			};
			audio.onerror = () => {
				clearTimeout(timeout);
				URL.revokeObjectURL(url);
				reject();
			};
			audio.play().catch((e) => {
				clearTimeout(timeout);
				URL.revokeObjectURL(url);
				reject(e);
			});
		});
	}

	function playBellSound(): Promise<boolean> {
		return fetch('/api/bell-sound/custom')
			.then((res) => (res.ok ? res.blob() : Promise.reject()))
			.then((blob) => playAudioOnce(URL.createObjectURL(blob)).then(() => true))
			.catch(() => {
				try {
					const audio = new Audio('/universfield-new-notification.mp3');
					return new Promise<boolean>((resolve) => {
						audio.onended = () => resolve(true);
						audio.onerror = () => resolve(false);
						audio
							.play()
							.then(() => {})
							.catch(() => resolve(false));
					});
				} catch {
					return Promise.resolve(false);
				}
			});
	}

	function playTipeSound(tipe: string) {
		fetch(`/api/bell-sound/${tipe}`)
			.then((res) => {
				if (!res.ok) throw new Error();
				return res.blob();
			})
			.then((blob) => playAudioOnce(URL.createObjectURL(blob)))
			.catch(() => {
				const msg = getTtsMessage(tipe);
				if (msg) speak(msg);
			});
	}

	let _lastSpeak = 0;
	function speak(text: string) {
		if (!('speechSynthesis' in window)) return;
		const now = Date.now();
		if (now - _lastSpeak < 500) return;
		_lastSpeak = now;
		speechSynthesis.cancel();
		const u = new SpeechSynthesisUtterance(text);
		u.lang = 'id-ID';
		speechSynthesis.speak(u);
	}

	function playSoundForKode(kode: string, today?: string, jamKe?: number) {
		if (today && jamKe && jamKe > 1) {
			const prevKode = isAllSame(today, jamKe - 1);
			if (prevKode === 'IST') {
				playBellSound();
				setTimeout(() => playTipeSound('selesai_istirahat'), 1500);
				return;
			}
		}

		let tipe: string | null = null;
		let customText: string | null = null;

		if (kode === 'UPB') {
			tipe = 'upacara';
		} else if (kode === 'IST') {
			tipe = 'istirahat';
		} else if (kode === 'PLG') {
			tipe = 'pulang';
		} else if (kegiatanCustom.some((k) => k.kode === kode)) {
			customText = kegiatanCustom.find((k) => k.kode === kode)?.nama ?? kode;
		} else if (daftarKodeMapel.includes(kode)) {
			tipe = today && jamKe && isFirstSubjectPeriod(today, jamKe) ? 'masuk' : 'pergantian';
		} else {
			tipe = 'pergantian';
		}

		playBellSound();
		if (customText) {
			setTimeout(() => speak(`Waktunya ${customText}.`), 1500);
		} else if (tipe) {
			setTimeout(() => playTipeSound(tipe), 1500);
		}
	}

	function isSubjectCode(kode: string): boolean {
		return daftarKodeMapel.includes(kode);
	}

	function isFirstSubjectPeriod(today: string, currentJamKe: number): boolean {
		for (let j = 1; j < currentJamKe; j++) {
			const codes = kelasTerurut.map((k) => getKode(today, j, k.id));
			for (const c of codes) {
				if (c && daftarKodeMapel.includes(c)) return false;
			}
		}
		return true;
	}

	// Bell monitoring — pure DOM, no $state/$effect involvement
	let _lastTriggeredPeriod = new Set<string>();
	let _lastPergantianPeriod = new Set<string>();
	let _bellTimer: ReturnType<typeof setInterval> | null = null;
	const dayNameMap: Record<number, string> = {
		1: 'senin',
		2: 'selasa',
		3: 'rabu',
		4: 'kamis',
		5: 'jumat',
		6: 'sabtu'
	};

	onMount(() => {
		if (bellActive) startBell();
	});

	onDestroy(() => {
		if (_bellTimer) {
			clearInterval(_bellTimer);
			_bellTimer = null;
		}
	});

	function handleDrop(e: DragEvent, hari: string, jamKe: number, kelasId?: number) {
		e.preventDefault();
		const kode = e.dataTransfer?.getData('text/plain');
		if (!kode || !canManage || !isEditing || jamKe === hariMaxJam[hari]) return;

		function setPlg({ close }: { close: () => void }) {
			// PLG always applies to all classes (row-level)
			for (const k of kelasTerurut) setKode(hari, jamKe, k.id, 'PLG');
			for (let j = jamKe + 1; j <= (hariMaxJam[hari] ?? maxJam); j++) {
				for (const k of kelasTerurut) setKode(hari, j, k.id, '');
			}
			if (dragSource) {
				const src = dragSource;
				dragSource = null;
				if (src.kode !== 'PLG') return;
				for (const k of kelasTerurut) setKode(src.hari, src.jamKe, k.id, '');
			}
			recomputePlgPosisi();
			close();
		}

		if (kode === 'PLG') {
			const waktu = waktuMatrix[hari]?.[jamKe];
			if (!waktu) return;
			showModal({
				title: 'Konfirmasi',
				body: `Jam pulang telah disetel pukul ${waktu.start} pada hari ${formatHari(hari)}.`,
				onPositive: { label: 'OK', action: setPlg },
				onNegative: { label: 'Batal' },
				dismissible: false
			});
			return;
		}

		if (dragSource) {
			const src = dragSource;
			dragSource = null;
			if (src.kode !== kode) return;
			if (kelasId === undefined && !kodeMerged.has(kode)) return;
			if (kelasId !== undefined) {
				setKode(hari, jamKe, kelasId, kode);
			} else {
				for (const k of kelasTerurut) setKode(hari, jamKe, k.id, kode);
			}
			if (src.kelasId !== undefined) {
				setKode(src.hari, src.jamKe, src.kelasId, '');
			} else {
				for (const k of kelasTerurut) setKode(src.hari, src.jamKe, k.id, '');
			}
		} else {
			if (kelasId !== undefined) {
				setKode(hari, jamKe, kelasId, kode);
			} else if (kodeMerged.has(kode)) {
				for (const k of kelasTerurut) setKode(hari, jamKe, k.id, kode);
			}
		}
	}

	function clearCell(hari: string, jamKe: number, kelasId?: number) {
		if (!canManage || !isEditing) return;
		if (jamKe === hariMaxJam[hari]) {
			autoPlgHidden[hari] = true;
			return;
		}
		if (kelasId !== undefined) {
			setKode(hari, jamKe, kelasId, '');
		} else {
			for (const k of kelasTerurut) setKode(hari, jamKe, k.id, '');
		}
	}

	function copyToBelow(hari: string, jamKe: number, kelasId?: number) {
		if (!canManage || !isEditing || jamKe >= (hariMaxJam[hari] ?? maxJam)) return;

		const maxHariJam = hariMaxJam[hari] ?? maxJam;
		const sourceKode = kelasId !== undefined ? getKode(hari, jamKe, kelasId) : isAllSame(hari, jamKe);
		if (!sourceKode) return;

		let targetKe = jamKe + 1;
		while (targetKe <= maxHariJam) {
			const allSameAtRow = isAllSame(hari, targetKe);
			if (allSameAtRow && kodeMerged.has(allSameAtRow)) {
				targetKe++;
				continue;
			}
			const existingKode = kelasId !== undefined
				? getKode(hari, targetKe, kelasId)
				: allSameAtRow;
			if (existingKode === sourceKode) {
				targetKe++;
			} else {
				break;
			}
		}

		if (targetKe > maxHariJam) return;

		if (kelasId !== undefined) {
			setKode(hari, targetKe, kelasId, sourceKode);
		} else {
			for (const k of kelasTerurut) {
				setKode(hari, targetKe, k.id, sourceKode);
			}
		}
	}

	function hapusSemua() {
		if (!canManage || !isEditing) return;
		showModal({
			title: 'Konfirmasi',
			body: 'Apakah Anda yakin ingin menghapus semua data jadwal pelajaran?<br>Data yang sudah dihapus tidak dapat dikembalikan.',
			onPositive: {
				label: 'Hapus',
				class: 'btn-error',
				action: async ({ close }) => {
					for (const hari of hariList) {
						for (let jamKe = 1; jamKe < (hariMaxJam[hari] ?? maxJam); jamKe++) {
							for (const k of kelasTerurut) {
								setKode(hari, jamKe, k.id, '');
							}
						}
					}
					await handleSaveJadwal();
					close();
				}
			},
			onNegative: { label: 'Batal' },
			dismissible: false
		});
	}

	function formatHari(hari: string): string {
		return hariLabel[hari] ?? hari.charAt(0).toUpperCase() + hari.slice(1);
	}

	function tickBell() {
		const now = new Date();
		if (isHoliday(now)) return;
		const today = dayNameMap[now.getDay()];
		if (!today) return;
		const currentMinutes = now.getHours() * 60 + now.getMinutes();

		for (let jamKe = 1; jamKe <= (hariMaxJam[today] ?? maxJam); jamKe++) {
			let kode: string | null = isAllSame(today, jamKe);
			if (!kode) {
				const firstNonEmpty = kelasTerurut.map((k) => getKode(today, jamKe, k.id)).find(Boolean);
				if (!firstNonEmpty) continue;
				kode = firstNonEmpty;
			}
			const waktu = computeWaktu(today, jamKe);
			if (!waktu) continue;
			const startMinutes = timeToMinutes(waktu.start);
			const endMinutes = timeToMinutes(waktu.end);
			const dateStr = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
			const key = `${dateStr}-${today}-${jamKe}`;

			if (
				currentMinutes >= startMinutes &&
				currentMinutes < endMinutes &&
				!_lastTriggeredPeriod.has(key) &&
				currentMinutes - startMinutes < 1
			) {
				_lastTriggeredPeriod.add(key);
				playSoundForKode(kode, today, jamKe);
			} else if (
				currentMinutes >= startMinutes &&
				currentMinutes < endMinutes &&
				!_lastTriggeredPeriod.has(key)
			) {
				_lastTriggeredPeriod.add(key);
			}

			if (
				currentMinutes >= endMinutes &&
				_lastTriggeredPeriod.has(key) &&
				!_lastPergantianPeriod.has(key)
			) {
				_lastPergantianPeriod.add(key);
				if (isSubjectCode(kode)) {
					playTipeSound('pergantian');
				}
			}

			if (currentMinutes >= endMinutes && _lastTriggeredPeriod.has(key)) {
				_lastTriggeredPeriod.delete(key);
			}
		}
	}
</script>

<svelte:head>
	<title>Jadwal Pelajaran & Bell</title>
</svelte:head>

<div class="grid grid-cols-1 gap-6">
	<section class="card bg-base-100 rounded-lg border border-none p-6 shadow-md" bind:this={cardEl}>
		<div class="space-y-6">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="flex flex-wrap items-center gap-2">
					{#if isEditing}
						<button
							type="button"
							class="btn btn-soft btn-warning shadow-none"
							onclick={() => {
								editing = {};
								dirty = false;
								isEditing = false;
							}}
						>
							<Icon name="close" />
							Batal
						</button>
					{:else}
						<a href="/akademik" class="btn btn-soft shadow-none">
							<Icon name="left" /> Kembali
						</a>
					{/if}
					<button
						type="button"
						class="btn btn-soft shadow-none xl:hidden"
						onclick={openKodeKegiatan}
						title="Kode Kegiatan"
					>
						<Icon name="grid" />
						Kode
					</button>
					<button
						type="button"
						class="btn btn-soft shadow-none"
						onclick={openPengaturan}
						disabled={!canManage || isEditing}
						aria-disabled={!canManage || isEditing}
						title={!canManage || isEditing ? 'Anda tidak memiliki izin' : ''}
					>
						<Icon name="gear" />
						Pengaturan
					</button>
					{#if isEditing && hasAnyPlgManual}
						<button type="button" class="btn btn-soft shadow-none" onclick={resetJamPulang}>
							<Icon name="repeat" />
							Reset Jam Pulang
						</button>
					{:else}
						<button
							type="button"
							class="btn btn-soft shadow-none"
							onclick={openTambahKegiatan}
							disabled={!canManage || isEditing}
							aria-disabled={!canManage || isEditing}
							title={!canManage || isEditing ? 'Anda tidak memiliki izin' : ''}
						>
							<Icon name="plus" />
							Tambah Kegiatan
						</button>
					{/if}
					{#if !isEditing && canManage}
						<button
							type="button"
							class="btn btn-soft shadow-none"
							onclick={() => (isEditing = true)}
						>
							<Icon name="edit" />
							Edit
						</button>
					{/if}
					{#if dirty && isEditing}
						<button
							type="button"
							class="btn btn-primary shadow-none"
							onclick={handleSaveJadwal}
							disabled={saving}
						>
							{#if saving}
								<span class="loading loading-spinner loading-sm"></span>
								Menyimpan…
							{:else}
								<Icon name="save" />
								Simpan Jadwal
							{/if}
						</button>
					{/if}
				</div>
				{#if isEditing}
					<button type="button" class="btn btn-error btn-soft shadow-none" onclick={hapusSemua}>
						<Icon name="del" />
						Hapus semua
					</button>
				{:else}
					<div class="flex">
						<button
							type="button"
							class="btn btn-soft rounded-r-none shadow-none {bellActive
								? 'btn-error'
								: 'btn-success'}"
							onclick={toggleBell}
							disabled={!canManage}
							aria-disabled={!canManage}
							title={!canManage ? 'Anda tidak memiliki izin' : ''}
						>
							<Icon name={bellActive ? 'pause' : 'play'} />
							{bellActive ? 'Pause Bell' : 'Play Bell'}
						</button>
						<div class="dropdown dropdown-end">
							<button
								type="button"
								class="btn btn-soft rounded-l-none shadow-none {bellActive
									? 'btn-error'
									: 'btn-success'}"
								disabled={!canManage}
								aria-label="Menu bell"
							>
								<Icon name="more-vertical" />
							</button>
							<ul
								class="dropdown-content menu bg-base-100 border-base-300 z-50 mt-2 w-44 rounded-md border p-2 shadow-lg"
							>
								<li>
									<button type="button" onclick={openSimulasi}>
										<Icon name="play" />
										Simulasi Bell
									</button>
								</li>
							</ul>
						</div>
					</div>
				{/if}
			</div>

			{#if bellActive}
				<div class="alert alert-soft alert-success flex items-center gap-2">
					<Icon name="play" class="h-4 w-4 shrink-0" />
					<div class="flex flex-col gap-0.5 text-sm">
						<span>Sistem bell aktif — memonitor jadwal secara otomatis.</span>
						<span class="opacity-70">{hariIni}</span>
					</div>
				</div>
			{/if}

			<div
				bind:this={tableScrollEl}
				class="bg-base-100 dark:bg-base-200 overflow-y-auto rounded-md shadow-md dark:shadow-none"
			>
				<table class="border-base-200 dark:border-base-100 table border">
					<thead class="sticky top-0 z-10">
						<tr class="bg-base-200 dark:bg-base-300 text-left font-bold">
							<th rowspan="2" class="w-0">Hari</th>
							<th rowspan="2" class="w-0">Jam</th>
							<th rowspan="2" class="w-0">Waktu</th>
							<th colspan={kelasTerurut.length} class="text-center">
								{kelasTerurut.length > 0 ? 'Kelas' : ''}
							</th>
						</tr>
						<tr class="bg-base-200 dark:bg-base-300 text-left font-bold">
							{#each kelasTerurut as kelas (kelas.id)}
								<th class="min-w-[70px] text-center">{kelas.nama}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each hariList as hari (hari)}
							{#each Array.from({ length: hariMaxJam[hari] }, (_, i) => i + 1) as jamKe (jamKe)}
								{@const allSame = isAllSame(hari, jamKe)}
								{@const waktu = waktuMatrix[hari]?.[jamKe] ?? { start: '--:--', end: '--:--' }}
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
									{#if kodeMerged.has(allSame ?? '') || (!canManage && allSame)}
										<td
											colspan={kelasTerurut.length}
											class="h-full text-center align-middle {canManage && isEditing
												? 'cursor-grab'
												: ''}"
											ondragover={(e) => e.preventDefault()}
											ondrop={(e) => handleDrop(e, hari, jamKe)}
											ondragstart={(e) => {
												if (!canManage || !isEditing) return;
												dragSource = { hari, jamKe, kode: allSame! };
												e.dataTransfer!.setData('text/plain', allSame!);
											}}
											draggable={canManage && isEditing && allSame !== null}
										>
											<div class="flex h-full w-full items-center justify-center">
												{#if canManage && isEditing}
													<div class="join w-full">
														{#if jamKe < hariMaxJam[hari] && allSame}
															<button
																type="button"
																class="btn btn-xs join-item btn-soft btn-info shrink-0 px-1 shadow-none"
																onclick={() => copyToBelow(hari, jamKe)}
																aria-label="Salin ke bawah"
															>
																<Icon name="copy" class="h-3 w-3" />
															</button>
														{/if}
														<span
															class="badge {badgeColorMap[allSame ?? ''] ??
																'badge-primary'} join-item badge-soft grow"
														>
															{kodeNamaMap.get(allSame!) ?? allSame}
														</span>
														<button
															type="button"
															class="btn btn-xs join-item btn-soft btn-error shrink-0 px-1 shadow-none"
															onclick={() => clearCell(hari, jamKe)}
															aria-label="Hapus {allSame}"
														>
															<Icon name="del" class="h-3 w-3" />
														</button>
													</div>
												{:else}
													<span
														class="badge {badgeColorMap[allSame ?? ''] ??
															'badge-primary'} badge-soft w-full"
													>
														{kodeNamaMap.get(allSame!) ?? allSame}
													</span>
												{/if}
											</div>
										</td>
									{:else}
										{#each kelasTerurut as kelas (kelas.id)}
											{@const kode = getKode(hari, jamKe, kelas.id)}
											<td
												class="text-center {canManage && isEditing && kode ? 'cursor-grab' : ''}"
												ondragover={(e) => e.preventDefault()}
												ondrop={(e) => handleDrop(e, hari, jamKe, kelas.id)}
												ondragstart={(e) => {
													if (!canManage || !isEditing || !kode) return;
													dragSource = { hari, jamKe, kelasId: kelas.id, kode };
													e.dataTransfer!.setData('text/plain', kode);
												}}
												draggable={canManage && isEditing && kode !== ''}
											>
												{#if canManage && isEditing}
													{#if kode}
														<div class="join">
															{#if jamKe < hariMaxJam[hari]}
																<button
																	type="button"
																	class="btn btn-xs join-item btn-soft btn-info px-1 shadow-none"
																	onclick={() => copyToBelow(hari, jamKe, kelas.id)}
																	aria-label="Salin ke bawah"
																>
																	<Icon name="copy" class="h-3 w-3" />
																</button>
															{/if}
															<span
																class="badge {badgeColorMap[kode] ??
																	'badge-primary'} join-item badge-soft text-xs"
															>
																{kodeNamaMap.get(kode) ?? kode}
															</span>
															<button
																type="button"
																class="btn btn-xs join-item btn-soft btn-error px-1 shadow-none"
																onclick={() => clearCell(hari, jamKe, kelas.id)}
																aria-label="Hapus {kode}"
															>
																<Icon name="del" class="h-3 w-3" />
															</button>
														</div>
													{:else}
														<span class="text-base-content/30 cursor-default text-xs"> — </span>
													{/if}
												{:else if kode}
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
		</div>
	</section>
</div>
