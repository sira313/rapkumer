import { relations } from 'drizzle-orm';
import {
	blob,
	index,
	int,
	real,
	sqliteTable,
	text,
	unique,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

const audit = {
	createdAt: text()
		.$defaultFn(() => new Date().toISOString())
		.notNull(),
	updatedAt: text()
};

export const tableAuthUser = sqliteTable(
	'auth_user',
	{
		id: int().primaryKey({ autoIncrement: true }),
		username: text().notNull(),
		usernameNormalized: text().notNull(),
		passwordHash: text().notNull(),
		passwordSalt: text().notNull(),
		passwordUpdatedAt: text(),
		permissions: text({ mode: 'json' }).notNull().default('[]').$type<UserPermission[]>(),
		// tipe user: admin (penuh), wali_kelas (terbatas ke kelas_id), wali_asuh (terbatas ke keasramaan), atau user (default/other)
		type: text({ enum: ['admin', 'wali_kelas', 'wali_asuh', 'user'] })
			.notNull()
			.default('admin'),
		// optional: directly associate a user to a sekolah so login can pick it reliably
		sekolahId: int().references(() => tableSekolah.id),
		// referensi opsional ke pegawai (nama wali kelas disimpan di tablePegawai)
		pegawaiId: int().references(() => tablePegawai.id),
		// untuk wali_kelas kita bisa menyimpan kelas_id yang diijinkan
		kelasId: int().references(() => tableKelas.id),
		// untuk akun tipe 'user' kita simpan pilihan mata pelajaran yang diassign saat pembuatan akun
		mataPelajaranId: int().references(() => tableMataPelajaran.id),
		...audit
	},
	(table) => [unique().on(table.usernameNormalized)]
);

export const tableAuthSession = sqliteTable(
	'auth_session',
	{
		id: int().primaryKey({ autoIncrement: true }),
		userId: int()
			.references(() => tableAuthUser.id, { onDelete: 'cascade' })
			.notNull(),
		tokenHash: text().notNull(),
		userAgent: text(),
		ipAddress: text(),
		expiresAt: text().notNull(),
		...audit
	},
	(table) => [unique().on(table.tokenHash), index('auth_session_user_id_idx').on(table.userId)]
);

export const tableAlamat = sqliteTable('alamat', {
	id: int().primaryKey({ autoIncrement: true }),
	jalan: text().notNull(),
	desa: text().notNull(),
	kecamatan: text().notNull(),
	kabupaten: text().notNull(),
	provinsi: text(),
	kodePos: text(),
	...audit
});

export const tablePegawai = sqliteTable('pegawai', {
	id: int().primaryKey({ autoIncrement: true }),
	nama: text().notNull(),
	nip: text().notNull(),
	...audit
});

export const tableSekolah = sqliteTable('sekolah', {
	id: int().primaryKey({ autoIncrement: true }),
	// include 'slb' and 'srt' as supported jenjang pendidikan
	jenjangPendidikan: text({ enum: ['sd', 'smp', 'sma', 'slb', 'pkbm', 'srt'] }).notNull(),
	// optional variant (e.g. mi, mts, smk, ma, mak, slb-dasar) stored as text
	jenjangVariant: text(),
	nama: text().notNull(),
	npsn: text().notNull(),
	alamatId: int()
		.references(() => tableAlamat.id)
		.notNull(),
	logo: blob().$type<Uint8Array>(),
	logoType: text(),
	logoDinas: blob().$type<Uint8Array>(),
	logoDinasType: text(),
	website: text(),
	email: text().notNull(),
	kepalaSekolahId: int()
		.references(() => tablePegawai.id)
		.notNull(),
	lokasiTandaTangan: text(),
	// Naungan (organisasi pengelola sekolah)
	naungan: text({ enum: ['kemendikbud', 'kemsos', 'kemenag'] })
		.default('kemendikbud')
		.notNull(),
	// Default weight distribution for sumatif: lingkup 60%, STS 20%, SAS 20%
	sumatifBobotLingkup: int().default(60).notNull(),
	sumatifBobotSts: int().default(20).notNull(),
	sumatifBobotSas: int().default(20).notNull(),
	// Rapor Tengah Semester weight distribution: lingkup 70%, STS 30%
	sumatifBobotRtsLingkup: int().default(70).notNull(),
	sumatifBobotRtsSts: int().default(30).notNull(),
	// Rapor: kriteria intrakurikuler (batas atas untuk kategori Cukup / Baik)
	raporKriteriaCukup: int().default(85).notNull(),
	raporKriteriaBaik: int().default(95).notNull(),
	// Status kepala sekolah: definitif atau PLT (Pelaksana Tugas)
	statusKepalaSekolah: text({ enum: ['definitif', 'plt'] })
		.default('definitif')
		.notNull(),
	...audit
});

export const tableFeatureUnlock = sqliteTable(
	'feature_unlock',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		featureKey: text().notNull(),
		unlockedAt: text()
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		...audit
	},
	(table) => [unique().on(table.sekolahId, table.featureKey)]
);

