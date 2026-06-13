import { sharedStyles, formatValue, formatUpper } from './shared';

export interface KartuMuridData {
	murid: {
		nama: string;
		nis: string;
		nisn: string;
	};
	sekolah: {
		nama: string;
		logo?: string | null;
	};
	qrDataUri: string;
}

function cardFront(m: KartuMuridData): string {
	return `<div class="kr-card">
	<div class="kr-front-inner">
		<div class="kr-qr-wrap">
			<img src="${m.qrDataUri}" alt="QR" class="kr-qr" />
		</div>
		<div class="kr-right">
			<div class="kr-divider"></div>
			<div class="kr-info">
				<span class="kr-nama">${formatUpper(m.murid.nama)}</span>
				<span class="kr-sekolah">${formatValue(m.sekolah.nama)}</span>
				<span class="kr-nis">${formatValue(m.murid.nisn)} / ${formatValue(m.murid.nis)}</span>
			</div>
		</div>
	</div>
</div>`;
}

function cardBack(m: KartuMuridData): string {
	const logo = m.sekolah.logo;
	return `<div class="kr-card">
	<div class="kr-back-inner">
		${logo ? `<img src="${logo}" alt="logo" class="kr-logo" />` : ''}
		<span class="kr-back-nama">${formatUpper(m.sekolah.nama)}</span>
	</div>
</div>`;
}

function cardRow(m: KartuMuridData): string {
	return `<div class="kr-row">
	${cardFront(m)}
	${cardBack(m)}
</div>`;
}

const cardStyles = `
.kr-row {
	display: flex;
	gap: 12px;
	align-items: center;
	justify-content: center;
}

.kr-card {
	width: 85.6mm;
	height: 53.98mm;
	border: 1px solid #d1d5db;
	border-radius: 8px;
	background: #fff;
	box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
	overflow: hidden;
	flex-shrink: 0;
}

.kr-front-inner {
	display: flex;
	gap: 8px;
	height: 100%;
	padding: 16px;
}

.kr-qr-wrap {
	display: flex;
	align-items: center;
	justify-content: center;
	align-self: center;
}

.kr-right {
	display: flex;
	gap: 8px;
	flex: 1;
	align-self: center;
}

.kr-qr {
	width: 26mm;
	aspect-ratio: 1 / 1;
	object-fit: contain;
	border: 2px solid #000;
	border-radius: 8px;
}

.kr-divider {
	width: 1px;
	background: #dc2626;
	align-self: stretch;
}

.kr-info {
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: flex-start;
	font-size: 6px;
	line-height: 1.25;
}

.kr-nama {
	font-weight: bold;
	font-size: 14px;
	color: #dc2626;
	line-height: 1.25;
}

.kr-sekolah {
	font-size: 10px;
	margin-top: 4px;
	line-height: 1.25;
}

.kr-nis {
	font-size: 9px;
	margin-top: 16px;
	line-height: 1.25;
}

.kr-back-inner {
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
	height: 100%;
	padding: 16px;
	gap: 4px;
}

.kr-logo {
	width: 20mm;
	object-fit: contain;
}

.kr-back-nama {
	font-size: 12px;
	font-weight: bold;
	text-align: center;
	line-height: 1.25;
}
`;

function pageLayoutStyles(marginY: string, marginX: string): string {
	return `
@page {
	size: A4 portrait;
	margin: ${marginY} ${marginX};
}
`;
}

export function renderKartuMuridHTML(data: KartuMuridData): string {
	return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>
${sharedStyles()}
${cardStyles}
${pageLayoutStyles('15mm', '15mm')}

body {
	font-family: Helvetica, Arial, sans-serif;
	font-size: 12pt;
	color: #000;
	display: flex;
	justify-content: center;
	align-items: center;
	min-height: 100%;
}

.page-break {
	page-break-before: always;
}
</style>
</head>
<body>
	${cardRow(data)}
</body>
</html>`;
}

export function renderKartuMuridBulkHTML(dataArray: KartuMuridData[]): string {
	const rows = dataArray.map((m) => cardRow(m)).join(`\n`);
	return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>
${sharedStyles()}
${cardStyles}
${pageLayoutStyles('12mm', '15mm')}

body {
	font-family: Helvetica, Arial, sans-serif;
	font-size: 12pt;
	color: #000;
}

.kr-grid {
	display: flex;
	flex-direction: column;
	gap: 4mm;
	align-items: center;
}

.page-break {
	page-break-before: always;
}
</style>
</head>
<body>
	<div class="kr-grid">
		${rows}
	</div>
</body>
</html>`;
}
