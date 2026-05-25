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
@page {
	margin: 15mm 15mm 20mm 20mm;
}

body {
	padding: 0;
}

.footer {
	position: fixed;
	bottom: 0;
	left: 20mm;
	right: 15mm;
	font-size: 9pt;
	display: flex;
	justify-content: space-between;
	padding-bottom: 5mm;
}

.footer .page-num::after {
	content: "Halaman: " counter(page);
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
	margin-bottom: 5mm;
}

.identity-table {
	width: 100%;
	border-collapse: collapse;
	margin-bottom: 8.5mm;
}

.identity-table td {
	padding: 1mm 0;
	font-size: 10pt;
	vertical-align: top;
}

.identity-table .label {
	width: 28mm;
	white-space: nowrap;
}

.identity-table .colon {
	width: 3mm;
}

.identity-table .value-left {
	width: 70mm;
	font-weight: bold;
}

.identity-table .label-right {
	width: 35mm;
	white-space: nowrap;
	padding-left: 5mm;
}

.identity-table .colon-right {
	width: 3mm;
}

.identity-table .value-right {
	font-weight: bold;
}

.main-table {
	width: 100%;
	border-collapse: collapse;
	font-size: 10pt;
	margin-bottom: 4.2mm;
}

.main-table th {
	border: 0.3mm solid #000;
	padding: 2.8mm 4.2mm;
	font-weight: bold;
	text-align: center;
	background: #fff;
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

.main-table .col-deskripsi {
	text-align: left;
}

.main-table tr.category-header td {
	font-weight: bold;
	padding: 2.8mm 4.2mm;
	text-align: left;
}

.kehadiran-table {
	width: 100%;
	border-collapse: collapse;
	font-size: 10pt;
	margin-bottom: 16.9mm;
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

.kehadiran-table .col-no {
	width: 17mm;
	text-align: center;
}

.kehadiran-table .col-alasan {
	text-align: left;
}

.kehadiran-table .col-jumlah {
	width: 22.6mm;
	text-align: center;
}

.ttd-place {
	font-size: 10pt;
	text-align: center;
	margin-bottom: 8.5mm;
	margin-left: auto;
	width: 50%;
}

.signature-table {
	width: 100%;
	border-collapse: collapse;
	font-size: 10pt;
}

.signature-table td {
	padding: 2mm 0;
	vertical-align: top;
	text-align: center;
	width: 50%;
}

.signature-table .sig-title {
	font-size: 10pt;
}

.signature-table .sig-name {
	font-weight: bold;
	font-size: 11pt;
	padding-top: 22.6mm;
	text-decoration: underline;
}

.signature-table .sig-nip {
	font-size: 10pt;
	padding-top: 3mm;
}

.signature-table .dashed-line {
	border-bottom: 0.15mm dashed #000;
	display: block;
	width: 70%;
	margin: 22.6mm auto 3mm;
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
		.map((row) => {
			if (row.kategoriHeader) {
				return `<tr class="category-header">
				<td colspan="4">${row.kategoriHeader}</td>
			</tr>`;
			}
			return `<tr>
			<td class="col-no">${row.no}</td>
			<td class="col-indikator">${formatValue(row.indikator)}</td>
			<td class="col-predikat">${predikatToHuruf(row.predikat)}</td>
			<td class="col-deskripsi">${formatValue(row.deskripsi)}</td>
		</tr>`;
		})
		.join('\n');

	const kehadiranSection = data.kehadiran
		? `
<table class="kehadiran-table">
	<thead>
		<tr>
			<th colspan="3">KETIDAKHADIRAN</th>
		</tr>
		<tr>
			<th class="col-no">No</th>
			<th class="col-alasan">Alasan Ketidakhadiran</th>
			<th class="col-jumlah">Jumlah</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td class="col-no">1</td>
			<td>Sakit</td>
			<td class="col-jumlah">${data.kehadiran.sakit}</td>
		</tr>
		<tr>
			<td class="col-no">2</td>
			<td>Izin</td>
			<td class="col-jumlah">${data.kehadiran.izin}</td>
		</tr>
		<tr>
			<td class="col-no">3</td>
			<td>Tanpa Keterangan</td>
			<td class="col-jumlah">${data.kehadiran.alfa}</td>
		</tr>
	</tbody>
</table>`
		: '';

	const ttdSection = data.ttd
		? `<div class="ttd-place">${formatValue(data.ttd.tempat)}, ${formatValue(data.ttd.tanggal)}</div>`
		: '';

	const waliAsramaSection = data.waliAsrama
		? `
			<td>
				<div class="sig-title">Wali Asrama</div>
				<div class="sig-name">${formatValue(data.waliAsrama.nama)}</div>
				<div class="sig-nip">${formatValue(data.waliAsrama.nip)}</div>
			</td>`
		: '<td></td>';

	const waliAsuhSection = data.waliAsuh
		? `
			<td>
				<div class="sig-title">Wali Asuh</div>
				<div class="sig-name">${formatValue(data.waliAsuh.nama)}</div>
				<div class="sig-nip">${formatValue(data.waliAsuh.nip)}</div>
			</td>`
		: '<td></td>';

	const kepalaSekolahSection = data.kepalaSekolah
		? `
			<td>
				<div class="sig-title">${kepalaSekolahTitle}</div>
				<div class="sig-name">${formatValue(data.kepalaSekolah.nama)}</div>
				<div class="sig-nip">${formatValue(data.kepalaSekolah.nip)}</div>
			</td>`
		: '<td></td>';

	return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>
${sharedStyles()}
${keasramaanStyles()}
</style>
</head>
<body>

${logoUrl ? `<img src="${logoUrl}" alt="Watermark" class="watermark">` : ''}

<div class="footer">
	<span>${formatValue(data.rombel.nama)} | ${formatValue(data.murid.nama)} | ${formatValue(data.murid.nis)}</span>
	<span class="page-num"></span>
</div>

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
		<td class="label-right">Tahun Pelajaran</td>
		<td class="colon-right">:</td>
		<td class="value-right">${data.periode.tahunAjaran}</td>
	</tr>
</table>

<table class="main-table">
	<thead>
		<tr>
			<th class="col-no">No</th>
			<th class="col-indikator">Indikator</th>
			<th class="col-predikat">Predikat</th>
			<th class="col-deskripsi">Deskripsi</th>
		</tr>
	</thead>
	<tbody>
${tableBody}
	</tbody>
</table>

${kehadiranSection}

${ttdSection}

<table class="signature-table">
	<tr>
		${waliAsramaSection}
		${waliAsuhSection}
	</tr>
	<tr>
		<td>
			<div class="sig-title">Orang Tua/Wali Murid</div>
			<span class="dashed-line"></span>
		</td>
		${kepalaSekolahSection}
	</tr>
</table>

</body>
</html>`;
}
