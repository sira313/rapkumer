import { sharedStyles, formatValue, FALLBACK, escHtml } from './shared';
import { compareKepegawaian } from '$lib/server/kepegawaian-order';
import { ttdStempelBoxHTML } from '$lib/server/tanda-tangan-sekolah';

export type PresensiGuruStatusPerDay =
	'hadir' | 'izin' | 'sakit' | 'dinas_luar' | 'cuti' | 'belum' | '';

export const JABATAN_SINGKAT: Record<string, string> = {
	Guru: 'Gu',
	'Guru Muda': 'GM',
	'Guru Madya': 'GMa',
	'Guru Utama': 'GU',
	'Guru Pertama': 'GP',
	'Ahli Pertama': 'AP',
	'-': '-'
};

const JABATAN_LEGENDA: Record<string, string> = {
	Gu: 'Guru',
	GM: 'Guru Muda',
	GMa: 'Guru Madya',
	GU: 'Guru Utama',
	GP: 'Guru Pertama',
	AP: 'Ahli Pertama'
};

export function singkatJabatan(jabatan: string | null | undefined): string {
	if (!jabatan) return '';
	const trimmed = jabatan.trim();
	return JABATAN_SINGKAT[trimmed] ?? trimmed;
}

export interface PresensiGuruPrintRow {
	no: number;
	nama: string;
	nip: string;
	tempatLahir: string;
	tanggalLahir: string;
	jenisKelamin: string;
	ijazah: string;
	tahunIjazah: string;
	jabatan: string;
	golongan: string;
	tanggalDiangkat: string;
	tanggalBekerja: string;
	statusKepegawaian: string;
	tanggalGajiBerkala: string;
	pangkat: string;
	statusPerDay: PresensiGuruStatusPerDay[];
	signaturesPerDay: string[];
	countHadir: number;
	countIzin: number;
	countSakit: number;
	countDinasLuar: number;
	countCuti: number;
	countBelum: number;
}

export interface PresensiGuruPrintData {
	sekolah: {
		id?: number;
		nama: string;
	};
	periode: {
		tahunPelajaran: string;
		semester: string;
		bulan: string;
		tahun: number;
		hariBelajar: number;
	};
	redDays: number[];
	weekendDays?: number[];
	liburNasionalDays?: number[];
	liburSemesterDays?: number[];
	daysInMonth: number;
	rows: PresensiGuruPrintRow[];
	kepalaSekolah?: {
		nama: string;
		nip?: string | null;
		statusKepalaSekolah?: string | null;
	} | null;
	tanggalTtd?: string;
}

// A4 landscape: 297mm wide. Fixed (non-date) columns in mm; the day columns get
// the remaining width so the table always fills the page width exactly.
const PAGE_WIDTH_MM = 297;
const PAGE_MARGIN_MM = 7;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - PAGE_MARGIN_MM * 2;

const FIXED_COL_WIDTHS_MM = [4, 18, 12, 4, 9, 7, 7, 7, 7, 9, 7, 7];
const TOTAL_COL_WIDTHS_MM = [4, 4, 4, 5, 5, 5];

const FIXED_COLS_SUM_MM =
	FIXED_COL_WIDTHS_MM.reduce((a, b) => a + b, 0) + TOTAL_COL_WIDTHS_MM.reduce((a, b) => a + b, 0);

