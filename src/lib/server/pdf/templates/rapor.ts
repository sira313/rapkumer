import { sharedStyles, formatValue, formatUpper, getTutwuriBwDataUri } from './shared';
import { parseTingkat, lastGradeOfFase, isGraduatingFase, isGraduatingGrade } from '$lib/tingkat';

export interface RaporPrintData {
	sekolah: {
		nama: string;
		alamat: string;
		bgLogoSrc?: string | null;
		jenjangVariant?: string | null;
	};
	raporPeriode?: 'rts' | 'ras';
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
	naik: boolean;
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
	const tingkat = parseTingkat(data.rombel.nama);
	const isGraduating =
		isGraduatingGrade(tingkat) ||
		(isGraduatingFase(data.rombel.fase ?? '') &&
			(tingkat === null ? true : lastGradeOfFase[data.rombel.fase ?? ''] === tingkat));
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

	const kepalaStatus =
		data.kepalaSekolah.statusKepalaSekolah === 'plt' ? 'Plt. Kepala Sekolah' : 'Kepala Sekolah';

	const hasKeputusan = isGenap && data.raporPeriode !== 'rts';

	function renderDeskripsi(deskripsi: string): string {
		return formatValue(deskripsi)
			.split('\n')
			.filter(Boolean)
			.map((p) => `<div class="text-justify">${p}</div>`)
			.join('');
	}

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
	margin-bottom: 15mm;
	@bottom-left {
		content: "${data.rombel.nama} | ${data.murid.nama} | ${data.murid.nis}";
		font-size: 10pt;
		font-family: Helvetica, Arial, sans-serif;
		color: #555;
		vertical-align: center;
	}
	@bottom-right {
		content: "Halaman: " counter(page) " / " counter(pages);
		font-size: 10pt;
		font-family: Helvetica, Arial, sans-serif;
		color: #555;
		vertical-align: center;
	}
}

body {
	font-family: Helvetica, Arial, sans-serif;
	font-size: 10pt;
	color: #000;
	line-height: 1.3;
	margin: 0;
	padding: 0;
}

/* ── Title ── */
.header-title {
	font-size: 12pt;
	font-weight: bold;
	text-align: center;
	margin-bottom: 1pt;
}
.header-subtitle {
	font-size: 10pt;
	font-weight: normal;
	text-align: center;
	margin-bottom: 6pt;
}

/* ── Identity grid — mirrors DaisyUI grid-cols-[8rem_auto_1fr_8rem_auto_auto] ── */
.identity-grid {
	display: grid;
	grid-template-columns: 8rem auto 1fr 8rem auto auto;
	column-gap: 0.75rem;
	row-gap: 0.5rem;
	font-size: 10pt;
}

/* ── PDF table — mirrors DaisyUI .table.border.rounded-none.border-base-content ── */
.pdf-table {
	border-collapse: collapse;
	width: 100%;
	font-size: 10pt;
}
.pdf-table th,
.pdf-table td {
	border: 1px solid #000;
	padding: 4pt 8pt;
}
.pdf-table th {
	font-weight: bold;
	text-align: center;
	background: #f0f0f0;
}
.pdf-table .group-header td {
	font-weight: 600;
	text-align: left;
}

/* Allow page breaks inside table rows — used for intra/koko/ekstra */
.pdf-table.breakable tbody,
.pdf-table.breakable tr,
.pdf-table.breakable td {
	page-break-inside: auto;
	break-inside: auto;
}

/* ── Non-breakable section ── */
.no-break {
	page-break-inside: avoid;
}

/* ── Grid helpers — mirrors DaisyUI grid-cols-{ratio} ── */
.grid-2col {
	display: grid;
	gap: 1rem;
}
.grid-2col.ratio-35-65 {
	grid-template-columns: 35fr 65fr;
}
.grid-2col.ratio-70-30 {
	grid-template-columns: 70fr 30fr;
}
.grid-2col.ratio-60-40 {
	grid-template-columns: 60fr 40fr;
}
.grid-2col.ratio-40-60 {
	grid-template-columns: 40fr 60fr;
}
.grid-2col.ratio-45-55 {
	grid-template-columns: 45fr 55fr;
}

/* ── Full-height table helper ── */
.full-height {
	height: 100%;
}

/* ── Signature table ── */
.ttd-table {
	width: 100%;
	border-collapse: collapse;
}

