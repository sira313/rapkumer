import { redirect, type RequestEvent } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isValidDate, todayDateString } from '$lib/server/absen/utils';
import { checkPresensiReadiness } from '$lib/server/absen/presensi';
import { loadBulanan } from '$lib/server/absen/load-bulanan';
import { loadPersentaseBulanan } from '$lib/server/absen/load-persentase-bulanan';
import { loadPersentaseSemester } from '$lib/server/absen/load-persentase-semester';
import { loadRapor } from '$lib/server/absen/load-rapor';
import ExcelJS from 'exceljs';
import { fail } from '@sveltejs/kit';
import db from '$lib/server/db';
import { tableMurid, tableKetidakhadiranHarian, tableAbsensi } from '$lib/server/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { loadHarian } from '$lib/server/absen/load-harian';
import { canUserEditAbsen } from '$lib/server/absen/utils';
import { cookieNames } from '$lib/utils';
import type { AbsenLoadData } from '$lib/server/absen/types';
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
import { tableKelas, tableAuthUserMataPelajaran } from '$lib/server/db/schema';

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
	const kelasSemesterId = kelasRecordTa?.semesterId ?? null;

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
			return defaultEmpty(
				'bulanan',
				search,
				tanggal,
				simHari,
				simJam,
				presensiReady,
				presensiWarningMessage,
				presensiSettings?.jenisPresensi ?? 'wali_kelas_saja',
				presensiSettings?.tipePresensi
			);
		}
		const bulanParam = url.searchParams.get('bulan');
		const tahunParam = url.searchParams.get('tahun');
		const now = new Date();
		const bulan = bulanParam ? Number(bulanParam) : now.getMonth() + 1;
		const tahun = tahunParam ? Number(tahunParam) : now.getFullYear();
		if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) {
			return defaultEmpty(
				'bulanan',
				search,
				tanggal,
				simHari,
				simJam,
				presensiReady,
				presensiWarningMessage,
				presensiSettings?.jenisPresensi ?? 'wali_kelas_saja',
				presensiSettings?.tipePresensi
			);
		}
		if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2099) {
			return defaultEmpty(
				'bulanan',
				search,
				tanggal,
				simHari,
				simJam,
				presensiReady,
				presensiWarningMessage,
				presensiSettings?.jenisPresensi ?? 'wali_kelas_saja',
				presensiSettings?.tipePresensi
			);
		}
		if (!presensiSettings) {
			return defaultEmpty(
				'bulanan',
				search,
				tanggal,
				simHari,
				simJam,
				presensiReady,
				presensiWarningMessage,
				'wali_kelas_saja'
			);
		}
		return loadBulanan({
			sekolahId,
			kelasId: kelasAktif.id,
			search,
			pageNumber,
			bulan,
			tahun,
			presensiSettings,
			simHari,
			simJam,
			url
		});
	}

	if (mode === 'persentase_bulanan') {
		if (!sekolahId || !kelasAktif?.id) {
			return defaultEmpty(
				'persentase_bulanan',
				search,
				tanggal,
				simHari,
				simJam,
				presensiReady,
				presensiWarningMessage,
				presensiSettings?.jenisPresensi ?? 'wali_kelas_saja',
				presensiSettings?.tipePresensi
			);
		}
		const bulanParam = url.searchParams.get('bulan');
		const tahunParam = url.searchParams.get('tahun');
		const now = new Date();
		const bulan = bulanParam ? Number(bulanParam) : now.getMonth() + 1;
		const tahun = tahunParam ? Number(tahunParam) : now.getFullYear();
		if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) {
			return defaultEmpty(
				'persentase_bulanan',
				search,
				tanggal,
				simHari,
				simJam,
				presensiReady,
				presensiWarningMessage,
				presensiSettings?.jenisPresensi ?? 'wali_kelas_saja',
				presensiSettings?.tipePresensi
			);
		}
		if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2099) {
			return defaultEmpty(
				'persentase_bulanan',
				search,
				tanggal,
				simHari,
				simJam,
				presensiReady,
				presensiWarningMessage,
				presensiSettings?.jenisPresensi ?? 'wali_kelas_saja',
				presensiSettings?.tipePresensi
			);
		}
		if (!presensiSettings) {
			return defaultEmpty(
				'persentase_bulanan',
				search,
				tanggal,
				simHari,
				simJam,
				presensiReady,
				presensiWarningMessage,
				'wali_kelas_saja'
			);
		}
		return loadPersentaseBulanan({
			sekolahId,
			kelasId: kelasAktif.id,
			search,
			pageNumber,
			bulan,
			tahun,
			presensiSettings,
			simHari,
			simJam,
			url
		});
	}

	if (mode === 'persentase_semester') {
		if (!sekolahId || !kelasAktif?.id) {
			return defaultEmpty(
				'persentase_semester',
				search,
				tanggal,
				simHari,
				simJam,
				presensiReady,
				presensiWarningMessage,
				presensiSettings?.jenisPresensi ?? 'wali_kelas_saja',
				presensiSettings?.tipePresensi
			);
		}
		if (!presensiSettings) {
			return defaultEmpty(
				'persentase_semester',
				search,
				tanggal,
				simHari,
				simJam,
				presensiReady,
				presensiWarningMessage,
				'wali_kelas_saja'
			);
		}
		if (!tahunAjaranId || !kelasSemesterId) {
			return defaultEmpty(
				'persentase_semester',
				search,
				tanggal,
				simHari,
				simJam,
				false,
				'Kelas belum memiliki tahun ajaran atau semester. Atur di halaman /akademik.',
				presensiSettings.jenisPresensi ?? 'wali_kelas_saja',
				presensiSettings.tipePresensi
			);
		}
		return loadPersentaseSemester({
			sekolahId,
			kelasId: kelasAktif.id,
			search,
			pageNumber,
			academicContext,
			presensiSettings,
			simHari,
			simJam,
			url,
			tahunAjaranId,
			semesterId: kelasSemesterId
		});
	}

	if (mode === 'rapor') {
		if (!sekolahId || !kelasAktif?.id) {
			return defaultEmpty(
				'rapor',
				search,
				tanggal,
				simHari,
				simJam,
				presensiReady,
				presensiWarningMessage,
				presensiSettings?.jenisPresensi ?? 'wali_kelas_saja',
				presensiSettings?.tipePresensi
			);
		}
		if (!presensiSettings) {
			return defaultEmpty(
				'rapor',
				search,
				tanggal,
				simHari,
				simJam,
				presensiReady,
				presensiWarningMessage,
				'wali_kelas_saja'
			);
		}
		if (!tahunAjaranId || !kelasSemesterId) {
			return defaultEmpty(
				'rapor',
				search,
				tanggal,
				simHari,
				simJam,
				false,
				'Kelas belum memiliki tahun ajaran atau semester. Atur di halaman /akademik.',
				presensiSettings.jenisPresensi ?? 'wali_kelas_saja',
				presensiSettings.tipePresensi
			);
		}
		return loadRapor({
			sekolahId,
			kelasId: kelasAktif.id,
			search,
			pageNumber,
			academicContext,
			presensiSettings,
			simHari,
			simJam,
			url,
			tahunAjaranId,
			semesterId: kelasSemesterId
		});
	}

	// harian / persentase_harian
	if (!sekolahId || !kelasAktif?.id) {
		return defaultEmpty(
			mode as 'harian' | 'persentase_harian',
			search,
			tanggal,
			simHari,
			simJam,
			presensiReady,
			presensiWarningMessage,
			presensiSettings?.jenisPresensi ?? 'wali_kelas_saja',
			presensiSettings?.tipePresensi
		);
	}
	if (!presensiSettings) {
		return defaultEmpty(
			mode as 'harian' | 'persentase_harian',
			search,
			tanggal,
			simHari,
			simJam,
			presensiReady,
			presensiWarningMessage,
			'wali_kelas_saja'
		);
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
};

