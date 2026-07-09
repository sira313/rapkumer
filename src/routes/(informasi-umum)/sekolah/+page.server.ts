import db from '$lib/server/db';
import {
	tableAlamat,
	tableEkstrakurikuler,
	tableEkstrakurikulerTujuan,
	tableKelas,
	tableKokurikuler,
	tableMataPelajaran,
	tableMurid,
	tablePegawai,
	tableSekolah,
	tableTasks,
	tableTahunAjaran,
	tableTujuanPembelajaran,
	tableAuthUser,
	tableAsesmenFormatif,
	tableAsesmenSumatif,
	tableAsesmenSumatifTujuan,
	tableAsesmenEkstrakurikuler,
	tableAsesmenKokurikuler,
	tableWaliMurid
} from '$lib/server/db/schema';
import { fail } from '@sveltejs/kit';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('app:sekolah');

	const [kelasCounts, muridCounts] = await Promise.all([
		db
			.select({ sekolahId: tableKelas.sekolahId, total: sql<number>`count(*)` })
			.from(tableKelas)
			.groupBy(tableKelas.sekolahId),
		db
			.select({ sekolahId: tableMurid.sekolahId, total: sql<number>`count(*)` })
			.from(tableMurid)
			.groupBy(tableMurid.sekolahId)
	]);

	const kelasCountMap = new Map<number, number>();
	for (const row of kelasCounts) {
		kelasCountMap.set(row.sekolahId, row.total ?? 0);
	}

	const muridCountMap = new Map<number, number>();
	for (const row of muridCounts) {
		muridCountMap.set(row.sekolahId, row.total ?? 0);
	}

	const sekolahRows = await db.query.tableSekolah.findMany({
		columns: { logo: false },
		with: {
			alamat: true,
			kepalaSekolah: true,
			tahunAjaran: { with: { semester: true } }
		},
		orderBy: [desc(tableSekolah.id)]
	});

	const sekolahList = sekolahRows.map(({ tahunAjaran, ...rest }) => {
		const activeTahunAjaran = tahunAjaran.find((item) => item.isAktif) ?? null;
		const activeSemester = activeTahunAjaran?.semester.find((item) => item.isAktif) ?? null;

		return {
			...rest,
			tahunAjaranAktif: activeTahunAjaran
				? {
						id: activeTahunAjaran.id,
						nama: activeTahunAjaran.nama
					}
				: null,
			semesterAktif: activeSemester
				? {
						id: activeSemester.id,
						nama: activeSemester.nama,
						tipe: activeSemester.tipe,
						tanggalBagiRaport: activeSemester.tanggalBagiRaport
					}
				: null,
			jumlahRombel: kelasCountMap.get(rest.id) ?? 0,
			jumlahMurid: muridCountMap.get(rest.id) ?? 0
		};
	});

	return {
		sekolahList,
		sekolah: locals.sekolah,
		meta: { title: 'Identitas Sekolah', logoUrl: '/sekolah/logo' }
	};
};

