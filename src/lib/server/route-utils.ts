import db from '$lib/server/db';
import { resolveSekolahAcademicContext, type AcademicContext } from '$lib/server/db/academic';
import { tableMurid, tableAuthUserKelas, tableKelas } from '$lib/server/db/schema';
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

/**
 * Check if the current user has access to a specific student's class.
 * Used by cetak routes as a permission guard.
 */
export async function getKelasContextForUser(
	locals: App.Locals,
	url: { searchParams: URLSearchParams },
	muridIdStr: string
): Promise<{ hasAccess: boolean }> {
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.user) return { hasAccess: false };

	const muridId = Number(muridIdStr);
	if (!Number.isInteger(muridId)) return { hasAccess: false };

	const student = await db.query.tableMurid.findFirst({
		columns: { id: true, kelasId: true },
		where: and(eq(tableMurid.id, muridId), eq(tableMurid.sekolahId, sekolahId))
	});
	if (!student) return { hasAccess: false };

	const user = locals.user as {
		type?: string;
		id?: number;
		pegawaiId?: number;
		kelasId?: number;
	};
	const kelasId = student.kelasId;

	if (user.type === 'admin') return { hasAccess: true };
	if (user.type === 'wali_kelas' && user.pegawaiId) {
		const kelasRow = await db.query.tableKelas.findFirst({
			columns: { id: true, waliKelasId: true },
			where: eq(tableKelas.id, kelasId)
		});
		if (kelasRow?.waliKelasId === user.pegawaiId) return { hasAccess: true };
	}
	if (user.type === 'wali_asuh' && user.pegawaiId) {
		const kelasRow = await db.query.tableKelas.findFirst({
			columns: { id: true, waliAsuhId: true },
			where: eq(tableKelas.id, kelasId)
		});
		if (kelasRow?.waliAsuhId === user.pegawaiId) return { hasAccess: true };
	}
	if (user.type === 'user' && user.id) {
		const directAccess = await db.query.tableAuthUserKelas.findFirst({
			columns: { id: true },
			where: and(
				eq(tableAuthUserKelas.authUserId, user.id),
				eq(tableAuthUserKelas.kelasId, kelasId)
			)
		});
		if (directAccess) return { hasAccess: true };

		// Cross-semester fallback: match by class name
		const assigned = await db.query.tableAuthUserKelas.findMany({
			columns: {},
			where: eq(tableAuthUserKelas.authUserId, user.id),
			with: { kelas: { columns: { nama: true } } }
		});
		const assignedNames = new Set(assigned.map((a) => a.kelas?.nama).filter(Boolean));
		if (assignedNames.size > 0) {
			const studentKelas = await db.query.tableKelas.findFirst({
				columns: { nama: true },
				where: eq(tableKelas.id, kelasId)
			});
			if (studentKelas?.nama && assignedNames.has(studentKelas.nama)) {
				return { hasAccess: true };
			}
		}
	}
	return { hasAccess: false };
}

export async function fetchMuridList(
	sekolahId: number | null,
	kelasId: string | null,
	kelasIds: number[]
) {
	if (!sekolahId || !kelasIds.length)
		return [] as Array<{
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
