import { json, type RequestHandler } from '@sveltejs/kit';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import db from '$lib/server/db';
import {
	tableAbsensi,
	tableAuthUserMataPelajaran,
	tableBellSettings,
	tableJadwalPelajaran,
	tableKegiatanCustom,
	tableKelas,
	tableMataPelajaran,
	tableMurid,
	tablePresensiSettings
} from '$lib/server/db/schema';
import { ensureAbsensiSchema } from '$lib/server/db/ensure-absensi';
import { ensurePresensiSettingsSchema } from '$lib/server/db/ensure-presensi-settings';
import { cookieNames } from '$lib/utils';
import { simWriteAbsensi } from '$lib/server/simulasi-cache';

function parseTime(timeStr: string) {
	const [h, m] = timeStr.split(':').map(Number);
	return { hours: h, minutes: m };
}

function getDateTime(timeStr: string, baseDate: Date) {
	const { hours, minutes } = parseTime(timeStr);
	const dt = new Date(baseDate);
	dt.setHours(hours, minutes, 0, 0);
	return dt;
}

function addMinutes(date: Date, minutes: number) {
	const dt = new Date(date);
	dt.setMinutes(dt.getMinutes() + minutes);
	return dt;
}

function getJamKeTime(jamMasuk: string, jamKe: number) {
	const { hours, minutes } = parseTime(jamMasuk);
	const dt = new Date();
	dt.setHours(hours, minutes, 0, 0);
	dt.setMinutes(dt.getMinutes() + (jamKe - 1) * 45);
	return dt;
}

