import { jsonrepair } from 'jsonrepair';

export type LampiranInput = {
	apiKey: string;
	model: string;
	baseUrl: string | null;
	mapelNama: string;
	kelasLabel: string;
	fase: string | null;
	lingkupMateri: string;
	capaianPembelajaran: string;
	tujuanPembelajaran: string[];
	asesmen: string[];
	muridNames: string[];
	karakteristik: string;
	profilLulusan: string[];
	inputCustom: string;
	// Langkah pembelajaran dari RPM (agar lampiran terkait dengan kegiatan).
	kegiatanAwal: string;
	memahami: string;
	mengaplikasi: string;
	merefleksi: string;
	penutup: string;
	pedagogicalModel: string;
};

export type RubrikRow = {
	aspek: string;
	indikator: string;
	skor: string;
	kriteria: string;
};

export type AsesmenLampiran = {
	uraian: string;
	instrumen: string;
	rubrik: RubrikRow[];
};

export type LampiranGenerated = {
	formatif: AsesmenLampiran;
	sumatif: AsesmenLampiran;
	lkpd: string;
};

const REQUEST_TIMEOUT_MS = 120_000;

export async function generateLampiran(input: LampiranInput): Promise<LampiranGenerated> {
	const userPrompt = buildLampiranPrompt(input);
	const isGeminiNative = resolveBaseUrl(input.baseUrl).includes(
		'generativelanguage.googleapis.com'
	);
	const schema = isGeminiNative
		? {
				type: 'object',
				properties: {
					k1: asesmenSchema(),
					k2: asesmenSchema(),
					k3: { type: 'string' }
				},
				required: ['k1', 'k2', 'k3']
			}
		: null;
	const text = await requestAiText(input, userPrompt, schema);
	return parseLampiranPayload(text);
}

function asesmenSchema(): Record<string, unknown> {
	return {
		type: 'object',
		properties: {
			uraian: { type: 'string' },
			instrumen: { type: 'string' },
			rubrik: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						aspek: { type: 'string' },
						indikator: { type: 'string' },
						skor: { type: 'string' },
						kriteria: { type: 'string' }
					},
					required: ['aspek', 'indikator', 'skor', 'kriteria']
				}
			}
		},
		required: ['uraian', 'instrumen', 'rubrik']
	};
}

