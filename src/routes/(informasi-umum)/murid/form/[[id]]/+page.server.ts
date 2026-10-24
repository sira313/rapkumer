import fs from 'node:fs/promises';
import path from 'node:path';
import db from '$lib/server/db/index.js';
import { tableAlamat, tableKelas, tableMurid, tableWaliMurid } from '$lib/server/db/schema.js';
import { uploadsDir } from '$lib/server/data-dirs';
import { unflattenFormData } from '$lib/utils.js';
import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { isAuthorizedUser } from '../../../../pengguna/permissions';

export async function load({ params, locals }) {
	// Allow wali_kelas to access student forms, or users with informasi_umum_murid permission
	if (
		locals.user?.type !== 'wali_kelas' &&
		!isAuthorizedUser(['informasi_umum_murid'], locals.user)
	) {
		redirect(303, '/forbidden?required=informasi_umum_murid');
	}

	const meta: PageMeta = { title: 'Form Murid' };
	if (!params.id) return { meta };

	const murid = await db.query.tableMurid.findFirst({
		where: eq(tableMurid.id, +params.id),
		with: { alamat: true, ibu: true, ayah: true, wali: true }
	});
	if (!murid) error(404, `Data murid tidak ditemukan`);
	return { murid, meta };
}

export const actions = {
	async save({ locals, request, params }) {
		// Allow wali_kelas to save student forms, or users with informasi_umum_murid permission
		if (
			locals.user?.type !== 'wali_kelas' &&
			!isAuthorizedUser(['informasi_umum_murid'], locals.user)
		) {
			redirect(303, '/forbidden?required=informasi_umum_murid');
		}

		const formData = await request.formData();
		const uploadedFile = formData.get('foto') as File | null;
		const formMurid = unflattenFormData<Murid>(formData);

		function slugifyName(name: string) {
			if (!name) return 'murid';
			// remove unicode combining marks (diacritics), keep letters/numbers/spaces/dash
			// use unicode property escapes to allow international letters
			const cleaned = name
				.normalize('NFKD')
				.replace(/[\u0300-\u036f]/g, '')
				.replace(/[^\p{L}\p{N}\s-]/gu, '')
				.trim()
				.replace(/\s+/g, '-')
				.toLowerCase();
			return cleaned.substring(0, 80) || 'murid';
		}

		async function generateUniqueFilename(
			dbTrans: Pick<DBTransaction, 'query'>,
			base: string,
			ext: string,
			dir: string,
			currentId?: number | null
		) {
			let i = 0;
			let candidate = `${base}${ext}`;
			while (true) {
				// check DB for existing usage
				const existing = await dbTrans.query.tableMurid.findFirst({
					where: eq(tableMurid.foto, candidate),
					columns: { id: true }
				});
				const usedByOther = !!(existing && (!currentId || existing.id !== currentId));
				// check filesystem
				let existsOnDisk: boolean;
				try {
					await fs.stat(path.join(dir, candidate));
					existsOnDisk = true;
				} catch {
					existsOnDisk = false;
				}
				if (!usedByOther && !existsOnDisk) return candidate;
				i += 1;
				candidate = `${base}-${i}${ext}`;
				if (i > 1000) throw error(500, 'Gagal membuat nama file unik');
			}
		}
		formMurid.sekolahId = locals.sekolah!.id;
		if (!formMurid.kelasId) {
			error(400, 'Kelas harus dipilih');
		}

		const kelas = await db.query.tableKelas.findFirst({
			where: eq(tableKelas.id, formMurid.kelasId),
			columns: { id: true, sekolahId: true, semesterId: true }
		});

		if (!kelas || kelas.sekolahId !== formMurid.sekolahId) {
			error(400, 'Kelas tidak valid untuk sekolah ini');
		}

		formMurid.semesterId = kelas.semesterId;

		// Validate uploaded foto UPFRONT (before any DB write / file I/O) so the
		// transaction never holds the DB lock while doing filesystem work.
		if (uploadedFile && uploadedFile.size) {
			const allowed = ['image/png', 'image/jpeg'];
			if (uploadedFile.size > 500 * 1024) {
				error(400, 'Ukuran file foto tidak boleh lebih dari 500KB');
			}
			if (!allowed.includes(uploadedFile.type)) {
				error(400, 'Format file tidak didukung; hanya JPG dan PNG yang diizinkan');
			}
		}

		// Track old foto filename to remove after commit (filesystem I/O stays
		// outside the DB transaction so the SQLite write lock isn't held).
		let oldFoto: string | null = null;

		await db.transaction(async (db) => {
			if (params.id) {
				// update
				const murid = await db.query.tableMurid.findFirst({
					where: eq(tableMurid.id, +params.id)
				});
				if (!murid) error(404, `Data murid tidak ditemukan`);
				if (uploadedFile && uploadedFile.size && murid.foto) oldFoto = murid.foto;

				await db
					.update(tableAlamat)
					.set(formMurid.alamat)
					.where(eq(tableAlamat.id, murid.alamatId));

				formMurid.alamatId = murid.alamatId;
				formMurid.ibuId = await upsertWaliMurid(db, formMurid.ibu, murid.ibuId);
				formMurid.ayahId = await upsertWaliMurid(db, formMurid.ayah, murid.ayahId);
				formMurid.waliId = await upsertWaliMurid(db, formMurid.wali, murid.waliId);

				const alamatBaru = formMurid.alamat;
				if (alamatBaru) {
					const alamatLengkap = [
						alamatBaru.jalan,
						alamatBaru.desa,
						alamatBaru.kecamatan,
						alamatBaru.kabupaten
					]
						.filter((v) => v && v !== 'Belum diisi')
						.join(', ');
					if (formMurid.ayahId) {
						await db
							.update(tableWaliMurid)
							.set({ alamat: alamatLengkap })
							.where(eq(tableWaliMurid.id, formMurid.ayahId));
					}
					if (formMurid.ibuId) {
						await db
							.update(tableWaliMurid)
							.set({ alamat: alamatLengkap })
							.where(eq(tableWaliMurid.id, formMurid.ibuId));
					}
				}

				await db.update(tableMurid).set(formMurid).where(eq(tableMurid.id, +params.id));
			} else {
				// insert
				if (formMurid.alamat?.jalan) {
					const [alamat] = await db
						.insert(tableAlamat)
						.values(formMurid.alamat)
						.returning({ id: tableAlamat.id });
					formMurid.alamatId = alamat?.id;
				}

				formMurid.ibuId = await upsertWaliMurid(db, formMurid.ibu);
				formMurid.ayahId = await upsertWaliMurid(db, formMurid.ayah);
				formMurid.waliId = await upsertWaliMurid(db, formMurid.wali);

				const alamatBaru = formMurid.alamat;
				if (alamatBaru) {
					const alamatLengkap = [
						alamatBaru.jalan,
						alamatBaru.desa,
						alamatBaru.kecamatan,
						alamatBaru.kabupaten
					]
						.filter((v) => v && v !== 'Belum diisi')
						.join(', ');
					if (formMurid.ayahId) {
						await db
							.update(tableWaliMurid)
							.set({ alamat: alamatLengkap })
							.where(eq(tableWaliMurid.id, formMurid.ayahId));
					}
					if (formMurid.ibuId) {
						await db
							.update(tableWaliMurid)
							.set({ alamat: alamatLengkap })
							.where(eq(tableWaliMurid.id, formMurid.ibuId));
					}
				}

				formMurid.updatedAt = new Date().toISOString();
				const [murid] = await db
					.insert(tableMurid)
					.values(formMurid)
					.returning({ id: tableMurid.id });
				formMurid.id = murid?.id;
			}
		});

		// Write the uploaded photo AFTER the transaction commits, so the SQLite
		// write lock is never held during filesystem I/O. Failures here are
		// non-fatal: murid record is already saved, foto filename retried next save.
		if (uploadedFile && uploadedFile.size && formMurid.id) {
			const buffer = Buffer.from(await uploadedFile.arrayBuffer());
			const dir = uploadsDir();
			await fs.mkdir(dir, { recursive: true });
			const ext = uploadedFile.type === 'image/png' ? '.png' : '.jpg';
			const base = slugifyName(formMurid.nama || `murid-${formMurid.id}`);
			const filename = await generateUniqueFilename(db, base, ext, dir, formMurid.id);
			const filePath = path.join(dir, filename);
			try {
				await fs.writeFile(filePath, buffer, { mode: 0o644 });
				await db.update(tableMurid).set({ foto: filename }).where(eq(tableMurid.id, formMurid.id));
				formMurid.foto = filename;
				// remove old file only after the new file is in place
				if (oldFoto && oldFoto !== filename) {
					try {
						await fs.unlink(path.join(uploadsDir(), oldFoto));
					} catch {
						// ignore
					}
				}
			} catch (err) {
				console.error('Gagal menulis file foto murid', err);
				try {
					await fs.unlink(filePath);
				} catch {
					// ignore
				}
			}
		}

		// return the created/updated murid id and foto filename (if any)
		return {
			message: `Data murid berhasil disimpan`,
			id: formMurid.id,
			foto: formMurid.foto ?? null,
			waliAsuhNama: formMurid.waliAsuhNama ?? null,
			waliAsuhNip: formMurid.waliAsuhNip ?? null
		};
	}
};

async function upsertWaliMurid(db: DBTransaction, wali: WaliMurid, waliId?: number | null) {
	if (waliId) {
		await db
			.update(tableWaliMurid) //
			.set(wali)
			.where(eq(tableWaliMurid.id, waliId));
	} else {
		const [newWali] = await db
			.insert(tableWaliMurid) //
			.values(wali)
			.returning({ id: tableWaliMurid.id });
		waliId = newWali?.id;
	}
	return waliId;
}
