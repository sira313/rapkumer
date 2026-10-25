export const appMenuItems: MenuItem[] = [
	{
		title: 'Informasi Umum',
		icon: 'chart',
		subMenu: [
			{
				title: 'Sekolah',
				path: '/sekolah',
				tags: ['dapodik', 'ambil data', 'tarik', 'sinkron']
			},
			{
				title: 'Akademik',
				path: '/akademik',
				tags: ['jadwal', 'bell', 'sound']
			},
			{
				title: 'Kelas',
				path: '/kelas'
			},
			{
				title: 'Murid',
				path: '/murid'
			}
		]
	},
	{
		title: 'Mata Pelajaran',
		icon: 'book',
		subMenu: [
			{
				title: 'Intrakurikuler',
				path: '/intrakurikuler',
				tags: ['tujuan pembelajaran', 'lingkup materi', 'tp', 'mapel', 'mata pelajaran']
			},
			{
				title: 'Kokurikuler',
				path: '/kokurikuler'
			},
			{
				title: 'Ekstrakurikuler',
				path: '/ekstrakurikuler'
			},
			{
				title: 'Keasramaan',
				path: '/keasramaan'
			}
		]
	},
	{
		title: 'Input Nilai',
		icon: 'pen',
		subMenu: [
			{
				title: 'Intrakurikuler',
				subMenu: [
					{
						title: 'Formatif',
						path: '/asesmen-formatif',
						tags: ['nilai']
					},
					{
						title: 'Sumatif',
						path: '/asesmen-sumatif',
						tags: ['nilai']
					}
				]
			},
			{
				title: 'Kokurikuler',
				path: '/asesmen-kokurikuler'
			},
			{
				title: 'Ekstrakurikuler',
				path: '/nilai-ekstrakurikuler'
			},
			{
				title: 'Keasramaan',
				path: '/asesmen-keasramaan'
			}
		]
	},
	{
		title: 'Administrasi',
		icon: 'briefcase',
		subMenu: [
			{
				title: 'Presensi Murid',
				path: '/presensi-murid'
			},
			{
				title: 'RPM',
				path: '/rpm',
				tags: ['rpm', 'rencana pembelajaran', 'mendalam', 'deep learning', 'kurikulum merdeka']
			},
			{
				title: 'Jurnal Mengajar',
				path: '/jurnal-mengajar'
			},
			{
				title: 'Catatan Wali Kelas',
				path: '/catatan-wali-kelas'
			},
			{
				title: 'Rekap Nilai',
				path: '/nilai-akhir',
				tags: ['kirim', 'matev', 'nilai', 'dapodik']
			},
			{
				title: 'Rekap Keasramaan',
				path: '/rekap-keasramaan',
				tags: ['keasramaan', 'leger']
			},
			{
				title: 'Keputusan',
				path: '/keputusan',
				tags: ['kenaikan', 'kelas', 'lulus', 'naik'],
				condition: 'genap'
			},
			{
				title: 'Buku Tamu',
				path: '/buku-tamu',
				tags: ['tamu', 'kunjungan', 'buku']
			},
			{
				title: 'Presensi Guru',
				path: '/presensi-guru',
				tags: ['presensi', 'guru', 'hadir', 'sakit', 'izin']
			},
			{
				title: 'Dinas Luar',
				path: '/sppd',
				tags: ['sppd', 'dinas', 'luar', 'perjalanan', 'surat', 'perintah']
			},
			{
				title: 'Dinas Luar',
				path: '/dinas-luar',
				tags: ['dinas', 'luar', 'perjalanan', 'permohonan', 'undangan']
			}
		]
	},
	{
		title: 'Cetak Dokumen',
		icon: 'print',
		path: '/cetak'
	}
];

/**
 * Dock only has room for a few slots, so labels are shortened to one word.
 * Keyed by route (`/` is the dashboard) and used for both pinned favorites and
 * the per-role fallback below.
 */
