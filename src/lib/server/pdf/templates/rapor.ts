import { sharedStyles, formatValue, formatUpper, getTutwuriBwDataUri } from './shared';

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
	const isGraduating =
		data.rombel.fase === 'Fase C' || data.rombel.fase === 'Fase D' || data.rombel.fase === 'Fase F';
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

/* PDF table — mirrors DaisyUI .table.border.rounded-none.border-base-content */
.pdf-table {
	border-collapse: collapse;
	width: 100%;
	font-size: 10pt;
	page-break-inside: auto;
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

.pdf-table tbody,
.pdf-table tr,
.pdf-table th,
.pdf-table td {
	page-break-inside: auto;
	break-inside: auto;
}

.pdf-table .first-data-row {
	page-break-before: auto;
}

.pdf-table .font-semibold {
	font-weight: 600;
}

.pdf-table td.align-top {
	vertical-align: top;
}

.no-break {
	page-break-inside: avoid;
}

/* utility passthrough */
.align-top { vertical-align: top; }
.underline { text-decoration: underline; }

</style>
</head>
<body>

${bgLogoSrc ? `<img src="${bgLogoSrc}" alt="" class="watermark">` : ''}

<div class="header-title">LAPORAN HASIL BELAJAR${data.raporPeriode === 'rts' ? '<br>TENGAH SEMESTER' : ''}</div>
<div class="header-subtitle">(RAPOR)</div>

<div style="display:grid;grid-template-columns:8rem auto 1fr 8rem auto auto;gap:0.375rem 0.75rem;font-size:10pt;">
	<div style="font-weight:bold;white-space:nowrap;">Nama Murid</div>
	<div>:</div>
	<div>${formatUpper(data.murid.nama)}</div>
	<div style="font-weight:bold;white-space:nowrap;">Kelas</div>
	<div>:</div>
	<div>${data.rombel.nama}</div>

	<div style="font-weight:bold;white-space:nowrap;">NIS / NISN</div>
	<div>:</div>
	<div>${formatValue(data.murid.nisn)} / ${formatValue(data.murid.nis)}</div>
	<div style="font-weight:bold;white-space:nowrap;">Fase</div>
	<div>:</div>
	<div>${data.rombel.fase}</div>

	<div style="font-weight:bold;white-space:nowrap;">Sekolah</div>
	<div>:</div>
	<div>${formatUpper(data.sekolah.nama)}</div>
	<div style="font-weight:bold;white-space:nowrap;">Semester</div>
	<div>:</div>
	<div>${data.periode.semester}</div>

	<div style="font-weight:bold;white-space:nowrap;">Alamat</div>
	<div>:</div>
	<div>${data.sekolah.alamat}</div>
	<div style="font-weight:bold;white-space:nowrap;">Tahun Ajaran</div>
	<div>:</div>
	<div>${data.periode.tahunPelajaran}</div>
</div>

<!-- Intrakurikuler -->
<table class="pdf-table" style="margin-top:12pt;">
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
		return `
		<tr>
			<td colspan="4" class="font-semibold" style="text-align:left;">${jenisLabels[jenis]}</td>
		</tr>
${group.items
	.map((item, i) => {
		const cls = i === 0 ? ' class="first-data-row"' : '';
		return `		<tr${cls}>
			<td class="align-top text-center">${i + 1}</td>
			<td class="align-top">${item.mataPelajaran}</td>
			<td class="align-top text-center">${formatValue(item.nilaiAkhir)}</td>
			<td class="align-top">${formatValue(item.deskripsi).replace(/\n/g, '<br>')}</td>
		</tr>`;
	})
	.join('\n')}`;
	})
	.join('\n')}
	</tbody>
</table>

${
	data.hasKokurikuler && data.kokurikuler
		? `
<!-- Kokurikuler -->
<table class="pdf-table" style="margin-top:12pt;">
	<thead>
		<tr>
			<th>Kokurikuler</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td class="align-top">${data.kokurikuler}</td>
		</tr>
	</tbody>
</table>
`
		: ''
}

