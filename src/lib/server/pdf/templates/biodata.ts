import { sharedStyles, formatValue, formatUpper, getTutwuriBwDataUri } from './shared';

interface BiodataPrintData {
	sekolah: { nama: string; bgLogoSrc?: string | null; statusKepalaSekolah?: string | null };
	murid: {
		id?: number;
		foto?: string | null;
		nama: string;
		nis: string;
		nisn: string;
		tempatLahir: string;
		tanggalLahir: string;
		jenisKelamin: string;
		agama: string;
		pendidikanSebelumnya: string;
		alamat: {
			jalan: string;
			kelurahan: string;
			kecamatan: string;
			kabupaten: string;
			provinsi: string;
		};
	};
	orangTua: {
		ayah: { nama: string; pekerjaan: string };
		ibu: { nama: string; pekerjaan: string };
		alamat: {
			jalan: string;
			kelurahan: string;
			kecamatan: string;
			kabupaten: string;
			provinsi: string;
		};
	};
	wali: { nama: string; pekerjaan: string; alamat: string };
	ttd: { tempat: string; tanggal: string; kepalaSekolah: string; nip: string };
	showBgLogo?: boolean;
}

function colItem(no: string, label: string, value: string, uppercase = false): string {
	const v = uppercase ? formatUpper(value) : formatValue(value);
	return `<tr>
		<td class="cell-no">${no}</td>
		<td class="cell-label">${label}</td>
		<td class="cell-colon">:</td>
		<td class="cell-value"><span class="font-bold">${v}</span></td>
	</tr>`;
}

function colSub(letter: string, label: string, value: string, uppercase = false): string {
	const v = uppercase ? formatUpper(value) : formatValue(value);
	return `<tr>
		<td></td>
		<td class="cell-label sub"><span class="sub-letter">${letter}.</span> ${label}</td>
		<td class="cell-colon">:</td>
		<td class="cell-value"><span class="font-bold">${v}</span></td>
	</tr>`;
}

function colEmpty(no: string, label: string): string {
	return `<tr>
		<td class="cell-no">${no}</td>
		<td class="cell-label">${label}</td>
		<td class="cell-colon">:</td>
		<td class="cell-value"></td>
	</tr>`;
}

export function renderBiodataHTML(data: BiodataPrintData): string {
	const { sekolah, murid, orangTua, wali, ttd, showBgLogo } = data;

	const bgLogoSrc = showBgLogo ? sekolah.bgLogoSrc || getTutwuriBwDataUri() : null;

	const foto = data.murid.foto ?? null;

	const kepalaTitle =
		sekolah.statusKepalaSekolah === 'plt' ? 'Plt. Kepala Sekolah' : 'Kepala Sekolah';

	return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>
${sharedStyles()}

.cell-no {
	width: 28px;
	vertical-align: top;
}

.cell-label {
	width: 200px;
	vertical-align: top;
	white-space: nowrap;
}

.cell-label.sub {
	padding-left: 24px;
}

.cell-colon {
	width: 16px;
	vertical-align: top;
}

.cell-value {
	vertical-align: top;
}

.identity-table {
	margin-top: 12px;
	width: 100%;
}

body {
	font-size: 10pt;
}

.identity-table td {
	padding: 2px 4px;
	font-size: 10pt;
}

.header-title {
	font-size: 18pt;
	font-weight: bold;
	text-align: center;
	margin-bottom: 2px;
}

.header-school {
	font-size: 10pt;
	text-align: center;
	text-transform: uppercase;
}

.footer {
	display: flex;
	justify-content: flex-end;
	gap: 32px;
	margin-top: 48px;
}

.ttd-section {
	display: flex;
	flex-direction: column;
	justify-content: space-between;
	text-align: center;
	font-size: 10pt;
}

.photo-box {
	width: 30mm;
	height: 40mm;
	flex-shrink: 0;
	border: 2px solid #000;
	display: flex;
	align-items: center;
	justify-content: center;
	text-align: center;
	font-size: 8pt;
}

.photo-box img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
}
</style>
</head>
<body>

${bgLogoSrc ? `<img class="watermark" src="${bgLogoSrc}" alt="logo" />` : ''}

<div class="header-title">IDENTITAS MURID</div>
<div class="header-school">${formatValue(sekolah.nama)}</div>

<table class="identity-table">
	<colgroup>
		<col class="cell-no" />
		<col class="cell-label" />
		<col class="cell-colon" />
		<col class="cell-value" />
	</colgroup>
	<tbody>
		${colItem('1.', 'Nama Murid', murid.nama, true)}
		${colItem('2.', 'NIS / NISN', `${formatValue(murid.nis)} / ${formatValue(murid.nisn)}`)}
		${colItem('3.', 'Tempat / Tanggal Lahir', `${formatValue(murid.tempatLahir)} / ${formatValue(murid.tanggalLahir)}`)}
		${colItem('4.', 'Jenis Kelamin', murid.jenisKelamin)}
		${colItem('5.', 'Agama', murid.agama)}
		${colItem('6.', 'Pendidikan Sebelumnya', murid.pendidikanSebelumnya)}
		${colItem('7.', 'Alamat Murid', `${formatValue(murid.alamat.jalan)}, ${formatValue(murid.alamat.kelurahan)}, ${formatValue(murid.alamat.kecamatan)}, ${formatValue(murid.alamat.kabupaten)}, ${formatValue(murid.alamat.provinsi)}`)}
		${colEmpty('8.', 'Nama Orang Tua')}
		${colSub('a', 'Ayah', orangTua.ayah.nama, true)}
		${colSub('b', 'Ibu', orangTua.ibu.nama, true)}
		${colEmpty('9.', 'Pekerjaan Orang Tua')}
		${colSub('a', 'Ayah', orangTua.ayah.pekerjaan)}
		${colSub('b', 'Ibu', orangTua.ibu.pekerjaan)}
		${colEmpty('10.', 'Alamat Orang Tua')}
		${colSub('a', 'Jalan', orangTua.alamat.jalan)}
		${colSub('b', 'Kelurahan/Desa', orangTua.alamat.kelurahan)}
		${colSub('c', 'Kecamatan', orangTua.alamat.kecamatan)}
		${colSub('d', 'Kabupaten/Kota', orangTua.alamat.kabupaten)}
		${colSub('e', 'Provinsi', orangTua.alamat.provinsi)}
		${colEmpty('11.', 'Wali Murid')}
		${colSub('a', 'Nama Wali', wali.nama, true)}
		${colSub('b', 'Pekerjaan Wali', wali.pekerjaan)}
		${colSub('c', 'Alamat Wali', wali.alamat)}
	</tbody>
</table>

<div class="footer">
	<div class="ttd-section">
		<div class="ttd-top">
			<p>${formatValue(ttd.tempat)}, ${formatValue(ttd.tanggal)}</p>
			<p>${kepalaTitle}</p>
		</div>
		<div class="ttd-bottom">
			<p class="font-bold">${formatValue(ttd.kepalaSekolah)}</p>
			<p>${formatValue(ttd.nip)}</p>
		</div>
	</div>
	<div class="photo-box">
		${foto ? `<img src="${foto}" alt="foto" />` : 'PAS FOTO 3x4'}
	</div>
</div>

</body>
</html>`;
}
