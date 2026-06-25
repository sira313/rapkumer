import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import db from '$lib/server/db';
import {
	tableBellSettings,
	tableJadwalPelajaran,
	tableKegiatanCustom,
	tableBellSounds,
	tablePresensiSettings,
	tableKelas,
	tableMataPelajaran
} from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

let intervalId: ReturnType<typeof setInterval> | null = null;

const triggeredPeriods = new Map<string, Set<string>>();
const pergantianPeriods = new Map<string, Set<string>>();

const dayNameMap: Record<number, string> = {
	1: 'senin',
	2: 'selasa',
	3: 'rabu',
	4: 'kamis',
	5: 'jumat',
	6: 'sabtu'
};

function toDateStr(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function timeToMinutes(t: string): number {
	const [h, m] = t.split(':').map(Number);
	return h * 60 + m;
}

function soundsDir(): string {
	const envSounds = process.env.sounds || 'file:./data/sounds';
	const raw = envSounds.startsWith('file:') ? envSounds.slice(5) : envSounds;
	return path.resolve(raw);
}

function execAsync(cmd: string, options?: { timeout?: number }): Promise<void> {
	return new Promise((resolve) => {
		exec(cmd, { ...options, timeout: options?.timeout ?? 10_000 }, (err) => {
			if (err && (err as NodeJS.ErrnoException).code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
				console.error('[bell] exec error:', err.message);
			}
			resolve();
		});
	});
}

async function playWin32(soundPath: string) {
	const exePath = path.resolve(process.cwd(), 'scripts', 'playmp3.exe');
	if (fs.existsSync(exePath)) {
		await execAsync(`"${exePath}" "${soundPath}"`);
	} else {
		const psPath = soundPath.replace(/\\/g, '\\\\');
		await execAsync(`powershell -c (New-Object Media.SoundPlayer "${psPath}").PlaySync()`);
	}
}

async function playUnix(soundPath: string) {
	const candidates = [
		`ffplay -nodisp -autoexit "${soundPath}"`,
		`paplay "${soundPath}"`,
		`aplay "${soundPath}"`
	];
	for (const cmd of candidates) {
		const ok = await new Promise<boolean>((resolve) => {
			exec(cmd, { timeout: 5000 }, (err) => {
				resolve(!err);
			});
		});
		if (ok) return;
	}
	console.error('[bell] No available audio player found');
}

export function playSoundOnServer(sekolahId: number, tipe: string) {
	const dir = soundsDir();
	let soundPath = path.join(dir, `${sekolahId}_${tipe}.mp3`);

	if (!fs.existsSync(soundPath)) {
		soundPath = path.resolve(process.cwd(), 'static', 'sounds', `${tipe}.mp3`);
		if (!fs.existsSync(soundPath)) return;
	}

	if (process.platform === 'win32') {
		playWin32(soundPath);
	} else {
		playUnix(soundPath);
	}
}

async function getSekolahKelasMap(sekolahId: number): Promise<Array<{ id: number }>> {
	const rows = await db.query.tableKelas.findMany({
		where: eq(tableKelas.sekolahId, sekolahId),
		columns: { id: true }
	});
	return rows;
}

async function tick() {
	const now = new Date();
	const dayIdx = now.getDay();
	const today = dayNameMap[dayIdx];
	if (!today) return;

	const currentMinutes = now.getHours() * 60 + now.getMinutes();
	const dateStr = toDateStr(now);

	const activeSettings = await db.query.tableBellSettings.findMany({
		where: eq(tableBellSettings.isActive, 1)
	});

	for (const setting of activeSettings) {
		try {
			await checkSekolah(setting, now, today, currentMinutes, dateStr);
		} catch (e) {
			console.error(`[bell] Error checking sekolah ${setting.sekolahId}:`, e);
		}
	}
}

async function checkSekolah(
	setting: typeof tableBellSettings.$inferSelect,
	now: Date,
	today: string,
	currentMinutes: number,
	dateStr: string
) {
	const sekolahId = setting.sekolahId;
	const jamMulai = setting.jamMulai ?? '07:00';
	const jamPelajaranMenit = setting.jamPelajaranMenit ?? 35;
	const durasiIstirahat = setting.durasiIstirahat ?? 30;
	const durasiUpacara = setting.durasiUpacara ?? 70;

	const presensiSettings = await db.query.tablePresensiSettings.findFirst({
		where: eq(tablePresensiSettings.sekolahId, sekolahId),
		orderBy: (t, { desc }) => [desc(t.id)]
	});
	if (!presensiSettings) return;

	const jamPulang = presensiSettings.jamPulang ?? '15:00';
	const hariSekolah = presensiSettings.hariSekolah ?? 6;

	if (hariSekolah === 5 && (now.getDay() === 0 || now.getDay() === 6)) return;
	if (hariSekolah === 6 && now.getDay() === 0) return;

	let liburNasional: string[] = [];
	let liburSemester: Array<{ start: string; end: string }> = [];
	try {
		const parsed = JSON.parse(presensiSettings.liburNasional || '[]');
		if (Array.isArray(parsed)) liburNasional = parsed;
	} catch {}
	try {
		const parsed = JSON.parse(presensiSettings.liburSemester || '[]');
		if (Array.isArray(parsed)) liburSemester = parsed;
	} catch {}
	if (liburNasional.includes(dateStr)) return;
	for (const range of liburSemester) {
		if (dateStr >= range.start && dateStr <= range.end) return;
	}

	const kelasTerurut = await getSekolahKelasMap(sekolahId);
	if (kelasTerurut.length === 0) return;

	const jadwal = await db.query.tableJadwalPelajaran.findMany({
		where: eq(tableJadwalPelajaran.sekolahId, sekolahId)
	});

	const kegiatanCustom = await db.query.tableKegiatanCustom.findMany({
		where: eq(tableKegiatanCustom.sekolahId, sekolahId)
	});

	const daftarMapelRows = await db.query.tableMataPelajaran.findMany({
		where: inArray(
			tableMataPelajaran.kelasId,
			kelasTerurut.map((k) => k.id)
		),
		columns: { kode: true }
	});
	const daftarKodeMapel = new Set(daftarMapelRows.map((r) => r.kode).filter((k): k is string => !!k));

	const jadwalMatrix: Record<string, Record<number, Record<number, string>>> = {};
	for (const entry of jadwal) {
		if (!jadwalMatrix[entry.hari]) jadwalMatrix[entry.hari] = {};
		if (!jadwalMatrix[entry.hari][entry.jamKe]) jadwalMatrix[entry.hari][entry.jamKe] = {};
		jadwalMatrix[entry.hari][entry.jamKe][entry.kelasId] = entry.kodeKegiatan;
	}

	const jamMulaiMinutes = timeToMinutes(jamMulai);
	const jamPulangMinutes = timeToMinutes(jamPulang);
	const rawMax = (jamPulangMinutes - jamMulaiMinutes) / jamPelajaranMenit;
	const maxJamFromTime = Math.max(1, Math.ceil(rawMax));
	let maxFromData = 0;
	const daySchedule = jadwalMatrix[today] ?? {};
	for (const jkStr of Object.keys(daySchedule)) {
		const jk = Number(jkStr);
		if (jk > maxFromData) maxFromData = jk;
	}
	const maxJam = Math.max(maxJamFromTime + 1, maxFromData);

	function computePlgAutoJam(): number {
		for (let j = maxJam; j >= 1; j--) {
			const waktu = computeWaktu(j);
			if (waktu) {
				const startMin = timeToMinutes(waktu.start);
				if (startMin < jamPulangMinutes) return j;
			}
		}
		return 1;
	}

	const hariMaxJam = computePlgAutoJam();

	function getDurasiKode(kode: string, defaultDur: number): number {
		if (kode === 'UPB') return durasiUpacara;
		if (kode === 'IST') return durasiIstirahat;
		const custom = kegiatanCustom.find((k) => k.kode === kode);
		if (custom?.durasi != null) return custom.durasi;
		return defaultDur;
	}

	function computeWaktu(jamKe: number): { start: string; end: string } {
		const ds = jadwalMatrix[today] ?? {};
		let current = jamMulaiMinutes;
		for (let prev = 1; prev < jamKe; prev++) {
			const codes = kelasTerurut.map((k) => ds[prev]?.[k.id] ?? '');
			const unique = [...new Set(codes.filter(Boolean))];
			let dur = jamPelajaranMenit;
			if (unique.length === 1) dur = getDurasiKode(unique[0], dur);
			current += dur;
		}
		const codes = kelasTerurut.map((k) => ds[jamKe]?.[k.id] ?? '');
		const unique = [...new Set(codes.filter(Boolean))];
		let dur = jamPelajaranMenit;
		if (unique.length === 1) dur = getDurasiKode(unique[0], dur);
		return {
			start: `${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`,
			end: `${String(Math.floor((current + dur) / 60)).padStart(2, '0')}:${String((current + dur) % 60).padStart(2, '0')}`
		};
	}

	function isAllSame(jamKe: number): string | null {
		const codes = kelasTerurut.map((k) => jadwalMatrix[today]?.[jamKe]?.[k.id] ?? '');
		const unique = [...new Set(codes.filter(Boolean))];
		if (unique.length === 1) return unique[0];
		return null;
	}

	function getKode(jamKe: number): string | null {
		const allSame = isAllSame(jamKe);
		if (allSame) return allSame;
		const first = kelasTerurut.map((k) => jadwalMatrix[today]?.[jamKe]?.[k.id] ?? '').find(Boolean);
		return first || null;
	}

	function isSubjectCode(kode: string): boolean {
		return daftarKodeMapel.has(kode);
	}

	function isFirstSubjectPeriod(currentJamKe: number): boolean {
		for (let j = 1; j < currentJamKe; j++) {
			const codes = kelasTerurut.map((k) => jadwalMatrix[today]?.[j]?.[k.id] ?? '');
			for (const c of codes) {
				if (c && isSubjectCode(c)) return false;
			}
		}
		return true;
	}

	const sekolahKey = `${sekolahId}`;
	if (!triggeredPeriods.has(sekolahKey)) triggeredPeriods.set(sekolahKey, new Set());
	if (!pergantianPeriods.has(sekolahKey)) pergantianPeriods.set(sekolahKey, new Set());
	const trig = triggeredPeriods.get(sekolahKey)!;
	const perg = pergantianPeriods.get(sekolahKey)!;

	for (let jamKe = 1; jamKe <= hariMaxJam; jamKe++) {
		const kode = getKode(jamKe);
		if (!kode) continue;
		const waktu = computeWaktu(jamKe);
		if (!waktu) continue;
		const startMinutes = timeToMinutes(waktu.start);
		const endMinutes = timeToMinutes(waktu.end);
		const key = `${dateStr}-${today}-${jamKe}`;

		if (
			currentMinutes >= startMinutes &&
			currentMinutes < endMinutes &&
			!trig.has(key) &&
			currentMinutes - startMinutes < 1
		) {
			trig.add(key);
			playSoundForKode(
				kode,
				jamKe,
				sekolahId,
				isFirstSubjectPeriod,
				isSubjectCode,
				kegiatanCustom,
				daftarKodeMapel,
				isAllSame,
				computeWaktu
			);
		} else if (currentMinutes >= startMinutes && currentMinutes < endMinutes && !trig.has(key)) {
			trig.add(key);
		}

		if (currentMinutes >= endMinutes && !perg.has(key)) {
			perg.add(key);
			if (jamKe === hariMaxJam) {
				playSoundOnServer(sekolahId, 'pulang');
			} else if (isSubjectCode(kode)) {
				const nextJamKe = jamKe + 1;
				let isAdjacent = false;
				if (nextJamKe <= hariMaxJam) {
					const nextKode =
						isAllSame(nextJamKe) ||
						kelasTerurut.map((k) => jadwalMatrix[today]?.[nextJamKe]?.[k.id] ?? '').find(Boolean);
					if (nextKode) {
						const nextWaktu = computeWaktu(nextJamKe);
						if (nextWaktu && timeToMinutes(nextWaktu.start) === endMinutes) {
							isAdjacent = true;
						}
					}
				}
				if (!isAdjacent) {
					playSoundOnServer(sekolahId, 'pergantian');
				}
			}
		}

		if (currentMinutes >= endMinutes && trig.has(key)) {
			trig.delete(key);
		}
	}
}

function playSoundForKode(
	kode: string,
	jamKe: number,
	sekolahId: number,
	isFirstSubjectPeriod: (jamKe: number) => boolean,
	isSubjectCode: (kode: string) => boolean,
	kegiatanCustom: Array<{ kode: string; soundFileName?: string | null }>,
	daftarKodeMapel: Set<string>,
	isAllSame: (jamKe: number) => string | null,
	computeWaktu: (jamKe: number) => { start: string; end: string }
) {
	if (jamKe > 1) {
		const prevKode = isAllSame(jamKe - 1);
		if (prevKode === 'IST') {
			playSoundOnServer(sekolahId, 'custom');
			setTimeout(() => playSoundOnServer(sekolahId, 'selesai_istirahat'), 1500);
			return;
		}
	}

	let tipe: string | null = null;

	if (kode === 'UPB') {
		tipe = 'upacara';
	} else if (kode === 'IST') {
		tipe = 'istirahat';
	} else if (kode === 'PLG') {
		tipe = 'pulang';
	} else if (kegiatanCustom.some((k) => k.kode === kode)) {
		const custom = kegiatanCustom.find((k) => k.kode === kode);
		playSoundOnServer(sekolahId, 'custom');
		if (custom?.soundFileName) {
			setTimeout(() => playSoundOnServer(sekolahId, `custom_${kode}`), 1500);
		}
		return;
	} else if (daftarKodeMapel.has(kode)) {
		tipe = isFirstSubjectPeriod(jamKe) ? 'masuk' : 'pergantian';
	} else {
		tipe = 'pergantian';
	}

	playSoundOnServer(sekolahId, 'custom');
	if (tipe) {
		setTimeout(() => playSoundOnServer(sekolahId, tipe), 1500);
	}
}

export function startBellScheduler() {
	if (intervalId) return;
	console.log('[bell] Scheduler started');
	intervalId = setInterval(tick, 15_000);
	tick();
}

export function stopBellScheduler() {
	if (intervalId) {
		clearInterval(intervalId);
		intervalId = null;
	}
	triggeredPeriods.clear();
	pergantianPeriods.clear();
	console.log('[bell] Scheduler stopped');
}
