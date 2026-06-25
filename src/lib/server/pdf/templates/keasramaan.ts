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
	margin: 0;
	padding: 0;
}

/* Header */
.header-title {
	font-size: 12pt;
	font-weight: bold;
	text-align: center;
	margin-bottom: 2pt;
}

.header-subtitle {
	font-size: 10pt;
	text-align: center;
	margin-bottom: 8pt;
}

/* Identity grid — matches example grid-cols-[8rem_auto_1fr_8rem_auto_auto] gap-x-3 gap-y-2 */
.identity-grid {
	display: grid;
	grid-template-columns: 8rem auto 1fr 8rem auto auto;
	gap: 0.5rem 0.75rem;
	font-size: 10pt;
	margin-bottom: 12pt;
	line-height: 1.4;
}

.identity-grid .label {
	font-weight: bold;
	white-space: nowrap;
}

/* ---- Main table — matches example table.table.border.rounded-none.border-base-content ---- */
.main-table {
	width: 100%;
	border-collapse: collapse;
	font-size: 10pt;
	margin-bottom: 12pt;
}

.main-table thead {
	display: table-header-group;
}

.main-table th,
.main-table td {
	border: 1px solid #000;
	padding: 4pt 6pt;
}

.main-table th {
	font-weight: bold;
	text-align: center;
	background: #f0f0f0;
}

.main-table td {
	vertical-align: top;
	text-align: left;
}

.main-table td.text-center {
	text-align: center;
}

/* Every paragraph inside description breaks independently */
.main-table .deskripsi-paragraf {
	page-break-inside: avoid;
	text-align: justify;
}

.main-table .deskripsi-paragraf + .deskripsi-paragraf {
	margin-top: 4pt;
}

/* Category header row */
.main-table tr.category-header td {
	font-weight: 600;
}

/* ---- Kehadiran table — matches example table.table.border.border-base-content.rounded-none ---- */
.kehadiran-wrapper {
	page-break-inside: avoid;
	margin-bottom: 12pt;
}

.kehadiran-table {
	width: 100%;
	border-collapse: collapse;
	font-size: 10pt;
}

.kehadiran-table th,
.kehadiran-table td {
	border: 1px solid #000;
	padding: 4pt 8pt;
}

.kehadiran-table th {
	font-weight: bold;
	text-align: center;
	background: #f0f0f0;
}

.kehadiran-table td.text-center {
	text-align: center;
}