export const tableTahunAjaran = sqliteTable(
	'tahun_ajaran',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id)
			.notNull(),
		nama: text().notNull(),
		tanggalMulai: text(),
		tanggalSelesai: text(),
		isAktif: int({ mode: 'boolean' }).default(false).notNull(),
		...audit
	},
	(table) => [unique().on(table.sekolahId, table.nama)]
);

export const tableSemester = sqliteTable(
	'semester',
	{
		id: int().primaryKey({ autoIncrement: true }),
		tahunAjaranId: int()
			.references(() => tableTahunAjaran.id, { onDelete: 'cascade' })
			.notNull(),
		tipe: text({ enum: ['ganjil', 'genap'] }).notNull(),
		nama: text().notNull(),
		tanggalMulai: text(),
		tanggalSelesai: text(),
		tanggalBagiRaport: text(),
		tanggalMasuk: text(),
		isAktif: int({ mode: 'boolean' }).default(false).notNull(),
		...audit
	},
	(table) => [unique().on(table.tahunAjaranId, table.tipe)]
);

export const tableKelas = sqliteTable(
	'kelas',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		tahunAjaranId: int()
			.references(() => tableTahunAjaran.id, { onDelete: 'cascade' })
			.notNull(),
		semesterId: int()
			.references(() => tableSemester.id, { onDelete: 'cascade' })
			.notNull(),
		nama: text().notNull(),
		fase: text(),
		waliKelasId: int().references(() => tablePegawai.id, { onDelete: 'set null' }),
		waliAsramaId: int().references(() => tablePegawai.id, { onDelete: 'set null' }),
		waliAsuhId: int().references(() => tablePegawai.id, { onDelete: 'set null' }),
		...audit
	},
	(table) => [unique().on(table.sekolahId, table.semesterId, table.nama)]
);

export const tableTasks = sqliteTable('tasks', {
	id: int().primaryKey({ autoIncrement: true }),
	sekolahId: int()
		.references(() => tableSekolah.id, { onDelete: 'cascade' })
		.notNull(),
	kelasId: int().references(() => tableKelas.id, { onDelete: 'cascade' }),
	title: text().notNull(),
	status: text({ enum: ['active', 'completed'] })
		.default('active')
		.notNull(),
	...audit
});

export const tableSekolahRelations = relations(tableSekolah, ({ one, many }) => ({
	alamat: one(tableAlamat, { fields: [tableSekolah.alamatId], references: [tableAlamat.id] }),
	kepalaSekolah: one(tablePegawai, {
		fields: [tableSekolah.kepalaSekolahId],
		references: [tablePegawai.id]
	}),
	tahunAjaran: many(tableTahunAjaran),
	tasks: many(tableTasks),
	featureUnlocks: many(tableFeatureUnlock),
	presensiSettings: one(tablePresensiSettings)
}));

export const tableFeatureUnlockRelations = relations(tableFeatureUnlock, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableFeatureUnlock.sekolahId],
		references: [tableSekolah.id]
	})
}));

export const tableTahunAjaranRelations = relations(tableTahunAjaran, ({ one, many }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableTahunAjaran.sekolahId],
		references: [tableSekolah.id]
	}),
	semester: many(tableSemester)
}));

export const tableSemesterRelations = relations(tableSemester, ({ one }) => ({
	tahunAjaran: one(tableTahunAjaran, {
		fields: [tableSemester.tahunAjaranId],
		references: [tableTahunAjaran.id]
	})
}));

export const tableTasksRelations = relations(tableTasks, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tableTasks.sekolahId],
		references: [tableSekolah.id]
	}),
	kelas: one(tableKelas, {
		fields: [tableTasks.kelasId],
		references: [tableKelas.id]
	})
}));

export const tableAuthUserRelations = relations(tableAuthUser, ({ many, one }) => ({
	sessions: many(tableAuthSession),
	// optional relation to pegawai (teacher/staff)
	pegawai: one(tablePegawai, { fields: [tableAuthUser.pegawaiId], references: [tablePegawai.id] }),
	// optional relation to kelas (for wali_kelas users)
	kelas: one(tableKelas, { fields: [tableAuthUser.kelasId], references: [tableKelas.id] }),
	// optional relation to a preferred mata pelajaran for 'user' accounts
	mataPelajaran: one(tableMataPelajaran, {
		fields: [tableAuthUser.mataPelajaranId],
		references: [tableMataPelajaran.id]
	}),
	// many-to-many: guru bisa mengajar multiple mata pelajaran
	mataPelajaranList: many(tableAuthUserMataPelajaran),
	// many-to-many: guru bisa mengakses multiple kelas
	kelasList: many(tableAuthUserKelas),
	// optional relation to a sekolah (when user was created for a specific sekolah)
	sekolah: one(tableSekolah, {
		fields: [tableAuthUser.sekolahId],
		references: [tableSekolah.id]
	})
}));

export const tableAuthSessionRelations = relations(tableAuthSession, ({ one }) => ({
	user: one(tableAuthUser, {
		fields: [tableAuthSession.userId],
		references: [tableAuthUser.id]
	})
}));

