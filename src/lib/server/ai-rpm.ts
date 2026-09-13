import { jsonrepair } from 'jsonrepair';

export type RpmGenerateInput = {
	apiKey: string;
	model: string;
	baseUrl: string | null;
	mapelNama: string;
	kelasLabel: string;
	fase: string | null;
	capaianPembelajaran: string;
	lingkupMateri: string;
	tujuanPembelajaran: string[];
	inputCustom: string;
	karakteristik?: string;
	profilLulusan?: string[];
};

export type RpmGenerated = {
	karakteristik: string;
	model: string;
	lintasDisiplinIlmu: string;
	kemitraanPembelajaran: string;
	lingkunganPembelajaran: string;
	pemanfaatanDigital: string;
	kegiatanAwal: string;
	memahami: string;
	mengaplikasi: string;
	merefleksi: string;
	penutup: string;
	asesmen: string[];
	tujuanPembelajaran: string[];
};

const REQUEST_TIMEOUT_MS = 300_000;

class RpmTimeoutError extends Error {
	constructor() {
		super(
			'Waktu permintaan AI habis. Model ini mungkin lambat — coba lagi, atau ganti model lain yang lebih cepat.'
		);
		this.name = 'RpmTimeoutError';
	}
}

export async function generateRpm(input: RpmGenerateInput): Promise<RpmGenerated> {
	const userPrompt = buildRpmPrompt(input, 'all');
	const isGeminiNative = resolveBaseUrl(input.baseUrl).includes(
		'generativelanguage.googleapis.com'
	);
	const nAsesmen = Math.max(input.tujuanPembelajaran?.length ?? 0, 1);
	const nTP = input.tujuanPembelajaran?.length ?? 0;
	const text = await requestAiText(
		input,
		userPrompt,
		isGeminiNative ? buildGeminiSchema(nAsesmen, nTP) : null
	);
	return parseGeneratedPayload(text, true, nAsesmen, nTP);
}

/** Gemini structured-output schema (manual REST call) — k1..k11 + asesmen + TP(ABCD). */
function buildGeminiSchema(nAsesmen: number, nTP: number): Record<string, unknown> {
	const properties: Record<string, { type: 'string' }> = {};
	const required: string[] = [];
	for (let i = 1; i <= 11; i++) {
		const k = `k${i}`;
		properties[k] = { type: 'string' };
		required.push(k);
	}
	for (let i = 0; i < nAsesmen; i++) {
		const k = `k${12 + i}`;
		properties[k] = { type: 'string' };
		required.push(k);
	}
	for (let i = 0; i < nTP; i++) {
		const k = `k${12 + nAsesmen + i}`;
		properties[k] = { type: 'string' };
		required.push(k);
	}
	return { type: 'object', properties, required };
}

