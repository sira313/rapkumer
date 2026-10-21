import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import type { AcademicContext } from '$lib/server/db/academic';
import {
	tableKelas,
	tablePegawai,
	tableSemester,
	tableTahunAjaran
} from '$lib/server/db/schema.js';
import { unflattenFormData } from '$lib/utils.js';
import { deletePegawaiIfOrphaned } from '$lib/server/pengguna-merge.js';
import { ensureWaliAsramaAccount } from '../../../../pengguna/consolidation.server';
import { error, fail } from '@sveltejs/kit';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { authority } from '../../../../pengguna/utils.server';

type TingkatOption = { fase: string; label: string };

// Include 'slb' and 'srt' explicitly so those schools get the correct phase options
const tingkatOptionsByJenjang: Record<
	'sd' | 'smp' | 'sma' | 'slb' | 'pkbm' | 'srt',
	TingkatOption[]
> = {
	sd: [
		{ fase: 'Fase A', label: 'Fase A' },
		{ fase: 'Fase B', label: 'Fase B' },
		{ fase: 'Fase C', label: 'Fase C' }
	],
	// SLB uses same phase grouping as SD for now
	slb: [
		{ fase: 'Fase A', label: 'Fase A' },
		{ fase: 'Fase B', label: 'Fase B' },
		{ fase: 'Fase C', label: 'Fase C' },
		{ fase: 'Fase D', label: 'Fase D' },
		{ fase: 'Fase E', label: 'Fase E' },
		{ fase: 'Fase F', label: 'Fase F' }
	],
	pkbm: [
		{ fase: 'Fase A', label: 'Fase A' },
		{ fase: 'Fase B', label: 'Fase B' },
		{ fase: 'Fase C', label: 'Fase C' },
		{ fase: 'Fase D', label: 'Fase D' },
		{ fase: 'Fase E', label: 'Fase E' },
		{ fase: 'Fase F', label: 'Fase F' }
	],
	srt: [
		{ fase: 'Fase A', label: 'Fase A' },
		{ fase: 'Fase B', label: 'Fase B' },
		{ fase: 'Fase C', label: 'Fase C' },
		{ fase: 'Fase D', label: 'Fase D' },
		{ fase: 'Fase E', label: 'Fase E' },
		{ fase: 'Fase F', label: 'Fase F' }
	],
	smp: [{ fase: 'Fase D', label: 'Fase D' }],
	sma: [
		{ fase: 'Fase E', label: 'Fase E' },
		{ fase: 'Fase F', label: 'Fase F' }
	]
};

type KelasFormInput = {
	rombel?: string;
	fase?: string;
	waliKelasId?: string | number;
	waliKelas?: Partial<Pick<Pegawai, 'nama' | 'nip'>>;
	waliAsrama?: Partial<Pick<Pegawai, 'nama' | 'nip'>>;
};

type TahunAjaranOption = typeof tableTahunAjaran.$inferSelect & {
	semester: (typeof tableSemester.$inferSelect)[];
};

function resolveEffectiveTahunAjaranId(
	existingId: number | null | undefined,
	academicContext: AcademicContext,
	options: TahunAjaranOption[]
): number | null {
	return (
		existingId ??
		academicContext.activeTahunAjaranId ??
		options.find((item) => item.isAktif)?.id ??
		options[0]?.id ??
		null
	);
}

