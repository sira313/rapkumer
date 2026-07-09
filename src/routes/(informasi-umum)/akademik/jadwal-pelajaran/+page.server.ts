import db from '$lib/server/db';
import { ensureJadwalBellSchema } from '$lib/server/db/ensure-jadwal-bell';
import { ensurePresensiSettingsSchema } from '$lib/server/db/ensure-presensi-settings';
import {
	tableBellSettings,
	tableKegiatanCustom,
	tableJadwalPelajaran,
	tableKokurikuler,
	tableMataPelajaran,
	tableBellSounds,
	tableKelas,
	tablePresensiSettings
} from '$lib/server/db/schema';
import fs from 'node:fs';
import path from 'node:path';
import { fail } from '@sveltejs/kit';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('app:jadwal-bell');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId)
		return {
			bellSettings: null,
			kegiatanCustom: [],
			jadwalPelajaran: [],
			daftarKodeMapel: [],
			daftarKodeKokurikuler: [],
			bellSounds: [],
			hariSekolah: 6,
			jamPulang: '15:00',
			liburNasional: [],
			liburSemester: []
		};

	await ensureJadwalBellSchema();
	await ensurePresensiSettingsSchema();

	const [bellSettings, kegiatanCustom, jadwalPelajaran, bellSounds, presensiSettings, kelasRows] =
		await Promise.all([
			db.query.tableBellSettings.findFirst({
				where: eq(tableBellSettings.sekolahId, sekolahId)
			}),
			db.query.tableKegiatanCustom.findMany({
				where: eq(tableKegiatanCustom.sekolahId, sekolahId)
			}),
			db.query.tableJadwalPelajaran.findMany({
				where: eq(tableJadwalPelajaran.sekolahId, sekolahId)
			}),
			db.query.tableBellSounds.findMany({
				where: eq(tableBellSounds.sekolahId, sekolahId)
			}),
			db.query.tablePresensiSettings.findFirst({
				where: eq(tablePresensiSettings.sekolahId, sekolahId),
				orderBy: [desc(tablePresensiSettings.id)]
			}),
			db.query.tableKelas.findMany({
				where: eq(tableKelas.sekolahId, sekolahId),
				columns: { id: true, nama: true }
			})
		]);

	const hariSekolah = presensiSettings?.hariSekolah ?? 6;
	const jamPulang = presensiSettings?.jamPulang ?? '15:00';

	let liburNasional: string[] = [];
	let liburSemester: Array<{ start: string; end: string }> = [];
	if (presensiSettings) {
		try {
			const parsed = JSON.parse(presensiSettings.liburNasional || '[]');
			if (Array.isArray(parsed)) liburNasional = parsed;
		} catch {
			// ignore
		}
		try {
			const parsed = JSON.parse(presensiSettings.liburSemester || '[]');
			if (Array.isArray(parsed)) liburSemester = parsed;
		} catch {
			// ignore
		}
	}

	const kelasIdList = kelasRows.map((k) => k.id);
	const [daftarMapel, daftarKokurikulerRows] = await Promise.all([
		kelasIdList.length > 0
			? db.query.tableMataPelajaran.findMany({
					where: inArray(tableMataPelajaran.kelasId, kelasIdList),
					columns: { kode: true, nama: true, kelasId: true }
				})
			: Promise.resolve([]),
		kelasIdList.length > 0
			? db.query.tableKokurikuler.findMany({
					columns: { kode: true },
					where: inArray(tableKokurikuler.kelasId, kelasIdList)
				})
			: Promise.resolve([])
	]);
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
	const mapelByKelas = new Map<number, { namaKelas: string; kodes: Set<string> }>();
	const kodeSet = new Set<string>();
	for (const m of daftarMapel) {
		const kode = agamaNameSet.has(m.nama) ? 'PAPB' : m.kode;
		if (!kode) continue;
		if (!mapelByKelas.has(m.kelasId)) {
			const kelasInfo = kelasRows.find((k) => k.id === m.kelasId);
			mapelByKelas.set(m.kelasId, {
				namaKelas: kelasInfo?.nama ?? `Kelas ${m.kelasId}`,
				kodes: new Set()
			});
		}
		mapelByKelas.get(m.kelasId)!.kodes.add(kode);
		kodeSet.add(kode);
	}
	const daftarKodeMapel = [...kodeSet].sort() as string[];
	const kodeMapelPerKelas = [...mapelByKelas.entries()].map(([kelasId, info]) => ({
		kelasId,
		namaKelas: info.namaKelas,
		kodeMapel: [...info.kodes].sort()
	}));

	const daftarKodeKokurikuler = daftarKokurikulerRows.map((k) => k.kode);

	return {
		meta: { title: 'Jadwal Pelajaran & Bell Sekolah' },
		bellSettings,
		kegiatanCustom,
		jadwalPelajaran,
		daftarKodeMapel,
		kodeMapelPerKelas,
		daftarKodeKokurikuler,
		bellSounds,
		hariSekolah,
		jamPulang,
		liburNasional,
		liburSemester
	};
};

