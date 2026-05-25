export async function buildUrl(request: Request, url: URL): Promise<URL> {
	if (request.method !== 'POST') return url;

	const clone = new URL(url);
	const contentType = request.headers.get('content-type') || '';

	if (contentType.includes('application/json')) {
		const body = await request.json();
		for (const [key, value] of Object.entries(body)) {
			if (value != null) clone.searchParams.set(key, String(value));
		}
	} else {
		const form = await request.formData();
		for (const [key, value] of form) {
			clone.searchParams.set(key, String(value));
		}
	}

	return clone;
}
