import { error } from '@sveltejs/kit';
import { asc, and, eq } from 'drizzle-orm';
import db from '$lib/server/db';
import {
	tableAsesmenEkstrakurikuler,
	tableAsesmenKokurikuler,
	tableAsesmenSumatif,
	tableAsesmenSumatifTujuan,
	tableEkstrakurikuler,
	tableMurid,
	tableMuridEkstrakurikuler,
	tablePegawai
} from '$lib/server/db/schema';
import { parseRaporPeriode } from '$lib/rapor-params';
import {
	agamaMapelNames,
	agamaParentName,
	agamaMapelOptions,
	pksMapelOptions,
	type DimensiProfilLulusanKey
} from '$lib/statics';
import { jenisMapelLabel } from '$lib/jenis-mapel';
import { muridAgamaKey } from '$lib/server/mapel-picker';
import {
	buildKokurikulerNarrative,
	DEFAULT_KOKURIKULER_MESSAGE,
	type NilaiKategori,
	isNilaiKategori as isKokurikulerNilaiKategori,
	isProfilDimensionKey
} from '$lib/kokurikuler';
import {
	buildEkstrakurikulerDeskripsi,
	isEkstrakurikulerNilaiKategori,
	type EkstrakurikulerNilaiKategori
} from '$lib/ekstrakurikuler';
import { buildCapaianKompetensi, type TujuanScoreEntry } from '$lib/rapor-modes';
import {
	requireInteger,
	optionalInteger,
	composeAlamat,
	formatTanggal,
	fallbackTempat,
	getLogoSrc as getBgLogoSrc
} from '$lib/server/pdf/preview-utils';
import { computeRaporAttendance } from '$lib/server/pdf/attendance-utils';
import { waliKelasTtdUserId as resolveWaliKelasTtdUserId } from '$lib/server/tanda-tangan-guru';

const LOCALE_ID = 'id-ID';

const AGAMA_BASE_SUBJECT = 'Pendidikan Agama dan Budi Pekerti';

const PKS_BASE_SUBJECT = 'Pendalaman Kitab Suci';

function normalizeText(value: string | null | undefined) {
	return value?.trim().toLowerCase() ?? '';
}

function keyAgama(agama: string | null | undefined) {
	return muridAgamaKey(agama);
}

function optionByName(key: string | null, options: ReadonlyArray<{ key: string; name: string }>) {
	return key ? (options.find((o) => o.key === key)?.name ?? null) : null;
}

function resolveAgamaVariantName(agama: string | null | undefined) {
	return optionByName(keyAgama(agama), agamaMapelOptions);
}

// Resolve PKS variant name as stored in database (without "Agama")
function resolvePksVariantDbName(agama: string | null | undefined) {
	return optionByName(keyAgama(agama), pksMapelOptions);
}

// Resolve PKS variant name for display in rapor (with "Agama")
function resolvePksVariantDisplayName(agama: string | null | undefined) {
	const key = keyAgama(agama);
	if (!key) return null;
	const option = pksMapelOptions.find((o) => o.key === key);
	if (!option) return null;
	return `Pendalaman Kitab Suci Agama ${option.label}`;
}

export type RaporContext = {
	locals: App.Locals;
	url: URL;
};

function formatNilai(value: number | null | undefined): string {
	if (value === null || value === undefined) return '—';
	if (Number.isNaN(value)) return '—';
	const rounded = Math.round(value);
	return new Intl.NumberFormat(LOCALE_ID, {
		maximumFractionDigits: 0,
		minimumFractionDigits: 0
	}).format(rounded);
}