export const tableKelasRelations = relations(tableKelas, ({ one, many }) => ({
	sekolah: one(tableSekolah, { fields: [tableKelas.sekolahId], references: [tableSekolah.id] }),
	tahunAjaran: one(tableTahunAjaran, {
		fields: [tableKelas.tahunAjaranId],
		references: [tableTahunAjaran.id]
	}),
	semester: one(tableSemester, {
		fields: [tableKelas.semesterId],
		references: [tableSemester.id]
	}),
	waliKelas: one(tablePegawai, { fields: [tableKelas.waliKelasId], references: [tablePegawai.id] }),
	waliAsrama: one(tablePegawai, {
		fields: [tableKelas.waliAsramaId],
		references: [tablePegawai.id]
	}),
	waliAsuh: one(tablePegawai, {
		fields: [tableKelas.waliAsuhId],
		references: [tablePegawai.id]
	}),
	// many-to-many: kelas bisa diakses oleh multiple guru
	authUsers: many(tableAuthUserKelas)
}));

export const tableWaliMurid = sqliteTable('wali_murid', {
	id: int().primaryKey({ autoIncrement: true }),
	nama: text().notNull(),
	pekerjaan: text().notNull(),
	kontak: text(),
	alamat: text(),
	...audit
});

export const tableMurid = sqliteTable(
	'murid',
	{
		id: int().primaryKey({ autoIncrement: true }),
		nis: text().notNull(),
		nisn: text().notNull(),
		sekolahId: int()
			.references(() => tableSekolah.id)
			.notNull(),
		semesterId: int()
			.references(() => tableSemester.id, { onDelete: 'cascade' })
			.notNull(),
		kelasId: int()
			.references(() => tableKelas.id)
			.notNull(),
		nama: text().notNull(),
		tempatLahir: text().notNull(),
		tanggalLahir: text().notNull(),
		jenisKelamin: text({ enum: ['L', 'P'] }).notNull(),
		agama: text().notNull(),
		pendidikanSebelumnya: text().notNull(),
		tanggalMasuk: text().notNull(),
		alamatId: int()
			.references(() => tableAlamat.id)
			.notNull(),
		ibuId: int().references(() => tableWaliMurid.id),
		ayahId: int().references(() => tableWaliMurid.id),
		waliId: int().references(() => tableWaliMurid.id),
		// optional: path/filename (or url) ke foto murid
		foto: text(),
		// wali asuh (nama + nip) per murid, bukan per kelas
		waliAsuhNama: text(),
		waliAsuhNip: text(),
		...audit
	},
	(t) => [unique().on(t.sekolahId, t.semesterId, t.nis)]
);

export const tableCatatanWaliKelas = sqliteTable(
	'catatan_wali_kelas',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		catatan: text(),
		...audit
	},
	(table) => [unique().on(table.muridId), index('catatan_wali_kelas_murid_idx').on(table.muridId)]
);

export const tableKehadiranMurid = sqliteTable(
	'kehadiran_murid',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		sakit: int().default(0).notNull(),
		izin: int().default(0).notNull(),
		alfa: int().default(0).notNull(),
		...audit
	},
	(table) => [unique().on(table.muridId), index('kehadiran_murid_murid_idx').on(table.muridId)]
);

export const tableMuridRelations = relations(tableMurid, ({ one, many }) => ({
	kelas: one(tableKelas, { fields: [tableMurid.kelasId], references: [tableKelas.id] }),
	semester: one(tableSemester, { fields: [tableMurid.semesterId], references: [tableSemester.id] }),
	alamat: one(tableAlamat, { fields: [tableMurid.alamatId], references: [tableAlamat.id] }),
	ibu: one(tableWaliMurid, { fields: [tableMurid.ibuId], references: [tableWaliMurid.id] }),
	ayah: one(tableWaliMurid, { fields: [tableMurid.ayahId], references: [tableWaliMurid.id] }),
	wali: one(tableWaliMurid, { fields: [tableMurid.waliId], references: [tableWaliMurid.id] }),
	kehadiran: one(tableKehadiranMurid, {
		fields: [tableMurid.id],
		references: [tableKehadiranMurid.muridId]
	}),
	catatanWali: one(tableCatatanWaliKelas, {
		fields: [tableMurid.id],
		references: [tableCatatanWaliKelas.muridId]
	}),
	keputusan: one(tableKeputusanMurid, {
		fields: [tableMurid.id],
		references: [tableKeputusanMurid.muridId]
	}),
	muridMataPelajaran: many(tableMuridMataPelajaran),
	absensi: many(tableAbsensi),
	ketidakhadiranHarian: many(tableKetidakhadiranHarian)
}));

export const tableCatatanWaliKelasRelations = relations(tableCatatanWaliKelas, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableCatatanWaliKelas.muridId],
		references: [tableMurid.id]
	})
}));

export const tableKehadiranMuridRelations = relations(tableKehadiranMurid, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableKehadiranMurid.muridId],
		references: [tableMurid.id]
	})
}));

export const tableKeputusanMurid = sqliteTable(
	'keputusan_murid',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		naik: int({ mode: 'boolean' }).default(true).notNull(),
		...audit
	},
	(table) => [unique().on(table.muridId), index('keputusan_murid_murid_idx').on(table.muridId)]
);

