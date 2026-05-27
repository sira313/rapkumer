import { error } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import db from '$lib/server/db';
import { tableMurid } from '$lib/server/db/schema';
import { jenisKelamin } from '$lib/statics';
import {
	requireInteger,
	optionalInteger,
	formatTanggal,
	fallbackTempat,
	getLogoSrc
} from '$lib/server/pdf/preview-utils';

type BiodataContext = {
	locals: App.Locals;
	url: URL;
};

type AlamatPayload = BiodataPrintData['murid']['alamat'];

type OrangTuaAlamatPayload = BiodataPrintData['orangTua']['alamat'];

type MuridJenisKelamin = keyof typeof jenisKelamin;

function mapJenisKelamin(value: string | null | undefined): string {
	if (!value) return '';
	return jenisKelamin[value as MuridJenisKelamin] ?? '';
}

function emptyAlamat(): AlamatPayload {
	return {
		jalan: '',
		kelurahan: '',
		kecamatan: '',
		kabupaten: '',
		provinsi: ''
	};
}

type GenericAlamatRecord = {
	jalan?: string | null;
	desa?: string | null;
	kecamatan?: string | null;
	kabupaten?: string | null;
	provinsi?: string | null;
};

function mapAlamat(alamat: GenericAlamatRecord | null | undefined): AlamatPayload {
	if (!alamat) return emptyAlamat();
	return {
		jalan: alamat.jalan ?? '',
		kelurahan: alamat.desa ?? '',
		kecamatan: alamat.kecamatan ?? '',
		kabupaten: alamat.kabupaten ?? '',
		provinsi: alamat.provinsi ?? ''
	};
}

function composeOrangTuaAlamat(
	raw: string | null | undefined,
	fallback: AlamatPayload
): OrangTuaAlamatPayload {
	if (!raw) {
		return { ...fallback };
	}
	const parts = raw
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);

	const [jalan, kelurahan, kecamatan, kabupaten, provinsi] = parts;

	return {
		jalan: jalan ?? fallback.jalan,
		kelurahan: kelurahan ?? fallback.kelurahan,
		kecamatan: kecamatan ?? fallback.kecamatan,
		kabupaten: kabupaten ?? fallback.kabupaten,
		provinsi: provinsi ?? fallback.provinsi
	};
}

function uploadsDir(): string {
	const envPhoto = process.env.photo || 'file:./data/uploads';
	const raw = envPhoto.startsWith('file:') ? envPhoto.slice(5) : envPhoto;
	return path.resolve(raw);
}

function readFotoDataUri(filename: string | null | undefined): string | null {
	if (!filename) return null;
	try {
		const filePath = path.join(uploadsDir(), filename);
		const buffer = fs.readFileSync(filePath);
		const ext = path.extname(filename).toLowerCase();
		const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
		return `data:${mime};base64,${buffer.toString('base64')}`;
	} catch {
		return null;
	}
}

export async function getBiodataPreviewPayload({ locals, url }: BiodataContext) {
	const sekolah = locals.sekolah;
	if (!sekolah?.id) {
		throw error(404, 'Sekolah tidak ditemukan.');
	}

	const muridId = requireInteger('murid_id', url.searchParams.get('murid_id'));
	const kelasId = optionalInteger('kelas_id', url.searchParams.get('kelas_id'));

	const murid = await db.query.tableMurid.findFirst({
		where: and(
			eq(tableMurid.id, muridId),
			eq(tableMurid.sekolahId, sekolah.id),
			kelasId ? eq(tableMurid.kelasId, kelasId) : undefined
		),
		with: {
			alamat: true,
			ayah: true,
			ibu: true,
			wali: true,
			semester: true
		}
	});

	if (!murid) {
		throw error(404, 'Data murid tidak ditemukan.');
	}

	if (kelasId && murid.kelasId !== kelasId) {
		throw error(400, 'Murid tidak terdaftar pada kelas yang diminta.');
	}

	const alamatMurid = mapAlamat(murid.alamat ?? null);
	const alamatOrangTua = composeOrangTuaAlamat(
		murid.ayah?.alamat || murid.ibu?.alamat || null,
		alamatMurid
	);

	const tanggalTtd = formatTanggal(murid.semester?.tanggalBagiRaport ?? murid.tanggalMasuk);

	const showBgLogo = url.searchParams.get('bg_logo') === '1';
	const bgLogoSrc = showBgLogo ? await getLogoSrc(sekolah.id) : null;

	const biodataData: BiodataPrintData = {
		sekolah: {
			nama: sekolah.nama,
			bgLogoSrc,
			statusKepalaSekolah: sekolah.statusKepalaSekolah ?? 'definitif'
		},
		showBgLogo,
		murid: {
			id: murid.id,
			foto: readFotoDataUri(murid.foto),
			nama: murid.nama,
			nis: murid.nis,
			nisn: murid.nisn,
			tempatLahir: murid.tempatLahir,
			tanggalLahir: formatTanggal(murid.tanggalLahir),
			jenisKelamin: mapJenisKelamin(murid.jenisKelamin),
			agama: murid.agama,
			pendidikanSebelumnya: murid.pendidikanSebelumnya,
			alamat: alamatMurid
		},
		orangTua: {
			ayah: {
				nama: murid.ayah?.nama ?? '',
				pekerjaan: murid.ayah?.pekerjaan ?? ''
			},
			ibu: {
				nama: murid.ibu?.nama ?? '',
				pekerjaan: murid.ibu?.pekerjaan ?? ''
			},
			alamat: alamatOrangTua
		},
		wali: {
			nama: murid.wali?.nama ?? '',
			pekerjaan: murid.wali?.pekerjaan ?? '',
			alamat: murid.wali?.alamat ?? ''
		},
		ttd: {
			tempat: fallbackTempat(sekolah),
			tanggal: tanggalTtd,
			kepalaSekolah: sekolah.kepalaSekolah?.nama ?? '',
			nip: sekolah.kepalaSekolah?.nip ?? ''
		}
	};

	return {
		meta: {
			title: `Biodata Murid - ${murid.nama}`
		},
		biodataData
	};
}