/* ---- Signature section — matches example table.w-full ---- */
.signature-section {
	margin-top: 12pt;
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

.signature-table .text-center {
	text-align: center;
}

.signature-table .font-bold {
	font-weight: bold;
}

.signature-table .underline {
	text-decoration: underline;
}

.signature-table .h-24 {
	height: 6rem;
}

.signature-table .h-4 {
	height: 1rem;
}

/* ---- Watermark ---- */
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

	function renderRow(row: (typeof data.keasramaanRows)[0]): string {
		const hasDeskripsi = !!row.deskripsi;
		const deskripsiHtml = hasDeskripsi
			? row.deskripsi
					.split('\n')
					.filter(Boolean)
					.map((p) => `<div class="deskripsi-paragraf">${formatValue(p)}</div>`)
					.join('\n')
			: FALLBACK;

		return `<tr>
			<td class="text-center">${row.no}</td>
			<td>${formatValue(row.indikator)}</td>
			<td class="text-center">${hasDeskripsi ? predikatToHuruf(row.predikat) : FALLBACK}</td>
			<td>${deskripsiHtml}</td>
		</tr>`;
	}

	const rows = data.keasramaanRows;
	let tableBody = '';
	let i = 0;
	while (i < rows.length) {
		if (rows[i].kategoriHeader) {
			const headerRow = `<tr class="category-header">
				<td colspan="4">${rows[i].kategoriHeader}</td>
			</tr>`;
			i++;
			if (i < rows.length && !rows[i].kategoriHeader) {
				tableBody += `<tbody style="page-break-inside: avoid;">${headerRow}\n${renderRow(rows[i])}</tbody>`;
				i++;
				while (i < rows.length && !rows[i].kategoriHeader) {
					tableBody += `<tbody>${renderRow(rows[i])}</tbody>`;
					i++;
				}
			} else {
				tableBody += `<tbody>${headerRow}</tbody>`;
			}
		} else {
			tableBody += `<tbody>${renderRow(rows[i])}</tbody>`;
			i++;
		}
	}

	const tableHeader = `
		<tr>
			<th style="width:6%;">No</th>
			<th style="width:28%;">Indikator</th>
			<th style="width:12%;">Predikat</th>
			<th style="width:54%;">Deskripsi</th>
		</tr>`;

	const kehadiranSection = data.kehadiran
		? `
<div class="kehadiran-wrapper">
<table class="kehadiran-table">
	<thead>
		<tr>
			<th colspan="2">Ketidakhadiran</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td>Sakit</td>
			<td class="text-center">${data.kehadiran.sakit} Hari</td>
		</tr>
		<tr>
			<td>Izin</td>
			<td class="text-center">${data.kehadiran.izin} Hari</td>
		</tr>
		<tr>
			<td>Tanpa Keterangan</td>
			<td class="text-center">${data.kehadiran.alfa} Hari</td>
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
	const kepalaSekolahNip = data.kepalaSekolah?.nip ? `${formatValue(data.kepalaSekolah.nip)}` : '';

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
		font-size: 10pt;
		font-family: Helvetica, Arial, sans-serif;
		color: #555;
		vertical-align: center;
	}
	@bottom-right {
		content: "Halaman: " counter(page) " / " counter(pages);
		font-size: 10pt;
		font-family: Helvetica, Arial, sans-serif;
		color: #555;
		vertical-align: center;
	}
}

${keasramaanStyles()}
</style>
</head>
<body>

${logoUrl ? `<img src="${logoUrl}" alt="Watermark" class="watermark">` : ''}

<div class="header-title">LAPORAN KEGIATAN KEASRAMAAN</div>
<div class="header-subtitle">(RAPOR)</div>

<div class="identity-grid">
	<div class="label">Nama Murid</div>
	<div>:</div>
	<div class="uppercase">${formatUpper(data.murid.nama)}</div>
	<div class="label">Kelas</div>
	<div>:</div>
	<div>${formatValue(data.rombel.nama)}</div>

	<div class="label">NIS / NISN</div>
	<div>:</div>
	<div>${formatValue(data.murid.nis)} / ${formatValue(data.murid.nisn)}</div>
	<div class="label">Fase</div>
	<div>:</div>
	<div>${faseLabel}</div>

	<div class="label">Sekolah</div>
	<div>:</div>
	<div class="uppercase">${formatUpper(data.sekolah.nama)}</div>
	<div class="label">Semester</div>
	<div>:</div>
	<div>${formatValue(semesterLabel)}</div>

	<div class="label">Alamat</div>
	<div>:</div>
	<div>${formatValue(data.sekolah.alamat)}</div>
	<div class="label">Tahun Ajaran</div>
	<div>:</div>
	<div>${data.periode.tahunAjaran}</div>
</div>

<table class="main-table">
	<thead>
		${tableHeader}
	</thead>
${tableBody}
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
			<td class="text-center">${ttdText}</td>
		</tr>
		<tr>
			<td class="font-bold">${waliAsramaLabel}</td>
			<td class="font-bold">${waliAsuhLabel}</td>
		</tr>
		<tr>
			<td class="h-24"></td>
			<td></td>
		</tr>
		<tr>
			<td class="font-bold underline">${waliAsramaName}</td>
			<td class="font-bold underline">${waliAsuhName}</td>
		</tr>
		<tr>
			<td class="text-center">${waliAsramaNip}</td>
			<td class="text-center">${waliAsuhNip}</td>
		</tr>
		<tr>
			<td class="h-4"></td>
			<td></td>
		</tr>
	</tbody>
	<tbody style="page-break-inside: avoid;">
		<tr>
			<td class="font-bold">Orang Tua / Wali Murid</td>
			<td class="font-bold">${kepalaSekolahLabel}</td>
		</tr>
		<tr>
			<td class="h-24"></td>
			<td></td>
		</tr>
		<tr>
			<td class="text-center">____________________</td>
			<td class="font-bold underline">${kepalaSekolahNama}</td>
		</tr>
		<tr>
			<td></td>
			<td class="text-center">${kepalaSekolahNip}</td>
		</tr>
	</tbody>
</table>
</div>

</body>
</html>`;
}
