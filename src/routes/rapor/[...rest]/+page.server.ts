import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const rest = params.rest ?? '';
	const destination = rest ? `/akademik/${rest}` : '/akademik';
	redirect(308, destination);
};
