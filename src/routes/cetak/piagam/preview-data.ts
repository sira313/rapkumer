import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import db from '$lib/server/db';
import { tableMurid } from '$lib/server/db/schema';
import { computeNilaiAkhirRekap } from '$lib/server/nilai-akhir';
import type { PiagamPrintData } from '$lib/server/pdf/templates/piagam';
import {
	requireInteger,
	optionalInteger,
	getLogoSrc,
	getLogoDinasSrc,
	formatTanggal,
	fallbackTempat
} from '$lib/server/pdf/preview-utils';

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
			id: sekolah.id,
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
			namaKelas: kelasMurid.nama,
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
