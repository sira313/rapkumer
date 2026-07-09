import db from '$lib/server/db';
import { tableJadwalPelajaran, tableMataPelajaran } from '$lib/server/db/schema';
import { and, eq, asc, inArray } from 'drizzle-orm';

const skipKode = new Set(['IST', 'PLG']);

const agamaMapelNames = [
	'Pendidikan Agama dan Budi Pekerti',
	'Pendidikan Agama Islam dan Budi Pekerti',
	'Pendidikan Agama Kristen dan Budi Pekerti',
	'Pendidikan Agama Katolik dan Budi Pekerti',
	'Pendidikan Agama Buddha dan Budi Pekerti',
	'Pendidikan Agama Hindu dan Budi Pekerti',
	'Pendidikan Agama Konghuchu dan Budi Pekerti'
];

export async function getFirstMapelForDay(
	sekolahId: number,
	kelasId: number,
	tanggal: string,
	simHari: string | null
): Promise<{ mataPelajaranId: number; kodeKegiatan: string } | null> {
	const dayNames = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
	const hari = simHari ?? dayNames[new Date(tanggal + 'T00:00:00').getDay()];

	const jadwalHariIni = await db.query.tableJadwalPelajaran.findMany({
		columns: { kodeKegiatan: true, jamKe: true },
		where: and(
			eq(tableJadwalPelajaran.sekolahId, sekolahId),
			eq(tableJadwalPelajaran.kelasId, kelasId),
			eq(tableJadwalPelajaran.hari, hari)
		),
		orderBy: [asc(tableJadwalPelajaran.jamKe)]
	});

	const seen = new Set<string>();
	const uniqueKode: string[] = [];
	for (const j of jadwalHariIni) {
		const kode = j.kodeKegiatan.toUpperCase();
		if (!seen.has(kode) && !skipKode.has(kode)) {
			seen.add(kode);
			uniqueKode.push(j.kodeKegiatan);
		}
	}

	if (!uniqueKode.includes('UPB')) {
		const upbAda = await db.query.tableJadwalPelajaran.findFirst({
			columns: { id: true },
			where: and(
				eq(tableJadwalPelajaran.sekolahId, sekolahId),
				eq(tableJadwalPelajaran.hari, hari),
				eq(tableJadwalPelajaran.kodeKegiatan, 'UPB')
			)
		});
		if (upbAda) {
			uniqueKode.unshift('UPB');
		}
	}

	if (uniqueKode.length === 0) return null;

	// Try each kode in order until we find one with a matching MP entry
	for (const kode of uniqueKode) {
		const matchingMp = await db.query.tableMataPelajaran.findMany({
			columns: { id: true, kode: true, nama: true },
			where: and(eq(tableMataPelajaran.kelasId, kelasId), eq(tableMataPelajaran.kode, kode))
		});

		if (matchingMp.length > 0) {
			return { mataPelajaranId: matchingMp[0].id, kodeKegiatan: kode };
		}

		if (kode === 'PAPB') {
			const agamaMp = await db.query.tableMataPelajaran.findMany({
				columns: { id: true, nama: true },
				where: and(
					eq(tableMataPelajaran.kelasId, kelasId),
					inArray(tableMataPelajaran.nama, agamaMapelNames)
				)
			});
			if (agamaMp.length > 0) {
				return { mataPelajaranId: agamaMp[0].id, kodeKegiatan: 'PAPB' };
			}
		}
	}

	return null;
}

export async function getJadwalForDay(
	sekolahId: number,
	kelasId: number,
	tanggal: string,
	simHari: string | null
): Promise<Array<{ kodeKegiatan: string; jamKe: number }>> {
	const dayNames = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
	const hari = simHari ?? dayNames[new Date(tanggal + 'T00:00:00').getDay()];

	return await db.query.tableJadwalPelajaran.findMany({
		columns: { kodeKegiatan: true, jamKe: true },
		where: and(
			eq(tableJadwalPelajaran.sekolahId, sekolahId),
			eq(tableJadwalPelajaran.kelasId, kelasId),
			eq(tableJadwalPelajaran.hari, hari)
		),
		orderBy: [asc(tableJadwalPelajaran.jamKe)]
	});
}

export function getUniqueSubjectKodes(jadwal: Array<{ kodeKegiatan: string }>): string[] {
	const seen = new Set<string>();
	const skip = new Set(['IST', 'PLG']);
	const result: string[] = [];
	for (const j of jadwal) {
		const kode = j.kodeKegiatan.toUpperCase();
		if (!seen.has(kode) && !skip.has(kode)) {
			seen.add(kode);
			result.push(j.kodeKegiatan);
		}
	}
	if (!result.includes('UPB')) {
		const hasUpb = jadwal.some((j) => j.kodeKegiatan.toUpperCase() === 'UPB');
		if (hasUpb) {
			result.unshift('UPB');
		}
	}
	return result;
}
