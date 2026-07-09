import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import db from '$lib/server/db';
import { ensureJurnalMengajarSchema } from '$lib/server/db/ensure-jurnal-mengajar';
import {
	tableJurnalMengajar,
	tableKelas,
	tableMataPelajaran,
	tableTujuanPembelajaran,
	tableMurid,
	tableKetidakhadiranHarian,
	tableSemester,
	tableTahunAjaran,
	tableSekolah,
	tablePegawai
} from '$lib/server/db/schema';
import { renderPDF } from '$lib/server/pdf/pagedpdf';
import { renderJurnalMengajarHTML } from '$lib/server/pdf/templates/jurnal-mengajar';
import { formatTanggal } from '$lib/server/pdf/preview-utils';
import type { RequestHandler } from './$types';

export const GET = (async ({ locals, url }) => {
	const sekolahId = locals.sekolah?.id;
	const user = locals.user as {
		id?: number;
		type?: string;
		pegawaiId?: number;
		kelasId?: number | null;
		mataPelajaranId?: number | null;
	} | null;

	if (!sekolahId || !user?.id) {
		throw error(401, 'Unauthorized');
	}

	await ensureJurnalMengajarSchema();

	const tanggalMulai = url.searchParams.get('tanggal_mulai');
	const tanggalSelesai = url.searchParams.get('tanggal_selesai');

	// For guru mapel ('user' type), scope to their assigned subject only
	const mataPelajaranFilter =
		user?.type === 'user' && user?.mataPelajaranId
			? eq(tableJurnalMengajar.mataPelajaranId, user.mataPelajaranId)
			: undefined;

	if (!tanggalMulai || !tanggalSelesai) {
		throw error(400, 'Parameter tanggal_mulai dan tanggal_selesai wajib diisi');
	}

	// Get active semester info
	const semester = await db
		.select({
			tahunAjaranNama: tableTahunAjaran.nama,
			semesterNama: tableSemester.nama,
			tipe: tableSemester.tipe
		})
		.from(tableSemester)
		.innerJoin(tableTahunAjaran, eq(tableSemester.tahunAjaranId, tableTahunAjaran.id))
		.where(and(eq(tableTahunAjaran.sekolahId, sekolahId), eq(tableSemester.isAktif, true)))
		.limit(1)
		.then((r) => r[0]);

	// Get user pegawai data
	let userName = '';
	let guruNip: string | null = null;
	if (user.pegawaiId) {
		const peg = await db.query.tablePegawai.findFirst({
			columns: { nama: true, nip: true },
			where: eq(tablePegawai.id, user.pegawaiId)
		});
		userName = peg?.nama ?? '';
		guruNip = peg?.nip ?? null;
	}

	// Fetch journal entries within date range for the current user
	const rows = await db
		.select({
			id: tableJurnalMengajar.id,
			tanggal: tableJurnalMengajar.tanggal,
			jamPelajaran: tableJurnalMengajar.jamPelajaran,
			lingkupMateri: tableJurnalMengajar.lingkupMateri,
			catatan: tableJurnalMengajar.catatan,
			kelasId: tableJurnalMengajar.kelasId,
			mataPelajaranId: tableJurnalMengajar.mataPelajaranId,
			tujuanPembelajaranId: tableJurnalMengajar.tujuanPembelajaranId,
			kelasNama: tableKelas.nama,
			mapelNama: tableMataPelajaran.nama,
			tpDeskripsi: tableTujuanPembelajaran.deskripsi
		})
		.from(tableJurnalMengajar)
		.leftJoin(tableKelas, eq(tableJurnalMengajar.kelasId, tableKelas.id))
		.leftJoin(tableMataPelajaran, eq(tableJurnalMengajar.mataPelajaranId, tableMataPelajaran.id))
		.leftJoin(
			tableTujuanPembelajaran,
			eq(tableJurnalMengajar.tujuanPembelajaranId, tableTujuanPembelajaran.id)
		)
		.where(
			and(
				eq(tableJurnalMengajar.authUserId, user.id),
				sql`${tableJurnalMengajar.tanggal} >= ${tanggalMulai}`,
				sql`${tableJurnalMengajar.tanggal} <= ${tanggalSelesai}`,
				...(mataPelajaranFilter ? [mataPelajaranFilter] : [])
			)
		)
		.orderBy(asc(tableJurnalMengajar.tanggal));

	// Calculate attendance (H/S/I/A) for each journal entry — batched
	const uniqueKelasIds = [...new Set(rows.map((r) => r.kelasId))];
	const uniqueDates = [...new Set(rows.map((r) => r.tanggal))];

	const studentCounts =
		uniqueKelasIds.length > 0
			? await db
					.select({
						kelasId: tableMurid.kelasId,
						total: sql<number>`count(*)`
					})
					.from(tableMurid)
					.where(
						and(inArray(tableMurid.kelasId, uniqueKelasIds), eq(tableMurid.sekolahId, sekolahId))
					)
					.groupBy(tableMurid.kelasId)
			: [];
	const studentCountMap = new Map(studentCounts.map((s) => [s.kelasId, s.total]));

	const allAbsences: Array<{
		tanggal: string;
		kelasId: number;
		sakit: number;
		izin: number;
		alfa: number;
	}> =
		uniqueKelasIds.length > 0 && uniqueDates.length > 0
			? await db
					.select({
						tanggal: tableKetidakhadiranHarian.tanggal,
						kelasId: tableMurid.kelasId,
						sakit: sql<number>`COALESCE(SUM(CASE WHEN ${tableKetidakhadiranHarian.keterangan} = 'sakit' THEN 1 ELSE 0 END), 0)`,
						izin: sql<number>`COALESCE(SUM(CASE WHEN ${tableKetidakhadiranHarian.keterangan} = 'izin' THEN 1 ELSE 0 END), 0)`,
						alfa: sql<number>`COALESCE(SUM(CASE WHEN ${tableKetidakhadiranHarian.keterangan} = 'alfa' THEN 1 ELSE 0 END), 0)`
					})
					.from(tableKetidakhadiranHarian)
					.innerJoin(tableMurid, eq(tableKetidakhadiranHarian.muridId, tableMurid.id))
					.where(
						and(
							inArray(tableKetidakhadiranHarian.tanggal, uniqueDates),
							inArray(tableMurid.kelasId, uniqueKelasIds),
							eq(tableMurid.sekolahId, sekolahId)
						)
					)
					.groupBy(tableKetidakhadiranHarian.tanggal, tableMurid.kelasId)
			: [];

	const absenceMap = new Map<string, { sakit: number; izin: number; alfa: number }>();
	for (const a of allAbsences) {
		absenceMap.set(`${a.tanggal}|${a.kelasId}`, {
			sakit: Number(a.sakit),
			izin: Number(a.izin),
			alfa: Number(a.alfa)
		});
	}

	const rowsWithAttendance = rows.map((row) => {
		const total = studentCountMap.get(row.kelasId) ?? 0;
		const absences = absenceMap.get(`${row.tanggal}|${row.kelasId}`) ?? {
			sakit: 0,
			izin: 0,
			alfa: 0
		};
		const hadir = Math.max(0, total - absences.sakit - absences.izin - absences.alfa);

		return {
			tanggal: row.tanggal,
			kelas: row.kelasNama ?? '',
			mataPelajaran: row.mapelNama ?? '',
			jamPelajaran: row.jamPelajaran,
			lingkupMateri: row.lingkupMateri,
			tujuanPembelajaran: row.tpDeskripsi ?? '',
			hadir,
			sakit: absences.sakit,
			izin: absences.izin,
			alfa: absences.alfa,
			catatan: row.catatan ?? ''
		};
	});

	// Get sekolah name + kepala sekolah + tempat tanda tangan
	const sekolah = await db.query.tableSekolah.findFirst({
		columns: {
			nama: true,
			kepalaSekolahId: true,
			lokasiTandaTangan: true,
			statusKepalaSekolah: true
		},
		where: eq(tableSekolah.id, sekolahId)
	});

	// Get kepala sekolah info
	let kepalaSekolahNama = '';
	let kepalaSekolahNip: string | null = null;
	const kepalaSekolahStatus = sekolah?.statusKepalaSekolah;
	if (sekolah?.kepalaSekolahId) {
		const kepala = await db.query.tablePegawai.findFirst({
			columns: { nama: true, nip: true },
			where: eq(tablePegawai.id, sekolah.kepalaSekolahId)
		});
		kepalaSekolahNama = kepala?.nama ?? '';
		kepalaSekolahNip = kepala?.nip ?? null;
	}

	// Determine label
	const userType = user?.type ?? '';
	const isWaliKelas = userType === 'wali_kelas';
	const guruLabel = isWaliKelas ? 'Wali Kelas' : 'Guru Mata Pelajaran';

	const tempatTtd = sekolah?.lokasiTandaTangan ?? '';
	const tanggalTtd = new Date().toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});

	const printData = {
		sekolah: {
			nama: sekolah?.nama ?? ''
		},
		murid: {
			nama: userName,
			nis: ''
		},
		periode: {
			tahunPelajaran: semester?.tahunAjaranNama ?? '',
			semester: semester?.tipe ?? '',
			tanggalMulai: formatTanggal(tanggalMulai),
			tanggalSelesai: formatTanggal(tanggalSelesai)
		},
		rows: rowsWithAttendance,
		kepalaSekolah: {
			nama: kepalaSekolahNama,
			nip: kepalaSekolahNip,
			statusKepalaSekolah: kepalaSekolahStatus
		},
		guru: {
			nama: userName,
			nip: guruNip
		},
		isWaliKelas,
		guruLabel,
		ttd: {
			tempat: tempatTtd,
			tanggal: tanggalTtd
		}
	};

	const html = renderJurnalMengajarHTML(printData);
	const pdf = await renderPDF(html);
	const pdfBuffer = Buffer.from(pdf);

	return new Response(new Blob([pdfBuffer], { type: 'application/pdf' }), {
		headers: {
			'Content-Disposition': `inline; filename="jurnal-mengajar.pdf"`
		}
	});
}) satisfies RequestHandler;