function buildLampiranPrompt(input: LampiranInput): string {
	const tpText = input.tujuanPembelajaran.map((tp, i) => `${i + 1}. ${tp}`).join('\n');
	const dimensiText =
		(input.profilLulusan ?? []).map((d, i) => `${i + 1}. ${d}`).join('\n') || '(belum dipilih)';
	const custom = input.inputCustom.trim();
	const lkpdIndividual = /individual|individu|sendiri\s/gi.test(custom);

	return `Kamu adalah pendidik profesional Kurikulum Merdeka. Susun LAMPIRAN RENCANA PEMBELAJARAN MENDALAM (RPM) yang SALING TERKAIT dengan tujuan pembelajaran dan langkah-langkah kegiatan pembelajaran yang sudah disusun. Tulis dalam bahasa Indonesia yang baik, EYD, ringkas, padat, terstruktur.

DATA PEMBELAJARAN:
- Mata Pelajaran: ${input.mapelNama}
- Kelas: ${input.kelasLabel}${input.fase ? ` (Fase ${input.fase.replace(/^Fase\s+/i, '')})` : ''}
- Lingkup Materi: ${input.lingkupMateri}

CAPAIAN PEMBELAJARAN:
${input.capaianPembelajaran}

TUJUAN PEMBELAJARAN (rumusan ABCD):
${tpText}

DIMENSI PROFIL LULUSAN:
${dimensiText}

ASESMEN PEMBELAJARAN DI RPM:
${
	(input.asesmen ?? [])
		.map(
			(a, i) => `[Asesmen ${i + 1}]
${a}`
		)
		.join('\n\n') || '(belum ditulis di RPM)'
}
${input.karakteristik ? `\nKARAKTERISTIK MURID:\n${input.karakteristik}` : ''}

LANGKAH PEMBELAJARAN (dari RPM):
- Kegiatan Awal: ${input.kegiatanAwal}
- Memahami: ${input.memahami}
- Mengaplikasi: ${input.mengaplikasi}
- Merefleksi: ${input.merefleksi}
- Penutup: ${input.penutup}

DAFTAR NAMA MURID KELAS AKTIF:
${(input.muridNames ?? []).join('\n') || '(pendataan murid tidak tersedia)'}

MODEL/STRATEGI PEMBELAJARAN:
${input.pedagogicalModel}
${custom ? `\nPERMINTAAN TAMBAHAN DARI GURU (WAJIB diterapkan):\n${custom}` : ''}

DEFINISI (WAJIB dipahami agar ketiga bagian tidak tertukar satu sama lain):
- PENILAIAN FORMATIF = penilaian yang dilakukan SECARA BERKALA SELAMA proses pembelajaran untuk memantau perkembangan murid dan memberikan umpan balik guna memperbaiki mutu belajar-mengajar. Teknik khas: unjuk kerja, observasi, lembar ceklis diskusi/kelompok, tanya jawab, portofolio proses.
- PENILAIAN SUMATIF = evaluasi yang dilakukan DI AKHIR proses pembelajaran untuk mengukur pencapaian hasil belajar murid secara keseluruhan terhadap tujuan/capaian pembelajaran. Teknik khas: produk akhir (poster, peta konsep, kolase, proyek), tes tertulis akhir, presentasi akhir dengan rubrik.
- LKPD = alat bantu pembelajaran berupa lembaran yang berisi PANDUAN, MATERI RINGKAS, dan TUGAS TERSTRUKTUR yang harus dikerjakan siswa — BUKAN lembar penilaian (rubrik/cek penilaian masuk ke bagian formatif/sumatif).

KELASIFIKASI ENTRI ASESMEN RPM (jangan sampai sumatif tertukar formatif atau sebaliknya):
- Entri asesmen RPM yang Tekniknya BERSIFAT PROSES (unjuk kerja, observasi, ceklis diskusi, tanya jawab, lembar pengamatan selama pembelajaran) → kategori PENILAIAN FORMATIF.
- Entri asesmen RPM yang Tekniknya BERSIFAT HASIL AKHIR/PRODUK (penilaian produk poster/karya, peta konsep/kolase, proyek, tes tertulis akhir, presentasi akhir dengan rubrik) → kategori PENILAIAN SUMATIF.
- Jika hanya ada SATU entri asesmen: pakai entri itu sebagai acuan PENILAIAN FORMATIF, lalu SUMATIF dikembangkan menjadi penilaian produk/tes tertulis akhir yang tetap mengukur Tujuan Pembelajaran yang sama (jangan mengubah teknik formatif menjadi sumatif dan sebaliknya).

Buat TIGA bagian berikut dalam JSON:
1. "k1" — PENILAIAN FORMATIF (bukan sumatif) — MENGACU pada entri asesmen RPM yang BERSIFAT PROSES (paling umum = entri pertama, mis. "Penilaian unjuk kerja dan lembar ceklis observasi diskusi kelompok"):
   - SALIN VERBATIM "Teknik & Instrumen", "Aspek yang Dinilai", dan "Prinsip Assessment" dari entri tersebut ke dalam "uraian". "instrumen" adalah PENJABARAN KONKRET teknik itu (mis. teknik "tes lisan dan lembar ceklis" dijabarkan menjadi daftar butir tes lisan + lembar ceklis berisi indikator/aspek yang dinilai). Boleh menambah butir/rubrik, JANGAN sekali-kali mengganti atau menambah teknik & instrumen di luar yang ada di RPM.
   - "uraian": teknik & instrumen penilaian formatif (mengikuti RPM), waktu pelaksanaan yang menunjuk fase langkah tertentu pada RPM (sebut memahami/mengaplikasi), dan indikator pencapaian yang mengacu pada Tujuan Pembelajaran yang dipilih.
   - TARGET PENILAIAN ADALAH INDIVIDUAL: setiap murid dinilai sendiri-sendiri, BUKAN per kelompok. Susun instrumen agar dapat menilai tiap murid. Jika instrumen berupa lembar observasi/ceklis INDIVIDUAL, masukkan nama-nama murid dari "DAFTAR NAMA MURID KELAS AKTIF" di atas: tulis satu nama per baris (kolom "Nama") lengkap dengan kolom butir/cek/ket yang dinilai. Untuk instrumen lain (mis. tes tertulis), cukup digunakan per murid tanpa perlu mencantumkan daftar nama.
   - "instrumen": SATU teks berisi INSTRUMEN ASESMEN LENGKAP yang siap dipakai — butir-butir menilai ketercapaian Tujuan Pembelajaran. Nyatakan dalam butir bernomor "1. ..." dengan sub-butir "a. ..." bila perlu (mis. lembar pengamatan observasi dengan aspek yang diamati, lembar unjuk kerja dengan tugasnya, atau butir soal uraian singkat). Butir harus UTUH dan MANDIRI: jika soal merujuk data (tabel/gambar/teks bacaan), sertakan data itu langsung di dalam instrumen (tabel tulis sebagai baris "| kolom1 | kolom2 |"; baris pertama = judul kolom/header, TANPA pemisah "---"). JANGAN pernah merujuk "tabel di atas"/"gambar di bawah" yang tidak disertakan. JANGAN hanya merangkum. Setiap butir soal harus mengukur minimal satu Tujuan Pembelajaran yang dipilih di atas. Jika soal pilihan ganda, tulis setiap pilihan jawaban ("a. ...", "b. ...", "c. ...", "d. ..." dst.) pada BARIS TERPISAH, jangan menggabungkan dua pilihan dalam satu baris.
   - "rubrik": ARRAY objek (minimal 2 baris) untuk menilai instrumen di atas, setiap baris: {"aspek":"...","indikator":"...","skor":"0-4 atau rentang","kriteria":"deskripsi perilaku pada skor itu"}. Tampilkan sebagai calon tabel, JANGAN sebagai teks bebas.
2. "k2" — PENILAIAN SUMATIF (objek dengan struktur sama seperti k1: "uraian", "instrumen", "rubrik") — WAJIB MENGACU pada Asesmen Pembelajaran RPM:
   - GUNakan entri asesmen RPM yang bersifat PRODUK/KINERJA AKHIR = entri TERAKHIR dari "ASESMEN PEMBELAJARAN DI RPM" di atas bila ada lebih dari satu (mis. "Penilaian produk poster dan lembar rubrik presentasi"). Pastikan tekniknya memang HASIL AKHIR/PRODUK; jika ternyata entri terakhir masih bersifat proses, gunakan entri berteknik produk paling akhir. Jika hanya ada SATU entri, kembangkan teknik entri tersebut menjadi asesmen produk/tes tertulis AKHIR (ini SUMATIF, bukan formatif).
   - SALIN VERBATIM "Teknik & Instrumen", "Aspek yang Dinilai", dan "Prinsip Assessment" dari entri pilihan ke dalam "uraian". "instrumen" adalah penjabaran konkret teknik itu (mis. teknik "penilaian kinerja produk dengan rubrik analitik" dijabarkan menjadi deskripsi produk/tugas + lembar kinerja yang dinilai). JANGAN mengganti teknik & instrumen di luar entri RPM tersebut.
   - Asesmen ini mengukur ketercapaian Tujuan Pembelajaran yang dipilih dan dilaksanakan di akhir pembelajaran (setelah kegiatan pengalaman belajar).
   - TARGET PENILAIAN ADALAH INDIVIDUAL: setiap murid dinilai sendiri-sendiri, BUKAN per kelompok. Sesuaikan teknik (mis. tes tertulis individu, unjuk kerja per murid) agar hasilnya mencerminkan capaian tiap murid.
   - "instrumen" berisi butir soal/penugasan yang konkret, bernomor ("1. ...", sub-butir "a. ..." bila perlu), dan MANDIRI (semua data rujukan disertakan di dalam teks yang sama), dinilai dengan "rubrik" sebagai array objek (aspek, indikator, skor, kriteria). Setiap butir soal WAJIB mengukur minimal satu Tujuan Pembelajaran yang dipilih di atas (bila diminta soal pilihan ganda, sampai tiap pilihan "a. ..."/"b. ..."/"c. ..."/"d. ..." pada BARIS TERPISAH).
3. "k3" — LEMBAR KERJA MURID (LKPD) (string) — MENGACU pada Asesmen Pembelajaran RPM:
   - LKPD adalah ALAT BANTU latihan (panduan + materi ringkas + tugas terstruktur), bukan lembar penilaian: rubrik/lembar cek penilaian TIDAK dimasukkan ke LKPD (itu milik k1/k2). Isi LKPD harus melatih indikator/aspek yang dinilai pada Asesmen RPM (mis. jika RPM menilai "Kemampuan mengidentifikasi cara menjaga dan melestarikan budaya lokal serta keaktifan berpendapat", maka tugas LKPD berisi mengidentifikasi cara menjaga/melestarikan budaya dan berdiskusi aktif) serta mengikuti langkah-langkah kegiatan RPM.
   - Judul LKPD sesuai lingkup materi, identitas, petunjuk pengerjaan yang ramah murid, lalu langkah kegiatan bernomor berurutan ("1. ...", "2. ...", "3. ...").
   - MODE PENGERJAAN LKPD (mengikuti prompt tambahan guru): ${lkpdIndividual ? 'INDIVIDUAL karena guru meminta LKPD dikerjakan sendiri-sendiri — tulis identitas "Nama" dan "No. Absen" (TANPA "Nama Kelompok"/"Anggota"), tiap murid mengerjakan sendiri' : 'KELOMPOK (default) — tulis identitas "Nama Kelompok" dan "Anggota:" yang mencantumkan setiap anggota pada BARIS TERPISAH ("1. ...", "2. ...", "3. ...")'}.
   - Struktur LKPD rapi dan KONSISTEN: subjudul ("Judul/LEMBAR KERJA PESERTA DIDIK", "Topik:", "Nama Kelompok:", "Nama:", "No. Absen:", "Anggota:", "Petunjuk Pengerjaan:", "Langkah-Langkah Kegiatan:") ditulis SATU PER BARIS (baris sendiri). Setiap DAFTAR bernomor DIMULAI DARI 1 dan TIDAK meneruskan angka dari daftar sebelumnya (mis. "Anggota:" 1–4, lalu "Petunjuk Pengerjaan:" mulai 1 lagi). Nomor urut SENANTIASA 1, 2, 3, ... tanpa lompat maupun sambung. Tiap "Langkah 1:", "Langkah 2:", dst. ditulis di baris sendiri DENGAN TITIK DUA lalu uraian langkah di baris berikutnya — JANGAN menyatukan isi langkah inline setelah dua titik.
   - KETERKUATAN LANGKAH RPM: setiap Langkah pada LKPD WAJIB DIBUAT BERDASARKAN langkah-langkah kegiatan dari RPM (memahami → mengaplikasi) yang tercantum di atas — JANGAN mengarang topik atau aktivitas yang tidak ada di sana. Jika langkah RPM berisi "Murid berdiskusi mengelompokkan bentuk-bentuk peran aktif warga dalam melestarikan tradisi berdasarkan lembar kerja cetak", maka LKPD harus membahas topik dan sumber itu juga (mis. "Identifikasi informasi pada lembar kerja cetak", lalu "Diskusi mengelompokkan bentuk-bentuk peran aktif warga"). Gunakan SAMA PERSIS istilah, topik, dan sumber/bahan yang disebut di langkah RPM (lembar kerja cetak, peta konsep, kolase, video, bacaan, dsb.) — jangan mengganti sumber atau bahan aktivitas.
   - STRUKTUR & BAHASA UNTUK MURID: gunakan KALIMAT BAHASA INDONESIA yang sederhana, singkat, langsung pada perintah, dan mudah dipahami murid. Hindari kalimat panjang berlapis, kata kunci rumit, atau struktur bertingkat yang membingungkan. Bila membuat kolom isian kategori (mis. "Kategori Tradisi & Upacara Adat:", "Kategori Rumah & Pakaian Adat:"), sajikan sebagai TEKS BIASA baris per baris TANPA penomoran yang terpisah dari nama kategorinya — jangan menulis "1." di baris sebelumnya kemudian nama kategorinya di baris lain, hindari pola nomor ambigu.
   - Jaga KONSISTENSI REDAKSI: jangan memakai frasa berbeda untuk hal yang sama (mis. jangan menulis "video yang ditonton" di satu kalimat lalu "bacaan yang telah disimak" untuk stimulus yang sama; pilih SATU istilah dan pakai terus).
   - Isi langkah diorganisasikan dalam DUA tahap kerja yang SETARA fase-fase kegiatan RPM: Tahap 1 orientasi & mengumpulkan data (padanan memahami), lalu Tahap 2 menganalisis data & menyimpulkan/mengkomunikasikan (padanan mengaplikasi). Namun di teks LKPD TULIS HANYA "Langkah 1, Langkah 2, ..." yang berurutan — JANGAN menuliskan kata "Tahap 1"/"Tahap 2"/"(Fase Memahami)"/"(Fase Mengaplikasi)" atau istilah pedagogik lain (tujuan pembelajaran, karakteristik murid, profil lulusan). Label tahap/fase itu untuk guru saja; murid tidak boleh dibuat bingung.
   - Butir pertanyaan/tugas bernomor yang menilai ketercapaian Tujuan Pembelajaran. Jika LKPD butuh data (tabel skor, angket, hasil pengamatan), sertakan data tersebut di dalam LKPD (tabel tulis sebagai baris "| kolom1 | kolom2 |"; baris pertama = judul kolom/header, TANPA pemisah "---") — jangan merujuk tabel/gambar yang tidak disertakan.

Pastikan instrumen formatif & sumatif benar-benar mengukur Tujuan Pembelajaran di atas, dan LKPD selaras dengan langkah kegiatan yang ada di RPM. Konten tiap bagian harus UTUH, LENGKAP, dan MANDIRI: tidak boleh menyebut "tabel di atas"/"gambar berikut" tanpa menyertakan tabel/gambar itu di dalam teks yang sama. STIMULUS HARUS SESUAI ISI: jika instruksi menulis "Simaklah teks bacaan/bacaan berikut", maka yang disajikan setelahnya adalah TEKS BACAAN (paragraf naratif), BUKAN tabel; jika instruksi menulis "Perhatikan tabel berikut", maka yang disajikan adalah TABEL (baris "| kolom | kolom |"); JANGAN menulis instruksi membaca teks lalu mengisinya dengan tabel, atau sebaliknya. Bila terdapat permintaan tambahan guru, wujudkan di dalam ketiga bagian.

Jawab HANYA dengan JSON tanpa teks lain, dengan KUNCI NETRAL yang TEPAT:
{"k1":{"uraian":"...","instrumen":"...","rubrik":[{"aspek":"...","indikator":"...","skor":"...","kriteria":"..."}]},"k2":{...},"k3":"..."}`;
}

