import { sharedStyles, formatUpper, formatValue, escHtml } from './shared';
import { getKopSuratLines } from '$lib/statics';
import { kopSuratDataUri } from '$lib/server/kop-surat';

export interface SppdPrintData {
	sekolah: {
		id: number;
		nama: string;
		jenjang: string;
		jenjangVariant?: string | null;
		naungan?: 'kemendikbud' | 'kemsos' | 'kemenag' | null;
		npsn: string;
		alamat: {
			jalan: string;
			desa: string;
			kecamatan: string;
			kabupaten: string;
			provinsi?: string | null;
		};
		website?: string | null;
		email?: string | null;
		logoUrl?: string | null;
		logoDinasUrl?: string | null;
	};
	surat: {
		nomor: string;
		tanggal: string;
		dasar: string;
		maksud: string;
		alatAngkut: string;
		tempatBerangkat: string;
		tempatTujuan: string;
		lamanya: string;
		tanggalBerangkat: string;
		tanggalKembali: string;
		keteranganPengikut: string;
		kodeRekening: string;
		keteranganLain: string;
	};
	pegawai: Array<{
		nama: string;
		pangkat: string;
		golongan: string;
		nip: string;
		jabatan: string;
		tingkatBiaya: string;
	}>;
	pengikut: Array<{
		nama: string;
		tempatLahir: string;
		tanggalLahir: string;
	}>;
	ttd: {
		tempat: string;
		tanggal: string;
		statusKepalaSekolah: string;
		nama: string;
		nip: string;
	};
}

function getJenjangLabel(jenjang: string | null): string {
	switch (jenjang) {
		case 'sd':
			return 'SEKOLAH DASAR';
		case 'smp':
			return 'SEKOLAH MENENGAH PERTAMA';
		case 'sma':
			return 'SEKOLAH MENENGAH ATAS';
		default:
			return 'SEKOLAH';
	}
}

function schoolHeading(jenjang: string | null, nama: string): string {
	const label = getJenjangLabel(jenjang);
	const upper = formatUpper(nama);
	const words = label.split(' ').slice(1).join(' ');
	return words && upper.includes(words) ? upper : `${label} ${upper}`;
}

function sppdStyles(): string {
	return `
@page {
	size: A4 portrait;
	margin: 10mm;
}

body {
	font-family: Helvetica, Arial, sans-serif;
	font-size: 9pt;
	color: #000;
	line-height: 1.45;
}

.page {
	page-break-inside: avoid;
}

.page-break {
	page-break-before: always;
}

/* ── KOP surat (mirror piagam template 1) ── */
.kop {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 2mm;
}

.kop-image {
	width: 100%;
	display: block;
	margin-bottom: 4mm;
}

.kop-logo {
	width: 20mm;
	height: 20mm;
	object-fit: contain;
}

.kop-center {
	flex: 1;
	text-align: center;
}

.kop-text {
	font-weight: bold;
	font-size: 11pt;
}

.kop-sekolah {
	font-weight: bold;
	font-size: 14pt;
}

.kop-info {
	font-size: 9pt;
	font-style: italic;
}

.kop-contact {
	font-size: 8pt;
	font-style: italic;
}

.double-line {
	border-top: 2px solid #000;
	border-bottom: 1px solid #000;
	height: 0;
	margin: 1mm 0 4mm;
}

/* ── titles ── */
.title {
	text-align: center;
	font-weight: bold;
	font-size: 15pt;
	margin: 3mm 0 1mm;
}

.title-underline {
	text-align: center;
	font-weight: bold;
	font-size: 15pt;
	text-decoration: underline;
	margin: 2mm 0 4mm;
	clear: both;
}

.subtitle {
	text-align: center;
	font-weight: bold;
	margin-bottom: 5mm;
}

/* ── plain (borderless) tables ── */
table.plain {
	width: 100%;
	border-collapse: collapse;
}

table.plain th,
table.plain td {
	padding: 1.2mm 1mm;
	vertical-align: top;
	text-align: left;
}

table.plain td.lbl {
	font-weight: bold;
}

table.plain th.lbl {
	font-weight: bold;
	text-align: left;
}

table.plain .colon {
	width: 8mm;
	text-align: center;
}

table.plain.right {
	width: auto;
	float: right;
	margin-left: 6mm;
}

/* ── bordered tables ── */
table.bordered {
	width: 100%;
	border-collapse: collapse;
}

table.bordered,
table.bordered th,
table.bordered td {
	border: 1px solid #000;
}

table.bordered th,
table.bordered td {
	padding: 1.2mm 1.5mm;
	vertical-align: top;
	font-size: 9pt;
	text-align: left;
}

table.bordered .num {
	text-align: center;
	font-weight: bold;
	width: 8mm;
}

/* ── signature (right side) ── */
.ttd-right {
	float: right;
	text-align: center;
	margin-top: 8mm;
}

.ttd-right .ttd-role {
	margin-top: 1mm;
}

.ttd-right .ttd-sekolah {
	margin-bottom: 1mm;
}

.ttd-right .ttd-space {
	height: 20mm;
}

.ttd-right .ttd-nama {
	font-weight: bold;
	text-decoration: underline;
}

.ttd-page3 {
	margin-top: 8mm;
	float: right;
	text-align: center;
}

.ttd-page3 .ttd-space {
	height: 14mm;
}

.ttd-page3 .ttd-nama {
	font-weight: bold;
	text-decoration: underline;
}

/* ── page 3 columns ── */
table.page3-table {
	font-size: 7pt;
	line-height: 1.1;
}

table.page3-table td {
	font-size: 9pt;
	line-height: 1.1;
	padding: 0.6mm 1.2mm;
	position: relative;
}

table.page3-table .cell-sig {
	position: absolute;
	left: 1.2mm;
	right: 1.2mm;
	bottom: 0.8mm;
}

table.page3-table .p3lbl {
	display: inline-block;
	width: 27mm;
}

table.page3-table .p3val {
	display: inline-block;
	max-width: calc(100% - 35mm);
	vertical-align: top;
}

table.page3-table .sig-gap {
	height: 14mm;
}

.page3-col-num {
	width: 10mm;
	text-align: center;
}

.page3-cell {
	width: 50%;
}
`;
}

