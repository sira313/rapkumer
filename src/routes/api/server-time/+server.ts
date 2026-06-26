import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
	return new Response(JSON.stringify({ iso: new Date().toISOString() }), {
		headers: { 'content-type': 'application/json' }
	});
};
