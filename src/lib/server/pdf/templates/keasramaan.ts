import { sharedStyles, formatValue, formatUpper, FALLBACK, getTutwuriBwDataUri } from './shared';

interface KeasramaanPrintData {
	sekolah: {
		nama: string;
		alamat: string;
		logoUrl?: string | null;
		jenjangVariant?: string | null;
	};
	murid: { nama: string; nis: string; nisn: string };
	rombel: { nama: string; fase: string };
	periode: { tahunAjaran: string; semester: string };
	waliAsrama: { nama: string; nip?: string | null } | null;
	waliKelas: { nama: string; nip?: string | null } | null;
	waliAsuh: { nama: string; nip?: string | null } | null;
	kepalaSekolah: { nama: string; nip?: string | null; statusKepalaSekolah?: string | null } | null;
	ttd: { tempat: string; tanggal: string };
	kehadiran: { sakit: number; izin: number; alfa: number } | null;
	keasramaanRows: Array<{
		no: number;
		indikator: string;
		predikat: 'perlu-bimbingan' | 'cukup' | 'baik' | 'sangat-baik';
		deskripsi: string;
		kategoriHeader?: string;
	}>;
}

function predikatToHuruf(predikat: string): string {
	const map: Record<string, string> = {
		'sangat-baik': 'A',
		baik: 'B',
		cukup: 'C',
		'perlu-bimbingan': 'D'
	};
	return map[predikat] || FALLBACK;
}

function keasramaanStyles(): string {
	return `
body {
	padding: 0;
}

.header-title {
	font-size: 14pt;
	font-weight: bold;
	text-align: center;
	margin-bottom: 1mm;
}

.header-subtitle {
	font-size: 10pt;
	text-align: center;
	margin-bottom: 4mm;
}

.identity-table {
	width: 100%;
	border-collapse: collapse;
	margin-bottom: 4mm;
}

.identity-table td {
	padding: 0.65mm 0;
	font-size: 10pt;
	vertical-align: top;
}

.identity-table .label {
	width: 28mm;
	white-space: nowrap;
	font-weight: bold;
}

.identity-table .colon {
	width: 3mm;
}

.identity-table .value-left {
	width: 70mm;
}

.identity-table .label-right {
	width: 35mm;
	white-space: nowrap;
	padding-left: 5mm;
	font-weight: bold;
}

.identity-table .colon-right {
	width: 3mm;
}

.main-table {
	width: 100%;
	border-collapse: collapse;
	font-size: 10pt;
	margin-bottom: 4mm;
	page-break-inside: auto;
}

.main-table thead,
.main-table tfoot {
	display: table-header-group;
}

.main-table tfoot {
	display: table-footer-group;
}

.main-table th {
	border: 0.3mm solid #000;
	padding: 2.8mm 4.2mm;
	font-weight: bold;
	text-align: center;
	background: #f0f0f0;
}

.main-table thead,
.main-table tfoot,
.main-table tbody,
.main-table tr,
.main-table th,
.main-table td {
	page-break-inside: auto;
	break-inside: auto;
}

.main-table td {
	border: 0.3mm solid #000;
	padding: 1.4mm 2.8mm;
	vertical-align: top;
}

.main-table .col-no {
	width: 15mm;
	text-align: center;
}

.main-table .col-indikator {
	width: 57mm;
}

.main-table .col-predikat {
	width: 25mm;
	text-align: center;
}

.main-table .col-deskripsi div {
	text-align: justify;
	margin-bottom: 0.5mm;
}

.main-table .col-deskripsi div:last-child {
	margin-bottom: 0;
}

.main-table th.col-deskripsi {
	text-align: center;
}

.main-table tr.category-header td {
	font-weight: bold;
	padding: 2.8mm 4.2mm;
	text-align: left;
}

.main-table tr.first-data-row {
	page-break-before: auto;
}

.kehadiran-wrapper {
	page-break-inside: avoid;
	margin-bottom: 4mm;
}

.kehadiran-table {
	width: 100%;
	border-collapse: collapse;
	font-size: 10pt;
}

.kehadiran-table th {
	border: 0.3mm solid #000;
	padding: 2.8mm 4.2mm;
	font-weight: bold;
	text-align: center;
	background: #fff;
}

.kehadiran-table td {
	border: 0.3mm solid #000;
	padding: 2.8mm 4.2mm;
	vertical-align: top;
}

.kehadiran-table .col-jumlah {
	width: 22.6mm;
	text-align: center;
}

.signature-section {
	width: 100%;
}

.signature-table {
	width: 100%;
	border-collapse: collapse;
	font-size: 10pt;
}

.signature-table td {
	padding: 1pt 4pt;
	vertical-align: top;
	text-align: center;
}

.signature-date {
	text-align: center;
	padding-bottom: 6pt;
}

.sig-title {
	font-weight: bold;
}

.sig-space {
	height: 24mm;
}

.sig-name {
	font-weight: bold;
	text-decoration: underline;
}

.sig-nip {
	padding-top: 2pt;
}

.sig-spacer {
	height: 4mm;
}

.watermark {
	position: fixed;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	opacity: 0.12;
	width: 45%;
	pointer-events: none;
	z-index: -1;
}

@media print {
	.watermark { position: fixed; }
}
`;
}

