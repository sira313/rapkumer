import { sharedStyles, formatValue, formatUpper, getTutwuriBwDataUri } from './shared';

export interface RaporPrintData {
	sekolah: {
		nama: string;
		alamat: string;
		bgLogoSrc?: string | null;
		jenjangVariant?: string | null;
	};
	murid: {
		nama: string;
		nis: string;
		nisn: string;
	};
	rombel: {
		nama: string;
		fase: string;
	};
	periode: {
		tahunPelajaran: string;
		semester: string;
	};
	waliKelas: {
		nama: string;
		nip?: string | null;
	};
	kepalaSekolah: {
		nama: string;
		nip?: string | null;
		statusKepalaSekolah?: string | null;
	};
	nilaiIntrakurikuler: Array<{
		kelompok?: string | null;
		mataPelajaran: string;
		nilaiAkhir: string;
		deskripsi: string;
		jenis?: 'wajib' | 'pilihan' | 'mulok' | 'kejuruan';
	}>;
	kokurikuler: string;
	hasKokurikuler: boolean;
	ekstrakurikuler: Array<{
		nama: string;
		deskripsi: string;
	}>;
	ketidakhadiran: {
		sakit: number;
		izin: number;
		tanpaKeterangan: number;
	};
	catatanWali: string;
	tanggapanOrangTua: string;
	ttd: {
		tempat: string;
		tanggal: string;
	};

	tpMode?: 'compact' | 'full-desc';
	showBgLogo?: boolean;
}

export function renderRaporHTML(data: RaporPrintData): string {
	const bgLogoSrc = data.showBgLogo ? data.sekolah.bgLogoSrc || getTutwuriBwDataUri() : null;

	const isGenap =
		data.periode.semester.toLowerCase().includes('genap') || data.periode.semester.includes('2');
	const isGraduating =
		data.rombel.fase === 'Fase C' || data.rombel.fase === 'Fase D' || data.rombel.fase === 'Fase F';
	const { sakit, izin, tanpaKeterangan } = data.ketidakhadiran;

	const kelompokMap: Record<string, { items: typeof data.nilaiIntrakurikuler }> = {};
	for (const n of data.nilaiIntrakurikuler) {
		const jenis = n.jenis || 'wajib';
		if (!kelompokMap[jenis]) kelompokMap[jenis] = { items: [] };
		kelompokMap[jenis].items.push(n);
	}

	const isSMK = data.sekolah.jenjangVariant === 'SMK';
	const jenisLabels: Record<string, string> = {
		wajib: isSMK ? 'A. Mata Pelajaran Umum' : 'A. Mata Pelajaran Wajib',
		pilihan: 'B. Mata Pelajaran Pilihan',
		kejuruan: 'C. Mata Pelajaran Kejuruan',
		mulok: 'D. Muatan Lokal'
	};
	const jenisOrder = ['wajib', 'pilihan', 'kejuruan', 'mulok'];

	const identityRows = [
		['Nama Murid', formatUpper(data.murid.nama), 'Kelas', data.rombel.nama],
		[
			'NISN / NIS',
			`${formatValue(data.murid.nisn)} / ${formatValue(data.murid.nis)}`,
			'Fase',
			data.rombel.fase
		],
		['Sekolah', formatUpper(data.sekolah.nama), 'Semester', data.periode.semester],
		['Alamat', data.sekolah.alamat, 'Tahun Pelajaran', data.periode.tahunPelajaran]
	];

	const ortuCol = `<td style="width:50%;vertical-align:top;">
		<p class="signature-label">Orang Tua/Wali Murid</p>
		<div class="signature-space"></div>
	</td>`;

	const waliCol = `<td style="width:50%;vertical-align:top;">
		<p class="signature-label">Wali Kelas</p>
		<div class="signature-space"></div>
		<p class="name-underline">${data.waliKelas.nama}</p>
		${data.waliKelas.nip ? `<p class="nip-text">NIP. ${data.waliKelas.nip}</p>` : ''}
	</td>`;

	const kepalaStatus = data.kepalaSekolah.statusKepalaSekolah
		? data.kepalaSekolah.statusKepalaSekolah
		: 'Kepala Sekolah';

	const kepalaCol = `<td colspan="2" style="text-align:center;vertical-align:top;">
		<p class="signature-label">${kepalaStatus}</p>
		<div class="signature-space"></div>
		<p class="name-underline">${data.kepalaSekolah.nama}</p>
		${data.kepalaSekolah.nip ? `<p class="nip-text">NIP. ${data.kepalaSekolah.nip}</p>` : ''}
	</td>`;

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
	margin-bottom: 20mm;
	@bottom-left {
		content: "${data.rombel.nama} | ${data.murid.nama} | ${data.murid.nis}";
		font-size: 9pt;
		font-family: Helvetica, Arial, sans-serif;
		color: #555;
	}
	@bottom-right {
		content: "Halaman: " counter(page);
		font-size: 9pt;
		font-family: Helvetica, Arial, sans-serif;
		color: #555;
	}
}

