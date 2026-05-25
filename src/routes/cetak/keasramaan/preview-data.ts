import { error } from '@sveltejs/kit';
import { asc, and, eq } from 'drizzle-orm';
import db from '$lib/server/db';
import {
	tableAsesmenKeasramaan,
	tableKeasramaan,
	tableKeasramaanIndikator,
	tableKeasramaanTujuan,
	tableMurid,
	tableSekolah
} from '$lib/server/db/schema';
import {
	kategoriToRubrikValue,
	hitungNilaiIndikator,
	nilaiAngkaToHuruf
} from '$lib/components/asesmen-keasramaan/utils';

const LOCALE_ID = 'id-ID';

export type KeasramaanContext = {
	locals: App.Locals;
	url: URL;
};

type PredikatKey = 'perlu-bimbingan' | 'cukup' | 'baik' | 'sangat-baik';

type PredikatMap = {
	[key in PredikatKey]: { label: string; order: number };
};

const PREDIKAT_MAP: PredikatMap = {
	'sangat-baik': { label: 'Sangat Baik', order: 3 },
	baik: { label: 'Baik', order: 2 },
	cukup: { label: 'Cukup', order: 1 },
	'perlu-bimbingan': { label: 'Perlu Bimbingan', order: 0 }
};

function optionalInteger(paramName: string, value: string | null): number | null {
	if (!value) return null;
	const parsed = Number(value);
	if (!Number.isInteger(parsed)) {
		throw error(400, `Parameter ${paramName} tidak valid.`);
	}
	return parsed;
}

function composeAlamat(sekolah: NonNullable<App.Locals['sekolah']>): string {
	const alamat = sekolah.alamat;
	if (!alamat) return '';
	const parts = [alamat.jalan, alamat.desa, alamat.kecamatan, alamat.kabupaten, alamat.provinsi]
		.map((part) => (part ?? '').trim())
		.filter(Boolean);
	return parts.join(', ');
}

function formatTanggal(value: string | null | undefined): string {
	if (!value) return '';
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return '';
	return new Intl.DateTimeFormat(LOCALE_ID, {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	}).format(parsed);
}

function fallbackTempat(sekolah: NonNullable<App.Locals['sekolah']>): string {
	const explicit = sekolah.lokasiTandaTangan?.trim();
	if (explicit) return explicit;
	const alamat = sekolah.alamat;
	if (!alamat) return '';
	return alamat.kabupaten || alamat.kecamatan || alamat.desa || '';
}

function joinList(items: string[]): string {
	if (!items.length) return '';
	if (items.length === 1) return items[0];
	if (items.length === 2) return `${items[0]} dan ${items[1]}`;
	return items.slice(0, -1).join(', ') + ', dan ' + items.at(-1);
}

/**
 * Build descriptive text for an indicator based on all its TP (tujuan pembelajaran)
 * Separates "tercapai" (sangat-baik, baik, cukup) into one paragraph
 * and "belum tercapai" (perlu-bimbingan) into a separate line
 *
 * Example output:
 * Ananda Arkle Yoel menunjukkan penguasaan yang sangat baik dalam mengembangkan sikap inklusif dan terbuka dalam berinteraksi dengan sesama penghuni asrama, menunjukkan penguasaan yang baik dalam menerapkan komunikasi yang efektif, santun, dan suportif dengan anggota kelompok atau teman se-asrama.
 *
 * Masih perlu bimbingan dalam hal lain.
 */
function lowercaseFirstChar(text: string): string {
	if (!text) return text;
	return text.charAt(0).toLowerCase() + text.slice(1);
}