function resolveEffectiveSemesterId(
	tahunAjaranId: number | null,
	preferredSemesterId: number | null | undefined,
	academicContext: AcademicContext,
	options: TahunAjaranOption[]
): number | null {
	if (!tahunAjaranId) return null;
	const tahun = options.find((item) => item.id === tahunAjaranId);
	if (!tahun) return null;

	if (
		preferredSemesterId &&
		tahun.semester.some((semester) => semester.id === preferredSemesterId)
	) {
		return preferredSemesterId;
	}

	const candidates = [
		academicContext.activeSemesterId,
		tahun.semester.find((item) => item.isAktif)?.id,
		tahun.semester.find((item) => item.tipe === 'ganjil')?.id,
		tahun.semester[0]?.id ?? null
	].filter((value): value is number => typeof value === 'number');

	return (
		candidates.find((value) => tahun.semester.some((semester) => semester.id === value)) ?? null
	);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Resolve pegawai untuk field wali (kelas/asrama) dari form.
 * Nama sama dengan pegawai tertaut → orang sama, cukup perbarui NIP.
 * Nama berbeda → ganti orang: find-or-create pegawai by nama lalu tautkan
 * ulang. Baris pegawai tertaut JANGAN ditimpa — bisa jadi orang yang sama
 * dipakai sebagai kepala sekolah / punya akun login (mis. PLT walas).
 */
async function resolveWaliPegawai(
	tx: Tx,
	currentId: number | null,
	nama: string,
	nip: string,
	timestamp: string
): Promise<{ id: number; replaced: boolean }> {
	const current = currentId
		? await tx.query.tablePegawai.findFirst({
				columns: { id: true, nama: true },
				where: eq(tablePegawai.id, currentId)
			})
		: null;
	if (current && current.nama.trim().toLowerCase() === nama.trim().toLowerCase()) {
		await tx
			.update(tablePegawai)
			.set({ nip, updatedAt: timestamp })
			.where(eq(tablePegawai.id, current.id));
		return { id: current.id, replaced: false };
	}
	const existing = await tx.query.tablePegawai.findFirst({
		columns: { id: true },
		where: sql`LOWER(trim(${tablePegawai.nama})) = ${nama.trim().toLowerCase()}`
	});
	if (existing) {
		await tx
			.update(tablePegawai)
			.set({ nip, updatedAt: timestamp })
			.where(eq(tablePegawai.id, existing.id));
		return { id: existing.id, replaced: currentId !== null && currentId !== existing.id };
	}
	const [pegawai] = await tx
		.insert(tablePegawai)
		.values({ nama, nip, updatedAt: timestamp })
		.returning({ id: tablePegawai.id });
	return { id: pegawai?.id ?? 0, replaced: currentId !== null };
}

export async function load({ params, locals }) {
	authority('informasi_umum_kelas');

	const meta: PageMeta = { title: 'Form Kelas' };
	const jenjang = locals.sekolah?.jenjangPendidikan as
		keyof typeof tingkatOptionsByJenjang | undefined;
	const tingkatOptions = jenjang ? tingkatOptionsByJenjang[jenjang] : [];

	if (!locals.sekolah?.id) error(400, `Sekolah aktif tidak ditemukan`);

	const sekolahId = locals.sekolah.id;
	const academicContext = await resolveSekolahAcademicContext(sekolahId);
	const tahunAjaranOptions = academicContext.tahunAjaranList as TahunAjaranOption[];

	let kelas = null as
		| (typeof tableKelas.$inferSelect & {
				waliKelas: Pegawai | null;
				waliAsrama: Pegawai | null;
				semester?: typeof tableSemester.$inferSelect | null;
				tahunAjaran?: typeof tableTahunAjaran.$inferSelect | null;
		  })
		| null;

	if (params?.id) {
		const kelasRow = await db.query.tableKelas.findFirst({
			where: and(eq(tableKelas.id, +params.id), eq(tableKelas.sekolahId, sekolahId)),
			with: { waliKelas: true, waliAsrama: true, semester: true, tahunAjaran: true }
		});
		if (!kelasRow) error(404, `Data kelas tidak ditemukan`);
		kelas = kelasRow;
	}

	const defaultTahunAjaranId = resolveEffectiveTahunAjaranId(
		kelas?.tahunAjaranId,
		academicContext,
		tahunAjaranOptions
	);

	const defaultSemesterId = resolveEffectiveSemesterId(
		defaultTahunAjaranId,
		kelas?.semesterId,
		academicContext,
		tahunAjaranOptions
	);

	const selectedTahunAjaran = tahunAjaranOptions.find(
		(option) => option.id === defaultTahunAjaranId
	);
	const selectedSemester = selectedTahunAjaran?.semester.find(
		(item) => item.id === defaultSemesterId
	);

	const academicLock = {
		tahunAjaranId: defaultTahunAjaranId,
		semesterId: defaultSemesterId,
		tahunAjaranLabel: selectedTahunAjaran
			? `${selectedTahunAjaran.nama}${selectedTahunAjaran.isAktif ? ' (aktif)' : ''}`
			: null,
		semesterLabel: selectedSemester
			? `${selectedSemester.nama}${selectedSemester.isAktif ? ' (aktif)' : ''}`
			: null
	};

	const formInit: Record<string, unknown> = {
		rombel: kelas?.nama ?? '',
		fase: kelas?.fase ?? ''
	};
	if (kelas?.waliKelas) {
		formInit.waliKelas = {
			nama: kelas.waliKelas.nama,
			nip: kelas.waliKelas.nip
		};
	}
	if (kelas?.waliAsrama) {
		formInit.waliAsrama = {
			nama: kelas.waliAsrama.nama,
			nip: kelas.waliAsrama.nip
		};
	}

	// Daftar pegawai (pendidik + tenaga kependidikan) untuk combobox "Wali Kelas"
	// — logika sama dengan "Nama Mata Pelajaran": bila data tersedia → pilih dari
	// daftar. Tendik Dapodik tidak bisa jadi wali kelas di Dapodik, di sini bisa.
	const pegawaiRows = await db
		.select({
			id: tablePegawai.id,
			nama: tablePegawai.nama,
			nip: tablePegawai.nip,
			dapodikPtkId: tablePegawai.dapodikPtkId
		})
		.from(tablePegawai);
	const seenNama = new Set<string>();
	const ptkList = pegawaiRows.filter((p) => {
		const key = (p.nama || '').trim().toLowerCase();
		if (!key || key === '-' || seenNama.has(key)) return false;
		seenNama.add(key);
		return true;
	});

	// Data Dapodik tersedia → identitas (nama/NIP) wali terkunci; ganti orang
	// hanya lewat pilihan daftar, ubah nama/NIP hanya via /pengaturan/profil.
	const dapodikAktif = pegawaiRows.some((p) => Boolean(p.dapodikPtkId));
	const userType = (locals.user as { type?: string } | null)?.type;
	const canResetWalas = userType === 'admin' || userType === 'kepala_sekolah';

	return {
		meta,
		tingkatOptions,
		kelas,
		academicLock,
		formInit,
		ptkList,
		dapodikAktif,
		canResetWalas
	};
}

export const actions = {
	async save({ request, params, locals }) {
		authority('informasi_umum_kelas');

		if (!locals.sekolah?.id) error(400, `Sekolah aktif tidak ditemukan`);

		const formData = unflattenFormData<KelasFormInput>(await request.formData());
		const rombel = formData.rombel?.trim();
		const fase = formData.fase?.trim() || null;
		const waliNama = formData.waliKelas?.nama?.trim() || '';
		const waliNipRaw = formData.waliKelas?.nip?.trim() || '';
		const waliAsramaNama = formData.waliAsrama?.nama?.trim() || '';
		const waliAsramaNip = formData.waliAsrama?.nip?.trim() || '';
		const waliPegawaiIdRaw = Number(formData.waliKelasId ?? 0);
		const waliPegawaiId =
			Number.isInteger(waliPegawaiIdRaw) && waliPegawaiIdRaw > 0 ? waliPegawaiIdRaw : null;

		if (!rombel) {
			return fail(400, { fail: `Nama rombel wajib diisi.` });
		}

		// Data Dapodik aktif → nama & NIP wali kelas mengikuti data pegawai
		// tersimpan; user hanya memilih orang dari daftar (by ID).
		let dapodikAktif = false;
		if (waliNama || waliPegawaiId) {
			dapodikAktif =
				(
					await db
						.select({ id: tablePegawai.id })
						.from(tablePegawai)
						.where(isNotNull(tablePegawai.dapodikPtkId))
						.limit(1)
				).length > 0;
		}
		const waliNip = dapodikAktif ? '' : waliNipRaw;

		if (!waliNama && waliNip) {
			return fail(400, {
				fail: `Jika mengisi NIP, lengkapi juga Nama wali kelas.`
			});
		}

		// Validasi wali asrama: jika mengisi NIP asrama, harus mengisi nama asrama
		if (!waliAsramaNama && waliAsramaNip) {
			return fail(400, {
				fail: `Jika mengisi NIP wali asrama, lengkapi juga nama wali asrama.`
			});
		}

		// Consider there is a wali when a name is provided. NIP is optional.
		const hasWali = Boolean(waliNama);
		const hasWaliAsrama = Boolean(waliAsramaNama);

		const timestamp = new Date().toISOString();
		const sekolahId = locals.sekolah.id;

		const academicContext = await resolveSekolahAcademicContext(sekolahId);
		const tahunAjaranOptions = academicContext.tahunAjaranList as TahunAjaranOption[];

		let existingKelas: {
			id: number;
			waliKelasId: number | null;
			tahunAjaranId: number | null;
			semesterId: number | null;
		} | null = null;

		if (params.id) {
			existingKelas =
				(await db.query.tableKelas.findFirst({
					columns: {
						id: true,
						waliKelasId: true,
						tahunAjaranId: true,
						semesterId: true
					},
					where: and(eq(tableKelas.id, +params.id), eq(tableKelas.sekolahId, sekolahId))
				})) ?? null;
			if (!existingKelas) error(404, `Data kelas tidak ditemukan`);
		}

		const tahunAjaranId = resolveEffectiveTahunAjaranId(
			existingKelas?.tahunAjaranId,
			academicContext,
			tahunAjaranOptions
		);

		if (!tahunAjaranId) {
			return fail(400, {
				fail: `Tahun ajaran aktif belum diatur. Atur melalui menu Rapor sebelum menyimpan data kelas.`
			});
		}

		const semesterId = resolveEffectiveSemesterId(
			tahunAjaranId,
			existingKelas?.semesterId,
			academicContext,
			tahunAjaranOptions
		);

		if (!semesterId) {
			return fail(400, {
				fail: `Semester aktif belum diatur pada tahun ajaran terpilih. Atur melalui menu Rapor sebelum menyimpan data kelas.`
			});
		}

		const semester = await db.query.tableSemester.findFirst({
			where: and(eq(tableSemester.id, semesterId), eq(tableSemester.tahunAjaranId, tahunAjaranId)),
			with: { tahunAjaran: true }
		});

		if (!semester || semester.tahunAjaran.sekolahId !== sekolahId) {
			return fail(400, { fail: `Semester tidak valid untuk sekolah aktif.` });
		}

		// Mode Dapodik: wali kelas harus orang yang sudah ada (by ID / nama
		// persis). Tidak membuat pegawai baru dan tidak mengubah identitas.
		let waliTargetId: number | null = null;
		if (hasWali && dapodikAktif) {
			const byId = waliPegawaiId
				? await db.query.tablePegawai.findFirst({
						columns: { id: true },
						where: eq(tablePegawai.id, waliPegawaiId)
					})
				: null;
			const byNama =
				byId ??
				(await db.query.tablePegawai.findFirst({
					columns: { id: true },
					where: sql`LOWER(trim(${tablePegawai.nama})) = ${waliNama.toLowerCase()}`
				}));
			waliTargetId = byNama?.id ?? null;
			if (!waliTargetId) {
				return fail(400, { fail: `Pilih Wali Kelas dari daftar.` });
			}
		}

		const replacedPegawaiIds: number[] = [];
		// Wali asrama yang baru ditugaskan & yang sebelumnya ditugaskan (akunnya
		// perlu disinkronkan: dibuat atau kelas utamanya diperbarui).
		let waliAsramaPegawaiId: number | null = null;
		const replacedWaliAsramaIds: number[] = [];
		await db.transaction(async (tx) => {
			if (params.id) {
				const kelas = await tx.query.tableKelas.findFirst({
					columns: {
						id: true,
						waliKelasId: true,
						waliAsramaId: true
					},
					where: and(eq(tableKelas.id, +params.id), eq(tableKelas.sekolahId, sekolahId))
				});
				if (!kelas) error(404, `Data kelas tidak ditemukan`);

				let waliKelasId = kelas.waliKelasId ?? null;
				let waliAsramaId = kelas.waliAsramaId ?? null;
				const prevWaliAsramaId = waliAsramaId;

				if (hasWali && dapodikAktif) {
					if (waliKelasId && waliKelasId !== waliTargetId) {
						replacedPegawaiIds.push(waliKelasId);
					}
					waliKelasId = waliTargetId;
				} else if (hasWali) {
					const res = await resolveWaliPegawai(tx, waliKelasId, waliNama, waliNip, timestamp);
					if (res.replaced && waliKelasId) replacedPegawaiIds.push(waliKelasId);
					waliKelasId = res.id;
				} else if (waliKelasId) {
					replacedPegawaiIds.push(waliKelasId);
					waliKelasId = null;
				}

				if (hasWaliAsrama) {
					const res = await resolveWaliPegawai(
						tx,
						waliAsramaId,
						waliAsramaNama,
						waliAsramaNip,
						timestamp
					);
					if (res.replaced && waliAsramaId) replacedPegawaiIds.push(waliAsramaId);
					waliAsramaId = res.id;
				} else if (waliAsramaId) {
					replacedPegawaiIds.push(waliAsramaId);
					waliAsramaId = null;
				}
				if (prevWaliAsramaId && prevWaliAsramaId !== waliAsramaId) {
					replacedWaliAsramaIds.push(prevWaliAsramaId);
				}
				waliAsramaPegawaiId = waliAsramaId;

				await tx
					.update(tableKelas)
					.set({
						nama: rombel,
						fase,
						sekolahId,
						waliKelasId,
						waliAsramaId,
						tahunAjaranId,
						semesterId,
						updatedAt: timestamp
					})
					.where(eq(tableKelas.id, kelas.id));
			} else {
				let waliKelasId: number | null = null;
				let waliAsramaId: number | null = null;

				if (hasWali) {
					if (dapodikAktif) {
						waliKelasId = waliTargetId;
					} else {
						const res = await resolveWaliPegawai(tx, null, waliNama, waliNip, timestamp);
						waliKelasId = res.id;
					}
				}

				if (hasWaliAsrama) {
					const res = await resolveWaliPegawai(tx, null, waliAsramaNama, waliAsramaNip, timestamp);
					waliAsramaId = res.id;
				}
				waliAsramaPegawaiId = waliAsramaId;

				await tx.insert(tableKelas).values({
					nama: rombel,
					fase,
					sekolahId,
					tahunAjaranId,
					semesterId,
					waliKelasId,
					waliAsramaId,
					updatedAt: timestamp
				});
			}
		});

		// Pegawai yang tidak lagi dirujuk siapa pun (kelas/akun/kepala sekolah)
		// boleh dihapus — baris yang masih dipakai (mis. kepala sekolah) tetap aman.
		for (const id of replacedPegawaiIds) {
			await deletePegawaiIfOrphaned(id);
		}

		// Akun wali asrama dibuat/diperbarui otomatis begitu wali asrama
		// ditugaskan di form kelas (meniru alur wali kelas).
		if (waliAsramaPegawaiId) {
			await ensureWaliAsramaAccount(waliAsramaPegawaiId);
		}
		for (const id of replacedWaliAsramaIds) {
			await ensureWaliAsramaAccount(id);
		}

		return { message: `Data kelas berhasil disimpan` };
	},

	/** Reset wali kelas: lepas pegawai lama, ganti dengan guru (find-or-create by nama). */
	async reset_walas({ request, params, locals }) {
		authority('informasi_umum_kelas');

		if (!locals.sekolah?.id) error(400, `Sekolah aktif tidak ditemukan`);
		if (!params.id) error(400, `ID kelas tidak valid`);

		const formData = await request.formData();
		const namaGuru = String(formData.get('namaGuru') ?? '').trim();
		if (!namaGuru) return fail(400, { fail: `Nama guru wajib diisi.` });

		const sekolahId = locals.sekolah.id;
		let oldWaliPegawaiId: number | null = null;
		let newWaliPegawaiId: number | null = null;

		await db.transaction(async (tx) => {
			const kelas = await tx.query.tableKelas.findFirst({
				columns: { id: true, waliKelasId: true },
				where: and(eq(tableKelas.id, +params.id!), eq(tableKelas.sekolahId, sekolahId))
			});
			if (!kelas) error(404, `Data kelas tidak ditemukan`);
			oldWaliPegawaiId = kelas.waliKelasId;

			// Find-or-create pegawai berdasarkan nama (hindari duplikat person).
			const existing = await tx.query.tablePegawai.findFirst({
				columns: { id: true },
				where: sql`LOWER(trim(${tablePegawai.nama})) = ${namaGuru.toLowerCase()}`
			});
			if (existing) {
				newWaliPegawaiId = existing.id;
			} else {
				const [pegawai] = await tx
					.insert(tablePegawai)
					.values({ nama: namaGuru, nip: '', updatedAt: new Date().toISOString() })
					.returning({ id: tablePegawai.id });
				newWaliPegawaiId = pegawai?.id ?? null;
			}
			if (!newWaliPegawaiId) error(500, `Gagal membuat data pegawai wali kelas`);

			await tx
				.update(tableKelas)
				.set({ waliKelasId: newWaliPegawaiId, updatedAt: new Date().toISOString() })
				.where(eq(tableKelas.id, kelas.id));
		});

		// Lepas pegawai lama bila tidak lagi dirujuk siapa pun.
		if (oldWaliPegawaiId && oldWaliPegawaiId !== newWaliPegawaiId) {
			await deletePegawaiIfOrphaned(oldWaliPegawaiId);
		}

		return { message: `Wali kelas berhasil direset ke ${namaGuru}.` };
	}
};