body {
	font-family: Helvetica, Arial, sans-serif;
	font-size: 12pt;
	color: #000;
	line-height: 1.4;
	margin: 0;
	padding: 0;
}

.text-center { text-align: center; }
.font-bold { font-weight: bold; }

.header-title {
	font-size: 14pt;
	font-weight: bold;
	text-align: center;
	margin-bottom: 2pt;
}

.header-subtitle {
	font-size: 10pt;
	font-weight: normal;
	text-align: center;
	margin-bottom: 14pt;
}

.identity-table {
	border-collapse: collapse;
	width: 100%;
}

.identity-table td {
	padding: 3pt 4pt;
	vertical-align: top;
}

.identity-table .label {
	font-weight: bold;
	white-space: nowrap;
	width: 1%;
	vertical-align: top;
}

.identity-table .colon {
	width: 8pt;
	vertical-align: top;
}

.identity-table .value {
	width: calc(34% - 8pt);
	vertical-align: top;
}

.identity-table .sep {
	width: 2%;
}

.grid-table {
	border-collapse: collapse;
	width: 100%;
	margin-top: 12pt;
}

.grid-table th,
.grid-table td {
	border: 1px solid #000;
	padding: 4pt 6pt;
	vertical-align: top;
}

.grid-table th {
	background: #f0f0f0;
	font-weight: bold;
	text-align: center;
}

.grid-table tr.group-header td {
	border: 1px solid #000;
	font-weight: bold;
	font-size: 11pt;
	text-align: left;
	padding: 5pt 6pt;
}

thead { display: table-header-group; }

.narrative-text {
	text-align: justify;
	margin-top: 4pt;
	line-height: 1.5;
}

.single-section-table {
	border-collapse: collapse;
	width: 100%;
	margin-top: 12pt;
	page-break-inside: avoid;
}

.single-section-table .section-header {
	border: 1px solid #000;
	font-weight: bold;
	font-size: 12pt;
	text-align: center;
	padding: 6pt;
	background: #f0f0f0;
}

.single-section-table .section-body {
	border: 1px solid #000;
	padding: 8pt;
	text-align: justify;
	line-height: 1.5;
}

.combined-table {
	border-collapse: collapse;
	width: 100%;
	margin-top: 12pt;
	page-break-inside: avoid;
}

.combined-table th {
	border: 1px solid #000;
	padding: 3pt 6pt;
	font-weight: bold;
	background: #f0f0f0;
	text-align: center;
}

.combined-table td {
	border: 1px solid #000;
	padding: 3pt 6pt;
	text-align: center;
}

.combined-table .left-cell {
	text-align: left;
}

.combined-table .sep-col {
	border-top: none;
	border-bottom: none;
	width: 12pt;
	padding: 0;
	background: none;
}



.catatan-box {
	border: 1px solid #000;
	padding: 6pt;
	min-height: 70pt;
	font-size: 11pt;
}

.tanggapan-table {
	border-collapse: collapse;
	width: 100%;
	page-break-inside: avoid;
}

.tanggapan-table th {
	border: 1px solid #000;
	padding: 3pt 6pt;
	font-weight: bold;
	background: #f0f0f0;
	text-align: center;
}

.tanggapan-table td {
	border: 1px solid #000;
	padding: 3pt 6pt;
	text-align: left;
	vertical-align: top;
	height: 54pt;
}

.signature-section {
	margin-top: 24pt;
	width: 100%;
}

.signature-date {
	text-align: right;
	margin-bottom: 18pt;
}

.signature-table {
	width: 100%;
	border-collapse: collapse;
}

.signature-table td {
	vertical-align: top;
	padding: 0 4pt;
}

.signature-label {
	font-weight: bold;
	margin-bottom: 2pt;
}

.signature-space {
	height: 55pt;
	border-bottom: 1px dashed #999;
	margin-bottom: 6pt;
}

.name-underline {
	font-weight: bold;
	text-decoration: underline;
	margin-top: 2pt;
}

.nip-text {
	font-size: 11pt;
	margin-top: 1pt;
}

</style>
</head>
<body>

${bgLogoSrc ? `<img src="${bgLogoSrc}" alt="" class="watermark">` : ''}

<div class="header-title">LAPORAN HASIL BELAJAR</div>
<div class="header-subtitle">(RAPOR)</div>

<table class="identity-table">
${identityRows
	.map(
		(r) => `<tr>
		<td class="label">${r[0]}</td>
		<td class="colon">:</td>
		<td class="value">${r[1]}</td>
		<td class="sep"></td>
		<td class="label">${r[2]}</td>
		<td class="colon">:</td>
		<td class="value">${r[3]}</td>
	</tr>`
	)
	.join('\n')}
