import { createClient } from '@libsql/client';

const db = createClient({ url: process.env.DB_URL || 'file:./data/database.sqlite3' });

const HARI_LIST = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
const HARI_MAP = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

const args = process.argv[2];
if (!args || !args.includes(',')) {
	console.log('Usage: node scripts/test-bell.mjs <hari>,<HH:mm>');
	console.log('Example: node scripts/test-bell.mjs senin,07:50');
	process.exit(1);
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

const schools = await db.execute("SELECT id FROM sekolah LIMIT 1");
if (schools.rows.length === 0) {
	console.error('Tidak ada data sekolah.');
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
	"SELECT jam_pelajaran_menit, durasi_istirahat, durasi_upacara, jam_mulai FROM bell_settings WHERE sekolah_id = ?",
	[sekolahId]
);
const bell = bellRow.rows[0] ?? {};
const jamPelajaranMenit = Number(bell.jam_pelajaran_menit ?? 35);
const durasiIstirahat = Number(bell.durasi_istirahat ?? 30);
const durasiUpacara = Number(bell.durasi_upacara ?? 70);
const jamMulai = String(bell.jam_mulai ?? '07:00');

const presensiRow = await db.execute(
	"SELECT jam_pulang FROM presensi_settings WHERE sekolah_id = ?",
	[sekolahId]
);
const jamPulang = String(presensiRow.rows[0]?.jam_pulang ?? '15:00');
const jamMulaiMinutes = timeToMinutes(jamMulai);
const jamPulangMinutes = timeToMinutes(jamPulang);
const rawMax = (jamPulangMinutes - jamMulaiMinutes) / jamPelajaranMenit;
const maxJamFromTime = Math.max(1, Math.ceil(rawMax));

const kelasRows = await db.execute(
	"SELECT id, nama FROM kelas WHERE sekolah_id = ? ORDER BY nama",
	[sekolahId]
);
const kelasTerurut = kelasRows.rows.map(r => ({ id: Number(r.id), nama: String(r.nama) }));

const mapelRows = await db.execute(
	"SELECT DISTINCT kode FROM mata_pelajaran WHERE kelas_id IN (SELECT id FROM kelas WHERE sekolah_id = ?) AND kode IS NOT NULL AND kode != ''",
	[sekolahId]
);
const daftarKodeMapel = new Set(mapelRows.rows.map(r => String(r.kode)));

const jadwalRows = await db.execute(
	"SELECT hari, jam_ke, kode_kegiatan, kelas_id FROM jadwal_pelajaran WHERE sekolah_id = ?",
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
	"SELECT kode, nama, durasi FROM kegiatan_custom WHERE sekolah_id = ?",
	[sekolahId]
);
const kegiatanCustom = customRows.rows.map(r => ({
	kode: String(r.kode),
	nama: String(r.nama),
	durasi: r.durasi != null ? Number(r.durasi) : null
}));
const customDurationMap = new Map(kegiatanCustom.filter(k => k.durasi != null).map(k => [k.kode, k.durasi]));

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
		const codes = kelasTerurut.map(k => ds[prev]?.[k.id] ?? '');
		const unique = [...new Set(codes.filter(Boolean))];
		let dur = jamPelajaranMenit;
		if (unique.length === 1) dur = getDurasiKode(unique[0], dur);
		current += dur;
	}
	const codes = kelasTerurut.map(k => ds[jamKe]?.[k.id] ?? '');
	const unique = [...new Set(codes.filter(Boolean))];
	let dur = jamPelajaranMenit;
	if (unique.length === 1) dur = getDurasiKode(unique[0], dur);
	return { start: minutesToTime(current), end: minutesToTime(current + dur) };
}

function isAllSame(today, jamKe) {
	const codes = kelasTerurut.map(k => jadwalMatrix[today]?.[jamKe]?.[k.id] ?? '');
	const unique = [...new Set(codes.filter(Boolean))];
	if (unique.length === 1) return unique[0];
	return null;
}

