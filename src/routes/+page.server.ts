import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import {
	tableAsesmenEkstrakurikuler,
	tableAsesmenSumatif,
	tableAsesmenKokurikuler,
	tableBellSettings,
	tableEkstrakurikuler,
	tableKokurikuler,
	tableKehadiranMurid,
	tableKelas,
	tableMataPelajaran,
	tableMurid,
	tablePresensiSettings
} from '$lib/server/db/schema';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

const AGAMA_BASE_SUBJECT = 'Pendidikan Agama dan Budi Pekerti';

type MataPelajaranJenis = 'wajib' | 'mulok' | 'pilihan';

type SubjectBucket = {
	jenis: MataPelajaranJenis;
	mapelIds: Set<number>;
};

const normalizeText = (value: string | null | undefined) =>
	(value ?? '')
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.trim();

const isAgamaSubject = (name: string | null | undefined) =>
	normalizeText(name).startsWith('pendidikan agama');

const calculatePercentage = (completed: number, total: number) =>
	total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

export async function load(event) {
	const parentData = await event.parent();
	const sekolahId = event.locals.sekolah?.id ?? null;

	const statistikDashboard = {
		rombel: {
			total: 0,
			perFase: [] as Array<{ fase: string | null; label: string; jumlah: number }>
		},
		murid: {
			total: 0
		},
		mapel: {
			total: 0,
			wajib: 0,
			mulok: 0,
			kokurikuler: 0,
			lainnya: 0
		},
		ekstrakurikuler: {
			total: 0
		},
		progress: {
			akademik: { percentage: 0, completed: 0, total: 0 },
			absensi: { percentage: 0, completed: 0, total: 0 },
			ekstrakurikuler: { percentage: 0, completed: 0, total: 0 },
			kokurikuler: { percentage: 0, completed: 0, total: 0 }
		}
	};

	if (!sekolahId) {
		return {
			...parentData,
			statistikDashboard
		};
	}

	const academicContext = await resolveSekolahAcademicContext(sekolahId);
	const activeSemesterId = academicContext?.activeSemesterId ?? null;

	const kelasFilter = activeSemesterId
		? and(eq(tableKelas.sekolahId, sekolahId), eq(tableKelas.semesterId, activeSemesterId))
		: eq(tableKelas.sekolahId, sekolahId);

	const daftarKelas = await db.query.tableKelas.findMany({
		columns: { id: true, fase: true },
		where: kelasFilter
	});

	statistikDashboard.rombel.total = daftarKelas.length;

	const perFaseMap = new Map<string | null, number>();
	for (const kelas of daftarKelas) {
		const key = kelas.fase ?? null;
		perFaseMap.set(key, (perFaseMap.get(key) ?? 0) + 1);
	}

	statistikDashboard.rombel.perFase = Array.from(perFaseMap.entries())
		.map(([fase, jumlah]) => ({
			fase,
			label: fase ?? 'Belum diatur',
			jumlah
		}))
		.sort((a, b) => a.label.localeCompare(b.label, 'id'));

	const muridFilter = activeSemesterId
		? and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.semesterId, activeSemesterId))
		: eq(tableMurid.sekolahId, sekolahId);

	const muridCountRows = await db
		.select({ totalMurid: sql<number>`count(*)` })
		.from(tableMurid)
		.where(muridFilter);

	statistikDashboard.murid.total = muridCountRows[0]?.totalMurid ?? 0;

	const kelasAktifId = (parentData.kelasAktif ?? null)?.id ?? null;

	if (kelasAktifId) {
		const mataPelajaranRows = await db.query.tableMataPelajaran.findMany({
			columns: { id: true, nama: true, jenis: true },
			where: eq(tableMataPelajaran.kelasId, kelasAktifId)
		});

		const uniqueSubjects = new Map<string, SubjectBucket>();
		const mapelIdToKey = new Map<number, string>();

		for (const mapel of mataPelajaranRows) {
			const trimmedName = mapel.nama?.trim() ?? '';
			const key = isAgamaSubject(mapel.nama)
				? AGAMA_BASE_SUBJECT
				: trimmedName || `Mata Pelajaran ${mapel.id}`;
			const jenis = (mapel.jenis ?? 'wajib') as MataPelajaranJenis;
			let bucket = uniqueSubjects.get(key);
			if (!bucket) {
				bucket = { jenis, mapelIds: new Set<number>([mapel.id]) };
				uniqueSubjects.set(key, bucket);
			} else {
				if (bucket.jenis !== 'mulok' && jenis === 'mulok') {
					bucket.jenis = 'mulok';
				}
				bucket.mapelIds.add(mapel.id);
			}
			mapelIdToKey.set(mapel.id, key);
		}

		const uniqueSubjectValues = Array.from(uniqueSubjects.values());
		statistikDashboard.mapel.total = uniqueSubjectValues.length;
		statistikDashboard.mapel.wajib = uniqueSubjectValues.filter(
			(item) => item.jenis === 'wajib'
		).length;
		statistikDashboard.mapel.mulok = uniqueSubjectValues.filter(
			(item) => item.jenis === 'mulok'
		).length;
		statistikDashboard.mapel.lainnya = uniqueSubjectValues.filter(
			(item) => item.jenis === 'pilihan'
		).length;

		const ekstrakurikulerRows = await db.query.tableEkstrakurikuler.findMany({
			columns: { id: true },
			where: eq(tableEkstrakurikuler.kelasId, kelasAktifId)
		});
		statistikDashboard.ekstrakurikuler.total = ekstrakurikulerRows.length;

		// kokurikuler (separate table) — tampilkan jumlahnya di bagian Intrakurikuler
		const kokurikulerRows = await db.query.tableKokurikuler.findMany({
			columns: { id: true },
			where: eq(tableKokurikuler.kelasId, kelasAktifId)
		});
		statistikDashboard.mapel.kokurikuler = kokurikulerRows.length;

		// debug: show kokurikuler count for active class in server logs to help troubleshooting
		console.info(
			'[dashboard] kelasAktifId=%s kokurikuler=%d mapel=%o',
			kelasAktifId,
			kokurikulerRows.length,
			{
				total: statistikDashboard.mapel.total,
				wajib: statistikDashboard.mapel.wajib,
				mulok: statistikDashboard.mapel.mulok,
				kokurikuler: statistikDashboard.mapel.kokurikuler,
				lainnya: statistikDashboard.mapel.lainnya
			}
		);

		const muridRows = await db.query.tableMurid.findMany({
			columns: { id: true },
			where: eq(tableMurid.kelasId, kelasAktifId)
		});
		const muridIds = muridRows.map((murid) => murid.id);
		const totalStudents = muridIds.length;
		const uniqueSubjectCount = uniqueSubjects.size;
		const mapelIdList = Array.from(mapelIdToKey.keys());

		let akademikCompleted = 0;
		if (totalStudents > 0 && uniqueSubjectCount > 0 && mapelIdList.length > 0) {
			const sumatifRows = await db
				.select({
					muridId: tableAsesmenSumatif.muridId,
					mataPelajaranId: tableAsesmenSumatif.mataPelajaranId
				})
				.from(tableAsesmenSumatif)
				.where(
					and(
						inArray(tableAsesmenSumatif.muridId, muridIds),
						inArray(tableAsesmenSumatif.mataPelajaranId, mapelIdList)
					)
				);

			const completedPairs = new Set<string>();
			for (const row of sumatifRows) {
				const key = mapelIdToKey.get(row.mataPelajaranId);
				if (!key) continue;
				completedPairs.add(`${row.muridId}:${key}`);
			}
			akademikCompleted = completedPairs.size;
		}
		const expectedAcademic = totalStudents * uniqueSubjectCount;

		let absensiCompleted = 0;
		if (totalStudents > 0) {
			const attendanceRows = await db
				.select({ muridId: tableKehadiranMurid.muridId })
				.from(tableKehadiranMurid)
				.where(inArray(tableKehadiranMurid.muridId, muridIds));

			const attendanceSet = new Set(attendanceRows.map((row) => row.muridId));
			absensiCompleted = attendanceSet.size;
		}

		let ekstrakCompleted = 0;
		if (totalStudents > 0) {
			const asesmenEkstrakRows = await db
				.select({ muridId: tableAsesmenEkstrakurikuler.muridId })
				.from(tableAsesmenEkstrakurikuler)
				.where(inArray(tableAsesmenEkstrakurikuler.muridId, muridIds));

			const ekstrakSet = new Set(asesmenEkstrakRows.map((row) => row.muridId));
			ekstrakCompleted = ekstrakSet.size;
		}

		let kokurCompleted = 0;
		if (totalStudents > 0) {
			const asesmenKokurRows = await db
				.select({ muridId: tableAsesmenKokurikuler.muridId })
				.from(tableAsesmenKokurikuler)
				.where(inArray(tableAsesmenKokurikuler.muridId, muridIds));

			const kokurSet = new Set(asesmenKokurRows.map((row) => row.muridId));
			kokurCompleted = kokurSet.size;
		}

		statistikDashboard.progress = {
			akademik: {
				completed: akademikCompleted,
				total: expectedAcademic,
				percentage: calculatePercentage(akademikCompleted, expectedAcademic)
			},
			absensi: {
				completed: absensiCompleted,
				total: totalStudents,
				percentage: calculatePercentage(absensiCompleted, totalStudents)
			},
			ekstrakurikuler: {
				completed: ekstrakCompleted,
				total: totalStudents,
				percentage: calculatePercentage(ekstrakCompleted, totalStudents)
			},
			kokurikuler: {
				completed: kokurCompleted,
				total: totalStudents,
				percentage: calculatePercentage(kokurCompleted, totalStudents)
			}
		};
	}

	const [bellRow, presensiRow] = await Promise.all([
		sekolahId
			? db.query.tableBellSettings.findFirst({
					columns: { isActive: true },
					where: eq(tableBellSettings.sekolahId, sekolahId)
				})
			: Promise.resolve(null),
		sekolahId
			? db.query.tablePresensiSettings.findFirst({
					columns: { hariSekolah: true, liburNasional: true, liburSemester: true },
					where: eq(tablePresensiSettings.sekolahId, sekolahId),
					orderBy: [desc(tablePresensiSettings.id)]
				})
			: Promise.resolve(null)
	]);

	const hariSekolah = presensiRow?.hariSekolah ?? 6;

	let liburNasional: string[] = [];
	let liburSemester: Array<{ start: string; end: string }> = [];
	if (presensiRow) {
		try {
			const parsed = JSON.parse(presensiRow.liburNasional || '[]');
			if (Array.isArray(parsed)) liburNasional = parsed;
		} catch {
			// ignore
		}
		try {
			const parsed = JSON.parse(presensiRow.liburSemester || '[]');
			if (Array.isArray(parsed)) liburSemester = parsed;
		} catch {
			// ignore
		}
	}

	return {
		...parentData,
		statistikDashboard,
		bellActive: bellRow?.isActive === 1,
		hariSekolah,
		liburNasional,
		liburSemester
	};
}
