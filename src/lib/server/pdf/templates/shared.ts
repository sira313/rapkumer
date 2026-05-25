export function sharedStyles(): string {
	return `
* {
	margin: 0;
	padding: 0;
	box-sizing: border-box;
}

@page {
	size: A4 portrait;
	margin: 20mm;
}

html, body {
	height: 100%;
}

body {
	font-family: Helvetica, Arial, sans-serif;
	font-size: 12pt;
	color: #000;
	line-height: 1.4;
}

.page-break {
	page-break-before: always;
}

.text-center { text-align: center; }
.text-left { text-align: left; }
.text-right { text-align: right; }

.font-bold { font-weight: bold; }
.font-normal { font-weight: normal; }
.uppercase { text-transform: uppercase; }

table {
	border-collapse: collapse;
	width: 100%;
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

export const FALLBACK = '\u2014';

export function formatValue(val: string | number | null | undefined): string {
	if (val === null || val === undefined || val === '') return FALLBACK;
	return String(val);
}

export function formatUpper(val: string | null | undefined): string {
	const f = formatValue(val);
	return f === FALLBACK ? f : f.toUpperCase();
}
