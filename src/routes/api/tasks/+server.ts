import db from '$lib/server/db';
import { tableKelas, tableTasks } from '$lib/server/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { json, type RequestHandler } from '@sveltejs/kit';

const TASK_STATUSES = ['active', 'completed'] as const;

type TaskStatus = (typeof TASK_STATUSES)[number];

type TaskPayload = {
	id?: number;
	title?: string;
	status?: TaskStatus;
	scope?: 'completed' | 'all';
	kelasId?: number;
};

const parseBody = async (request: Request): Promise<TaskPayload> => {
	try {
		const body = (await request.json()) as TaskPayload;
		return body ?? {};
	} catch {
		return {};
	}
};

type ActiveSekolah = Pick<Sekolah, 'id'> | undefined | null;

const ensureSekolah = (sekolah: ActiveSekolah) => {
	if (!sekolah?.id) {
		return json({ message: 'Sekolah aktif tidak ditemukan.' }, { status: 400 });
	}
	return null;
};

const mapErrorMessage = (error: unknown, fallback: string) => {
	if (error instanceof Error && error.message) return error.message;
	return fallback;
};

const serializeTasks = (tasks: TaskItem[]) =>
	tasks.map((task) => ({
		...task,
		status: task.status as TaskStatus
	}));

const parsePositiveInteger = (value: unknown) => {
	const parsed = Number(value ?? 0);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const GET: RequestHandler = async ({ locals, url }) => {
	const sekolahError = ensureSekolah(locals.sekolah);
	if (sekolahError) return sekolahError;

	const kelasId = parsePositiveInteger(url.searchParams.get('kelasId'));
	if (!kelasId) {
		return json({ message: 'Kelas tidak valid.' }, { status: 400 });
	}

	const tasks = await db.query.tableTasks.findMany({
		where: and(eq(tableTasks.sekolahId, locals.sekolah!.id), eq(tableTasks.kelasId, kelasId)),
		orderBy: [desc(tableTasks.createdAt), desc(tableTasks.id)]
	});

	return json({ data: serializeTasks(tasks) });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const sekolahError = ensureSekolah(locals.sekolah);
	if (sekolahError) return sekolahError;

	const { title, kelasId } = await parseBody(request);
	const normalizedTitle = (title ?? '').trim();
	const normalizedKelasId = parsePositiveInteger(kelasId);

	if (!normalizedTitle) {
		return json({ message: 'Judul tugas wajib diisi.' }, { status: 400 });
	}

	if (!normalizedKelasId) {
		return json({ message: 'Kelas tidak valid.' }, { status: 400 });
	}

	const kelas = await db.query.tableKelas.findFirst({
		columns: { id: true },
		where: and(eq(tableKelas.id, normalizedKelasId), eq(tableKelas.sekolahId, locals.sekolah!.id))
	});

	if (!kelas) {
		return json({ message: 'Kelas tidak ditemukan.' }, { status: 404 });
	}

	const now = new Date().toISOString();

	const [task] = await db
		.insert(tableTasks)
		.values({
			sekolahId: locals.sekolah!.id,
			kelasId: normalizedKelasId,
			title: normalizedTitle,
			status: 'active',
			updatedAt: now
		})
		.returning();

	return json({ data: serializeTasks([task])[0] }, { status: 201 });
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
	const sekolahError = ensureSekolah(locals.sekolah);
	if (sekolahError) return sekolahError;

	const { id, status, kelasId } = await parseBody(request);
	const normalizedId = Number(id || 0);
	const normalizedStatus = TASK_STATUSES.find((item) => item === status) ?? null;
	const normalizedKelasId = parsePositiveInteger(kelasId);

	if (!normalizedId || !normalizedStatus || !normalizedKelasId) {
		return json({ message: 'Data tugas tidak valid.' }, { status: 400 });
	}

	const now = new Date().toISOString();

	const [task] = await db
		.update(tableTasks)
		.set({ status: normalizedStatus, updatedAt: now })
		.where(
			and(
				eq(tableTasks.id, normalizedId),
				eq(tableTasks.sekolahId, locals.sekolah!.id),
				eq(tableTasks.kelasId, normalizedKelasId)
			)
		)
		.returning();

	if (!task) {
		return json({ message: 'Tugas tidak ditemukan.' }, { status: 404 });
	}

	return json({ data: serializeTasks([task])[0] });
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	const sekolahError = ensureSekolah(locals.sekolah);
	if (sekolahError) return sekolahError;

	const { id, scope, kelasId } = await parseBody(request);
	const normalizedId = Number(id || 0);
	const normalizedKelasId = parsePositiveInteger(kelasId);

	if (!normalizedKelasId) {
		return json({ message: 'Kelas tidak valid.' }, { status: 400 });
	}

	let deleted: number;

	try {
		if (scope === 'all') {
			const result = await db
				.delete(tableTasks)
				.where(
					and(
						eq(tableTasks.sekolahId, locals.sekolah!.id),
						eq(tableTasks.kelasId, normalizedKelasId)
					)
				);
			deleted = result.rowsAffected ?? 0;
		} else if (scope === 'completed') {
			const result = await db
				.delete(tableTasks)
				.where(
					and(
						eq(tableTasks.sekolahId, locals.sekolah!.id),
						eq(tableTasks.kelasId, normalizedKelasId),
						eq(tableTasks.status, 'completed')
					)
				);
			deleted = result.rowsAffected ?? 0;
		} else if (normalizedId) {
			const result = await db
				.delete(tableTasks)
				.where(
					and(
						eq(tableTasks.id, normalizedId),
						eq(tableTasks.sekolahId, locals.sekolah!.id),
						eq(tableTasks.kelasId, normalizedKelasId)
					)
				);
			deleted = result.rowsAffected ?? 0;
		} else {
			return json({ message: 'Permintaan hapus tidak valid.' }, { status: 400 });
		}
	} catch (error) {
		return json({ message: mapErrorMessage(error, 'Gagal menghapus tugas.') }, { status: 500 });
	}

	return json({ data: { deleted } });
};
