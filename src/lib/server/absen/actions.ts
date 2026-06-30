import db from '$lib/server/db';
import {
	tableMurid,
	tableKetidakhadiranHarian,
	tableKetidakhadiranRapor,
	tableAbsensi,
	tableAuthUserMataPelajaran,
	tableMataPelajaran,
	tableJadwalPelajaran,
	tableBellSettings,
	tableKegiatanCustom,
	tablePresensiSettings,
	tableTahunAjaran,
	tableSemester
} from '$lib/server/db/schema';
import { and, eq, inArray, sql, asc } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import {
	canUserEditAbsen,
	isTableMissingError,
	isValidDate,
	todayDateString,
	TABLE_MISSING_MESSAGE
} from './utils';
import { computeJamKeFromTime } from '$lib/server/absen-utils';
import {
	simWriteKetidakhadiran,
	simWriteAbsensi,
	simDeleteAbsensi,
	simGetKetidakhadiran,
	simClear
} from '$lib/server/simulasi-cache';

export async function handleUpdate({
	request,
	locals,
	url
}: {
	request: Request;
	locals: App.Locals;
	url: URL;
}) {
	const sekolahId = locals.sekolah?.id ?? null;
	if (!sekolahId) {
		return fail(401, { fail: 'Sekolah tidak ditemukan' });
	}

	if (!locals.user || !(await canUserEditAbsen(locals.user, sekolahId))) {
		return fail(403, { fail: 'Anda tidak memiliki izin untuk mengubah data kehadiran' });
	}

	const formData = await request.formData();
	const tanggalRaw = formData.get('tanggal')?.toString() ?? '';
	const tanggal = isValidDate(tanggalRaw) ? tanggalRaw : todayDateString();
	const muridIdRaw = formData.get('muridId');

	if (!muridIdRaw) {
		return fail(400, { fail: 'Murid tidak ditemukan' });
	}

	const muridId = Number(muridIdRaw);
	if (!Number.isInteger(muridId) || muridId <= 0) {
		return fail(400, { fail: 'ID murid tidak valid' });
	}

	const keteranganRaw = formData.get('keterangan')?.toString().trim() ?? '';
	const keterangan = ['sakit', 'izin', 'alfa'].includes(keteranganRaw) ? keteranganRaw : null;
	const keteranganPulangRaw = formData.get('keteranganPulang')?.toString().trim() ?? '';
	const keteranganPulang = ['sakit', 'izin', 'alfa'].includes(keteranganPulangRaw)
		? keteranganPulangRaw
		: null;

	const mataPelajaranIdRaw = formData.get('mataPelajaranId')?.toString();
	const mataPelajaranId = mataPelajaranIdRaw ? Number(mataPelajaranIdRaw) : null;

	const kelasIdRaw = formData.get('kelasId')?.toString();
	const kelasId = kelasIdRaw ? Number(kelasIdRaw) : null;

	const simHari = url.searchParams.get('simHari');
	const simJam = url.searchParams.get('simJam');

	const muridRecord = await db.query.tableMurid.findFirst({
		columns: { id: true },
		where: and(eq(tableMurid.id, muridId), eq(tableMurid.sekolahId, sekolahId))
	});

	if (!muridRecord) {
		return fail(404, { fail: 'Murid tidak ditemukan atau bukan bagian dari sekolah ini' });
	}

	if (simHari) {
		if (!kelasId) {
			return fail(400, { fail: 'Kelas tidak ditemukan' });
		}
		simWriteKetidakhadiran(
			sekolahId,
			kelasId,
			tanggal,
			muridId,
			keterangan,
			mataPelajaranId,
			simHari,
			simJam,
			keteranganPulang
		);
		return { message: 'Ketidakhadiran berhasil diperbarui (simulasi)' };
	}

	try {
		await db.transaction(async (tx) => {
			// SQLite treats NULLs as distinct in UNIQUE indexes, so onConflictDoUpdate
			// never fires when mataPelajaranId is NULL — always inserts a new row instead
			// of updating. Delete first to guarantee a single row per (murid, tanggal, NULL).
			if (mataPelajaranId == null) {
				await tx
					.delete(tableKetidakhadiranHarian)
					.where(
						and(
							eq(tableKetidakhadiranHarian.muridId, muridId),
							eq(tableKetidakhadiranHarian.tanggal, tanggal),
							sql`${tableKetidakhadiranHarian.mataPelajaranId} IS NULL`
						)
					);
			}
			await tx
				.insert(tableKetidakhadiranHarian)
				.values({ muridId, tanggal, keterangan, keteranganPulang, mataPelajaranId })
				.onConflictDoUpdate({
					target: [
						tableKetidakhadiranHarian.muridId,
						tableKetidakhadiranHarian.tanggal,
						tableKetidakhadiranHarian.mataPelajaranId
					],
					set: {
						keterangan,
						keteranganPulang,
						mataPelajaranId,
						updatedAt: new Date().toISOString()
					}
				});
		});
	} catch (error) {
		if (isTableMissingError(error)) {
			return fail(500, { fail: TABLE_MISSING_MESSAGE });
		}
		throw error;
	}

	return { message: 'Ketidakhadiran berhasil diperbarui' };
}