export const actions: Actions = {
	async delete({ request }) {
		const formData = await request.formData();
		const sekolahIdRaw = formData.get('sekolahId');
		const sekolahId = Number(sekolahIdRaw);

		if (!Number.isInteger(sekolahId) || sekolahId <= 0) {
			return fail(400, { fail: 'Sekolah tidak valid.' });
		}

		const sekolah = await db.query.tableSekolah.findFirst({
			where: eq(tableSekolah.id, sekolahId),
			columns: { id: true, alamatId: true, kepalaSekolahId: true }
		});

		if (!sekolah) {
			return fail(404, { fail: 'Sekolah tidak ditemukan.' });
		}

		const forceDelete = formData.get('forceDelete') === 'true';

		const [{ totalRombel }] = await db
			.select({ totalRombel: sql<number>`count(*)` })
			.from(tableKelas)
			.where(eq(tableKelas.sekolahId, sekolahId));

		const [{ totalMurid }] = await db
			.select({ totalMurid: sql<number>`count(*)` })
			.from(tableMurid)
			.where(eq(tableMurid.sekolahId, sekolahId));

		const rombelMasihAda = (totalRombel ?? 0) > 0;
		const muridMasihAda = (totalMurid ?? 0) > 0;

		if (!forceDelete && (rombelMasihAda || muridMasihAda)) {
			const message = `Sekolah masih memiliki ${totalRombel ?? 0} rombel dan ${
				totalMurid ?? 0
			} murid. Centang opsi "Hapus semua data sekolah beserta isinya" untuk menghapus permanen.`;
			return fail(400, { fail: message });
		}

		try {
			await db.transaction(async (tx) => {
				const kelasRows = await tx
					.select({ id: tableKelas.id, waliKelasId: tableKelas.waliKelasId })
					.from(tableKelas)
					.where(eq(tableKelas.sekolahId, sekolahId));
				const kelasIds = kelasRows.map((row) => row.id);
				const waliPegawaiIds = new Set<number>();
				for (const row of kelasRows) {
					if (row.waliKelasId) {
						waliPegawaiIds.add(row.waliKelasId);
					}
				}

				const muridRows = await tx
					.select({
						alamatId: tableMurid.alamatId,
						ibuId: tableMurid.ibuId,
						ayahId: tableMurid.ayahId,
						waliId: tableMurid.waliId
					})
					.from(tableMurid)
					.where(eq(tableMurid.sekolahId, sekolahId));

				const alamatIds = new Set<number>();
				if (sekolah.alamatId) {
					alamatIds.add(sekolah.alamatId);
				}

				const waliMuridIds = new Set<number>();
				for (const row of muridRows) {
					if (row.alamatId) {
						alamatIds.add(row.alamatId);
					}
					if (row.ibuId) {
						waliMuridIds.add(row.ibuId);
					}
					if (row.ayahId) {
						waliMuridIds.add(row.ayahId);
					}
					if (row.waliId) {
						waliMuridIds.add(row.waliId);
					}
				}

				const pegawaiIds = new Set<number>();
				if (sekolah.kepalaSekolahId) {
					pegawaiIds.add(sekolah.kepalaSekolahId);
				}
				for (const id of waliPegawaiIds) {
					pegawaiIds.add(id);
				}

				// remove auth_user rows tied to this sekolah early to avoid FK blocks
				await tx.delete(tableAuthUser).where(eq(tableAuthUser.sekolahId, sekolahId));

				if (kelasIds.length) {
					const mapelRows = await tx
						.select({ id: tableMataPelajaran.id })
						.from(tableMataPelajaran)
						.where(inArray(tableMataPelajaran.kelasId, kelasIds));
					const mapelIds = mapelRows.map((row) => row.id);

					// remove auth_user rows that reference mata pelajaran or kelas (they may not have sekolahId)
					if (mapelIds.length) {
						await tx.delete(tableAuthUser).where(inArray(tableAuthUser.mataPelajaranId, mapelIds));
					}
					await tx.delete(tableAuthUser).where(inArray(tableAuthUser.kelasId, kelasIds));

					if (mapelIds.length) {
						await tx
							.delete(tableTujuanPembelajaran)
							.where(inArray(tableTujuanPembelajaran.mataPelajaranId, mapelIds));
						await tx.delete(tableMataPelajaran).where(inArray(tableMataPelajaran.id, mapelIds));
					}

					const ekstrakRows = await tx
						.select({ id: tableEkstrakurikuler.id })
						.from(tableEkstrakurikuler)
						.where(inArray(tableEkstrakurikuler.kelasId, kelasIds));
					const ekstrakIds = ekstrakRows.map((row) => row.id);

					if (ekstrakIds.length) {
						await tx
							.delete(tableEkstrakurikulerTujuan)
							.where(inArray(tableEkstrakurikulerTujuan.ekstrakurikulerId, ekstrakIds));
						await tx
							.delete(tableEkstrakurikuler)
							.where(inArray(tableEkstrakurikuler.id, ekstrakIds));
					}

					const kokurikulerRows = await tx
						.select({ id: tableKokurikuler.id })
						.from(tableKokurikuler)
						.where(inArray(tableKokurikuler.kelasId, kelasIds));
					const kokurikulerIds = kokurikulerRows.map((row) => row.id);

					if (kokurikulerIds.length) {
						await tx.delete(tableKokurikuler).where(inArray(tableKokurikuler.id, kokurikulerIds));
					}

					// delete asesmen related to mata pelajaran
					if (mapelIds.length) {
						await tx
							.delete(tableAsesmenFormatif)
							.where(inArray(tableAsesmenFormatif.mataPelajaranId, mapelIds));
						await tx
							.delete(tableAsesmenSumatifTujuan)
							.where(inArray(tableAsesmenSumatifTujuan.mataPelajaranId, mapelIds));
						await tx
							.delete(tableAsesmenSumatif)
							.where(inArray(tableAsesmenSumatif.mataPelajaranId, mapelIds));
					}

					// delete asesmen ekstrakurikuler / tujuan ekstrakurikuler if ekstrak exists
					if (ekstrakIds.length) {
						await tx
							.delete(tableAsesmenEkstrakurikuler)
							.where(inArray(tableAsesmenEkstrakurikuler.ekstrakurikulerId, ekstrakIds));
					}

					// delete asesmen kokurikuler for kokurikulerIds
					if (kokurikulerIds.length) {
						await tx
							.delete(tableAsesmenKokurikuler)
							.where(inArray(tableAsesmenKokurikuler.kokurikulerId, kokurikulerIds));
					}
				}

				// remove remaining direct sekolah scoped rows
				await tx.delete(tableTasks).where(eq(tableTasks.sekolahId, sekolahId));
				await tx.delete(tableMurid).where(eq(tableMurid.sekolahId, sekolahId));
				await tx.delete(tableKelas).where(eq(tableKelas.sekolahId, sekolahId));
				await tx.delete(tableTahunAjaran).where(eq(tableTahunAjaran.sekolahId, sekolahId));

				await tx.delete(tableSekolah).where(eq(tableSekolah.id, sekolahId));

				const waliIdsArray = Array.from(waliMuridIds);
				if (waliIdsArray.length) {
					const stillReferencedParents = new Set<number>();
					const ibuRefs = await tx
						.selectDistinct({ id: tableMurid.ibuId })
						.from(tableMurid)
						.where(inArray(tableMurid.ibuId, waliIdsArray));
					for (const row of ibuRefs) {
						if (row.id) stillReferencedParents.add(row.id);
					}
					const ayahRefs = await tx
						.selectDistinct({ id: tableMurid.ayahId })
						.from(tableMurid)
						.where(inArray(tableMurid.ayahId, waliIdsArray));
					for (const row of ayahRefs) {
						if (row.id) stillReferencedParents.add(row.id);
					}
					const waliRefs = await tx
						.selectDistinct({ id: tableMurid.waliId })
						.from(tableMurid)
						.where(inArray(tableMurid.waliId, waliIdsArray));
					for (const row of waliRefs) {
						if (row.id) stillReferencedParents.add(row.id);
					}
					const parentIdsToDelete = waliIdsArray.filter((id) => !stillReferencedParents.has(id));
					if (parentIdsToDelete.length) {
						await tx.delete(tableWaliMurid).where(inArray(tableWaliMurid.id, parentIdsToDelete));
					}
				}

				const pegawaiIdsArray = Array.from(pegawaiIds);
				if (pegawaiIdsArray.length) {
					const pegawaiStillUsed = new Set<number>();
					const kepalaRefs = await tx
						.selectDistinct({ id: tableSekolah.kepalaSekolahId })
						.from(tableSekolah)
						.where(inArray(tableSekolah.kepalaSekolahId, pegawaiIdsArray));
					for (const row of kepalaRefs) {
						if (row.id) pegawaiStillUsed.add(row.id);
					}
					const waliRefs = await tx
						.selectDistinct({ id: tableKelas.waliKelasId })
						.from(tableKelas)
						.where(inArray(tableKelas.waliKelasId, pegawaiIdsArray));
					for (const row of waliRefs) {
						if (row.id) pegawaiStillUsed.add(row.id);
					}

					// also consider auth_user.pegawaiId references (users created without sekolahId may reference pegawai)
					const authPegawaiRefs = await tx
						.selectDistinct({ id: tableAuthUser.pegawaiId })
						.from(tableAuthUser)
						.where(inArray(tableAuthUser.pegawaiId, pegawaiIdsArray));
					for (const row of authPegawaiRefs) {
						if (row.id) pegawaiStillUsed.add(row.id);
					}
					const pegawaiToDelete = pegawaiIdsArray.filter((id) => !pegawaiStillUsed.has(id));
					if (pegawaiToDelete.length) {
						// delete any auth_user rows referencing these pegawai (they may not have sekolahId set)
						await tx.delete(tableAuthUser).where(inArray(tableAuthUser.pegawaiId, pegawaiToDelete));
						await tx.delete(tablePegawai).where(inArray(tablePegawai.id, pegawaiToDelete));
					}
				}

				const alamatIdsArray = Array.from(alamatIds);
				if (alamatIdsArray.length) {
					const alamatStillDigunakan = new Set<number>();
					const sekolahAlamatRefs = await tx
						.selectDistinct({ alamatId: tableSekolah.alamatId })
						.from(tableSekolah)
						.where(inArray(tableSekolah.alamatId, alamatIdsArray));
					for (const row of sekolahAlamatRefs) {
						if (row.alamatId) alamatStillDigunakan.add(row.alamatId);
					}
					const muridAlamatRefs = await tx
						.selectDistinct({ alamatId: tableMurid.alamatId })
						.from(tableMurid)
						.where(inArray(tableMurid.alamatId, alamatIdsArray));
					for (const row of muridAlamatRefs) {
						if (row.alamatId) alamatStillDigunakan.add(row.alamatId);
					}
					const alamatToDelete = alamatIdsArray.filter((id) => !alamatStillDigunakan.has(id));
					if (alamatToDelete.length) {
						await tx.delete(tableAlamat).where(inArray(tableAlamat.id, alamatToDelete));
					}
				}
			});
		} catch (error) {
			console.error('Gagal menghapus sekolah', error);
			return fail(400, {
				fail: 'Gagal menghapus sekolah. Pastikan tidak ada data terkait yang masih tersisa.'
			});
		}

		return {
			message: forceDelete
				? 'Sekolah beserta seluruh data terkait berhasil dihapus.'
				: 'Sekolah berhasil dihapus.'
		};
	}
};
