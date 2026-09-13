import { error, json } from '@sveltejs/kit';
import db from '$lib/server/db';
import { tableSekolah } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { renderSimplePDF } from '$lib/server/pdf/pagedpdf';
import { renderRpmHTML, type RpmPrintData } from '$lib/server/pdf/templates/rpm';

const ALLOWED_USER_TYPES = ['admin', 'kepala_sekolah', 'user', 'wali_kelas'];

type RpmBody = {
	mapelNama?: unknown;
	penyusun?: unknown;
	kelasLabel?: unknown;
	fase?: unknown;
	karakteristik?: unknown;
	lingkupMateri?: unknown;
	profilLulusan?: unknown;
	capaianPembelajaran?: unknown;
	lintasDisiplinIlmu?: unknown;
	tujuanPembelajaran?: unknown;
	model?: unknown;
	kemitraanPembelajaran?: unknown;
	lingkunganPembelajaran?: unknown;
	pemanfaatanDigital?: unknown;
	kegiatanAwal?: unknown;
	memahami?: unknown;
	mengaplikasi?: unknown;
	merefleksi?: unknown;
	penutup?: unknown;
	asesmen?: unknown;
};

export const POST = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ message: 'Sesi berakhir. Silakan login kembali.' }, { status: 401 });
	}
	if (!ALLOWED_USER_TYPES.includes(user.type)) {
		return json({ message: 'Anda tidak berhak menggunakan fitur ini.' }, { status: 403 });
	}
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) {
		return json({ message: 'Sekolah tidak ditemukan.' }, { status: 400 });
	}

	let payload: RpmBody;
	try {
		payload = (await request.json()) as RpmBody;
	} catch {
		return json({ message: 'Payload tidak valid.' }, { status: 400 });
	}

	const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
	const strArray = (v: unknown): string[] =>
		Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

	const sekolah = await db.query.tableSekolah.findFirst({
		columns: { nama: true },
		where: eq(tableSekolah.id, sekolahId)
	});

	const printData: RpmPrintData = {
		sekolah: { nama: sekolah?.nama ?? '' },
		mapelNama: str(payload.mapelNama),
		penyusun: str(payload.penyusun),
		kelasLabel: str(payload.kelasLabel),
		fase: str(payload.fase) || null,
		karakteristik: str(payload.karakteristik),
		lingkupMateri: str(payload.lingkupMateri),
		profilLulusan: strArray(payload.profilLulusan),
		capaianPembelajaran: str(payload.capaianPembelajaran),
		lintasDisiplinIlmu: str(payload.lintasDisiplinIlmu),
		tujuanPembelajaran: strArray(payload.tujuanPembelajaran),
		model: str(payload.model),
		kemitraanPembelajaran: str(payload.kemitraanPembelajaran),
		lingkunganPembelajaran: str(payload.lingkunganPembelajaran),
		pemanfaatanDigital: str(payload.pemanfaatanDigital),
		kegiatanAwal: str(payload.kegiatanAwal),
		memahami: str(payload.memahami),
		mengaplikasi: str(payload.mengaplikasi),
		merefleksi: str(payload.merefleksi),
		penutup: str(payload.penutup),
		asesmen: strArray(payload.asesmen)
	};

	try {
		const html = renderRpmHTML(printData);
		const pdf = await renderSimplePDF(html);
		return new Response(new Blob([Buffer.from(pdf)], { type: 'application/pdf' }), {
			headers: {
				'Content-Disposition': `inline; filename="rpm.pdf"`
			}
		});
	} catch (err) {
		if ((err as Error).message) error(500, (err as Error).message);
		return json({ message: 'Gagal membuat PDF.' }, { status: 500 });
	}
};