export async function handleIsiSekaligus({
	request,
	locals
}: {
	request: Request;
	locals: App.Locals;
}) {
	const sekolahId = locals.sekolah?.id ?? null;
	if (!sekolahId) {
		return fail(401, { fail: 'Sekolah tidak ditemukan' });
	}

	if (!locals.user) {
		return fail(403, { fail: 'Anda tidak memiliki izin untuk mengubah data kehadiran' });
	}
	const hasEditPermission = await canUserEditAbsen(locals.user, sekolahId);
	if (!hasEditPermission && locals.user.type !== 'user') {
		return fail(403, { fail: 'Anda tidak memiliki izin untuk mengubah data kehadiran' });
	}

	const formData = await request.formData();
	const tanggalRaw = formData.get('tanggal')?.toString() ?? '';
	const tanggal = isValidDate(tanggalRaw) ? tanggalRaw : todayDateString();
	const mode = formData.get('mode')?.toString();

	if (!mode || !['hadir_semua', 'selected'].includes(mode)) {
		return fail(400, { fail: 'Mode tidak valid' });
	}

	const kelasIdRaw = formData.get('kelasId')?.toString();
	const kelasId = kelasIdRaw ? Number(kelasIdRaw) : null;
	if (!kelasId || !Number.isInteger(kelasId)) {
		return fail(400, { fail: 'Kelas tidak ditemukan' });
	}

	const mataPelajaranIdRaw = formData.get('mataPelajaranId')?.toString();
	const mataPelajaranId = mataPelajaranIdRaw ? Number(mataPelajaranIdRaw) : null;
	const sessionType = formData.get('sessionType')?.toString() ?? null;
	const simHari = formData.get('simHari')?.toString() ?? null;
	const simJam = formData.get('simJam')?.toString() ?? null;
	const presensiType = formData.get('presensiType')?.toString() ?? 'masuk';

	const allSettings = await db.query.tablePresensiSettings.findFirst({
		columns: { jenisPresensi: true, jamMasuk: true, tipePresensi: true },
		where: eq(tablePresensiSettings.sekolahId, sekolahId)
	});
	const tipePresensi = allSettings?.tipePresensi ?? 'awal_mapel';

	// Guru mapel only: validate schedule match + own subject
	if (locals.user?.type === 'user') {
		const settings = allSettings;
		if (settings?.jenisPresensi === 'tiap_mapel' && settings.jamMasuk) {
			const dayNames = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
			const dayN = simHari ? simHari.toLowerCase() : dayNames[new Date().getDay()];
			const [bellSettingsRaw, kegiatanCustom, jadwalHariIni] = await Promise.all([
				db.query.tableBellSettings.findFirst({
					columns: {
						jamMulai: true,
						jamPelajaranMenit: true,
						durasiIstirahat: true,
						durasiUpacara: true
					},
					where: eq(tableBellSettings.sekolahId, sekolahId)
				}),
				db.query.tableKegiatanCustom.findMany({
					columns: { kode: true, durasi: true },
					where: eq(tableKegiatanCustom.sekolahId, sekolahId)
				}),
				db.query.tableJadwalPelajaran.findMany({
					columns: { kodeKegiatan: true, jamKe: true },
					where: and(
						eq(tableJadwalPelajaran.sekolahId, sekolahId),
						eq(tableJadwalPelajaran.kelasId, kelasId),
						eq(tableJadwalPelajaran.hari, dayN)
					),
					orderBy: [asc(tableJadwalPelajaran.jamKe)]
				})
			]);
			const jamKe = computeJamKeFromTime(
				simJam,
				jadwalHariIni,
				bellSettingsRaw ?? null,
				kegiatanCustom,
				settings.jamMasuk
			);
			const jadwal = jadwalHariIni.find((j) => j.jamKe === jamKe);
			const tambahan = new Set(['IST', 'PLG']);
			if (!jadwal || tambahan.has(jadwal.kodeKegiatan.toUpperCase())) {
				return fail(403, { fail: 'Jam pelajaran bapak/ibu belum dimulai' });
			}

			if (mataPelajaranId) {
				const agamaMapelNames = [
					'Pendidikan Agama dan Budi Pekerti',
					'Pendidikan Agama Islam dan Budi Pekerti',
					'Pendidikan Agama Kristen dan Budi Pekerti',
					'Pendidikan Agama Katolik dan Budi Pekerti',
					'Pendidikan Agama Buddha dan Budi Pekerti',
					'Pendidikan Agama Hindu dan Budi Pekerti',
					'Pendidikan Agama Konghuchu dan Budi Pekerti'
				];
				const agamaNameSet = new Set(agamaMapelNames);
				const mpRecord = await db.query.tableMataPelajaran.findFirst({
					columns: { kode: true, nama: true },
					where: eq(tableMataPelajaran.id, mataPelajaranId)
				});

				const userKodeSet = new Set<string>();
				const userMpIds = new Set<number>();
				if (locals.user.mataPelajaranId) userMpIds.add(locals.user.mataPelajaranId);
				const additional = await db.query.tableAuthUserMataPelajaran.findMany({
					columns: { mataPelajaranId: true },
					where: eq(tableAuthUserMataPelajaran.authUserId, locals.user.id)
				});
				for (const a of additional) {
					if (a.mataPelajaranId) userMpIds.add(a.mataPelajaranId);
				}
				if (userMpIds.size > 0) {
					const userMps = await db.query.tableMataPelajaran.findMany({
						columns: { kode: true, nama: true },
						where: inArray(tableMataPelajaran.id, [...userMpIds])
					});
					for (const mp of userMps) {
						if (mp.kode) userKodeSet.add(mp.kode.toUpperCase());
						if (agamaNameSet.has(mp.nama)) userKodeSet.add('PAPB');
					}
				}
				const mpKode = mpRecord?.kode?.toUpperCase();
				const isAgama = mpRecord?.nama && agamaNameSet.has(mpRecord.nama);
				const allowed = mpKode
					? userKodeSet.has(mpKode)
					: isAgama
						? userKodeSet.has('PAPB')
						: false;
				if (!allowed) {
					return fail(403, {
						fail: 'Anda tidak memiliki izin untuk melakukan presensi pada mata pelajaran ini'
					});
				}
			}
		}
	}

	const now = new Date().toISOString();
	const todayStart = new Date(tanggal + 'T00:00:00');
	const todayEnd = new Date(tanggal + 'T23:59:59.999');
	const absensiWaktu = tanggal === todayDateString() ? now : todayStart.toISOString();

	try {
		const semuaMurid = await db.query.tableMurid.findMany({
			columns: { id: true },
			where: and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, kelasId))
		});

		if (mode === 'hadir_semua') {
			if (simHari) {
				const isDualSessionSim =
					tipePresensi === 'awal_akhir_mapel' && mataPelajaranId != null && sessionType;

				if (isDualSessionSim) {
					const semuaMuridIds = semuaMurid.map((m) => m.id);
					simDeleteAbsensi(
						sekolahId,
						kelasId,
						tanggal,
						semuaMuridIds,
						mataPelajaranId,
						simHari,
						simJam
					);
					const targetCount = sessionType === 'akhir' ? 2 : 1;
					for (const murid of semuaMurid) {
						for (let i = 0; i < targetCount; i++) {
							simWriteAbsensi(
								sekolahId,
								kelasId,
								tanggal,
								murid.id,
								mataPelajaranId,
								simHari,
								simJam
							);
						}
					}
				} else {
					const existingMasukMapSim = new Map<number, string | null>();
					if (presensiType === 'pulang') {
						const existingSim = simGetKetidakhadiran(sekolahId, kelasId, tanggal, simHari, simJam);
						for (const e of existingSim) {
							if (e.muridId != null) {
								existingMasukMapSim.set(e.muridId, e.keterangan);
							}
						}
					}
					for (const murid of semuaMurid) {
						const isPulang = presensiType === 'pulang';
						const masukKet = isPulang ? (existingMasukMapSim.get(murid.id) ?? null) : null;
						simWriteKetidakhadiran(
							sekolahId,
							kelasId,
							tanggal,
							murid.id,
							masukKet,
							mataPelajaranId,
							simHari,
							simJam,
							isPulang ? masukKet : null
						);
						simWriteAbsensi(
							sekolahId,
							kelasId,
							tanggal,
							murid.id,
							mataPelajaranId,
							simHari,
							simJam
						);
					}
				}
				return { message: 'Semua murid ditandai hadir (simulasi)' };
			}

			let absensiCountMap: Map<number, number> | null = null;
			const isDualSession =
				tipePresensi === 'awal_akhir_mapel' && mataPelajaranId != null && sessionType;
			if (isDualSession) {
				const absensiRows = await db.query.tableAbsensi.findMany({
					columns: { muridId: true },
					where: and(
						inArray(
							tableAbsensi.muridId,
							semuaMurid.map((m) => m.id)
						),
						eq(tableAbsensi.mataPelajaranId, mataPelajaranId),
						sql`${tableAbsensi.waktu} >= ${todayStart.toISOString()}`,
						sql`${tableAbsensi.waktu} <= ${todayEnd.toISOString()}`
					)
				});
				absensiCountMap = new Map();
				for (const r of absensiRows) {
					absensiCountMap.set(r.muridId, (absensiCountMap.get(r.muridId) ?? 0) + 1);
				}
			}

			// Fetch existing records before delete if we need them for pulang auto-copy
			let existingMasukMap = new Map<number, string | null>();
			if (presensiType === 'pulang') {
				const existingRecs = await db.query.tableKetidakhadiranHarian.findMany({
					columns: { muridId: true, keterangan: true },
					where: and(
						inArray(
							tableKetidakhadiranHarian.muridId,
							semuaMurid.map((m) => m.id)
						),
						eq(tableKetidakhadiranHarian.tanggal, tanggal),
						mataPelajaranId != null
							? eq(tableKetidakhadiranHarian.mataPelajaranId, mataPelajaranId)
							: sql`${tableKetidakhadiranHarian.mataPelajaranId} IS NULL`
					)
				});
				for (const r of existingRecs) {
					existingMasukMap.set(r.muridId, r.keterangan);
				}
			}

			// SQLite treats NULLs as distinct in UNIQUE indexes, so onConflictDoUpdate
			// never fires when mataPelajaranId is NULL — always inserts a new row instead
			// of updating. Delete old rows first so each insert lands fresh.
			if (mataPelajaranId == null) {
				const allMuridIds = semuaMurid.map((m) => m.id);
				await db
					.delete(tableKetidakhadiranHarian)
					.where(
						and(
							inArray(tableKetidakhadiranHarian.muridId, allMuridIds),
							eq(tableKetidakhadiranHarian.tanggal, tanggal),
							sql`${tableKetidakhadiranHarian.mataPelajaranId} IS NULL`
						)
					);
			}

			for (const murid of semuaMurid) {
				const values: typeof tableKetidakhadiranHarian.$inferInsert = {
					muridId: murid.id,
					tanggal,
					mataPelajaranId
				};

				if (presensiType === 'pulang') {
					const masukKet = existingMasukMap.get(murid.id) ?? null;
					values.keterangan = masukKet;
					values.keteranganPulang = masukKet;
				} else {
					values.keterangan = null;
				}

				await db
					.insert(tableKetidakhadiranHarian)
					.values(values)
					.onConflictDoUpdate({
						target: [
							tableKetidakhadiranHarian.muridId,
							tableKetidakhadiranHarian.tanggal,
							tableKetidakhadiranHarian.mataPelajaranId
						],
						set: {
							...values,
							updatedAt: now
						}
					});

				if (isDualSession) {
					const currentCount = absensiCountMap!.get(murid.id) ?? 0;
					if (sessionType === 'akhir') {
						if (currentCount < 2) {
							await db
								.insert(tableAbsensi)
								.values({ muridId: murid.id, waktu: absensiWaktu, mataPelajaranId });
						}
					} else {
						if (currentCount === 0) {
							await db
								.insert(tableAbsensi)
								.values({ muridId: murid.id, waktu: absensiWaktu, mataPelajaranId });
						}
					}
				} else {
					const existingAbsensi = await db.query.tableAbsensi.findFirst({
						columns: { id: true },
						where: and(
							eq(tableAbsensi.muridId, murid.id),
							mataPelajaranId != null
								? eq(tableAbsensi.mataPelajaranId, mataPelajaranId)
								: sql`${tableAbsensi.mataPelajaranId} IS NULL`,
							sql`${tableAbsensi.waktu} >= ${todayStart.toISOString()}`,
							sql`${tableAbsensi.waktu} <= ${todayEnd.toISOString()}`
						)
					});
					if (!existingAbsensi) {
						await db
							.insert(tableAbsensi)
							.values({ muridId: murid.id, waktu: absensiWaktu, mataPelajaranId });
					}
				}
			}

			return { message: 'Semua murid ditandai hadir' };
		}

		if (mode === 'selected') {
			const entriesRaw = formData.get('entries')?.toString() ?? '';
			let entries: Array<{ muridId: number; keterangan: string }> = [];
			try {
				entries = JSON.parse(entriesRaw);
			} catch {
				return fail(400, { fail: 'Data tidak valid' });
			}

			if (!Array.isArray(entries) || entries.length === 0) {
				return fail(400, { fail: 'Pilih minimal satu murid' });
			}

			const entryMap = new Map<number, string>();
			for (const e of entries) {
				const id = Number(e.muridId);
				if (Number.isInteger(id) && id > 0) {
					const k = ['sakit', 'izin', 'alfa'].includes(e.keterangan) ? e.keterangan : 'alfa';
					entryMap.set(id, k);
				}
			}

			const selectedIdsSet = new Set(entryMap.keys());
			const nonSelectedMurid = semuaMurid.filter((m) => !selectedIdsSet.has(m.id));

			if (simHari) {
				for (const [muridId, keterangan] of entryMap) {
					const isPulang = presensiType === 'pulang';
					simWriteKetidakhadiran(
						sekolahId,
						kelasId,
						tanggal,
						muridId,
						isPulang ? null : keterangan,
						mataPelajaranId,
						simHari,
						simJam,
						isPulang ? keterangan : null
					);
				}

				const isDualSessionSelSim =
					tipePresensi === 'awal_akhir_mapel' && mataPelajaranId != null && sessionType;

				if (isDualSessionSelSim) {
					const selIds = Array.from(selectedIdsSet);
					const nonSelIds = nonSelectedMurid.map((m) => m.id);
					if (selIds.length > 0) {
						simDeleteAbsensi(sekolahId, kelasId, tanggal, selIds, mataPelajaranId, simHari, simJam);
					}
					if (nonSelIds.length > 0) {
						simDeleteAbsensi(
							sekolahId,
							kelasId,
							tanggal,
							nonSelIds,
							mataPelajaranId,
							simHari,
							simJam
						);
						const targetCount = sessionType === 'akhir' ? 2 : 1;
						for (const murid of nonSelectedMurid) {
							for (let i = 0; i < targetCount; i++) {
								simWriteAbsensi(
									sekolahId,
									kelasId,
									tanggal,
									murid.id,
									mataPelajaranId,
									simHari,
									simJam
								);
							}
						}
					}
				} else {
					for (const murid of nonSelectedMurid) {
						simWriteKetidakhadiran(
							sekolahId,
							kelasId,
							tanggal,
							murid.id,
							null,
							mataPelajaranId,
							simHari,
							simJam
						);
						simWriteAbsensi(
							sekolahId,
							kelasId,
							tanggal,
							murid.id,
							mataPelajaranId,
							simHari,
							simJam
						);
					}
				}
				return { message: 'Kehadiran berhasil diperbarui (simulasi)' };
			}

			// Fetch existing records before delete if we need them for pulang auto-copy
			let existingMasukMap = new Map<number, string | null>();
			if (presensiType === 'pulang') {
				const existingRecs = await db.query.tableKetidakhadiranHarian.findMany({
					columns: { muridId: true, keterangan: true },
					where: and(
						inArray(
							tableKetidakhadiranHarian.muridId,
							semuaMurid.map((m) => m.id)
						),
						eq(tableKetidakhadiranHarian.tanggal, tanggal),
						mataPelajaranId != null
							? eq(tableKetidakhadiranHarian.mataPelajaranId, mataPelajaranId)
							: sql`${tableKetidakhadiranHarian.mataPelajaranId} IS NULL`
					)
				});
				for (const r of existingRecs) {
					existingMasukMap.set(r.muridId, r.keterangan);
				}
			}

			const selectedIds = Array.from(entryMap.keys());
			if (selectedIds.length > 0) {
				const deleteAbsensiConditions: any[] = [
					inArray(tableAbsensi.muridId, selectedIds),
					sql`${tableAbsensi.waktu} >= ${todayStart.toISOString()}`,
					sql`${tableAbsensi.waktu} <= ${todayEnd.toISOString()}`
				];
				if (mataPelajaranId != null) {
					deleteAbsensiConditions.push(eq(tableAbsensi.mataPelajaranId, mataPelajaranId));
				}
				await db.delete(tableAbsensi).where(and(...deleteAbsensiConditions));
			}

			// SQLite treats NULLs as distinct in UNIQUE indexes, so onConflictDoUpdate
			// never fires when mataPelajaranId is NULL — always inserts a new row instead
			// of updating. Delete old rows first so each insert lands fresh.
			if (mataPelajaranId == null) {
				const allMuridIds = semuaMurid.map((m) => m.id);
				await db
					.delete(tableKetidakhadiranHarian)
					.where(
						and(
							inArray(tableKetidakhadiranHarian.muridId, allMuridIds),
							eq(tableKetidakhadiranHarian.tanggal, tanggal),
							sql`${tableKetidakhadiranHarian.mataPelajaranId} IS NULL`
						)
					);
			}

			for (const [muridId, keterangan] of entryMap) {
				const isPulang = presensiType === 'pulang';
				await db
					.insert(tableKetidakhadiranHarian)
					.values({
						muridId,
						tanggal,
						keterangan: isPulang ? (existingMasukMap.get(muridId) ?? null) : keterangan,
						keteranganPulang: isPulang ? keterangan : undefined,
						mataPelajaranId
					})
					.onConflictDoUpdate({
						target: [
							tableKetidakhadiranHarian.muridId,
							tableKetidakhadiranHarian.tanggal,
							tableKetidakhadiranHarian.mataPelajaranId
						],
						set: {
							keterangan: isPulang ? (existingMasukMap.get(muridId) ?? null) : keterangan,
							keteranganPulang: isPulang ? keterangan : undefined,
							mataPelajaranId,
							updatedAt: now
						}
					});
			}

			const isDualSessionSelected =
				tipePresensi === 'awal_akhir_mapel' && mataPelajaranId != null && sessionType;
			let nonSelectedAbsensiCountMap: Map<number, number> | null = null;
			if (isDualSessionSelected) {
				const absensiRows = await db.query.tableAbsensi.findMany({
					columns: { muridId: true },
					where: and(
						inArray(
							tableAbsensi.muridId,
							nonSelectedMurid.map((m) => m.id)
						),
						eq(tableAbsensi.mataPelajaranId, mataPelajaranId),
						sql`${tableAbsensi.waktu} >= ${todayStart.toISOString()}`,
						sql`${tableAbsensi.waktu} <= ${todayEnd.toISOString()}`
					)
				});
				nonSelectedAbsensiCountMap = new Map();
				for (const r of absensiRows) {
					nonSelectedAbsensiCountMap.set(
						r.muridId,
						(nonSelectedAbsensiCountMap.get(r.muridId) ?? 0) + 1
					);
				}
			}

			for (const murid of nonSelectedMurid) {
				const isPulang = presensiType === 'pulang';
				let nsKeterangan: string | null | undefined = null;
				let nsKeteranganPulang: string | null | undefined = undefined;

				if (isPulang) {
					const masukKet = existingMasukMap.get(murid.id) ?? null;
					nsKeterangan = masukKet;
					nsKeteranganPulang = masukKet;
				}

				await db
					.insert(tableKetidakhadiranHarian)
					.values({
						muridId: murid.id,
						tanggal,
						keterangan: nsKeterangan,
						keteranganPulang: nsKeteranganPulang,
						mataPelajaranId
					})
					.onConflictDoUpdate({
						target: [
							tableKetidakhadiranHarian.muridId,
							tableKetidakhadiranHarian.tanggal,
							tableKetidakhadiranHarian.mataPelajaranId
						],
						set: {
							keterangan: nsKeterangan,
							keteranganPulang: nsKeteranganPulang,
							mataPelajaranId,
							updatedAt: now
						}
					});

				if (isDualSessionSelected) {
					const currentCount = nonSelectedAbsensiCountMap!.get(murid.id) ?? 0;
					if (sessionType === 'akhir') {
						if (currentCount < 2) {
							await db
								.insert(tableAbsensi)
								.values({ muridId: murid.id, waktu: absensiWaktu, mataPelajaranId });
						}
					} else if (currentCount === 0) {
						await db
							.insert(tableAbsensi)
							.values({ muridId: murid.id, waktu: absensiWaktu, mataPelajaranId });
					}
				} else {
					const existingAbsensi = await db.query.tableAbsensi.findFirst({
						columns: { id: true },
						where: and(
							eq(tableAbsensi.muridId, murid.id),
							mataPelajaranId != null
								? eq(tableAbsensi.mataPelajaranId, mataPelajaranId)
								: sql`${tableAbsensi.mataPelajaranId} IS NULL`,
							sql`${tableAbsensi.waktu} >= ${todayStart.toISOString()}`,
							sql`${tableAbsensi.waktu} <= ${todayEnd.toISOString()}`
						)
					});
					if (!existingAbsensi) {
						await db
							.insert(tableAbsensi)
							.values({ muridId: murid.id, waktu: absensiWaktu, mataPelajaranId });
					}
				}
			}

			return { message: 'Kehadiran berhasil diperbarui' };
		}
	} catch (error) {
		if (isTableMissingError(error)) {
			return fail(500, { fail: TABLE_MISSING_MESSAGE });
		}
		throw error;
	}
}