export const tableKeputusanMuridRelations = relations(tableKeputusanMurid, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableKeputusanMurid.muridId],
		references: [tableMurid.id]
	})
}));

// Join table untuk many-to-many relationship antara auth_user dan mata_pelajaran
// Memungkinkan satu guru mengajar multiple mata pelajaran
export const tableAuthUserMataPelajaran = sqliteTable(
	'auth_user_mata_pelajaran',
	{
		id: int().primaryKey({ autoIncrement: true }),
		authUserId: int()
			.references(() => tableAuthUser.id, { onDelete: 'cascade' })
			.notNull(),
		mataPelajaranId: int()
			.references(() => tableMataPelajaran.id, { onDelete: 'cascade' })
			.notNull(),
		...audit
	},
	(table) => [
		unique().on(table.authUserId, table.mataPelajaranId),
		index('auth_user_mata_pelajaran_user_idx').on(table.authUserId),
		index('auth_user_mata_pelajaran_mapel_idx').on(table.mataPelajaranId)
	]
);

// Join table untuk many-to-many relationship antara auth_user dan kelas
// Memungkinkan satu guru mengakses multiple kelas (dengan permission kelas_pindah)
export const tableAuthUserKelas = sqliteTable(
	'auth_user_kelas',
	{
		id: int().primaryKey({ autoIncrement: true }),
		authUserId: int()
			.references(() => tableAuthUser.id, { onDelete: 'cascade' })
			.notNull(),
		kelasId: int()
			.references(() => tableKelas.id, { onDelete: 'cascade' })
			.notNull(),
		...audit
	},
	(table) => [
		unique().on(table.authUserId, table.kelasId),
		index('auth_user_kelas_user_idx').on(table.authUserId),
		index('auth_user_kelas_kelas_idx').on(table.kelasId)
	]
);

export const tableMataPelajaran = sqliteTable(
	'mata_pelajaran',
	{
		id: int().primaryKey({ autoIncrement: true }),
		kelasId: int()
			.references(() => tableKelas.id)
			.notNull(),
		nama: text().notNull(),
		// optional short code for subjects (e.g. PAPB for Pendidikan Agama dan Budi Pekerti)
		kode: text(),
		kkm: int().notNull().default(0),
		jenis: text({ enum: ['wajib', 'pilihan', 'mulok', 'kejuruan'] }).notNull(),
		...audit
	},
	(table) => [unique().on(table.kelasId, table.nama)]
);

export const tableTujuanPembelajaran = sqliteTable('tujuan_pembelajaran', {
	id: int().primaryKey({ autoIncrement: true }),
	mataPelajaranId: int()
		.references(() => tableMataPelajaran.id)
		.notNull(),
	deskripsi: text().notNull(),
	lingkupMateri: text().notNull(),
	bobot: real().default(0).notNull(),
	...audit
});

export const tableAsesmenSumatif = sqliteTable(
	'asesmen_sumatif',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		mataPelajaranId: int()
			.references(() => tableMataPelajaran.id, { onDelete: 'cascade' })
			.notNull(),
		naLingkup: real(),
		stsTes: real(),
		stsNonTes: real(),
		sts: real(),
		sasTes: real(),
		sasNonTes: real(),
		sas: real(),
		nilaiAkhir: real(),
		nilaiAkhirRts: real(),
		...audit
	},
	(table) => [
		unique().on(table.muridId, table.mataPelajaranId),
		index('asesmen_sumatif_murid_idx').on(table.muridId),
		index('asesmen_sumatif_mapel_idx').on(table.mataPelajaranId)
	]
);

export const tableAsesmenSumatifTujuan = sqliteTable(
	'asesmen_sumatif_tujuan',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		mataPelajaranId: int()
			.references(() => tableMataPelajaran.id, { onDelete: 'cascade' })
			.notNull(),
		tujuanPembelajaranId: int()
			.references(() => tableTujuanPembelajaran.id, { onDelete: 'cascade' })
			.notNull(),
		nilai: real(),
		...audit
	},
	(table) => [
		unique().on(table.muridId, table.tujuanPembelajaranId),
		index('asesmen_sumatif_tujuan_murid_idx').on(table.muridId),
		index('asesmen_sumatif_tujuan_mapel_idx').on(table.mataPelajaranId),
		index('asesmen_sumatif_tujuan_tp_idx').on(table.tujuanPembelajaranId)
	]
);

export const tableAsesmenFormatif = sqliteTable(
	'asesmen_formatif',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		mataPelajaranId: int()
			.references(() => tableMataPelajaran.id, { onDelete: 'cascade' })
			.notNull(),
		tujuanPembelajaranId: int()
			.references(() => tableTujuanPembelajaran.id, { onDelete: 'cascade' })
			.notNull(),
		tuntas: int({ mode: 'boolean' }).default(false).notNull(),
		catatan: text(),
		dinilaiPada: text(),
		...audit
	},
	(table) => [unique().on(table.muridId, table.tujuanPembelajaranId)]
);

