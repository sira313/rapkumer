/**
 * Map route patterns to help documentation filenames.
 * Used by navbar to show context-sensitive help.
 */

type HelpMapEntry = { matcher: string | RegExp; file: string };

export const helpMaps: HelpMapEntry[] = [
	{ matcher: '/', file: 'umum' },
	{ matcher: '/sekolah', file: 'sekolah' },
	{ matcher: '/sekolah/form', file: 'sekolah-form' },
	{ matcher: '/sekolah/tahun-ajaran', file: 'tahun-ajaran' },
	{ matcher: '/rapor', file: 'rapor' },
	{ matcher: '/murid', file: 'murid' },
	{ matcher: '/intrakurikuler', file: 'intrakurikuler' },
	{ matcher: /^\/intrakurikuler\/\d+\/tp-rl$/, file: 'tp-rl' },
	{ matcher: '/kokurikuler', file: 'kokurikuler' },
	{ matcher: '/asesmen-kokurikuler', file: 'asesmen-kokurikuler' },
	{ matcher: '/ekstrakurikuler', file: 'ekstrakurikuler' },
	{ matcher: '/ekstrakurikuler/tp-ekstra', file: 'tp-ekstra' },
	{ matcher: '/kelas', file: 'data-kelas' },
	{ matcher: '/kelas/form', file: 'data-kelas' },
	{ matcher: /^\/kelas\/form\/\d+$/, file: 'edit-data-kelas' },
	{ matcher: '/asesmen-formatif', file: 'asesmen-formatif' },
	{ matcher: '/asesmen-formatif/formulir-asesmen', file: 'form-formatif' },
	{ matcher: '/asesmen-sumatif', file: 'asesmen-sumatif' },
	{ matcher: '/asesmen-sumatif/formulir-asesmen', file: 'form-sumatif' },
	{ matcher: '/nilai-akhir', file: 'nilai-akhir' },
	{ matcher: '/nilai-akhir/daftar-nilai', file: 'daftar-nilai' },
	{ matcher: '/absen', file: 'absen' },
	{ matcher: '/nilai-ekstrakurikuler/form-asesmen', file: 'form-ekstra' },
	{ matcher: '/nilai-ekstrakurikuler', file: 'nilai-ekstra' },
	{ matcher: '/catatan-wali-kelas', file: 'catatan-wali' },
	{ matcher: '/pengaturan', file: 'pengaturan' },
	{ matcher: '/pengguna', file: 'pengguna' },
	{ matcher: '/keasramaan', file: 'keasramaan' },
	{ matcher: '/asesmen-keasramaan', file: 'asesmen-keasramaan' },
	{ matcher: '/asesmen-keasramaan/form-asesmen', file: 'form-keasramaan' },
	{ matcher: '/keasramaan/mata-evaluasi', file: 'matev-keasramaan' },
	{ matcher: '/keasramaan/tp', file: 'tp-keasramaan' },
	{ matcher: '/cetak', file: 'cetak' },
	{ matcher: '/keputusan', file: 'absen' }
];

/**
 * Find the help file name for a given pathname.
 * @param pathname - The current pathname to match
 * @returns The help file name (without extension) or null if no match
 */
export function resolveHelpFile(pathname: string): string | null {
	for (const entry of helpMaps) {
		if (typeof entry.matcher === 'string') {
			if (pathname === entry.matcher) return entry.file;
			continue;
		}
		if (entry.matcher.test(pathname)) {
			return entry.file;
		}
	}
	return null;
}
