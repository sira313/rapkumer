export const groupedUserPermissions = {
	user: {
		values: [
			['list', 'Lihat daftar pengguna'],
			['detail', 'Lihat detail pengguna'],
			['add', 'Tambah pengguna'],
			['delete', 'Hapus pengguna'],
			['suspend', 'Tangguhkan pengguna'],
			['set_permissions', 'Atur izin pengguna']
		],
		description: 'Manajemen Pengguna'
	},

	dashboard: {
		values: [['manage', 'Kelola Tindakan Cepat']],
		description: 'Dashboard'
	},
	app: {
		values: [['check_update', 'Cek Pembaruan Aplikasi']],
		description: 'Aplikasi'
	},
	server: {
		values: [['stop', 'Hentikan Server']],
		description: 'Server'
	},
	kelas: {
		values: [['pindah', 'Pindah dan akses kelas lain']],
		description: 'Akses Kelas'
	},
	informasi_umum: {
		values: [
			['sekolah', 'Sekolah'],
			['akademik', 'Akademik'],
			['kelas', 'Kelas'],
			['murid', 'Murid']
		],
		description: 'Informasi Umum'
	},
	mata_pelajaran: {
		values: [
			['intrakurikuler', 'Intrakurikuler'],
			['kokurikuler', 'Kokurikuler'],
			['ekstrakurikuler', 'Ekstrakurikuler'],
			['keasramaan', 'Keasramaan']
		],
		description: 'Mata Pelajaran'
	},
	input_nilai: {
		values: [
			['asesmen_formatif', 'Formatif'],
			['asesmen_sumatif', 'Sumatif'],
			['asesmen_kokurikuler', 'Kokurikuler'],
			['nilai_ekstrakurikuler', 'Ekstrakurikuler'],
			['asesmen_keasramaan', 'Keasramaan']
		],
		description: 'Input Nilai'
	},
	administrasi: {
		values: [
			['absen', 'Presensi Murid'],
			['rpm', 'RPM'],
			['jurnal_mengajar', 'Jurnal Mengajar'],
			['catatan_wali_kelas', 'Catatan Wali Kelas'],
			['rekap_nilai', 'Rekap Nilai'],
			['keputusan', 'Keputusan'],
			['buku_tamu', 'Buku Tamu'],
			['presensi_guru', 'Presensi Guru'],
			['sppd', 'SPPD'],
			['dinas_luar', 'Dinas Luar']
		],
		description: 'Administrasi'
	},
	cetak: {
		values: [['dokumen', 'Cetak Dokumen']],
		description: 'Cetak Dokumen'
	}
} as const;

export const userPermissions = Object.entries(groupedUserPermissions) //
	.flatMap(([key, { values }]) => values.map((value) => <UserPermission>`${key}_${value[0]}`));

/**
 * Default permission per tipe akun non-admin. Admin otomatis memiliki semua akses.
 */
export const defaultPermissionsByType: Partial<Record<AuthUser['type'], UserPermission[]>> = {
	kepala_sekolah: userPermissions,
	wali_kelas: [
		'informasi_umum_murid',
		'mata_pelajaran_intrakurikuler',
		'mata_pelajaran_kokurikuler',
		'mata_pelajaran_ekstrakurikuler',
		'mata_pelajaran_keasramaan',
		'input_nilai_asesmen_formatif',
		'input_nilai_asesmen_sumatif',
		'input_nilai_asesmen_kokurikuler',
		'input_nilai_nilai_ekstrakurikuler',
		'input_nilai_asesmen_keasramaan',
		'administrasi_absen',
		'administrasi_rpm',
		'administrasi_jurnal_mengajar',
		'administrasi_catatan_wali_kelas',
		'administrasi_rekap_nilai',
		'administrasi_keputusan',
		'administrasi_dinas_luar',
		'cetak_dokumen'
	],
	wali_asuh: [
		'mata_pelajaran_keasramaan',
		'input_nilai_asesmen_keasramaan',
		'cetak_dokumen',
		'kelas_pindah',
		'administrasi_dinas_luar'
	],
	user: [
		'mata_pelajaran_intrakurikuler',
		'input_nilai_asesmen_formatif',
		'input_nilai_asesmen_sumatif',
		'administrasi_absen',
		'administrasi_rpm',
		'administrasi_jurnal_mengajar',
		'administrasi_rekap_nilai',
		'administrasi_dinas_luar',
		'cetak_dokumen'
	]
};