export const tableMataPelajaranRelations = relations(tableMataPelajaran, ({ one, many }) => ({
	tujuanPembelajaran: many(tableTujuanPembelajaran),
	asesmenFormatif: many(tableAsesmenFormatif),
	asesmenSumatif: many(tableAsesmenSumatif),
	asesmenSumatifTujuan: many(tableAsesmenSumatifTujuan),
	kelas: one(tableKelas, { fields: [tableMataPelajaran.kelasId], references: [tableKelas.id] }),
	// many-to-many: mata pelajaran bisa diajar oleh multiple guru
	authUsers: many(tableAuthUserMataPelajaran),
	muridMataPelajaran: many(tableMuridMataPelajaran)
}));

export const tableTujuanPembelajaranRelations = relations(tableTujuanPembelajaran, ({ one }) => ({
	mataPelajaran: one(tableMataPelajaran, {
		fields: [tableTujuanPembelajaran.mataPelajaranId],
		references: [tableMataPelajaran.id]
	})
}));

export const tableAuthUserMataPelajaranRelations = relations(
	tableAuthUserMataPelajaran,
	({ one }) => ({
		authUser: one(tableAuthUser, {
			fields: [tableAuthUserMataPelajaran.authUserId],
			references: [tableAuthUser.id]
		}),
		mataPelajaran: one(tableMataPelajaran, {
			fields: [tableAuthUserMataPelajaran.mataPelajaranId],
			references: [tableMataPelajaran.id]
		})
	})
);

export const tableAuthUserKelasRelations = relations(tableAuthUserKelas, ({ one }) => ({
	authUser: one(tableAuthUser, {
		fields: [tableAuthUserKelas.authUserId],
		references: [tableAuthUser.id]
	}),
	kelas: one(tableKelas, {
		fields: [tableAuthUserKelas.kelasId],
		references: [tableKelas.id]
	})
}));

export const tableAsesmenFormatifRelations = relations(tableAsesmenFormatif, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableAsesmenFormatif.muridId],
		references: [tableMurid.id]
	}),
	mataPelajaran: one(tableMataPelajaran, {
		fields: [tableAsesmenFormatif.mataPelajaranId],
		references: [tableMataPelajaran.id]
	}),
	tujuanPembelajaran: one(tableTujuanPembelajaran, {
		fields: [tableAsesmenFormatif.tujuanPembelajaranId],
		references: [tableTujuanPembelajaran.id]
	})
}));

export const tableAsesmenSumatifRelations = relations(tableAsesmenSumatif, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableAsesmenSumatif.muridId],
		references: [tableMurid.id]
	}),
	mataPelajaran: one(tableMataPelajaran, {
		fields: [tableAsesmenSumatif.mataPelajaranId],
		references: [tableMataPelajaran.id]
	})
}));

export const tableAsesmenSumatifTujuanRelations = relations(
	tableAsesmenSumatifTujuan,
	({ one }) => ({
		murid: one(tableMurid, {
			fields: [tableAsesmenSumatifTujuan.muridId],
			references: [tableMurid.id]
		}),
		mataPelajaran: one(tableMataPelajaran, {
			fields: [tableAsesmenSumatifTujuan.mataPelajaranId],
			references: [tableMataPelajaran.id]
		}),
		tujuanPembelajaran: one(tableTujuanPembelajaran, {
			fields: [tableAsesmenSumatifTujuan.tujuanPembelajaranId],
			references: [tableTujuanPembelajaran.id]
		})
	})
);

export const tableEkstrakurikuler = sqliteTable(
	'ekstrakurikuler',
	{
		id: int().primaryKey({ autoIncrement: true }),
		nama: text().notNull(),
		kelasId: int()
			.references(() => tableKelas.id)
			.notNull(),
		...audit
	},
	(table) => [unique().on(table.kelasId, table.nama)]
);

export const tableMuridEkstrakurikuler = sqliteTable(
	'murid_ekstrakurikuler',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		ekstrakurikulerId: int()
			.references(() => tableEkstrakurikuler.id, { onDelete: 'cascade' })
			.notNull(),
		nilaiKosong: int().notNull().default(0),
		...audit
	},
	(table) => [
		unique().on(table.muridId, table.ekstrakurikulerId),
		index('murid_ekstrakurikuler_murid_idx').on(table.muridId),
		index('murid_ekstrakurikuler_ekstrak_idx').on(table.ekstrakurikulerId)
	]
);

export const tableMuridMataPelajaran = sqliteTable(
	'murid_mata_pelajaran',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		mataPelajaranId: int()
			.references(() => tableMataPelajaran.id, { onDelete: 'cascade' })
			.notNull(),
		nilaiKosong: int().notNull().default(0),
		...audit
	},
	(table) => [
		unique().on(table.muridId, table.mataPelajaranId),
		index('murid_mata_pelajaran_murid_idx').on(table.muridId),
		index('murid_mata_pelajaran_mapel_idx').on(table.mataPelajaranId)
	]
);

