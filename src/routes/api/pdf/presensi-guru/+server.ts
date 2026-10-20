import { error } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import db from '$lib/server/db';
import { ensurePresensiGuruSchema } from '$lib/server/db/ensure-presensi-guru';
import {
	tableAuthUser,
	tablePegawai,
	tableSekolah,
	tableSemester,
	tableTahunAjaran
} from '$lib/server/db/schema';
import { listPresensiBulanan, getPresensiGuruSettings } from '$lib/server/presensi-guru';
import { renderPDF } from '$lib/server/pdf/pagedpdf';
import {
	renderPresensiGuruHTML,
	singkatJabatan,
	type PresensiGuruPrintRow
} from '$lib/server/pdf/templates/presensi-guru';
import { signatureToDataUrl } from '$lib/server/ttd';
import type { RequestHandler } from './$types';

const BULAN_NAMES = [
	'Januari',
	'Februari',
	'Maret',
	'April',
	'Mei',
	'Juni',
	'Juli',
	'Agustus',
	'September',
	'Oktober',
	'November',
	'Desember'
];

/** Format input date (YYYY-MM-DD) as dd-mm-yyyy to fit narrow cells. */
function formatTanggalInput(value: string | null | undefined): string {
	if (!value) return '';
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
	if (!m) return value;
	return `${m[3]}-${m[2]}-${m[1]}`;
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');
	if (user.type !== 'admin' && user.type !== 'kepala_sekolah') {
		throw error(403, 'Hanya admin yang dapat mencetak presensi guru.');
	}

	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw error(400, 'Sekolah belum diatur.');

	await ensurePresensiGuruSchema();

	const presensiSettings = await getPresensiGuruSettings(sekolahId);
	if (presensiSettings?.presensiGuruEnabled === false) {
		throw error(400, 'Fitur presensi guru sedang dinonaktifkan.');
	}

	const bulan = Number(url.searchParams.get('bulan'));
	const tahun = Number(url.searchParams.get('tahun'));
	if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) {
		throw error(400, 'Parameter bulan tidak valid.');
	}
	if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2099) {
		throw error(400, 'Parameter tahun tidak valid.');
	}

	const {
		rows,
		redDays,
		weekendDays,
		liburNasionalDays,
		liburSemesterDays,
		totalHariBelajar,
		daysInMonth
	} = await listPresensiBulanan(sekolahId, bulan, tahun);

	const guruIds = rows.map((r) => r.userId);
	const profiles = guruIds.length
		? await db.query.tableAuthUser.findMany({
				columns: {
					id: true,
					namaLengkap: true,
					tempatLahir: true,
					tanggalLahir: true,
					jenisKelamin: true,
					ijazah: true,
					tahunIjazah: true,
					jabatan: true,
					golongan: true,
					tanggalDiangkat: true,
					tanggalBekerja: true,
					statusKepegawaian: true,
					tanggalGajiBerkala: true,
					tanggalPangkat: true
				},
				with: { pegawai: { columns: { nama: true, nip: true } } },
				where: inArray(tableAuthUser.id, guruIds)
			})
		: [];
	const profileByUser = new Map(profiles.map((p) => [p.id, p]));

	// Deduplicate signature file reads across all rows/days.
	const sigCache = new Map<string, string>();
	async function toDataUrl(value: string | null | undefined): Promise<string> {
		if (!value) return '';
		const cached = sigCache.get(value);
		if (cached !== undefined) return cached;
		const url = (await signatureToDataUrl(value)) ?? '';
		sigCache.set(value, url);
		return url;
	}

	const printRows: PresensiGuruPrintRow[] = await Promise.all(
		rows.map(async (row, i) => {
			const prof = profileByUser.get(row.userId);
			const signaturesPerDay = await Promise.all(row.signaturesPerDay.map(toDataUrl));
			return {
				no: i + 1,
				nama: prof?.namaLengkap ?? prof?.pegawai?.nama ?? row.nama,
				nip: prof?.pegawai?.nip ?? '',
				tempatLahir: prof?.tempatLahir ?? '',
				tanggalLahir: formatTanggalInput(prof?.tanggalLahir),
				jenisKelamin: prof?.jenisKelamin ?? '',
				ijazah: prof?.ijazah ?? '',
				tahunIjazah: prof?.tahunIjazah != null ? String(prof.tahunIjazah) : '',
				jabatan: singkatJabatan(prof?.jabatan),
				golongan: prof?.golongan ?? '',
				tanggalDiangkat: formatTanggalInput(prof?.tanggalDiangkat),
				tanggalBekerja: formatTanggalInput(prof?.tanggalBekerja),
				statusKepegawaian: prof?.statusKepegawaian ?? '',
				tanggalGajiBerkala: formatTanggalInput(prof?.tanggalGajiBerkala),
				pangkat: formatTanggalInput(prof?.tanggalPangkat),
				statusPerDay: row.statusPerDay,
				signaturesPerDay,
				countHadir: row.countHadir,
				countIzin: row.countIzin,
				countSakit: row.countSakit,
				countDinasLuar: row.countDinasLuar,
				countCuti: row.countCuti,
				countBelum: row.countBelum
			};
		})
	);

	const sekolah = await db.query.tableSekolah.findFirst({
		columns: { nama: true, kepalaSekolahId: true, statusKepalaSekolah: true },
		where: eq(tableSekolah.id, sekolahId)
	});

	let kepalaSekolahNama = '';
	let kepalaSekolahNip: string | null = null;
	if (sekolah?.kepalaSekolahId) {
		const kepala = await db.query.tablePegawai.findFirst({
			columns: { nama: true, nip: true },
			where: eq(tablePegawai.id, sekolah.kepalaSekolahId)
		});
		kepalaSekolahNama = kepala?.nama ?? '';
		kepalaSekolahNip = kepala?.nip ?? null;
	}

	// Last working day of the month = last day not on a libur day.
	let tanggalTtd = '';
	for (let d = daysInMonth; d >= 1; d--) {
		if (!redDays.includes(d)) {
			const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][
				new Date(tahun, bulan - 1, d).getDay()
			];
			tanggalTtd = `${hari}, ${d} ${BULAN_NAMES[bulan - 1]} ${tahun}`;
			break;
		}
	}

	const semester = await db
		.select({
			tahunAjaranNama: tableTahunAjaran.nama,
			semesterTipe: tableSemester.tipe
		})
		.from(tableSemester)
		.innerJoin(tableTahunAjaran, eq(tableSemester.tahunAjaranId, tableTahunAjaran.id))
		.where(and(eq(tableTahunAjaran.sekolahId, sekolahId), eq(tableSemester.isAktif, true)))
		.limit(1)
		.then((r) => r[0]);

	const printData = {
		sekolah: {
			id: sekolahId,
			nama: sekolah?.nama ?? ''
		},
		periode: {
			tahunPelajaran: semester?.tahunAjaranNama ?? '',
			semester: semester?.semesterTipe === 'ganjil' ? 'Ganjil' : 'Genap',
			bulan: BULAN_NAMES[bulan - 1] ?? '',
			tahun,
			hariBelajar: totalHariBelajar
		},
		redDays,
		weekendDays,
		liburNasionalDays,
		liburSemesterDays,
		daysInMonth,
		rows: printRows,
		kepalaSekolah: {
			nama: kepalaSekolahNama,
			nip: kepalaSekolahNip,
			statusKepalaSekolah: sekolah?.statusKepalaSekolah ?? null
		},
		tanggalTtd
	};

	const html = renderPresensiGuruHTML(printData);
	const pdf = await renderPDF(html);
	const pdfBuffer = Buffer.from(pdf);

	return new Response(new Blob([pdfBuffer], { type: 'application/pdf' }), {
		headers: {
			'Content-Disposition': `inline; filename="presensi-guru-${bulan}-${tahun}.pdf"`
		}
	});
};
