import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sharedStyles, formatValue, formatUpper, FALLBACK } from './shared';

export interface PiagamPrintData {
	sekolah: {
		id?: number;
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
let bgCertificateDataUri: string | null = null;
let bgCertificate2DataUri: string | null = null;

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

function getCustomBgPath(sekolahId: number, template: '1' | '2'): string {
	return resolve('data', 'uploads', `sekolah-${sekolahId}-piagam-bg-${template}.png`);
}

function getBgCertificateDataUri(sekolahId?: number): string | null {
	if (sekolahId) {
		try {
			const buf = readFileSync(getCustomBgPath(sekolahId, '1'));
			return `data:image/png;base64,${buf.toString('base64')}`;
		} catch {
			// fall through
		}
	}
	if (bgCertificateDataUri) return bgCertificateDataUri;
	try {
		const buf = readFileSync(resolve('static/bg-certificate.png'));
		bgCertificateDataUri = `data:image/png;base64,${buf.toString('base64')}`;
	} catch {
		bgCertificateDataUri = null;
	}
	return bgCertificateDataUri;
}

function getBgCertificate2DataUri(sekolahId?: number): string | null {
	if (sekolahId) {
		try {
			const buf = readFileSync(getCustomBgPath(sekolahId, '2'));
			return `data:image/png;base64,${buf.toString('base64')}`;
		} catch {
			// fall through
		}
	}
	if (bgCertificate2DataUri) return bgCertificate2DataUri;
	try {
		const buf = readFileSync(resolve('static/bg-certificate2.png'));
		bgCertificate2DataUri = `data:image/png;base64,${buf.toString('base64')}`;
	} catch {
		bgCertificate2DataUri = null;
	}
	return bgCertificate2DataUri;
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

function piagamStyles(margin16mm = true): string {
	let fontCss = '';
	for (const [name, file, style, weight] of [
		['EB Garamond', 'EBGaramond.woff2', 'normal', '400 700'],
		['EB Garamond', 'EBGaramond-Italic.woff2', 'italic', '400 700'],
		['Playfair Display', 'PlayfairDisplay.woff2', 'normal', '400 700'],
		['Playfair Display', 'PlayfairDisplay-Italic.woff2', 'italic', '400 700']
	] as const) {
		try {
			const buf = readFileSync(resolve('static/fonts', file));
			const dataUri = `data:font/woff2;base64,${buf.toString('base64')}`;
			fontCss += `@font-face{font-family:'${name}';src:url('${dataUri}') format('woff2');font-weight:${weight};font-style:${style}}\n`;
		} catch {
			// font not available, fallback to system
		}
	}

	return `${fontCss}
@page {
	size: A4 landscape;
	margin: ${margin16mm ? '16mm' : '0'};
}

.piagam-page {
	display: flex;
	flex-direction: column;
	min-height: 100vh;
	${margin16mm ? '' : 'padding: 16mm;'}
}

.piagam-bg {
	position: fixed;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	z-index: -1;
	background-size: cover;
	background-position: center;
	background-repeat: no-repeat;
	opacity: 0.6;
}

.font-palatino {
	font-family: 'Playfair Display', 'Palatino Linotype', 'Book Antiqua', Palatino, 'Liberation Serif', serif;
}

.font-garamond {
	font-family: 'EB Garamond', 'Garamond', 'Liberation Serif', serif;
}

.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 2mm;
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
	margin: 1mm 0 2mm;
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
	padding: 0 20mm;
}

.footer-left {
	text-align: center;
}

.footer-right {
	text-align: center;
}

.footer-label {
	font-size: 12pt;
	margin-bottom: 18mm;
}

.footer-right .footer-label:first-child {
	margin-bottom: 2mm;
}

.kepala-status {
	font-size: 12pt;
	margin-bottom: 16mm;
}

.ttd-name {
	font-weight: bold;
	text-decoration: underline;
	font-size: 12pt;
	margin-bottom: 2mm;
}

.ttd-nip {
	font-size: 12pt;
}

.t2-header-row {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8mm;
	margin-bottom: 8mm;
}

.t2-school-name {
	font-size: 22pt;
	font-weight: bold;
	text-align: center;
	margin-bottom: 2mm;
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
	margin-bottom: 1mm;
}

.t2-title {
	font-size: 34pt;
	font-weight: bold;
	text-align: center;
}

.t2-murid-name {
	font-size: 24pt;
	font-weight: bold;
	font-style: italic;
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
	const sekolahId = data.sekolah.id;

	const achievementText = `Dengan total nilai rata-rata ${penghargaan.rataRataFormatted} pada ${periode.semester} tahun ajaran ${periode.tahunAjaran}.`;

	function footerHTML(): string {
		return `
	<div class="footer">
		<div class="footer-left">
			<div class="kepala-status">${ttd.kepalaSekolah.statusKepalaSekolah === 'plt' ? 'Plt. Kepala Sekolah' : 'Kepala Sekolah'}</div>
			<div class="ttd-name">${formatUpper(ttd.kepalaSekolah.nama)}</div>
			<div class="ttd-nip">${ttd.kepalaSekolah.nip ? `${ttd.kepalaSekolah.nip}` : ''}</div>
		</div>
		<div class="footer-right">
			<div class="footer-label">${ttd.tempat}, ${ttd.tanggal}</div>
			<div class="footer-label">Wali Kelas</div>
			<div class="ttd-name">${formatUpper(ttd.waliKelas.nama)}</div>
			<div class="ttd-nip">${ttd.waliKelas.nip ? `${ttd.waliKelas.nip}` : ''}</div>
		</div>
	</div>`;
	}

	if (template === '1') {
		const bgCert = getBgCertificateDataUri(sekolahId);

		return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>
${sharedStyles()}
${piagamStyles(!bgCert)}
</style>
</head>
<body class="font-palatino">
${bgCert ? `<div class="piagam-bg" style="background-image: url('${bgCert}')"></div>` : ''}
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

	const bgCert2 = getBgCertificate2DataUri(sekolahId);

	return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>
${sharedStyles()}
${piagamStyles(!bgCert2)}
</style>
</head>
<body class="font-garamond">
${bgCert2 ? `<div class="piagam-bg" style="background-image: url('${bgCert2}')"></div>` : ''}
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