export const tableEkstrakurikulerTujuan = sqliteTable('ekstrakurikuler_tujuan', {
	id: int().primaryKey({ autoIncrement: true }),
	ekstrakurikulerId: int()
		.references(() => tableEkstrakurikuler.id, { onDelete: 'cascade' })
		.notNull(),
	deskripsi: text().notNull(),
	...audit
});

export const tableAsesmenEkstrakurikuler = sqliteTable(
	'asesmen_ekstrakurikuler',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		ekstrakurikulerId: int()
			.references(() => tableEkstrakurikuler.id, { onDelete: 'cascade' })
			.notNull(),
		tujuanId: int()
			.references(() => tableEkstrakurikulerTujuan.id, { onDelete: 'cascade' })
			.notNull(),
		kategori: text({ enum: ['sangat-baik', 'baik', 'cukup', 'perlu-bimbingan'] }).notNull(),
		dinilaiPada: text(),
		...audit
	},
	(table) => [
		unique().on(table.muridId, table.ekstrakurikulerId, table.tujuanId),
		index('asesmen_ekstrakurikuler_murid_idx').on(table.muridId),
		index('asesmen_ekstrakurikuler_ekstrak_idx').on(table.ekstrakurikulerId),
		index('asesmen_ekstrakurikuler_tujuan_idx').on(table.tujuanId)
	]
);

export const tableKokurikuler = sqliteTable('kokurikuler', {
	id: int().primaryKey({ autoIncrement: true }),
	kelasId: int()
		.references(() => tableKelas.id)
		.notNull(),
	kode: text().notNull().unique(),
	dimensi: text({ mode: 'json' }).$type<string[]>().notNull(),
	tujuan: text().notNull(),
	...audit
});

export const tableEkstrakurikulerRelations = relations(tableEkstrakurikuler, ({ one, many }) => ({
	kelas: one(tableKelas, {
		fields: [tableEkstrakurikuler.kelasId],
		references: [tableKelas.id]
	}),
	tujuan: many(tableEkstrakurikulerTujuan),
	asesmen: many(tableAsesmenEkstrakurikuler),
	muridEkstrakurikuler: many(tableMuridEkstrakurikuler)
}));

export const tableMuridEkstrakurikulerRelations = relations(
	tableMuridEkstrakurikuler,
	({ one }) => ({
		murid: one(tableMurid, {
			fields: [tableMuridEkstrakurikuler.muridId],
			references: [tableMurid.id]
		}),
		ekstrakurikuler: one(tableEkstrakurikuler, {
			fields: [tableMuridEkstrakurikuler.ekstrakurikulerId],
			references: [tableEkstrakurikuler.id]
		})
	})
);

export const tableMuridMataPelajaranRelations = relations(tableMuridMataPelajaran, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableMuridMataPelajaran.muridId],
		references: [tableMurid.id]
	}),
	mataPelajaran: one(tableMataPelajaran, {
		fields: [tableMuridMataPelajaran.mataPelajaranId],
		references: [tableMataPelajaran.id]
	})
}));

export const tableEkstrakurikulerTujuanRelations = relations(
	tableEkstrakurikulerTujuan,
	({ one, many }) => ({
		ekstrakurikuler: one(tableEkstrakurikuler, {
			fields: [tableEkstrakurikulerTujuan.ekstrakurikulerId],
			references: [tableEkstrakurikuler.id]
		}),
		asesmen: many(tableAsesmenEkstrakurikuler)
	})
);

export const tableAsesmenEkstrakurikulerRelations = relations(
	tableAsesmenEkstrakurikuler,
	({ one }) => ({
		murid: one(tableMurid, {
			fields: [tableAsesmenEkstrakurikuler.muridId],
			references: [tableMurid.id]
		}),
		ekstrakurikuler: one(tableEkstrakurikuler, {
			fields: [tableAsesmenEkstrakurikuler.ekstrakurikulerId],
			references: [tableEkstrakurikuler.id]
		}),
		tujuan: one(tableEkstrakurikulerTujuan, {
			fields: [tableAsesmenEkstrakurikuler.tujuanId],
			references: [tableEkstrakurikulerTujuan.id]
		})
	})
);

export const tableKokurikulerRelations = relations(tableKokurikuler, ({ one }) => ({
	kelas: one(tableKelas, {
		fields: [tableKokurikuler.kelasId],
		references: [tableKelas.id]
	})
}));

export const tableAsesmenKokurikuler = sqliteTable(
	'asesmen_kokurikuler',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		kokurikulerId: int()
			.references(() => tableKokurikuler.id, { onDelete: 'cascade' })
			.notNull(),
		dimensi: text().notNull(),
		kategori: text({ enum: ['sangat-baik', 'baik', 'cukup', 'perlu-bimbingan'] }).notNull(),
		dinilaiPada: text(),
		...audit
	},
	(table) => [
		unique().on(table.muridId, table.kokurikulerId, table.dimensi),
		index('asesmen_kokurikuler_murid_idx').on(table.muridId),
		index('asesmen_kokurikuler_kokurikuler_idx').on(table.kokurikulerId)
	]
);

