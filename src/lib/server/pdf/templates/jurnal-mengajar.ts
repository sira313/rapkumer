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
				<th style="width: 17%;">Materi</th>
				<th style="width: 22%;">Tujuan Pembelajaran</th>
				<th style="width: 10%;">Kehadiran (H/S/I/TK)</th>
				<th style="width: 17%;">Catatan</th>
			</tr>
		</thead>
		<tbody>
			${tableRows || '<tr><td colspan="8" class="text-center" style="padding:20px;">Tidak ada data jurnal mengajar</td></tr>'}
		</tbody>
	</table>

	<div style="margin-top: 20px; font-size: 9pt;">
		<p><em>Dicetak pada: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</em></p>
	</div>
</body>
</html>`;
}
