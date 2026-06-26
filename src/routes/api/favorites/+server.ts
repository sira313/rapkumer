import db from '$lib/server/db';
import { tableUserFavorites } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
	const userId = locals.user?.id;
	if (!userId) {
		return json({ favorites: [] });
	}

	const rows = await db.query.tableUserFavorites.findMany({
		where: eq(tableUserFavorites.userId, userId),
		orderBy: (fav, { asc }) => [asc(fav.createdAt)]
	});

	return json({ favorites: rows });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const userId = locals.user?.id;
	if (!userId) {
		return json({ message: 'Unauthorized' }, { status: 401 });
	}

	const { path, title } = await request.json();
	if (!path || !title) {
		return json({ message: 'path and title are required' }, { status: 400 });
	}

	const existing = await db.query.tableUserFavorites.findFirst({
		where: and(eq(tableUserFavorites.userId, userId), eq(tableUserFavorites.path, path))
	});

	if (existing) {
		return json({ message: 'Already favorited' }, { status: 409 });
	}

	const now = new Date().toISOString();
	const [favorite] = await db
		.insert(tableUserFavorites)
		.values({ userId, path, title, updatedAt: now })
		.returning();

	return json({ favorite }, { status: 201 });
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	const userId = locals.user?.id;
	if (!userId) {
		return json({ message: 'Unauthorized' }, { status: 401 });
	}

	const { path } = await request.json();
	if (!path) {
		return json({ message: 'path is required' }, { status: 400 });
	}

	await db
		.delete(tableUserFavorites)
		.where(and(eq(tableUserFavorites.userId, userId), eq(tableUserFavorites.path, path)));

	return json({ success: true });
};
