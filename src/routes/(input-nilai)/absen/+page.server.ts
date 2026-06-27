import { redirect, type RequestEvent } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isValidDate, todayDateString } from '$lib/server/absen/utils';
import { checkPresensiReadiness } from '$lib/server/absen/presensi';
import { loadBulanan } from '$lib/server/absen/load-bulanan';
import { loadPersentaseBulanan } from '$lib/server/absen/load-persentase-bulanan';
import { loadRapor } from '$lib/server/absen/load-rapor';
import { loadHarian } from '$lib/server/absen/load-harian';
import {
	handleUpdate,
	handleIsiSekaligus,
	handleDeletePresensi,
	handleUpdateRapor,
	handleResetRapor
} from '$lib/server/absen/actions';
import { ensurePresensiSettingsSchema } from '$lib/server/db/ensure-presensi-settings';
import { ensureAbsensiSchema } from '$lib/server/db/ensure-absensi';
import { ensureKetidakhadiranHarianSchema } from '$lib/server/db/ensure-ketidakhadiran-harian';
import { ensureKetidakhadiranRaporSchema } from '$lib/server/db/ensure-ketidakhadiran-rapor';
import db from '$lib/server/db';
import { tableKelas, tableAuthUserMataPelajaran } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ parent, locals, url, depends }) => {
	depends('app:absen');

	if (!locals.user) throw redirect(303, '/login');

	await ensurePresensiSettingsSchema();
	await ensureAbsensiSchema();
	await ensureKetidakhadiranHarianSchema();
	await ensureKetidakhadiranRaporSchema();

	const { kelasAktif, academicContext } = await parent();
	const sekolahId = locals.sekolah?.id ?? null;
	const kelasRecordTa =
		sekolahId && kelasAktif?.id
			? await db.query.tableKelas.findFirst({
					columns: { tahunAjaranId: true, semesterId: true },
					where: eq(tableKelas.id, kelasAktif.id)
				})
			: null;
	const tahunAjaranId = kelasRecordTa?.tahunAjaranId ?? null;

	const { presensiReady, presensiWarningMessage, presensiSettings, bellSettings, kegiatanCustom } =
		await checkPresensiReadiness(sekolahId, kelasAktif?.id ?? null, tahunAjaranId, academicContext);

	const searchParam = url.searchParams.get('q');
	const search = searchParam?.trim() ? searchParam.trim() : null;
	const requestedPage = Number(url.searchParams.get('page')) || 1;
	const pageNumber =
		Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
	const tanggalParam = url.searchParams.get('tanggal');
	const tanggal = tanggalParam && isValidDate(tanggalParam) ? tanggalParam : todayDateString();

	const simHari = url.searchParams.get('simHari')?.toLowerCase() ?? null;
	const simJam = url.searchParams.get('simJam') ?? null;

	const explicitMode = url.searchParams.get('mode');
	const isGuruMapelForDefault =
		locals.user?.type === 'user' &&
		(!!locals.user.mataPelajaranId ||
			(locals.user.id
				? (
						await db.query.tableAuthUserMataPelajaran.findMany({
							columns: { id: true },
							where: eq(tableAuthUserMataPelajaran.authUserId, locals.user.id),
							limit: 1
						})
					).length > 0
				: false));
	const mode =
		explicitMode ??
		(isGuruMapelForDefault && presensiSettings?.jenisPresensi === 'tiap_mapel'
			? 'persentase_harian'
			: 'harian');

	if (mode === 'bulanan') {
		if (!sekolahId || !kelasAktif?.id) {
			return defaultEmpty('bulanan', search, tanggal, simHari, simJam, presensiReady, presensiWarningMessage, presensiSettings?.jenisPresensi ?? 'wali_kelas_saja');
		}
		const bulanParam = url.searchParams.get('bulan');
		const tahunParam = url.searchParams.get('tahun');
		const now = new Date();
		const bulan = bulanParam ? Number(bulanParam) : now.getMonth() + 1;
		const tahun = tahunParam ? Number(tahunParam) : now.getFullYear();
		if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) {
			return defaultEmpty('bulanan', search, tanggal, simHari, simJam, presensiReady, presensiWarningMessage, presensiSettings?.jenisPresensi ?? 'wali_kelas_saja');
		}
		if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2099) {
			return defaultEmpty('bulanan', search, tanggal, simHari, simJam, presensiReady, presensiWarningMessage, presensiSettings?.jenisPresensi ?? 'wali_kelas_saja');
		}
		if (!presensiSettings) {
			return defaultEmpty('bulanan', search, tanggal, simHari, simJam, presensiReady, presensiWarningMessage, 'wali_kelas_saja');
		}
		return loadBulanan({ sekolahId, kelasId: kelasAktif.id, search, pageNumber, bulan, tahun, presensiSettings, simHari, simJam, url });
	}

	if (mode === 'persentase_bulanan') {
		if (!sekolahId || !kelasAktif?.id) {
			return defaultEmpty('persentase_bulanan', search, tanggal, simHari, simJam, presensiReady, presensiWarningMessage, presensiSettings?.jenisPresensi ?? 'wali_kelas_saja');
		}
		const bulanParam = url.searchParams.get('bulan');
		const tahunParam = url.searchParams.get('tahun');
		const now = new Date();
		const bulan = bulanParam ? Number(bulanParam) : now.getMonth() + 1;
		const tahun = tahunParam ? Number(tahunParam) : now.getFullYear();
		if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) {
			return defaultEmpty('persentase_bulanan', search, tanggal, simHari, simJam, presensiReady, presensiWarningMessage, presensiSettings?.jenisPresensi ?? 'wali_kelas_saja');
		}
		if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2099) {
			return defaultEmpty('persentase_bulanan', search, tanggal, simHari, simJam, presensiReady, presensiWarningMessage, presensiSettings?.jenisPresensi ?? 'wali_kelas_saja');
		}
		if (!presensiSettings) {
			return defaultEmpty('persentase_bulanan', search, tanggal, simHari, simJam, presensiReady, presensiWarningMessage, 'wali_kelas_saja');
		}
		return loadPersentaseBulanan({ sekolahId, kelasId: kelasAktif.id, search, pageNumber, bulan, tahun, presensiSettings, simHari, simJam, url });
	}

	if (mode === 'rapor') {
		if (!sekolahId || !kelasAktif?.id) {
			return defaultEmpty('rapor', search, tanggal, simHari, simJam, presensiReady, presensiWarningMessage, presensiSettings?.jenisPresensi ?? 'wali_kelas_saja');
		}
		if (!presensiSettings) {
			return defaultEmpty('rapor', search, tanggal, simHari, simJam, presensiReady, presensiWarningMessage, 'wali_kelas_saja');
		}
		return loadRapor({ sekolahId, kelasId: kelasAktif.id, search, pageNumber, academicContext, presensiSettings, simHari, simJam, url });
	}

	// harian / persentase_harian
	if (!sekolahId || !kelasAktif?.id) {
		return defaultEmpty(mode as 'harian' | 'persentase_harian', search, tanggal, simHari, simJam, presensiReady, presensiWarningMessage, presensiSettings?.jenisPresensi ?? 'wali_kelas_saja');
	}
	if (!presensiSettings) {
		return defaultEmpty(mode as 'harian' | 'persentase_harian', search, tanggal, simHari, simJam, presensiReady, presensiWarningMessage, 'wali_kelas_saja');
	}

	return loadHarian({
		sekolahId,
		kelasId: kelasAktif.id,
		search,
		pageNumber,
		tanggal,
		presensiSettings,
		bellSettings,
		kegiatanCustom,
		user: locals.user,
		simHari,
		simJam,
		mode: mode as 'harian' | 'persentase_harian',
		url
	});
}

