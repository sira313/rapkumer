import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sharedStyles, formatValue, formatUpper, FALLBACK } from './shared';

export interface PiagamPrintData {
	sekolah: {
		nama: string;
		jenjang: 'sd' | 'smp' | 'sma' | 'slb' | 'pkbm' | 'srt';
		npsn: string;
		alamat: {
			jalan: string;
			desa: string;
			kecamatan: string;
			kabupaten: string;
			provinsi?: string | null;
			kodePos?: string | null;
		};
		website?: string | null;
		email?: string | null;
		logoUrl?: string | null;
		logoDinasUrl?: string | null;
	};
	murid: { nama: string };
	penghargaan: {
		rataRata: number | null;
		rataRataFormatted: string;
		ranking: number | null;
		rankingLabel: string;
		judul: string;
		subjudul: string;
		motivasi: string;
	};
	periode: { semester: string; tahunAjaran: string };
	ttd: {
		tempat: string;
		tanggal: string;
		kepalaSekolah: { nama: string; nip?: string | null; statusKepalaSekolah?: string | null };
		waliKelas: { nama: string; nip?: string | null };
	};
}

let kumerLogoDataUri: string | null = null;

function getKumerLogoDataUri(): string | null {
	if (kumerLogoDataUri) return kumerLogoDataUri;
	try {
		const buf = readFileSync(resolve('static/logo-kumer.png'));
		kumerLogoDataUri = `data:image/png;base64,${buf.toString('base64')}`;
	} catch {
		kumerLogoDataUri = null;
	}
	return kumerLogoDataUri;
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

function piagamStyles(): string {
	return `
@page {
	size: A4 landscape;
	margin: 16mm;
}

.piagam-page {
	display: flex;
	flex-direction: column;
	min-height: 100vh;
}

.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 4mm;
}

.header-logo {
	width: 20mm;
	height: 20mm;
	object-fit: contain;
}

.header-center {
	flex: 1;
	text-align: center;
}

.header-text {
	font-weight: bold;
	font-size: 11pt;
}

.header-text-14 {
	font-weight: bold;
	font-size: 14pt;
}

.header-info {
	font-size: 9pt;
	font-style: italic;
}

.header-contact {
	font-size: 8pt;
	font-style: italic;
}

.double-line {
	border-top: 2px solid #000;
	border-bottom: 1px solid #000;
	height: 0;
	margin: 4mm 0;
}

.main-content {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 3mm;
}

.title-main {
	font-size: 26pt;
	font-weight: bold;
	text-transform: uppercase;
	text-align: center;
}

.title-sub {
	font-size: 14pt;
	text-align: center;
}

.murid-name {
	font-size: 21pt;
	font-weight: bold;
	text-transform: uppercase;
	text-align: center;
}

.ranking-label {
	font-size: 21pt;
	font-weight: bold;
	text-transform: uppercase;
	text-align: center;
}

.achievement-text {
	font-size: 13pt;
	text-align: center;
	max-width: 200mm;
}

.motivation-text {
	font-size: 13pt;
	font-style: italic;
	text-align: center;
	max-width: 200mm;
}

.sebagai-text {
	font-size: 14pt;
	text-align: center;
}

.footer {
	display: flex;
	justify-content: space-between;
	align-items: flex-end;
	margin-top: 8mm;
}

.footer-left {
	text-align: center;
}

.footer-right {
	text-align: center;
}

.footer-label {
	font-size: 11pt;
	margin-bottom: 4mm;
}

.ttd-name {
	font-weight: bold;
	text-decoration: underline;
	font-size: 12pt;
	margin-bottom: 2mm;
}

.ttd-nip {
	font-size: 10pt;
}

.t2-header-row {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8mm;
	margin-bottom: 4mm;
}

.t2-header-logo {
	height: 14mm;
	width: auto;
	object-fit: contain;
}

.t2-school-name {
	font-size: 22pt;
	font-weight: bold;
	text-align: center;
	margin-bottom: 6mm;
}

.t2-title {
	font-size: 28pt;
	font-weight: bold;
	font-family: 'Times New Roman', Times, serif;
	text-align: center;
}

.t2-murid-name {
	font-size: 24pt;
	font-weight: bold;
	font-style: italic;
	font-family: 'Times New Roman', Times, serif;
	text-align: center;
	text-transform: capitalize;
}

.t2-subtitle {
	font-size: 14pt;
	text-align: center;
}
`;
}

export function renderPiagamHTML(data: PiagamPrintData, template: '1' | '2'): string {
	const logoUrl = data.sekolah.logoUrl || null;
	const logoDinasUrl = data.sekolah.logoDinasUrl || null;
	const kumerLogo = getKumerLogoDataUri();

	const alamatParts = [
		data.sekolah.alamat.jalan,
		data.sekolah.alamat.desa,
		data.sekolah.alamat.kecamatan,
		data.sekolah.alamat.kabupaten
	].filter(Boolean);
	const alamatLine = alamatParts.join(', ');

	const contactParts: string[] = [];
	contactParts.push(`NPSN: ${data.sekolah.npsn}`);
	if (data.sekolah.website) contactParts.push(`Website: ${data.sekolah.website}`);
	if (data.sekolah.email) contactParts.push(`Email: ${data.sekolah.email}`);
	const contactLine = contactParts.join(' | ');

	const kabupatenUpper = formatUpper(data.sekolah.alamat.kabupaten);
	const kecamatanUpper = formatUpper(data.sekolah.alamat.kecamatan);

	const schoolHeading = `${getJenjangLabel(data.sekolah.jenjang)} ${formatUpper(data.sekolah.nama)}`;

	const penghargaan = data.penghargaan;
	const periode = data.periode;
	const ttd = data.ttd;

	const achievementText = `Dengan total nilai rata-rata ${penghargaan.rataRataFormatted} pada ${periode.semester} tahun ajaran ${periode.tahunAjaran}.`;

	function footerHTML(): string {
		return `
	<div class="footer">
		<div class="footer-left">
			<div class="footer-label">Mengetahui</div>
			<div class="ttd-name">${formatUpper(ttd.kepalaSekolah.nama)}</div>
			<div class="ttd-nip">${ttd.kepalaSekolah.nip ? `NIP. ${ttd.kepalaSekolah.nip}` : ''}</div>
		</div>
		<div class="footer-right">
			<div class="footer-label">${ttd.tempat}, ${ttd.tanggal}</div>
			<div class="footer-label">Wali Kelas</div>
			<div class="ttd-name">${formatUpper(ttd.waliKelas.nama)}</div>
			<div class="ttd-nip">${ttd.waliKelas.nip ? `NIP. ${ttd.waliKelas.nip}` : ''}</div>
		</div>
	</div>`;
	}

	if (template === '1') {
		return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>
${sharedStyles()}
${piagamStyles()}
</style>
</head>
<body>
<div class="piagam-page">
	<div class="header">
		${logoDinasUrl ? `<img src="${logoDinasUrl}" alt="" class="header-logo">` : '<div class="header-logo"></div>'}
		<div class="header-center">
			<div class="header-text">PEMERINTAH ${kabupatenUpper}</div>
			<div class="header-text">DINAS PENDIDIKAN DAN KEBUDAYAAN</div>
			${data.sekolah.alamat.kecamatan ? `<div class="header-text">KOORDINATOR WILAYAH ${kecamatanUpper}</div>` : ''}
			<div class="header-text-14">${schoolHeading}</div>
			${alamatLine ? `<div class="header-info">${alamatLine}</div>` : ''}
			${contactLine ? `<div class="header-contact">${contactLine}</div>` : ''}
		</div>
		${logoUrl ? `<img src="${logoUrl}" alt="" class="header-logo">` : '<div class="header-logo"></div>'}
	</div>

	<div class="double-line"></div>

	<div class="main-content">
		<div class="title-main">${formatUpper(penghargaan.judul)}</div>
		<div class="title-sub">${formatUpper(penghargaan.subjudul)}</div>
		<div class="murid-name">${formatUpper(data.murid.nama)}</div>
		<div class="sebagai-text">SEBAGAI</div>
		<div class="ranking-label">${formatUpper(penghargaan.rankingLabel)}</div>
		<p class="achievement-text">${achievementText}</p>
		<p class="motivation-text">${penghargaan.motivasi}</p>
	</div>

	${footerHTML()}
</div>
</body>
</html>`;
	}

	return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>
${sharedStyles()}
${piagamStyles()}
</style>
</head>
<body>
<div class="piagam-page">
	<div class="t2-header-row">
		${logoDinasUrl ? `<img src="${logoDinasUrl}" alt="" class="t2-header-logo">` : ''}
		${kumerLogo ? `<img src="${kumerLogo}" alt="" class="t2-header-logo">` : ''}
		${logoUrl ? `<img src="${logoUrl}" alt="" class="t2-header-logo">` : ''}
	</div>

	<div class="t2-school-name">${formatUpper(data.sekolah.nama)}</div>

	<div class="main-content">
		<div class="t2-title">${penghargaan.judul}</div>
		<div class="t2-subtitle">${penghargaan.subjudul}</div>
		<div class="t2-murid-name">${data.murid.nama}</div>
		<div class="sebagai-text">SEBAGAI</div>
		<div class="ranking-label">${formatUpper(penghargaan.rankingLabel)}</div>
		<p class="achievement-text">${achievementText}</p>
		<p class="motivation-text">${penghargaan.motivasi}</p>
	</div>

	${footerHTML()}
</div>
</body>
</html>`;
}