/* ── Spacer heights — mirrors DaisyUI h-24, h-25, h-10 ── */
.spacer-4 { height: 4rem; }
.spacer-5 { height: 5rem; }
.spacer-6 { height: 6rem; }
.spacer-2-5 { height: 2.5rem; }
.spacer-6-25 { height: 6.25rem; }

/* ── Checkbox row — mirrors DaisyUI space-y-2 + flex justify-between ── */
.check-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
}
.check-mark {
	font-size: 16pt;
	line-height: 1;
}
.check-group {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	margin-top: 0.5rem;
}

/* ── Watermark ── */
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

/* ── Text utilities — mirrors DaisyUI text-center, text-justify, etc. ── */
.text-center { text-align: center; }
.text-left { text-align: left; }
.text-justify { text-align: justify; }
.align-top { vertical-align: top; }
.font-bold { font-weight: bold; }
.underline { text-decoration: underline; }
</style>
</head>
<body>

${bgLogoSrc ? `<img src="${bgLogoSrc}" alt="" class="watermark">` : ''}

<!-- Title -->
<div class="header-title">LAPORAN HASIL BELAJAR${data.raporPeriode === 'rts' ? '<br>TENGAH SEMESTER' : ''}</div>
<div class="header-subtitle">(RAPOR)</div>

<!-- Identity -->
<div class="identity-grid">
	<div class="font-bold">Nama Murid</div>
	<div>:</div>
	<div>${formatUpper(data.murid.nama)}</div>
	<div class="font-bold">Kelas</div>
	<div>:</div>
	<div>${data.rombel.nama}</div>

	<div class="font-bold">NIS / NISN</div>
	<div>:</div>
	<div>${formatValue(data.murid.nisn)} / ${formatValue(data.murid.nis)}</div>
	<div class="font-bold">Fase</div>
	<div>:</div>
	<div>${data.rombel.fase}</div>

	<div class="font-bold">Sekolah</div>
	<div>:</div>
	<div>${formatUpper(data.sekolah.nama)}</div>
	<div class="font-bold">Semester</div>
	<div>:</div>
	<div>${data.periode.semester}</div>

	<div class="font-bold">Alamat</div>
	<div>:</div>
	<div>${data.sekolah.alamat}</div>
	<div class="font-bold">Tahun Ajaran</div>
	<div>:</div>
	<div>${data.periode.tahunPelajaran}</div>
</div>

<!-- Intrakurikuler -->
<table class="pdf-table breakable" data-ref="intrakurikuler" style="margin-top:12pt;">
	<thead>
		<tr>
			<th style="width:6%;">No</th>
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
		return `		<tr class="group-header">
			<td colspan="4">${jenisLabels[jenis]}</td>
		</tr>
${group.items
	.map(
		(item, i) => `		<tr>
			<td class="text-center align-top">${i + 1}</td>
			<td class="align-top">${item.mataPelajaran}</td>
			<td class="text-center align-top">${formatValue(item.nilaiAkhir)}</td>
			<td class="align-top">${renderDeskripsi(item.deskripsi)}</td>
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
<!-- Kokurikuler -->
<table class="pdf-table breakable" data-ref="kokurikuler" style="margin-top:12pt;">
	<thead>
		<tr>
			<th>Kokurikuler</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td class="align-top text-justify">${renderDeskripsi(data.kokurikuler)}</td>
		</tr>
	</tbody>
</table>`
		: ''
}

${
	data.ekstrakurikuler?.length
		? `
<!-- Ekstrakurikuler -->
<table class="pdf-table breakable" data-ref="ekstrakurikuler" style="margin-top:12pt;">
	<thead>
		<tr>
			<th style="width:6%;">No</th>
			<th style="width:30%;">Ekstrakurikuler</th>
			<th style="width:64%;">Keterangan</th>
		</tr>
	</thead>
	<tbody>
${data.ekstrakurikuler
	.map(
		(e, i) => `		<tr>
			<td class="text-center align-top">${i + 1}</td>
			<td class="align-top">${e.nama}</td>
			<td class="align-top text-justify">${renderDeskripsi(e.deskripsi)}</td>
		</tr>`
	)
	.join('\n')}
	</tbody>