export const dockMetaByPath: Record<string, { label: string; icon: IconName }> = {
	'/': { label: 'Beranda', icon: 'grid' },
	'/sekolah': { label: 'Sekolah', icon: 'school' },
	'/akademik': { label: 'Akademik', icon: 'calendar' },
	'/kelas': { label: 'Kelas', icon: 'layers' },
	'/murid': { label: 'Murid', icon: 'users' },
	'/intrakurikuler': { label: 'Mapel', icon: 'book' },
	'/kokurikuler': { label: 'Koku.', icon: 'book-open' },
	'/ekstrakurikuler': { label: 'Ekstra', icon: 'sparkles' },
	'/keasramaan': { label: 'Asrama', icon: 'coffee' },
	'/asesmen-formatif': { label: 'Formatif', icon: 'pen' },
	'/asesmen-sumatif': { label: 'Sumatif', icon: 'pen' },
	'/asesmen-kokurikuler': { label: 'Koku.', icon: 'pen' },
	'/nilai-ekstrakurikuler': { label: 'Ekstra', icon: 'pen' },
	'/asesmen-keasramaan': { label: 'Asesmen', icon: 'pen' },
	'/presensi-murid': { label: 'Presensi', icon: 'check-square' },
	'/rpm': { label: 'RPM', icon: 'book-open' },
	'/jurnal-mengajar': { label: 'Jurnal', icon: 'activity' },
	'/catatan-wali-kelas': { label: 'Catatan', icon: 'edit' },
	'/nilai-akhir': { label: 'Nilai', icon: 'table' },
	'/rekap-keasramaan': { label: 'Asrama', icon: 'table' },
	'/keputusan': { label: 'Keputusan', icon: 'percent' },
	'/buku-tamu': { label: 'Tamu', icon: 'coffee' },
	'/presensi-guru': { label: 'Presensi', icon: 'check-square' },
	'/sppd': { label: 'SPPD', icon: 'briefcase' },
	'/dinas-luar': { label: 'Dinas', icon: 'briefcase' },
	'/cetak': { label: 'Cetak', icon: 'print' }
};

export type DockMenuItem = {
	/** Full label; also used as tooltip / accessible name. */
	title: string;
	/** Short label rendered under the dock icon. */
	label: string;
	path: string;
	icon: IconName;
};

/** Build a dock slot from a route, falling back to the given title. */
export function createDockItem(path: string, title: string): DockMenuItem {
	const meta = dockMetaByPath[path];
	const fallbackLabel = title.length > 10 ? `${title.slice(0, 9)}…` : title;
	return {
		path,
		title,
		label: meta?.label ?? fallbackLabel,
		icon: meta?.icon ?? 'star'
	};
}

/**
 * Dock slots used while the user has no favorites yet (or cannot load them).
 * Favorites always win — see mobile-dock.svelte.
 */
export const dockDefaultsByType: Record<AuthUser['type'], DockMenuItem[]> = {
	admin: [
		createDockItem('/murid', 'Murid'),
		createDockItem('/akademik', 'Akademik'),
		createDockItem('/cetak', 'Cetak Dokumen')
	],
	kepala_sekolah: [
		createDockItem('/murid', 'Murid'),
		createDockItem('/akademik', 'Akademik'),
		createDockItem('/cetak', 'Cetak Dokumen')
	],
	wali_kelas: [
		createDockItem('/presensi-murid', 'Presensi Murid'),
		createDockItem('/asesmen-formatif', 'Formatif'),
		createDockItem('/cetak', 'Cetak Dokumen')
	],
	user: [
		createDockItem('/presensi-murid', 'Presensi Murid'),
		createDockItem('/asesmen-formatif', 'Formatif'),
		createDockItem('/jurnal-mengajar', 'Jurnal Mengajar')
	],
	wali_asuh: [
		createDockItem('/keasramaan', 'Keasramaan'),
		createDockItem('/asesmen-keasramaan', 'Asesmen Keasramaan'),
		createDockItem('/cetak', 'Cetak Dokumen')
	],
	wali_asrama: [
		createDockItem('/keasramaan', 'Keasramaan'),
		createDockItem('/asesmen-keasramaan', 'Asesmen Keasramaan'),
		createDockItem('/cetak', 'Cetak Dokumen')
	]
};
