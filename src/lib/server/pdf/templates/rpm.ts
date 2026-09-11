import { sharedStyles } from './shared';

export interface RpmPrintData {
	sekolah: {
		nama: string;
	};
	kelasLabel: string;
	fase: string | null;
	karakteristik: string;
	lingkupMateri: string;
	profilLulusan: string[];
	capaianPembelajaran: string;
	lintasDisiplinIlmu: string;
	tujuanPembelajaran: string[];
	model: string;
	kemitraanPembelajaran: string;
	lingkunganPembelajaran: string;
	pemanfaatanDigital: string;
	kegiatanAwal: string;
	memahami: string;
	mengaplikasi: string;
	merefleksi: string;
	penutup: string;
	asesmen: string[];
	inputCustom: string;
}

function escNoBr(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function esc(value: string): string {
	return escNoBr(value ?? '').replace(/\n/g, '<br>');
}

/** Escape single-line value; used for short fields (labels, headers). */
function val(value: string): string {
	const v = (value ?? '').trim();
	if (!v) return '&nbsp;';
	return esc(v);
}

/**
 * Render text as HTML with automatic numbered-list detection.
 * - Text that consists of "N. " items becomes a real <ol> — the browser renders
 *   numbers itself and hangs wrapped continuation lines neatly under the text.
 * - Any other text is escaped with <br> newlines preserved.
 */
function contentHtml(value: string): string {
	const v = (value ?? '').trim();
	if (!v) return '&nbsp;';

	const blocks = v
		.split(/(?=\d+\.\s+)/)
		.map((s) => s.trim())
		.filter(Boolean);

	const isList = blocks.length > 0 && blocks.every((b) => /^\d+\.\s+\S/.test(b));
	if (!isList) return esc(v);

	const items = blocks.map((b) => b.replace(/^\d+\.\s+/, ''));
	return `<ol class="rp-list">${items.map((it) => `<li>${esc(it)}</li>`).join('')}</ol>`;
}

/** Force "Langkah:" onto its own line (blank line before, content after). */
function langkahify(value: string): string {
	return (value ?? '').trim().replace(/\s*Langkah:\s*/i, '\n\nLangkah:\n');
}

/** Empty-safe content block (escaped text or auto <ol>). */
function contentBlock(value: string): string {
	const v = (value ?? '').trim();
	return v ? contentHtml(v) : '&nbsp;';
}

/** Render several plain values as stacked lines. */
function lines(items: string[]): string {
	const arr = items.map((i) => (i ?? '').trim()).filter(Boolean);
	return arr.length ? arr.map(esc).join('<br>') : '&nbsp;';
}

/** Append the user's custom note (when present and enabled). */
function withCustom(inner: string, custom: string, enabled: boolean): string {
	const c = (custom ?? '').trim();
	return inner + (enabled && c ? `<div class="ct">${contentHtml(c)}</div>` : '');
}

function row(label: string, inner: string): string {
	return `<tr>
		<td class="lbl-cell">${esc(label)}</td>
		<td>${inner}</td>
	</tr>`;
}

/** One bordered section table — borders always close, no rowspan across breaks. */
function section(title: string, rows: string): string {
	return `<table class="pdf-table breakable">
		<tbody>
			<tr>
				<td colspan="2" class="section-title">${esc(title)}</td>
			</tr>
			${rows}
		</tbody>
	</table>`;
}

export function renderRpmHTML(data: RpmPrintData): string {
	const d = data;
	const faseText = d.fase ? ` Fase ${d.fase}` : '';
	const inCustom = d.inputCustom;

	const ident = section(
		'Identifikasi',
		row(
			'Peserta Didik:',
			`Siswa ${val(d.kelasLabel)}${faseText} dengan karakteristik ${val(d.karakteristik)}`
		) +
			row('Materi Pelajaran:', contentBlock(d.lingkupMateri)) +
			row('Dimensi Profil Lulusan:', lines(d.profilLulusan))
	);

	const desain = section(
		'Desain Pembelajaran',
		row('Capaian Pembelajaran:', contentBlock(d.capaianPembelajaran)) +
			row('Lintas Disiplin Ilmu:', withCustom(contentBlock(d.lintasDisiplinIlmu), inCustom, true)) +
			row('Tujuan Pembelajaran:', lines(d.tujuanPembelajaran)) +
			row('Topik Pembelajaran:', contentBlock(d.lingkupMateri)) +
			row(
				'Praktis Pedagogis (Model/Strategi):',
				withCustom(contentBlock(langkahify(d.model)), inCustom, true)
			) +
			row(
				'Kemitraan Pembelajaran:',
				withCustom(contentBlock(d.kemitraanPembelajaran), inCustom, true)
			) +
			row(
				'Lingkungan Pembelajaran:',
				withCustom(contentBlock(d.lingkunganPembelajaran), inCustom, true)
			) +
			row('Pemanfaatan Digital:', withCustom(contentBlock(d.pemanfaatanDigital), inCustom, true))
	);

	const pengalaman = section(
		'Pengalaman Belajar',
		row('Kegiatan Awal:', withCustom(contentBlock(d.kegiatanAwal), inCustom, true)) +
			row(
				'Memahami (Berkesadaran, Bermakna):',
				withCustom(contentBlock(d.memahami), inCustom, true)
			) +
			row(
				'Mengaplikasi (Bermakna, Menyenangkan):',
				withCustom(contentBlock(d.mengaplikasi), inCustom, true)
			) +
			row(
				'Merefleksi (Berkesadaran, Bermakna):',
				withCustom(contentBlock(d.merefleksi), inCustom, true)
			) +
			row('Penutup Bermakna, Menggembirakan:', withCustom(contentBlock(d.penutup), inCustom, true))
	);

	const asesmen = section(
		'Asesmen Pembelajaran',
		[0, 1, 2]
			.map((i) =>
				row(
					'Assessment for Learning:',
					withCustom(contentBlock(d.asesmen[i] ?? ''), inCustom, true)
				)
			)
			.join('')
	);

	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${sharedStyles()}

@page {
	size: A4 portrait;
	margin: 15mm;
}

body {
	font-size: 12pt;
	font-family: Helvetica, Arial, sans-serif;
	color: #000;
	line-height: 1.4;
	margin: 0;
	padding: 0;
}

.header {
	text-align: center;
	margin-bottom: 10px;
}

.header h2 {
	font-size: 12pt;
	margin-bottom: 4px;
	text-transform: uppercase;
}

.header p {
	font-size: 12pt;
	margin: 2px 0;
}

/* ── Bordered section tables (mirrors rapor .pdf-table) ── */
.pdf-table {
	width: 100%;
	margin-top: 10pt;
	/* Collapse: adjacent borders overlap into uniform 1px lines (no doubles).
	   Rows never split across pages (see tr rule) so breaks stay clean. */
	border-collapse: collapse;
}
.pdf-table td {
	border: 1px solid #000;
	padding: 5pt 8pt;
	vertical-align: top;
	text-align: left;
}
.pdf-table .section-title {
	font-weight: bold;
	text-align: center;
	/* Keep title with the first body row; never end a page on the title alone */
	page-break-after: avoid;
	break-after: avoid;
}

/* Page breaks happen BETWEEN rows, never inside a cell → borders stay intact */
.pdf-table tr {
	page-break-inside: avoid;
	break-inside: avoid;
}

.lbl-cell {
	font-weight: bold;
	width: 32%;
}

.ct {
	margin-top: 4px;
}

/* ── Auto-numbered list detection ── */
ol.rp-list {
	margin: 0;
	padding-left: 1.4em;
}
ol.rp-list li {
	margin-bottom: 0.25em;
	text-align: justify;
}
ol.rp-list li::marker {
	font-weight: bold;
}
</style>
</head>
<body>
	<div class="header">
		<h2>Rencana Pembelajaran Mendalam (RPM)</h2>
		<p><strong>${val(d.sekolah.nama)}</strong></p>
	</div>

	${ident}
	${desain}
	${pengalaman}
	${asesmen}
</body>
</html>`;
}