export async function handleDeletePresensi({
	request,
	locals,
	url
}: {
	request: Request;
	locals: App.Locals;
	url: URL;
}) {
	const sekolahId = locals.sekolah?.id ?? null;
	if (!sekolahId) {
		return fail(401, { fail: 'Sekolah tidak ditemukan' });
	}

	if (!locals.user || !(await canUserEditAbsen(locals.user, sekolahId))) {
		return fail(403, { fail: 'Anda tidak memiliki izin untuk menghapus data presensi' });
	}

	const formData = await request.formData();
	const tanggalRaw = formData.get('tanggal')?.toString() ?? '';
	const tanggal = isValidDate(tanggalRaw) ? tanggalRaw : todayDateString();
	const kelasIdRaw = formData.get('kelasId')?.toString();
	const kelasId = kelasIdRaw ? Number(kelasIdRaw) : null;
	if (!kelasId || !Number.isInteger(kelasId)) {
		return fail(400, { fail: 'Kelas tidak ditemukan' });
	}

	const simHari = url.searchParams.get('simHari');
	const simJam = url.searchParams.get('simJam');

	if (simHari) {
		simClear(sekolahId, kelasId, tanggal, simHari, simJam);
		return { message: 'Semua data presensi berhasil dihapus (simulasi)' };
	}

	const muridIds = await db
		.select({ id: tableMurid.id })
		.from(tableMurid)
		.where(and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.kelasId, kelasId)));

	const ids = muridIds.map((m) => m.id);
	if (ids.length === 0) {
		return { message: 'Tidak ada data presensi untuk tanggal ini' };
	}

	const todayStart = new Date(tanggal + 'T00:00:00');
	const todayEnd = new Date(tanggal + 'T23:59:59.999');

	try {
		await db.transaction(async (tx) => {
			await tx
				.delete(tableAbsensi)
				.where(
					and(
						inArray(tableAbsensi.muridId, ids),
						sql`${tableAbsensi.mataPelajaranId} IS NULL`,
						sql`${tableAbsensi.waktu} >= ${todayStart.toISOString()}`,
						sql`${tableAbsensi.waktu} <= ${todayEnd.toISOString()}`
					)
				);

			await tx
				.delete(tableKetidakhadiranHarian)
				.where(
					and(
						inArray(tableKetidakhadiranHarian.muridId, ids),
						sql`${tableKetidakhadiranHarian.mataPelajaranId} IS NULL`,
						eq(tableKetidakhadiranHarian.tanggal, tanggal)
					)
				);
		});
	} catch (error) {
		if (isTableMissingError(error)) {
			return fail(500, { fail: TABLE_MISSING_MESSAGE });
		}
		throw error;
	}

	return { message: 'Semua data presensi berhasil dihapus' };
}