export function renderPresensiGuruHTML(data: PresensiGuruPrintData): string {
	const rows = [...(data.rows ?? [])]
		.sort((a, b) => compareKepegawaian(a, b))
		.map((row, i) => ({ ...row, no: i + 1 }));
	const daysInMonth = data.daysInMonth ?? 31;
	const redDays = new Set(data.redDays ?? []);
	const weekendDays = new Set(data.weekendDays ?? []);
	const liburNasionalDays = new Set(data.liburNasionalDays ?? []);
	const liburSemesterDays = new Set(data.liburSemesterDays ?? []);

	function liburClass(day: number): string {
		if (weekendDays.has(day)) return 'libur-weekend';
		if (liburNasionalDays.has(day)) return 'libur-nasional';
		if (liburSemesterDays.has(day)) return 'libur-semester';
		return redDays.has(day) ? 'libur-weekend' : '';
	}

	const BULAN_SINGKAT = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'Mei',
		'Jun',
		'Jul',
		'Agt',
		'Sep',
		'Okt',
		'Nov',
		'Des'
	];

	/** Parse "yyyy-mm-dd" or "dd-mm-yyyy" into { d, mo, y } (day may be 1-2 digits). */
	function parseTanggal(value: string): { d: string; mo: string; y: string } | null {
		const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) ?? /^(\d{1,2})-(\d{2})-(\d{4})$/.exec(value);
		if (!m) return null;
		const isIso = m[1].length === 4;
		return { y: isIso ? m[1] : m[3], mo: m[2], d: isIso ? m[3] : m[1] };
	}

	function bulanSingkat(mo: string): string {
		return BULAN_SINGKAT[Number(mo) - 1] ?? mo;
	}

	/** "dd-mm-yyyy" (or "yyyy-mm-dd") -> stacked "12-Jul<br>2026" so dates fit narrow cells. */
	function formatDateStack(value: string | null | undefined): string {
		if (!value) return FALLBACK;
		const p = parseTanggal(value.trim());
		if (!p) return formatValue(value);
		return `${Number(p.d)}-${bulanSingkat(p.mo)}<br/>${p.y}`;
	}

	/** "dd-mm-yyyy" (or "yyyy-mm-dd") -> single line "12-Jul-2026". */
	function formatDateInline(value: string | null | undefined): string {
		if (!value) return FALLBACK;
		const p = parseTanggal(value.trim());
		if (!p) return formatValue(value);
		return `${Number(p.d)}-${bulanSingkat(p.mo)}-${p.y}`;
	}

	const dayColW = (CONTENT_WIDTH_MM - FIXED_COLS_SUM_MM) / daysInMonth;
	const fixedCols = FIXED_COL_WIDTHS_MM.map((w) => `<col style="width:${w}mm" />`).join('');
	const dayCols = Array.from(
		{ length: daysInMonth },
		() => `<col style="width:${dayColW.toFixed(2)}mm" />`
	).join('');
	const totalCols = TOTAL_COL_WIDTHS_MM.map((w) => `<col style="width:${w}mm" />`).join('');

	const dayHeaders = Array.from({ length: daysInMonth }, (v, i) => {
		const day = i + 1;
		return `<th class="day ${liburClass(day)}">${day}</th>`;
	}).join('');

	const bodyRows = rows
		.map((row) => {
			const dayCells = row.statusPerDay
				.map((status, di) => {
					const day = di + 1;
					const libur = liburClass(day);
					let content = '';
					if (status === 'hadir') {
						const sig = row.signaturesPerDay[di];
						content = sig
							? `<img class="sig-img" src="${sig}" alt="paraf" />`
							: '<span class="bold">H</span>';
					} else if (status === 'sakit') {
						content = '<span class="bold">S</span>';
					} else if (status === 'izin') {
						content = '<span class="bold">I</span>';
					} else if (status === 'dinas_luar') {
						content = '<span class="bold">D</span>';
					} else if (status === 'cuti') {
						content = '<span class="bold">Ct</span>';
					} else if (status === 'belum') {
						content = '<span class="bold">TK</span>';
					}
					return `<td class="day-cell ${libur}">${content}</td>`;
				})
				.join('');

			return `<tr>
	<td class="text-center">${row.no}</td>
	<td class="cell-nama">
		<div>${formatValue(row.nama)}</div>
		<div class="sub">${formatValue(row.nip)}</div>
	</td>
	<td class="cell-mid">
		<div>${formatValue(row.tempatLahir)}</div>
		<div class="sub">${formatDateInline(row.tanggalLahir)}</div>
	</td>
	<td class="text-center">${formatValue(row.jenisKelamin)}</td>
	<td class="cell-mid">
		<div>${formatValue(row.ijazah)}</div>
		<div>${formatValue(row.tahunIjazah)}</div>
	</td>
	<td class="text-center">${formatValue(row.jabatan)}</td>
	<td class="text-center">${formatValue(row.golongan)}</td>
	<td class="text-center">${formatDateStack(row.tanggalDiangkat)}</td>
	<td class="text-center">${formatDateStack(row.tanggalBekerja)}</td>
	<td class="text-center">${formatValue(row.statusKepegawaian)}</td>
	<td class="text-center">${formatDateStack(row.tanggalGajiBerkala)}</td>
	<td class="text-center">${formatDateStack(row.pangkat)}</td>
	${dayCells}
	<td class="text-center bold">${row.countHadir || ''}</td>
	<td class="text-center bold">${row.countIzin || ''}</td>
	<td class="text-center bold">${row.countSakit || ''}</td>
	<td class="text-center bold">${row.countDinasLuar || ''}</td>
	<td class="text-center bold">${row.countCuti || ''}</td>
	<td class="text-center bold">${row.countBelum || ''}</td>
</tr>`;
		})
		.join('');

	const jabatanSingkat = [
		...new Set(rows.map((r) => (r.jabatan ?? '').trim()).filter(Boolean))
	].filter((s) => s !== '-');
	const jabatanLegend = jabatanSingkat
		.map((s) => {
			const full = JABATAN_LEGENDA[s] ?? s;
			return `<span class="legend-item"><strong>${formatValue(s)}</strong> : ${formatValue(full)}</span>`;
		})
		.join('');

	const kepalaSekolah = data.kepalaSekolah ?? null;
	const kepalaTitle = kepalaSekolah?.statusKepalaSekolah === 'plt' ? 'Plt. Kepala' : 'Kepala';
	const kepalaNama = formatValue(kepalaSekolah?.nama ?? '');
	const kepalaNip = escHtml((kepalaSekolah?.nip ?? '').trim());
	const kepalaNipLabel = kepalaNip
		? kepalaNip.toLowerCase().startsWith('nip')
			? kepalaNip
			: `NIP. ${kepalaNip}`
		: '';

	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${sharedStyles()}