${
	data.ekstrakurikuler?.length
		? `
<!-- Ekstrakurikuler -->
<table class="pdf-table" style="margin-top:12pt;">
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
			<td class="align-top text-center">${i + 1}</td>
			<td class="align-top">${e.nama}</td>
			<td class="align-top">${formatValue(e.deskripsi)}</td>
		</tr>`
	)
	.join('\n')}
	</tbody>
</table>
`
		: ''
}

<!-- Ketidakhadiran & Catatan Wali Kelas -->
<div class="no-break" style="margin-top:12pt;">
	<div style="display:grid;grid-template-columns:42fr 58fr;gap:1rem;">
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

		<table class="pdf-table" style="height:100%;">
			<thead>
				<tr>
					<th>Catatan Wali Kelas</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td class="align-top" style="height:5.5rem;">${formatValue(data.catatanWali)}</td>
				</tr>
			</tbody>
		</table>
	</div>
</div>

${
	isGenap && data.raporPeriode !== 'rts'
		? `
<!-- Tanggapan Orang Tua & Keputusan -->
<div class="no-break" style="margin-top:12pt;">
	<div style="display:grid;grid-template-columns:65fr 35fr;gap:1rem;">
		<table class="pdf-table">
			<thead>
				<tr>
					<th>Tanggapan Orang Tua / Wali</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td class="align-top" style="height:6.25rem;">${data.tanggapanOrangTua || ''}</td>
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
						Berdasarkan capaian seluruh kompetensi, ananda ${formatValue(data.murid.nama)} dinyatakan:
						<div style="display:flex;flex-direction:column;gap:0.25rem;margin-top:0.5rem;">
							<div style="display:flex;justify-content:space-between;">
								<span>${isGraduating ? 'Lulus' : 'Naik Kelas'}</span>
								<span>☐</span>
							</div>
							<div style="display:flex;justify-content:space-between;">
								<span>${isGraduating ? 'Tidak Lulus' : 'Tidak Naik Kelas'}</span>
								<span>☐</span>
							</div>
						</div>
					</td>
				</tr>
			</tbody>
		</table>
	</div>
</div>
`
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
				<td class="align-top" style="height:6.25rem;">${data.tanggapanOrangTua || ''}</td>
			</tr>
		</tbody>
	</table>
</div>
`
}

<!-- Tanda Tangan -->
<div class="no-break" style="margin-top:12pt;">
	<table style="width:100%;border-collapse:collapse;">
		<colgroup>
			<col style="width:35%;">
			<col style="width:30%;">
			<col style="width:35%;">
		</colgroup>
		<tbody>
			<tr>
				<td></td>
				<td></td>
				<td style="text-align:center;padding-bottom:6pt;">${data.ttd.tempat}, ${data.ttd.tanggal}</td>
			</tr>
			<tr>
				<td style="text-align:center;font-weight:bold;">Orang Tua / Wali Murid</td>
				<td></td>
				<td style="text-align:center;font-weight:bold;">Wali Kelas</td>
			</tr>
			<tr>
				<td style="height:4rem;"></td>
				<td></td>
				<td style="height:4rem;"></td>
			</tr>
			<tr>
				<td style="text-align:center;">____________________</td>
				<td></td>
				<td style="text-align:center;font-weight:bold;text-decoration:underline;">${data.waliKelas.nama}</td>
			</tr>
			${
				data.waliKelas.nip
					? `
			<tr>
				<td></td>
				<td></td>
				<td style="text-align:center;">${data.waliKelas.nip}</td>
			</tr>`
					: ''
			}
			<tr>
				<td style="height:0.75rem;"></td>
				<td></td>
				<td></td>
			</tr>
			<tr>
				<td></td>
				<td style="text-align:center;font-weight:bold;">${kepalaStatus}</td>
				<td></td>
			</tr>
			<tr>
				<td></td>
				<td style="height:4rem;"></td>
				<td></td>
			</tr>
			<tr>
				<td></td>
				<td style="text-align:center;font-weight:bold;text-decoration:underline;">${data.kepalaSekolah.nama}</td>
				<td></td>
			</tr>
			${
				data.kepalaSekolah.nip
					? `
			<tr>
				<td></td>
				<td style="text-align:center;">${data.kepalaSekolah.nip}</td>
				<td></td>
			</tr>`
					: ''
			}
		</tbody>
	</table>
</div>

</body>
</html>`;
}