const CHUNK_MAP = {
	all: {
		keys: ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9', 'k10', 'k11', 'k12', 'k13', 'k14'],
		items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
	},
	desain: { keys: ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'], items: [1, 2, 3, 4, 5, 6] },
	pengalaman: { keys: ['k7', 'k8', 'k9', 'k10', 'k11'], items: [7, 8, 9, 10, 11] },
	asesmen: { keys: ['k12', 'k13', 'k14'], items: [12] }
} as const;

function buildRpmPrompt(input: RpmGenerateInput, chunk: keyof typeof CHUNK_MAP): string {
	const { mapelNama, kelasLabel, fase, capaianPembelajaran } = input;
	const lingkupMateri = input.lingkupMateri.trim();
	const tujuanPembelajaran = input.tujuanPembelajaran.map((tp, i) => `${i + 1}. ${tp}`).join('\n');
	const inputCustom = input.inputCustom.trim();
	const karakteristik = input.karakteristik?.trim();
	const profilLulusan = (input.profilLulusan ?? []).map((d) => d.trim()).filter(Boolean);
	const dimensiText =
		profilLulusan.length > 0
			? profilLulusan.map((d, i) => `${i + 1}. ${d}`).join('\n')
			: '(belum dipilih)';

	const spec = CHUNK_MAP[chunk];
	// Asesmen disesuaikan dengan jumlah Tujuan Pembelajaran yang dipilih.
	const nAsesmen = Math.max(input.tujuanPembelajaran?.length ?? 0, 1);
	const nTP = input.tujuanPembelajaran?.length ?? 0;
	const baseKeys: string[] = [];
	for (let i = 1; i <= 11; i++) baseKeys.push(`k${i}`);
	for (let i = 0; i < nAsesmen; i++) baseKeys.push(`k${12 + i}`);
	for (let i = 0; i < nTP; i++) baseKeys.push(`k${12 + nAsesmen + i}`);
	const keys: readonly string[] =
		chunk === 'all' || (spec.keys[0] ?? '').startsWith('k12') ? baseKeys : spec.keys;
	const itTp = `0. TUJUAN PEMBELAJARAN — TULIS ULANG dalam RUMUSAN ABCD untuk setiap TP yang dipilih (jangan mengubah makna): berbentuk "(condition), murid dapat (behavior) (degree)". Condition diawali "melalui/by/…" (mis. "Melalui diskusi kelompok", "Dengan mengamati tayangan video", "Melalui proyek"), degree memakai kata TERUKUR/dinilai (mis. "dengan tepat", "secara runtut", "sesuai kriteria"). Contoh: TP "menyebutkan contoh keberagaman budaya di lingkungan tempat tinggal" → "Melalui diskusi kelompok, murid dapat menyebutkan contoh keberagaman budaya di lingkungan tempat tinggal dengan tepat". JUMLAH sesuai TP yang dipilih (${nTP}). CONDITION yang kamu tulis pada tiap rumusan WAJIB konsisten muncul di "Metode Pembelajaran:" pada bagian "model" (mis. condition "melalui diskusi" ⇒ Metode memuat "diskusi") DAN benar-benar dilaksanakan di langkah-langkah kegiatan pembelajaran.`;

	const it1 = `1. "karakteristik": ${
		karakteristik
			? `gunakan persis teks berikut: "${karakteristik}"`
			: `deskripsi singkat karakteristik umum peserta didik kelas ${kelasLabel} yang menjadi dasar pembelajaran (mis. keragaman gaya belajar, tingkat keingintahuan, kemampuan berinkuiri), maksimal 1–2 kalimat. JANGAN mulai dengan frasa "Peserta didik kelas …", langsung tulis karakteristiknya saja (mis. "memiliki rasa ingin tahu tinggi terhadap lingkungan sekitar dan menyukai belajar berbasis pengalaman langsung").`
	}`;
	const it2 = `2. "model": nama dan strategi model pembelajaran yang paling cocok untuk tujuan pembelajaran di baris pertama, lalu baris berikutnya adalah "Langkah:", baris berikutnya deretan tahapan utamanya dengan tanda panah (→), lalu baris berikutnya "Metode Pembelajaran:" diikuti daftar metode yang digunakan (dipisah koma, mis. diskusi kelompok kecil, presentasi, tanya jawab, demonstrasi). Format persis seperti ini:
Model Pembelajaran Inkuiri (Inquiry Learning) dengan integrasi kegiatan role playing dan pembuatan poster.
Langkah:
Orientasi → Merumuskan masalah → Mengumpulkan data → Menganalisis data → Menyimpulkan → Refleksi
Metode Pembelajaran:
Diskusi kelompok kecil, presentasi, dan tanya jawab
Urutan tahapan pada "Langkah:" ini WAJIB dipakai persis (dengan urutan yang sama) sebagai penanda langkah-langkah pada fase memahami dan mengaplikasi. Seluruh metode pada "Metode Pembelajaran:" ini WAJIB benar-benar muncul dan diterapkan di dalam langkah-langkah kegiatan pembelajaran (mis. diskusi kelompok kecil tampak pada salah satu langkah, presentasi tampak pada langkah lain).`;
	const it3 = `3. "lintasDisiplinIlmu": keterkaitan lintas disiplin ilmu dengan 2–3 mata pelajaran lain beserta aktivitas konkretnya, sebagai daftar bernomor, contoh: "1. Bahasa Indonesia (membaca dan menulis laporan hasil observasi)" lalu "2. Seni Budaya (membuat poster pelestarian)". Setiap aktivitas lintas disiplin ini WAJIB diwujudkan sebagai langkah kegiatan nyata di fase "memahami" dan/atau "mengaplikasi".`;
	const it4 = `4. "kemitraanPembelajaran": TIDAK WAJIB. Hanya isi bila materi pembelajaran memang memerlukan kemitraan dengan pihak luar, misalnya penanggulangan bencana, kunjungan industri, praktik lapangan, atau materi yang menuntut narasumber/masyarakat/profesi lain. ANALISA tujuan pembelajaran yang dipilih: bila TIDAK memerlukan pihak luar, isi kunci ini dengan STRING KOSONG "". Bila diisi, tulis mitra + bentuk kolaborasinya (1–2 kalimat) dan mitra itu HARUS benar-benar dilibatkan di langkah "memahami" dan/atau "mengaplikasi".`;
	const it5 = `5. "lingkunganPembelajaran": pengaturan lingkungan belajar yang mendukung ketercapaian tujuan (tempat, penataan, suasana), 1–2 kalimat.`;
	const it6 = `6. "pemanfaatanDigital": pemanfaatan teknologi digital yang relevan dengan tujuan pembelajaran (misal video animasi, simulasi, aplikasi interaktif), 1–2 kalimat. Media digital yang disebutkan di sini WAJIB dipakai kembali secara nyata di langkah "memahami" dan/atau "mengaplikasi".`;
	const it7 = `7. "kegiatanAwal": PERSIS TIGA langkah bernomor (1., 2., 3., …). DUA langkah pertama WAJIB berurutan: (1) berdoa bersama sesuai keyakinan masing-masing, (2) mengecek kehadiran dan kesiapan belajar murid. Langkah-langkah pembuka yang memang dilakukan guru (berdoa dipimpin, cek kehadiran, persiapan peralatan) boleh memakai GURU sebagai subjek — contoh: "Guru mengecek kehadiran dan membimbing murid menyiapkan perlengkapan belajar". Selanjutnya kegiatan yang membangun kesadaran (berkesadaran) dan motivasi murid, dijelaskan RINCI: siapa melakukan apa (guru dan murid), bagaimana, dan perkiraan durasi dalam menit; bila sesuai sertakan ice breaking. Kegiatan awal HARUS mengakomodir pengalaman belajar yang beragam sesuai karakteristik murid (diferensiasi pembuka, pilihan kegiatan sesuai gaya belajar/kesiapan/minat) dan menyebutkan diferensiasinya. Terapkan nilai Dimensi Profil Lulusan yang dipilih secara konkret di langkah TANPA menyebut nama dimensinya.`;
	const it8 = `8. "memahami": TIGA hingga ENAM langkah BERNOMOR (1., 2., 3., …) yang berurutan PERSIS mengikuti tahapan "Langkah:" pada "model". Setiap langkah dijelaskan RINCI: aktivitas guru, aktivitas murid, media/bahan yang digunakan, dan perkiraan durasi dalam menit, lalu diakhiri penanda "(tahapan model - N menit)", contoh: "1. Murid mengamati tayangan video 'Jejak Budaya' yang dipandu guru, lalu mengidentifikasi contoh keberagaman budaya (mengumpulkan data - 10 menit)." Terapkan nilai Dimensi Profil Lulusan secara konkret TANPA menyebut nama dimensinya, memakai media digital dari "pemanfaatanDigital", kegiatan lintas disiplin dari "lintasDisiplinIlmu" dengan penanda "(Bahasa Indonesia: …)", dan bila "kemitraanPembelajaran" terisi, melibatkan mitra tersebut dengan penandanya (mis. "(bersama narasumber budayawan)"). Tiap langkah memuat aktivitas konkret dengan media nyata dan, bila ada pertanyaan/instruksi, ditulis lengkap dalam tanda kutip.`;
	const it9 = `9. "mengaplikasi": TIGA hingga ENAM langkah BERNOMOR (1., 2., 3., …) yang MELANJUTKAN urutan tahapan "Langkah:" pada "model" dari fase memahami. Setiap langkah dijelaskan RINCI: aktivitas guru, aktivitas murid, media/bahan, dan perkiraan durasi dalam menit, lalu diakhiri penanda "(tahapan model - N menit)", contoh: "2. Murid berdiskusi dalam kelompok kecil merumuskan masalah terkait pelestarian budaya lokal dengan bimbingan guru menggunakan worksheet digital terstruktur (merumuskan masalah - 12 menit)." Terapkan nilai Dimensi Profil Lulusan secara konkret TANPA menyebut nama dimensinya, memakai media digital dari "pemanfaatanDigital", kegiatan lintas disiplin dari "lintasDisiplinIlmu" dengan penanda "(Seni Budaya dan Prakarya: membuat poster)", dan bila "kemitraanPembelajaran" terisi, melibatkan mitra tersebut dengan penandanya (mis. "(bersama narasumber budayawan)"). Tiap langkah memuat aktivitas konkret dengan media nyata dan, bila ada pertanyaan/instruksi, ditulis lengkap dalam tanda kutip. Contoh format langkah: "Murid bekerja dalam kelompok kecil merancang poster ajakan melestarikan budaya lokal secara gotong royong (membuat produk - 15 menit)".`;
	const it10 = `10. "merefleksi": DUA hingga TIGA langkah fase Merefleksi dengan prinsip berkesadaran dan bermakna, sebagai daftar bernomor. Setiap langkah dijelaskan RINCI: bentuk refleksi, pertanyaan pemantik, dan perkiraan durasi dalam menit. Terapkan nilai Dimensi Profil Lulusan melalui pertanyaan/aktivitas refleksi TANPA menyebut nama dimensinya. Pertanyaan pemantik ditulis LENGKAP dalam tanda kutip, contoh: Murid menuliskan satu hal berharga dan menjawab pemantik "Bagaimana pengalaman belajarmu hari ini memengaruhimu?" (5 menit).`;
	const it11 = `11. "penutup": DUA langkah penutup yang bermakna dan menggembirakan, sebagai daftar bernomor dengan perkiraan durasi dalam menit. WAJIB menyertakan penegasan nilai-nilai yang telah dikembangkan hari ini TANPA menyebut nama dimensinya. RINCIKAN pula langkah yang memfasilitasi tindakan saling memuliakan antara guru dan murid pada kegiatan akhir: misalnya saling mengucapkan terima kasih, saling mengapresiasi kontribusi, murid menyampaikan penghargaan kepada guru dan sebaliknya, salam hangat/doa penutup, serta penguatan nilai saling menghormati. Jelaskan siapa melakukan apa agar tindakan saling memuliakan itu jelas.`;
	const it12 = `12. "asesmen": buat Assessment for Learning SEBANYAK JUMLAH TUJUAN PEMBELAJARAN yang dipilih di atas (satu assessment utk satu TP). Bila TP berjumlah ${nAsesmen}, buat ${nAsesmen} assessment. TIDAK BOLEH ADA YANG KOSONG. Bagian "Aspek yang Dinilai:" pada tiap assessment HARUS mencantumkan kompetensi dari TP yang menjadi sasarannya. Tiap item memuat tiga bagian berlabel "Teknik & Instrumen:", "Aspek yang Dinilai:", dan "Prinsip Assessment:", dipisahkan baris. Contoh format per item:
Teknik & Instrumen:
Observasi proses inkuiri dan keterlibatan dalam role playing menggunakan lembar observasi.
Aspek yang Dinilai:
Keaktifan, rasa ingin tahu, kemampuan bekerja sama.
Prinsip Assessment:
Menilai proses dan keterlibatan murid selama pembelajaran.`;

	const ITEMS: Record<number, string> = {
		1: it1,
		2: it2,
		3: it3,
		4: it4,
		5: it5,
		6: it6,
		7: it7,
		8: it8,
		9: it9,
		10: it10,
		11: it11,
		12: it12
	};
	const selectedItems = spec.items.map((n) => ITEMS[n]).join('\n');
	const introBlock = chunk === 'all' || chunk === 'desain' ? itTp : '';

	const KEY_USAGE: Record<string, string> = {
		k1: 'karakteristik murid',
		k2: 'model pembelajaran dan langkahnya',
		k3: 'lintas disiplin ilmu',
		k4: 'kemitraan pembelajaran',
		k5: 'lingkungan pembelajaran',
		k6: 'pemanfaatan digital',
		k7: 'kegiatan awal',
		k8: 'langkah memahami',
		k9: 'langkah mengaplikasi',
		k10: 'langkah merefleksi',
		k11: 'penutup'
	};
	for (let i = 0; i < nAsesmen; i++) KEY_USAGE[`k${12 + i}`] = `asesmen for learning #${i + 1}`;
	for (let i = 0; i < nTP; i++)
		KEY_USAGE[`k${12 + nAsesmen + i}`] = `tujuan pembelajaran ABCD #${i + 1}`;
	const formatJson = `{${keys.map((k) => `"${k}":"${KEY_USAGE[k]}"`).join(',')}}`;

	const pentingBlock = `Berdasarkan data di atas, buatlah elemen-elemen yang diminta berikut. PENTING: seluruh langkah kegiatan pembelajaran (kegiatan awal, memahami, mengaplikasi, merefleksi, penutup) dan asesmen HARUS menerapkan Dimensi Profil Lulusan yang dipilih di atas secara KONKRET di dalam aktivitasnya, tetapi JANGAN menyebutkan nama dimensi di dalam teks langkah — wujudkan nilai dimensinya lewat aktivitas (mis. kerja sama kelompok, berpikir kritis melalui pertanyaan pemantik, menghargai perbedaan), tanpa menulis "(Dimensi …)". Sesuaikan pula cara, media, ritme, dan tingkat pendampingan dengan karakteristik peserta didik (diferensiasi bila relevan). Media digital yang kamu tulis di "pemanfaatanDigital" WAJIB benar-benar DIPAKAI di dalam langkah-langkah kegiatan pembelajaran: sebutkan kembali penggunaan media digital tersebut secara konkret pada langkah fase "memahami" dan/atau "mengaplikasi" (mis. "guru menayangkan video animasi…", "murid menggunakan aplikasi…"), sehingga isi bagian Pemanfaatan Digital konsisten dengan langkah-langkahnya. Kegiatan lintas disiplin ilmu di "lintasDisiplinIlmu" WAJIB juga benar-benar DIPAKAI di dalam langkah "memahami" dan/atau "mengaplikasi": setiap aktivitas lintas disiplin muncul sebagai langkah kongkret dengan penanda nama mata pelajarannya, mis. "…(Bahasa Indonesia: menyusun teks deskripsi)", "…(Seni Budaya dan Prakarya: mengidentifikasi motif kain tradisional)". Mitra pembelajaran: bila "kemitraanPembelajaran" terisi (hanya untuk materi yang memang memerlukan mitra), mitra itu WAJIB benar-benar DILIBATKAN di dalam langkah kegiatan. Tampilkan keterlibatannya (mis. narasumber, budayawan, masyarakat sekitar, atau profesi lain) sebagai aktivitas nyata di langkah "memahami" dan/atau "mengaplikasi" lengkap dengan penandanya, mis. "…(bersama narasumber budayawan)", "…(kunjungan ke pelaku UMKM setempat)". Bila kunci kemitraan KOSONG, jangan memaksakan mitra di langkah kegiatan.`;

	// Output harus PADAT. Tanpa batas ini gpt-5.x menulis sangat panjang sehingga
	// RPM butuh puluhan ribu token → lambat & rawan truncation/502.
	const brevityBlock = `ATURAN KERINGKASAN (WAJIB):
- Karakteristik maksimal 1 kalimat; model maksimal 5 baris; lintas disiplin 2 butir singkat; kemitraan/lingkungan/pemanfaatan digital masing-masing maksimal 1 kalimat.
- Kegiatan awal 3 langkah; memahami 3-6 langkah (fleksibel sesuai kebutuhan); mengaplikasi 3-6 langkah; merefleksi 2-3 langkah; penutup 2-3 langkah; tiap asesmen maksimal 3 kalimat.
- Setiap langkah TEPAT SATU kalimat langsung ke aktivitas, ditutup penanda "(tahapan - N menit)".
- JANGAN menulis narasi panjang atau penjelasan berlebihan. Tulis langsung aktivitas singkat.`;

	const aturanBlock = `ATURAN PENOMORAN, BAHASA, & SINTAKS MODEL:
- Tiap langkah pada kegiatan awal, memahami, mengaplikasi, merefleksi, dan penutup WAJIB bernomor urut (1., 2., 3., …), tiap langkah pada baris/paragraf tersendiri.
- Seluruh langkah kegiatan ditulis BERPUSAT PADA MURID: murid sebagai pelaku/subjek kalimat, guru hanya pihak yang memfasilitasi/mendampingi. Walaupun kegiatan diarahkan guru, kalimat tetap berfokus pada kegiatan murid. Contoh SALAH: "guru meminta murid mengamati video pembelajaran"; contoh BENAR: "murid mengamati video pembelajaran yang ditampilkan oleh guru". Awali langkah dengan murid sebagai subjek (mis. "murid …", "murid dibimbing oleh guru untuk …"), bukan dengan guru.
- PENGECUALIAN KEGIATAN AWAL: pada "kegiatanAwal", langkah yang memang dilakukan GURU (mis. mengecek kehadiran, memastikan kesiapan/peralatan belajar, memandu doa bersama, menyampaikan pengantar) boleh ditulis dengan GURU sebagai subjek agar kalimat tidak kaku — contoh benar: "Guru mengecek kehadiran dan memastikan kesiapan belajar murid"; "Guru memandu doa bersama". Sedangkan langkah kegiatan inti (memahami/mengaplikasi/dst.) tetap murid-pelaku.
- Setiap langkah kegiatan diakhiri penanda "(tahapan model - N menit)", contoh: "(merumuskan masalah - 12 menit)", "(menganalisis data - 10 menit)", "(menyimpulkan - 8 menit)", "(refleksi - 5 menit)". Gunakan nama tahapan PERSIS dari "Langkah:" model, huruf kecil.
- LANGKAH WAJIB SPESIFIK: tulis aktivitas konkret, bukan frasa umum. Sertakan media/alat nyata (nama video, lembar kerja, aplikasi), hasil/keluaran murid, dan jika ada pertanyaan/instruksi tulis LENGKAP dalam tanda kutip — contoh: Murid menjawab pertanyaan pemantik guru tentang pelajaran berharga yang diperoleh, contoh "Bagaimana cara kita menghargai keragaman tradisi di sekitar tempat tinggal kita?" (5 menit). Jangan menulis "menjawab pertanyaan pemantik" tanpa isi pertanyaannya.
- Setiap langkah kegiatan (kegiatan awal, memahami, mengaplikasi, merefleksi, penutup) TANPA TERKECUALI WAJIB memuat perkiraan waktu berupa "N menit".
- URUTAN SINTAKS WAJIB: seluruh tahapan yang tertulis di "Langkah:" pada "model" (mis. Orientasi → Merumuskan masalah → Mengumpulkan data → Menganalisis data → Menyimpulkan → Refleksi) harus muncul BERURUTAN, lengkap, tanpa lompatan atau penukaran urutan di seluruh langkah kegiatan: tahap Orientasi diwujudkan sebagai langkah orientasi/pengantar (di akhir kegiatan awal atau awal memahami), dilanjutkan tahap berikutnya (Merumuskan masalah, Mengumpulkan data, …) berurutan di memahami dan mengaplikasi. Periksa ulang agar penanda tahap di langkah-langkah mengikuti urutan ini PERSIS.
- Terapkan nilai Dimensi Profil Lulusan secara konkret dalam setiap langkah TANPA menyebutkan nama dimensinya.`;

	const closingBlock = `Seluruh teks dalam bahasa Indonesia yang baik dan benar sesuai EYD, terstruktur, tidak bertele-tele, mudah dipahami, dan relevan dengan capaian serta tujuan pembelajaran yang diberikan. Pastikan seluruh "PERMINTAAN TAMBAHAN DARI GURU" di atas benar-benar diwujudkan di dalam hasil generate.

Jawab HANYA dengan JSON tanpa teks lain, dengan KUNCI NETRAL yang TEPAT sebagai berikut (jangan mengganti atau menambah nama kunci):
${formatJson}
Isi setiap kunci sesuai deskripsi item bernomor di atas (k1=karakteristik, k2=model, k3=lintas, k4=kemitraan, k5=lingkungan, k6=digital, k7=kegiatan awal, k8=memahami, k9=mengaplikasi, k10=merefleksi, k11=penutup, k12–k14=asesmen).`;

	const asesmenNote = keys.some((k) => k.startsWith('k12'))
		? '\nCatatan: setiap "asesmen for learning #N" adalah satu teks utuh (bukan array) yang wajib memuat bagian "Teknik & Instrumen:", "Aspek yang Dinilai:", dan "Prinsip Assessment:". Banyaknya asesmen PERSIS sama dengan jumlah Tujuan Pembelajaran yang dipilih (satu asesmen untuk tiap TP).'
		: '';

	// Trim redundant blocks per chunk to keep requests small (large/slow gpt-5.6
	// requests over the gateway are prone to upstream 502).
	const showPentling = chunk === 'all' || chunk === 'desain' || chunk === 'pengalaman';
	const showAturan = chunk === 'all' || chunk === 'pengalaman';

	return `Kamu adalah pendidik profesional yang ahli dalam Kurikulum Merdeka dan pendekatan Pembelajaran Mendalam (Deep Learning). Buatlah Rencana Pembelajaran Mendalam (RPM) yang berkualitas tinggi, sesuai kaidah penulisan EYD, mudah dipahami, singkat, padat, dan jelas.

DATA PEMBELAJARAN:
- Mata Pelajaran: ${mapelNama}
- Kelas: ${kelasLabel}
- Fase: ${fase || 'belum ditentukan'}
- Lingkup Materi: ${lingkupMateri}

CAPAIAN PEMBELAJARAN:
${capaianPembelajaran}

TUJUAN PEMBELAJARAN YANG DIPILIH:
${tujuanPembelajaran || '(belum ada tujuan pembelajaran dipilih)'}

DIMENSI PROFIL LULUSAN YANG DIPILIH (WAJIB diintegrasikan ke dalam langkah-langkah pembelajaran):
${dimensiText}
${karakteristik ? `\nKARAKTERISTIK PESERTA DIDIK (sumber informasi untuk MENYESUAIKAN seluruh langkah pembelajaran):\n${karakteristik}\nGunakan persis teks di atas sebagai isian bagian "karakteristik" (jangan diubah), dan jadikan seluruh langkah kegiatan pembelajaran (kegiatan awal, memahami, mengaplikasi, merefleksi, penutup) serta pemilihan model, media, dan asesmen selaras dengan karakteristik tersebut (mis. diferensiasi, tingkat pendampingan, media yang sesuai, ritme kegiatan).` : ''}
${inputCustom ? `\nPERMINTAAN TAMBAHAN DARI GURU (WAJIB diterapkan pada hasil generate, bukan sekadar komentar):\n${inputCustom}\nJadikan permintaan ini sebagai ketentuan yang harus dipenuhi dalam RPM: misalnya memakai model pembelajaran tertentu, menyertakan kegiatan tertentu (seperti ice breaking), menekankan materi spesifik, atau mengatur kerincian langkah pembelajaran. Integrasikan secara wajar ke elemen dan langkah yang paling sesuai.` : ''}

${showPentling ? `\n${pentingBlock}\n` : ''}
${brevityBlock}
${showAturan ? `\n${aturanBlock}\n` : ''}
${introBlock}

${selectedItems}

${closingBlock}
${asesmenNote}`;
}

async function requestAiText(
	input: RpmGenerateInput,
	userPrompt: string,
	responseSchema: Record<string, unknown> | null,
	maxTokens = 8192
): Promise<string> {
	const base = resolveBaseUrl(input.baseUrl);
	const isGeminiNative = base.includes('generativelanguage.googleapis.com');

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	let response: Response;
	try {
		if (isGeminiNative) {
			const endpoint = `${geminiBase(base)}/v1beta/models/${input.model}:generateContent`;
			response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-goog-api-key': input.apiKey
				},
				signal: controller.signal,
				body: JSON.stringify({
					contents: [{ parts: [{ text: userPrompt }] }],
					generationConfig: {
						responseMimeType: 'application/json',
						...(responseSchema ? { responseSchema } : {}),
						maxOutputTokens: maxTokens
					}
				})
			});
		} else {
			const endpoint = `${base}/chat/completions`;
			console.log(
				`[ai-rpm] REQ ${endpoint.replace(/\/+$/, '')} model=${input.model} maxTokens=${maxTokens}`
			);
			// OpenAI-compatible providers generally only support
			// `response_format: {"type":"json_object"}` — NOT Gemini's `schema`. Send a
			// generous max_tokens too (RPM is long; small limits truncate the JSON and
			// only the earliest fields survive). If the provider rejects json_object
			// (400) or the gateway breaks on it (5xx), retry keeping max_tokens; last
			// resort drops every option for maximal compatibility.
			const doFetch = (opts: { json?: boolean; maxTokens?: boolean }) =>
				fetch(endpoint, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${input.apiKey}`
					},
					signal: controller.signal,
					body: JSON.stringify({
						model: input.model,
						messages: [{ role: 'user', content: userPrompt }],
						...(opts.json ? { response_format: { type: 'json_object' } } : {}),
						...(opts.maxTokens ? { max_tokens: 8192 } : {})
					})
				});
			const attempt = async (opts: { json?: boolean; maxTokens?: boolean }): Promise<Response> => {
				for (let i = 0; ; i++) {
					try {
						return await doFetch(opts);
					} catch (err) {
						if (i >= 1) throw err; // second consecutive failure surfaces
					}
				}
			};
			response = await attempt({ json: true, maxTokens: true });
			if (response.status === 400 || response.status >= 500) {
				response = await attempt({ json: false, maxTokens: true });
			}
			if (response.status === 400 || response.status >= 500) {
				response = await attempt({ json: false, maxTokens: false });
			}
		}
	} catch (err) {
		clearTimeout(timeout);
		if (err instanceof Error && err.name === 'AbortError') {
			throw new RpmTimeoutError();
		}
		const cause = (err as { cause?: { code?: string; message?: string } }).cause;
		const code = cause?.code ? ` (${cause.code})` : '';
		const detail = cause?.message || (err as Error).message;
		console.error('[ai-rpm] Network/connect failure', code, detail);
		throw new Error(
			`Gagal menghubungi layanan AI${code}: ${detail}. Periksa Base URL, koneksi internet, dan (bila memakai proxy lokal) pengaturan proxy Anda.`,
			{ cause: err }
		);
	}
	clearTimeout(timeout);

	if (!response.ok) {
		let detail = '';
		let rawHint = '';
		try {
			const body = await response.json();
			detail = (body?.error?.message ?? '') as string;
			if (typeof body === 'object' && body !== null) {
				rawHint = JSON.stringify(body).slice(0, 800);
			}
		} catch {
			// body may not be JSON; ignore
		}
		console.error(
			`[ai-rpm] Provider error status=${response.status} "${response.statusText}" server=${response.headers.get(
				'server'
			)} cfRay=${response.headers.get('cf-ray')} detail=${detail || rawHint || '(no body)'}`
		);
		if (response.status === 400 || response.status === 403) {
			throw new Error(
				detail ||
					'Kunci API tidak valid atau kuota tidak mencukupi. Periksa kembali di halaman Pengaturan.'
			);
		}
		if (response.status === 429) {
			throw Object.assign(
				new Error(
					detail ||
						'Kuota API sedang habis atau terlalu banyak permintaan. Tunggu beberapa saat lalu coba lagi.'
				),
				{ status: 429 }
			);
		}
		if (response.status >= 500) {
			throw Object.assign(
				new Error(
					detail ||
						'Layanan AI gagal merespons (kesalahan server penyedia). Periksa model dan Base URL di halaman Pengaturan, atau coba model lain.'
				),
				{ status: response.status }
			);
		}
		throw Object.assign(
			new Error(detail || `Layanan AI merespons dengan status ${response.status}.`),
			{
				status: response.status
			}
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
		const geminiData = data as {
			candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
		};
		text = geminiData.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
	} else {
		const chatData = data as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		text = chatData.choices?.[0]?.message?.content ?? '';
	}

	if (!text.trim()) {
		throw new Error('AI tidak mengembalikan hasil apapun.');
	}

	return text;
}

function parseGeneratedPayload(
	text: string,
	requireComplete = true,
	nAsesmen = 3,
	nTP = 0
): RpmGenerated {
	const cleaned = text
		.trim()
		.replace(/^```(?:json)?/i, '')
		.replace(/```$/, '')
		.trim();

	let parsed: unknown;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		// Some models wrap JSON in prose or a fenced block, or return slightly
		// malformed JSON (unescaped newlines in strings, unquoted keys, trailing
		// commas, truncation). First extract the object region, then let
		// `jsonrepair` fix the leftover syntax errors before giving up.
		const braceStart = cleaned.indexOf('{');
		const braceEnd = cleaned.lastIndexOf('}');
		const object =
			braceStart >= 0 && braceEnd > braceStart ? cleaned.slice(braceStart, braceEnd + 1) : cleaned;
		try {
			parsed = JSON.parse(object);
		} catch {
			try {
				parsed = JSON.parse(jsonrepair(object));
			} catch {
				parsed = undefined;
			}
		}
		if (parsed === undefined) {
			console.error('[ai-rpm] AI response is not JSON, head:', cleaned.slice(0, 2000));
			throw new Error(
				'AI mengembalikan format yang tidak valid. Coba model yang mendukung JSON, atau coba lagi.'
			);
		}
	}

	const obj = (parsed ?? {}) as Record<string, unknown>;
	const dataWrapper = obj['data'] ?? obj['response'] ?? obj['result'];
	const first =
		typeof dataWrapper === 'object' && dataWrapper !== null
			? (dataWrapper as Record<string, unknown>)
			: obj;

	// Some models return arrays/objects instead of plain strings for the langkah
	// fields — flatten them into joined text instead of rejecting.
	const toText = (v: unknown): string => {
		if (typeof v === 'string') {
			const t = v.trim();
			// DeepSeek et al. often serialize steps as a STRING containing a JSON
			// array (e.g. "[\"Murid ...\", \"Murid ...\"]") — parse it back.
			if (t.startsWith('[') && t.endsWith(']')) {
				try {
					const arr = JSON.parse(t);
					if (Array.isArray(arr)) {
						const joined = toText(arr);
						if (joined) return joined;
					}
				} catch {
					// not a JSON array, treat as plain text
				}
			}
			return t;
		}
		if (Array.isArray(v)) {
			return v
				.map((x) => toText(x))
				.map((s) => s.trim())
				.filter(Boolean)
				.join('\n');
		}
		if (typeof v === 'object' && v !== null) {
			const leaves: string[] = [];
			const walk = (o: unknown) => {
				if (Array.isArray(o)) {
					o.forEach(walk);
				} else if (o && typeof o === 'object') {
					Object.values(o).forEach(walk);
				} else if (typeof o === 'string' && o.trim()) {
					leaves.push(o.trim());
				}
			};
			walk(v);
			return leaves.join('\n');
		}
		return '';
	};

	/**
	 * Universal key resolution. Models vary wildly:
	 * - some echo neutral keys (k1..k14),
	 * - some use semantic keys (model, kegiatanAwal, ...),
	 * - DeepSeek echoed the example's labels as keys ("karakteristik murid",
	 *   "model pembelajaran dan langkahnya", "asesmen for learning #1", ...).
	 * Normalize every key (lowercase, strip non-alphanumerics) and match against
	 * every known pattern so the field is found regardless of naming.
	 */
	const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
	const normalized = new Map<string, unknown>();
	for (const [k, v] of Object.entries(first)) normalized.set(normKey(k), v);

	const FIELDS: Array<{ name: string; patterns: string[]; cores: string[] }> = [
		{
			name: 'karakteristik',
			patterns: ['karakteristik', 'karakteristikmurid', 'karakteristikmurid1', 'karakter', 'k1'],
			cores: ['karakter']
		},
		{
			name: 'model',
			patterns: [
				'model',
				'modelpembelajaran',
				'modelpembelajarandanlangkahnya',
				'model pembelajaran dan langkahnya',
				'langkahnya',
				'k2'
			],
			cores: ['model', 'metode', 'strategi']
		},
		{
			name: 'lintasDisiplinIlmu',
			patterns: [
				'lintasdisiplinilmu',
				'lintasdisiplin',
				'lintas disiplin ilmu',
				'integrasilintasdisiplin',
				'k3'
			],
			cores: ['lintasdisiplin', 'lintas']
		},
		{
			name: 'kemitraanPembelajaran',
			patterns: ['kemitraanpembelajaran', 'kemitraan', 'mitrapembelajaran', 'k4'],
			cores: ['kemitraan', 'mitra']
		},
		{
			name: 'lingkunganPembelajaran',
			patterns: [
				'lingkunganpembelajaran',
				'lingkungan pembelajaran',
				'lingkunganbelajar',
				'lingkunganbelajardanbelajar',
				'k5'
			],
			cores: ['lingkungan']
		},
		{
			name: 'pemanfaatanDigital',
			patterns: ['pemanfaatandigital', 'pemanfaatan digital', 'digital', 'k6'],
			cores: ['digital', 'pemanfaatan']
		},
		{
			name: 'kegiatanAwal',
			patterns: ['kegiatanawal', 'kegiatan awal', 'langkahawal', 'kegiatanpembuka', 'k7'],
			cores: ['kegiatanawal']
		},
		{
			name: 'memahami',
			patterns: ['memahami', 'langkahmemahami', 'langkah memahami', 'k8'],
			cores: ['memahami']
		},
		{
			name: 'mengaplikasi',
			patterns: ['mengaplikasi', 'langkahmengaplikasi', 'langkah mengaplikasi', 'k9'],
			cores: ['mengaplikasi']
		},
		{
			name: 'merefleksi',
			patterns: ['merefleksi', 'langkahmerefleksi', 'langkah merefleksi', 'k10'],
			cores: ['merefleksi', 'refleksi']
		},
		{
			name: 'penutup',
			patterns: ['penutup', 'langkahpenutup', 'kegiatanakhir', 'k11'],
			cores: ['penutup']
		}
	];

	const getField = (name: string): string => {
		const def = FIELDS.find((f) => f.name === name);
		for (const p of def?.patterns ?? []) {
			const v = normalized.get(normKey(p));
			if (v !== undefined) {
				const t = toText(v);
				if (t) return t;
			}
		}
		// Fallback: substring match — catches Indonesian naming variants from
		// models/proxies (e.g. "strategiPembelajaran" for model, "kegiatan_awal",
		// "langkah_memahami", ...).
		for (const [nk, v] of normalized.entries()) {
			if (def?.cores.some((c) => nk.includes(c))) {
				const t = toText(v);
				if (t) return t;
			}
		}
		return '';
	};

	const getAsesmen = (): string[] => {
		const arr = first['asesmen'];
		if (Array.isArray(arr)) {
			const a = (arr as unknown[]).map((x) => toText(x)).filter(Boolean);
			if (a.length) return a;
		}
		// Kunci numerik k12..k(11+nAs) — hanya rentang asesmen, bukan TP.
		const numeric: string[] = [];
		for (let i = 0; i < nAsesmen; i++) {
			const v = normalized.get(`k${12 + i}`);
			if (v !== undefined) {
				const t = toText(v);
				if (t) numeric.push(t);
			}
		}
		if (numeric.length) return numeric;
		// Substring fallback utk model proxy yang menamai kunci asesmen bebas.
		const fromKeys: string[] = [];
		for (const [nk, v] of normalized.entries()) {
			if (nk.includes('asesmen')) {
				const t = toText(v);
				if (t) fromKeys.push(t);
			}
		}
		if (fromKeys.length) return fromKeys;
		const patterns = [
			[
				'asesmen',
				'asesmnforlearning1',
				'asesmenforlearning1',
				'asesmen1',
				'asesmen for learning #1',
				'k12'
			],
			['asesmenforlearning2', 'asesmen2', 'asesmen for learning 2', 'ASESMEN2', 'k13'],
			['asesmenforlearning3', 'asesmen3', 'asesmen for learning 3', 'ASESMEN3', 'k14']
		];
		const out: string[] = [];
		for (const list of patterns) {
			for (const p of list) {
				const v = normalized.get(normKey(p));
				if (v !== undefined) {
					const t = toText(v);
					if (t) {
						out.push(t);
						break;
					}
				}
			}
		}
		return out;
	};

	// Tujuan Pembelajaran rumusan ABCD: k(12+nAs)..k(11+nAs+nTP).
	const getTujuanPembelajaran = (): string[] => {
		const out: string[] = [];
		for (let i = 0; i < nTP; i++) {
			const v = normalized.get(`k${12 + nAsesmen + i}`);
			if (v !== undefined) {
				const t = toText(v);
				if (t) out.push(t);
			}
		}
		return out;
	};

	const asesmen = getAsesmen();
	const tujuan = getTujuanPembelajaran();
	const result: RpmGenerated = {
		karakteristik: getField('karakteristik'),
		model: getField('model'),
		lintasDisiplinIlmu: getField('lintasDisiplinIlmu'),
		kemitraanPembelajaran: getField('kemitraanPembelajaran'),
		lingkunganPembelajaran: getField('lingkunganPembelajaran'),
		pemanfaatanDigital: getField('pemanfaatanDigital'),
		kegiatanAwal: getField('kegiatanAwal'),
		memahami: getField('memahami'),
		mengaplikasi: getField('mengaplikasi'),
		merefleksi: getField('merefleksi'),
		penutup: getField('penutup'),
		asesmen,
		tujuanPembelajaran: tujuan
	};

	const missing: string[] = [];
	if (!result.model) missing.push('model');
	if (!result.kegiatanAwal) missing.push('kegiatan awal');
	if (!result.memahami && !result.mengaplikasi) missing.push('langkah memahami/mengaplikasi');
	if (missing.length) {
		console.error(
			'[ai-rpm] Partial chunk missing:',
			missing.join(', '),
			'- received keys:',
			Object.keys(first).join(', ')
		);
	}
	if (requireComplete && missing.length) {
		const receivedKeys = Object.keys(first).join(', ') || '(kosong)';
		console.error(
			'[ai-rpm] Missing field(s):',
			missing.join(', '),
			'- received keys:',
			receivedKeys,
			'- raw head:',
			cleaned.slice(0, 1500)
		);
		throw new Error(
			`AI mengembalikan respons yang tidak lengkap. Bagian yang kosong: ${missing.join(
				', '
			)}. Kunci yang diterima: ${receivedKeys}. Coba model/API yang mendukung format JSON sesuai petunjuk, atau coba lagi.`
		);
	}
	return result;
}

function resolveBaseUrl(baseUrl: string | null): string {
	const url = (baseUrl ?? '').trim();
	if (!url)
		throw new Error('Base URL API belum dikonfigurasi. Silakan atur di halaman Pengaturan.');
	return url.replace(/\/+$/, '');
}

/** Strip a trailing `/v1beta` so callers can safely append it (avoids 404 double path). */
function geminiBase(base: string): string {
	return base.replace(/\/v1beta$/, '');
}
