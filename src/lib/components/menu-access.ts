import {
	isAuthorizedUser,
	resolveRoutePermission,
	WALI_KELAS_ONLY_PERMISSIONS
} from '../../routes/pengguna/permissions';

export type MenuAccessUser = Pick<AuthUser, 'permissions' | 'type'> & {
	kelasId?: number | null;
	ownKelasIds?: number[] | null;
};

export type MenuAccessContext = {
	user?: MenuAccessUser | null;
	/** Active kelas id from the `active-kelas-id` cookie (see +layout.server.ts). */
	kelasAktifId?: number | null;
	/** Per-sekolah/tahun-ajaran toggle for the presensi guru feature. */
	presensiGuruEnabled?: boolean;
};

/**
 * Single source of truth for "is this menu path hidden for the current user".
 *
 * Shared by the desktop drawer (menu.svelte) and the mobile dock so the two
 * navigation surfaces can never drift apart. Items without a path (parent
 * groups) are never hidden here — callers filter their children recursively.
 */
export function isPathHiddenForUser(
	path: string | undefined,
	ctx: MenuAccessContext = {}
): boolean {
	if (!path) return false;
	if (path === '/presensi-guru' && ctx.presensiGuruEnabled === false) return true;

	const user = ctx.user;
	// /dinas-luar is the permohonan feature for non-admin roles; admin & kepala
	// sekolah manage perjalanan dinas via the full /sppd page instead.
	if (path === '/dinas-luar' && user && (user.type === 'admin' || user.type === 'kepala_sekolah')) {
		return true;
	}

	// Wali kelas on non-own class: downgrade to guru-level permissions
	if (user?.type === 'wali_kelas' && ctx.kelasAktifId != null) {
		const ownIds = user.ownKelasIds?.length
			? user.ownKelasIds
			: user.kelasId != null
				? [user.kelasId]
				: [];
		if (ownIds.length > 0 && !ownIds.includes(ctx.kelasAktifId)) {
			const required = resolveRoutePermission(path);
			if (required && WALI_KELAS_ONLY_PERMISSIONS.has(required)) return true;
		}
	}

	const required = resolveRoutePermission(path);
	if (!required) return false;
	return !isAuthorizedUser([required], user ?? undefined);
}