export async function handleUpdateRapor({
	request,
	locals
}: {
	request: Request;
	locals: App.Locals;
}) {
	const sekolahId = locals.sekolah?.id ?? null;
	if (!sekolahId) {
		return fail(401, { fail: 'Sekolah tidak ditemukan' });
	}

	if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
		return fail(403, { fail: 'Anda tidak memiliki izin untuk mengubah data kehadiran' });
	}

	const activeTa = await db.query.tableTahunAjaran.findFirst({
		where: and(eq(tableTahunAjaran.sekolahId, sekolahId), eq(tableTahunAjaran.isAktif, true))
	});
	if (!activeTa) return fail(400, { fail: 'Tahun ajaran aktif tidak ditemukan' });

	const activeSemester = await db.query.tableSemester.findFirst({
		where: and(eq(tableSemester.tahunAjaranId, activeTa.id), eq(tableSemester.isAktif, true))
	});
	if (!activeSemester) return fail(400, { fail: 'Semester aktif tidak ditemukan' });

	const semesterId = activeSemester.id;

	const formData = await request.formData();
	const muridIdRaw = formData.get('muridId');

	if (!muridIdRaw) {
		return fail(400, { fail: 'Murid tidak ditemukan' });
	}

	const muridId = Number(muridIdRaw);
	if (!Number.isInteger(muridId) || muridId <= 0) {
		return fail(400, { fail: 'ID murid tidak valid' });
	}

	const sakitRaw = formData.get('sakit')?.toString().trim() ?? '';
	const izinRaw = formData.get('izin')?.toString().trim() ?? '';
	const alfaRaw = formData.get('alfa')?.toString().trim() ?? '';

	const sakit = sakitRaw ? Number(sakitRaw) : null;
	const izin = izinRaw ? Number(izinRaw) : null;
	const alfa = alfaRaw ? Number(alfaRaw) : null;

	if (
		(sakit !== null && (!Number.isInteger(sakit) || sakit < 0)) ||
		(izin !== null && (!Number.isInteger(izin) || izin < 0)) ||
		(alfa !== null && (!Number.isInteger(alfa) || alfa < 0))
	) {
		return fail(400, { fail: 'Nilai tidak valid' });
	}

	const muridRecord = await db.query.tableMurid.findFirst({
		columns: { id: true },
		where: and(eq(tableMurid.id, muridId), eq(tableMurid.sekolahId, sekolahId))
	});

	if (!muridRecord) {
		return fail(404, { fail: 'Murid tidak ditemukan atau bukan bagian dari sekolah ini' });
	}

	try {
		await db
			.insert(tableKetidakhadiranRapor)
			.values({ muridId, semesterId, sakit, izin, alfa })
			.onConflictDoUpdate({
				target: [tableKetidakhadiranRapor.muridId, tableKetidakhadiranRapor.semesterId],
				set: { sakit, izin, alfa, updatedAt: new Date().toISOString() }
			});
	} catch (error) {
		if (isTableMissingError(error)) {
			return fail(500, { fail: TABLE_MISSING_MESSAGE });
		}
		throw error;
	}

	return { message: 'Data kehadiran rapor berhasil diperbarui' };
}