@page {
	size: A4 landscape;
	margin: 7mm;
}

body {
	font-size: 5.5pt;
}

.header {
	text-align: center;
	margin-bottom: 3px;
}

.header h2 {
	font-size: 10pt;
	margin-bottom: 1px;
	letter-spacing: 1px;
}

.header p {
	font-size: 7pt;
	margin: 1px 0;
	color: #333;
}

table {
	width: 100%;
	border-collapse: collapse;
	table-layout: fixed;
	font-size: 5pt;
}

table, th, td {
	border: 0.5px solid #000;
}

th {
	font-weight: bold;
	text-align: center;
	vertical-align: middle;
	padding: 1px 0;
	font-size: 4.5pt;
	text-transform: uppercase;
}

td {
	padding: 1px 0;
	vertical-align: middle;
}

.text-center {
	text-align: center;
}

.bold {
	font-weight: bold;
}

.libur-weekend {
	background-color: #e0e0e0;
}

.libur-nasional {
	background-color: #f3b0b0;
}

.libur-semester {
	background-color: #f8e0a8;
}

.legend-row {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 12px;
}

.legend {
	margin-top: 4px;
	text-align: right;
	font-size: 5.5pt;
	color: #333;
}

.legend-notes {
	margin-top: 4px;
	text-align: left;
	font-size: 5.5pt;
	color: #333;
	display: grid;
	grid-template-columns: repeat(2, auto);
	column-gap: 18px;
	row-gap: 1px;
}

.ttd-row {
	display: flex;
	justify-content: flex-end;
	margin-top: 10px;
}

.ttd-section {
	text-align: left;
	width: 220px;
	font-size: 8pt;
	line-height: 1.5;
	page-break-inside: avoid;
}

.ttd-section p {
	margin: 0;
}

.ttd-section .bold {
	font-weight: bold;
}

.ttd-space {
	height: 55px;
}

.legend-item {
	margin-left: 10px;
	white-space: nowrap;
}

.swatch {
	display: inline-block;
	width: 8px;
	height: 8px;
	border: 0.5px solid #000;
	vertical-align: -1px;
	margin-right: 3px;
}