export function renderSppdHTML(data: SppdPrintData): string {
	const sekolah = data.sekolah;
	const surat = data.surat;
	const ttd = data.ttd;

	const logoDinas = sekolah.logoDinasUrl || null;
	const logo = sekolah.logoUrl || null;

	const alamatParts = [
		sekolah.alamat.jalan,
		sekolah.alamat.desa,
		sekolah.alamat.kecamatan,
		sekolah.alamat.kabupaten
	].filter(Boolean);
	const alamatLine = escHtml(alamatParts.join(', '));

	const contactParts: string[] = [];
	contactParts.push(`NPSN: ${sekolah.npsn}`);
	if (sekolah.website) contactParts.push(`Website: ${sekolah.website}`);
	if (sekolah.email) contactParts.push(`Email: ${sekolah.email}`);
	const contactLine = escHtml(contactParts.join(' | '));

	const schoolHeadingText = escHtml(schoolHeading(sekolah.jenjang, sekolah.nama));

	const kopLines = getKopSuratLines({
		jenjangVariant: sekolah.jenjangVariant,
		naungan: sekolah.naungan,
		kabupaten: sekolah.alamat.kabupaten,
		provinsi: sekolah.alamat.provinsi
	}).map((line) => escHtml(line));

	const kepalaLabel = ttd.statusKepalaSekolah === 'plt' ? 'Plt. Kepala' : 'Kepala';
	const kepalaLabelSekolah =
		ttd.statusKepalaSekolah === 'plt' ? 'Plt. Kepala Sekolah' : 'Kepala Sekolah';

	const pegawai = data.pegawai ?? [];
	const pengikut = data.pengikut ?? [];

	const customKop = kopSuratDataUri(sekolah.id, 'portrait');
	const kopHTML = customKop
		? `<img src="${customKop}" alt="" class="kop-image">`
		: `
<div class="kop">
	${logoDinas ? `<img src="${logoDinas}" alt="" class="kop-logo">` : '<div class="kop-logo"></div>'}
	<div class="kop-center">
		${kopLines.map((line) => `<div class="kop-text">${line}</div>`).join('')}
		<div class="kop-sekolah">${schoolHeadingText}</div>
		${alamatLine ? `<div class="kop-info">${alamatLine}</div>` : ''}
		${contactLine ? `<div class="kop-contact">${contactLine}</div>` : ''}
	</div>
	${logo ? `<img src="${logo}" alt="" class="kop-logo">` : '<div class="kop-logo"></div>'}
</div>
<div class="double-line"></div>`;

	// Page 1 — Surat Tugas
	const tugasRows = pegawai
		.map(
			(p, i) => `
		<tr>
			<td>${i === 0 ? 'Kepada' : ''}</td>
			<td class="colon">:</td>
			<td>Nama</td>
			<td class="colon">:</td>
			<td>${formatValue(p.nama)}</td>
		</tr>
		<tr>
			<td></td>
			<td></td>
			<td>Pangkat/gol</td>
			<td class="colon">:</td>
			<td>${[p.pangkat, p.golongan].filter(Boolean).join(' / ') || '—'}</td>
		</tr>
		<tr>
			<td></td>
			<td></td>
			<td>NIP</td>
			<td class="colon">:</td>
			<td>${formatValue(p.nip)}</td>
		</tr>
		<tr>
			<td></td>
			<td></td>
			<td>Jabatan</td>
			<td class="colon">:</td>
			<td>${formatValue(p.jabatan)}</td>
		</tr>`
		)
		.join('');

	const page1 = `
<div class="page">
	${kopHTML}

	<div class="title">SURAT TUGAS</div>
	<div class="subtitle">NOMOR: ${formatValue(surat.nomor)}</div>

	<table class="plain">
		<tbody>
			<tr>
				<th style="width: 35mm;">Dasar</th>
				<th class="colon">:</th>
				<td colspan="3">${formatValue(surat.dasar)}</td>
			</tr>
			<tr>
				<td colspan="5" style="font-weight: bold; text-align: center;">Memerintahkan:</td>
			</tr>
			${tugasRows}
			<tr>
				<td>Untuk</td>
				<td class="colon">:</td>
				<td colspan="3">${formatValue(surat.maksud)}</td>
			</tr>
		</tbody>
	</table>

	<div class="ttd-right">
		<div>${formatValue(ttd.tempat)}, ${formatValue(ttd.tanggal)}</div>
		<div class="ttd-role">${kepalaLabelSekolah}</div>
		<div class="ttd-sekolah">${formatValue(sekolah.nama)}</div>
		<div class="ttd-space"></div>
		<div class="ttd-nama">${formatValue(ttd.nama)}</div>
		<div class="ttd-nip">${formatValue(ttd.nip)}</div>
	</div>
</div>`;

	// Page 2 — Surat Perintah Perjalanan Dinas
	const namaNipRows = pegawai
		.map(
			(p, i) => `${i + 1}. ${formatValue(p.nama)}<br>&nbsp;&nbsp;&nbsp;&nbsp;${formatValue(p.nip)}`
		)
		.join('<br>');

	const pangkatJabatanRows = pegawai
		.map(
			(p, i) =>
				`${i + 1}. a. ${[p.pangkat, p.jabatan, p.golongan].filter(Boolean).join(' / ') || '—'}<br>&nbsp;&nbsp;&nbsp;&nbsp;b. ${p.tingkatBiaya ? p.tingkatBiaya : '—'}`
		)
		.join('<br>');

	const pengikutNamaRows = pengikut.map((p, i) => `${i + 1}. ${formatValue(p.nama)}`).join('<br>');
	const pengikutLahirRows = pengikut
		.map((p, i) => `${i + 1}. ${formatValue(p.tempatLahir)}, ${formatValue(p.tanggalLahir)}`)
		.join('<br>');

	const page2 = `
<div class="page">
	${kopHTML}

	<table class="plain right">
		<tbody>
			<tr><th style="text-align: left;">Lembar Ke</th><th class="colon">:</th><td>1</td></tr>
			<tr><td>Kode No.</td><td class="colon">:</td><td>${formatValue(surat.kodeRekening)}</td></tr>
			<tr><td>Nomor</td><td class="colon">:</td><td>${formatValue(surat.nomor)}</td></tr>
		</tbody>
	</table>

	<div class="title-underline">SURAT PERINTAH PERJALANAN DINAS</div>

	<table class="bordered">
		<tbody>
			<tr>
				<td class="num">1</td>
				<td colspan="2">Pejabat yang memberi perintah</td>
				<td colspan="2">${kepalaLabel} ${formatUpper(sekolah.nama)}</td>
			</tr>
			<tr>
				<td class="num">2</td>
				<td colspan="2">Nama NIP yang melaksanakan perjalanan dinas</td>
				<td colspan="2">${namaNipRows || '—'}</td>
			</tr>
			<tr>
				<td class="num">3</td>
				<td colspan="2">a. Pangkat/jabatan/golongan<br>b. Tingkat biaya perjalanan dinas</td>
				<td colspan="2">${pangkatJabatanRows || '—'}</td>
			</tr>
			<tr>
				<td class="num">4</td>
				<td colspan="2">Maksud perjalanan dinas</td>
				<td colspan="2">${formatValue(surat.maksud)}</td>
			</tr>
			<tr>
				<td class="num">5</td>
				<td colspan="2">Alat angkut yang digunakan</td>
				<td colspan="2">${formatValue(surat.alatAngkut)}</td>
			</tr>
			<tr>
				<td class="num">6</td>
				<td colspan="2">a. Tempat berangkat<br>b. Tempat tujuan</td>
				<td colspan="2">a. ${formatValue(surat.tempatBerangkat)}<br>b. ${formatValue(surat.tempatTujuan)}</td>
			</tr>
			<tr>
				<td class="num">7</td>
				<td colspan="2">a. Lamanya Perjalanan Dinas<br>b. Tanggal berangkat<br>c. Tanggal harus kembali/tiba di tempat baru *)</td>
				<td colspan="2">a. ${formatValue(surat.lamanya)}<br>b. ${formatValue(surat.tanggalBerangkat)}<br>c. ${formatValue(surat.tanggalKembali)}</td>
			</tr>
			<tr>
				<td class="num">8</td>
				<td colspan="2">Pengikut: Nama</td>
				<td>Tanggal Lahir</td>
				<td>Keterangan</td>
			</tr>
			<tr>
				<td></td>
				<td colspan="2">${pengikutNamaRows || '—'}</td>
				<td>${pengikutLahirRows || '—'}</td>
				<td>${formatValue(surat.keteranganPengikut)}</td>
			</tr>
			<tr>
				<td class="num">9</td>
				<td colspan="2">Pembebanan Anggaran<br>a. Instansi<br>b. Akun/Kode rekening</td>
				<td colspan="2"><br>a. ${formatValue(sekolah.nama)}<br>b. ${formatValue(surat.kodeRekening)}</td>
			</tr>
			<tr>
				<td class="num">10</td>
				<td colspan="2">Keterangan lain-lain</td>
				<td colspan="2">${formatValue(surat.keteranganLain)}</td>
			</tr>
		</tbody>
	</table>

	<div class="ttd-right">
		<div>Dikeluarkan di ${formatValue(ttd.tempat)}</div>
		<div>Tanggal ${formatValue(ttd.tanggal)}</div>
		<div class="ttd-role">${kepalaLabelSekolah}</div>
		<div class="ttd-sekolah">${formatValue(sekolah.nama)}</div>
		<div class="ttd-space"></div>
		<div class="ttd-nama">${formatValue(ttd.nama)}</div>
		<div class="ttd-nip">${formatValue(ttd.nip)}</div>
	</div>
</div>`;

	// Page 3 — Berangkat / tiba log
	const berangkatTiba = `
	<tr>
		<td class="page3-col-num">II</td>
		<td class="page3-cell"><span class="p3lbl">Tiba</span> : <span class="p3val">${formatValue(surat.tempatTujuan)}</span><br><span class="p3lbl">Pada tanggal</span> : <span class="p3val">${formatValue(surat.tanggalBerangkat)}</span><br>......<br><br><br><br><br><div class="cell-sig">.......................................<br>NIP</div></td>
		<td class="page3-cell"><span class="p3lbl">Berangkat dari</span> : <span class="p3val">${formatValue(surat.tempatTujuan)}</span><br><span class="p3lbl">Ke</span> : <span class="p3val">........................</span><br><span class="p3lbl">Pada tanggal</span> : <span class="p3val">........................</span><br>......<br><br><br><br><br><div class="cell-sig">...........................................<br>NIP</div></td>
	</tr>
	<tr>
		<td class="page3-col-num">III</td>
		<td class="page3-cell"><span class="p3lbl">Tiba</span> : <span class="p3val">.........................</span><br><span class="p3lbl">Pada tanggal</span> : <span class="p3val">.........................</span><br>......<br><br><br><br><br><div class="cell-sig">.......................................<br>NIP</div></td>
		<td class="page3-cell"><span class="p3lbl">Berangkat dari</span> : <span class="p3val">........................</span><br><span class="p3lbl">Ke</span> : <span class="p3val">........................</span><br><span class="p3lbl">Pada tanggal</span> : <span class="p3val">........................</span><br>......<br><br><br><br><br><div class="cell-sig">...........................................<br>NIP</div></td>
	</tr>
	<tr>
		<td class="page3-col-num">IV</td>
		<td class="page3-cell"><span class="p3lbl">Tiba</span> : <span class="p3val">.........................</span><br><span class="p3lbl">Pada tanggal</span> : <span class="p3val">.........................</span><br>......<br><br><br><br><br><div class="cell-sig">.......................................<br>NIP</div></td>
		<td class="page3-cell"><span class="p3lbl">Berangkat dari</span> : <span class="p3val">........................</span><br><span class="p3lbl">Ke</span> : <span class="p3val">........................</span><br><span class="p3lbl">Pada tanggal</span> : <span class="p3val">........................</span><br>......<br><br><br><br><br><div class="cell-sig">...........................................<br>NIP</div></td>
	</tr>
	<tr>
		<td class="page3-col-num">V</td>
		<td class="page3-cell"><span class="p3lbl">Tiba</span> : <span class="p3val">.........................</span><br><span class="p3lbl">Pada tanggal</span> : <span class="p3val">.........................</span><br>......<br><br><br><br><br><div class="cell-sig">.......................................<br>NIP</div></td>
		<td class="page3-cell"><span class="p3lbl">Berangkat dari</span> : <span class="p3val">........................</span><br><span class="p3lbl">Ke</span> : <span class="p3val">........................</span><br><span class="p3lbl">Pada tanggal</span> : <span class="p3val">........................</span><br>......<br><br><br><br><br><div class="cell-sig">...........................................<br>NIP</div></td>
	</tr>
	<tr>
		<td class="page3-col-num">VI</td>
		<td class="page3-cell"><span class="p3lbl">Tiba</span> : <span class="p3val">${formatValue(sekolah.nama)}</span><br><span class="p3lbl">Pada tanggal</span> : <span class="p3val">.......................</span><br>${kepalaLabelSekolah}<br>${formatValue(sekolah.nama)}<br><div class="sig-gap"></div>${formatValue(ttd.nama)}<br>${formatValue(ttd.nip)}</td>
		<td class="page3-cell"><span class="p3lbl">Berangkat dari</span> : <span class="p3val">........................</span><br><span class="p3lbl">Ke</span> : <span class="p3val">........................</span><br><span class="p3lbl">Pada tanggal</span> : <span class="p3val">........................</span><br>......<br><br><br><br><br><br><div class="cell-sig">...........................................<br>NIP</div></td>
	</tr>`;

	const page3 = `
<div class="page">
	<table class="bordered page3-table">
		<tbody>
			<tr>
				<td></td>
				<td class="page3-cell"></td>
				<td class="page3-cell">I. <span class="p3lbl">Berangkat dari</span> : <span class="p3val">${formatValue(sekolah.nama)}</span><br>&nbsp;&nbsp;&nbsp;&nbsp;(Tempat Kedudukan)<br>&nbsp;&nbsp;&nbsp;&nbsp;<span class="p3lbl">Ke</span> : <span class="p3val">${formatValue(surat.tempatTujuan)}</span><br>&nbsp;&nbsp;&nbsp;&nbsp;<span class="p3lbl">Pada Tanggal</span> : <span class="p3val">${formatValue(surat.tanggalBerangkat)}</span><br>&nbsp;&nbsp;&nbsp;&nbsp;${kepalaLabelSekolah}<br>&nbsp;&nbsp;&nbsp;&nbsp;${formatValue(sekolah.nama)}<br><div class="sig-gap"></div>&nbsp;&nbsp;&nbsp;&nbsp;${formatValue(ttd.nama)}<br>&nbsp;&nbsp;&nbsp;&nbsp;${formatValue(ttd.nip)}</td>
			</tr>
			${berangkatTiba}
			<tr>
				<td class="page3-col-num">VII</td>
				<td colspan="2">Catatan Lain-lain</td>
			</tr>
			<tr>
				<td class="page3-col-num">VIII</td>
				<td colspan="2">PERHATIAN:<br>Pejabat yang berwenang yang menerbitkan SPD, pejabat/pegawai/pihak lain yang melakukan perjalanan dinas, para pejabat yang mengesahkan tanggal berangkat/tiba, serta bendahara pengeluaran bertanggung jawab berdasarkan peraturan-peraturan Keuangan Negara apabila negara menderita rugi akibat kesalahan, kelalaian, dan kealpaannya.</td>
			</tr>
		</tbody>
	</table>

	<div class="ttd-page3">
		<div>${kepalaLabelSekolah}</div>
		<div>${formatValue(sekolah.nama)}</div>
		<div class="ttd-space"></div>
		<div class="ttd-nama">${formatValue(ttd.nama)}</div>
		<div class="ttd-nip">${formatValue(ttd.nip)}</div>
	</div>
</div>`;

	return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>
${sharedStyles()}
${sppdStyles()}
</style>
</head>
<body>
${page1}
<div class="page-break"></div>
${page2}
<div class="page-break"></div>
${page3}
</body>
</html>`;
}
