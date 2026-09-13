import { json } from '@sveltejs/kit';
import { PDFDocument } from 'pdf-lib';
import db from '$lib/server/db';
import { tableSekolah } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { renderSimplePDF } from '$lib/server/pdf/pagedpdf';
import { renderRpmHTML } from '$lib/server/pdf/templates/rpm';
import { renderLampiranHTML } from '$lib/server/pdf/templates/lampiran';
import { normalizeAsesmen } from '$lib/server/ai-lampiran';

const ALLOWED_USER_TYPES = ['admin', 'kepala_sekolah', 'user', 'wali_kelas'];

type Body = {
	rpm?: Record<string, unknown>;
	lampiran?: Record<string, unknown>;
};

export const POST = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ message: 'Sesi berakhir. Silakan login kembali.' }, { status: 401 });
	}
	if (!ALLOWED_USER_TYPES.includes(user.type)) {
		return json({ message: 'Anda tidak berhak menggunakan fitur ini.' }, { status: 403 });
	}
	if (!locals.sekolah?.id) {
		return json({ message: 'Sekolah tidak ditemukan.' }, { status: 400 });
	}

	let payload: Body;
	try {
		payload = (await request.json()) as Body;
	} catch {
		return json({ message: 'Payload tidak valid.' }, { status: 400 });
	}

	const rpm = payload.rpm ?? {};
	const lampiran = payload.lampiran ?? {};
	const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
	const strArray = (v: unknown): string[] =>
		Array.isArray(v) ? v.map(String).filter(Boolean) : [];

	if (!str(rpm.mapelNama) || !str(rpm.kelasLabel) || !str(lampiran.kelasLabel)) {
		return json({ message: 'Data PDF tidak lengkap.' }, { status: 400 });
	}

	const formatif = normalizeAsesmen(lampiran.formatif);
	const sumatif = normalizeAsesmen(lampiran.sumatif);
	const lkpd = str(lampiran.lkpd);
	if (
		(!formatif.uraian && !formatif.instrumen) ||
		(!sumatif.uraian && !sumatif.instrumen) ||
		!lkpd
	) {
		return json(
			{ message: 'Lampiran belum lengkap (formatif, sumatif, dan LKPD harus terisi).' },
			{ status: 400 }
		);
	}

	const sekolah = await db.query.tableSekolah.findFirst({
		columns: { nama: true },
		where: eq(tableSekolah.id, locals.sekolah.id)
	});
	const sekolahNama = sekolah?.nama ?? '';
	const penyusun = str(rpm.penyusun);

	try {
		const [rpmPdf, lampiranPdf] = await Promise.all([
			renderSimplePDF(
				renderRpmHTML({
					sekolah: { nama: sekolahNama },
					mapelNama: str(rpm.mapelNama),
					kelasLabel: str(rpm.kelasLabel),
					fase: typeof rpm.fase === 'string' && rpm.fase.trim() ? rpm.fase.trim() : null,
					karakteristik: str(rpm.karakteristik),
					lingkupMateri: str(rpm.lingkupMateri),
					profilLulusan: strArray(rpm.profilLulusan),
					capaianPembelajaran: str(rpm.capaianPembelajaran),
					lintasDisiplinIlmu: str(rpm.lintasDisiplinIlmu),
					tujuanPembelajaran: strArray(rpm.tujuanPembelajaran),
					model: str(rpm.model),
					kemitraanPembelajaran: str(rpm.kemitraanPembelajaran),
					lingkunganPembelajaran: str(rpm.lingkunganPembelajaran),
					pemanfaatanDigital: str(rpm.pemanfaatanDigital),
					kegiatanAwal: str(rpm.kegiatanAwal),
					memahami: str(rpm.memahami),
					mengaplikasi: str(rpm.mengaplikasi),
					merefleksi: str(rpm.merefleksi),
					penutup: str(rpm.penutup),
					asesmen: strArray(rpm.asesmen),
					penyusun
				})
			),
			renderSimplePDF(
				renderLampiranHTML({
					sekolah: { nama: sekolahNama },
					mapelNama: str(lampiran.mapelNama),
					kelasLabel: str(lampiran.kelasLabel),
					penyusun: str(lampiran.penyusun) || penyusun,
					formatif,
					sumatif,
					lkpd
				})
			)
		]);

		const merged = await PDFDocument.create();
		for (const buf of [rpmPdf, lampiranPdf]) {
			const src = await PDFDocument.load(buf, { ignoreEncryption: true });
			const pages = await merged.copyPages(src, src.getPageIndices());
			pages.forEach((page) => merged.addPage(page));
		}
		const pdfBytes = await merged.save();
		return new Response(new Blob([Buffer.from(pdfBytes)], { type: 'application/pdf' }), {
			headers: { 'Content-Disposition': 'attachment; filename="rpm-dan-lampiran.pdf"' }
		});
	} catch (err) {
		return json({ message: `Gagal menggabungkan PDF: ${(err as Error).message}` }, { status: 500 });
	}
};
