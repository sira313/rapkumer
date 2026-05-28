import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import db from '$lib/server/db';
import { tableMurid } from '$lib/server/db/schema';
import type { CoverPrintData } from '$lib/server/pdf/templates/cover';
import { requireInteger, optionalInteger, getLogoSrc } from '$lib/server/pdf/preview-utils';

type CoverContext = {
	locals: App.Locals;
	url: URL;
};

export async function getCoverPreviewPayload({ locals, url }: CoverContext) {
	const sekolah = locals.sekolah;
	if (!sekolah?.id) {
		throw error(404, 'Sekolah tidak ditemukan.');
	}

	const muridId = requireInteger('murid_id', url.searchParams.get('murid_id'));
	const kelasId = optionalInteger('kelas_id', url.searchParams.get('kelas_id'));

	const murid = await db.query.tableMurid.findFirst({
		columns: {
			id: true,
			kelasId: true,
			nama: true,
			nis: true,
			nisn: true
		},
		where: and(
			eq(tableMurid.id, muridId),
			eq(tableMurid.sekolahId, sekolah.id),
			kelasId ? eq(tableMurid.kelasId, kelasId) : undefined
		)
	});

	if (!murid) {
		throw error(404, 'Data murid tidak ditemukan.');
	}

	if (kelasId && murid.kelasId !== kelasId) {
		throw error(400, 'Murid tidak terdaftar pada kelas yang diminta.');
	}

	const logoSrc = await getLogoSrc(sekolah.id);

	const coverData: CoverPrintData = {
		sekolah: {
			nama: sekolah.nama,
			jenjang: sekolah.jenjangPendidikan,
			jenjangVariant: sekolah.jenjangVariant ?? null,
			npsn: sekolah.npsn,
			naungan: sekolah.naungan ?? null,
			alamat: {
				jalan: sekolah.alamat?.jalan ?? '',
				desa: sekolah.alamat?.desa ?? '',
				kecamatan: sekolah.alamat?.kecamatan ?? '',
				kabupaten: sekolah.alamat?.kabupaten ?? '',
				provinsi: sekolah.alamat?.provinsi ?? null,
				kodePos: sekolah.alamat?.kodePos ?? null
			},
			website: sekolah.website ?? null,
			email: sekolah.email ?? null,
			logoSrc
		},
		murid: {
			nama: murid.nama,
			nis: murid.nis ?? '',
			nisn: murid.nisn ?? ''
		}
	};

	return {
		meta: {
			title: `Cover Rapor - ${murid.nama}`
		},
		coverData
	};
}