/* Horizontal header text rotated 90° (sideways, top-to-bottom) */
.vh {
	writing-mode: vertical-rl;
	text-orientation: sideways;
	white-space: nowrap;
	font-size: 4pt;
	font-weight: bold;
}

.cell-nama {
	font-size: 4.5pt;
	text-align: left;
	padding-left: 2px;
}

.cell-mid {
	font-size: 4pt;
	text-align: center;
}

.sub {
	font-size: 3.5pt;
	color: #333;
}

.day {
	font-size: 4pt;
	padding: 0;
	line-height: 1.1;
}

.day-cell {
	text-align: center;
	padding: 0;
	height: 5mm;
}

.sig-img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
	object-position: center;
	mix-blend-mode: multiply;
}

.thead-row1 th {
	height: 9mm;
}

.thead-row2 th {
	height: 16.5mm;
}
</style>
</head>
<body>
	<div class="header">
		<h2>KEADAAN PERSONIL</h2>
		<p><strong>${formatValue(data.sekolah.nama)}</strong></p>
		<p>Tahun Pelajaran ${formatValue(data.periode.tahunPelajaran)} - Semester ${formatValue(data.periode.semester)}</p>
		<p><strong>Bulan ${formatValue(data.periode.bulan)} ${data.periode.tahun}</strong>${data.periode.hariBelajar > 0 ? ` (${data.periode.hariBelajar} hari belajar)` : ''}</p>
	</div>

	<table>
		<colgroup>
			${fixedCols}
			${dayCols}
			${totalCols}
		</colgroup>
		<thead>
			<tr class="thead-row1">
				<th rowspan="2">No</th>
				<th rowspan="2">Nama/NIP</th>
				<th rowspan="2"><span class="vh">Tempat &amp; Tanggal Lahir</span></th>
				<th rowspan="2"><span class="vh">Jenis Kelamin</span></th>
				<th rowspan="2"><span class="vh">Ijazah/Tahun</span></th>
				<th rowspan="2"><span class="vh">Jabatan</span></th>
				<th rowspan="2"><span class="vh">Gol Gaji TMT</span></th>
				<th colspan="2">Tanggal Mulai</th>
				<th rowspan="2"><span class="vh">Status Kepegawaian</span></th>
				<th colspan="2">TGL Kenaikan</th>
				<th colspan="${daysInMonth}">Tanggal Daftar Hadir</th>
				<th colspan="6">Jumlah</th>
			</tr>
			<tr class="thead-row2">
				<th><span class="vh">Diangkat</span></th>
				<th><span class="vh">Kerja di Sekolah Ini</span></th>
				<th><span class="vh">Gaji Berkala</span></th>
				<th><span class="vh">Pangkat</span></th>
				${dayHeaders}
				<th>H</th>
				<th>I</th>
				<th>S</th>
				<th>DL</th>
				<th>Ct</th>
				<th>TK</th>
			</tr>
		</thead>
		<tbody>
			${bodyRows || `<tr><td colspan="${12 + daysInMonth + 6}" class="text-center" style="padding:20px;">Tidak ada data guru</td></tr>`}
		</tbody>
	</table>
	<div class="legend-row">
		<div class="legend-notes">
			${jabatanLegend}
			<span class="legend-item"><strong>Ct</strong> : Cuti</span>
		</div>
		<div class="legend">
			<span class="legend-item"><span class="swatch libur-weekend"></span>Libur akhir pekan</span>
			<span class="legend-item"><span class="swatch libur-nasional"></span>Libur nasional</span>
			<span class="legend-item"><span class="swatch libur-semester"></span>Libur semester</span>
		</div>
	</div>
	<div class="ttd-row">
		<div class="ttd-section">
			<p>${formatValue(data.tanggalTtd)}</p>
			<p>${kepalaTitle}</p>
			<p>${formatValue(data.sekolah.nama)}</p>
			${ttdStempelBoxHTML(data.sekolah.id, '55px', '20mm', '7mm')}
			<p class="bold">${kepalaNama}</p>
			<p>${kepalaNipLabel}</p>
		</div>
	</div>
</body>
</html>`;
}