export const actions: Actions = {
	saveSettings: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(401, { fail: 'Sekolah tidak ditemukan' });

		if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}

		const formData = await request.formData();
		const jamPelajaranMenit = Number(formData.get('jamPelajaranMenit'));
		const durasiIstirahat = Number(formData.get('durasiIstirahat'));
		const durasiUpacara = Number(formData.get('durasiUpacara'));
		const jamMulai = formData.get('jamMulai')?.toString().trim() ?? '';

		if (!jamPelajaranMenit || jamPelajaranMenit < 1)
			return fail(400, { fail: 'Durasi jam pelajaran tidak valid' });
		if (!durasiIstirahat || durasiIstirahat < 1)
			return fail(400, { fail: 'Durasi istirahat tidak valid' });
		if (!durasiUpacara || durasiUpacara < 1)
			return fail(400, { fail: 'Durasi upacara tidak valid' });
		if (!/^\d{2}:\d{2}$/.test(jamMulai)) return fail(400, { fail: 'Jam mulai tidak valid' });

		await ensureJadwalBellSchema();

		await db
			.insert(tableBellSettings)
			.values({
				sekolahId,
				jamPelajaranMenit,
				durasiIstirahat,
				durasiUpacara,
				jamMulai,
				updatedAt: new Date().toISOString()
			})
			.onConflictDoUpdate({
				target: [tableBellSettings.sekolahId],
				set: {
					jamPelajaranMenit,
					durasiIstirahat,
					durasiUpacara,
					jamMulai,
					updatedAt: new Date().toISOString()
				}
			});

		return { message: 'Pengaturan berhasil disimpan' };
	},

	tambahKegiatan: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(401, { fail: 'Sekolah tidak ditemukan' });

		if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}

		const formData = await request.formData();
		const nama = formData.get('nama')?.toString().trim() ?? '';
		const kode = formData.get('kode')?.toString().trim().toUpperCase() ?? '';
		const durasiRaw = formData.get('durasi')?.toString().trim();
		const durasi = durasiRaw ? parseInt(durasiRaw, 10) : null;
		const soundEntry = formData.get('sound');
		const soundFile = soundEntry instanceof File ? soundEntry : null;

		if (!nama || !kode) return fail(400, { fail: 'Nama dan kode harus diisi' });
		if (kode.length > 10) return fail(400, { fail: 'Kode maksimal 10 karakter' });
		if (durasi !== null && (isNaN(durasi) || durasi < 1)) {
			return fail(400, { fail: 'Durasi harus berupa angka positif' });
		}

		await ensureJadwalBellSchema();

		const existing = await db.query.tableKegiatanCustom.findFirst({
			where: and(eq(tableKegiatanCustom.sekolahId, sekolahId), eq(tableKegiatanCustom.kode, kode))
		});
		if (existing) return fail(400, { fail: 'Kode sudah digunakan' });

		let soundFileName: string | null = null;
		let soundMimeType: string | null = null;

		if (soundFile && soundFile.size > 0) {
			const maxSize = 2 * 1024 * 1024;
			if (soundFile.size > maxSize) return fail(400, { fail: 'Ukuran file sound maksimal 2MB' });
			if (!soundFile.name.toLowerCase().endsWith('.mp3') && soundFile.type !== 'audio/mpeg') {
				return fail(400, { fail: 'Hanya file MP3 yang dapat diterima' });
			}
			const buffer = Buffer.from(await soundFile.arrayBuffer());
			const soundDir = path.resolve(process.env.sounds?.replace(/^file:/, '') || './data/sounds');
			fs.mkdirSync(soundDir, { recursive: true });
			fs.writeFileSync(path.join(soundDir, `${sekolahId}_custom_${kode}.mp3`), buffer);
			soundFileName = soundFile.name;
			soundMimeType = soundFile.type || 'audio/mpeg';
		}

		await db.insert(tableKegiatanCustom).values({
			sekolahId,
			nama,
			kode,
			durasi,
			soundFileName,
			soundMimeType
		});

		return { message: 'Kegiatan berhasil ditambahkan' };
	},

	hapusKegiatan: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(401, { fail: 'Sekolah tidak ditemukan' });

		if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}

		const formData = await request.formData();
		const kode = formData.get('kode')?.toString().trim() ?? '';

		if (!kode) return fail(400, { fail: 'Kode tidak valid' });

		const soundDir = path.resolve(process.env.sounds?.replace(/^file:/, '') || './data/sounds');
		const soundPath = path.join(soundDir, `${sekolahId}_custom_${kode}.mp3`);
		try {
			fs.unlinkSync(soundPath);
		} catch {}

		await db
			.delete(tableKegiatanCustom)
			.where(and(eq(tableKegiatanCustom.sekolahId, sekolahId), eq(tableKegiatanCustom.kode, kode)));

		return { message: 'Kegiatan berhasil dihapus' };
	},

	editKegiatan: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(401, { fail: 'Sekolah tidak ditemukan' });

		if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}

		const formData = await request.formData();
		const kodeLama = formData.get('kodeLama')?.toString().trim() ?? '';
		const nama = formData.get('nama')?.toString().trim() ?? '';
		const kode = formData.get('kode')?.toString().trim().toUpperCase() ?? '';
		const durasiRaw = formData.get('durasi')?.toString().trim();
		const durasi = durasiRaw ? parseInt(durasiRaw, 10) : null;
		const soundEntry = formData.get('sound');
		const soundFile = soundEntry instanceof File ? soundEntry : null;
		const hapusSound = formData.get('hapusSound') === '1';

		if (!kodeLama || !nama || !kode) return fail(400, { fail: 'Nama dan kode harus diisi' });
		if (kode.length > 10) return fail(400, { fail: 'Kode maksimal 10 karakter' });
		if (durasi !== null && (isNaN(durasi) || durasi < 1)) {
			return fail(400, { fail: 'Durasi harus berupa angka positif' });
		}

		if (kode !== kodeLama) {
			const existing = await db.query.tableKegiatanCustom.findFirst({
				where: and(eq(tableKegiatanCustom.sekolahId, sekolahId), eq(tableKegiatanCustom.kode, kode))
			});
			if (existing) return fail(400, { fail: 'Kode sudah digunakan' });
		}

		const soundDir = path.resolve(process.env.sounds?.replace(/^file:/, '') || './data/sounds');
		let soundFileName: string | null | undefined = undefined;
		let soundMimeType: string | null | undefined = undefined;

		if (soundFile && soundFile.size > 0) {
			const maxSize = 2 * 1024 * 1024;
			if (soundFile.size > maxSize) return fail(400, { fail: 'Ukuran file sound maksimal 2MB' });
			if (!soundFile.name.toLowerCase().endsWith('.mp3') && soundFile.type !== 'audio/mpeg') {
				return fail(400, { fail: 'Hanya file MP3 yang dapat diterima' });
			}
			try {
				fs.unlinkSync(path.join(soundDir, `${sekolahId}_custom_${kodeLama}.mp3`));
			} catch {}
			const buffer = Buffer.from(await soundFile.arrayBuffer());
			fs.mkdirSync(soundDir, { recursive: true });
			fs.writeFileSync(path.join(soundDir, `${sekolahId}_custom_${kode}.mp3`), buffer);
			soundFileName = soundFile.name;
			soundMimeType = soundFile.type || 'audio/mpeg';
		} else if (hapusSound) {
			try {
				fs.unlinkSync(path.join(soundDir, `${sekolahId}_custom_${kodeLama}.mp3`));
			} catch {}
			soundFileName = null;
			soundMimeType = null;
		}

		if (kode !== kodeLama && !soundFile) {
			try {
				fs.renameSync(
					path.join(soundDir, `${sekolahId}_custom_${kodeLama}.mp3`),
					path.join(soundDir, `${sekolahId}_custom_${kode}.mp3`)
				);
			} catch {}
		}

		const updateData: Record<string, unknown> = { nama, kode, durasi };
		if (soundFileName !== undefined) updateData.soundFileName = soundFileName;
		if (soundMimeType !== undefined) updateData.soundMimeType = soundMimeType;

		await db
			.update(tableKegiatanCustom)
			.set(updateData)
			.where(
				and(eq(tableKegiatanCustom.sekolahId, sekolahId), eq(tableKegiatanCustom.kode, kodeLama))
			);

		return { message: 'Kegiatan berhasil diedit' };
	},

	saveJadwal: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(401, { fail: 'Sekolah tidak ditemukan' });

		if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}

		const formData = await request.formData();
		const jsonData = formData.get('data')?.toString();

		if (!jsonData) return fail(400, { fail: 'Data tidak ditemukan' });

		let entries: Array<{ hari: string; jamKe: number; kodeKegiatan: string; kelasId: number }>;
		try {
			entries = JSON.parse(jsonData);
		} catch {
			return fail(400, { fail: 'Format data tidak valid' });
		}

		await ensureJadwalBellSchema();

		await db.transaction(async (tx) => {
			await tx.delete(tableJadwalPelajaran).where(eq(tableJadwalPelajaran.sekolahId, sekolahId));

			if (entries.length > 0) {
				await tx.insert(tableJadwalPelajaran).values(
					entries.map((e) => ({
						sekolahId,
						hari: e.hari,
						jamKe: e.jamKe,
						kodeKegiatan: e.kodeKegiatan,
						kelasId: e.kelasId
					}))
				);
			}
		});

		return { message: 'Jadwal berhasil disimpan' };
	},

	toggleBell: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(401, { fail: 'Sekolah tidak ditemukan' });

		if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}

		const formData = await request.formData();
		const isActive = formData.get('isActive') === '1' ? 1 : 0;

		await ensureJadwalBellSchema();

		await db
			.insert(tableBellSettings)
			.values({
				sekolahId,
				isActive,
				jamPelajaranMenit: 35,
				durasiIstirahat: 30,
				durasiUpacara: 70,
				jamMulai: '07:00'
			})
			.onConflictDoUpdate({
				target: [tableBellSettings.sekolahId],
				set: { isActive, updatedAt: new Date().toISOString() }
			});

		return { message: isActive ? 'Bell diaktifkan' : 'Bell dinonaktifkan' };
	}
};
