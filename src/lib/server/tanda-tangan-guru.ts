import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, and, asc } from 'drizzle-orm';
import db from '$lib/server/db';
import { tableAuthUser } from '$lib/server/db/schema';
import { uploadsDir } from '$lib/server/data-dirs';
import { tandaTanganDataUri } from '$lib/server/tanda-tangan-sekolah';

// Mirrors TTD_HEIGHT in tanda-tangan-sekolah.ts so wali kelas signatures render
// at exactly the same size as the kepala sekolah signature block.
const TTD_HEIGHT = '27.5mm';

export function guruTtdFilePath(userId: number): string {
	return join(uploadsDir(), `guru-${userId}-ttd.png`);
}

export function guruTtdDataUri(userId: number | null | undefined): string | null {
	if (!userId) return null;
	try {
		const buf = readFileSync(guruTtdFilePath(userId));
		return `data:image/png;base64,${buf.toString('base64')}`;
	} catch {
		return null;
	}
}

/**
 * Auth user id (tipe wali_kelas) yang menautkan pegawai wali kelas ke file
 * tanda tangan yang diunggah lewat /pengaturan. Bila satu pegawai punya lebih
 * dari satu akun (kasus langka sebelum konsolidasi), akun yang benar-benar
 * punya file unggahan yang dipilih — urutan deterministik (id menaik) supaya
 * hasil render selalu sama. Null bila tidak ada akunnya atau belum ada file.
 */
export async function waliKelasTtdUserId(
	pegawaiId: number | null | undefined
): Promise<number | null> {
	return guruTtdUserId(pegawaiId, 'wali_kelas');
}

/** Resolve the uploaded signature for any guru account linked to a pegawai. */
export async function guruTtdUserId(
	pegawaiId: number | null | undefined,
	type: 'wali_kelas' | 'wali_asuh' | 'wali_asrama'
): Promise<number | null> {
	if (!pegawaiId) return null;
	const accounts = await db.query.tableAuthUser.findMany({
		columns: { id: true },
		where: and(eq(tableAuthUser.pegawaiId, pegawaiId), eq(tableAuthUser.type, type)),
		orderBy: asc(tableAuthUser.id)
	});
	for (const account of accounts) {
		if (guruTtdDataUri(account.id)) return account.id;
	}
	return null;
}

/**
 * Box tanda tangan wali kelas untuk dipasang tepat di atas namanya: gambar
 * diposisikan absolut dan dicetak di belakang teks (seperti ttdStempelBoxHTML)
 * sehingga tata letak asli tidak bergeser. Return null bila belum ada gambar —
 * pemanggil memakai `?? ''` atau menampilkan layout kosong seperti sebelumnya.
 */
export function guruTtdBoxHTML(
	userId: number | null | undefined,
	height: string,
	leftShift: string = '0mm',
	downShift: string = '0mm',
	fallbackSekolahId?: number | null
): string | null {
	// The caller supplies a fallback only after matching the two pegawai IDs.
	const ttd = guruTtdDataUri(userId) ?? tandaTanganDataUri(fallbackSekolahId, 'ttd');
	if (!ttd) return null;
	const box = `position:relative;width:100%;height:${height}`;
	const sig = `<img src="${ttd}" alt="" style="position:absolute;left:50%;bottom:calc(-1 * ${downShift});transform:translateX(calc(-50% - ${leftShift}));height:${TTD_HEIGHT};width:auto;max-width:100%;object-fit:contain;z-index:-1;">`;
	return `<div style="${box}">${sig}</div>`;
}
