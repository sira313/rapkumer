import { json } from '@sveltejs/kit';
import db from '$lib/server/db';
import { tableSekolah } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { renderSimplePDF } from '$lib/server/pdf/pagedpdf';
import { renderLampiranHTML } from '$lib/server/pdf/templates/lampiran';
import { normalizeAsesmen } from '$lib/server/ai-lampiran';

const ALLOWED_USER_TYPES = ['admin', 'kepala_sekolah', 'user', 'wali_kelas'];

type Body = {
	mapelNama?: unknown;
	kelasLabel?: unknown;
	penyusun?: unknown;
	formatif?: unknown;
	sumatif?: unknown;
	lkpd?: unknown;
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

	const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

	const sekolah = await db.query.tableSekolah.findFirst({
		columns: { nama: true },
		where: eq(tableSekolah.id, locals.sekolah.id)
	});

	const formatif = normalizeAsesmen(payload.formatif);
	const sumatif = normalizeAsesmen(payload.sumatif);
	const lkpd = str(payload.lkpd);
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

	try {
		const html = renderLampiranHTML({
			sekolah: { nama: sekolah?.nama ?? '' },
			mapelNama: str(payload.mapelNama),
			kelasLabel: str(payload.kelasLabel),
			penyusun: str(payload.penyusun),
			formatif,
			sumatif,
			lkpd
		});
		const pdf = await renderSimplePDF(html);
		return new Response(new Blob([Buffer.from(pdf)], { type: 'application/pdf' }), {
			headers: { 'Content-Disposition': 'inline; filename="lampiran-rpm.pdf"' }
		});
	} catch (err) {
		return json({ message: `Gagal membuat PDF: ${(err as Error).message}` }, { status: 500 });
	}
};
