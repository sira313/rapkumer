import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import db from '$lib/server/db';
import { tableMurid } from '$lib/server/db/schema';
import { requireInteger, optionalInteger, getLogoSrc } from '$lib/server/pdf/preview-utils';
import type { KartuMuridData } from '$lib/server/pdf/templates/kartu-murid';

type KartuMuridContext = {
	locals: App.Locals;
	url: URL;
};

export async function getKartuMuridPreviewPayload({ locals, url }: KartuMuridContext) {
	const sekolah = locals.sekolah;
	if (!sekolah?.id) {
		throw error(404, 'Sekolah tidak ditemukan.');
	}

	const muridId = requireInteger('murid_id', url.searchParams.get('murid_id'));
	const kelasId = optionalInteger('kelas_id', url.searchParams.get('kelas_id'));

	const murid = await db.query.tableMurid.findFirst({
		columns: { nama: true, nis: true, nisn: true },
		where: and(
			eq(tableMurid.id, muridId),
			eq(tableMurid.sekolahId, sekolah.id),
			kelasId ? eq(tableMurid.kelasId, kelasId) : undefined
		)
	});

	if (!murid) {
		throw error(404, 'Data murid tidak ditemukan.');
	}

	const logo = await getLogoSrc(sekolah.id);

	const qrText = `Nama: ${murid.nama}\nNISN: ${murid.nisn}`;
	const qrSvg = await QRCode.toString(qrText, { type: 'svg', margin: 1 });
	const qrDataUri = `data:image/svg+xml;base64,${Buffer.from(qrSvg, 'utf-8').toString('base64')}`;

	const kartuMuridData: KartuMuridData = {
		murid: {
			nama: murid.nama,
			nis: murid.nis,
			nisn: murid.nisn
		},
		sekolah: {
			nama: sekolah.nama,
			logo
		},
		qrDataUri
	};

	return {
		meta: {
			title: `Kartu Murid - ${murid.nama}`
		},
		kartuMuridData
	};
}
