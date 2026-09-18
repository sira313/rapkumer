import { sharedStyles } from './shared';
import type { SintaksBlock } from '$lib/server/ai-rpm';

export interface RpmPrintData {
	sekolah: {
		nama: string;
	};
	mapelNama: string;
	kelasLabel: string;
	fase: string | null;
	lingkupMateri: string;
	profilLulusan: string[];
	capaianPembelajaran: string;
	pengetahuanAwal: string;
	minat: string;
	latarBelakang: string;
	kebutuhanBelajar: string;
	lintasDisiplinIlmu: string;
	tujuanPembelajaran: string[];
	praktikPedagogis: string;
	kemitraanPembelajaran: string;
	lingkunganPembelajaran: string;
	pemanfaatanDigital: string;
	kegiatanAwal: string;
	inti: SintaksBlock[];
	penutup: string;
	asesmen: string[];
	penyusun: string;
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

function cssContent(value: string): string {
	return (value ?? '').replace(/["\\\n\r]/g, '').trim();
}

function val(value: string): string {
	const v = (value ?? '').trim();
	if (!v) return '&nbsp;';
	return esc(v);
}

function contentHtml(value: string): string {
	const v = (value ?? '').trim();
	if (!v) return '&nbsp;';

	const blocks = v
		.split(/(?=\d+\.\s+)/)
		.map((s) => s.trim())
		.filter(Boolean);

	const isList = blocks.length > 0 && blocks.every((b) => /^\d+\.\s+\S/.test(b));
	if (!isList) {
		return v
			.split('\n')
			.map((p) => p.trim())
			.filter(Boolean)
			.map((p) => `<p>${escNoBr(p)}</p>`)
			.join('');
	}

	const items = blocks.map((b) => b.replace(/^\d+\.\s+/, ''));
	return `<ol class="rp-list">${items.map((it) => `<li>${esc(it)}</li>`).join('')}</ol>`;
}

function langkahify(value: string): string {
	return (value ?? '').trim().replace(/\s*Langkah:\s*/i, '\nLangkah:\n');
}

function asesmenHtml(value: string): string {
	const v = (value ?? '').trim();
	if (!v) return '&nbsp;';
	const formatted = v
		.replace(/\s*(?=(?:Teknik & Instrumen|Aspek yang Dinilai|Prinsip Assessment):)/gi, '\n')
		.replace(/\n{2,}/g, '\n')
		.trim();
	return contentHtml(formatted);
}

function langkahItems(value: string): string[] {
	const v = (value ?? '').trim();
	if (!v) return [];
	return v
		.split(/(?=\d+\.\s+)/)
		.map((s) => s.trim())
		.filter(Boolean)
		.map((seg) =>
			seg
				.replace(/^\d+\.\s+/, '')
				.replace(/\s+/g, ' ')
				.trim()
		)
		.filter(Boolean);
}

function contentBlock(value: string): string {
	const v = (value ?? '').trim();
	return v ? contentHtml(v) : '&nbsp;';
}

function letterList(value: string): string {
	const items = langkahItems(value);
	return items.length
		? `<ol class="stp">${items.map((it) => `<li>${esc(it)}</li>`).join('')}</ol>`
		: '&nbsp;';
}

function tpList(items: string[]): string {
	const arr = items.map((i) => (i ?? '').trim()).filter(Boolean);
	return arr.length
		? `<ol class="stp">${arr.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`
		: '&nbsp;';
}

function commaItems(items: string[]): string {
	const arr = items.map((i) => (i ?? '').trim()).filter(Boolean);
	if (!arr.length) return '&nbsp;';
	if (arr.length === 1) return esc(arr[0]);
	if (arr.length === 2) return esc(`${arr[0]} dan ${arr[1]}`);
	return esc(`${arr.slice(0, -1).join(', ')}, dan ${arr[arr.length - 1]}`);
}

function sectionHead(letter: string, title: string): string {
	return `<h2 class="sec-title">${esc(letter)}. ${esc(title)}</h2>`;
}

function fldWrap(nodes: string): string {
	return `<ol class="fld">${nodes}</ol>`;
}

function fieldItem(label: string, body: string): string {
	return `<li><h3 class="fld-name">${esc(label)}</h3>${body}</li>`;
}

function stepsItem(label: string, items: string[]): string {
	const steps = items.map((it) => `<li>${esc(it)}</li>`).join('');
	return `<li><h3 class="fld-name">${esc(label)}</h3><ol class="stp">${steps}</ol></li>`;
}

/** Sub-field (a., b., c.) untuk bagian yang punya anak — mis. "Murid". */
function subWrap(nodes: string): string {
	return `<ol class="sbf">${nodes}</ol>`;
}

function subItem(label: string, body: string): string {
	return `<li><h4 class="sub-name">${esc(label)}</h4>${body}</li>`;
}

/** Sintaks model pada bagian Inti — sub-bagian (a., b., c.) dengan langkah. */
function sintaksItem(idx: number, block: SintaksBlock): string {
	const tahap =
		block.tahap && block.tahap.trim()
			? block.tahap.trim()
			: `Sintaks model pembelajaran ${idx + 1}`;
	return subItem(tahap, contentBlock(block.langkah));
}

/**
 * Penutup: baris pembuka berlabel "Prinsip Pembelajaran:" (tanpa nomor) menjadi
 * paragraf biasa, sisanya (langkah bernomor) jadi daftar a., b., c.
 */
function penutupHtml(value: string): string {
	const items = langkahItems(value);
	if (!items.length) return '&nbsp;';
	if (/^Prinsip Pembelajaran\s*:/i.test(items[0])) {
		const head = items[0];
		const rest = items.slice(1);
		return `<p class="prinsip">${escNoBr(head)}</p>${
			rest.length ? `<ol class="stp">${rest.map((it) => `<li>${esc(it)}</li>`).join('')}</ol>` : ''
		}`;
	}
	return `<ol class="stp">${items.map((it) => `<li>${esc(it)}</li>`).join('')}</ol>`;
}

export function renderRpmHTML(data: RpmPrintData): string {
	const d = data;
	const faseText = d.fase ? ` Fase ${d.fase.replace(/^Fase\s+/i, '').trim()}` : '';

	const asesmenItems = (d.asesmen ?? []).map((a) => a.trim()).filter(Boolean);
	const intiBlocks = (d.inti ?? []).filter((b) => (b.langkah ?? '').trim());

	const ident = `${sectionHead('A', 'Identifikasi')}${fldWrap(
		fieldItem(
			'Murid',
			`<p>Siswa ${val(d.kelasLabel)}${faseText}</p>` +
				subWrap(
					subItem('Pengetahuan Awal', contentBlock(d.pengetahuanAwal)) +
						subItem('Minat', contentBlock(d.minat)) +
						subItem('Latar Belakang', contentBlock(d.latarBelakang)) +
						subItem('Kebutuhan Belajar', contentBlock(d.kebutuhanBelajar))
				)
		) +
			fieldItem('Materi Pelajaran', contentBlock(d.lingkupMateri)) +
			fieldItem('Dimensi Profil Lulusan', commaItems(d.profilLulusan))
	)}`;

	const desainFields: Array<[string, string]> = [
		['Capaian Pembelajaran', contentBlock(d.capaianPembelajaran)],
		['Lintas Disiplin Ilmu', letterList(d.lintasDisiplinIlmu)],
		['Tujuan Pembelajaran', tpList(d.tujuanPembelajaran)],
		['Topik Pembelajaran', contentBlock(d.lingkupMateri)],
		['Praktik Pedagogis (Model/Strategi/Metode)', contentBlock(langkahify(d.praktikPedagogis))]
	];
	if ((d.kemitraanPembelajaran ?? '').trim()) {
		desainFields.push(['Kemitraan Pembelajaran', contentBlock(d.kemitraanPembelajaran)]);
	}
	desainFields.push(
		['Lingkungan Pembelajaran', contentBlock(d.lingkunganPembelajaran)],
		['Pemanfaatan Digital', contentBlock(d.pemanfaatanDigital)]
	);
	const desain = `${sectionHead('B', 'Desain Pembelajaran')}${fldWrap(
		desainFields.map(([label, body]) => fieldItem(label, body)).join('')
	)}`;

	const pengalaman = `${sectionHead('C', 'Pengalaman Belajar')}${fldWrap(
		stepsItem('Awal', langkahItems(d.kegiatanAwal)) +
			`<li><h3 class="fld-name">Inti</h3>${
				intiBlocks.length ? subWrap(intiBlocks.map((b, i) => sintaksItem(i, b)).join('')) : '&nbsp;'
			}</li>` +
			fieldItem('Penutup', penutupHtml(d.penutup))
	)}`;

	const asesmen = `${sectionHead('D', 'Asesmen Pembelajaran')}${fldWrap(
		asesmenItems
			.map((a, i) => fieldItem(`Assessment for Learning (${i + 1})`, asesmenHtml(a)))
			.join('')
	)}`;

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
		content: "RPM - ${cssContent(d.mapelNama)} | ${cssContent(d.kelasLabel)}";
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
	margin: 0 0 4px;
	text-transform: uppercase;
}

.header p {
	font-size: 11pt;
	margin: 2px 0;
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

ol.stp {
	margin: 2pt 0 0 1.4em;
	padding: 0;
	list-style: lower-alpha;
}
ol.stp li {
	margin: 0.15em 0;
	text-align: justify;
}

ol.sbf {
	margin: 2pt 0 0 1.2em;
	padding: 0;
	list-style: lower-alpha;
}
ol.sbf > li {
	margin: 3pt 0;
	page-break-inside: avoid;
	break-inside: avoid;
}
.sub-name {
	font-size: 11pt;
	font-weight: bold;
	margin: 0 0 1pt;
}

p {
	margin: 2pt 0;
	text-align: justify;
}

p.prinsip {
	font-style: italic;
	margin-bottom: 3pt;
}

ol.rp-list {
	margin: 2pt 0 2pt 1.2em;
	padding-left: 1em;
}
ol.rp-list li {
	margin-bottom: 0.2em;
	text-align: justify;
}
</style>
</head>
<body>
	<div class="header">
		<h1>Rencana Pembelajaran Mendalam</h1>
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
					<td class="k">Materi</td>
					<td class="c">:</td>
					<td>${val(d.lingkupMateri)}</td>
				</tr>
				<tr>
					<td class="k">Penyusun</td>
					<td class="c">:</td>
					<td>${val(d.penyusun)}</td>
				</tr>
			</tbody>
		</table>
	</div>

	${ident}
	${desain}
	${pengalaman}
	${asesmen}
</body>
</html>`;
}