/**
 * Permissions exclusive to wali_kelas — present in wali_kelas's default set but
 * absent from the user (guru) default set. Used to downgrade menu visibility and
 * block direct URL access when a wali_kelas views a non-own class.
 */
export const WALI_KELAS_ONLY_PERMISSIONS = new Set(
	(defaultPermissionsByType.wali_kelas ?? []).filter(
		(p) => !(defaultPermissionsByType.user ?? []).includes(p)
	)
);

/**
 * Key permission lama yang tidak lagi valid di model baru. Diperbaiki saat migrasi.
 */
export const removedLegacyPermissionKeys = new Set([
	'sekolah_manage',
	'rapor_manage',
	'kelas_manage'
]);

/**
 * Mapping prefix rute menu → permission akses. Dipakai untuk memblokir akses
 * halaman (server) dan menyembunyikan item di drawer (client).
 */
export const menuRoutePermissions: { path: string; permission: UserPermission }[] = [
	{ path: '/sekolah', permission: 'informasi_umum_sekolah' },
	{ path: '/akademik', permission: 'informasi_umum_akademik' },
	{ path: '/kelas', permission: 'informasi_umum_kelas' },
	{ path: '/murid', permission: 'informasi_umum_murid' },
	{ path: '/intrakurikuler', permission: 'mata_pelajaran_intrakurikuler' },
	{ path: '/kokurikuler', permission: 'mata_pelajaran_kokurikuler' },
	{ path: '/ekstrakurikuler', permission: 'mata_pelajaran_ekstrakurikuler' },
	{ path: '/keasramaan', permission: 'mata_pelajaran_keasramaan' },
	{ path: '/asesmen-formatif', permission: 'input_nilai_asesmen_formatif' },
	{ path: '/asesmen-sumatif', permission: 'input_nilai_asesmen_sumatif' },
	{ path: '/asesmen-kokurikuler', permission: 'input_nilai_asesmen_kokurikuler' },
	{ path: '/nilai-ekstrakurikuler', permission: 'input_nilai_nilai_ekstrakurikuler' },
	{ path: '/asesmen-keasramaan', permission: 'input_nilai_asesmen_keasramaan' },
	{ path: '/presensi-murid', permission: 'administrasi_absen' },
	{ path: '/rpm', permission: 'administrasi_rpm' },
	{ path: '/jurnal-mengajar', permission: 'administrasi_jurnal_mengajar' },
	{ path: '/catatan-wali-kelas', permission: 'administrasi_catatan_wali_kelas' },
	{ path: '/nilai-akhir', permission: 'administrasi_rekap_nilai' },
	{ path: '/keputusan', permission: 'administrasi_keputusan' },
	{ path: '/buku-tamu', permission: 'administrasi_buku_tamu' },
	{ path: '/presensi-guru', permission: 'administrasi_presensi_guru' },
	{ path: '/sppd', permission: 'administrasi_sppd' },
	{ path: '/dinas-luar', permission: 'administrasi_dinas_luar' },
	{ path: '/cetak', permission: 'cetak_dokumen' }
];

/**
 * Resolve permission akses untuk sebuah pathname (termasuk turunannya).
 * Mengembalikan `null` bila path tidak masuk dalam menu ber-permission.
 */
export function resolveRoutePermission(pathname: string): UserPermission | null {
	const normalized = pathname.replace(/\/+$/, '') || '/';
	for (const { path, permission } of menuRoutePermissions) {
		if (normalized === path || normalized.startsWith(path + '/')) return permission;
	}
	return null;
}

export function isAuthorizedUser(
	allowedPermissions: UserPermission[],
	// include 'type' so we can treat admins as authorized
	user?: Pick<AuthUser, 'permissions' | 'type'>
) {
	if (!user) return false;
	// Admins are authorized for everything by policy
	// wali_kelas and wali_asuh are NOT admins and must check permissions
	if ('type' in user && (user.type === 'admin' || user.type === 'kepala_sekolah')) return true;
	const userPermissions = user.permissions || [];
	return allowedPermissions.some((r) => userPermissions.includes(r));
}

/**
 * True for roles with full administrative access (admin, kepala_sekolah).
 * Kepala sekolah has the same access as admin but is scoped to a specific
 * (active) sekolah rather than being a global account.
 */
export function isAdminUser(user?: Pick<AuthUser, 'type'> | null): boolean {
	return user?.type === 'admin' || user?.type === 'kepala_sekolah';
}