</table>

<table class="grid-table">
	<thead>
		<tr>
			<th style="width:6%;">No.</th>
			<th style="width:28%;">Mata Pelajaran</th>
			<th style="width:12%;">Nilai Akhir</th>
			<th style="width:54%;">Capaian Kompetensi</th>
		</tr>
	</thead>
	<tbody>
${jenisOrder
	.filter((j) => kelompokMap[j]?.items.length)
	.map((jenis) => {
		const group = kelompokMap[jenis];
		return `
		<tr class="group-header">
			<td colspan="4">${jenisLabels[jenis]}</td>
		</tr>
${group.items
	.map(
		(item, i) => `		<tr style="page-break-inside:avoid;">
			<td style="text-align:center;">${i + 1}</td>
			<td>${item.mataPelajaran}</td>
			<td style="text-align:center;">${formatValue(item.nilaiAkhir)}</td>
			<td>${formatValue(item.deskripsi)}</td>
		</tr>`
	)
	.join('\n')}`;
	})
	.join('\n')}
	</tbody>
</table>

${
	data.hasKokurikuler && data.kokurikuler
		? `
<table class="single-section-table">
	<tr><th class="section-header">Kokurikuler</th></tr>
	<tr><td class="section-body">${data.kokurikuler}</td></tr>
</table>
`
		: ''
}

${
	data.ekstrakurikuler?.length
		? `
<table class="grid-table">
	<thead>
		<tr>
			<th style="width:6%;">No.</th>
			<th style="width:30%;">Ekstrakurikuler</th>
			<th style="width:64%;">Keterangan</th>
		</tr>
	</thead>
	<tbody>
		${data.ekstrakurikuler
			.map(
				(e, i) => `
		<tr>
			<td style="text-align:center;">${i + 1}</td>
			<td>${e.nama}</td>
			<td>${formatValue(e.deskripsi)}</td>
		</tr>`
			)
			.join('\n')}
	</tbody>
</table>
`
		: ''
}

<table class="combined-table">
	<col style="width:auto;">
	<col style="width:auto;">
	<col style="width:12pt;">
	<col style="width:auto;">
	<tr>
		<th colspan="2" style="width:38%;">Ketidakhadiran</th>
		<th class="sep-col">&nbsp;</th>
		<th style="width:62%;">Catatan Wali Kelas</th>
	</tr>
	<tr>
		<td class="left-cell">Sakit</td>
		<td>${sakit} Hari</td>
		<td class="sep-col">&nbsp;</td>
		<td rowspan="3" style="text-align:left;vertical-align:top;">${formatValue(data.catatanWali)}</td>
	</tr>
	<tr>
		<td class="left-cell">Izin</td>
		<td>${izin} Hari</td>
		<td class="sep-col">&nbsp;</td>
	</tr>
	<tr>
		<td class="left-cell">Tanpa Keterangan</td>
		<td>${tanpaKeterangan} Hari</td>
		<td class="sep-col">&nbsp;</td>
	</tr>
</table>

${
	isGenap
		? `
<table class="combined-table">
	<col style="width:70%;">
	<col style="width:12pt;">
	<col style="width:calc(30% - 12pt);">
	<tr>
		<th>Tanggapan Orang Tua</th>
		<th class="sep-col">&nbsp;</th>
		<th>Keputusan</th>
	</tr>
	<tr>
		<td style="text-align:left;vertical-align:top;height:54pt;">${data.tanggapanOrangTua || ''}</td>
		<td class="sep-col">&nbsp;</td>
		<td style="text-align:left;vertical-align:top;padding:6pt;">
			<table style="width:100%;">
				<tr>
					<td style="text-align:left;border:none;padding:2pt 0;">${isGraduating ? 'Lulus' : 'Naik Kelas'}</td>
					<td style="text-align:right;border:none;padding:2pt 0;width:20pt;">☐</td>
				</tr>
				<tr>
					<td style="text-align:left;border:none;padding:2pt 0;">${isGraduating ? 'Tidak Lulus' : 'Tidak Naik Kelas'}</td>
					<td style="text-align:right;border:none;padding:2pt 0;width:20pt;">☐</td>
				</tr>
			</table>
		</td>
	</tr>
</table>
`
		: `
<table class="tanggapan-table" style="margin-top:12pt;">
	<tr><th>Tanggapan Orang Tua</th></tr>
	<tr><td>${data.tanggapanOrangTua || ''}</td></tr>
</table>
`
}

<div class="signature-section">
	<div class="signature-date">
		${data.ttd.tempat}, ${data.ttd.tanggal}
	</div>
	<table class="signature-table">
		<tr>
			${ortuCol}
			${waliCol}
		</tr>
		<tr>
			${kepalaCol}
		</tr>
	</table>
</div>

</body>
</html>`;
}
