import type { RequestHandler } from '@sveltejs/kit';
import db from '$lib/server/db';
import {
	tableKelas,
	tableMurid,
	tablePegawai,
	tableKeasramaan,
	tableKeasramaanIndikator,
	tableKeasramaanTujuan,
	tableAsesmenKeasramaan
} from '$lib/server/db/schema';
import { kategoriToRubrikValue, nilaiAngkaToHuruf } from '$lib/components/asesmen-keasramaan/utils';
import { canAccessKelas } from '$lib/server/kelas-akses';
import { isAuthorizedUser } from '../../pengguna/permissions';
import { eq, inArray, asc, and } from 'drizzle-orm';

type Person = { nama?: string; nip?: string };
type SekolahLike = { nama?: string; kepalaSekolah?: Person };

export const GET: RequestHandler = async ({ url, locals }) => {
	const sekolah = (locals as { sekolah?: unknown }).sekolah ?? null;
	const user = locals.user as { type?: string; pegawaiId?: number } | null;
	const kelasIdParam = url.searchParams.get('kelas_id');
	let waliKelas = null;
	let kelasNama: string | null = null;

	if (!isAuthorizedUser(['administrasi_rekap_keasramaan'], locals.user)) {
		return new Response(JSON.stringify({ fail: 'Anda tidak memiliki izin.' }), {
			status: 403,
			headers: { 'content-type': 'application/json' }
		});
	}

	const sekolahId = (sekolah as { id?: number } | null)?.id;
	if (kelasIdParam && sekolahId) {
		const id = Number(kelasIdParam);
		if (!Number.isInteger(id) || !(await canAccessKelas(locals.user, sekolahId, id))) {
			return new Response(JSON.stringify({ fail: 'Anda tidak memiliki izin untuk kelas ini.' }), {
				status: 403,
				headers: { 'content-type': 'application/json' }
			});
		}
	}

	try {
		if (kelasIdParam) {
			const id = Number(kelasIdParam);
			if (Number.isInteger(id)) {
				const kelas = await db.query.tableKelas.findFirst({
					where: eq(tableKelas.id, id),
					with: { waliKelas: true }
				});
				if (kelas?.waliKelas) {
					const wk = kelas.waliKelas as { nama?: string; nip?: string };
					waliKelas = { nama: wk.nama || '', nip: wk.nip || '' };
				}
				kelasNama = kelas?.nama ?? null;
			}
		}
	} catch (err) {
		console.warn('[api/leger-keasramaan-metadata] failed to load wali kelas', err);
	}

	// Satu kolom leger = satu mata evaluasi keasramaan (nilai = rata-rata rubrik TP-nya)
	let keasramaanList: Array<{ id: number; nama: string; tujuanIds: number[] }> = [];
	try {
		if (kelasIdParam) {
			const id = Number(kelasIdParam);
			if (Number.isInteger(id)) {
				const raw = await db.query.tableKeasramaan.findMany({
					where: eq(tableKeasramaan.kelasId, id),
					orderBy: [asc(tableKeasramaan.createdAt), asc(tableKeasramaan.id)],
					with: {
						indikator: {
							orderBy: [asc(tableKeasramaanIndikator.createdAt), asc(tableKeasramaanIndikator.id)],
							with: {
								tujuan: {
									orderBy: [asc(tableKeasramaanTujuan.createdAt), asc(tableKeasramaanTujuan.id)]
								}
							}
						}
					}
				});
				keasramaanList = raw.map((k) => ({
					id: k.id,
					nama: k.nama,
					tujuanIds: k.indikator.flatMap((ind) => ind.tujuan.map((t) => t.id))
				}));
			}
		}
	} catch (err) {
		console.warn('[api/leger-keasramaan-metadata] failed to load keasramaan', err);
	}

	const headers = keasramaanList.map((k) => ({
		id: `ks_${k.id}`,
		nama: k.nama
	}));

	let muridList: Array<{
		id: number;
		nama: string;
		waliAsuhNama: string | null;
		waliAsuhNip: string | null;
	}> = [];
	const nilaiByMurid = new Map<number, Map<number, number | null>>();
	// rata-rata rubrik keseluruhan per murid (untuk kolom Capaian Kelas)
	const rataByMurid = new Map<number, number>();
	try {
		if (kelasIdParam) {
			const id = Number(kelasIdParam);
			if (Number.isInteger(id)) {
				const mrd = await db.query.tableMurid.findMany({
					where: eq(tableMurid.kelasId, id),
					columns: { id: true, nama: true, waliAsuhNama: true, waliAsuhNip: true },
					orderBy: [asc(tableMurid.nama)]
				});
				// Wali_asuh: leger hanya berisi murid asuhannya
				let waliAsuhNama: string | null = null;
				if (user?.type === 'wali_asuh' && user.pegawaiId) {
					const peg = await db.query.tablePegawai.findFirst({
						columns: { nama: true },
						where: eq(tablePegawai.id, user.pegawaiId)
					});
					waliAsuhNama = peg?.nama?.trim().toLowerCase() ?? null;
				}
				const scoped =
					waliAsuhNama === null
						? mrd
						: mrd.filter((r) => (r.waliAsuhNama?.trim().toLowerCase() ?? '') === waliAsuhNama);
				muridList = scoped;

				const muridIds = muridList.map((m) => m.id);
				const tujuanIds = keasramaanList.flatMap((k) => k.tujuanIds);
				if (muridIds.length && tujuanIds.length) {
					const asesmen = await db.query.tableAsesmenKeasramaan.findMany({
						columns: { muridId: true, keasramaanId: true, tujuanId: true, kategori: true },
						where: and(
							inArray(tableAsesmenKeasramaan.muridId, muridIds),
							inArray(tableAsesmenKeasramaan.tujuanId, tujuanIds)
						)
					});
					// kumpulkan rubrik per murid per mata evaluasi keasramaan
					const buckets = new Map<number, Map<number, number[]>>();
					for (const a of asesmen) {
						let perKeasramaan = buckets.get(a.muridId);
						if (!perKeasramaan) {
							perKeasramaan = new Map();
							buckets.set(a.muridId, perKeasramaan);
						}
						const arr = perKeasramaan.get(a.keasramaanId) ?? [];
						arr.push(kategoriToRubrikValue(a.kategori));
						perKeasramaan.set(a.keasramaanId, arr);
					}
					for (const [muridId, perKeasramaan] of buckets) {
						const map = new Map<number, number | null>();
						let sum = 0;
						let count = 0;
						for (const [keasramaanId, values] of perKeasramaan) {
							const avg = values.reduce((a, b) => a + b, 0) / values.length;
							map.set(keasramaanId, Number.parseFloat(avg.toFixed(2)));
							sum += values.reduce((a, b) => a + b, 0);
							count += values.length;
						}
						nilaiByMurid.set(muridId, map);
						if (count > 0) rataByMurid.set(muridId, sum / count);
					}
				}
			}
		}
	} catch (err) {
		console.warn('[api/leger-keasramaan-metadata] failed to load murid/values', err);
	}

	const muridRows = muridList.map((m) => {
		const nilaiRecord: Record<string, string | null> = {};
		for (const h of headers) {
			const keasramaanId = Number(String(h.id).replace('ks_', ''));
			const v = nilaiByMurid.get(m.id)?.get(keasramaanId);
			nilaiRecord[String(h.id)] = v == null ? null : nilaiAngkaToHuruf(v);
		}
		const rata = rataByMurid.get(m.id);
		return {
			id: m.id,
			nama: m.nama,
			waliAsuhNama: m.waliAsuhNama,
			waliAsuhNip: m.waliAsuhNip,
			rata,
			nilai: nilaiRecord,
			capaian: rata == null ? null : nilaiAngkaToHuruf(rata)
		};
	});

	// predikat rata-rata kelas (baris RATA-RATA pada leger)
	const kelasAvg = (() => {
		const values = Array.from(rataByMurid.values());
		if (!values.length) return null;
		return values.reduce((a, b) => a + b, 0) / values.length;
	})();

	const s = sekolah as SekolahLike | null;
	const kepala = s?.kepalaSekolah
		? { nama: s.kepalaSekolah.nama || '', nip: s.kepalaSekolah.nip || '' }
		: null;

	const sekolahTyped = s as unknown as {
		lokasiTandaTangan?: string;
		semesterAktif?: { tanggalBagiRaport?: string };
	} | null;
	const lokasiTandaTangan = sekolahTyped?.lokasiTandaTangan ?? null;
	const tanggalBagiRaport = sekolahTyped?.semesterAktif?.tanggalBagiRaport ?? null;

	let waliAsramaInfo: any = null;
	let waliAsuhInfo: any = null;
	try {
		if (kelasIdParam) {
			const id = Number(kelasIdParam);
			if (Number.isInteger(id)) {
				const kelasData = await db.query.tableKelas.findFirst({
					where: eq(tableKelas.id, id),
					with: { waliAsrama: true, waliAsuh: true }
				});
				waliAsramaInfo = kelasData?.waliAsrama
					? { nama: kelasData.waliAsrama.nama, nip: kelasData.waliAsrama.nip }
					: null;
				waliAsuhInfo = kelasData?.waliAsuh
					? { nama: kelasData.waliAsuh.nama, nip: kelasData.waliAsuh.nip }
					: null;
			}
		}
	} catch (e) {}

	return new Response(
		JSON.stringify({
			sekolah: s ? { nama: s.nama || '' } : null,
			kepalaSekolah: kepala,
			waliKelas,
			waliAsrama: waliAsramaInfo,
			waliAsuh: waliAsuhInfo,
			lokasiTandaTangan,
			tanggalBagiRaport,
			kelasNama,
			headers,
			keasramaan: keasramaanList.map((k) => ({ id: k.id, nama: k.nama })),
			capaianKelas: kelasAvg == null ? null : nilaiAngkaToHuruf(kelasAvg),
			murid: muridRows
		}),
		{
			headers: { 'content-type': 'application/json' }
		}
	);
};
