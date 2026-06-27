import { redirect } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

const PER_PAGE = 20;

type PaginationResult = {
	total: number;
	totalPages: number;
	currentPage: number;
	offset: number;
	perPage: number;
};

export async function computePagination(
	db: any,
	table: any,
	searchFilter: SQL | undefined,
	pageNumber: number,
	url: URL
): Promise<PaginationResult> {
	const [{ totalItems }] = await db
		.select({ totalItems: sql<number>`count(*)` })
		.from(table)
		.where(searchFilter);

	const total = totalItems ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
	const currentPage = Math.min(Math.max(pageNumber, 1), totalPages);
	const offset = (currentPage - 1) * PER_PAGE;

	if (pageNumber !== currentPage) {
		const params = new URLSearchParams(url.searchParams);
		if (currentPage <= 1) {
			params.delete('page');
		} else {
			params.set('page', String(currentPage));
		}
		throw redirect(303, `${url.pathname}${params.size ? `?${params}` : ''}`);
	}

	return { total, totalPages, currentPage, offset, perPage: PER_PAGE };
}

export { PER_PAGE };
