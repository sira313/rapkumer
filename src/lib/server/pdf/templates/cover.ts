import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sharedStyles, formatValue, formatUpper, FALLBACK, getTutwuriBwDataUri } from './shared';
import { jenjangPendidikanSederajat, nauganHeaderByKey, type NauganKey } from '$lib/statics';

export interface CoverPrintData {
	sekolah: {
		nama: string;
		jenjang: 'sd' | 'smp' | 'sma' | 'slb' | 'pkbm' | 'srt';
		jenjangVariant?: string | null;
		npsn: string;
		naungan?: 'kemendikbud' | 'kemsos' | 'kemenag' | null;
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
		logoSrc?: string | null;
		logoDinasUrl?: string | null;
	};
	murid: {
		nama: string;
		nis?: string | null;
		nisn?: string | null;
	};
}

let tutwuriDataUri: string | null = null;

function getTutwuriDataUri(): string {
	if (tutwuriDataUri) return tutwuriDataUri;
	try {
		const buf = readFileSync(resolve('static/tutwuri.png'));
		tutwuriDataUri = `data:image/png;base64,${buf.toString('base64')}`;
	} catch {
		tutwuriDataUri = '';
	}
	return tutwuriDataUri;
}

function getSchoolJenjang(data: CoverPrintData): string | null {
	const raw = data.sekolah.jenjang;
	const variantKey = data.sekolah.jenjangVariant;
	if (!raw) return null;
	const key = raw as keyof typeof jenjangPendidikanSederajat;
	if (variantKey) {
		const variants = jenjangPendidikanSederajat[key] ?? [];
		const found = variants.find((v) => v.key === String(variantKey));
		if (found) return formatUpper(found.label);
	}
	const mapped = (jenjangPendidikanSederajat[key] ?? [])[0]?.label;
	return mapped ? formatUpper(mapped) : formatUpper(String(raw));
}

function coverStyles(): string {
	return `
.cover-page {
	display: flex;
	flex-direction: column;
	height: 100%;
	padding: 5mm 10mm;
}

.cover-section {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
}

.cover-section.top {
	justify-content: flex-start;
	padding-top: 5mm;
}

.cover-section.middle {
	justify-content: center;
}

.cover-section.bottom {
	justify-content: flex-end;
	padding-bottom: 5mm;
}

.cover-title {
	font-size: 22pt;
	font-weight: bold;
	text-align: center;
	letter-spacing: 2mm;
}

.cover-subtitle {
	font-size: 16pt;
	font-weight: bold;
	text-align: center;
}

.cover-school-name {
	font-size: 16pt;
	font-weight: bold;
	text-align: center;
	text-transform: uppercase;
}

.cover-logo {
	width: 55mm;
	height: 55mm;
	object-fit: contain;
}

.cover-label {
	font-size: 11pt;
	margin-bottom: 1mm;
}

.cover-value {
	border: 2px solid #000;
	padding: 3mm 8mm;
	font-size: 13pt;
	font-weight: bold;
	text-align: center;
	min-width: 120mm;
}

.cover-bottom-line {
	font-size: 14pt;
	font-weight: bold;
	text-align: center;
}

.biodata-page {
	min-height: 100vh;
	padding-top: 10mm;
}

.biodata-title {
	font-size: 18pt;
	font-weight: bold;
	text-align: center;
	letter-spacing: 2mm;
	margin-bottom: 4mm;
}

.biodata-subtitle {
	font-size: 14pt;
	font-weight: bold;
	text-align: center;
	margin-bottom: 2mm;
}

.biodata-jenjang {
	font-size: 14pt;
	text-align: center;
	margin-bottom: 8mm;
}

.biodata-table {
	width: 100%;
	max-width: 280mm;
	margin: 0 auto;
}

.biodata-table td {
	padding: 2mm 2mm;
	vertical-align: top;
	font-size: 12pt;
}

.biodata-table td.colon {
	width: 5mm;
	text-align: center;
	font-weight: bold;
}

.biodata-table td.label {
	font-weight: bold;
	white-space: nowrap;
	text-align: left;
}

.biodata-table td.value {
	text-align: left;
}
`;
}