</table>`
		: ''
}

<!-- Ketidakhadiran & Catatan Wali Kelas -->
<div class="no-break" style="margin-top:12pt;">
	<div class="grid-2col ratio-45-55">
		<table class="pdf-table">
			<thead>
				<tr>
					<th colspan="2">Ketidakhadiran</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td style="width:50%;">Sakit</td>
					<td style="width:50%;text-align:center;">${sakit} Hari</td>
				</tr>
				<tr>
					<td>Izin</td>
					<td style="text-align:center;">${izin} Hari</td>
				</tr>
				<tr>
					<td>Tanpa Keterangan</td>
					<td style="text-align:center;">${tanpaKeterangan} Hari</td>
				</tr>
			</tbody>
		</table>
		<table class="pdf-table full-height">
			<thead>
				<tr>
					<th>Catatan Wali Kelas</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td class="align-top spacer-6-25 text-justify">${formatValue(data.catatanWali)}</td>
				</tr>
			</tbody>
		</table>
	</div>
</div>

${
	hasKeputusan
		? `
<!-- Tanggapan Orang Tua & Keputusan -->
<div class="no-break" style="margin-top:12pt;">
	<div class="grid-2col ratio-60-40">
		<table class="pdf-table">
			<thead>
				<tr>
					<th>Tanggapan Orang Tua / Wali</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td class="align-top spacer-6-25">${data.tanggapanOrangTua || ''}</td>
				</tr>
			</tbody>
		</table>
		<table class="pdf-table">
			<thead>
				<tr>
					<th>Keputusan</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td class="align-top">
						<div class="text-left">Berdasarkan capaian seluruh kompetensi, ananda ${formatValue(data.murid.nama)} dinyatakan:</div>
						<div class="check-group">
							<div class="check-row">
								<span>${isGraduating ? 'Lulus' : 'Naik Kelas'}</span>
								<span class="check-mark">${data.naik ? '☑' : '☐'}</span>
							</div>
							<div class="check-row">
								<span>${isGraduating ? 'Tidak Lulus' : 'Tidak Naik Kelas'}</span>
								<span class="check-mark">${data.naik ? '☐' : '☑'}</span>
							</div>
						</div>
					</td>
				</tr>
			</tbody>
		</table>
	</div>
</div>`
		: `
<!-- Tanggapan Orang Tua -->
<div class="no-break" style="margin-top:12pt;">
	<table class="pdf-table">
		<thead>
			<tr>
				<th>Tanggapan Orang Tua / Wali</th>
			</tr>
		</thead>
		<tbody>
			<tr>
				<td class="align-top spacer-6-25">${data.tanggapanOrangTua || ''}</td>
			</tr>
		</tbody>
	</table>
</div>`
}

<!-- Tanda Tangan -->
<div class="no-break" style="margin-top:12pt;">
	<table class="ttd-table">
		<colgroup>
			<col style="width:50%;">
			<col style="width:50%;">
		</colgroup>
		<tbody>
			<tr>
				<td></td>
				<td class="text-center" style="padding-bottom:6pt;">${data.ttd.tempat}, ${data.ttd.tanggal}</td>
			</tr>
			<tr>
				<td class="text-center font-bold">Orang Tua / Wali Murid</td>
				<td class="text-center font-bold">Wali Kelas</td>
			</tr>
			<tr>
				<td class="spacer-5"></td>
				<td class="spacer-5"></td>
			</tr>
			<tr>
				<td class="text-center">____________________</td>
				<td class="text-center font-bold underline">${data.waliKelas.nama}</td>
			</tr>
			${
				data.waliKelas.nip
					? `
			<tr>
				<td></td>
				<td class="text-center">${data.waliKelas.nip}</td>
			</tr>`
					: ''
			}
		</tbody>
		<tbody>
			<tr>
				<td colspan="2" class="text-center font-bold" style="padding-top:8pt;">${kepalaStatus}</td>
			</tr>
			<tr>
				<td colspan="2" class="spacer-5"></td>
			</tr>
			<tr>
				<td colspan="2" class="text-center font-bold underline">${data.kepalaSekolah.nama}</td>
			</tr>
			${
				data.kepalaSekolah.nip
					? `
			<tr>
				<td colspan="2" class="text-center">${data.kepalaSekolah.nip}</td>
			</tr>`
					: ''
			}
		</tbody>
	</table>
</div>

</body>
</html>`;
}
