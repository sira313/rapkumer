import db from '$lib/server/db';
import { tableMataPelajaran, tableTujuanPembelajaran } from '$lib/server/db/schema';
import { ADMIN_TYPES, getAiSettings, withAi429Retry } from '$lib/server/ai';
import { generateRpm } from '$lib/server/ai-rpm';
import { enqueueAi } from '$lib/server/ai-queue';
import { json } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';

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
	const mapelId = Number(body.mapelId);
	const capaianPembelajaran =
		typeof body.capaianPembelajaran === 'string' ? body.capaianPembelajaran.trim() : '';
	const lingkupMateri = typeof body.lingkupMateri === 'string' ? body.lingkupMateri.trim() : '';
	const tujuanPembelajaranIds = Array.isArray(body.tujuanPembelajaranIds)
		? body.tujuanPembelajaranIds.map(Number).filter(Number.isFinite)
		: [];
	const inputCustom = typeof body.inputCustom === 'string' ? body.inputCustom.trim() : '';
	const profilLulusan = Array.isArray(body.profilLulusan)
		? body.profilLulusan.map(String).filter(Boolean)
		: [];

	if (!Number.isFinite(mapelId)) {
		return json({ message: 'Mata pelajaran tidak valid.' }, { status: 400 });
	}
	if (!capaianPembelajaran) {
		return json({ message: 'Capaian Pembelajaran wajib diisi.' }, { status: 400 });
	}
	if (!lingkupMateri) {
		return json({ message: 'Lingkup materi wajib dipilih.' }, { status: 400 });
	}

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

	const mapel = await db.query.tableMataPelajaran.findFirst({
		where: eq(tableMataPelajaran.id, mapelId),
		with: { kelas: { with: { semester: true } } }
	});
	if (!mapel) {
		return json({ message: 'Mata pelajaran tidak ditemukan.' }, { status: 404 });
	}

	const kelas = mapel.kelas as { nama: string; fase: string | null; sekolahId: number; id: number };
	const kelasLabel = `Kelas ${kelas.nama}`;

	if (locals.sekolah?.id && kelas.sekolahId !== locals.sekolah.id) {
		return json({ message: 'Mata pelajaran tidak ditemukan.' }, { status: 404 });
	}

	const tujuanPembelajaran =
		tujuanPembelajaranIds.length > 0
			? await db
					.select({ deskripsi: tableTujuanPembelajaran.deskripsi })
					.from(tableTujuanPembelajaran)
					.where(
						and(
							eq(tableTujuanPembelajaran.mataPelajaranId, mapelId),
							inArray(tableTujuanPembelajaran.id, tujuanPembelajaranIds)
						)
					)
					.then((rows) => rows.map((r) => r.deskripsi))
			: [];

	const mapelList = (
		await db.query.tableMataPelajaran.findMany({
			columns: { nama: true },
			where: eq(tableMataPelajaran.kelasId, kelas.id),
			orderBy: [asc(tableMataPelajaran.nama)]
		})
	).map((m) => m.nama);

	try {
		const generated = await enqueueAi(settings.apiKey, () =>
			withAi429Retry(() =>
				generateRpm({
					apiKey: settings.apiKey,
					model: settings.model,
					baseUrl: settings.baseUrl,
					mapelNama: mapel.nama,
					mapelList,
					kelasLabel,
					fase: kelas.fase,
					capaianPembelajaran,
					lingkupMateri,
					tujuanPembelajaran,
					inputCustom,
					profilLulusan
				})
			)
		);
		return json({ data: { generated }, message: 'RPM berhasil digenerate.' });
	} catch (err) {
		const message = (err as Error).message || 'Gagal generate RPM.';
		return json({ message }, { status: 500 });
	}
};
