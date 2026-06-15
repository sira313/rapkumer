<script lang="ts">
	import Icon from './icon.svelte';

	/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
	export let kelasId: number | null = null;

	// Download leger as Excel (.xlsx) using ExcelJS
	// Requires dependency: exceljs (npm i exceljs)
	function colLetter(col: number) {
		// 1-based index to column letters
		let s = '';
		while (col > 0) {
			const m = (col - 1) % 26;
			s = String.fromCharCode(65 + m) + s;
			col = Math.floor((col - 1) / 26);
		}
		return s;
	}

	async function downloadLeger() {
		try {
			const q = kelasId ? `?kelas_id=${kelasId}` : '';
			const res = await fetch(`/api/leger-metadata${q}`);
			if (!res.ok) throw new Error('Gagal mengambil metadata leger');
			const meta = await res.json();

			const schoolName = meta.sekolah?.nama || 'Nama Sekolah';
			const kepala = meta.kepalaSekolah?.nama || '';
			const wali = meta.waliKelas?.nama || '';

			const { Workbook } = await import('exceljs');
			const workbook = new Workbook();
			const ws: any = workbook.addWorksheet('Leger');

			// Build headers from server-provided headers (which collapse agama variants)
			const headers: Array<{ id: string | number; nama: string; kode?: string }> = Array.isArray(
				meta.headers
			)
				? meta.headers.map((h: any) => ({
						id: h.id,
						nama: String(h.nama || ''),
						kode: String(h.kode || '')
					}))
				: [];
			// kokurikuler metadata (optional)
			const kokRows: Array<{ id: number; nama: string; dimensi?: string }> = Array.isArray(
				meta.kokRows
			)
				? meta.kokRows.map((k: any) => ({ id: k.id, nama: String(k.nama || '') }))
				: [];
			// ekstrakurikuler metadata (optional)
			const ekstrakRows: Array<{ id: number; nama: string }> = Array.isArray(meta.ekstrakRows)
				? meta.ekstrakRows.map((k: any) => ({ id: k.id, nama: String(k.nama || '') }))
				: [];
			// Fallback to raw mapel names if headers missing
			const subjectCols: string[] = headers.length
				? headers.map((h) => (h.kode && String(h.kode).trim() ? String(h.kode).trim() : h.nama))
				: Array.isArray(meta.mapel) && meta.mapel.length
					? meta.mapel.map((m: any) => String(m.kode || m.nama || '').trim()).filter(Boolean)
					: [
							'Pendidikan Agama',
							'Pancasila',
							'Bahasa Indonesia',
							'Matematika',
							'IPA',
							'IPS',
							'Seni Musik',
							'Seni Tari',
							'Seni Rupa',
							'Seni Teater',
							'PJOK',
							'Bahasa Inggris',
							'Bahasa Jawa',
							'Mulok 1',
							'Mulok 2',
							'Mulok 3'
						];

			// Build rows as arrays
			const rows: any[] = [];
			rows.push(['REKAP NILAI RAPOR']);
			rows.push([String(schoolName).toUpperCase()]);
			rows.push([]);

			// include kokurikuler column names before the Jumlah column
			const kokNames = kokRows.length ? kokRows.map((k) => k.nama) : [];
			const ekstrakNames = ekstrakRows.length ? ekstrakRows.map((k) => k.nama) : [];
			const header = [
				'No',
				'Nama Siswa',
				...subjectCols,
				...kokNames,
				...ekstrakNames,
				'Jumlah',
				'Capaian Kelas',
				'Ket'
			];
			// Insert a title row above subject headers for a merged "Intrakurikuler" label
			const intrakurikulerRow = Array(header.length).fill('');
			// subject columns start at index 2 (0-based) -> column C (1-based col 3)
			intrakurikulerRow[2] = 'Intrakurikuler';
			// mark Kokurikuler label position if present (placed immediately after subjects)
			if (kokNames.length) {
				const kokStartIndex = 2 + subjectCols.length; // 0-based
				intrakurikulerRow[kokStartIndex] = 'Kokurikuler';
			}
			if (ekstrakNames.length) {
				const eksStartIndex = 2 + subjectCols.length + kokNames.length;
				intrakurikulerRow[eksStartIndex] = 'Ekstrakurikuler';
			}
			rows.push(intrakurikulerRow);
			rows.push(header);

			// Fill rows from server-provided murid list (if available) or default placeholders
			const muridList: Array<any> = Array.isArray(meta.murid) ? meta.murid : [];
			if (muridList.length) {
				let idx = 1;
				for (const m of muridList) {
					const rowValues: any[] = [];
					rowValues.push(idx++);
					rowValues.push(m.nama || '');
					for (const h of headers.length
						? headers
						: subjectCols.map((s, i) => ({ id: i, nama: s }))) {
						const key = String(h.id);
						const val = m.nilai ? m.nilai[key] : null;
						rowValues.push(val != null ? Number(val) : '');
					}
					// append kok values (strings like 'Sangat Baik', etc.) if present
					if (kokRows.length) {
						for (const k of kokRows) {
							const key = `kok_${k.id}`;
							const val = m.nilai ? m.nilai[key] : null;
							rowValues.push(val != null ? String(val) : '');
						}
					}
					// append ekstrak values after kok (if any)
					if (ekstrakRows.length) {
						for (const e of ekstrakRows) {
							const key = `eks_${e.id}`;
							const val = m.nilai ? m.nilai[key] : null;
							rowValues.push(val != null ? String(val) : '');
						}
					}
					rowValues.push(''); // Jumlah (could compute if desired)
					rowValues.push(''); // Capaian Kelas
					rowValues.push(''); // Ket
					rows.push(rowValues);
				}
				// Rata-rata row (compute averages per column)
				const rataRow: any[] = [];
				rataRow.push('RATA-RATA');
				rataRow.push('');
				if (headers.length) {
					for (const h of headers) {
						// compute avg across muridList
						let sum = 0;
						let count = 0;
						for (const m of muridList) {
							const v = m.nilai ? m.nilai[String(h.id)] : null;
							if (v != null) {
								sum += Number(v);
								count++;
							}
						}
						rataRow.push(count ? +(sum / count).toFixed(2) : '');
					}
				} else {
					for (let i = 0; i < subjectCols.length; i++) rataRow.push('');
				}
				// for kok columns, leave rata cells empty (kok are categorical)
				for (let i = 0; i < kokRows.length; i++) rataRow.push('');
				rataRow.push('');
				rataRow.push('');
				rataRow.push('');
				rows.push(rataRow);
			} else {
				// fallback to 30 empty student rows
				for (let i = 1; i <= 30; i++) {
					const r = [i, ...Array(subjectCols.length).fill(''), '', '', ''];
					rows.push(r);
				}
				const rata = ['RATA-RATA', ...Array(subjectCols.length).fill(''), '', '', ''];
				rows.push(rata);
			}

			// signature lines: include lokasi tanda tangan and tanggal bagi rapor
			rows.push([]);
			rows.push([]);
			rows.push([]);
			// derive lokasi and tanggal from metadata (prefer top-level keys added by server)
			const lokasiFromMeta =
				(meta && (meta.lokasiTandaTangan || (meta.sekolah && meta.sekolah.lokasiTandaTangan))) ||
				'Lokasi tanda tangan';
			const tanggalRaw =
				(meta &&
					(meta.tanggalBagiRaport ||
						(meta.sekolah && meta.sekolah?.semesterAktif?.tanggalBagiRaport))) ||
				null;
			const formattedTanggal = (() => {
				if (!tanggalRaw) {
					try {
						return new Intl.DateTimeFormat('id-ID', {
							day: 'numeric',
							month: 'long',
							year: 'numeric'
						}).format(new Date());
					} catch (e) {
						return '';
					}
				}
				try {
					const d = new Date(tanggalRaw);
					if (Number.isNaN(d.getTime())) return '';
					return new Intl.DateTimeFormat('id-ID', {
						day: 'numeric',
						month: 'long',
						year: 'numeric'
					}).format(d);
				} catch (e) {
					return String(tanggalRaw);
				}
			})();
			rows.push(['Mengetahui', ...Array(8).fill(''), `${lokasiFromMeta}, ${formattedTanggal}`]);
			// put Wali Kelas text on the same row as the Kepala title (rightmost cell)
			const kelasNama = meta?.kelasNama || (meta?.kelas && meta.kelas.nama) || '';
			rows.push([
				`Kepala ${String(schoolName)}`,
				...Array(8).fill(''),
				kelasNama ? `Wali Kelas ${String(kelasNama)}` : 'Wali Kelas'
			]);
			// leave ~3 empty rows for signature (visual gap)
			rows.push([]);
			rows.push([]);
			rows.push([]);
			// Printed name of kepala (also show wali kelas name at the rightmost cell)
			rows.push([String(kepala || ''), ...Array(8).fill(''), String(wali || '')]);
			// NIP line for kepala (also show wali kelas NIP at the rightmost cell)
			rows.push([
				`NIP ${String(meta?.kepalaSekolah?.nip || '')}`,
				...Array(8).fill(''),
				`NIP ${String(meta?.waliKelas?.nip || '')}`
			]);

			// Add rows to worksheet (add all at once)
			if (typeof ws.addRows === 'function') {
				ws.addRows(rows);
			} else {
				// fallback: push rows manually
				for (const r of rows) {
					ws.addRow(r);
				}
			}

			const lastCol = header.length;
			// Use "Center Across Selection" style instead of merging cells.
			// Merging can cause editing/formatting issues in some Excel clients; using
			// centerContinuous keeps the visual centering while leaving cells separate.

			// Set column widths
			const colsDef = [{ width: 6 }, { width: 40 }];
			for (let i = 2; i < header.length; i++) colsDef.push({ width: 12 });
			ws.columns = colsDef as any;

			// Merge and style the Intrakurikuler title across the subject columns (row 4)
			try {
				const subjectCount = subjectCols.length;
				const subjectStartCol = 3; // C
				const subjectEndCol = 2 + subjectCount;
				const intrakRowIndex = 4; // we inserted the intrakurikuler row as the 4th row
				const mergeRange = `${colLetter(subjectStartCol)}${intrakRowIndex}:${colLetter(subjectEndCol)}${intrakRowIndex}`;
				ws.mergeCells(mergeRange);
				const intrCell = ws.getCell(`${colLetter(subjectStartCol)}${intrakRowIndex}`);
				intrCell.value = 'Intrakurikuler';
				intrCell.font = { bold: true } as any;
				intrCell.alignment = { horizontal: 'center', vertical: 'middle' } as any;
				// also merge Kokurikuler header if kok columns exist
				if (kokRows.length) {
					const kokStartCol = subjectEndCol + 1;
					const kokEndCol = kokStartCol + kokRows.length - 1;
					try {
						const kokRange = `${colLetter(kokStartCol)}${intrakRowIndex}:${colLetter(kokEndCol)}${intrakRowIndex}`;
						ws.mergeCells(kokRange);
						const kokCell = ws.getCell(`${colLetter(kokStartCol)}${intrakRowIndex}`);
						kokCell.value = 'Kokurikuler';
						kokCell.font = { bold: true } as any;
						kokCell.alignment = { horizontal: 'center', vertical: 'middle' } as any;
					} catch (e) {
						// ignore
					}
				}
				// merge Ekstrakurikuler header if ekstrak columns exist
				if (ekstrakRows.length) {
					const kokCount = kokRows.length || 0;
					const eksStartCol = subjectEndCol + 1 + kokCount;
					const eksEndCol = eksStartCol + ekstrakRows.length - 1;
					try {
						const eksRange = `${colLetter(eksStartCol)}${intrakRowIndex}:${colLetter(eksEndCol)}${intrakRowIndex}`;
						ws.mergeCells(eksRange);
						const eksCell = ws.getCell(`${colLetter(eksStartCol)}${intrakRowIndex}`);
						eksCell.value = 'Ekstrakurikuler';
						eksCell.font = { bold: true } as any;
						eksCell.alignment = { horizontal: 'center', vertical: 'middle' } as any;
					} catch (e) {
						// ignore
					}
				}
			} catch (e) {
				// ignore if merge fails for any reason
				console.warn('failed to merge/style Intrakurikuler row', e);
			}

			// Additionally merge specific pairs across row 4 and 5 as requested (A4:A5, B4:B5, L4:L5, M4:M5, N4:N5)
			try {
				// keep existing merges and also merge O4:O5 and P4:P5 per request
				const mergePairs = ['A4:A5', 'B4:B5', 'L4:L5', 'M4:M5', 'N4:N5', 'O4:O5', 'P4:P5'];
				for (const r of mergePairs) {
					try {
						const [topAddr, bottomAddr] = r.split(':');
						// read existing values (prefer bottom/header row value if present)
						let topVal: any = null;
						let bottomVal: any = null;
						try {
							topVal = ws.getCell(topAddr).value;
						} catch (e) {
							topVal = null;
						}
						try {
							bottomVal = ws.getCell(bottomAddr).value;
						} catch (e) {
							bottomVal = null;
						}
						const chosen =
							bottomVal !== null && bottomVal !== undefined && bottomVal !== ''
								? bottomVal
								: topVal;
						ws.mergeCells(r);
						const cell = ws.getCell(topAddr);
						if (chosen !== null && chosen !== undefined) cell.value = chosen;
						cell.alignment = { horizontal: 'center', vertical: 'middle' } as any;
						// keep header-like emphasis for these merged cells
						cell.font = { bold: true } as any;
					} catch (inner) {
						// ignore individual failures (e.g., if column doesn't exist for small subject sets)
					}
				}
			} catch (e) {
				console.warn('failed to apply additional merges for A/B/L/M/N', e);
			}

			// Style and merge title/subtitle rows so they span to the rightmost column dynamically
			// Merge A1 -> lastCol (title) and A2 -> lastCol (subtitle) to accommodate dynamic columns
			// Use centerContinuous (center-across-selection) for title instead of merging,
			// which tends to render more consistently across Excel clients.
			try {
				let titleVal: any = null;
				try {
					titleVal = ws.getCell('A1').value;
				} catch (e) {
					titleVal = null;
				}
				const titleCell = ws.getCell('A1');
				if (titleVal !== null && titleVal !== undefined) titleCell.value = String(titleVal).trim();
				titleCell.font = { bold: true, size: 12 } as any;
				const centerContinuous = {
					horizontal: 'centerContinuous',
					vertical: 'middle',
					wrapText: false
				} as any;
				// apply centerContinuous to every cell in the visual range so Excel shows centered text
				for (let c = 1; c <= lastCol; c++) {
					try {
						ws.getCell(`${colLetter(c)}1`).alignment = centerContinuous;
					} catch (e) {
						// ignore
					}
				}
				ws.getRow(1).height = 22;
			} catch (e) {
				// ignore
			}

			// Use centerContinuous for subtitle as well
			try {
				let subtitleVal: any = null;
				try {
					subtitleVal = ws.getCell('A2').value;
				} catch (e) {
					subtitleVal = null;
				}
				const subCell = ws.getCell('A2');
				if (subtitleVal !== null && subtitleVal !== undefined)
					subCell.value = String(subtitleVal).trim();
				const centerContinuous = {
					horizontal: 'centerContinuous',
					vertical: 'middle',
					wrapText: false
				} as any;
				for (let c = 1; c <= lastCol; c++) {
					try {
						ws.getCell(`${colLetter(c)}2`).alignment = centerContinuous;
					} catch (e) {
						// ignore
					}
				}
				ws.getRow(2).height = 16;
			} catch (e) {
				// ignore
			}

			// Also apply centerContinuous alignment as a compatibility fallback to every cell
			for (let c = 1; c <= lastCol; c++) {
				const cellAddr1 = `${colLetter(c)}1`;
				const cellAddr2 = `${colLetter(c)}2`;
				try {
					ws.getCell(cellAddr1).alignment = {
						horizontal: 'centerContinuous',
						vertical: 'middle',
						wrapText: false
					} as any;
				} catch (e) {
					// ignore individual failures but continue
				}
				try {
					ws.getCell(cellAddr2).alignment = {
						horizontal: 'centerContinuous',
						vertical: 'middle',
						wrapText: false
					} as any;
				} catch (e) {
					// ignore individual failures but continue
				}
			}

			// Bold header (header is now on row 5 because we inserted the Intrakurikuler row at row 4)
			const headerRow = ws.getRow(5);
			headerRow.font = { bold: true } as any;

			// Rotate subject header text up and enable wrapText
			try {
				const subjectCount = subjectCols.length;
				const subjectStartCol = 3; // C
				const subjectEndCol = 2 + subjectCount;
				// increase header row height to accommodate rotated text
				headerRow.height = 60;
				for (let c = subjectStartCol; c <= subjectEndCol; c++) {
					const cell = headerRow.getCell(c);
					// rotate text up, wrap, bottom-align and center horizontally
					cell.alignment = {
						textRotation: 90,
						wrapText: true,
						vertical: 'bottom',
						horizontal: 'center'
					} as any;
					// narrow the subject column width to fit rotated text
					if (ws.columns && ws.columns[c - 1]) {
						ws.columns[c - 1].width = 6;
					}
				}
				// rotate kok headers similarly (if any kok columns exist)
				const kokCount = kokRows.length || 0;
				if (kokCount) {
					const kokStartCol = subjectEndCol + 1;
					const kokEndCol = kokStartCol + kokCount - 1;
					for (let c = kokStartCol; c <= kokEndCol; c++) {
						const cell = headerRow.getCell(c);
						cell.alignment = {
							textRotation: 90,
							wrapText: true,
							vertical: 'bottom',
							horizontal: 'center'
						} as any;
						// narrow kok column width to match rotated header
						if (ws.columns && ws.columns[c - 1]) {
							ws.columns[c - 1].width = 6;
						}
					}
				}
				// rotate ekstrak headers similarly (if any ekstrak columns exist)
				const ekstraCount = ekstrakRows.length || 0;
				if (ekstraCount) {
					const ekstraStartCol = subjectEndCol + 1 + kokCount;
					const ekstraEndCol = ekstraStartCol + ekstraCount - 1;
					for (let c = ekstraStartCol; c <= ekstraEndCol; c++) {
						const cell = headerRow.getCell(c);
						cell.alignment = {
							textRotation: 90,
							wrapText: true,
							vertical: 'bottom',
							horizontal: 'center'
						} as any;
						// narrow ekstrak column width to match rotated header
						if (ws.columns && ws.columns[c - 1]) {
							ws.columns[c - 1].width = 6;
						}
					}
				}
			} catch (e) {
				console.warn('failed to rotate header text', e);
			}

			// Add formulas: Jumlah = SUM(subjects per row), Capaian Kelas = ROUND(AVERAGE(subjects per row),2)
			try {
				const subjectCount = subjectCols.length;
				const subjectStartCol = 3; // C
				const subjectEndCol = 2 + subjectCount; // e.g. C..(2+subjectCount)
				const kokCount = kokRows.length || 0;
				const kokStartCol = subjectEndCol + 1;
				const kokEndCol = kokStartCol + kokCount - 1;
				const ekstraCount = ekstrakRows.length || 0;
				const ekstraStartCol = subjectEndCol + 1 + kokCount;
				const ekstraEndCol = ekstraStartCol + ekstraCount - 1;
				const jumlahCol = ekstraCount
					? ekstraEndCol + 1
					: kokCount
						? kokEndCol + 1
						: subjectEndCol + 1;
				const studentStartRow = 6; // header is row 5 (we added Intrakurikuler at row 4), students start at row 6
				const studentCount =
					Array.isArray(meta.murid) && meta.murid.length ? meta.murid.length : 30;
				const capaianCol = jumlahCol + 1;

				for (let i = 0; i < studentCount; i++) {
					const rowNum = studentStartRow + i;
					const start = `${colLetter(subjectStartCol)}${rowNum}`;
					const end = `${colLetter(subjectEndCol)}${rowNum}`;
					const sumFormula = `SUM(${start}:${end})`;
					const avgFormula = `ROUND(AVERAGE(${start}:${end}),2)`;
					const row = ws.getRow(rowNum);
					// set formula cells
					row.getCell(jumlahCol).value = { formula: sumFormula, result: null } as any;
					row.getCell(capaianCol).value = { formula: avgFormula, result: null } as any;
					row.getCell(capaianCol).numFmt = '0.00';
					// enable text wrap for the 'Capaian Kelas' cell so long text wraps inside the cell
					try {
						row.getCell(capaianCol).alignment = {
							wrapText: true,
							vertical: 'middle',
							horizontal: 'center'
						} as any;
					} catch (e) {
						// ignore alignment failures
					}
				}

				// Set class-level average on RATA-RATA row to average the per-student 'Capaian Kelas' cells
				const rataRowNum = studentStartRow + studentCount; // next row after students
				const capaianStartCell = `${colLetter(capaianCol)}${studentStartRow}`;
				const capaianEndCell = `${colLetter(capaianCol)}${studentStartRow + studentCount - 1}`;
				const classAvgFormula = `ROUND(AVERAGE(${capaianStartCell}:${capaianEndCell}),2)`;
				const rataRow = ws.getRow(rataRowNum);
				rataRow.getCell(capaianCol).value = { formula: classAvgFormula, result: null } as any;
				rataRow.getCell(capaianCol).numFmt = '0.00';
				try {
					rataRow.getCell(capaianCol).alignment = {
						wrapText: true,
						vertical: 'middle',
						horizontal: 'center'
					} as any;
				} catch (e) {
					// ignore
				}
				// Merge the 'RATA-RATA' label cell with the cell to its right without losing content
				try {
					const rataLeftAddr = `A${rataRowNum}`;
					const rataRightAddr = `B${rataRowNum}`;
					let leftVal: any = null;
					let rightVal: any = null;
					try {
						leftVal = ws.getCell(rataLeftAddr).value;
					} catch (e) {
						leftVal = null;
					}
					try {
						rightVal = ws.getCell(rataRightAddr).value;
					} catch (e) {
						rightVal = null;
					}
					const chosen =
						leftVal !== null && leftVal !== undefined && leftVal !== '' ? leftVal : rightVal;
					ws.mergeCells(`${rataLeftAddr}:${rataRightAddr}`);
					const rataCell = ws.getCell(rataLeftAddr);
					if (chosen !== null && chosen !== undefined) rataCell.value = chosen;
					rataCell.alignment = { horizontal: 'left', vertical: 'middle' } as any;
					rataCell.font = { bold: true } as any;
				} catch (e) {
					// ignore merge errors for rata-rata
				}
				// Ensure the special trailing headers (Jumlah, Capaian Kelas, Ket) are merged
				// with the cell above (row 4) so headers remain visually consistent even
				// when the number of subject/kok/ekstra columns change.
				try {
					const ketCol = capaianCol + 1;
					const mergeCols = [jumlahCol, capaianCol, ketCol];
					for (const colIndex of mergeCols) {
						try {
							const topAddr = `${colLetter(colIndex)}4`;
							const bottomAddr = `${colLetter(colIndex)}5`;
							// prefer bottom (header) value if present
							let topVal: any = null;
							let bottomVal: any = null;
							try {
								topVal = ws.getCell(topAddr).value;
							} catch (err) {
								topVal = null;
							}
							try {
								bottomVal = ws.getCell(bottomAddr).value;
							} catch (err) {
								bottomVal = null;
							}
							const chosen =
								bottomVal !== null && bottomVal !== undefined && bottomVal !== ''
									? bottomVal
									: topVal;
							ws.mergeCells(`${topAddr}:${bottomAddr}`);
							const cell = ws.getCell(topAddr);
							if (chosen !== null && chosen !== undefined) cell.value = chosen;
							cell.alignment = { horizontal: 'center', vertical: 'middle' } as any;
							cell.font = { bold: true } as any;
						} catch (inner) {
							// ignore individual merge failures
						}
					}
				} catch (e) {
					// ignore overall failures
				}
				// Align special columns (No, Nama Siswa, Jumlah, Capaian Kelas, Ket) to middle vertically and left horizontally
				try {
					const ketCol = capaianCol + 1;
					const specialCols = [1, 2, jumlahCol, capaianCol, ketCol];
					for (const colIndex of specialCols) {
						// header alignment
						headerRow.getCell(colIndex).alignment = {
							vertical: 'middle',
							horizontal: 'left'
						} as any;
						// column default alignment if available
						if (ws.columns && ws.columns[colIndex - 1]) {
							ws.columns[colIndex - 1].alignment = {
								vertical: 'middle',
								horizontal: 'left'
							} as any;
						}
					}
					// specifically enable wrapText for the Capaian Kelas header/column
					try {
						headerRow.getCell(capaianCol).alignment = {
							vertical: 'middle',
							horizontal: 'left',
							wrapText: true
						} as any;
						if (ws.columns && ws.columns[capaianCol - 1]) {
							ws.columns[capaianCol - 1].alignment = Object.assign(
								{},
								ws.columns[capaianCol - 1].alignment || {},
								{ wrapText: true }
							);
						}
					} catch (e) {
						// ignore
					}
					// Merge signature label rows (each should span one cell to the right: A..B)
					try {
						const studentStartRow = 6; // header is row 5
						const studentCount =
							Array.isArray(meta.murid) && meta.murid.length ? meta.murid.length : 30;
						const rataRowNum = studentStartRow + studentCount; // RATA-RATA row
						// Offsets based on how rows were pushed after RATA-RATA above:
						// +1: blank, +2: blank, +3: blank, +4: 'Mengetahui' row
						// +5: kepala/wali row, +6: blank, +7: 'Kepala <Sekolah>' row
						// +8..+10: gap rows, +11: printed kepala name, +12: NIP row
						const mengetahuiRow = rataRowNum + 4;
						// based on how rows are pushed above, Kepala <Sekolah> is immediately after 'Mengetahui'
						const kepalaSekolahTitleRow = rataRowNum + 5;
						// printed kepala name and NIP are further down (see rows pushed above)
						const printedKepalaRow = rataRowNum + 9;
						const nipRow = rataRowNum + 10;
						const toMerge = [mengetahuiRow, kepalaSekolahTitleRow, printedKepalaRow, nipRow];
						for (const r of toMerge) {
							try {
								const leftAddr = `A${r}`;
								const rightAddr = `B${r}`;
								let leftVal = null;
								let rightVal = null;
								try {
									leftVal = ws.getCell(leftAddr).value;
								} catch (e) {
									leftVal = null;
								}
								try {
									rightVal = ws.getCell(rightAddr).value;
								} catch (e) {
									rightVal = null;
								}
								const chosen =
									leftVal !== null && leftVal !== undefined && leftVal !== '' ? leftVal : rightVal;
								ws.mergeCells(`${leftAddr}:${rightAddr}`);
								const cell = ws.getCell(leftAddr);
								if (chosen !== null && chosen !== undefined) cell.value = chosen;
								cell.alignment = { horizontal: 'left', vertical: 'middle' } as any;
							} catch (inner) {
								// ignore individual merge failures
							}
						}
					} catch (e) {
						// non-fatal
					}
				} catch (e) {
					// ignore
				}
			} catch (e) {
				// ignore if worksheet API differs
				console.warn('failed to set jumlah/capaian formulas', e);
			}

			// Add borders around the table area (from column "No" to "Ket" down to the RATA-RATA row)
			try {
				// Recompute column indices (same logic as above) so this block can run independently
				const subjectCount = subjectCols.length;
				const subjectStartCol = 3; // C
				const subjectEndCol = 2 + subjectCount;
				const kokCount = kokRows.length || 0;
				const kokStartCol = subjectEndCol + 1;
				const kokEndCol = kokStartCol + kokCount - 1;
				const ekstraCount = ekstrakRows.length || 0;
				const ekstraStartCol = subjectEndCol + 1 + kokCount;
				const ekstraEndCol = ekstraStartCol + ekstraCount - 1;
				const jumlahCol = ekstraCount
					? ekstraEndCol + 1
					: kokCount
						? kokEndCol + 1
						: subjectEndCol + 1;
				const capaianCol = jumlahCol + 1;
				const ketCol = capaianCol + 1;

				const studentStartRow = 6; // header is row 5
				const studentCount =
					Array.isArray(meta.murid) && meta.murid.length ? meta.murid.length : 30;
				const rataRowNum = studentStartRow + studentCount; // RATA-RATA row

				// Apply thin border to every cell in the rectangle from A4 to {Ket}{RATA}
				const topRow = 4; // start above header so merges remain enclosed
				const bottomRow = rataRowNum;
				for (let r = topRow; r <= bottomRow; r++) {
					for (let c = 1; c <= ketCol; c++) {
						try {
							const cell = ws.getCell(`${colLetter(c)}${r}`);
							// preserve existing border if present by shallow-assigning
							cell.border = {
								top: { style: 'thin' },
								left: { style: 'thin' },
								bottom: { style: 'thin' },
								right: { style: 'thin' }
							} as any;
						} catch (inner) {
							// ignore individual cell failures (e.g., out-of-range)
						}
					}
				}
			} catch (e) {
				// non-fatal: continue if border application fails on some worksheet implementations
				console.warn('failed to apply table borders', e);
			}

			// Write workbook to buffer and trigger download
			const buffer = await workbook.xlsx.writeBuffer();
			// writeBuffer returns ArrayBuffer or ArrayBufferView; cast to any so Blob accepts it
			const blob = new Blob([buffer as any], {
				type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			const filename = `${(schoolName || 'leger').replace(/[^a-z0-9\-_ ]/gi, '_')}_leger.xlsx`;
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		} catch (err) {
			console.error('downloadLeger error', err);
			alert('Gagal mendownload leger. Lihat console untuk detail.');
		}
	}
</script>

<button
	class="btn btn-primary btn-soft shadow-none max-sm:w-full"
	on:click={downloadLeger}
	title="Download Leger (Excel)"><Icon name="download" />Download Leger (.xlsx)</button
>