function defaultEmpty(
	mode:
		| 'harian'
		| 'persentase_harian'
		| 'bulanan'
		| 'persentase_bulanan'
		| 'persentase_semester'
		| 'rapor',
	search: string | null,
	tanggal: string,
	simHari: string | null,
	simJam: string | null,
	presensiReady: boolean,
	presensiWarningMessage: string,
	jenisPresensi: string,
	tipePresensi?: string
): AbsenLoadData {
	return {
		meta: { title: 'Presensi Murid' },
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
		totalPertemuan: 0,
		bulananRows: [],
		raporRows: [],
		persentaseBulananRows: [],
		persentaseSemesterRows: [],
		redDays: [],
		tanggalMulaiRapor: '',
		tanggalAkhirRapor: '',
		presensiReady,
		presensiWarningMessage,
		jenisPresensi,
		tipePresensi: tipePresensi ?? '',
		persentaseHarianSubjects: [],
		persentaseHarianRows: [],
		jadwalSaatIni: null,
		guruMapelSubject: null,
		isMapelOnJadwal: false,
		harianMapelId: null,
		simulasiHari: simHari,
		simulasiJam: simJam,
		isLibur: false
	};
}

export const actions = {
	importPresensi: async ({ request, locals, url, cookies }: RequestEvent) => {
		if (!locals.user || !locals.sekolah) return fail(403, { fail: 'Tidak memiliki izin' });
		if (!(await canUserEditAbsen(locals.user, locals.sekolah.id))) {
			return fail(403, { fail: 'Anda tidak memiliki izin untuk mengubah data kehadiran' });
		}
		const file = (await request.formData()).get('file');
		if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx'))
			return fail(400, { fail: 'File Excel (.xlsx) tidak valid' });
		const workbook = new ExcelJS.Workbook() as unknown as {
			xlsx: { load(data: ArrayBuffer): Promise<void> };
			worksheets: Array<{
				getRows(start: number, count: number): Array<{ getCell(col: number): { value: unknown } }>;
			}>;
		};
		await workbook.xlsx.load(await file.arrayBuffer());
		const sheet = workbook.worksheets[0];
		if (!sheet) return fail(400, { fail: 'Sheet Excel tidak ditemukan' });
		const rows = sheet.getRows(1, 10000);
		const header = rows.findIndex((row) =>
			String(row.getCell(2).value ?? '')
				.toUpperCase()
				.includes('NAMA SISWA')
		);
		if (header < 0) return fail(400, { fail: 'Gunakan template Download Rekap Presensi' });
		const kelasId = Number(cookies.get(cookieNames.ACTIVE_KELAS_ID) || '');
		const murid = await db
			.select({ id: tableMurid.id, nama: tableMurid.nama })
			.from(tableMurid)
			.where(
				and(
					eq(tableMurid.sekolahId, locals.sekolah.id),
					...(kelasId ? [eq(tableMurid.kelasId, kelasId)] : [])
				)
			);
		const byName = new Map(murid.map((m) => [m.nama.trim().toLowerCase(), m.id]));
		const bulanNames = [
			'JANUARI',
			'FEBRUARI',
			'MARET',
			'APRIL',
			'MEI',
			'JUNI',
			'JULI',
			'AGUSTUS',
			'SEPTEMBER',
			'OKTOBER',
			'NOVEMBER',
			'DESEMBER'
		];
		const monthRow = rows.slice(0, header).find((row) =>
			String(row.getCell(1).value ?? '')
				.toUpperCase()
				.startsWith('BULAN ')
		);
		const monthMatch = String(monthRow?.getCell(1).value ?? '')
			.toUpperCase()
			.match(/^BULAN\s+(.+)\s+(\d{4})$/);
		const templateParts = monthMatch?.[1]?.split(' ') ?? [];
		const templateMonth = bulanNames.findIndex((name) => templateParts.includes(name)) + 1;
		const bulan =
			templateMonth || Number(url.searchParams.get('bulan')) || new Date().getMonth() + 1;
		const tahun =
			Number(monthMatch?.[2]) || Number(url.searchParams.get('tahun')) || new Date().getFullYear();
		let count = 0;
		for (const row of rows.slice(header + 2)) {
			const muridId = byName.get(
				String(row.getCell(2).value ?? '')
					.trim()
					.toLowerCase()
			);
			if (!muridId) continue;
			for (let col = 4; col <= 34; col++) {
				const status = String(row.getCell(col).value ?? '')
					.trim()
					.toUpperCase();
				if (!['H', 'S', 'I', 'TK'].includes(status)) continue;
				const day = col - 3;
				const tanggal = `${tahun}-${String(bulan).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
				const tanggalDate = new Date(tahun, bulan - 1, day);
				if (
					tanggalDate.getFullYear() !== tahun ||
					tanggalDate.getMonth() !== bulan - 1 ||
					tanggalDate.getDate() !== day
				)
					continue;
				await db
					.delete(tableKetidakhadiranHarian)
					.where(
						and(
							eq(tableKetidakhadiranHarian.muridId, muridId),
							eq(tableKetidakhadiranHarian.tanggal, tanggal),
							sql`${tableKetidakhadiranHarian.mataPelajaranId} IS NULL`
						)
					);
				const start = new Date(`${tanggal}T08:00:00`).toISOString();
				await db
					.delete(tableAbsensi)
					.where(
						and(
							eq(tableAbsensi.muridId, muridId),
							sql`substr(${tableAbsensi.waktu}, 1, 10) = ${tanggal}`,
							sql`${tableAbsensi.mataPelajaranId} IS NULL`
						)
					);
				if (status === 'H')
					await db.insert(tableAbsensi).values({ muridId, waktu: start, mataPelajaranId: null });
				else if (status !== 'TK')
					await db
						.insert(tableKetidakhadiranHarian)
						.values({
							muridId,
							tanggal,
							mataPelajaranId: null,
							keterangan: status === 'S' ? 'sakit' : status === 'I' ? 'izin' : 'alfa'
						});
				count++;
			}
		}
		return { success: `${count} data presensi diproses` };
	},
	update: (event: RequestEvent) => handleUpdate(event),
	isiSekaligus: (event: RequestEvent) => handleIsiSekaligus(event),
	deletePresensi: (event: RequestEvent) => handleDeletePresensi(event),
	updateRapor: (event: RequestEvent) => handleUpdateRapor(event),
	resetRapor: (event: RequestEvent) => handleResetRapor(event)
};
