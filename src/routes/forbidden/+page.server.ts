import { getAppVersion } from '$lib/server/app-info';

export async function load() {
	const meta: PageMeta = {
		title: 'Akses Ditolak',
		description: 'Akun Anda belum punya izin untuk membuka halaman ini.'
	};
	return { meta, appVersion: getAppVersion() };
}