async function requestAiText(
	input: LampiranInput,
	userPrompt: string,
	responseSchema: Record<string, unknown> | null
): Promise<string> {
	const base = resolveBaseUrl(input.baseUrl);
	const isGeminiNative = base.includes('generativelanguage.googleapis.com');

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	let response: Response;
	try {
		if (isGeminiNative) {
			const endpoint = `${base.replace(/\/v1beta$/, '')}/v1beta/models/${input.model}:generateContent`;
			response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'x-goog-api-key': input.apiKey },
				signal: controller.signal,
				body: JSON.stringify({
					contents: [{ parts: [{ text: userPrompt }] }],
					generationConfig: {
						responseMimeType: 'application/json',
						...(responseSchema ? { responseSchema } : {}),
						maxOutputTokens: 16384
					}
				})
			});
		} else {
			const endpoint = `${base}/chat/completions`;
			const doFetch = (opts: { json?: boolean; maxTokens?: boolean }) =>
				fetch(endpoint, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.apiKey}` },
					signal: controller.signal,
					body: JSON.stringify({
						model: input.model,
						messages: [{ role: 'user', content: userPrompt }],
						...(opts.json ? { response_format: { type: 'json_object' } } : {}),
						...(opts.maxTokens ? { max_tokens: 16384 } : {})
					})
				});
			const attempt = async (opts: { json?: boolean; maxTokens?: boolean }): Promise<Response> => {
				for (let i = 0; ; i++) {
					try {
						return await doFetch(opts);
					} catch (err) {
						if (i >= 1) throw err;
					}
				}
			};
			response = await attempt({ json: true, maxTokens: true });
			if (response.status === 400 || response.status >= 500) {
				response = await doFetch({ json: false, maxTokens: true });
			}
			if (response.status === 400 || response.status >= 500) {
				response = await doFetch({ json: false, maxTokens: false });
			}
		}
	} catch (err) {
		clearTimeout(timeout);
		if (err instanceof Error && err.name === 'AbortError') {
			throw new Error('Waktu permintaan AI habis. Coba lagi.', { cause: err });
		}
		throw new Error(`Gagal menghubungi layanan AI: ${(err as Error).message}`, { cause: err });
	}
	clearTimeout(timeout);

	if (!response.ok) {
		let detail = '';
		try {
			const body = await response.json();
			detail = (body?.error?.message ?? '') as string;
		} catch {
			// ignore
		}
		console.error(`[ai-lampiran] error status=${response.status} detail=${detail}`);
		if (response.status === 429) {
			throw Object.assign(
				new Error(detail || 'Terlalu banyak permintaan. Coba lagi beberapa saat.'),
				{
					status: 429
				}
			);
		}
		throw Object.assign(
			new Error(detail || `Layanan AI merespons dengan status ${response.status}.`),
			{ status: response.status }
		);
	}

	let data: unknown;
	try {
		data = await response.json();
	} catch {
		throw new Error('Gagal membaca respons AI.');
	}

	let text: string;
	if (isGeminiNative) {
		const g = data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
		text = g.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
	} else {
		const c = data as { choices?: Array<{ message?: { content?: string } }> };
		text = c.choices?.[0]?.message?.content ?? '';
	}

	if (!text.trim()) throw new Error('AI tidak mengembalikan hasil apapun.');
	return text;
}

function normalizeRubrikRow(value: unknown): RubrikRow {
	if (value && typeof value === 'object') {
		const o = value as Record<string, unknown>;
		const s = (keys: string[]): string => {
			for (const key of keys) {
				const v = o[key];
				if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
			}
			return '';
		};
		const row: RubrikRow = {
			aspek: s(['aspek', 'aspek_yang_dinilai', 'aspekDinilai', 'kriteriaPenilaian']),
			indikator: s(['indikator', 'Indikator']),
			skor: s(['skor', 'Skor', 'poin', 'nilai', 'Nilai']),
			kriteria: s(['kriteria', 'Kriteria', 'deskripsi', 'Deskripsi'])
		};
		if (row.aspek || row.kriteria) return row;
	}
	return { aspek: String(value ?? '').trim(), indikator: '', skor: '', kriteria: '' };
}

/** Normalisasi nilai asesmen (objek {uraian,instrumen,rubrik} atau string legacy). */
export function normalizeAsesmen(value: unknown): AsesmenLampiran {
	if (
		typeof value === 'string' ||
		typeof value === 'number' ||
		value === null ||
		value === undefined
	) {
		const flat = typeof value === 'string' ? value.trim() : '';
		return flat
			? { uraian: flat, instrumen: '', rubrik: [] }
			: { uraian: '', instrumen: '', rubrik: [] };
	}
	if (typeof value !== 'object') return { uraian: '', instrumen: '', rubrik: [] };
	const o = value as Record<string, unknown>;
	const toText = (v: unknown): string => {
		if (typeof v === 'string') return v.trim();
		if (Array.isArray(v))
			return v
				.map((x) => (typeof x === 'object' && x !== null ? JSON.stringify(x) : String(x)))
				.filter(Boolean)
				.join('\n');
		return '';
	};
	const uraian = toText(o.uraian ?? o.ringkasan ?? o.deskripsi ?? o.teknik ?? '');
	const instrumen = toText(o.instrumen ?? o.soal ?? o.butir ?? '');
	const rsrc = o.rubrik ?? o.rows ?? o.tabel;
	let rubrik: RubrikRow[] = [];
	if (Array.isArray(rsrc)) {
		rubrik = rsrc.map(normalizeRubrikRow).filter((r) => r.aspek || r.kriteria || r.indikator);
	} else if (typeof rsrc === 'string') {
		rubrik = rsrc
			.split(/\n+/)
			.map((s) => s.trim())
			.filter((s) => /^\d+\.|^[-*]/.test(s))
			.map((s) => normalizeRubrikRow(s.replace(/^(\d+\.|[-*])\s*/, '')));
	}
	return { uraian, instrumen, rubrik };
}

function parseLampiranPayload(text: string): LampiranGenerated {
	const cleaned = text
		.trim()
		.replace(/^```(?:json)?/i, '')
		.replace(/```$/, '')
		.trim();
	let parsed: unknown;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		const s = cleaned.indexOf('{');
		const e = cleaned.lastIndexOf('}');
		const obj = s >= 0 && e > s ? cleaned.slice(s, e + 1) : cleaned;
		try {
			parsed = JSON.parse(obj);
		} catch {
			try {
				parsed = JSON.parse(jsonrepair(obj));
			} catch {
				parsed = undefined;
			}
		}
		if (parsed === undefined) {
			throw new Error('AI mengembalikan format yang tidak valid. Coba lagi.');
		}
	}
	const first = (parsed ?? {}) as Record<string, unknown>;
	const k = (num: number, ...aliases: string[]): unknown => {
		for (const key of [`k${num}`, ...aliases]) {
			const v = first[key];
			if (v !== undefined && v !== null && String(v).trim()) return v;
		}
		return undefined;
	};
	const formatif = normalizeAsesmen(k(1, 'formatif', 'penilaianformatif', 'assessmentforlearning'));
	const sumatif = normalizeAsesmen(k(2, 'sumatif', 'penilaiansumatif', 'assessmentsumatif'));
	const lkVal = k(3, 'lkpd', 'lembarkerjamurid');
	const lkpd = normalizeAsesmen(lkVal).uraian;
	if (
		!lkpd ||
		(!formatif.uraian && !formatif.instrumen) ||
		(!sumatif.uraian && !sumatif.instrumen)
	) {
		throw new Error(
			`AI mengembalikan respons yang tidak lengkap (kunci diterima: ${Object.keys(first).join(', ')}). Coba lagi.`
		);
	}
	return { formatif, sumatif, lkpd };
}

function resolveBaseUrl(baseUrl: string | null): string {
	const url = (baseUrl ?? '').trim();
	if (!url)
		throw new Error('Base URL API belum dikonfigurasi. Silakan atur di halaman Pengaturan.');
	return url.replace(/\/+$/, '');
}