export const tableAsesmenKokurikulerRelations = relations(tableAsesmenKokurikuler, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableAsesmenKokurikuler.muridId],
		references: [tableMurid.id]
	}),
	kokurikuler: one(tableKokurikuler, {
		fields: [tableAsesmenKokurikuler.kokurikulerId],
		references: [tableKokurikuler.id]
	})
}));

export const tablePresensiSettings = sqliteTable(
	'presensi_settings',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.references(() => tableSekolah.id, { onDelete: 'cascade' })
			.notNull(),
		tahunAjaranId: int()
			.references(() => tableTahunAjaran.id, { onDelete: 'cascade' })
			.notNull(),
		jamMasuk: text().notNull().default('07:30'),
		jamPulang: text().notNull().default('15:00'),
		hariSekolah: int().notNull().default(6),
		tipePresensi: text({ enum: ['masuk_pulang', 'masuk_saja', 'awal_mapel', 'awal_akhir_mapel'] })
			.notNull()
			.default('masuk_pulang'),
		liburNasional: text().notNull().default('[]'),
		liburSemester: text().notNull().default('[]'),
		jenisPresensi: text({ enum: ['wali_kelas_saja', 'tiap_mapel'] })
			.notNull()
			.default('wali_kelas_saja'),
		...audit
	},
	(table) => [unique().on(table.sekolahId, table.tahunAjaranId)]
);

export const tablePresensiSettingsRelations = relations(tablePresensiSettings, ({ one }) => ({
	sekolah: one(tableSekolah, {
		fields: [tablePresensiSettings.sekolahId],
		references: [tableSekolah.id]
	}),
	tahunAjaran: one(tableTahunAjaran, {
		fields: [tablePresensiSettings.tahunAjaranId],
		references: [tableTahunAjaran.id]
	})
}));

export const tableKeasramaan = sqliteTable(
	'keasramaan',
	{
		id: int().primaryKey({ autoIncrement: true }),
		nama: text().notNull(),
		kelasId: int()
			.references(() => tableKelas.id)
			.notNull(),
		...audit
	},
	(table) => [unique().on(table.kelasId, table.nama)]
);

export const tableKeasramaanIndikator = sqliteTable('keasramaan_indikator', {
	id: int().primaryKey({ autoIncrement: true }),
	keasramaanId: int()
		.references(() => tableKeasramaan.id, { onDelete: 'cascade' })
		.notNull(),
	deskripsi: text().notNull(),
	...audit
});

export const tableKeasramaanRelations = relations(tableKeasramaan, ({ one, many }) => ({
	kelas: one(tableKelas, {
		fields: [tableKeasramaan.kelasId],
		references: [tableKelas.id]
	}),
	indikator: many(tableKeasramaanIndikator),
	asesmen: many(tableAsesmenKeasramaan)
}));

export const tableKeasramaanIndikatorRelations = relations(
	tableKeasramaanIndikator,
	({ one, many }) => ({
		keasramaan: one(tableKeasramaan, {
			fields: [tableKeasramaanIndikator.keasramaanId],
			references: [tableKeasramaan.id]
		}),
		tujuan: many(tableKeasramaanTujuan)
	})
);

export const tableKeasramaanTujuan = sqliteTable('keasramaan_tujuan', {
	id: int().primaryKey({ autoIncrement: true }),
	indikatorId: int()
		.references(() => tableKeasramaanIndikator.id, { onDelete: 'cascade' })
		.notNull(),
	deskripsi: text().notNull(),
	...audit
});

export const tableKeasramaanTujuanRelations = relations(tableKeasramaanTujuan, ({ one, many }) => ({
	indikator: one(tableKeasramaanIndikator, {
		fields: [tableKeasramaanTujuan.indikatorId],
		references: [tableKeasramaanIndikator.id]
	}),
	asesmen: many(tableAsesmenKeasramaan)
}));

export const tableAsesmenKeasramaan = sqliteTable(
	'asesmen_keasramaan',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		keasramaanId: int()
			.references(() => tableKeasramaan.id, { onDelete: 'cascade' })
			.notNull(),
		tujuanId: int()
			.references(() => tableKeasramaanTujuan.id, { onDelete: 'cascade' })
			.notNull(),
		kategori: text({ enum: ['sangat-baik', 'baik', 'cukup', 'perlu-bimbingan'] }).notNull(),
		dinilaiPada: text(),
		...audit
	},
	(table) => [
		unique().on(table.muridId, table.keasramaanId, table.tujuanId),
		index('asesmen_keasramaan_murid_idx').on(table.muridId),
		index('asesmen_keasramaan_keasramaan_idx').on(table.keasramaanId),
		index('asesmen_keasramaan_tujuan_idx').on(table.tujuanId)
	]
);

export const tableAsesmenKeasramaanRelations = relations(tableAsesmenKeasramaan, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableAsesmenKeasramaan.muridId],
		references: [tableMurid.id]
	}),
	keasramaan: one(tableKeasramaan, {
		fields: [tableAsesmenKeasramaan.keasramaanId],
		references: [tableKeasramaan.id]
	}),
	tujuan: one(tableKeasramaanTujuan, {
		fields: [tableAsesmenKeasramaan.tujuanId],
		references: [tableKeasramaanTujuan.id]
	})
}));

