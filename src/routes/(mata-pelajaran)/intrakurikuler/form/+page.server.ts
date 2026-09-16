import db from '$lib/server/db/index.js';
import { normMapelName, resolveReferensiMapelId } from '$lib/server/dapodik';
import { opsiMapelDapodik } from '$lib/server/dapodik-mapel-options';
import { tableDapodikPembelajaran, tableKelas, tableMataPelajaran } from '$lib/server/db/schema';
import { isWaliOfKelas } from '$lib/server/kelas-akses';
import { cookieNames, unflattenFormData } from '$lib/utils';
import { fail } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';

export async function load({ parent, locals }) {
	const { kelasAktif } = await parent();
	const { dapodikMapelList, indukList } = kelasAktif?.id
		? await opsiMapelDapodik(kelasAktif.id, locals.sekolah)
		: { dapodikMapelList: [], indukList: [] };
	return {
		meta: { title: `Form Mata Pelajaran` },
		kelasAktif,
		dapodikMapelList,
		indukList: indukList.sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
	};
}

export const actions = {
	async add({ request, cookies, locals }) {
		const formMapel = unflattenFormData<{
			nama?: string;
			nama_lokal?: string;
			jenis?: string;
			kkm?: string;
			kode?: string;
			induk_pembelajaran_id?: string;
		}>(await request.formData());

		const kelasIdCookie = cookies.get(cookieNames.ACTIVE_KELAS_ID);
		if (!kelasIdCookie) {
			return fail(400, { fail: 'Pilih kelas aktif terlebih dahulu di navbar.' });
		}

		const kelasId = Number(kelasIdCookie);
		if (!Number.isInteger(kelasId)) {
			return fail(400, { fail: 'Kelas aktif tidak valid.' });
		}

		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) {
			return fail(400, { fail: 'Pilih sekolah aktif terlebih dahulu.' });
		}

		const kelasAktif = await db.query.tableKelas.findFirst({
			columns: { id: true },
			where: and(eq(tableKelas.id, kelasId), eq(tableKelas.sekolahId, sekolahId))
		});
		if (!kelasAktif) {
			return fail(400, { fail: 'Kelas aktif tidak ditemukan.' });
		}

		// Wali kelas hanya boleh menambah mapel di kelas miliknya
		const addUser = locals.user as { type?: string; pegawaiId?: number | null } | null;
		if (addUser?.type === 'wali_kelas' && !(await isWaliOfKelas(addUser, kelasId))) {
			return fail(403, { fail: 'Anda tidak memiliki izin untuk menambah di kelas ini.' });
		}

		const nama = formMapel.nama?.trim();
		const namaLokal = formMapel.nama_lokal?.toString().trim() ?? '';
		const jenis = formMapel.jenis?.toLowerCase() as MataPelajaran['jenis'] | undefined;
		const kkmValue = formMapel.kkm ? Number(formMapel.kkm) : Number.NaN;
		const kode = formMapel.kode?.toString().trim() ?? '';

		if (!nama || !jenis || Number.isNaN(kkmValue)) {
			return fail(400, { fail: 'Harap lengkapi data mata pelajaran.' });
		}

		if (
			!['belum_dipetakan', 'wajib', 'pilihan', 'mulok', 'kejuruan', 'pemberdayaan'].includes(jenis)
		) {
			return fail(400, { fail: 'Jenis mata pelajaran tidak valid.' });
		}

		const kkm = Math.max(0, Math.round(kkmValue));

		// Mapel agama (semua varian, termasuk versi Dapodik tanpa "Budi Pekerti") dibuat
		// otomatis oleh ensureAgamaMapelForClasses — larang tambah manual.
		if (/^pendidikan (agama|kepercayaan)/i.test(nama)) {
			return fail(400, {
				fail: 'Tidak dapat menambahkan mapel agama karena PAPB dan sub mapel sudah ada di tabel'
			});
		}

		// Validasi duplikat: cek apakah sudah ada mapel dengan nama sama di kelas ini
		const existing = await db.query.tableMataPelajaran.findFirst({
			where: and(eq(tableMataPelajaran.kelasId, kelasId), eq(tableMataPelajaran.nama, nama))
		});

		if (existing) {
			return fail(400, {
				fail: `Mata pelajaran "${nama}" sudah ada di kelas ini. Tidak boleh duplikat.`
			});
		}

		// Opsi bind-at-create: bila nama terdaftar sebagai pembelajaran rombel
		// Dapodik (mirror hasil sinkronisasi), simpan kode Dapodiknya langsung agar
		// mapel bisa dikirim balik tanpa menunggu sinkron ulang. Bila tidak ada
		// padanannya, mapel dibuat sebagai Sub Pembelajaran — wajib memilih
		// pembelajaran induk yang terdaftar di Dapodik.
		const mirrorRows = await db
			.select()
			.from(tableDapodikPembelajaran)
			.where(eq(tableDapodikPembelajaran.kelasId, kelasId));
		const namaKunci = normMapelName(nama);
		const mirror =
			mirrorRows.find((m) => m.mataPelajaranId && m.nama === nama) ??
			mirrorRows.find((m) => m.mataPelajaranId && normMapelName(m.nama) === namaKunci);

		let indukRow: (typeof mirrorRows)[number] | null = null;
		const indukIdRaw = formMapel.induk_pembelajaran_id?.toString().trim() ?? '';
		if (!mirror && indukIdRaw) {
			indukRow = mirrorRows.find((m) => m.pembelajaranId === indukIdRaw) ?? null;
			if (!indukRow) {
				return fail(400, { fail: 'Pembelajaran induk tidak valid untuk kelas ini.' });
			}
		}
		if (!mirror && !indukRow && mirrorRows.length > 0) {
			return fail(400, {
				fail: `"${nama}" belum terdaftar sebagai pembelajaran Dapodik. Pilih "Mata Pelajaran Induk" agar dapat dikirim sebagai Sub Pembelajaran.`
			});
		}

		const dapodikMatpelId = mirror?.mataPelajaranId ?? (await resolveReferensiMapelId(nama));

		// Mapel baru selalu diletakkan di nomor urut paling bawah.
		const [{ maxUrutan }] = await db
			.select({ maxUrutan: sql<number>`coalesce(max(${tableMataPelajaran.urutan}), 0)` })
			.from(tableMataPelajaran)
			.where(eq(tableMataPelajaran.kelasId, kelasId));

		await db.insert(tableMataPelajaran).values({
			nama,
			namaLokal: namaLokal || null,
			jenis,
			kkm,
			kelasId,
			kode: kode || null,
			urutan: (maxUrutan ?? 0) + 1,
			...(mirror ? { dapodikPembelajaranId: mirror.pembelajaranId } : {}),
			...(!mirror && indukRow ? { dapodikIndukPembelajaranId: indukRow.pembelajaranId } : {}),
			...(dapodikMatpelId ? { dapodikMataPelajaranId: dapodikMatpelId } : {})
		});
		const suffix = mirror
			? ' dan ter-binding ke pembelajaran Dapodik'
			: indukRow
				? ` sebagai Sub Pembelajaran dari "${indukRow.nama}"${
						dapodikMatpelId
							? ''
							: '; ID referensi mapel belum ditemukan, akan dilengkapi saat kirim'
					}`
				: '';
		return { message: `Data mata pelajaran berhasil ditambah${suffix}` };
	}
};
