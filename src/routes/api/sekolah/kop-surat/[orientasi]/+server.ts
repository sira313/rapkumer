import fs from 'node:fs/promises';
import { uploadsDir } from '$lib/server/data-dirs';
import { isKopSuratOrientasi, kopSuratFilePath } from '$lib/server/kop-surat';

async function ensureUploadsDir() {
	try {
		await fs.mkdir(uploadsDir(), { recursive: true });
	} catch {
		// ignore
	}
}

export async function GET(args: { params: Record<string, string>; locals: App.Locals }) {
	const { params, locals } = args;
	const orientasi = params.orientasi;
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !orientasi || !isKopSuratOrientasi(orientasi)) {
		return new Response('Not found', { status: 404 });
	}
	try {
		const data = await fs.readFile(kopSuratFilePath(sekolahId, orientasi));
		return new Response(Buffer.from(data), {
			headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }
		});
	} catch {
		return new Response('Not found', { status: 404 });
	}
}

export async function POST(args: {
	params: Record<string, string>;
	locals: App.Locals;
	request: Request;
}) {
	const { params, locals, request } = args;
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) return new Response('Sekolah aktif tidak ditemukan.', { status: 401 });
	if (locals.user?.type !== 'admin' && locals.user?.type !== 'kepala_sekolah') {
		return new Response('Hanya admin/kepala sekolah yang dapat mengunggah kop surat.', {
			status: 403
		});
	}
	const orientasi = params.orientasi;
	if (!orientasi || !isKopSuratOrientasi(orientasi)) {
		return new Response('Orientasi tidak valid.', { status: 400 });
	}

	const contentType = request.headers.get('content-type') || '';
	if (!contentType.includes('multipart/form-data')) {
		return new Response('Bad request', { status: 400 });
	}

	const formData = await request.formData();
	const file = formData.get('kop') as File | null;
	if (!file || !file.size) return new Response('No file', { status: 400 });
	if (file.type !== 'image/png') return new Response('Only PNG allowed', { status: 400 });

	const buffer = Buffer.from(await file.arrayBuffer());
	await ensureUploadsDir();
	await fs.writeFile(kopSuratFilePath(sekolahId, orientasi), buffer, { mode: 0o644 });

	return new Response('OK');
}

export async function DELETE(args: { params: Record<string, string>; locals: App.Locals }) {
	const { params, locals } = args;
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) return new Response('Sekolah aktif tidak ditemukan.', { status: 401 });
	if (locals.user?.type !== 'admin' && locals.user?.type !== 'kepala_sekolah') {
		return new Response('Hanya admin/kepala sekolah yang dapat menghapus kop surat.', {
			status: 403
		});
	}
	const orientasi = params.orientasi;
	if (!orientasi || !isKopSuratOrientasi(orientasi)) {
		return new Response('Orientasi tidak valid.', { status: 400 });
	}

	try {
		await fs.unlink(kopSuratFilePath(sekolahId, orientasi));
	} catch {
		// ignore
	}
	return new Response('OK');
}
