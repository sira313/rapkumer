import db from '$lib/server/db';
import { ensureJadwalBellSchema } from '$lib/server/db/ensure-jadwal-bell';
import { ensurePresensiSettingsSchema } from '$lib/server/db/ensure-presensi-settings';
import {
	tableBellSettings,
	tableKegiatanCustom,
	tableJadwalPelajaran,
	tableMataPelajaran,
	tableBellSounds,
	tableKelas,
	tablePresensiSettings
} from '$lib/server/db/schema';
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
			bellSounds: [],
			hariSekolah: 6,
			jamPulang: '15:00',
			liburNasional: [],
			liburSemester: []
		};

	await ensureJadwalBellSchema();
	await ensurePresensiSettingsSchema();

	const [bellSettings, kegiatanCustom, jadwalPelajaran, bellSounds, presensiSettings] =
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

	const kelasIds = await db.query.tableKelas.findMany({
		where: eq(tableKelas.sekolahId, sekolahId),
		columns: { id: true }
	});
	const kelasIdList = kelasIds.map((k) => k.id);
	const daftarMapel =
		kelasIdList.length > 0
			? await db.query.tableMataPelajaran.findMany({
					where: inArray(tableMataPelajaran.kelasId, kelasIdList),
					columns: { kode: true }
				})
			: [];
	const daftarKodeMapel = [...new Set(daftarMapel.map((m) => m.kode).filter(Boolean))] as string[];

	return {
		meta: { title: 'Jadwal Pelajaran & Bell Sekolah' },
		bellSettings,
		kegiatanCustom,
		jadwalPelajaran,
		daftarKodeMapel,
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

		await db
			.insert(tableKegiatanCustom)
			.values({ sekolahId, nama, kode, durasi: durasi ?? undefined });

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

		await db
			.update(tableKegiatanCustom)
			.set({ nama, kode, durasi: durasi ?? null })
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

	saveTts: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(401, { fail: 'Sekolah tidak ditemukan' });

		if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
			return fail(403, { fail: 'Anda tidak memiliki izin' });
		}

		const formData = await request.formData();
		const tipe = formData.get('tipe')?.toString().trim();
		const message = formData.get('message')?.toString().trim();

		const allowedTypes = [
			'upacara',
			'istirahat',
			'selesai_istirahat',
			'pergantian',
			'masuk',
			'pulang'
		];
		if (!tipe || !allowedTypes.includes(tipe)) return fail(400, { fail: 'Tipe tidak valid' });

		if (message && message.length > 500)
			return fail(400, { fail: 'Teks terlalu panjang, maksimal 500 karakter' });

		await ensureJadwalBellSchema();

		const existing = await db.query.tableBellSounds.findFirst({
			where: and(eq(tableBellSounds.sekolahId, sekolahId), eq(tableBellSounds.tipe, tipe))
		});

		const ttsMessage = message || null;

		if (existing) {
			await db
				.update(tableBellSounds)
				.set({ ttsMessage, updatedAt: new Date().toISOString() })
				.where(and(eq(tableBellSounds.sekolahId, sekolahId), eq(tableBellSounds.tipe, tipe)));
		} else {
			if (!ttsMessage) return { message: 'Tidak ada perubahan' };
			await db.insert(tableBellSounds).values({
				sekolahId,
				tipe,
				fileName: '',
				mimeType: 'audio/mpeg',
				ttsMessage,
				updatedAt: new Date().toISOString()
			});
		}

		return { message: 'Teks berhasil disimpan' };
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