export function renderCoverHTML(data: CoverPrintData): string {
	const bgLogoSrc = data.sekolah.logoSrc || getTutwuriBwDataUri();

	const naunganKey: NauganKey = data.sekolah.naungan ?? 'kemendikbud';
	const [header1, header2] = nauganHeaderByKey[naunganKey];

	const namaMurid = formatUpper(data.murid.nama);
	const nisn = data.murid.nisn ?? null;
	const nis = data.murid.nis ?? null;
	const nisnNis = [nisn, nis].filter(Boolean).join(' / ') || FALLBACK;

	const logoImgSrc = data.sekolah.logoSrc || getTutwuriDataUri();

	const jenjang = getSchoolJenjang(data);
	const alamat = data.sekolah.alamat;

	return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>
${sharedStyles()}
${coverStyles()}
</style>
</head>
<body>
<div class="cover-page">
	<div class="cover-section top">
		<div class="cover-title">LAPORAN</div>
		<div class="cover-subtitle">HASIL BELAJAR MURID</div>
		<div class="cover-school-name">${formatUpper(data.sekolah.nama)}</div>
	</div>

	<div class="cover-section middle">
		<img src="${logoImgSrc}" alt="Logo" class="cover-logo">
	</div>

	<div class="cover-section bottom" style="gap:3mm">
		<div style="text-align:center">
			<div style="font-size:13pt;margin-bottom:1mm">Nama Murid</div>
			<div style="border:2px solid #000;padding:3mm 8mm;font-size:13pt;font-weight:bold;text-align:center;min-width:120mm">${namaMurid}</div>
		</div>
		<div style="text-align:center">
			<div style="font-size:13pt;margin-bottom:1mm">NISN / NIS</div>
			<div style="border:2px solid #000;padding:3mm 8mm;font-size:13pt;font-weight:bold;text-align:center;min-width:120mm">${nisnNis}</div>
		</div>
		<div class="cover-bottom-line">${header1}</div>
		<div class="cover-bottom-line">${header2}</div>
	</div>
</div>

${bgLogoSrc ? `<img src="${bgLogoSrc}" alt="Watermark" class="watermark">` : ''}

<div class="page-break"></div>

<div class="biodata-page">
	<div class="biodata-title">LAPORAN</div>
	<div class="biodata-subtitle">HASIL BELAJAR MURID</div>
	${jenjang ? `<div class="biodata-jenjang">${jenjang}</div>` : ''}

	<table class="biodata-table">
		<tr>
			<td class="label">Nama Sekolah</td>
			<td class="colon">:</td>
			<td class="value">${formatUpper(data.sekolah.nama)}</td>
		</tr>
		<tr>
			<td class="label">NPSN</td>
			<td class="colon">:</td>
			<td class="value">${formatValue(data.sekolah.npsn)}</td>
		</tr>
		<tr>
			<td class="label">Alamat Sekolah</td>
			<td class="colon">:</td>
			<td class="value">${formatValue(alamat.jalan)}</td>
		</tr>
		<tr>
			<td class="label">Kode Pos</td>
			<td class="colon">:</td>
			<td class="value">${formatValue(alamat.kodePos)}</td>
		</tr>
		<tr>
			<td class="label">Desa / Kelurahan</td>
			<td class="colon">:</td>
			<td class="value">${formatValue(alamat.desa)}</td>
		</tr>
		<tr>
			<td class="label">Kecamatan</td>
			<td class="colon">:</td>
			<td class="value">${formatValue(alamat.kecamatan)}</td>
		</tr>
		<tr>
			<td class="label">Kabupaten / Kota</td>
			<td class="colon">:</td>
			<td class="value">${formatValue(alamat.kabupaten)}</td>
		</tr>
		<tr>
			<td class="label">Provinsi</td>
			<td class="colon">:</td>
			<td class="value">${formatValue(alamat.provinsi)}</td>
		</tr>
		<tr>
			<td class="label">Website</td>
			<td class="colon">:</td>
			<td class="value">${formatValue(data.sekolah.website)}</td>
		</tr>
		<tr>
			<td class="label">E-mail</td>
			<td class="colon">:</td>
			<td class="value">${formatValue(data.sekolah.email)}</td>
		</tr>
	</table>
</div>
</body>
</html>`;
}
