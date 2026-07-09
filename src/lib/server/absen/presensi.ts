import db from '$lib/server/db';
import {
	tablePresensiSettings,
	tableBellSettings,
	tableKegiatanCustom
} from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import type { BellSettingsData, CustomKegiatanData } from '$lib/server/absen-utils';

export type PresensiCheckResult = {
	presensiReady: boolean;
	presensiWarningMessage: string;
	presensiSettings: typeof tablePresensiSettings.$inferSelect | null;
	bellSettings: BellSettingsData | null;
	kegiatanCustom: CustomKegiatanData[];
};

export async function checkPresensiReadiness(
	sekolahId: number | null,
	kelasId: number | null,
	tahunAjaranId: number | null,
	academicContext: any
): Promise<PresensiCheckResult> {
	const defaults = {
		presensiReady: false,
		presensiWarningMessage: '',
		presensiSettings: null as typeof tablePresensiSettings.$inferSelect | null,
		bellSettings: null as BellSettingsData | null,
		kegiatanCustom: [] as CustomKegiatanData[]
	};

	if (sekolahId && kelasId && tahunAjaranId) {
		const presensiSettings =
			(await db.query.tablePresensiSettings.findFirst({
				where: and(
					eq(tablePresensiSettings.sekolahId, sekolahId),
					eq(tablePresensiSettings.tahunAjaranId, tahunAjaranId)
				)
			})) ?? null;

		const bellSettings =
			(await db.query.tableBellSettings.findFirst({
				columns: {
					jamMulai: true,
					jamPelajaranMenit: true,
					durasiIstirahat: true,
					durasiUpacara: true
				},
				where: eq(tableBellSettings.sekolahId, sekolahId)
			})) ?? null;

		const kegiatanCustom = await db.query.tableKegiatanCustom.findMany({
			columns: { kode: true, durasi: true },
			where: eq(tableKegiatanCustom.sekolahId, sekolahId)
		});

		const activeTa = academicContext?.tahunAjaranList.find(
			(ta: any) => ta.id === academicContext?.activeTahunAjaranId
		);
		const activeSem = activeTa?.semester.find(
			(s: any) => s.id === academicContext?.activeSemesterId
		);
		const tanggalMasuk = activeSem?.tanggalMasuk ?? null;
		const activeSemesterLabel = activeSem && activeTa ? `${activeSem.nama} (${activeTa.nama})` : '';

		const hasPresensiSettings = !!presensiSettings;
		const hasTanggalMasuk = !!tanggalMasuk;
		const presensiReady = hasPresensiSettings && hasTanggalMasuk;

		let presensiWarningMessage = '';
		if (!presensiReady) {
			const parts: string[] = [];
			if (!hasPresensiSettings) parts.push('melakukan pengaturan presensi');
			if (!hasTanggalMasuk) parts.push('menetapkan tanggal masuk semester ' + activeSemesterLabel);
			presensiWarningMessage = `Tidak dapat melakukan presensi sebelum ${parts.join(' dan ')}`;
		}

		return {
			presensiReady,
			presensiWarningMessage,
			presensiSettings,
			bellSettings,
			kegiatanCustom
		};
	}

	return {
		...defaults,
		presensiWarningMessage:
			'Tidak dapat melakukan presensi karena pengaturan sekolah atau kelas belum lengkap.'
	};
}
