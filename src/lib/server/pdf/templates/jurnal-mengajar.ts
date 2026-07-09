import { sharedStyles, formatValue, getTutwuriBwDataUri } from './shared';

export interface JurnalMengajarPrintData {
	sekolah: {
		nama: string;
	};
	murid: {
		nama: string;
		nis: string;
	};
	periode: {
		tahunPelajaran: string;
		semester: string;
		tanggalMulai: string;
		tanggalSelesai: string;
	};
	rows: Array<{
		tanggal: string;
		kelas: string;
		mataPelajaran: string;
		jamPelajaran: string;
		lingkupMateri: string;
		tujuanPembelajaran: string;
		hadir: number;
		sakit: number;
		izin: number;
		alfa: number;
		catatan: string;
	}>;
	kepalaSekolah: {
		nama: string;
		nip?: string | null;
		statusKepalaSekolah?: string | null;
	};
	guru: {
		nama: string;
		nip?: string | null;
	};
	isWaliKelas: boolean;
	guruLabel: string;
	ttd: {
		tempat: string;
		tanggal: string;
	};
}

export function renderJurnalMengajarHTML(data: JurnalMengajarPrintData): string {
	const rows = data.rows ?? [];

	const tableRows = rows
		.map(
			(row, i) => `
		<tr${i % 2 === 1 ? ' class="striped"' : ''}>
			<td class="text-center">${formatValue(row.tanggal)}</td>
			<td class="text-center">${formatValue(row.kelas)}</td>
			<td>${formatValue(row.mataPelajaran)}</td>
			<td class="text-center">${formatValue(row.jamPelajaran)}</td>
			<td>${formatValue(row.lingkupMateri)}</td>
			<td>${formatValue(row.tujuanPembelajaran)}</td>
			<td class="text-center">${row.hadir}/${row.sakit}/${row.izin}/${row.alfa}</td>
			<td>${formatValue(row.catatan)}</td>
		</tr>`
		)
		.join('');

	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${sharedStyles()}

@page {
	size: A4 landscape;
	margin: 15mm;
}

body {
	font-size: 10pt;
}

.header {
	text-align: center;
	margin-bottom: 12px;
}

.header h2 {
	font-size: 14pt;
	margin-bottom: 4px;
}

.header p {
	font-size: 10pt;
	margin: 2px 0;
	color: #444;
}

.filter-info {
	margin-bottom: 10px;
	font-size: 9pt;
	color: #555;
}

table {
	width: 100%;
	border-collapse: collapse;
	font-size: 9pt;
}

table, th, td {
	border: 1px solid #333;
}

th {
	background-color: #e0e0e0;
	font-weight: bold;
	text-align: center;
	padding: 5px 4px;
	font-size: 8.5pt;
}

td {
	padding: 4px;
	vertical-align: top;
}

tr.striped td {
	background-color: #f5f5f5;
}

.text-center {
	text-align: center;
}

.signature-section {
	margin-top: 24pt;
}

.signature-table {
	width: 100%;
	border-collapse: collapse;
	font-size: 10pt;
	border: none;
}

.signature-table td {
	padding: 2pt 6pt;
	vertical-align: top;
	text-align: center;
	border: none;
}

.signature-table .text-right {
	text-align: right;
}

.signature-table .font-bold {
	font-weight: bold;
}

.signature-table .underline {
	text-decoration: underline;
}

.signature-table .h-24 {
	height: 4rem;
}

.signature-table .h-4 {
	height: 1rem;
}
</style>
</head>
<body>
	<div class="header">
		<h2>JURNAL MENGAJAR</h2>
		<p><strong>${formatValue(data.sekolah.nama)}</strong></p>
		<p>Tahun Ajaran ${formatValue(data.periode.tahunPelajaran)} - Semester ${formatValue(data.periode.semester)}</p>
	</div>

	<div class="filter-info">
		<strong>Pendidik:</strong> ${formatValue(data.murid.nama)} &nbsp;&nbsp;
		<strong>Periode:</strong> ${formatValue(data.periode.tanggalMulai)} s.d. ${formatValue(data.periode.tanggalSelesai)}
	</div>

	<table>
		<thead>
			<tr>
				<th style="width: 8%;">Tanggal</th>
				<th style="width: 8%;">Kelas</th>
				<th style="width: 12%;">Mata Pelajaran</th>
				<th style="width: 6%;">Jam</th>
				<th style="width: 13%;">Materi</th>
				<th style="width: 22%;">Tujuan Pembelajaran</th>
				<th style="width: 10%;">Kehadiran (H/S/I/TK)</th>
				<th style="width: 21%;">Catatan</th>
			</tr>
		</thead>
		<tbody>
			${tableRows || '<tr><td colspan="8" class="text-center" style="padding:20px;">Tidak ada data jurnal mengajar</td></tr>'}
		</tbody>
	</table>

	<div class="signature-section">
		<table class="signature-table">
			<colgroup>
				<col style="width:50%">
				<col style="width:50%">
			</colgroup>
			<tbody style="page-break-inside: avoid;">
				<tr>
					<td class="font-bold">Mengetahui</td>
					<td class="text-center">${formatValue(data.ttd.tempat)}, ${formatValue(data.ttd.tanggal)}</td>
				</tr>
				<tr>
					<td>${data.kepalaSekolah.statusKepalaSekolah === 'plt' ? 'Plt. Kepala Sekolah' : 'Kepala Sekolah'}</td>
					<td>${formatValue(data.guruLabel)}</td>
				</tr>
				<tr>
					<td class="h-24"></td>
					<td class="h-24"></td>
				</tr>
				<tr>
					<td class="font-bold underline">${formatValue(data.kepalaSekolah.nama)}</td>
					<td class="font-bold underline">${formatValue(data.guru.nama)}</td>
				</tr>
				<tr>
					<td class="text-center">${data.kepalaSekolah.nip ?? ''}</td>
					<td class="text-center">${data.guru.nip ? `${data.guru.nip}` : ''}</td>
				</tr>
			</tbody>
		</table>
	</div>
</body>
</html>`;
}
