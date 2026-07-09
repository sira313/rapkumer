export async function canUserEditAbsen(
	user: NonNullable<App.Locals['user']>,
	_sekolahId: number
): Promise<boolean> {
	if (user.type === 'admin' || user.type === 'wali_kelas') return true;
	return false;
}

export function isTableMissingError(error: unknown) {
	return (
		error instanceof Error &&
		error.message.includes('no such table') &&
		(error.message.includes('ketidakhadiran_harian') ||
			error.message.includes('ketidakhadiran_rapor') ||
			error.message.includes('absensi'))
	);
}

export const TABLE_MISSING_MESSAGE =
	'Tabel yang diperlukan belum tersedia. Jalankan "pnpm db:push" untuk menerapkan migrasi terbaru.';

export function todayDateString() {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export function isValidDate(s: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	const [y, m, d] = s.split('-').map(Number);
	const date = new Date(y, m - 1, d);
	return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function getDaysInMonth(year: number, month: number) {
	return new Date(year, month, 0).getDate();
}

export function isSunday(year: number, month: number, day: number) {
	return new Date(year, month - 1, day).getDay() === 0;
}

export function isSaturday(year: number, month: number, day: number) {
	return new Date(year, month - 1, day).getDay() === 6;
}

export function dateStr(year: number, month: number, day: number) {
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
