import { createClient } from '@libsql/client';
import { exec, execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const db = createClient({ url: process.env.DB_URL || 'file:./data/database.sqlite3' });

const HARI_LIST = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
const HARI_MAP = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

const args = process.argv[2];
let playEnabled = process.argv.includes('--play');

if (!args || !args.includes(',')) {
	console.log('Usage: node scripts/test-bell.mjs <hari>,<HH:mm> [--play]');
	console.log('Example: node scripts/test-bell.mjs senin,07:50 --play');
	console.log('');
	console.log('  --play    Also play the sound file for the active schedule');
	process.exit(1);
}

function execAsync(cmd, opts) {
	return new Promise((resolve) => {
		exec(cmd, { ...opts, timeout: opts?.timeout ?? 10_000 }, (err) => {
			if (err && err.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
				console.error('[bell] exec error:', err.message);
			}
			resolve();
		});
	});
}

function playWin32(soundPath) {
	const exePath = path.resolve(process.cwd(), 'scripts', 'playmp3.exe');
	if (fs.existsSync(exePath)) {
		return new Promise((resolve) => {
			execFile(exePath, [soundPath], { timeout: 10_000 }, (err) => {
				if (err) console.error('[bell] execFile error:', err.message);
				resolve();
			});
		});
	}
	const psPath = soundPath.replace(/\\/g, '\\\\');
	return execAsync(`powershell -c (New-Object Media.SoundPlayer "${psPath}").PlaySync()`);
}

function playSound(sekolahId, tipe) {
	let soundPath = path.resolve(process.cwd(), 'data', 'sounds', `${sekolahId}_${tipe}.mp3`);
	if (!fs.existsSync(soundPath)) {
		soundPath = path.resolve(process.cwd(), 'static', 'sounds', `${tipe}.mp3`);
		if (!fs.existsSync(soundPath)) {
			console.error(`  Sound file not found: static/sounds/${tipe}.mp3`);
			return;
		}
	}
	console.log(`  Playing: static/sounds/${tipe}.mp3`);
	if (process.platform === 'win32') {
		playWin32(soundPath);
	} else {
		execAsync(`ffplay -nodisp -autoexit "${soundPath}"`);
	}
}

const parts = args.split(',');
const hari = parts[0];
const time = parts[1];

if (!HARI_LIST.includes(hari)) {
	console.error(`Hari tidak valid. Pilihan: ${HARI_LIST.join(', ')}`);
	process.exit(1);
}

const timeRegex = /^\d{2}:\d{2}$/;
if (!timeRegex.test(time)) {
	console.error('Format waktu: HH:mm (contoh 07:50)');
	process.exit(1);
}

const [h, m] = time.split(':').map(Number);
const currentMinutes = h * 60 + m;

const schools = await db.execute('SELECT id FROM sekolah LIMIT 1');
if (schools.rows.length === 0) {
	console.error('Tidak ada data sekolah.');
	if (soundPromises.length > 0) {
		await Promise.all(soundPromises);
	}

	await db.close();
	process.exit(1);
}
const sekolahId = Number(schools.rows[0].id);

function timeToMinutes(t) {
	const [hh, mm] = t.split(':').map(Number);
	return hh * 60 + mm;
}

function minutesToTime(mins) {
	const hh = Math.floor(mins / 60);
	const mm = mins % 60;
	return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// === Load data ===
const bellRow = await db.execute(
	'SELECT jam_pelajaran_menit, durasi_istirahat, durasi_upacara, jam_mulai FROM bell_settings WHERE sekolah_id = ?',
	[sekolahId]
);
const bell = bellRow.rows[0] ?? {};
const jamPelajaranMenit = Number(bell.jam_pelajaran_menit ?? 35);
const durasiIstirahat = Number(bell.durasi_istirahat ?? 30);
const durasiUpacara = Number(bell.durasi_upacara ?? 70);
const jamMulai = String(bell.jam_mulai ?? '07:00');

const presensiRow = await db.execute(
	'SELECT jam_pulang FROM presensi_settings WHERE sekolah_id = ?',
	[sekolahId]
);
const jamPulang = String(presensiRow.rows[0]?.jam_pulang ?? '15:00');
const jamMulaiMinutes = timeToMinutes(jamMulai);
const jamPulangMinutes = timeToMinutes(jamPulang);
const rawMax = (jamPulangMinutes - jamMulaiMinutes) / jamPelajaranMenit;
const maxJamFromTime = Math.max(1, Math.ceil(rawMax));

const kelasRows = await db.execute(
	'SELECT id, nama FROM kelas WHERE sekolah_id = ? ORDER BY nama',
	[sekolahId]
);
const kelasTerurut = kelasRows.rows.map((r) => ({ id: Number(r.id), nama: String(r.nama) }));

const mapelRows = await db.execute(
	"SELECT DISTINCT kode FROM mata_pelajaran WHERE kelas_id IN (SELECT id FROM kelas WHERE sekolah_id = ?) AND kode IS NOT NULL AND kode != ''",
	[sekolahId]
);
const daftarKodeMapel = new Set(mapelRows.rows.map((r) => String(r.kode)));

const jadwalRows = await db.execute(
	'SELECT hari, jam_ke, kode_kegiatan, kelas_id FROM jadwal_pelajaran WHERE sekolah_id = ?',
	[sekolahId]
);
const jadwalMatrix = {};
for (const row of jadwalRows.rows) {
	const h = String(row.hari);
	const jk = Number(row.jam_ke);
	const kk = String(row.kode_kegiatan);
	const kid = Number(row.kelas_id);
	if (!jadwalMatrix[h]) jadwalMatrix[h] = {};
	if (!jadwalMatrix[h][jk]) jadwalMatrix[h][jk] = {};
	jadwalMatrix[h][jk][kid] = kk;
}

const customRows = await db.execute(
	'SELECT kode, nama, durasi FROM kegiatan_custom WHERE sekolah_id = ?',
	[sekolahId]
);
const kegiatanCustom = customRows.rows.map((r) => ({
	kode: String(r.kode),
	nama: String(r.nama),
	durasi: r.durasi != null ? Number(r.durasi) : null
}));
const customDurationMap = new Map(
	kegiatanCustom.filter((k) => k.durasi != null).map((k) => [k.kode, k.durasi])
);

const maxJamFromData = (() => {
	let m = 0;
	for (const hh of HARI_LIST) {
		const ds = jadwalMatrix[hh];
		if (ds) {
			const periods = Object.keys(ds).map(Number);
			if (periods.length > 0) m = Math.max(m, ...periods);
		}
	}
	return m;
})();

const maxJam = Math.max(maxJamFromTime, maxJamFromData) + 1;

// === Helper functions ===
function getDurasiKode(kode, defaultDur) {
	if (kode === 'UPB') return durasiUpacara;
	if (kode === 'IST') return durasiIstirahat;
	if (customDurationMap.has(kode)) return customDurationMap.get(kode);
	return defaultDur;
}

function computeWaktu(today, jamKe) {
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
	return { start: minutesToTime(current), end: minutesToTime(current + dur) };
}

function isAllSame(today, jamKe) {
	const codes = kelasTerurut.map((k) => jadwalMatrix[today]?.[jamKe]?.[k.id] ?? '');
	const unique = [...new Set(codes.filter(Boolean))];
	if (unique.length === 1) return unique[0];
	return null;
}

function isSubjectCode(kode) {
	return daftarKodeMapel.has(kode);
}

function isFirstSubjectPeriod(today, currentJamKe) {
	for (let j = 1; j < currentJamKe; j++) {
		const codes = kelasTerurut.map((k) => jadwalMatrix[today]?.[j]?.[k.id] ?? '');
		for (const c of codes) {
			if (c && isSubjectCode(c)) return false;
		}
	}
	return true;
}

function getSoundType(kode, today, jamKe) {
	if (jamKe > 1) {
		const prevKode = isAllSame(today, jamKe - 1);
		if (prevKode === 'IST') return 'selesai_istirahat';
	}
	if (kode === 'UPB') return 'upacara';
	if (kode === 'IST') return 'istirahat';
	if (kode === 'PLG') return 'pulang';
	if (kegiatanCustom.some((k) => k.kode === kode)) {
		const c = kegiatanCustom.find((k) => k.kode === kode);
		return c?.durasi != null ? `kegiatan_custom:${c.nama}` : `kegiatan_custom:${c.nama}`;
	}
	if (isSubjectCode(kode)) {
		return isFirstSubjectPeriod(today, jamKe) ? 'masuk' : 'pergantian';
	}
	return 'pergantian';
}

const soundPromises = [];

function playSoundSequence(sekolahId, kode, today, jamKe, isInRange) {
	const label = isInRange ? '▶ ACTIVE' : '  SIM';
	if (jamKe > 1) {
		const prevKode = isAllSame(today, jamKe - 1);
		if (prevKode === 'IST') {
			console.log(`  ${label} → bell (custom) + selesai_istirahat`);
			if (isInRange) {
				soundPromises.push(playSound(sekolahId, 'custom'));
				soundPromises.push(
					new Promise((resolve) =>
						setTimeout(() => resolve(playSound(sekolahId, 'selesai_istirahat')), 1500)
					)
				);
			}
			return;
		}
	}

	if (kode === 'UPB') {
		console.log(`  ${label} → bell (custom) + upacara`);
		if (isInRange) {
			soundPromises.push(playSound(sekolahId, 'custom'));
			soundPromises.push(
				new Promise((resolve) => setTimeout(() => resolve(playSound(sekolahId, 'upacara')), 1500))
			);
		}
	} else if (kode === 'IST') {
		console.log(`  ${label} → bell (custom) + istirahat`);
		if (isInRange) {
			soundPromises.push(playSound(sekolahId, 'custom'));
			soundPromises.push(
				new Promise((resolve) => setTimeout(() => resolve(playSound(sekolahId, 'istirahat')), 1500))
			);
		}
	} else if (kode === 'PLG') {
		console.log(`  ${label} → bell (custom) + pulang`);
		if (isInRange) {
			soundPromises.push(playSound(sekolahId, 'custom'));
			soundPromises.push(
				new Promise((resolve) => setTimeout(() => resolve(playSound(sekolahId, 'pulang')), 1500))
			);
		}
	} else if (kegiatanCustom.some((k) => k.kode === kode)) {
		const custom = kegiatanCustom.find((k) => k.kode === kode);
		console.log(`  ${label} → bell (custom) + ${custom.nama}`);
		if (isInRange) {
			soundPromises.push(playSound(sekolahId, 'custom'));
		}
	} else {
		const tipe = isSubjectCode(kode) && isFirstSubjectPeriod(today, jamKe) ? 'masuk' : 'pergantian';
		console.log(`  ${label} → bell (custom) + ${tipe}`);
		if (isInRange) {
			soundPromises.push(playSound(sekolahId, 'custom'));
			soundPromises.push(
				new Promise((resolve) => setTimeout(() => resolve(playSound(sekolahId, tipe)), 1500))
			);
		}
	}
}

// === Run bell test ===
const today = hari;

// === Auto-PLG (matches web client's getKode auto-return 'PLG' for last row) ===
function computePlgAutoJam(hari) {
	for (let j = maxJam; j >= 1; j--) {
		const waktu = computeWaktu(hari, j);
		if (waktu) {
			const startMinutes = timeToMinutes(waktu.start);
			if (startMinutes < jamPulangMinutes) {
				return j;
			}
		}
	}
	return 1;
}

const hariMaxJam = computePlgAutoJam(today);

function getKode(hari, jamKe) {
	if (jamKe === hariMaxJam) return 'PLG';
	const k = isAllSame(hari, jamKe);
	if (k) return k;
	const firstNonEmpty = kelasTerurut
		.map((k) => jadwalMatrix[hari]?.[jamKe]?.[k.id] ?? '')
		.find(Boolean);
	return firstNonEmpty || null;
}
const nowStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

console.log(`\n=== SIMULASI BELL ===`);
console.log(`Hari: ${today}, Waktu: ${nowStr} (${currentMinutes} menit)`);
console.log(
	`Pengaturan: jamMulai=${jamMulai}, jamPelajaran=${jamPelajaranMenit}menit, durasiUpacara=${durasiUpacara}menit, durasiIstirahat=${durasiIstirahat}menit, maxJam=${maxJam}`
);
console.log(`Kelas: ${kelasTerurut.map((k) => k.nama).join(', ')}`);
console.log(`Kode Mapel: ${[...daftarKodeMapel].join(', ')}`);
if (kegiatanCustom.length > 0) {
	console.log(`Kegiatan Custom: ${kegiatanCustom.map((k) => `${k.kode}(${k.nama})`).join(', ')}`);
}
console.log(`HariMaxJam (PLG di jamKe): ${hariMaxJam}`);

console.log(`\n--- Pengecekan tiap jamKe ---`);
let anyTrigger = false;

for (let jamKe = 1; jamKe <= hariMaxJam; jamKe++) {
	const kode = getKode(today, jamKe);
	if (!kode) continue;
	const waktu = computeWaktu(today, jamKe);
	const startMin = timeToMinutes(waktu.start);
	const endMin = timeToMinutes(waktu.end);
	const isInRange = currentMinutes >= startMin && currentMinutes < endMin;
	const soundType = getSoundType(kode, today, jamKe);

	const marker = isInRange ? ' ← AKTIF' : '';
	const soundLabel = typeof soundType === 'string' ? soundType : `suara "${soundType}"`;
	if (isInRange) anyTrigger = true;

	const waktuStr = kode === 'PLG' ? waktu.start : `${waktu.start}-${waktu.end}`;
	console.log(`  jamKe=${jamKe}: ${waktuStr} | kode='${kode}' | ${soundLabel}${marker}`);

	if (isInRange && playEnabled) {
		playSoundSequence(sekolahId, kode, today, jamKe, true);
	}
}

if (!anyTrigger) {
	console.log('\n⚠️  Tidak ada jadwal aktif pada waktu ini.');
}

// Also show what would trigger if we walked through the day
console.log(`\n--- Simulasi per jam untuk hari ${today} ---`);
for (let jamKe = 1; jamKe <= hariMaxJam; jamKe++) {
	const kode = getKode(today, jamKe);
	if (!kode) continue;
	const waktu = computeWaktu(today, jamKe);
	const waktuStr = kode === 'PLG' ? waktu.start : `${waktu.start}-${waktu.end}`;
	playSoundSequence(sekolahId, kode, today, jamKe, false);
}

await db.close();