function buildIndicatorDeskripsi(
	muridNama: string,
	tpsByPredikat: Record<PredikatKey, string[]>
): string {
	const achievedOrder: PredikatKey[] = ['sangat-baik', 'baik', 'cukup'];
	const achievedSentences: string[] = [];

	// Build "tercapai" paragraph
	for (const key of achievedOrder) {
		const tpList = tpsByPredikat[key] || [];
		if (!tpList.length) continue;

		// Clean descriptions (remove trailing punctuation) and lowercase first char
		const cleanDescs = tpList.map((d) => lowercaseFirstChar(d.replace(/[.!?]+$/gu, '').trim()));
		const joined = joinList(cleanDescs);

		let phrase = '';
		if (key === 'sangat-baik') {
			phrase = `menunjukkan penguasaan yang sangat baik dalam ${joined}`;
		} else if (key === 'baik') {
			phrase = `menunjukkan penguasaan yang baik dalam ${joined}`;
		} else if (key === 'cukup') {
			phrase = `cukup mampu ${joined}`;
		}

		if (achievedSentences.length === 0) {
			// First sentence: add student name
			achievedSentences.push(`Ananda ${muridNama} ${phrase}`);
		} else {
			// Subsequent phrases: join with comma and lowercase
			achievedSentences.push(`, ${phrase}`);
		}
	}

	const achievedParagraph = achievedSentences.length > 0 ? achievedSentences.join('') + '.' : '';

	// Build "belum tercapai" paragraph
	const needList = tpsByPredikat['perlu-bimbingan'] || [];
	let notAchievedParagraph = '';
	if (needList.length) {
		const cleanDescs = needList.map((d) => lowercaseFirstChar(d.replace(/[.!?]+$/gu, '').trim()));
		const joined = joinList(cleanDescs);
		notAchievedParagraph = `Ananda ${muridNama} masih perlu bimbingan dalam ${joined}.`;
	}

	// Return both paragraphs separated by newline, or just the achieved one if no belum tercapai
	if (achievedParagraph && notAchievedParagraph) {
		return `${achievedParagraph}\n\n${notAchievedParagraph}`;
	}
	if (achievedParagraph) return achievedParagraph;
	if (notAchievedParagraph) return notAchievedParagraph;
	return '';
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

export type KeasramaanRow = {
	no: number;
	indikator: string;
	predikat: PredikatKey;
	deskripsi: string;
	kategoriHeader?: string; // untuk grouping header
};

export type KeasramaanPrintData = {
	sekolah: {
		nama: string;
		alamat: string;
		logoUrl: string | null;
		jenjangVariant: string | null;
	};
	murid: {
		nama: string;
		nis: string;
		nisn: string;
	};
	rombel: {
		nama: string;
		fase: string;
	};
	periode: {
		tahunAjaran: string;
		semester: string;
	};
	waliAsrama: { nama: string; nip: string } | null;
	waliKelas: { nama: string; nip: string } | null;
	waliAsuh: { nama: string; nip: string } | null;
	kepalaSekolah: { nama: string; nip: string } | null;
	ttd: {
		tempat: string;
		tanggal: string;
	};
	kehadiran: {
		sakit: number;
		izin: number;
		alfa: number;
	};
	keasramaanRows: KeasramaanRow[];
};

export async function getKeasramaanPreviewPayload({ locals, url }: KeasramaanContext) {
	const sekolah = locals.sekolah;
	if (!sekolah?.id) {
		throw error(404, 'Sekolah tidak ditemukan.');
	}

	const muridId = optionalInteger('murid_id', url.searchParams.get('murid_id'));
	const kelasId = optionalInteger('kelas_id', url.searchParams.get('kelas_id'));

	// If no murid_id provided, return null (used in bulk preview mode)
	if (!muridId) {
		return null;
	}

	const murid = await db.query.tableMurid.findFirst({
		where: and(
			eq(tableMurid.id, muridId),
			eq(tableMurid.sekolahId, sekolah.id),
			kelasId ? eq(tableMurid.kelasId, kelasId) : undefined
		),
		with: {
			kelas: {
				with: {
					waliKelas: true,
					waliAsrama: true,
					tahunAjaran: true,
					semester: true
				}
			},
			kehadiran: true
		}
	});

	if (!murid) {
		throw error(404, 'Data murid tidak ditemukan.');
	}

	if (kelasId && murid.kelasId !== kelasId) {
		throw error(400, 'Murid tidak terdaftar pada kelas yang diminta.');
	}

	const kelasData = murid.kelas;
	if (!kelasData) {
		throw error(404, 'Data kelas tidak ditemukan.');
	}

	// Fetch all keasramaan evaluations for this class
	const keasramaanList = await db.query.tableKeasramaan.findMany({
		where: eq(tableKeasramaan.kelasId, murid.kelasId),
		with: {
			indikator: {
				orderBy: asc(tableKeasramaanIndikator.id),
				with: {
					tujuan: {
						orderBy: asc(tableKeasramaanTujuan.id)
					}
				}
			}
		},
		orderBy: asc(tableKeasramaan.id)
	});

	// Fetch all assessments for this student
	const asesmenList = await db.query.tableAsesmenKeasramaan.findMany({
		where: eq(tableAsesmenKeasramaan.muridId, murid.id),
		with: {
			tujuan: {
				with: {
					indikator: true
				}
			},
			keasramaan: true
		}
	});

	// Build a map of assessments grouped by (keasramaanId -> indikatorId -> array of TP values and descriptions)
	type IndicatorAssessment = {
		nilaiTP: (number | null)[]; // Array of rubrik values (1-4) from each TP
		tpDescriptions: string[]; // Array of TP descriptions
	};
	type AsesmenByIndicator = Record<number, IndicatorAssessment>;
	type AsesmenByKeasramaan = Record<number, AsesmenByIndicator>;
	const asesmenMap: AsesmenByKeasramaan = {};

	for (const item of asesmenList) {
		if (!item.keasramaan || !item.tujuan) continue;
		const keasramaanId = item.keasramaan.id;
		const indikatorId = item.tujuan.indikatorId;
		const kategori = item.kategori as PredikatKey;
		const rubrikValue = kategoriToRubrikValue(kategori);

		if (!asesmenMap[keasramaanId]) {
			asesmenMap[keasramaanId] = {};
		}
		if (!asesmenMap[keasramaanId][indikatorId]) {
			asesmenMap[keasramaanId][indikatorId] = {
				nilaiTP: [],
				tpDescriptions: []
			};
		}

		asesmenMap[keasramaanId][indikatorId].nilaiTP.push(rubrikValue);
		asesmenMap[keasramaanId][indikatorId].tpDescriptions.push(item.tujuan.deskripsi);
	}

	// Build final rows: group by keasramaan, then list indikators with calculated predikat
	const finalRows: KeasramaanRow[] = [];

	for (let keasramaanIndex = 0; keasramaanIndex < keasramaanList.length; keasramaanIndex++) {
		const keasramaan = keasramaanList[keasramaanIndex];
		// Generate category letter (A, B, C, ...)
		const categoryLetter = String.fromCharCode(65 + keasramaanIndex);
		const categoryHeaderText = `${categoryLetter}. ${keasramaan.nama}`;

		// Add category header
		finalRows.push({
			no: 0,
			indikator: keasramaan.nama,
			predikat: 'cukup',
			deskripsi: '',
			kategoriHeader: categoryHeaderText
		});

		const asesmenForKeasramaan = asesmenMap[keasramaan.id] ?? {};

		// Reset row number for each category
		let categoryRowNumber = 1;

		// Collect indikators for this keasramaan with calculated predikat
		const indikatorList = keasramaan.indikator
			.map((ind) => {
				const asesmen = asesmenForKeasramaan[ind.id];

				// Calculate indicator predikat from average of TP values
				let predikat: PredikatKey = 'cukup';
				let deskripsi = '';

				if (asesmen && asesmen.nilaiTP.length > 0) {
					// Calculate average nilai indikator from TP values
					const nilaiIndikator = hitungNilaiIndikator(asesmen.nilaiTP as (number | null)[]);

					if (nilaiIndikator !== null) {
						// Convert average to huruf (A, B, C, D)
						const huruf = nilaiAngkaToHuruf(nilaiIndikator);

						// Map huruf back to predikat key
						const hurfToPredikat: Record<string, PredikatKey> = {
							A: 'sangat-baik',
							B: 'baik',
							C: 'cukup',
							D: 'perlu-bimbingan'
						};
						predikat = hurfToPredikat[huruf || 'C'] || 'cukup';
					}

					// Build comprehensive deskripsi by grouping all TP by their predikat
					// First, calculate predikat for each TP
					const tpsByPredikat: Record<PredikatKey, string[]> = {
						'sangat-baik': [],
						baik: [],
						cukup: [],
						'perlu-bimbingan': []
					};

					for (let i = 0; i < asesmen.nilaiTP.length; i++) {
						const tpNilai = asesmen.nilaiTP[i];
						const tpDesc = asesmen.tpDescriptions[i];
						if (tpNilai === null || !tpDesc) continue;

						// Convert TP nilai to predikat
						const tpHuruf = nilaiAngkaToHuruf(tpNilai as number);
						const tpHurfToPredikat: Record<string, PredikatKey> = {
							A: 'sangat-baik',
							B: 'baik',
							C: 'cukup',
							D: 'perlu-bimbingan'
						};
						const tpPredikat = tpHurfToPredikat[tpHuruf || 'C'] || 'cukup';
						tpsByPredikat[tpPredikat].push(tpDesc);
					}

					// Build descriptive text using helper function
					deskripsi = buildIndicatorDeskripsi(murid.nama, tpsByPredikat);
				}

				return {
					indikator: ind,
					predikat,
					deskripsi
				};
			})
			.sort((a, b) => {
				const scoreA = PREDIKAT_MAP[a.predikat].order;
				const scoreB = PREDIKAT_MAP[b.predikat].order;
				return scoreB - scoreA; // Highest first
			});

		for (const item of indikatorList) {
			finalRows.push({
				no: categoryRowNumber++,
				indikator: item.indikator.deskripsi,
				predikat: item.predikat,
				deskripsi: item.deskripsi
			});
		}
	}

	const ttdTanggal = formatTanggal(kelasData.semester?.tanggalBagiRaport);
	const ttdTempat = fallbackTempat(sekolah);

	const logoSrc = await getLogoSrc(sekolah.id);

	const keasramaanData: KeasramaanPrintData = {
		sekolah: {
			nama: sekolah.nama,
			alamat: composeAlamat(sekolah),
			logoUrl: logoSrc,
			jenjangVariant: sekolah.jenjangVariant ?? null
		},
		murid: {
			nama: murid.nama,
			nis: murid.nis,
			nisn: murid.nisn
		},
		rombel: {
			nama: kelasData.nama ?? '',
			fase: kelasData.fase ?? ''
		},
		periode: {
			tahunAjaran: kelasData.tahunAjaran?.nama ?? '',
			semester: kelasData.semester?.nama ?? ''
		},
		waliAsrama: kelasData.waliAsrama
			? { nama: kelasData.waliAsrama.nama, nip: kelasData.waliAsrama.nip ?? '' }
			: null,
		waliKelas: kelasData.waliKelas
			? { nama: kelasData.waliKelas.nama, nip: kelasData.waliKelas.nip ?? '' }
			: null,
		waliAsuh: murid.waliAsuhNama
			? { nama: murid.waliAsuhNama, nip: murid.waliAsuhNip ?? '' }
			: null,
		kepalaSekolah: sekolah.kepalaSekolah
			? ({
					nama: sekolah.kepalaSekolah.nama,
					nip: sekolah.kepalaSekolah.nip ?? '',
					statusKepalaSekolah: sekolah.statusKepalaSekolah ?? 'definitif'
				} as KeasramaanPrintData['kepalaSekolah'])
			: null,
		ttd: {
			tempat: ttdTempat,
			tanggal: ttdTanggal
		},
		kehadiran: {
			sakit: murid.kehadiran?.sakit ?? 0,
			izin: murid.kehadiran?.izin ?? 0,
			alfa: murid.kehadiran?.alfa ?? 0
		},
		keasramaanRows: finalRows
	};

	return {
		meta: {
			title: `Rapor Keasramaan - ${murid.nama}`
		},
		keasramaanData
	};
}