function defaultEmpty(
	mode: 'harian' | 'persentase_harian' | 'bulanan' | 'persentase_bulanan' | 'rapor',
	search: string | null,
	tanggal: string,
	simHari: string | null,
	simJam: string | null,
	presensiReady: boolean,
	presensiWarningMessage: string,
	jenisPresensi: string
) {
	return {
		meta: { title: 'Kehadiran Murid' },
		tableReady: true,
		page: { search, currentPage: 1, totalPages: 1, totalItems: 0, perPage: 20 },
		daftarMurid: [],
		semuaMurid: [],
		totalMurid: 0,
		muridCount: 0,
		tanggal,
		mode,
		bulan: 0,
		tahun: 0,
		daysInMonth: 0,
		totalHariBelajar: 0,
		bulananRows: [],
		raporRows: [],
		persentaseBulananRows: [],
		redDays: [],
		tanggalMulaiRapor: '',
		tanggalAkhirRapor: '',
		presensiReady,
		presensiWarningMessage,
		jenisPresensi,
		tipePresensi: '',
		persentaseHarianSubjects: [],
		persentaseHarianRows: [],
		jadwalSaatIni: null,
		simulasiHari: simHari,
		simulasiJam: simJam
	};
}

export const actions = {
	update: (event: RequestEvent) => handleUpdate(event),
	isiSekaligus: (event: RequestEvent) => handleIsiSekaligus(event),
	deletePresensi: (event: RequestEvent) => handleDeletePresensi(event),
	updateRapor: (event: RequestEvent) => handleUpdateRapor(event),
	resetRapor: (event: RequestEvent) => handleResetRapor(event)
};
