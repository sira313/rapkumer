import { ADMIN_TYPES, getAiSettings, withAi429Retry } from '$lib/server/ai';
import { enqueueAi } from '$lib/server/ai-queue';
import { json } from '@sveltejs/kit';
import { generateLampiran } from '$lib/server/ai-lampiran';
import db from '$lib/server/db';
import { tableMurid } from '$lib/server/db/schema';
import { and, asc, eq } from 'drizzle-orm';

const ALLOWED_USER_TYPES = ['admin', 'kepala_sekolah', 'user', 'wali_kelas'];

export const POST = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ message: 'Sesi berakhir. Silakan login kembali.' }, { status: 401 });
	}
	if (!ALLOWED_USER_TYPES.includes(user.type)) {
		return json({ message: 'Anda tidak berhak menggunakan fitur ini.' }, { status: 403 });
	}

	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return json({ message: 'Payload tidak valid.' }, { status: 400 });
	}

	const body = (payload ?? {}) as Record<string, unknown>;
	const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
	const strArray = (v: unknown): string[] =>
		Array.isArray(v) ? v.map(String).filter(Boolean) : [];
	const strOrNull = (v: unknown): string | null => str(v) || null;

	const mapelNama = str(body.mapelNama);
	const kelasLabel = str(body.kelasLabel);
	const capaianPembelajaran = str(body.capaianPembelajaran);
	const tujuanPembelajaran = strArray(body.tujuanPembelajaran);
	const asesmen = strArray(body.asesmen);
	const kelasId = Number(body.kelasId);

	if (!mapelNama || !kelasLabel || !capaianPembelajaran || !tujuanPembelajaran.length) {
		return json(
			{ message: 'Data RPM belum lengkap (mapel, kelas, capaian, tujuan pembelajaran).' },
			{ status: 400 }
		);
	}

	const muridNames =
		Number.isFinite(kelasId) && kelasId > 0 && locals.sekolah?.id
			? (
					await db.query.tableMurid.findMany({
						columns: { nama: true },
						where: and(
							eq(tableMurid.kelasId, kelasId),
							eq(tableMurid.sekolahId, locals.sekolah.id)
						),
						orderBy: asc(tableMurid.nama)
					})
				).map((m) => m.nama)
			: [];

	const settings = await getAiSettings(user);
	if (!settings) {
		return json(
			{
				message: ADMIN_TYPES.includes(user.type)
					? 'Fitur AI belum aktif. Setel kunci API di halaman Pengaturan.'
					: 'Fitur AI belum aktif. Setel kunci API pribadi Anda di halaman Pengaturan.'
			},
			{ status: 400 }
		);
	}

	try {
		const generated = await enqueueAi(settings.apiKey, () =>
			withAi429Retry(() =>
				generateLampiran({
					apiKey: settings.apiKey,
					model: settings.model,
					baseUrl: settings.baseUrl,
					mapelNama,
					kelasLabel,
					fase: strOrNull(body.fase),
					lingkupMateri: str(body.lingkupMateri),
					capaianPembelajaran,
					tujuanPembelajaran,
					asesmen,
					muridNames,
					karakteristik: str(body.karakteristik),
					profilLulusan: strArray(body.profilLulusan),
					inputCustom: str(body.inputCustom),
					kegiatanAwal: str(body.kegiatanAwal),
					memahami: str(body.memahami),
					mengaplikasi: str(body.mengaplikasi),
					merefleksi: str(body.merefleksi),
					penutup: str(body.penutup),
					pedagogicalModel: str(body.model)
				})
			)
		);
		return json({ data: { generated }, message: 'Lampiran RPM berhasil digenerate.' });
	} catch (err) {
		const message = (err as Error).message || 'Gagal generate lampiran.';
		return json({ message }, { status: 500 });
	}
};
