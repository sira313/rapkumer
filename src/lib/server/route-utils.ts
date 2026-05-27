import db from '$lib/server/db';
import { resolveSekolahAcademicContext, type AcademicContext } from '$lib/server/db/academic';
import { tableMurid } from '$lib/server/db/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';

export interface KelasContext {
	sekolahId: number | null;
	kelasId: string | null;
	kelasIds: number[];
	academicContext: AcademicContext | null;
}

export async function buildKelasContext(
	locals: App.Locals,
	parentData: { daftarKelas?: Array<{ id: number }>; kelasAktif?: { id: number } | null },
	url: { searchParams: URLSearchParams }
): Promise<KelasContext> {
	const daftarKelas = (parentData.daftarKelas ?? []) as Array<{ id: number }>;
	const kelasAktif = (parentData.kelasAktif ?? null) as { id: number } | null;
	const sekolahId = locals.sekolah?.id ?? null;
	const academicContext = sekolahId ? await resolveSekolahAcademicContext(sekolahId) : null;
	const kelasParam =
		url.searchParams.get('kelas_id') ?? (kelasAktif ? String(kelasAktif.id) : null);
	const kelasId =
		kelasParam && daftarKelas.some((kelas) => kelas.id === Number(kelasParam))
			? String(kelasParam)
			: null;
	const kelasIds = daftarKelas.map((kelas) => kelas.id);
	return { sekolahId, kelasId, kelasIds, academicContext };
}

type MuridColumn = {
	id: true;
	nama: true;
	nis: true;
	nisn: true;
};

export async function fetchMuridList(
	sekolahId: number | null,
	kelasId: string | null,
	kelasIds: number[]
) {
	if (!sekolahId || !kelasIds.length) return [] as Array<{
		id: number;
		nama: string;
		nis: string | null;
		nisn: string | null;
	}>;
	const filter = and(
		eq(tableMurid.sekolahId, sekolahId),
		kelasId ? eq(tableMurid.kelasId, Number(kelasId)) : inArray(tableMurid.kelasId, kelasIds)
	);
	return db.query.tableMurid.findMany({
		columns: { id: true, nama: true, nis: true, nisn: true } satisfies MuridColumn,
		where: filter,
		orderBy: asc(tableMurid.nama)
	}) as Promise<Array<{ id: number; nama: string; nis: string | null; nisn: string | null }>>;
}
