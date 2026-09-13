import { sharedStyles } from './shared';
import type { AsesmenLampiran, RubrikRow } from '$lib/server/ai-lampiran';

export interface LampiranPrintData {
	sekolah: { nama: string };
	mapelNama: string;
	kelasLabel: string;
	penyusun: string;
	formatif: AsesmenLampiran;
	sumatif: AsesmenLampiran;
	lkpd: string;
}

function escNoBr(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function val(value: string): string {
	const v = (value ?? '').trim();
	return v ? escNoBr(v) : '&nbsp;';
}

function cssContent(value: string): string {
	return (value ?? '').replace(/["\\\n\r]/g, '').trim();
}

/** Sel tabel (kosong → &nbsp;). */
function cell(value: string): string {
	const v = (value ?? '').trim();
	return v ? escNoBr(v) : '&nbsp;';
}

function renderTable(block: string[]): string {
	const rows = block.map((l) =>
		l
			.replace(/^\s*\|/, '')
			.replace(/\|\s*$/, '')
			.split('|')
			.map((c) => c.trim())
	);
	if (!rows.length) return '';
	// Buang baris pemisah markdown "---|---" bila tersisa.
	const isSepRow = (r: string[]): boolean =>
		r.length > 0 && r.every((c) => /^\s*:?-+:?\s*$/.test(c));
	if (rows[1] && isSepRow(rows[1])) rows.splice(1, 1);
	const clean = rows.filter((r) => !isSepRow(r));
	if (!clean.length) return '';
	const colCount = Math.max(1, ...clean.map((r) => r.length));
	const fmt = (r: string[]): string => {
		const cells = r.slice(0, colCount);
		while (cells.length < colCount) cells.push('');
		return `<tr>${cells.map((c) => `<td>${cell(c)}</td>`).join('')}</tr>`;
	};
	// Baris pertama = judul kolom (prompt melarang pemisah "---"). Bila baris
	// pertama kosong (bukan header), semua baris menjadi isi tanpa <thead>.
	const head = clean[0];
	const body = clean.slice(1);
	if (!head.some((c) => c)) {
		return `<table class="data">${clean.map(fmt).join('')}</table>`;
	}
	const headCells = head.slice(0, colCount);
	return `<table class="data"><thead><tr>${headCells.map((c) => `<th>${cell(c)}</th>`).join('')}</tr></thead><tbody>${body.map(fmt).join('')}</tbody></table>`;
}

/**
 * Render isi sebagai HTML terstruktur (A→1→a):
 * - baris "1. ..." → <ol> angka (decimal)
 * - baris "a. ..." (setelah item angka) → <ol> huruf (lower-alpha) bertingkat
 * - baris "| a | b |" → tabel data (baris kedua "---|---" jadi pembatas header)
 * - baris lain → <p>
 */
function isLkpdHeading(line: string): boolean {
	const s = line.replace(/\s+/g, ' ').trim();
	if (!s) return false;
	if (/^Langkah\s+\d+\s*:/i.test(s)) return true;
	if (/^(LEMBAR KERJA PESERTA DIDIK|LEMBAR KERJA MURID)[\s(]/i.test(s)) return true;
	if (/^[A-Z0-9&()'"\-—–]+$/.test(s) && s.length <= 80 && /^[A-Z]/.test(s)) return true;
	return /^(Topik|Judul|Petunjuk Pengerjaan|Langkah-Langkah Kegiatan|Nama Kelompok|Nama\b|No\.?Absen|Anggota|Identitas|Materi|Kelas|Waktu|Materi Pokok|Tujuan)\s*:/i.test(
		s
	);
}

function contentHtml(value: string, boldHeads = false): string {
	const v = (value ?? '').trim();
	if (!v) return '';
	const lines = v
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
		.flatMap((l) =>
			l
				.split(/(?=\d{1,3}\.\s|\s{2,}[A-Za-z]\.\s)/)
				.map((s) => s.trim())
				.filter(Boolean)
		);
	const out: string[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (line.startsWith('|')) {
			const block: string[] = [];
			while (i < lines.length && lines[i].startsWith('|')) block.push(lines[i++]);
			out.push(renderTable(block));
			continue;
		}
		if (/^\d{1,3}\.?\s+\S/.test(line) || /^\d{1,3}\)/.test(line)) {
			const items: Array<{ text: string; children: string[]; follows: string[] }> = [];
			while (i < lines.length) {
				const l = lines[i];
				const m = l.match(/^\d{1,3}[.)]?\s+(.*)$/);
				if (m) {
					items.push({ text: m[1].trim(), children: [], follows: [] });
					i++;
					continue;
				}
				const sm = l.match(/^([a-zA-Z])\.\s+(.*)$/);
				if (sm && items.length) {
					items[items.length - 1].children.push(sm[2].trim());
					i++;
					continue;
				}
				if (l.startsWith('|')) break;
				if (items.length) {
					// Lanjutan item: baris isi (mis. "Jawaban:", garis isian, kalimat
					// sambung) → ikut menjorok sejajar nomor. Label subjudul (mis.
					// "Petunjuk Pengerjaan:", "Langkah 1:", "Tahap 2:") → keluar daftar,
					// rata kiri seperti header.
					const isFollowLabel = /^(Jawaban|Kesimpulan|Alasan|Skor|Catatan):\s*$/i.test(l);
					const isLabelOnly = /^[A-Za-z&' ]+:\s*$/.test(l);
					const isStepHeading = /^Langkah\s+\d|^Tahap\s+\d/i.test(l);
					if ((!isLabelOnly && !isStepHeading) || isFollowLabel) {
						items[items.length - 1].follows.push(l);
						i++;
						continue;
					}
					break;
				}
				break;
			}
			out.push(
				`<ol class="num">${items
					.map(
						(it) =>
							`<li>${escNoBr(it.text)}${
								it.follows.length ? `${it.follows.map((f) => `<p>${escNoBr(f)}</p>`).join('')}` : ''
							}${
								it.children.length
									? `<ol class="stp">${it.children.map((c) => `<li>${escNoBr(c)}</li>`).join('')}</ol>`
									: ''
							}</li>`
					)
					.join('')}</ol>`
			);
			continue;
		}
		out.push(
			boldHeads && isLkpdHeading(line)
				? `<p class="lkpd-head">${escNoBr(line)}</p>`
				: `<p>${escNoBr(line)}</p>`
		);
		i++;
	}
	return out.join('');
}

function contentBlock(value: string): string {
	const v = (value ?? '').trim();
	return v ? contentHtml(v) : '&nbsp;';
}

/** Paksa label uraian (Teknik & Instrumen, Aspek yang Dinilai, dst.) ke baris sendiri.
 *  Label lain (Topik:, Nama Kelompok:, Langkah 1: ...) dibiarkan inline seperti aslinya. */
function labelBreakHtml(value: string, boldHeads = false): string {
	const v = (value ?? '').trim();
	if (!v) return '&nbsp;';
	const broken = v
		.replace(
			/(Teknik & Instrumen|Teknik & Instrument|Aspek yang Dinilai|Prinsip Assessment|Prinsip Asesmen|Waktu Pelaksanaan|Indikator Pencapaian|Indikator Ketercapaian):\s*/g,
			'\n$1:\n'
		)
		.replace(/\n{2,}/g, '\n')
		.trim();
	return contentHtml(broken, boldHeads);
}

function sectionHead(letter: string, title: string): string {
	return `<h2 class="sec-title">${escNoBr(letter)}. ${escNoBr(title)}</h2>`;
}

function fldWrap(nodes: string): string {
	return `<ol class="fld">${nodes}</ol>`;
}

function fieldItem(label: string, body: string): string {
	return `<li><h3 class="fld-name">${escNoBr(label)}</h3>${body}</li>`;
}

function rubrikTable(rows: RubrikRow[]): string {
	const clean = rows.map((r) => ({
		aspek: (r.aspek ?? '').trim(),
		indikator: (r.indikator ?? '').trim(),
		skor: (r.skor ?? '').trim(),
		kriteria: (r.kriteria ?? '').trim()
	}));
	if (!clean.length) return '';
	const header =
		'<thead><tr><th class="no">No</th><th>Aspek</th><th>Indikator</th><th class="skor">Skor</th><th>Kriteria</th></tr></thead>';
	const body = clean
		.map((r, i) => {
			const cells =
				r.indikator || r.skor || r.kriteria
					? `<td>${escNoBr(r.aspek)}</td><td>${escNoBr(r.indikator)}</td><td class="skor">${escNoBr(r.skor)}</td><td>${escNoBr(r.kriteria)}</td>`
					: `<td colspan="4">${escNoBr(r.aspek)}</td>`;
			return `<tr><td class="no">${i + 1}</td>${cells}</tr>`;
		})
		.join('');
	return `<table class="rubrik">${header}<tbody>${body}</tbody></table>`;
}

function asesmenItem(ases: AsesmenLampiran): string {
	const a = ases ?? { uraian: '', instrumen: '', rubrik: [] };
	const parts: string[] = [];
	if ((a.uraian ?? '').trim())
		parts.push(fieldItem('Uraian Teknik & Pelaksanaan', labelBreakHtml(a.uraian)));
	if ((a.instrumen ?? '').trim())
		parts.push(fieldItem('Instrumen Asesmen', contentBlock(a.instrumen)));
	const rows = (a.rubrik ?? []).filter(
		(r) => (r.aspek ?? '').trim() || (r.kriteria ?? '').trim() || (r.indikator ?? '').trim()
	);
	if (rows.length) {
		parts.push(`<li><h3 class="fld-name">Rubrik Penilaian</h3>${rubrikTable(rows)}</li>`);
	}
	return parts.join('');
}

export function renderLampiranHTML(data: LampiranPrintData): string {
	const d = data;
	const lkpdBody = d.lkpd.trim() ? labelBreakHtml(d.lkpd, true) : '&nbsp;';
	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${sharedStyles()}

@page {
	size: A4 portrait;
	margin: 15mm;
	@bottom-left {
		content: "Lampiran RPM - ${cssContent(d.mapelNama)} | ${cssContent(d.kelasLabel)}";
		font-size: 9pt;
		font-family: Helvetica, Arial, sans-serif;
		color: #555;
		vertical-align: center;
	}
	@bottom-right {
		content: "Halaman: " counter(page) " / " counter(pages);
		font-size: 9pt;
		font-family: Helvetica, Arial, sans-serif;
		color: #555;
		vertical-align: center;
	}
}

body {
	font-size: 11pt;
	font-family: Helvetica, Arial, sans-serif;
	color: #000;
	line-height: 1.4;
	margin: 0;
	padding: 0;
}

.header {
	text-align: center;
	margin-bottom: 14px;
}
.header h1 {
	font-size: 14pt;
	font-weight: bold;
	margin: 0 0 4px;
	text-transform: uppercase;
}
.header .meta {
	width: auto;
	margin: 4px auto 0 0;
	border-collapse: collapse;
}
.header .meta td {
	border: 0;
	padding: 1pt 0;
	text-align: left;
	font-size: 11pt;
}
.header .meta td.k {
	width: 120pt;
}
.header .meta td.c {
	width: 10pt;
	padding: 0;
	text-align: center;
}

h2.sec-title {
	font-size: 12pt;
	font-weight: bold;
	margin: 14pt 0 4pt;
	page-break-after: avoid;
	break-after: avoid;
}

ol.fld {
	margin: 4pt 0 4pt 1.6em;
	padding: 0;
	list-style: decimal;
}
ol.fld > li {
	margin: 0 0 8pt;
}
ol.fld > li::marker {
	font-weight: bold;
}
.fld-name {
	font-size: 11pt;
	font-weight: bold;
	margin: 0 0 2pt;
}

ol.num {
	margin: 2pt 0 2pt 1.2em;
	padding-left: 1em;
}
ol.num > li {
	margin: 0.15em 0;
	text-align: justify;
	page-break-inside: avoid;
	break-inside: avoid;
}
ol.stp {
	margin: 2pt 0 0 1.4em;
	padding: 0;
	list-style: lower-alpha;
}
ol.stp li {
	margin: 0.15em 0;
	text-align: justify;
	page-break-inside: avoid;
	break-inside: avoid;
}

p {
	margin: 2pt 0;
	text-align: justify;
}
p.lkpd-head {
	font-weight: bold;
}

table.rubrik,
table.data {
	width: 100%;
	border-collapse: collapse;
	margin: 2pt 0 4pt;
}
table.rubrik th,
table.rubrik td,
table.data th,
table.data td {
	border: 0.5pt solid #000;
	padding: 2pt 4pt;
	font-size: 11pt;
	text-align: left;
	vertical-align: top;
}
table.rubrik thead th,
table.data thead th {
	font-weight: bold;
	background: #f0f0f0;
	page-break-after: avoid;
}
table.rubrik td.no {
	width: 4%;
	text-align: center;
}
table.rubrik td.skor {
	width: 8%;
	text-align: center;
}
table.rubrik tbody tr {
	page-break-inside: avoid;
}

.lkpd-page {
	page-break-before: always;
	break-before: page;
}
</style>
</head>
<body>
	<div class="header">
		<h1>Lampiran Rencana Pembelajaran Mendalam</h1>
		<table class="meta">
			<tbody>
				<tr>
					<td class="k">Sekolah</td>
					<td class="c">:</td>
					<td>${val(d.sekolah.nama)}</td>
				</tr>
				<tr>
					<td class="k">Kelas</td>
					<td class="c">:</td>
					<td>${val(d.kelasLabel)}</td>
				</tr>
				<tr>
					<td class="k">Mata Pelajaran</td>
					<td class="c">:</td>
					<td>${val(d.mapelNama)}</td>
				</tr>
				<tr>
					<td class="k">Penyusun</td>
					<td class="c">:</td>
					<td>${val(d.penyusun)}</td>
				</tr>
			</tbody>
		</table>
	</div>

	${sectionHead('A', 'Penilaian Formatif')}
	${fldWrap(asesmenItem(d.formatif) || fieldItem('Penilaian Formatif dan Rubrik', '&nbsp;'))}
	${sectionHead('B', 'Penilaian Sumatif')}
	${fldWrap(asesmenItem(d.sumatif) || fieldItem('Penilaian Sumatif dan Rubrik', '&nbsp;'))}

	<div class="lkpd-page">
		${sectionHead('C', 'Lembar Kerja Murid')}
		${fldWrap(fieldItem('Lembar Kerja Murid (LKPD)', lkpdBody))}
	</div>
</body>
</html>`;
}
