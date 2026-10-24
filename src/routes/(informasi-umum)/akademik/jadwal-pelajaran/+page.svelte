<script lang="ts">
	import { page } from '$app/state';
	import { invalidate } from '$app/navigation';
	import { showModal, setModalDragging, hideModalIf } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { computeNextEventMessage } from '$lib/utils/next-event-message';
	import BellStatus from '$lib/components/jadwal-bell/bell-status.svelte';
	import Icon from '$lib/components/icon.svelte';
	import KodeKegiatan from '$lib/components/jadwal-bell/kode-kegiatan.svelte';
	import PengaturanModal from '$lib/components/jadwal-bell/pengaturan-modal.svelte';
	import TambahKegiatanModal from '$lib/components/jadwal-bell/tambah-kegiatan-modal.svelte';
	import SimulasiModal from '$lib/components/jadwal-bell/simulasi-modal.svelte';
	import JadwalPelajaranToolbar from '$lib/components/jadwal-bell/jadwal-pelajaran-toolbar.svelte';
	import JadwalPelajaranTable from '$lib/components/jadwal-bell/jadwal-pelajaran-table.svelte';
	import { jadwalIsEditing } from '$lib/stores/jadwal-edit';
	import { getHariSekolahList, isSchoolDay } from '$lib/hari-sekolah';
	import type { PageData } from './$types';

	type BellSettingsRow = typeof import('$lib/server/db/schema').tableBellSettings.$inferSelect;
	type KegiatanCustomRow = typeof import('$lib/server/db/schema').tableKegiatanCustom.$inferSelect;
	type JadwalPelajaranRow =
		typeof import('$lib/server/db/schema').tableJadwalPelajaran.$inferSelect;
	type BellSoundsRow = typeof import('$lib/server/db/schema').tableBellSounds.$inferSelect;

	const { data } = $props<{ data: PageData }>();

	const bellSettings = $derived(data.bellSettings as BellSettingsRow | null);
	const kegiatanCustom = $derived(data.kegiatanCustom as KegiatanCustomRow[]);
	// svelte-ignore state_referenced_locally
	let jadwalPelajaran = $state(data.jadwalPelajaran as JadwalPelajaranRow[]);
	const daftarKodeMapel = $derived(data.daftarKodeMapel as string[]);
	const kodeMapelPerKelas = $derived(
		(data.kodeMapelPerKelas as Array<{
			kelasId: number;
			namaKelas: string;
			kodeMapel: string[];
		}>) ?? []
	);
	const daftarKodeKokurikuler = $derived(data.daftarKodeKokurikuler as string[]);
	const bellSounds = $derived(data.bellSounds as BellSoundsRow[]);

	const daftarKelas = (page.data.daftarKelas ?? []) as Array<{ id: number; nama: string }>;
	const canManage = $derived(
		((page.data.user as { permissions?: string[] })?.permissions ?? []).includes(
			'informasi_umum_akademik'
		)
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
	const hariSekolahCustom = $derived((data.hariSekolahCustom as string | null) ?? null);
	const hariList = $derived(getHariSekolahList(hariSekolah, hariSekolahCustom));

	const kodeTambahan = ['UPB', 'IST', 'PLG'];
	const kodeMerged = $derived(
		new Set(['UPB', 'IST', 'PLG', ...kegiatanCustom.map((k) => (k as { kode: string }).kode)])
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
		if (
			!isSchoolDay(
				hariSekolah,
				hariSekolahCustom,
				date.getFullYear(),
				date.getMonth() + 1,
				date.getDate()
			)
		)
			return true;

		const dateStr = toDateStr(date);
		if (liburNasional.includes(dateStr)) return true;
		for (const range of liburSemester) {
			if (dateStr >= range.start && dateStr <= range.end) return true;
		}
		return false;
	}

	import { serverTime } from '$lib/server-time.svelte';

	const hariIni = $derived.by(() => {
		const status = isHoliday(serverTime.now) ? 'Libur' : 'Hari Belajar';
		const hariNama = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][
			serverTime.now.getDay()
		];
		const tgl = serverTime.now.toLocaleDateString('id-ID', {
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
			spreadActions: true,
			onNeutral: {
				label: 'Batal',
				action: ({ close }) => close()
			},
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
			spreadActions: true,
			onNeutral: {
				label: 'Batal',
				action: ({ close }) => close()
			},
			dismissible: false
		});
	}

	function openEditKegiatan(kegiatan: {
		kode: string;
		nama: string;
		durasi: number | null;
		soundFileName?: string | null;
	}) {
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

	let cardEl = $state<HTMLElement | null>(null);
	let tableScrollEl = $state<HTMLDivElement | null>(null);

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

	// svelte-ignore state_referenced_locally
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
				isFirstSubjectPeriod
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
				kodeMapelPerKelas,
				kodeTambahan,
				kodeKokurikuler: daftarKodeKokurikuler,
				kegiatanCustom,
				canManage: canManage && isEditing,
				onHapusKegiatan: handleHapusKegiatan,
				onEditKegiatan: openEditKegiatan,
				onDrag: () => setModalDragging(true),
				onDragEnd: () => hideModalIf(KodeKegiatan)
			},
			onNegative: { label: 'Tutup' },
			dismissible: true
		});
	}

	function toggleBell() {
		if (!canManage) return;
		const next = !bellActive;
		bellActive = next;

		toast(next ? 'Bell sistem diaktifkan' : 'Bell sistem dinonaktifkan', 'success');

		const formData = new FormData();
		formData.append('isActive', next ? '1' : '0');
		fetch('?/toggleBell', { method: 'POST', body: formData, redirect: 'error' })
			.then((res) => {
				if (!res.ok) throw new Error();
			})
			.catch(() => {
				bellActive = !next;
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

	function isFirstSubjectPeriod(today: string, currentJamKe: number): boolean {
		for (let j = 1; j < currentJamKe; j++) {
			const codes = kelasTerurut.map((k) => getKode(today, j, k.id));
			for (const c of codes) {
				if (c && daftarKodeMapel.includes(c)) return false;
			}
		}
		return true;
	}

	const dayNameMap: Record<number, string> = {
		0: 'minggu',
		1: 'senin',
		2: 'selasa',
		3: 'rabu',
		4: 'kamis',
		5: 'jumat',
		6: 'sabtu'
	};

	function handleDrop(e: DragEvent, hari: string, jamKe: number, kelasId?: number) {
		e.preventDefault();
		const kode = e.dataTransfer?.getData('text/plain');
		if (!kode || !canManage || !isEditing || jamKe === hariMaxJam[hari]) return;

		// Validasi drag dari KodeKegiatan: kode mapel per-kelas
		if (!dragSource) {
			const sourceKelasIdStr = e.dataTransfer?.getData('application/x-kelas-id');
			if (sourceKelasIdStr) {
				const sourceKelasId = Number(sourceKelasIdStr);
				if (kelasId === undefined) {
					toast('Kode mapel tidak bisa ditempatkan di baris gabungan', 'error');
					return;
				}
				if (sourceKelasId !== kelasId) {
					const kelasNama = kelasTerurut.find((k) => k.id === sourceKelasId)?.nama ?? '';
					toast(`Kode "${kode}" hanya bisa ditempatkan di kolom ${kelasNama}`, 'error');
					return;
				}
			}
		}

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
		const sourceKode =
			kelasId !== undefined ? getKode(hari, jamKe, kelasId) : isAllSame(hari, jamKe);
		if (!sourceKode) return;

		let targetKe = jamKe + 1;
		while (targetKe <= maxHariJam) {
			const allSameAtRow = isAllSame(hari, targetKe);
			if (allSameAtRow && kodeMerged.has(allSameAtRow)) {
				targetKe++;
				continue;
			}
			const existingKode = kelasId !== undefined ? getKode(hari, targetKe, kelasId) : allSameAtRow;
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

	function batalEdit() {
		editing = {};
		dirty = false;
		isEditing = false;
	}

	const nextEventMessage = $derived(
		computeNextEventMessage({
			now: serverTime.now,
			bellActive,
			isHoliday,
			hariList,
			getTodayHari: (dayIdx) => dayNameMap[dayIdx],
			maxJam,
			getFirstKode: (hari, jamKe) => {
				let kode = isAllSame(hari, jamKe);
				if (!kode) {
					const firstNonEmpty = kelasTerurut.map((k) => getKode(hari, jamKe, k.id)).find(Boolean);
					if (firstNonEmpty) return firstNonEmpty;
				}
				return kode;
			},
			computeWaktu: (hari, jamKe) => waktuMatrix[hari]?.[jamKe] ?? null,
			daftarKodeMapel: daftarKodeMapel as string[],
			isFirstSubjectPeriod,
			kegiatanCustom
		})
	);
</script>

<svelte:head>
	<title>Jadwal Pelajaran & Bell</title>
</svelte:head>

<div class="grid grid-cols-1 gap-6">
	<div class="alert alert-info sm:hidden">
		<Icon name="info" />
		<span
			>Gunakan tablet/laptop atau layar yang lebih besar agar lebih mudah mengatur jadwal pelajaran
			pada halaman ini.</span
		>
	</div>
	<section class="card bg-base-100 rounded-lg border border-none p-6 shadow-md" bind:this={cardEl}>
		<div class="space-y-6">
			<JadwalPelajaranToolbar
				{canManage}
				{isEditing}
				{dirty}
				{saving}
				{bellActive}
				{hasAnyPlgManual}
				onBatal={batalEdit}
				onKode={openKodeKegiatan}
				onPengaturan={openPengaturan}
				onResetJamPulang={resetJamPulang}
				onTambahKegiatan={openTambahKegiatan}
				onEdit={() => (isEditing = true)}
				onSave={handleSaveJadwal}
				onHapusSemua={hapusSemua}
				onToggleBell={toggleBell}
				onSimulasi={openSimulasi}
			/>

			<BellStatus {bellActive} {hariIni} {nextEventMessage} class="alert alert-soft alert-info" />

			<JadwalPelajaranTable
				bind:scrollEl={tableScrollEl}
				{hariList}
				{kelasTerurut}
				{hariMaxJam}
				{waktuMatrix}
				{kodeMerged}
				{kodeNamaMap}
				{badgeColorMap}
				{canManage}
				{isEditing}
				{getKode}
				{isAllSame}
				{formatHari}
				onDragStart={(p) => (dragSource = p)}
				onDragEnd={() => (dragSource = null)}
				onDrop={handleDrop}
				onClearCell={clearCell}
				onCopyBelow={copyToBelow}
			/>
		</div>
	</section>
</div>
