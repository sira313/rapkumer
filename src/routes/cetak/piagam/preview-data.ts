import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import db from '$lib/server/db';
import { tableMurid, tableSekolah } from '$lib/server/db/schema';
import { computeNilaiAkhirRekap } from '$lib/server/nilai-akhir';
import type { PiagamPrintData } from '$lib/server/pdf/templates/piagam';

const ORDINAL_WORDS: Record<number, string> = {
	1: 'Pertama',
	2: 'Kedua',
	3: 'Ketiga',
	4: 'Keempat',
	5: 'Kelima',
	6: 'Keenam',
	7: 'Ketujuh',
	8: 'Kedelapan',
	9: 'Kesembilan',
	10: 'Kesepuluh'
};

function requireInteger(paramName: string, value: string | null): number {
	if (!value) {
		throw error(400, `Parameter ${paramName} wajib diisi.`);
	}
	const parsed = Number(value);
	if (!Number.isInteger(parsed)) {
		throw error(400, `Parameter ${paramName} tidak valid.`);
	}
	return parsed;
}

function optionalInteger(paramName: string, value: string | null): number | null {
	if (!value) return null;
	const parsed = Number(value);
	if (!Number.isInteger(parsed)) {
		throw error(400, `Parameter ${paramName} tidak valid.`);
	}
	return parsed;
}

async function getLogoSrc(sekolahId: number): Promise<string | null> {
	const row = await db.query.tableSekolah.findFirst({
		columns: { logo: true, logoType: true },
		where: eq(tableSekolah.id, sekolahId)
	});
	if (row?.logo?.length) {
		return `data:${row.logoType || 'image/png'};base64,${Buffer.from(row.logo).toString('base64')}`;
	}
	return null;
}

async function getLogoDinasSrc(sekolahId: number): Promise<string | null> {
	const row = await db.query.tableSekolah.findFirst({
		columns: { logoDinas: true, logoDinasType: true },
		where: eq(tableSekolah.id, sekolahId)
	});
	if (row?.logoDinas?.length) {
		return `data:${row.logoDinasType || 'image/png'};base64,${Buffer.from(row.logoDinas).toString('base64')}`;
	}
	return null;
}

function formatTanggal(value: string | Date | null | undefined): string {
	if (!value) return '';
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return new Intl.DateTimeFormat('id-ID', {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	}).format(date);
}

function fallbackTempat(sekolah: NonNullable<App.Locals['sekolah']>): string {
	const explicit = sekolah.lokasiTandaTangan?.trim();
	if (explicit) return explicit;
	const alamat = sekolah.alamat;
	if (!alamat) return '';
	return alamat.kecamatan || alamat.kabupaten || alamat.desa || '';
}

function formatSemesterLabel(
	semester:
		| {
				nama?: string | null;
				tipe?: string | null;
		  }
		| null
		| undefined
): string {
	if (!semester) return '';
	const nama = semester.nama?.trim();
	if (nama) return nama;
	const tipe = semester.tipe?.trim();
	if (!tipe) return '';
	return tipe.charAt(0).toUpperCase() + tipe.slice(1).toLowerCase();
}

function formatAverage(value: number | null | undefined): string {
	if (value == null || Number.isNaN(value)) return '—';
	return new Intl.NumberFormat('id-ID', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(value);
}

function buildRankingLabel(rank: number | null | undefined): string {
	if (!rank) return 'Penerima Penghargaan';
	const word = ORDINAL_WORDS[rank] ?? `Ke-${rank}`;
	return `Peringkat ${word}`;
}

export async function getPiagamPreviewPayload({ locals, url }: { locals: App.Locals; url: URL }) {
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
			kelas: {
				columns: {
					id: true,
					nama: true
				},
				with: {
					waliKelas: {
						columns: {
							nama: true,
							nip: true
						}
					},
					tahunAjaran: {
						columns: {
							nama: true
						}
					}
				}
			},
			semester: {
				columns: {
					nama: true,
					tipe: true,
					tanggalBagiRaport: true
				}
			}
		}
	});

	if (!murid) {
		throw error(404, 'Data murid tidak ditemukan.');
	}

	if (kelasId && murid.kelasId !== kelasId) {
		throw error(400, 'Murid tidak terdaftar pada kelas yang diminta.');
	}

	const kelasMurid = murid.kelas;
	if (!kelasMurid) {
		throw error(404, 'Data kelas murid tidak ditemukan.');
	}

	const rekap = await computeNilaiAkhirRekap({
		sekolahId: sekolah.id,
		kelasId: kelasMurid.id
	});

	const muridRekap = rekap.rows.find((row) => row.id === murid.id);
	const muridAverage = muridRekap?.nilaiRataRata ?? null;
	const muridRanking =
		muridRekap && muridRekap.jumlahMapelDinilai > 0 ? muridRekap.peringkat : null;

	const [logoSrc, logoDinasSrc] = await Promise.all([
		getLogoSrc(sekolah.id),
		getLogoDinasSrc(sekolah.id)
	]);

	const piagamData: PiagamPrintData = {
		sekolah: {
			nama: sekolah.nama,
			jenjang: sekolah.jenjangPendidikan,
			npsn: sekolah.npsn,
			alamat: {
				jalan: sekolah.alamat?.jalan ?? '',
				desa: sekolah.alamat?.desa ?? '',
				kecamatan: sekolah.alamat?.kecamatan ?? '',
				kabupaten: sekolah.alamat?.kabupaten ?? '',
				provinsi: sekolah.alamat?.provinsi ?? null,
				kodePos: sekolah.alamat?.kodePos ?? null
			},
			website: sekolah.website ?? null,
			email: sekolah.email ?? null,
			logoUrl: logoSrc,
			logoDinasUrl: logoDinasSrc
		},
		murid: {
			nama: murid.nama
		},
		penghargaan: {
			rataRata: muridAverage,
			rataRataFormatted: formatAverage(muridAverage),
			ranking: muridRanking,
			rankingLabel: buildRankingLabel(muridRanking),
			judul: 'Piagam Penghargaan',
			subjudul: 'Diberikan Kepada',
			motivasi:
				'Semoga prestasi yang diraih menjadi motivasi untuk meraih kesuksesan di masa yang akan datang.'
		},
		periode: {
			semester: formatSemesterLabel(murid.semester),
			tahunAjaran: murid.kelas?.tahunAjaran?.nama ?? ''
		},
		ttd: {
			tempat: fallbackTempat(sekolah),
			tanggal: formatTanggal(murid.semester?.tanggalBagiRaport) || formatTanggal(new Date()),
			kepalaSekolah: {
				nama: sekolah.kepalaSekolah?.nama ?? '',
				nip: sekolah.kepalaSekolah?.nip ?? '',
				statusKepalaSekolah: sekolah.statusKepalaSekolah ?? 'definitif'
			},
			waliKelas: {
				nama: murid.kelas?.waliKelas?.nama ?? '',
				nip: murid.kelas?.waliKelas?.nip ?? ''
			}
		}
	};

	return {
		meta: {
			title: `${piagamData.penghargaan.judul} - ${murid.nama}`
		},
		piagamData
	};
}