export async function handleResetRapor({
	request,
	locals
}: {
	request: Request;
	locals: App.Locals;
}) {
	const sekolahId = locals.sekolah?.id ?? null;
	if (!sekolahId) {
		return fail(401, { fail: 'Sekolah tidak ditemukan' });
	}

	if (locals.user?.type === 'user' || locals.user?.type === 'wali_asuh') {
		return fail(403, { fail: 'Anda tidak memiliki izin untuk mengubah data kehadiran' });
	}

	const activeTa = await db.query.tableTahunAjaran.findFirst({
		where: and(eq(tableTahunAjaran.sekolahId, sekolahId), eq(tableTahunAjaran.isAktif, true))
	});
	if (!activeTa) return fail(400, { fail: 'Tahun ajaran aktif tidak ditemukan' });

	const activeSemester = await db.query.tableSemester.findFirst({
		where: and(eq(tableSemester.tahunAjaranId, activeTa.id), eq(tableSemester.isAktif, true))
	});
	if (!activeSemester) return fail(400, { fail: 'Semester aktif tidak ditemukan' });

	const semesterId = activeSemester.id;

	const formData = await request.formData();
	const muridIdRaw = formData.get('muridId');

	if (!muridIdRaw) {
		return fail(400, { fail: 'Murid tidak ditemukan' });
	}

	const muridId = Number(muridIdRaw);
	if (!Number.isInteger(muridId) || muridId <= 0) {
		return fail(400, { fail: 'ID murid tidak valid' });
	}

	const muridRecord = await db.query.tableMurid.findFirst({
		columns: { id: true },
		where: and(eq(tableMurid.id, muridId), eq(tableMurid.sekolahId, sekolahId))
	});

	if (!muridRecord) {
		return fail(404, { fail: 'Murid tidak ditemukan atau bukan bagian dari sekolah ini' });
	}

	try {
		await db
			.delete(tableKetidakhadiranRapor)
			.where(
				and(
					eq(tableKetidakhadiranRapor.muridId, muridId),
					eq(tableKetidakhadiranRapor.semesterId, semesterId)
				)
			);
	} catch (error) {
		if (isTableMissingError(error)) {
			return fail(500, { fail: TABLE_MISSING_MESSAGE });
		}
		throw error;
	}

	return { message: 'Data kehadiran rapor berhasil direset' };
}
