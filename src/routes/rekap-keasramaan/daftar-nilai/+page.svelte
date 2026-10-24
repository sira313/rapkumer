<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- simple href links used for per-row navigation */
	import Icon from '$lib/components/icon.svelte';
	import { page } from '$app/state';

	let { data } = $props();
	const status = $derived(data.status ?? 'empty');
	const murid = $derived(data.murid ?? null);
	const daftarNilai = $derived(status === 'ready' ? (data.daftarNilai ?? []) : []);
	const ringkasan = $derived(
		status === 'ready'
			? (data.ringkasan ?? { rataRata: null, predikat: null, mapelDinilai: 0, totalMapel: 0 })
			: { rataRata: null, predikat: null, mapelDinilai: 0, totalMapel: 0 }
	);
	const hasNilai = $derived(status === 'ready' && ringkasan.totalMapel > 0);
	const kelasAktif = $derived(page.data.kelasAktif ?? null);
	const kelasAktifLabel = $derived.by(() => {
		if (!kelasAktif) return null;
		return kelasAktif.fase ? `${kelasAktif.nama} - ${kelasAktif.fase}` : kelasAktif.nama;
	});
	let exporting = $state(false);

	function formatScore(value: number | null) {
		if (value == null) return '&mdash;';
		return value.toLocaleString('id-ID', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}

	const rataRataDisplay = $derived.by(() => formatScore(ringkasan.rataRata));
	const coverageDisplay = $derived.by(() => {
		if (!ringkasan.totalMapel) return '0/0 TP';
		return `${ringkasan.mapelDinilai}/${ringkasan.totalMapel} TP`;
	});

	async function handleExport() {
		if (!murid || !hasNilai || exporting) return;
		try {
			exporting = true;
			const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'));
			const headerRows: (string | number)[][] = [
				['REKAP NILAI KEASRAMAAN'],
				[page.data.sekolah?.nama || ''],
				['Nama', murid.nama],
				['Kelas', kelasAktifLabel ?? '-'],
				['Predikat', ringkasan.predikat ?? ringkasan.rataRata ?? ''],
				['TP Dinilai', `${ringkasan.mapelDinilai} dari ${ringkasan.totalMapel}`],
				[]
			];
			const tableHeader = ['Matev', 'Indikator', 'Nilai', 'Predikat'];
			const tableRows: (string | number | null)[][] = [];
			for (const n of daftarNilai as any[]) {
				tableRows.push([
					n.mataPelajaran ?? '',
					n.indikator ?? '',
					n.sudahDinilai && n.nilaiAkhir != null ? Number.parseFloat(String(n.nilaiAkhir)) : null,
					n.sudahDinilai ? (n.predikat ?? '') : ''
				]);
			}
			const workbook = new ExcelJS.Workbook();
			const worksheet: any = workbook.addWorksheet('Keasramaan');
			worksheet.addRows([...headerRows, tableHeader, ...tableRows]);
			// merge title and center
			try {
				const lastCol = 4;
				if (worksheet.getCell('A1').value) {
					worksheet.mergeCells(`A1:${String.fromCharCode(64 + lastCol)}1`);
					worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
					worksheet.getCell('A1').font = { bold: true, size: 12 };
				}
				if (worksheet.getCell('A2').value) {
					worksheet.mergeCells(`A2:${String.fromCharCode(64 + lastCol)}2`);
					worksheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
				}
				for (let r = 3; r <= 6; r++) {
					worksheet.getCell(`B${r}`).alignment = { vertical: 'middle' };
				}
				const headerRowNum = headerRows.length + 1;
				for (let c = 1; c <= lastCol; c++) {
					worksheet.getCell(headerRowNum, c).alignment = {
						horizontal: 'center',
						vertical: 'middle'
					};
				}
				for (let c = 3; c <= 4; c++) {
					for (let r = headerRowNum + 1; r < worksheet.rowCount; r++) {
						try {
							worksheet.getCell(r, c).alignment = { horizontal: 'center', vertical: 'middle' };
						} catch (e) {
							// ignore
						}
					}
				}
				const startRow = headerRows.length + 1;
				const endRow = startRow + tableRows.length;
				for (let r = startRow; r <= endRow; r++) {
					for (let c = 1; c <= lastCol; c++) {
						const cell = worksheet.getCell(r, c);
						cell.border = {
							top: { style: 'thin' },
							left: { style: 'thin' },
							bottom: { style: 'thin' },
							right: { style: 'thin' }
						};
					}
				}
			} catch (e) {
				// ignore
			}
			// signatures
			worksheet.addRows([[], [], []]);
			const sekolahNama = (page.data as any).sekolah?.nama || '';
			const kepala =
				(data as any).kepalaSekolah?.nama ||
				(page.data as any).kepalaSekolah?.nama ||
				((page.data as any).sekolah as any)?.kepalaSekolah?.nama ||
				'';
			const kepalaNip =
				(data as any).kepalaSekolah?.nip ||
				(page.data as any).kepalaSekolah?.nip ||
				((page.data as any).sekolah as any)?.kepalaSekolah?.nip ||
				'';
			const lokasiFromMeta = ((page.data as any).sekolah as any)?.lokasiTandaTangan || '';
			let formattedTanggal = '';
			const tanggalRaw =
				((page.data as any).sekolah as any)?.semesterAktif?.tanggalBagiRaport ||
				((page.data as any).sekolah as any)?.tanggalBagiRaport;
			if (tanggalRaw) {
				try {
					const d = new Date(tanggalRaw);
					if (!Number.isNaN(d.getTime())) {
						formattedTanggal = new Intl.DateTimeFormat('id-ID', {
							day: 'numeric',
							month: 'long',
							year: 'numeric'
						}).format(d);
					}
				} catch (e) {
					// ignore
				}
			} else {
				try {
					formattedTanggal = new Intl.DateTimeFormat('id-ID', {
						day: 'numeric',
						month: 'long',
						year: 'numeric'
					}).format(new Date());
				} catch (e) {
					// ignore
				}
			}
			const waliAsramaNama2 =
				(data as any).waliAsrama?.nama || (page.data as any).waliAsrama?.nama || '';
			const waliAsramaNip2 =
				(data as any).waliAsrama?.nip || (page.data as any).waliAsrama?.nip || '';
			const waliAsuhNama2 =
				(data as any).waliAsuh?.nama ||
				(page.data as any).waliAsuh?.nama ||
				(murid as any)?.waliAsuhNama ||
				(page.data as any)?.waliAsuhNama ||
				'';
			const waliAsuhNip2 =
				(data as any).waliAsuh?.nip ||
				(page.data as any).waliAsuh?.nip ||
				(page.data as any).waliAsuh?.nip ||
				'';
			worksheet.addRow([
				'',
				'',
				'',
				`${lokasiFromMeta ? lokasiFromMeta + ', ' : ''}${formattedTanggal}`
			]);
			worksheet.addRow(['', 'Wali Asuh', '', 'Wali Asrama']);
			worksheet.addRows([[], [], []]);
			worksheet.addRow(['', waliAsuhNama2, '', waliAsramaNama2]);
			worksheet.addRow(['', waliAsuhNip2, '', waliAsramaNip2]);
			worksheet.addRows([[], []]);
			worksheet.addRow(['', `Plt. Kepala ${sekolahNama}`, '', '']);
			worksheet.addRows([[], [], []]);
			worksheet.addRow(['', kepala, '', '']);
			worksheet.addRow(['', kepalaNip, '', '']);
			try {
				const lastRow = worksheet.rowCount;
				for (const r of [lastRow - 9, lastRow - 8, lastRow - 6, lastRow - 5]) {
					worksheet.mergeCells(`B${r}:C${r}`);
					worksheet.getCell(`B${r}`).alignment = { horizontal: 'left', vertical: 'middle' };
				}
				for (const r of [
					lastRow - 9,
					lastRow - 8,
					lastRow - 6,
					lastRow - 5,
					lastRow - 4,
					lastRow - 3,
					lastRow - 1,
					lastRow
				]) {
					worksheet.getCell(`D${r}`).alignment = { horizontal: 'left', vertical: 'middle' };
				}
			} catch (e) {
				// ignore
			}
			// set approximate column widths
			try {
				const colDefs: Array<{ wch?: number }> = [
					{ wch: 18 },
					{ wch: 50 },
					{ wch: 14 },
					{ wch: 12 }
				];
				for (let i = 0; i < colDefs.length; i += 1) {
					const def = colDefs[i];
					if (def && def.wch) worksheet.getColumn(i + 1).width = def.wch;
				}
				worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRows.length + 1 }];
			} catch {
				// ignore view/width errors in some runtimes
			}
			const safeName = murid.nama.replace(/[<>:"/\\|?*]+/g, ' ').trim() || 'murid';
			const kelasName = kelasAktifLabel ? ` - ${kelasAktifLabel}` : '';
			const timestamp = new Date().toISOString().slice(0, 10);
			const fileName = `Rekap Keasramaan - ${safeName}${kelasName} - ${timestamp}.xlsx`;
			try {
				const buf = await workbook.xlsx.writeBuffer();
				const srcView = ArrayBuffer.isView(buf)
					? new Uint8Array(
							(buf as ArrayBufferView).buffer,
							(buf as ArrayBufferView).byteOffset,
							(buf as ArrayBufferView).byteLength
						)
					: new Uint8Array(buf as ArrayBufferLike);
				const uint8 = Uint8Array.from(srcView);
				const blob = new Blob([uint8], {
					type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
				});
				const link = document.createElement('a');
				link.href = URL.createObjectURL(blob);
				link.download = fileName;
				document.body.appendChild(link);
				link.click();
				link.remove();
				URL.revokeObjectURL(link.href);
			} catch (e) {
				console.error('Gagal menulis file Excel di client', e);
			}
		} catch (error) {
			console.error('Gagal mengekspor rekap keasramaan', error);
		} finally {
			exporting = false;
		}
	}
</script>

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<div class="mb-2 flex flex-col gap-2 sm:flex-row">
		<a href="/rekap-keasramaan/" class="btn btn-soft shadow-none">
			<Icon name="left" />
			Kembali
		</a>
		<button
			class="btn btn-soft shadow-none sm:ml-auto"
			class:loading={exporting}
			disabled={!hasNilai || exporting}
			title={exporting
				? 'Sedang menyiapkan file Excel'
				: hasNilai
					? 'Unduh nilai murid'
					: 'Belum ada nilai untuk diexport'}
			onclick={handleExport}
		>
			<Icon name="export" />
			Export
		</button>
	</div>

	{#if status === 'ready' && murid}
		<div class="border-base-200 flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-center">
			<div>
				<h2 class="text-xl font-bold">Rekap Keasramaan Murid</h2>
				<p class="text-base-content/80">{murid.nama}</p>
				{#if kelasAktifLabel}
					<p class="text-base-content/60 text-sm">Kelas {kelasAktifLabel}</p>
				{/if}
			</div>
			<div class="divider sm:divider-horizontal"></div>
			<div class="flex flex-wrap gap-4">
				<div>
					<p class="text-base-content/60 text-sm tracking-wide uppercase">Rata-rata</p>
					<p class="text-3xl font-semibold">
						{@html rataRataDisplay} <span class="text-lg">({ringkasan.predikat ?? '—'})</span>
					</p>
				</div>
				<div>
					<p class="text-base-content/60 text-sm tracking-wide uppercase">TP Dinilai</p>
					<p class="text-xl font-semibold">{coverageDisplay}</p>
				</div>
			</div>
		</div>

		<div role="alert" class="alert rounded-box alert-soft alert-info mt-4">
			<span class="text-2xl">
				<Icon name="info" />
			</span>
			<span>
				<p class="text-lg">Rata-rata ananda <b>{murid.nama}</b></p>
				<p class="text-2xl font-bold">{@html rataRataDisplay} ({ringkasan.predikat ?? '—'})</p>
				<p class="text-base-content/70 text-sm">
					Berdasarkan rata-rata rubrik seluruh TP keasramaan.
				</p>
			</span>
		</div>

		<div
			class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
		>
			<table class="border-base-200 table border dark:border-none">
				<thead>
					<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
						<th style="min-width: 150px;">Matev</th>
						<th class="w-full" style="min-width: 200px;">Indikator</th>
						<th style="width: 80px;">Nilai</th>
						<th style="width: 80px;">Predikat</th>
					</tr>
				</thead>
				<tbody>
					{#if hasNilai}
						{#each daftarNilai as nilai, i (i)}
							<tr>
								<td class="align-top font-semibold">{nilai.mataPelajaran || ''}</td>
								<td>{nilai.indikator}</td>
								<td
									class={`font-semibold align-top${nilai.sudahDinilai ? '' : ' text-base-content/60 italic'}`}
								>
									{nilai.sudahDinilai ? nilai.nilaiAkhir : '—'}
								</td>
								<td class="align-top">{nilai.sudahDinilai ? (nilai.predikat ?? '—') : '—'}</td>
							</tr>
						{/each}
					{:else}
						<tr>
							<td colspan="4" class="p-8 text-center">
								<em class="opacity-60">Belum ada nilai keasramaan untuk murid ini.</em>
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="alert alert-soft alert-warning mt-4 flex items-start gap-3">
			<Icon name="warning" class="text-xl" />
			<span>
				{#if status === 'not-found'}
					<p class="font-semibold">Murid tidak ditemukan.</p>
					<p class="text-base-content/70 text-sm">
						Pastikan Anda memilih murid dari daftar rekap yang sama.
					</p>
				{:else}
					<p class="font-semibold">Pilih murid terlebih dahulu.</p>
					<p class="text-base-content/70 text-sm">
						Gunakan tombol "Lihat" pada halaman Rekap Keasramaan untuk membuka rincian.
					</p>
				{/if}
			</span>
		</div>
	{/if}
</div>
