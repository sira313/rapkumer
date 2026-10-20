import fs from 'node:fs/promises';
import { uploadsDir } from '$lib/server/data-dirs';
import { guruTtdFilePath } from '$lib/server/tanda-tangan-guru';

async function ensureUploadsDir() {
	try {
		await fs.mkdir(uploadsDir(), { recursive: true });
	} catch {
		// ignore
	}
}

export async function GET(args: { locals: App.Locals }) {
	const user = args.locals.user;
	if (!user || user.type !== 'wali_kelas') {
		return new Response('Not found', { status: 404 });
	}
	try {
		const data = await fs.readFile(guruTtdFilePath(user.id));
		return new Response(Buffer.from(data), {
			headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }
		});
	} catch {
		return new Response('Not found', { status: 404 });
	}
}

export async function POST(args: { locals: App.Locals; request: Request }) {
	const { locals, request } = args;
	const user = locals.user;
	if (!user) return new Response('Unauthorized', { status: 401 });
	if (user.type !== 'wali_kelas') {
		return new Response('Hanya wali kelas yang dapat mengunggah gambar.', { status: 403 });
	}

	const contentType = request.headers.get('content-type') || '';
	if (!contentType.includes('multipart/form-data')) {
		return new Response('Bad request', { status: 400 });
	}

	const formData = await request.formData();
	const file = formData.get('gambar') as File | null;
	if (!file || !file.size) return new Response('No file', { status: 400 });
	if (file.type !== 'image/png') return new Response('Only PNG allowed', { status: 400 });

	const buffer = Buffer.from(await file.arrayBuffer());
	await ensureUploadsDir();
	await fs.writeFile(guruTtdFilePath(user.id), buffer, { mode: 0o644 });

	return new Response('OK');
}

export async function DELETE(args: { locals: App.Locals }) {
	const user = args.locals.user;
	if (!user) return new Response('Unauthorized', { status: 401 });
	if (user.type !== 'wali_kelas') {
		return new Response('Hanya wali kelas yang dapat menghapus gambar.', { status: 403 });
	}

	try {
		await fs.unlink(guruTtdFilePath(user.id));
	} catch {
		// ignore
	}
	return new Response('OK');
}