function formatTime(date: Date) {
	return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDateString(date: Date) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

function isHoliday(
	settings: { hariSekolah: number; liburNasional: string; liburSemester: string },
	date: Date
): boolean {
	const dayOfWeek = date.getDay();

	if (settings.hariSekolah === 5 && (dayOfWeek === 0 || dayOfWeek === 6)) {
		return true;
	}
	if (settings.hariSekolah === 6 && dayOfWeek === 0) {
		return true;
	}

	const dateStr = formatDateString(date);

	let liburNasional: string[] = [];
	try {
		const parsed = JSON.parse(settings.liburNasional || '[]');
		if (Array.isArray(parsed)) liburNasional = parsed;
	} catch {
		// ignore
	}
	if (liburNasional.includes(dateStr)) {
		return true;
	}

	let liburSemester: Array<{ start: string; end: string }> = [];
	try {
		const parsed = JSON.parse(settings.liburSemester || '[]');
		if (Array.isArray(parsed)) liburSemester = parsed;
	} catch {
		// ignore
	}
	for (const range of liburSemester) {
		if (dateStr >= range.start && dateStr <= range.end) {
			return true;
		}
	}

	return false;
}

import { computeJamKeFromTime } from '$lib/server/absen-utils';

export const POST = (async ({ request, locals, cookies, url }) => {
	if (!locals.user) {
		return json({ error: 'Sesi tidak valid. Silakan login ulang.' }, { status: 401 });
	}

	const sekolahId = locals.sekolah?.id ?? null;
	if (!sekolahId) {
		return json({ error: 'Sekolah tidak ditemukan.' }, { status: 400 });
	}

	const user = locals.user;
	if (user.type === 'user') {
		const canScan = await (async () => {
			if (!user.mataPelajaranId) {
				if (!user.id) return false;
				const rel = await db.query.tableAuthUserMataPelajaran.findMany({
					columns: { id: true },
					where: eq(tableAuthUserMataPelajaran.authUserId, user.id),
					limit: 1
				});
				if (rel.length === 0) return false;
			}
			try {
				const s = await db.query.tablePresensiSettings.findFirst({
					columns: { jenisPresensi: true, jamMasuk: true },
					where: eq(tablePresensiSettings.sekolahId, sekolahId)
				});
				return s?.jenisPresensi === 'tiap_mapel';
			} catch {
				return false;
			}
		})();
		if (!canScan) {
			return json({ error: 'Anda tidak memiliki izin untuk melakukan absensi.' }, { status: 403 });
		}
	}

	const kelasIdRaw =
		url.searchParams.get('kelasId') ?? cookies.get(cookieNames.ACTIVE_KELAS_ID) ?? '';
	const kelasId = Number(kelasIdRaw);
	if (!kelasId) {
		return json({ error: 'Kelas tidak ditemukan.' }, { status: 400 });
	}

	const mataPelajaranIdRaw = url.searchParams.get('mataPelajaranId');
	const mataPelajaranId = mataPelajaranIdRaw ? Number(mataPelajaranIdRaw) : null;
	const simHari = url.searchParams.get('simHari');
	const simJam = url.searchParams.get('simJam');
	const tanggalParam = url.searchParams.get('tanggal');

	// Guru mapel: validate schedule match + own subject
	if (user.type === 'user' && mataPelajaranId) {
		const s = await db.query.tablePresensiSettings.findFirst({
			columns: { jenisPresensi: true, jamMasuk: true },
			where: eq(tablePresensiSettings.sekolahId, sekolahId)
		});
		if (s?.jenisPresensi === 'tiap_mapel' && s.jamMasuk) {
			const dayNames = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
			const dayN = simHari ? simHari.toLowerCase() : dayNames[new Date().getDay()];
			const [bellSettingsRaw, kegiatanCustom, jadwalHariIni] = await Promise.all([
				db.query.tableBellSettings.findFirst({
					columns: {
						jamMulai: true,
						jamPelajaranMenit: true,
						durasiIstirahat: true,
						durasiUpacara: true
					},
					where: eq(tableBellSettings.sekolahId, sekolahId)
				}),
				db.query.tableKegiatanCustom.findMany({
					columns: { kode: true, durasi: true },
					where: eq(tableKegiatanCustom.sekolahId, sekolahId)
				}),
				db.query.tableJadwalPelajaran.findMany({
					columns: { kodeKegiatan: true, jamKe: true },
					where: and(
						eq(tableJadwalPelajaran.sekolahId, sekolahId),
						eq(tableJadwalPelajaran.kelasId, kelasId),
						eq(tableJadwalPelajaran.hari, dayN)
					),
					orderBy: [asc(tableJadwalPelajaran.jamKe)]
				})
			]);
			const jamKe = computeJamKeFromTime(
				simJam,
				jadwalHariIni,
				bellSettingsRaw ?? null,
				kegiatanCustom,
				s.jamMasuk
			);
			const jadwal = jadwalHariIni.find((j) => j.jamKe === jamKe);
			const tambahan = new Set(['IST', 'PLG']);
			if (!jadwal || tambahan.has(jadwal.kodeKegiatan.toUpperCase())) {
				return json({ error: 'Jam pelajaran bapak/ibu belum dimulai' }, { status: 403 });
			}
			// Verify the teacher owns this subject (by kode, not per-class ID)
			const agamaMapelNames = [
				'Pendidikan Agama dan Budi Pekerti',
				'Pendidikan Agama Islam dan Budi Pekerti',
				'Pendidikan Agama Kristen dan Budi Pekerti',
				'Pendidikan Agama Katolik dan Budi Pekerti',
				'Pendidikan Agama Buddha dan Budi Pekerti',
				'Pendidikan Agama Hindu dan Budi Pekerti',
				'Pendidikan Agama Konghuchu dan Budi Pekerti'
			];
			const agamaNameSet = new Set(agamaMapelNames);
			const mpRecord = await db.query.tableMataPelajaran.findFirst({
				columns: { kode: true, nama: true },
				where: eq(tableMataPelajaran.id, mataPelajaranId)
			});
			const userKodeSet = new Set<string>();
			const userMpIds = new Set<number>();
			if (user.mataPelajaranId) userMpIds.add(user.mataPelajaranId);
			const additionalMp = await db.query.tableAuthUserMataPelajaran.findMany({
				columns: { mataPelajaranId: true },
				where: eq(tableAuthUserMataPelajaran.authUserId, user.id)
			});
			for (const a of additionalMp) {
				if (a.mataPelajaranId) userMpIds.add(a.mataPelajaranId);
			}
			if (userMpIds.size > 0) {
				const userMps = await db.query.tableMataPelajaran.findMany({
					columns: { kode: true, nama: true },
					where: inArray(tableMataPelajaran.id, [...userMpIds])
				});
				for (const mp of userMps) {
					if (mp.kode) userKodeSet.add(mp.kode.toUpperCase());
					if (agamaNameSet.has(mp.nama)) userKodeSet.add('PAPB');
				}
			}
			const mpKode = mpRecord?.kode?.toUpperCase();
			const isAgama = mpRecord?.nama && agamaNameSet.has(mpRecord.nama);
			const allowed = mpKode ? userKodeSet.has(mpKode) : isAgama ? userKodeSet.has('PAPB') : false;
			if (!allowed) {
				return json(
					{ error: 'Anda tidak memiliki izin untuk melakukan presensi pada mata pelajaran ini' },
					{ status: 403 }
				);
			}
		}
	}

	await ensurePresensiSettingsSchema();

	const kelasRecord = await db.query.tableKelas.findFirst({
		columns: { tahunAjaranId: true },
		where: eq(tableKelas.id, kelasId)
	});
	const tahunAjaranId = kelasRecord?.tahunAjaranId ?? null;

	const settings = tahunAjaranId
		? await db.query.tablePresensiSettings.findFirst({
				where: and(
					eq(tablePresensiSettings.sekolahId, sekolahId),
					eq(tablePresensiSettings.tahunAjaranId, tahunAjaranId)
				)
			})
		: await db.query.tablePresensiSettings.findFirst({
				where: eq(tablePresensiSettings.sekolahId, sekolahId)
			});

	const now = new Date();

	if (settings && isHoliday(settings, now) && !simHari) {
		return json({ error: 'Tidak dapat melakukan absensi di hari libur.' }, { status: 403 });
	}

	let body: { qrData?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Data tidak valid.' }, { status: 400 });
	}

	const qrData = body.qrData?.trim();
	if (!qrData) {
		return json({ error: 'QR code tidak valid.' }, { status: 400 });
	}

	const nisn = extractNisn(qrData);
	if (!nisn) {
		return json({ error: 'QR code tidak valid: NISN tidak ditemukan.' }, { status: 400 });
	}

	const murid = await db.query.tableMurid.findFirst({
		columns: { id: true, nama: true },
		where: and(
			eq(tableMurid.nisn, nisn),
			eq(tableMurid.sekolahId, sekolahId),
			eq(tableMurid.kelasId, kelasId)
		)
	});

	if (!murid) {
		return json({ error: 'Murid tidak ditemukan.' }, { status: 404 });
	}
	let isMorningWindow = true;
	let isAfternoonWindow = true;
	let morningEnd: Date | undefined;
	let jamPulangThreshold: Date | undefined;
	let afternoonStart: Date | undefined;
	let afternoonEnd: Date | undefined;

	if (settings?.jamMasuk && !simHari) {
		const jamMasukDate = getDateTime(settings.jamMasuk, now);
		morningEnd = addMinutes(jamMasukDate, 60);

		if (settings.tipePresensi === 'masuk_saja') {
			if (now < jamMasukDate || now > morningEnd) {
				return json(
					{
						error: `Presensi hanya tersedia dari ${settings.jamMasuk} sampai ${formatTime(morningEnd)}.`
					},
					{ status: 403 }
				);
			}
			isMorningWindow = true;
		} else if (settings.tipePresensi === 'masuk_pulang') {
			if (!settings.jamPulang) {
				return json(
					{ error: 'Pengaturan jam pulang tidak tersedia untuk tipe presensi Masuk Pulang.' },
					{ status: 500 }
				);
			}

			jamPulangThreshold = getDateTime(settings.jamPulang, now);
			afternoonStart = addMinutes(jamPulangThreshold, -15);
			afternoonEnd = addMinutes(jamPulangThreshold, 30);

			isMorningWindow = now >= jamMasukDate && now <= morningEnd;
			isAfternoonWindow = now >= afternoonStart && now <= afternoonEnd;

			if (!isMorningWindow && !isAfternoonWindow) {
				return json(
					{
						error: `Presensi masuk: ${settings.jamMasuk}-${formatTime(morningEnd)}. Presensi pulang: ${formatTime(afternoonStart)}-${formatTime(afternoonEnd)}.`
					},
					{ status: 403 }
				);
			}
		} else if (
			settings.tipePresensi === 'awal_mapel' ||
			settings.tipePresensi === 'awal_akhir_mapel'
		) {
			const dayIdx = now.getDay();
			const dayN = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'][dayIdx];
			const diff =
				(now.getTime() -
					new Date(now).setHours(jamMasukDate.getHours(), jamMasukDate.getMinutes(), 0, 0)) /
				60000;
			const jamKe = Math.max(1, Math.floor(diff / 45) + 1);
			const jadwal = await db.query.tableJadwalPelajaran.findFirst({
				columns: { kodeKegiatan: true },
				where: and(
					eq(tableJadwalPelajaran.sekolahId, sekolahId),
					eq(tableJadwalPelajaran.kelasId, kelasId),
					eq(tableJadwalPelajaran.hari, dayN),
					eq(tableJadwalPelajaran.jamKe, jamKe)
				)
			});
			const tambahan = new Set(['IST', 'PLG']);
			if (!jadwal || tambahan.has(jadwal.kodeKegiatan.toUpperCase())) {
				return json({ error: 'Tidak ada jadwal pelajaran saat ini' }, { status: 403 });
			}
			const jamKeStart = getJamKeTime(settings.jamMasuk, jamKe);
			const jamKeEnd = addMinutes(jamKeStart, 45);
			const awalEnd = addMinutes(jamKeStart, 15);
			const akhirStart = addMinutes(jamKeEnd, -15);

			if (settings.tipePresensi === 'awal_mapel') {
				if (now < jamKeStart || now > awalEnd) {
					return json(
						{
							error: `Presensi hanya tersedia dari ${formatTime(jamKeStart)} sampai ${formatTime(awalEnd)}.`
						},
						{ status: 403 }
					);
				}
				isMorningWindow = true;
				morningEnd = awalEnd;
			} else {
				isMorningWindow = now >= jamKeStart && now <= awalEnd;
				isAfternoonWindow = now >= akhirStart && now <= jamKeEnd;
				morningEnd = awalEnd;
				afternoonStart = akhirStart;
				afternoonEnd = jamKeEnd;

				if (!isMorningWindow && !isAfternoonWindow) {
					return json(
						{
							error: `Presensi awal: ${formatTime(jamKeStart)}-${formatTime(awalEnd)}. Presensi akhir: ${formatTime(akhirStart)}-${formatTime(jamKeEnd)}.`
						},
						{ status: 403 }
					);
				}
			}
		}
	}

	await ensureAbsensiSchema();

	const todayDateString = formatDateString(new Date());

	if (simHari) {
		const simTanggal =
			tanggalParam && /^\d{4}-\d{2}-\d{2}$/.test(tanggalParam) ? tanggalParam : todayDateString;
		simWriteAbsensi(sekolahId, kelasId, simTanggal, murid.id, mataPelajaranId, simHari, simJam);
		return json({ message: `Absensi berhasil untuk ${murid.nama} (simulasi)` });
	}

	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);
	const todayEnd = new Date();
	todayEnd.setHours(23, 59, 59, 999);

	const duaWindow =
		settings?.tipePresensi === 'masuk_pulang' || settings?.tipePresensi === 'awal_akhir_mapel';
	if (duaWindow && morningEnd && afternoonStart && afternoonEnd) {
		if (isMorningWindow) {
			const existing = await db
				.select({ id: tableAbsensi.id })
				.from(tableAbsensi)
				.where(
					and(
						eq(tableAbsensi.muridId, murid.id),
						mataPelajaranId != null
							? eq(tableAbsensi.mataPelajaranId, mataPelajaranId)
							: sql`${tableAbsensi.mataPelajaranId} IS NULL`,
						sql`${tableAbsensi.waktu} >= ${todayStart.toISOString()}`,
						sql`${tableAbsensi.waktu} <= ${morningEnd.toISOString()}`
					)
				)
				.limit(1);

			if (existing.length > 0) {
				return json(
					{ error: `${murid.nama} sudah melakukan absensi masuk hari ini.` },
					{ status: 409 }
				);
			}
		} else if (isAfternoonWindow) {
			const existing = await db
				.select({ id: tableAbsensi.id })
				.from(tableAbsensi)
				.where(
					and(
						eq(tableAbsensi.muridId, murid.id),
						mataPelajaranId != null
							? eq(tableAbsensi.mataPelajaranId, mataPelajaranId)
							: sql`${tableAbsensi.mataPelajaranId} IS NULL`,
						sql`${tableAbsensi.waktu} >= ${afternoonStart.toISOString()}`,
						sql`${tableAbsensi.waktu} <= ${afternoonEnd.toISOString()}`
					)
				)
				.limit(1);

			if (existing.length > 0) {
				return json(
					{ error: `${murid.nama} sudah melakukan absensi pulang hari ini.` },
					{ status: 409 }
				);
			}
		}
	} else {
		const existing = await db
			.select({ id: tableAbsensi.id })
			.from(tableAbsensi)
			.where(
				and(
					eq(tableAbsensi.muridId, murid.id),
					mataPelajaranId != null
						? eq(tableAbsensi.mataPelajaranId, mataPelajaranId)
						: sql`${tableAbsensi.mataPelajaranId} IS NULL`,
					sql`${tableAbsensi.waktu} >= ${todayStart.toISOString()}`,
					sql`${tableAbsensi.waktu} <= ${todayEnd.toISOString()}`
				)
			)
			.limit(1);

		if (existing.length > 0) {
			return json({ error: `${murid.nama} sudah melakukan absensi hari ini.` }, { status: 409 });
		}
	}

	const waktu = new Date().toISOString();

	await db.insert(tableAbsensi).values({
		muridId: murid.id,
		waktu,
		mataPelajaranId
	});

	return json({ message: `Absensi berhasil untuk ${murid.nama}` });
}) satisfies RequestHandler;

function extractNisn(qrData: string): string | null {
	const lines = qrData.split('\n');
	for (const line of lines) {
		const match = line.match(/^NISN:\s*(.+)$/i);
		if (match) {
			return match[1].trim();
		}
	}
	return null;
}