function isSubjectCode(kode) {
	return daftarKodeMapel.has(kode);
}

function isFirstSubjectPeriod(today, currentJamKe) {
	for (let j = 1; j < currentJamKe; j++) {
		const codes = kelasTerurut.map(k => jadwalMatrix[today]?.[j]?.[k.id] ?? '');
		for (const c of codes) {
			if (c && isSubjectCode(c)) return false;
		}
	}
	return true;
}

function getSoundType(kode, today, jamKe) {
	if (kode === 'UPB') return 'upacara';
	if (kode === 'IST') return 'istirahat';
	if (kode === 'PLG') return 'pulang';
	if (kegiatanCustom.some(k => k.kode === kode)) return `TTS: Waktunya ${kegiatanCustom.find(k => k.kode === kode).nama}.`;
	if (isSubjectCode(kode)) {
		return isFirstSubjectPeriod(today, jamKe) ? 'masuk' : 'pergantian';
	}
	return 'pergantian';
}

// === Run bell test ===
const today = hari;
const nowStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

console.log(`\n=== SIMULASI BELL ===`);
console.log(`Hari: ${today}, Waktu: ${nowStr} (${currentMinutes} menit)`);
console.log(`Pengaturan: jamMulai=${jamMulai}, jamPelajaran=${jamPelajaranMenit}menit, durasiUpacara=${durasiUpacara}menit, durasiIstirahat=${durasiIstirahat}menit, maxJam=${maxJam}`);
console.log(`Kelas: ${kelasTerurut.map(k => k.nama).join(', ')}`);
console.log(`Kode Mapel: ${[...daftarKodeMapel].join(', ')}`);
if (kegiatanCustom.length > 0) {
	console.log(`Kegiatan Custom: ${kegiatanCustom.map(k => `${k.kode}(${k.nama})`).join(', ')}`);
}

console.log(`\n--- Pengecekan tiap jamKe ---`);
let anyTrigger = false;

for (let jamKe = 1; jamKe <= maxJam; jamKe++) {
	let kode = isAllSame(today, jamKe);
	if (!kode) {
		const firstNonEmpty = kelasTerurut
			.map(k => jadwalMatrix[today]?.[jamKe]?.[k.id] ?? '')
			.find(Boolean);
		if (!firstNonEmpty) continue;
		kode = firstNonEmpty;
	}
	const waktu = computeWaktu(today, jamKe);
	const startMin = timeToMinutes(waktu.start);
	const endMin = timeToMinutes(waktu.end);
	const isInRange = currentMinutes >= startMin && currentMinutes < endMin;
	const soundType = getSoundType(kode, today, jamKe);

	const marker = isInRange ? ' ← AKTIF' : '';
	const soundLabel = soundType.startsWith('TTS:') ? soundType : `suara "${soundType}"`;

	if (isInRange) anyTrigger = true;

	console.log(`  jamKe=${jamKe}: ${waktu.start}-${waktu.end} | kode='${kode}' | ${soundLabel}${marker}`);
}

if (!anyTrigger) {
	console.log('\n⚠️  Tidak ada jadwal aktif pada waktu ini.');
}

// Also show what would trigger if we walked through the day
console.log(`\n--- Simulasi per jam untuk hari ${today} ---`);
for (let jamKe = 1; jamKe <= maxJam; jamKe++) {
	let kode = isAllSame(today, jamKe);
	if (!kode) {
		const firstNonEmpty = kelasTerurut
			.map(k => jadwalMatrix[today]?.[jamKe]?.[k.id] ?? '')
			.find(Boolean);
		if (!firstNonEmpty) continue;
		kode = firstNonEmpty;
	}
	const waktu = computeWaktu(today, jamKe);
	const soundType = getSoundType(kode, today, jamKe);
	const soundLabel = soundType.startsWith('TTS:') ? soundType : `suara "${soundType}"`;
	console.log(`  ${waktu.start}-${waktu.end} | ${kode} → ${soundLabel}`);
}

await db.close();
