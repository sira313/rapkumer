import db from '$lib/server/db';
import { tableMurid } from '$lib/server/db/schema';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { writeAoaToBuffer } from '$lib/utils/excel.js';
import { and, asc, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

export async function GET({ locals }) {
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) {
		throw error(401, 'Sekolah tidak ditemukan');
	}

	const academicContext = await resolveSekolahAcademicContext(sekolahId);
	const activeSemesterId = academicContext.activeSemesterId;
	if (!activeSemesterId) {
		throw error(400, 'Belum ada semester aktif. Atur semester aktif di menu Rapor.');
	}

	const daftarMurid = await db.query.tableMurid.findMany({
		where: and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.semesterId, activeSemesterId)),
		orderBy: [asc(tableMurid.kelasId), asc(tableMurid.nama)],
		with: {
			kelas: { columns: { nama: true } },
			alamat: {
				columns: { jalan: true, desa: true, kecamatan: true, kabupaten: true, kodePos: true }
			},
			ayah: { columns: { nama: true, pekerjaan: true, kontak: true } },
			ibu: { columns: { nama: true, pekerjaan: true, kontak: true } },
			wali: { columns: { nama: true, pekerjaan: true, kontak: true } }
		}
	});

	const headers = [
		'Nama',
		'NIPD',
		'Rombel',
		'NISN',
		'Tempat Lahir',
		'Tanggal Lahir',
		'JK',
		'Agama',
		'Alamat',
		'Kelurahan',
		'Kecamatan',
		'Kabupaten',
		'Kode Pos',
		'Pendidikan Sebelumnya',
		'Telepon',
		'HP',
		'Email',
		'Kontak Orang Tua',
		'Nama Ayah',
		'Pekerjaan Ayah',
		'Kontak Ayah',
		'Nama Ibu',
		'Pekerjaan Ibu',
		'Kontak Ibu',
		'Nama Wali',
		'Pekerjaan Wali',
		'Kontak Wali'
	];

	const rows: unknown[][] = [headers];

	for (const murid of daftarMurid) {
		const alamat = murid.alamat;
		const ayah = murid.ayah;
		const ibu = murid.ibu;
		const wali = murid.wali;

		rows.push([
			murid.nama,
			murid.nis,
			murid.kelas?.nama ?? '',
			murid.nisn,
			murid.tempatLahir,
			murid.tanggalLahir,
			murid.jenisKelamin,
			murid.agama,
			alamat?.jalan ?? '',
			alamat?.desa ?? '',
			alamat?.kecamatan ?? '',
			alamat?.kabupaten ?? '',
			alamat?.kodePos ?? '',
			murid.pendidikanSebelumnya,
			'',
			'',
			'',
			'',
			ayah?.nama ?? '',
			ayah?.pekerjaan ?? '',
			ayah?.kontak ?? '',
			ibu?.nama ?? '',
			ibu?.pekerjaan ?? '',
			ibu?.kontak ?? '',
			wali?.nama ?? '',
			wali?.pekerjaan ?? '',
			wali?.kontak ?? ''
		]);
	}

	const buffer = await writeAoaToBuffer(rows);

	return new Response(new Uint8Array(buffer), {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': 'attachment; filename="Data Murid.xlsx"'
		}
	});
}
