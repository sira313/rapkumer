import { createClient } from '@libsql/client';

const DEFAULT_DB_URL = 'file:./data/database.sqlite3';
const dbUrl = process.env.DB_URL || DEFAULT_DB_URL;
const client = createClient({ url: dbUrl });

const stats = { copied: 0, skipped: 0 };

async function main() {
	console.log('=== Copy Semester Ganjil ke Genap ===\n');

	// 1. Find active tahun ajaran
	const taRows = await client.execute(
		`SELECT id, nama FROM tahun_ajaran WHERE is_aktif = 1 LIMIT 1`
	);
	if (taRows.rows.length === 0) {
		console.log('Tidak ada tahun ajaran aktif.');
		return;
	}
	const ta = taRows.rows[0];
	console.log(`Tahun Ajaran: ${ta.nama} (ID: ${ta.id})`);

	// 2. Get semesters
	const semRows = await client.execute({
		sql: `SELECT id, tipe, nama FROM semester WHERE tahun_ajaran_id = ?`,
		args: [ta.id]
	});
	const semesterGanjil = semRows.rows.find((r) => r.tipe === 'ganjil');
	const semesterGenap = semRows.rows.find((r) => r.tipe === 'genap');
	if (!semesterGanjil || !semesterGenap) {
		console.log('Semester ganjil atau genap tidak ditemukan.');
		return;
	}
	console.log(`Semester Ganjil: ${semesterGanjil.nama} (ID: ${semesterGanjil.id})`);
	console.log(`Semester Genap:  ${semesterGenap.nama} (ID: ${semesterGenap.id})\n`);

	// ── 1. KELAS ──
	console.log('=== 1. Kelas ===');
	const kelasRows = await client.execute({
		sql: `SELECT * FROM kelas WHERE semester_id = ?`,
		args: [semesterGanjil.id]
	});
	console.log(`Ditemukan ${kelasRows.rows.length} kelas di ganjil.\n`);

	const kelasMap = new Map();
	for (const k of kelasRows.rows) {
		const existing = await client.execute({
			sql: `SELECT id FROM kelas WHERE sekolah_id = ? AND semester_id = ? AND nama = ? LIMIT 1`,
			args: [k.sekolah_id, semesterGenap.id, k.nama]
		});
		if (existing.rows.length > 0) {
			kelasMap.set(k.id, existing.rows[0].id);
			stats.skipped++;
			continue;
		}
		const r = await client.execute({
			sql: `INSERT INTO kelas (sekolah_id, tahun_ajaran_id, semester_id, nama, fase, wali_kelas_id, wali_asrama_id, wali_asuh_id, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
				RETURNING id`,
			args: [k.sekolah_id, k.tahun_ajaran_id, semesterGenap.id, k.nama, k.fase, k.wali_kelas_id, k.wali_asrama_id, k.wali_asuh_id]
		});
		kelasMap.set(k.id, r.rows[0].id);
		console.log(`  [OK] Kelas "${k.nama}" → ID ${r.rows[0].id}`);
		stats.copied++;
	}

	if (kelasMap.size === 0) {
		console.log('Tidak ada kelas yang perlu diproses.');
		return;
	}

	const kelasIds = [...kelasMap.keys()];

	// ── 2. MATA PELAJARAN ──
	console.log('\n=== 2. Mata Pelajaran ===');
	const mapelRows = await client.execute({
		sql: `SELECT * FROM mata_pelajaran WHERE kelas_id IN (${kelasIds.join(',')})`
	});
	console.log(`Ditemukan ${mapelRows.rows.length} mapel di ganjil.\n`);

	const mapelMap = new Map();
	for (const m of mapelRows.rows) {
		const genapKelasId = kelasMap.get(m.kelas_id);
		if (!genapKelasId) continue;

		const existing = await client.execute({
			sql: `SELECT id FROM mata_pelajaran WHERE kelas_id = ? AND nama = ? LIMIT 1`,
			args: [genapKelasId, m.nama]
		});
		if (existing.rows.length > 0) {
			mapelMap.set(m.id, existing.rows[0].id);
			stats.skipped++;
			continue;
		}
		const r = await client.execute({
			sql: `INSERT INTO mata_pelajaran (kelas_id, nama, kode, kkm, jenis, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
				RETURNING id`,
			args: [genapKelasId, m.nama, m.kode, m.kkm, m.jenis]
		});
		mapelMap.set(m.id, r.rows[0].id);
		console.log(`  [OK] Mapel "${m.nama}" → ID ${r.rows[0].id}`);
		stats.copied++;
	}

	// ── 3. TUJUAN PEMBELAJARAN ──
	console.log('\n=== 3. Tujuan Pembelajaran ===');
	const tpMap = new Map();
	if (mapelMap.size > 0) {
		const tpRows = await client.execute({
			sql: `SELECT * FROM tujuan_pembelajaran WHERE mata_pelajaran_id IN (${[...mapelMap.keys()].join(',')})`
		});
		console.log(`Ditemukan ${tpRows.rows.length} TP di ganjil.\n`);

		for (const tp of tpRows.rows) {
			const genapMapelId = mapelMap.get(tp.mata_pelajaran_id);
			if (!genapMapelId) continue;

			const existing = await client.execute({
				sql: `SELECT id FROM tujuan_pembelajaran WHERE mata_pelajaran_id = ? AND deskripsi = ? LIMIT 1`,
				args: [genapMapelId, tp.deskripsi]
			});
			if (existing.rows.length > 0) {
				tpMap.set(tp.id, existing.rows[0].id);
				stats.skipped++;
				continue;
			}
			const r = await client.execute({
				sql: `INSERT INTO tujuan_pembelajaran (mata_pelajaran_id, deskripsi, lingkup_materi, bobot, created_at, updated_at)
					VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
					RETURNING id`,
				args: [genapMapelId, tp.deskripsi, tp.lingkup_materi, tp.bobot]
			});
			tpMap.set(tp.id, r.rows[0].id);
			stats.copied++;
		}
	}
	console.log(`Total TP mapping: ${tpMap.size}\n`);

	// ── 4. EKSTRAKURIKULER ──
	console.log('=== 4. Ekstrakurikuler ===');
	const ekstrakRows = await client.execute({
		sql: `SELECT * FROM ekstrakurikuler WHERE kelas_id IN (${kelasIds.join(',')})`
	});
	console.log(`Ditemukan ${ekstrakRows.rows.length} ekstrakurikuler di ganjil.\n`);

	const ekstrakMap = new Map();
	for (const ek of ekstrakRows.rows) {
		const genapKelasId = kelasMap.get(ek.kelas_id);
		if (!genapKelasId) continue;

		const existing = await client.execute({
			sql: `SELECT id FROM ekstrakurikuler WHERE kelas_id = ? AND nama = ? LIMIT 1`,
			args: [genapKelasId, ek.nama]
		});
		if (existing.rows.length > 0) {
			ekstrakMap.set(ek.id, existing.rows[0].id);
			stats.skipped++;
			continue;
		}
		const r = await client.execute({
			sql: `INSERT INTO ekstrakurikuler (kelas_id, nama, created_at, updated_at)
				VALUES (?, ?, datetime('now'), datetime('now'))
				RETURNING id`,
			args: [genapKelasId, ek.nama]
		});
		ekstrakMap.set(ek.id, r.rows[0].id);
		console.log(`  [OK] Ekstrakurikuler "${ek.nama}" → ID ${r.rows[0].id}`);
		stats.copied++;
	}

	// ── 5. EKSTRAKURIKULER TUJUAN ──
	console.log('\n=== 5. Tujuan Ekstrakurikuler ===');
	const ekstrakTujuanMap = new Map();
	if (ekstrakMap.size > 0) {
		const ekTujuanRows = await client.execute({
			sql: `SELECT * FROM ekstrakurikuler_tujuan WHERE ekstrakurikuler_id IN (${[...ekstrakMap.keys()].join(',')})`
		});
		console.log(`Ditemukan ${ekTujuanRows.rows.length} tujuan ekstrakurikuler.\n`);

		for (const t of ekTujuanRows.rows) {
			const genapEkId = ekstrakMap.get(t.ekstrakurikuler_id);
			if (!genapEkId) continue;

			const existing = await client.execute({
				sql: `SELECT id FROM ekstrakurikuler_tujuan WHERE ekstrakurikuler_id = ? AND deskripsi = ? LIMIT 1`,
				args: [genapEkId, t.deskripsi]
			});
			if (existing.rows.length > 0) {
				ekstrakTujuanMap.set(t.id, existing.rows[0].id);
				stats.skipped++;
				continue;
			}
			const r = await client.execute({
				sql: `INSERT INTO ekstrakurikuler_tujuan (ekstrakurikuler_id, deskripsi, created_at, updated_at)
					VALUES (?, ?, datetime('now'), datetime('now'))
					RETURNING id`,
				args: [genapEkId, t.deskripsi]
			});
			ekstrakTujuanMap.set(t.id, r.rows[0].id);
			stats.copied++;
		}
	}
	console.log(`Total tujuan ekstrakurikuler mapping: ${ekstrakTujuanMap.size}\n`);

	// ── 6. MURID ──
	console.log('=== 6. Murid ===');
	const muridRows = await client.execute({
		sql: `SELECT * FROM murid WHERE kelas_id IN (${kelasIds.join(',')}) AND semester_id = ?`,
		args: [semesterGanjil.id]
	});
	console.log(`Ditemukan ${muridRows.rows.length} murid di ganjil.\n`);

	const muridMap = new Map();
	for (const mur of muridRows.rows) {
		const genapKelasId = kelasMap.get(mur.kelas_id);
		if (!genapKelasId) continue;

		const existing = await client.execute({
			sql: `SELECT id FROM murid WHERE sekolah_id = ? AND semester_id = ? AND nis = ? LIMIT 1`,
			args: [mur.sekolah_id, semesterGenap.id, mur.nis]
		});
		if (existing.rows.length > 0) {
			muridMap.set(mur.id, existing.rows[0].id);
			stats.skipped++;
			continue;
		}
		const r = await client.execute({
			sql: `INSERT INTO murid (nis, nisn, sekolah_id, semester_id, kelas_id, nama, tempat_lahir, tanggal_lahir, jenis_kelamin, agama, pendidikan_sebelumnya, tanggal_masuk, alamat_id, ibu_id, ayah_id, wali_id, foto, wali_asuh_nama, wali_asuh_nip, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
				RETURNING id`,
			args: [mur.nis, mur.nisn, mur.sekolah_id, semesterGenap.id, genapKelasId, mur.nama, mur.tempat_lahir, mur.tanggal_lahir, mur.jenis_kelamin, mur.agama, mur.pendidikan_sebelumnya, mur.tanggal_masuk, mur.alamat_id, mur.ibu_id, mur.ayah_id, mur.wali_id, mur.foto, mur.wali_asuh_nama, mur.wali_asuh_nip]
		});
		muridMap.set(mur.id, r.rows[0].id);
		console.log(`  [OK] Murid "${mur.nama}" (NIS: ${mur.nis}) → ID ${r.rows[0].id}`);
		stats.copied++;
	}

	// ── 7. KOKURIKULER ──
	console.log('\n=== 7. Kokurikuler ===');
	const kokurikulerRows = await client.execute({
		sql: `SELECT * FROM kokurikuler WHERE kelas_id IN (${kelasIds.join(',')})`
	});
	console.log(`Ditemukan ${kokurikulerRows.rows.length} kokurikuler di ganjil.\n`);

	const kokurikulerMap = new Map();
	for (const kok of kokurikulerRows.rows) {
		const genapKelasId = kelasMap.get(kok.kelas_id);
		if (!genapKelasId) continue;

		const existing = await client.execute({
			sql: `SELECT id FROM kokurikuler WHERE kode = ? LIMIT 1`,
			args: [kok.kode]
		});
		if (existing.rows.length > 0) {
			kokurikulerMap.set(kok.id, existing.rows[0].id);
			stats.skipped++;
			continue;
		}
		const r = await client.execute({
			sql: `INSERT INTO kokurikuler (kelas_id, kode, dimensi, tujuan, created_at, updated_at)
				VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
				RETURNING id`,
			args: [genapKelasId, kok.kode, kok.dimensi, kok.tujuan]
		});
		kokurikulerMap.set(kok.id, r.rows[0].id);
		console.log(`  [OK] Kokurikuler "${kok.kode}" → ID ${r.rows[0].id}`);
		stats.copied++;
	}

	// ── 8. KEASRAMAAN ──
	console.log('\n=== 8. Keasramaan ===');
	const keasramaanRows = await client.execute({
		sql: `SELECT * FROM keasramaan WHERE kelas_id IN (${kelasIds.join(',')})`
	});
	console.log(`Ditemukan ${keasramaanRows.rows.length} keasramaan di ganjil.\n`);

	const keasramaanMap = new Map();
	for (const ks of keasramaanRows.rows) {
		const genapKelasId = kelasMap.get(ks.kelas_id);
		if (!genapKelasId) continue;

		const existing = await client.execute({
			sql: `SELECT id FROM keasramaan WHERE kelas_id = ? AND nama = ? LIMIT 1`,
			args: [genapKelasId, ks.nama]
		});
		if (existing.rows.length > 0) {
			keasramaanMap.set(ks.id, existing.rows[0].id);
			stats.skipped++;
			continue;
		}
		const r = await client.execute({
			sql: `INSERT INTO keasramaan (kelas_id, nama, created_at, updated_at)
				VALUES (?, ?, datetime('now'), datetime('now'))
				RETURNING id`,
			args: [genapKelasId, ks.nama]
		});
		keasramaanMap.set(ks.id, r.rows[0].id);
		console.log(`  [OK] Keasramaan "${ks.nama}" → ID ${r.rows[0].id}`);
		stats.copied++;
	}

	// ── 9. KEASRAMAAN INDIKATOR ──
	console.log('\n=== 9. Indikator Keasramaan ===');
	const indikatorMap = new Map();
	if (keasramaanMap.size > 0) {
		const indikatorRows = await client.execute({
			sql: `SELECT * FROM keasramaan_indikator WHERE keasramaan_id IN (${[...keasramaanMap.keys()].join(',')})`
		});
		console.log(`Ditemukan ${indikatorRows.rows.length} indikator keasramaan.\n`);

		for (const ind of indikatorRows.rows) {
			const genapKsId = keasramaanMap.get(ind.keasramaan_id);
			if (!genapKsId) continue;

			const existing = await client.execute({
				sql: `SELECT id FROM keasramaan_indikator WHERE keasramaan_id = ? AND deskripsi = ? LIMIT 1`,
				args: [genapKsId, ind.deskripsi]
			});
			if (existing.rows.length > 0) {
				indikatorMap.set(ind.id, existing.rows[0].id);
				stats.skipped++;
				continue;
			}
			const r = await client.execute({
				sql: `INSERT INTO keasramaan_indikator (keasramaan_id, deskripsi, created_at, updated_at)
					VALUES (?, ?, datetime('now'), datetime('now'))
					RETURNING id`,
				args: [genapKsId, ind.deskripsi]
			});
			indikatorMap.set(ind.id, r.rows[0].id);
			stats.copied++;
		}
	}
	console.log(`Total indikator keasramaan mapping: ${indikatorMap.size}\n`);

	// ── 10. KEASRAMAAN TUJUAN ──
	console.log('=== 10. Tujuan Keasramaan ===');
	const tujuanKeasramaanMap = new Map();
	if (indikatorMap.size > 0) {
		const tujuanKeasramaanRows = await client.execute({
			sql: `SELECT * FROM keasramaan_tujuan WHERE indikator_id IN (${[...indikatorMap.keys()].join(',')})`
		});
		console.log(`Ditemukan ${tujuanKeasramaanRows.rows.length} tujuan keasramaan.\n`);

		for (const t of tujuanKeasramaanRows.rows) {
			const genapIndId = indikatorMap.get(t.indikator_id);
			if (!genapIndId) continue;

			const existing = await client.execute({
				sql: `SELECT id FROM keasramaan_tujuan WHERE indikator_id = ? AND deskripsi = ? LIMIT 1`,
				args: [genapIndId, t.deskripsi]
			});
			if (existing.rows.length > 0) {
				tujuanKeasramaanMap.set(t.id, existing.rows[0].id);
				stats.skipped++;
				continue;
			}
			const r = await client.execute({
				sql: `INSERT INTO keasramaan_tujuan (indikator_id, deskripsi, created_at, updated_at)
					VALUES (?, ?, datetime('now'), datetime('now'))
					RETURNING id`,
				args: [genapIndId, t.deskripsi]
			});
			tujuanKeasramaanMap.set(t.id, r.rows[0].id);
			stats.copied++;
		}
	}
	console.log(`Total tujuan keasramaan mapping: ${tujuanKeasramaanMap.size}\n`);

	// ══════════════════════════════════════
	//  STUDENT-LEVEL DATA (always executed!)
	// ══════════════════════════════════════

	if (muridMap.size === 0) {
		console.log('Tidak ada murid, skip data penilaian.');
		return;
	}

	const muridIds = [...muridMap.keys()];

	// ── 11. MURID MATA PELAJARAN ──
	console.log('\n=== 11. Murid Mata Pelajaran ===');
	const mmRows = await client.execute({
		sql: `SELECT * FROM murid_mata_pelajaran WHERE murid_id IN (${muridIds.join(',')})`
	});
	console.log(`Ditemukan ${mmRows.rows.length} relasi murid-mapel.\n`);
	for (const mm of mmRows.rows) {
		const newMuridId = muridMap.get(mm.murid_id);
		const newMapelId = mapelMap.get(mm.mata_pelajaran_id);
		if (!newMuridId || !newMapelId) continue;
		try {
			await client.execute({
				sql: `INSERT OR IGNORE INTO murid_mata_pelajaran (murid_id, mata_pelajaran_id, nilai_kosong, created_at, updated_at)
					VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
				args: [newMuridId, newMapelId, mm.nilai_kosong]
			});
			stats.copied++;
		} catch { stats.skipped++; }
	}

	// ── 12. KEHADIRAN ──
	console.log('\n=== 12. Kehadiran ===');
	const khRows = await client.execute({
		sql: `SELECT * FROM kehadiran_murid WHERE murid_id IN (${muridIds.join(',')})`
	});
	console.log(`Ditemukan ${khRows.rows.length} kehadiran.\n`);
	for (const kh of khRows.rows) {
		const newMuridId = muridMap.get(kh.murid_id);
		if (!newMuridId) continue;
		try {
			await client.execute({
				sql: `INSERT OR IGNORE INTO kehadiran_murid (murid_id, sakit, izin, alfa, created_at, updated_at)
					VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
				args: [newMuridId, kh.sakit, kh.izin, kh.alfa]
			});
			stats.copied++;
		} catch { stats.skipped++; }
	}

	// ── 13. CATATAN WALI KELAS ──
	console.log('\n=== 13. Catatan Wali Kelas ===');
	const ctRows = await client.execute({
		sql: `SELECT * FROM catatan_wali_kelas WHERE murid_id IN (${muridIds.join(',')})`
	});
	console.log(`Ditemukan ${ctRows.rows.length} catatan.\n`);
	for (const ct of ctRows.rows) {
		const newMuridId = muridMap.get(ct.murid_id);
		if (!newMuridId) continue;
		try {
			await client.execute({
				sql: `INSERT OR IGNORE INTO catatan_wali_kelas (murid_id, catatan, created_at, updated_at)
					VALUES (?, ?, datetime('now'), datetime('now'))`,
				args: [newMuridId, ct.catatan]
			});
			stats.copied++;
		} catch { stats.skipped++; }
	}

	// ── 14. KEPUTUSAN MURID ──
	console.log('\n=== 14. Keputusan Murid ===');
	const kpRows = await client.execute({
		sql: `SELECT * FROM keputusan_murid WHERE murid_id IN (${muridIds.join(',')})`
	});
	console.log(`Ditemukan ${kpRows.rows.length} keputusan.\n`);
	for (const kp of kpRows.rows) {
		const newMuridId = muridMap.get(kp.murid_id);
		if (!newMuridId) continue;
		try {
			await client.execute({
				sql: `INSERT OR IGNORE INTO keputusan_murid (murid_id, naik, created_at, updated_at)
					VALUES (?, ?, datetime('now'), datetime('now'))`,
				args: [newMuridId, kp.naik]
			});
			stats.copied++;
		} catch { stats.skipped++; }
	}

	// ── 15. ASESMEN SUMATIF ──
	console.log('\n=== 15. Asesmen Sumatif ===');
	const asRows = await client.execute({
		sql: `SELECT * FROM asesmen_sumatif WHERE murid_id IN (${muridIds.join(',')})`
	});
	console.log(`Ditemukan ${asRows.rows.length} asesmen sumatif.\n`);
	for (const as of asRows.rows) {
		const newMuridId = muridMap.get(as.murid_id);
		const newMapelId = mapelMap.get(as.mata_pelajaran_id);
		if (!newMuridId || !newMapelId) continue;
		try {
			await client.execute({
				sql: `INSERT OR IGNORE INTO asesmen_sumatif (murid_id, mata_pelajaran_id, na_lingkup, sts_tes, sts_non_tes, sts, sas_tes, sas_non_tes, sas, nilai_akhir, nilai_akhir_rts, created_at, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
				args: [newMuridId, newMapelId, as.na_lingkup, as.sts_tes, as.sts_non_tes, as.sts, as.sas_tes, as.sas_non_tes, as.sas, as.nilai_akhir, as.nilai_akhir_rts]
			});
			stats.copied++;
		} catch { stats.skipped++; }
	}

	// ── 16. ASESMEN SUMATIF TUJUAN ──
	console.log('\n=== 16. Asesmen Sumatif Tujuan ===');
	const astRows = await client.execute({
		sql: `SELECT * FROM asesmen_sumatif_tujuan WHERE murid_id IN (${muridIds.join(',')})`
	});
	console.log(`Ditemukan ${astRows.rows.length} asesmen sumatif tujuan.\n`);
	for (const ast of astRows.rows) {
		const newMuridId = muridMap.get(ast.murid_id);
		const newMapelId = mapelMap.get(ast.mata_pelajaran_id);
		const newTpId = tpMap.get(ast.tujuan_pembelajaran_id);
		if (!newMuridId || !newMapelId || !newTpId) continue;
		try {
			await client.execute({
				sql: `INSERT OR IGNORE INTO asesmen_sumatif_tujuan (murid_id, mata_pelajaran_id, tujuan_pembelajaran_id, nilai, created_at, updated_at)
					VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
				args: [newMuridId, newMapelId, newTpId, ast.nilai]
			});
			stats.copied++;
		} catch { stats.skipped++; }
	}

	// ── 17. ASESMEN FORMATIF ──
	console.log('\n=== 17. Asesmen Formatif ===');
	const afRows = await client.execute({
		sql: `SELECT * FROM asesmen_formatif WHERE murid_id IN (${muridIds.join(',')})`
	});
	console.log(`Ditemukan ${afRows.rows.length} asesmen formatif.\n`);
	for (const af of afRows.rows) {
		const newMuridId = muridMap.get(af.murid_id);
		const newMapelId = mapelMap.get(af.mata_pelajaran_id);
		const newTpId = tpMap.get(af.tujuan_pembelajaran_id);
		if (!newMuridId || !newMapelId || !newTpId) continue;
		try {
			await client.execute({
				sql: `INSERT OR IGNORE INTO asesmen_formatif (murid_id, mata_pelajaran_id, tujuan_pembelajaran_id, tuntas, catatan, dinilai_pada, created_at, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
				args: [newMuridId, newMapelId, newTpId, af.tuntas, af.catatan, af.dinilai_pada]
			});
			stats.copied++;
		} catch { stats.skipped++; }
	}

	// ── 18. MURID EKSTRAKURIKULER ──
	if (ekstrakMap.size > 0) {
		console.log('\n=== 18. Murid Ekstrakurikuler ===');
		const meRows = await client.execute({
			sql: `SELECT * FROM murid_ekstrakurikuler WHERE murid_id IN (${muridIds.join(',')})`
		});
		console.log(`Ditemukan ${meRows.rows.length} relasi murid-ekstrakurikuler.\n`);
		for (const me of meRows.rows) {
			const newMuridId = muridMap.get(me.murid_id);
			const newEkId = ekstrakMap.get(me.ekstrakurikuler_id);
			if (!newMuridId || !newEkId) continue;
			try {
				await client.execute({
					sql: `INSERT OR IGNORE INTO murid_ekstrakurikuler (murid_id, ekstrakurikuler_id, nilai_kosong, created_at, updated_at)
						VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
					args: [newMuridId, newEkId, me.nilai_kosong]
				});
				stats.copied++;
			} catch { stats.skipped++; }
		}
	}

	// ── 19. ASESMEN EKSTRAKURIKULER ──
	if (ekstrakTujuanMap.size > 0) {
		console.log('\n=== 19. Asesmen Ekstrakurikuler ===');
		const aeRows = await client.execute({
			sql: `SELECT * FROM asesmen_ekstrakurikuler WHERE murid_id IN (${muridIds.join(',')})`
		});
		console.log(`Ditemukan ${aeRows.rows.length} asesmen ekstrakurikuler.\n`);
		for (const ae of aeRows.rows) {
			const newMuridId = muridMap.get(ae.murid_id);
			const newEkId = ekstrakMap.get(ae.ekstrakurikuler_id);
			const newTujuanId = ekstrakTujuanMap.get(ae.tujuan_id);
			if (!newMuridId || !newEkId || !newTujuanId) continue;
			try {
				await client.execute({
					sql: `INSERT OR IGNORE INTO asesmen_ekstrakurikuler (murid_id, ekstrakurikuler_id, tujuan_id, kategori, dinilai_pada, created_at, updated_at)
						VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
					args: [newMuridId, newEkId, newTujuanId, ae.kategori, ae.dinilai_pada]
				});
				stats.copied++;
			} catch { stats.skipped++; }
		}
	}

	// ── 20. ASESMEN KOKURIKULER ──
	if (kokurikulerMap.size > 0) {
		console.log('\n=== 20. Asesmen Kokurikuler ===');
		const akRows = await client.execute({
			sql: `SELECT * FROM asesmen_kokurikuler WHERE murid_id IN (${muridIds.join(',')})`
		});
		console.log(`Ditemukan ${akRows.rows.length} asesmen kokurikuler.\n`);
		for (const ak of akRows.rows) {
			const newMuridId = muridMap.get(ak.murid_id);
			const newKokId = kokurikulerMap.get(ak.kokurikuler_id);
			if (!newMuridId || !newKokId) continue;
			try {
				await client.execute({
					sql: `INSERT OR IGNORE INTO asesmen_kokurikuler (murid_id, kokurikuler_id, dimensi, kategori, dinilai_pada, created_at, updated_at)
						VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
					args: [newMuridId, newKokId, ak.dimensi, ak.kategori, ak.dinilai_pada]
				});
				stats.copied++;
			} catch { stats.skipped++; }
		}
	}

	// ── 21. ASESMEN KEASRAMAAN ──
	if (tujuanKeasramaanMap.size > 0) {
		console.log('\n=== 21. Asesmen Keasramaan ===');
		const aksRows = await client.execute({
			sql: `SELECT * FROM asesmen_keasramaan WHERE murid_id IN (${muridIds.join(',')})`
		});
		console.log(`Ditemukan ${aksRows.rows.length} asesmen keasramaan.\n`);
		for (const aks of aksRows.rows) {
			const newMuridId = muridMap.get(aks.murid_id);
			const newKsId = keasramaanMap.get(aks.keasramaan_id);
			const newTujuanId = tujuanKeasramaanMap.get(aks.tujuan_id);
			if (!newMuridId || !newKsId || !newTujuanId) continue;
			try {
				await client.execute({
					sql: `INSERT OR IGNORE INTO asesmen_keasramaan (murid_id, keasramaan_id, tujuan_id, kategori, dinilai_pada, created_at, updated_at)
						VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
					args: [newMuridId, newKsId, newTujuanId, aks.kategori, aks.dinilai_pada]
				});
				stats.copied++;
			} catch { stats.skipped++; }
		}
	}

	// SUMMARY
	console.log('\n' + '='.repeat(50));
	console.log('SUMMARY');
	console.log('='.repeat(50));
	console.log(`  Copied:  ${stats.copied}`);
	console.log(`  Skipped: ${stats.skipped}`);
	console.log('='.repeat(50));
}

main()
	.then(async () => {
		console.log('\nSelesai.');
		await client.close();
		process.exit(0);
	})
	.catch(async (err) => {
		console.error('\nGagal:', err);
		await client.close();
		process.exit(1);
	});