export async function getRaporPreviewPayload({ locals, url }: RaporContext) {
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
				with: {
					waliKelas: {
						columns: {
							id: true,
							nama: true,
							nip: true
						}
					},
					tahunAjaran: true,
					semester: true
				}
			},
			semester: true,
			catatanWali: true,
			keputusan: {
				columns: {
					naik: true
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

	const fullTPParam = url.searchParams.get('full_tp');
	const tpMode: 'compact' | 'full-desc' =
		fullTPParam === 'desc' || fullTPParam === 'full-desc' ? 'full-desc' : 'compact';

	// read optional intrakurikuler criteria overrides from query params
	// read optional rapor periode (rts = rapor tengah semester, ras = rapor akhir semester)
	const raporPeriode = parseRaporPeriode(url.searchParams.get('rapor_periode'));
	const isRTS = raporPeriode === 'rts';

	const kritCukupParam = url.searchParams.get('krit_cukup');
	const kritBaikParam = url.searchParams.get('krit_baik');
	const kritCukup = kritCukupParam ? Number(kritCukupParam) : undefined;
	const kritBaik = kritBaikParam ? Number(kritBaikParam) : undefined;

	const [
		asesmenSumatif,
		asesmenEkstrakurikuler,
		asesmenKokurikuler,
		asesmenSumatifTujuan,
		allEkstrakurikuler,
		muridEkstrakurikulerSettings
	] = await Promise.all([
		db.query.tableAsesmenSumatif.findMany({
			where: eq(tableAsesmenSumatif.muridId, murid.id),
			with: {
				mataPelajaran: true
			},
			orderBy: [asc(tableAsesmenSumatif.mataPelajaranId)]
		}),
		db.query.tableAsesmenEkstrakurikuler.findMany({
			where: eq(tableAsesmenEkstrakurikuler.muridId, murid.id),
			with: {
				ekstrakurikuler: true,
				tujuan: true
			},
			orderBy: [
				asc(tableAsesmenEkstrakurikuler.ekstrakurikulerId),
				asc(tableAsesmenEkstrakurikuler.tujuanId)
			]
		}),
		db.query.tableAsesmenKokurikuler.findMany({
			where: eq(tableAsesmenKokurikuler.muridId, murid.id),
			with: {
				kokurikuler: true
			}
		}),
		db.query.tableAsesmenSumatifTujuan.findMany({
			where: eq(tableAsesmenSumatifTujuan.muridId, murid.id),
			with: {
				tujuanPembelajaran: {
					columns: {
						deskripsi: true
					}
				}
			},
			orderBy: [
				asc(tableAsesmenSumatifTujuan.mataPelajaranId),
				asc(tableAsesmenSumatifTujuan.tujuanPembelajaranId)
			]
		}),
		db.query.tableEkstrakurikuler.findMany({
			where: eq(tableEkstrakurikuler.kelasId, murid.kelasId),
			orderBy: [asc(tableEkstrakurikuler.nama)]
		}),
		db.query.tableMuridEkstrakurikuler.findMany({
			columns: { ekstrakurikulerId: true, nilaiKosong: true },
			where: eq(tableMuridEkstrakurikuler.muridId, murid.id)
		})
	]);

	// Buat map untuk flag nilai kosong per ekstrakurikuler untuk murid ini
	const nilaiKosongMap = new Map<number, boolean>();
	for (const setting of muridEkstrakurikulerSettings) {
		nilaiKosongMap.set(setting.ekstrakurikulerId, Boolean(setting.nilaiKosong));
	}

	const tujuanScoresByMapel = new Map<number, TujuanScoreEntry[]>();

	for (const item of asesmenSumatifTujuan) {
		const deskripsi = item.tujuanPembelajaran?.deskripsi?.trim();
		if (!deskripsi) continue;
		const nilai = typeof item.nilai === 'number' && Number.isFinite(item.nilai) ? item.nilai : null;
		if (nilai == null) continue;
		const list = tujuanScoresByMapel.get(item.mataPelajaranId) ?? [];
		list.push({
			tujuanPembelajaranId: item.tujuanPembelajaranId,
			deskripsi,
			nilai
		});
		tujuanScoresByMapel.set(item.mataPelajaranId, list);
	}

	const muridNamaTrimmed = murid.nama.trim();
	const muridNama = muridNamaTrimmed.length > 0 ? muridNamaTrimmed : murid.nama;

	const mapelJenisOrder: Record<string, number> = {
		belum_dipetakan: 0,
		wajib: 1,
		pilihan: 2,
		kejuruan: 3,
		pemberdayaan: 4,
		mulok: 5
	};

	const normalizeSubjectName = (value: string) => value.trim().toLocaleLowerCase(LOCALE_ID);

	// Resolve the expected agama subject name based on murid's agama
	const muridExpectedAgamaMapel = resolveAgamaVariantName(murid.agama) ?? AGAMA_BASE_SUBJECT;
	const muridExpectedAgamaMapelNormalized = normalizeText(muridExpectedAgamaMapel);

	// Resolve the expected PKS subject name based on murid's agama
	// For filtering: use DB name (without "Agama")
	const muridExpectedPksDbMapel = resolvePksVariantDbName(murid.agama) ?? PKS_BASE_SUBJECT;
	const muridExpectedPksDbMapelNormalized = normalizeText(muridExpectedPksDbMapel);
	// For display: use display name (with "Agama")
	const muridExpectedPksDisplayMapel =
		resolvePksVariantDisplayName(murid.agama) ?? PKS_BASE_SUBJECT;

	function isAgamaSubject(name: string): boolean {
		// Mencakup varian "Pendidikan Kepercayaan terhadap Tuhan YME dan Budi Pekerti".
		return /^pendidikan (agama|kepercayaan)/i.test(normalizeText(name));
	}

	function isPksSubject(name: string): boolean {
		return normalizeText(name).startsWith('pendalaman kitab suci');
	}

	const wajibSubjectPriority = [
		{
			core: 'pendidikan agama dan budi pekerti',
			matchers: agamaMapelNames.map((name) => normalizeSubjectName(name))
		},
		{
			core: 'pendidikan pancasila',
			matchers: ['pendidikan pancasila']
		},
		{
			core: 'bahasa indonesia',
			matchers: ['bahasa indonesia']
		},
		{
			core: 'matematika',
			matchers: ['matematika']
		}
	] as const;

	// Resolve murid's agama subject name using the same mapping as filter
	const muridAgamaSubjectName = resolveAgamaVariantName(murid.agama) ?? agamaParentName;
	const muridPksSubjectDisplayName = muridExpectedPksDisplayMapel;

	const agamaParentNameNormalized = normalizeSubjectName(agamaParentName);

	type WajibPriorityInfo = {
		order: number;
		core: string;
	};

	const getWajibPriorityInfo = (name: string): WajibPriorityInfo => {
		const normalized = normalizeSubjectName(name);
		for (let index = 0; index < wajibSubjectPriority.length; index += 1) {
			const entry = wajibSubjectPriority[index];
			if (
				entry.matchers.some((matcher) => normalized === matcher || normalized.includes(matcher))
			) {
				return { order: index, core: entry.core };
			}
		}
		if (normalized.startsWith('pendidikan agama') && normalized.includes('budi pekerti')) {
			return { order: 0, core: 'pendidikan agama dan budi pekerti' };
		}
		return { order: Number.POSITIVE_INFINITY, core: normalized };
	};

	const nilaiIntrakurikuler = asesmenSumatif
		.filter((item) => {
			// Filter basic requirement
			if (!item.mataPelajaran) return false;

			const mapel = item.mataPelajaran;

			// Filter agama subject to only show the one matching murid's agama
			if (isAgamaSubject(mapel.nama)) {
				// Only include agama subject that matches murid's expected agama mapel
				return normalizeText(mapel.nama) === muridExpectedAgamaMapelNormalized;
			}

			// Filter PKS subject to only show the one matching murid's agama
			if (isPksSubject(mapel.nama)) {
				// Only include PKS subject that matches murid's expected PKS mapel (from DB, without "Agama")
				return normalizeText(mapel.nama) === muridExpectedPksDbMapelNormalized;
			}

			// Include non-agama and non-PKS subjects
			return true;
		})
		.map((item) => {
			const mapel = item.mataPelajaran!;
			const priority = mapel.jenis === 'wajib' ? getWajibPriorityInfo(mapel.nama) : null;
			const normalizedName = normalizeSubjectName(mapel.nama);
			const isAgamaCore = priority?.core === 'pendidikan agama dan budi pekerti';
			const tujuanScores = tujuanScoresByMapel.get(mapel.id) ?? [];

			// Determine display name (nama lokal menang bila diisi)
			let displayName = mapel.namaLokal || mapel.nama;

			// Handle PAPB: if parent, show variant name; if variant, show as is
			if (isAgamaCore && normalizedName === agamaParentNameNormalized) {
				displayName = muridAgamaSubjectName;
			}

			// Handle PKS: transform all PKS subjects to include "Agama" in display name
			if (isPksSubject(mapel.nama)) {
				// Always show with "Agama" for both parent and variants
				displayName = muridPksSubjectDisplayName;
			}

			return {
				mapel,
				priority,
				normalizedName,
				displayName,
				kelompok: jenisMapelLabel(mapel.jenis, {
					jenjangVariant: sekolah.jenjangVariant
				}),
				nilaiAkhir: formatNilai(isRTS ? (item.nilaiAkhirRts ?? null) : (item.nilaiAkhir ?? null)),
				deskripsi: buildCapaianKompetensi(
					muridNama,
					tujuanScores,
					mapel.kkm,
					tpMode,
					kritCukup,
					kritBaik
				)
			};
		})
		.sort((a, b) => {
			// Urutan manual mapel (kolom `urutan`) menang; sisanya pakai urutan lama
			// (jenis → prioritas wajib → nama). Template tetap mengelompokkan per jenis.
			const urutanA = a.mapel.urutan ?? Number.POSITIVE_INFINITY;
			const urutanB = b.mapel.urutan ?? Number.POSITIVE_INFINITY;
			if (urutanA !== urutanB) return urutanA - urutanB;
			const orderA = mapelJenisOrder[a.mapel.jenis] ?? Number.POSITIVE_INFINITY;
			const orderB = mapelJenisOrder[b.mapel.jenis] ?? Number.POSITIVE_INFINITY;
			if (orderA !== orderB) return orderA - orderB;
			if (a.mapel.jenis === 'wajib' && b.mapel.jenis === 'wajib') {
				const priorityOrderA = a.priority?.order ?? Number.POSITIVE_INFINITY;
				const priorityOrderB = b.priority?.order ?? Number.POSITIVE_INFINITY;
				if (priorityOrderA !== priorityOrderB) {
					return priorityOrderA - priorityOrderB;
				}
				const coreA = a.priority?.core ?? a.normalizedName;
				const coreB = b.priority?.core ?? b.normalizedName;
				if (coreA !== coreB) {
					return coreA.localeCompare(coreB, LOCALE_ID);
				}
			}
			return a.displayName.localeCompare(b.displayName, LOCALE_ID);
		})
		.filter((entry) => {
			// Sembunyikan mapel yang belum dinilai
			// Hanya tampilkan jika ada nilai akhir dan deskripsi bukan "Belum ada penilaian sumatif."
			return entry.nilaiAkhir !== '—' && entry.deskripsi !== 'Belum ada penilaian sumatif.';
		})
		.map((entry) => ({
			kelompok: entry.kelompok,
			mataPelajaran: entry.displayName,
			nilaiAkhir: entry.nilaiAkhir,
			deskripsi: entry.deskripsi,
			jenis: entry.mapel.jenis as
				'belum_dipetakan' | 'wajib' | 'pilihan' | 'mulok' | 'kejuruan' | 'pemberdayaan'
		}));

	const ekstrakurikulerGrouped = new Map<
		number,
		{
			nama: string;
			nilaiKosong: boolean;
			parts: Array<{ kategori: EkstrakurikulerNilaiKategori; tujuan: string }>;
		}
	>();

	for (const item of asesmenEkstrakurikuler) {
		const kegiatan = item.ekstrakurikuler;
		if (!kegiatan) continue;
		if (!isEkstrakurikulerNilaiKategori(item.kategori)) continue;
		const tujuan = item.tujuan?.deskripsi?.trim();
		if (!tujuan) continue;
		const group = ekstrakurikulerGrouped.get(kegiatan.id) ?? {
			nama: kegiatan.nama,
			nilaiKosong: nilaiKosongMap.get(kegiatan.id) || false,
			parts: []
		};
		group.parts.push({ kategori: item.kategori, tujuan });
		ekstrakurikulerGrouped.set(kegiatan.id, group);
	}

	// Tambahkan ekstrakurikuler yang belum dinilai (hanya jika flag nilaiKosong aktif untuk murid ini)
	for (const ekskul of allEkstrakurikuler) {
		if (!ekstrakurikulerGrouped.has(ekskul.id)) {
			// Hanya tambahkan jika flag nilaiKosong aktif untuk murid ini
			const hasNilaiKosong = nilaiKosongMap.get(ekskul.id) || false;
			if (hasNilaiKosong) {
				ekstrakurikulerGrouped.set(ekskul.id, {
					nama: ekskul.nama,
					nilaiKosong: true,
					parts: []
				});
			}
		}
	}

	const ekstrakurikuler = Array.from(ekstrakurikulerGrouped.values())
		.map((entry) => ({
			nama: entry.nama,
			deskripsi: entry.nilaiKosong
				? '-'
				: entry.parts.length > 0
					? (buildEkstrakurikulerDeskripsi(entry.parts, murid.nama) ?? 'Belum ada catatan.')
					: '' // Kosong untuk yang belum dinilai dan tidak ada flag
		}))
		.filter((entry) => entry.deskripsi !== '') // Filter yang benar-benar kosong
		.sort((a, b) => a.nama.localeCompare(b.nama, LOCALE_ID));

	const sanitizeTujuan = (value: string | null | undefined) =>
		value?.replace(/[.!?]+$/gu, '').trim() ?? '';
	const buildTujuanKey = (tujuan: string, dimensi: DimensiProfilLulusanKey) =>
		tujuan.length > 0 ? tujuan.toLocaleLowerCase(LOCALE_ID) : `__${dimensi}`;

	const kokurikulerGroups: Array<{
		tujuan: string;
		entries: Array<{ kategori: NilaiKategori; dimensi: DimensiProfilLulusanKey }>;
	}> = [];
	const kokurikulerByTujuan = new Map<
		string,
		{ tujuan: string; entries: Map<DimensiProfilLulusanKey, NilaiKategori> }
	>();
	for (const item of asesmenKokurikuler) {
		if (!isKokurikulerNilaiKategori(item.kategori)) continue;
		if (!isProfilDimensionKey(item.dimensi)) continue;
		const tujuanSanitized = sanitizeTujuan(item.kokurikuler?.tujuan ?? null);
		const tujuanKey = buildTujuanKey(tujuanSanitized, item.dimensi);
		const group = kokurikulerByTujuan.get(tujuanKey);
		if (group) {
			if (!group.tujuan && tujuanSanitized) {
				group.tujuan = tujuanSanitized;
			}
			if (!group.entries.has(item.dimensi)) {
				group.entries.set(item.dimensi, item.kategori);
			}
			continue;
		}
		const entries = new Map<DimensiProfilLulusanKey, NilaiKategori>();
		entries.set(item.dimensi, item.kategori);
		kokurikulerByTujuan.set(tujuanKey, {
			tujuan: tujuanSanitized,
			entries
		});
	}

	for (const { tujuan, entries } of kokurikulerByTujuan.values()) {
		const entryList = Array.from(entries.entries()).map(([dimensi, kategori]) => ({
			kategori,
			dimensi
		}));
		kokurikulerGroups.push({ tujuan, entries: entryList });
	}

	const kokurikuler =
		buildKokurikulerNarrative({
			studentName: murid.nama,
			groups: kokurikulerGroups
		}) ?? DEFAULT_KOKURIKULER_MESSAGE;

	const hasKokurikuler = kokurikulerGroups.length > 0;

	const ttdTanggal = formatTanggal(murid.semester?.tanggalBagiRaport);

	const showBgLogo = url.searchParams.get('bg_logo') === '1';
	const bgLogoSrc = showBgLogo ? await getBgLogoSrc(sekolah.id) : null;

	const waliKelasPegawai =
		murid.kelas?.waliKelas ??
		(murid.kelas?.waliKelasId
			? await db.query.tablePegawai.findFirst({
					where: eq(tablePegawai.id, murid.kelas.waliKelasId)
				})
			: null);

	const waliKelasTtdUserId = await resolveWaliKelasTtdUserId(waliKelasPegawai?.id);

	const semesterData = murid.kelas?.semester ?? murid.semester;
	const tahunAjaranData = murid.kelas?.tahunAjaran;
	const computedKehadiran =
		semesterData?.id && tahunAjaranData?.id
			? await computeRaporAttendance(sekolah.id, tahunAjaranData.id, murid.id, semesterData)
			: { sakit: 0, izin: 0, alfa: 0 };

	const raporData: RaporPrintData = {
		sekolah: {
			id: sekolah.id,
			nama: sekolah.nama,
			alamat: composeAlamat(sekolah),
			bgLogoSrc,
			jenjangVariant: sekolah.jenjangVariant ?? null
		},
		showBgLogo,
		raporPeriode,
		murid: {
			nama: murid.nama,
			nis: murid.nis,
			nisn: murid.nisn
		},
		rombel: {
			nama: murid.kelas?.nama ?? '',
			fase: murid.kelas?.fase ?? ''
		},
		periode: {
			tahunPelajaran: murid.kelas?.tahunAjaran?.nama ?? murid.semester?.nama ?? '',
			semester: murid.semester?.tipe
				? murid.semester.tipe.charAt(0).toUpperCase() + murid.semester.tipe.slice(1)
				: (murid.semester?.nama ?? '')
		},
		waliKelas: {
			nama: waliKelasPegawai?.nama ?? '',
			nip: waliKelasPegawai?.nip ?? null,
			ttdUserId: waliKelasTtdUserId
		},
		kepalaSekolah: {
			nama: sekolah.kepalaSekolah?.nama ?? '',
			nip: sekolah.kepalaSekolah?.nip ?? null,
			statusKepalaSekolah: sekolah.statusKepalaSekolah ?? 'definitif'
		},
		nilaiIntrakurikuler,
		kokurikuler,
		hasKokurikuler,
		ekstrakurikuler,
		ketidakhadiran: {
			sakit: computedKehadiran.sakit,
			izin: computedKehadiran.izin,
			tanpaKeterangan: computedKehadiran.alfa
		},
		catatanWali: murid.catatanWali?.catatan?.trim() ?? '',
		tanggapanOrangTua: '',
		naik: murid.keputusan?.naik ?? true,
		ttd: {
			tempat: fallbackTempat(sekolah),
			tanggal: ttdTanggal
		}
	};

	// include TP mode so the client can render compact/full differences
	raporData.tpMode = tpMode;

	return {
		meta: {
			title: isRTS ? `Rapor Tengah Semester - ${murid.nama}` : `Rapor - ${murid.nama}`
		},
		raporData
	};
}