export const tableAbsensi = sqliteTable(
	'absensi',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		mataPelajaranId: int().references(() => tableMataPelajaran.id, { onDelete: 'set null' }),
		waktu: text().notNull(),
		...audit
	},
	(table) => [index('absensi_murid_waktu_idx').on(table.muridId, table.waktu)]
);

export const tableAbsensiRelations = relations(tableAbsensi, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableAbsensi.muridId],
		references: [tableMurid.id]
	})
}));

export const tableKetidakhadiranHarian = sqliteTable(
	'ketidakhadiran_harian',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		tanggal: text().notNull(),
		mataPelajaranId: int().references(() => tableMataPelajaran.id, { onDelete: 'set null' }),
		keterangan: text(),
		keteranganPulang: text(),
		...audit
	},
	(table) => [
		uniqueIndex('ketidakhadiran_murid_tanggal_mapel_idx').on(
			table.muridId,
			table.tanggal,
			table.mataPelajaranId
		)
	]
);

export const tableKetidakhadiranHarianRelations = relations(
	tableKetidakhadiranHarian,
	({ one }) => ({
		murid: one(tableMurid, {
			fields: [tableKetidakhadiranHarian.muridId],
			references: [tableMurid.id]
		})
	})
);

export const tableKetidakhadiranRapor = sqliteTable(
	'ketidakhadiran_rapor',
	{
		id: int().primaryKey({ autoIncrement: true }),
		muridId: int()
			.references(() => tableMurid.id, { onDelete: 'cascade' })
			.notNull(),
		semesterId: int()
			.references(() => tableSemester.id, { onDelete: 'cascade' })
			.notNull(),
		sakit: int(),
		izin: int(),
		alfa: int(),
		...audit
	},
	(table) => [
		uniqueIndex('ketidakhadiran_rapor_murid_semester_idx').on(table.muridId, table.semesterId)
	]
);

export const tableKetidakhadiranRaporRelations = relations(tableKetidakhadiranRapor, ({ one }) => ({
	murid: one(tableMurid, {
		fields: [tableKetidakhadiranRapor.muridId],
		references: [tableMurid.id]
	}),
	semester: one(tableSemester, {
		fields: [tableKetidakhadiranRapor.semesterId],
		references: [tableSemester.id]
	})
}));

export const tableBellSettings = sqliteTable(
	'bell_settings',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.notNull()
			.references(() => tableSekolah.id),
		jamPelajaranMenit: int().notNull().default(35),
		durasiIstirahat: int().notNull().default(30),
		durasiUpacara: int().notNull().default(70),
		jamMulai: text().notNull().default('07:00'),
		isActive: int().notNull().default(0),
		...audit
	},
	(table) => [uniqueIndex('bell_settings_sekolah_idx').on(table.sekolahId)]
);

export const tableKegiatanCustom = sqliteTable(
	'kegiatan_custom',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.notNull()
			.references(() => tableSekolah.id),
		nama: text().notNull(),
		kode: text().notNull(),
		durasi: int(),
		soundFileName: text(),
		soundMimeType: text(),
		...audit
	},
	(table) => [uniqueIndex('kegiatan_custom_sekolah_kode_idx').on(table.sekolahId, table.kode)]
);

export const tableBellSounds = sqliteTable(
	'bell_sounds',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.notNull()
			.references(() => tableSekolah.id),
		tipe: text().notNull(),
		fileName: text().notNull(),
		mimeType: text().notNull().default('audio/mpeg'),
		ttsMessage: text(),
		...audit
	},
	(table) => [uniqueIndex('bell_sounds_sekolah_tipe_idx').on(table.sekolahId, table.tipe)]
);

export const tableUserFavorites = sqliteTable(
	'user_favorites',
	{
		id: int().primaryKey({ autoIncrement: true }),
		userId: int()
			.references(() => tableAuthUser.id, { onDelete: 'cascade' })
			.notNull(),
		path: text().notNull(),
		title: text().notNull(),
		...audit
	},
	(table) => [
		unique().on(table.userId, table.path),
		index('user_favorites_user_idx').on(table.userId)
	]
);

export const tableUserFavoritesRelations = relations(tableUserFavorites, ({ one }) => ({
	user: one(tableAuthUser, {
		fields: [tableUserFavorites.userId],
		references: [tableAuthUser.id]
	})
}));

export const tableJadwalPelajaran = sqliteTable(
	'jadwal_pelajaran',
	{
		id: int().primaryKey({ autoIncrement: true }),
		sekolahId: int()
			.notNull()
			.references(() => tableSekolah.id),
		hari: text().notNull(),
		jamKe: int().notNull(),
		kodeKegiatan: text().notNull(),
		kelasId: int()
			.notNull()
			.references(() => tableKelas.id),
		...audit
	},
	(table) => [
		uniqueIndex('jadwal_pelajaran_uniq_idx').on(
			table.sekolahId,
			table.hari,
			table.jamKe,
			table.kelasId
		)
	]
);
