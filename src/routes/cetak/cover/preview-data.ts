import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import db from '$lib/server/db';
import { tableMurid, tableSekolah } from '$lib/server/db/schema';
import type { CoverPrintData } from '$lib/server/pdf/templates/cover';

type CoverContext = {
	locals: App.Locals;
	url: URL;
};

function requireInteger(paramName: string, value: string | null): number {
	if (!value) {
		throw error(400, `Parameter ${paramName} wajib diisi.`);
	}
	const parsed = Number(value);
	if (!Number.isInteger(parsed)) {
		throw error(400, `Parameter ${paramName} tidak valid.`);
	}
	return parsed;
}

function optionalInteger(paramName: string, value: string | null): number | null {
	if (!value) return null;
	const parsed = Number(value);
	if (!Number.isInteger(parsed)) {
		throw error(400, `Parameter ${paramName} tidak valid.`);
	}
	return parsed;
}

async function getLogoSrc(sekolahId: number): Promise<string | null> {
	const row = await db.query.tableSekolah.findFirst({
		columns: { logo: true, logoType: true },
		where: eq(tableSekolah.id, sekolahId)
	});
	if (row?.logo?.length) {
		const b64 = Buffer.from(row.logo).toString('base64');
		return `data:${row.logoType || 'image/png'};base64,${b64}`;
	}
	return null;
}

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