export function renderKeasramaanHTML(data: KeasramaanPrintData): string {
	const logoUrl = data.sekolah.logoUrl || getTutwuriBwDataUri() || null;

	const semesterLabel = data.periode.semester.replace(/^Semester\s+/i, '');
	const faseLabel = data.rombel.fase ? formatValue(data.rombel.fase).toUpperCase() : FALLBACK;

	const kepalaSekolahTitle =
		data.kepalaSekolah?.statusKepalaSekolah === 'plt' ? 'Plt. Kepala Sekolah' : 'Kepala Sekolah';

	const tableBody = data.keasramaanRows
		.map((row, i, arr) => {
			if (row.kategoriHeader) {
				return `<tr class="category-header">
				<td colspan="4">${row.kategoriHeader}</td>
			</tr>`;
			}
			const prev = arr[i - 1];
			const cls = prev?.kategoriHeader ? 'first-data-row' : '';
			return `<tr${cls ? ` class="${cls}"` : ''}>
			<td class="col-no">${row.no}</td>
			<td class="col-indikator">${formatValue(row.indikator)}</td>
			<td class="col-predikat">${row.deskripsi ? predikatToHuruf(row.predikat) : FALLBACK}</td>
			<td class="col-deskripsi">${formatValue(row.deskripsi).split('\n').filter(Boolean).map(p => `<div>${p}</div>`).join('\n')}</td>
		</tr>`;
		})
		.join('\n');

	const tableHeader = `
		<tr>
			<th class="col-no">No</th>
			<th class="col-indikator">Indikator</th>
			<th class="col-predikat">Predikat</th>
			<th class="col-deskripsi">Deskripsi</th>
		</tr>`;

	const kehadiranSection = data.kehadiran
		? `
<div class="kehadiran-wrapper">
<table class="kehadiran-table">
	<thead>
		<tr>
			<th colspan="2">KETIDAKHADIRAN</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td>Sakit</td>
			<td class="col-jumlah">${data.kehadiran.sakit} Hari</td>
		</tr>
		<tr>
			<td>Izin</td>
			<td class="col-jumlah">${data.kehadiran.izin} Hari</td>
		</tr>
		<tr>
			<td>Tanpa Keterangan</td>
			<td class="col-jumlah">${data.kehadiran.alfa} Hari</td>
		</tr>
	</tbody>
</table>
</div>`
		: '';

	const ttdText = data.ttd
		? `${formatValue(data.ttd.tempat)}, ${formatValue(data.ttd.tanggal)}`
		: '';

	const waliAsramaLabel = 'Wali Asrama';
	const waliAsramaName = data.waliAsrama ? formatValue(data.waliAsrama.nama) : FALLBACK;
	const waliAsramaNip = data.waliAsrama?.nip ? `${formatValue(data.waliAsrama.nip)}` : '';

	const waliAsuhLabel = 'Wali Asuh';
	const waliAsuhName = data.waliAsuh ? formatValue(data.waliAsuh.nama) : FALLBACK;
	const waliAsuhNip = data.waliAsuh?.nip ? `${formatValue(data.waliAsuh.nip)}` : '';

	const kepalaSekolahLabel = data.kepalaSekolah ? kepalaSekolahTitle : '';
	const kepalaSekolahNama = data.kepalaSekolah ? formatValue(data.kepalaSekolah.nama) : '';
	const kepalaSekolahNip = data.kepalaSekolah?.nip
		? `${formatValue(data.kepalaSekolah.nip)}`
		: '';

	return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>
${sharedStyles()}

@page {
	size: A4 portrait;
	margin-left: 20mm;
	margin-right: 15mm;
	margin-top: 15mm;
	margin-bottom: 15mm;
	@bottom-left {
		content: "${data.rombel.nama} | ${data.murid.nama} | ${data.murid.nis}";
		font-size: 9pt;
		font-family: Helvetica, Arial, sans-serif;
		color: #555;
	}
	@bottom-right {
		content: "Halaman: " counter(page) "/" counter(pages);
		font-size: 9pt;
		font-family: Helvetica, Arial, sans-serif;
		color: #555;
	}
}

${keasramaanStyles()}
</style>
</head>
<body>

${logoUrl ? `<img src="${logoUrl}" alt="Watermark" class="watermark">` : ''}

<div class="header-title">LAPORAN KEGIATAN KEASRAMAAN</div>
<div class="header-subtitle">(RAPOR)</div>

<table class="identity-table">
	<tr>
		<td class="label">Nama Murid</td>
		<td class="colon">:</td>
		<td class="value-left uppercase">${formatUpper(data.murid.nama)}</td>
		<td class="label-right">Kelas</td>
		<td class="colon-right">:</td>
		<td class="value-right">${formatValue(data.rombel.nama)}</td>
	</tr>
	<tr>
		<td class="label">NISN / NIS</td>
		<td class="colon">:</td>
		<td class="value-left">${formatValue(data.murid.nisn)} / ${formatValue(data.murid.nis)}</td>
		<td class="label-right">Fase</td>
		<td class="colon-right">:</td>
		<td class="value-right">${faseLabel}</td>
	</tr>
	<tr>
		<td class="label">Sekolah</td>
		<td class="colon">:</td>
		<td class="value-left uppercase">${formatUpper(data.sekolah.nama)}</td>
		<td class="label-right">Semester</td>
		<td class="colon-right">:</td>
		<td class="value-right">${formatValue(semesterLabel)}</td>
	</tr>
	<tr>
		<td class="label">Alamat</td>
		<td class="colon">:</td>
		<td class="value-left">${formatValue(data.sekolah.alamat)}</td>
		<td class="label-right">Tahun Ajaran</td>
		<td class="colon-right">:</td>
		<td class="value-right">${data.periode.tahunAjaran}</td>
	</tr>
</table>

<table class="main-table">
	<thead>
		${tableHeader}
	</thead>
	<tbody>
${tableBody}
	</tbody>
	<tfoot>
		${tableHeader}
	</tfoot>
</table>

${kehadiranSection}

<div class="signature-section">
<table class="signature-table">
	<colgroup>
		<col style="width:50%">
		<col style="width:50%">
	</colgroup>
	<tbody style="page-break-inside: avoid;">
		<tr>
			<td></td>
			<td class="signature-date">${ttdText}</td>
		</tr>
		<tr>
			<td class="sig-title">${waliAsramaLabel}</td>
			<td class="sig-title">${waliAsuhLabel}</td>
		</tr>
		<tr>
			<td class="sig-space"></td>
			<td class="sig-space"></td>
		</tr>
		<tr>
			<td class="sig-name">${waliAsramaName}</td>
			<td class="sig-name">${waliAsuhName}</td>
		</tr>
		<tr>
			<td class="sig-nip">${waliAsramaNip}</td>
			<td class="sig-nip">${waliAsuhNip}</td>
		</tr>
		<tr>
			<td class="sig-spacer"></td>
			<td></td>
		</tr>
	</tbody>
	<tbody style="page-break-inside: avoid;">
		<tr>
			<td class="sig-title">Orang Tua / Wali Murid</td>
			<td class="sig-title">${kepalaSekolahLabel}</td>
		</tr>
		<tr>
			<td class="sig-space"></td>
			<td class="sig-space"></td>
		</tr>
		<tr>
			<td>____________________</td>
			<td class="sig-name">${kepalaSekolahNama}</td>
		</tr>
		<tr>
			<td></td>
			<td class="sig-nip">${kepalaSekolahNip}</td>
		</tr>
	</tbody>
</table>
</div>

</body>
</html>`;
}
