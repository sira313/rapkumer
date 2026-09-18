import { jsonrepair } from 'jsonrepair';

export type RpmGenerateInput = {
	apiKey: string;
	model: string;
	baseUrl: string | null;
	mapelNama: string;
	mapelList: string[];
	kelasLabel: string;
	fase: string | null;
	capaianPembelajaran: string;
	lingkupMateri: string;
	tujuanPembelajaran: string[];
	inputCustom: string;
	profilLulusan?: string[];
};

export type SintaksBlock = {
	tahap: string;
	langkah: string;
};

export type RpmGenerated = {
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
	const userPrompt = buildRpmPrompt(input);
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

function buildGeminiSchema(nAsesmen: number, nTP: number): Record<string, unknown> {
	const properties: Record<string, unknown> = {};
	const required: string[] = [];

	for (let i = 1; i <= 10; i++) {
		const k = `k${i}`;
		properties[k] = { type: 'string' };
		required.push(k);
	}

	properties['k11'] = { type: 'string' };
	required.push('k11');
	properties['k12'] = { type: 'string' };
	required.push('k12');

	for (let i = 0; i < nAsesmen; i++) {
		const k = `k${13 + i}`;
		properties[k] = { type: 'string' };
		required.push(k);
	}
	for (let i = 0; i < nTP; i++) {
		const k = `k${13 + nAsesmen + i}`;
		properties[k] = { type: 'string' };
		required.push(k);
	}
	return { type: 'object', properties, required };
}

function buildRpmPrompt(input: RpmGenerateInput): string {
	const { mapelNama, kelasLabel, fase, capaianPembelajaran, mapelList } = input;
	const lingkupMateri = input.lingkupMateri.trim();
	const tujuanPembelajaran = input.tujuanPembelajaran.map((tp, i) => `${i + 1}. ${tp}`).join('\n');
	const inputCustom = input.inputCustom.trim();
	const profilLulusan = (input.profilLulusan ?? []).map((d) => d.trim()).filter(Boolean);
	const dimensiText =
		profilLulusan.length > 0
			? profilLulusan.map((d, i) => `${i + 1}. ${d}`).join('\n')
			: '(belum dipilih)';
	const mapelListText = mapelList.length > 0 ? mapelList.join(', ') : '(tidak tersedia)';

	const nAsesmen = Math.max(input.tujuanPembelajaran?.length ?? 0, 1);
	const nTP = input.tujuanPembelajaran?.length ?? 0;
	const baseKeys: string[] = [];
	for (let i = 1; i <= 12; i++) baseKeys.push(`k${i}`);
	for (let i = 0; i < nAsesmen; i++) baseKeys.push(`k${13 + i}`);
	for (let i = 0; i < nTP; i++) baseKeys.push(`k${13 + nAsesmen + i}`);
	const keys = baseKeys;

	const KEY_USAGE: Record<string, string> = {
		k1: 'pengetahuan awal murid',
		k2: 'minat murid',
		k3: 'latar belakang murid',
		k4: 'kebutuhan belajar murid',
		k5: 'lintas disiplin ilmu',
		k6: 'praktik pedagogis (model/strategi/metode)',
		k7: 'kemitraan pembelajaran',
		k8: 'lingkungan pembelajaran',
		k9: 'pemanfaatan digital',
		k10: 'kegiatan awal',
		k11: 'inti (per sintaks model)',
		k12: 'penutup'
	};
	for (let i = 0; i < nAsesmen; i++) KEY_USAGE[`k${13 + i}`] = `asesmen pembelajaran #${i + 1}`;
	for (let i = 0; i < nTP; i++)
		KEY_USAGE[`k${13 + nAsesmen + i}`] = `tujuan pembelajaran ABCD #${i + 1}`;
	const formatJson = `{${keys.map((k) => `"${k}":${KEY_USAGE[k] ? `"${KEY_USAGE[k]}"` : '"..."'}`).join(',')}}`;

	const brevityBlock = `ATURAN KERINGKASAN (WAJIB):
- Setiap field murid (pengetahuan awal, minat, latar belakang, kebutuhan belajar) maksimal 1-2 kalimat.
- Praktik pedagogis maksimal 5 baris.
- Lintas disiplin ilmu 2-3 butir singkat.
- Kemitraan/lingkungan/pemanfaatan digital masing-masing maksimal 1-2 kalimat.
- Kegiatan awal 3 langkah; penutup 2-3 langkah; tiap asesmen maksimal 3-4 kalimat.
- Inti: tiap sintaks maksimal 3-5 langkah, tiap langkah tepat satu kalimat langsung ke aktivitas.
- JANGAN menulis narasi panjang. Tulis langsung aktivitas.`;

	const aturanBlock = `ATURAN UMUM:
- Seluruh langkah kegiatan ditulis BERPUSAT PADA MURID (murid sebagai subjek kalimat), kecuali langkah rutin guru (doa, cek kehadiran) yang boleh memakai guru sebagai subjek.
- Setiap langkah kegiatan pada inti dan kegiatan awal WAJIB memuat perkiraan waktu "(N menit)".
- Pada inti, setiap langkah WAJIB memuat salah satu keterangan aturan: "Memahami:", "Mengaplikasi:", atau "Merefleksi:" diikuti prinsip pembelajaran dalam kurung.
- Terapkan nilai Dimensi Profil Lulusan secara konkret dalam setiap langkah TANPA menyebut nama dimensinya.
- Media digital yang disebut di pemanfaatan digital WAJIB dipakai nyata di langkah inti.
- Kegiatan lintas disiplin ilmu di lintasDisiplinIlmu WAJIB muncul sebagai langkah nyata dengan penanda nama mapel.
- Bila kemitraan pembelajaran diisi, mitra WAJIB dilibatkan nyata di langkah inti dengan penanda.
- Seluruh teks dalam bahasa Indonesia EYD, terstruktur, tidak bertele-tele.`;

	const closingBlock = `Seluruh teks dalam bahasa Indonesia yang baik dan benar sesuai EYD, terstruktur, tidak bertele-tele, mudah dipahami, dan relevan dengan capaian serta tujuan pembelajaran yang diberikan. Pastikan seluruh "PERMINTAAN TAMBAHAN DARI GURU" di atas benar-benar diwujudkan di dalam hasil generate.

Jawab HANYA dengan JSON tanpa teks lain, dengan KUNCI NETRAL yang TEPAT sebagai berikut (jangan mengganti atau menambah nama kunci):
${formatJson}
Isi setiap kunci sesuai deskripsi di bawah.`;

	return `Kamu adalah pendidik profesional yang ahli dalam Kurikulum Merdeka dan pendekatan Pembelajaran Mendalam (Deep Learning). Buatlah Rencana Pembelajaran Mendalam (RPM) yang berkualitas tinggi, sesuai kaidah penulisan EYD, mudah dipahami, singkat, padat, dan jelas.

DATA PEMBELAJARAN:
- Mata Pelajaran: ${mapelNama}
- Kelas: ${kelasLabel}
- Fase: ${fase || 'belum ditentukan'}
- Lingkup Materi: ${lingkupMateri}
- Daftar Mata Pelajaran di Kelas Aktif: ${mapelListText}
  (Gunakan daftar ini sebagai bahan "Lintas Disiplin Ilmu" — pilih 2-3 mapel yang paling relevan)

CAPAIAN PEMBELAJARAN:
${capaianPembelajaran}

TUJUAN PEMBELAJARAN YANG DIPILIH:
${tujuanPembelajaran || '(belum ada tujuan pembelajaran dipilih)'}

DIMENSI PROFIL LULUSAN YANG DIPILIH (WAJIB diintegrasikan ke dalam langkah-langkah pembelajaran secara konkret tanpa menyebut nama dimensi):
${dimensiText}
${inputCustom ? `\nPERMINTAAN TAMBAHAN DARI GURU (WAJIB diterapkan pada hasil generate, bukan sekadar komentar):\n${inputCustom}\nJadikan permintaan ini sebagai ketentuan yang harus dipenuhi dalam RPM.` : ''}

DESKRIPSI FIELD JSON:
k1 "pengetahuanAwal": deskripsi pengetahuan awal murid yang relevan dengan topik/lingkup materi. 1-2 kalimat. Dipengaruhi permintaan tambahan guru bila ada.

k2 "minat": minat murid yang relevan dengan topik. 1-2 kalimat.

k3 "latarBelakang": latar belakang murid (budaya, pengalaman, keluarga sesuai jenjang, tanpa merendahkan) yang menjadi dasar pembelajaran. 1-2 kalimat.

k4 "kebutuhanBelajar": kebutuhan belajar murid (gaya belajar, dukungan, diferensiasi) yang menjadi pertimbangan. 1-2 kalimat.

k5 "lintasDisiplinIlmu": 2-3 mata pelajaran lain dari "Daftar Mata Pelajaran di Kelas Aktif" di atas yang paling relevan dengan topik, beserta aktivitas konkretnya. Daftar bernomor, contoh: "1. Bahasa Indonesia (membaca dan menulis laporan hasil observasi)" lalu "2. Seni Budaya (membuat poster pelestarian)". Setiap aktivitas ini WAJIB diwujudkan sebagai langkah kegiatan nyata pada inti, ditandai nama mapelnya.

k6 "praktikPedagogis": Model/Strategi/Metode pembelajaran yang dipilih untuk mencapai tujuan pembelajaran (mis. Pembelajaran Berbasis Masalah, Pembelajaran Berbasis Proyek, Inkuiri, Kontekstual). Format:
Baris pertama: nama + strategi model pembelajaran.
Baris berikutnya: "Sintaks Model:" lalu tahapan dipisah tanda panah (→), lalu "Metode Pembelajaran:" diikuti daftar metode.
Contoh:
Model Pembelajaran Inkuiri (Inquiry Learning) dengan integrasi kegiatan role playing dan pembuatan poster.
Sintaks Model:
Orientasi → Merumuskan masalah → Mengumpulkan data → Menganalisis data → Menyimpulkan → Refleksi
Metode Pembelajaran:
Diskusi kelompok kecil, presentasi, dan tanya jawab
Urutan tahapan Sintaks Model ini WAJIB dipakai persis sebagai penanda pada "k11 inti". Seluruh metode WAJIB muncul dan diterapkan di langkah-langkah kegiatan pembelajaran.

k7 "kemitraanPembelajaran": Kegiatan kemitraan atau kolaborasi dalam dan/atau luar lingkup sekolah (antar guru lintas mapel, antar murid lintas kelas, antar guru lintas sekolah, orang tua, komunitas, tokoh masyarakat, dunia usaha dan industri, institusi, mitra profesional). TIDAK WAJIB — bila materi tidak memerlukan, isi dengan STRING KOSONG "". Bila diisi, tulis mitra + bentuk kolaborasinya, 1-3 kalimat, dan mitra HARUS benar-benar dilibatkan di langkah inti.

k8 "lingkunganPembelajaran": Lingkungan pembelajaran yang ingin dikembangkan dalam budaya belajar, ruang fisik dan/atau ruang virtual. Budaya belajar dikembangkan agar tercipta iklim belajar yang aman, nyaman, dan saling memuliakan. Contoh: memberikan kesempatan kepada murid untuk menyampaikan pendapatnya dalam ruang kelas dan forum diskusi pada platform daring. 1-2 kalimat.

k9 "pemanfaatanDigital": Pemanfaatan teknologi digital untuk menciptakan pembelajaran yang interaktif, kolaboratif, dan kontekstual. Contoh: video pembelajaran, platform pembelajaran, perpustakaan digital, forum diskusi daring, aplikasi penilaian, dan sebagainya. 1-2 kalimat. Media digital yang disebutkan di sini WAJIB dipakai kembali secara nyata di langkah inti (memahami/mengaplikasi).

k10 "kegiatanAwal": Pembuka dari proses pembelajaran yang bertujuan untuk mempersiapkan murid sebelum memasuki inti. Kegiatan dalam tahap ini meliputi orientasi yang bermakna, apersepsi yang kontekstual, dan motivasi yang menggembirakan. PERSIS 3-4 langkah bernomor (1., 2., 3., 4.). DUA langkah pertama WAJIB berurutan: (1) berdoa bersama sesuai keyakinan masing-masing, (2) mengecek kehadiran dan kesiapan belajar murid. Langkah selanjutnya kegiatan apersepsi/motivasi yang RINCI: siapa melakukan apa, bagaimana, dan keterangan alokasi waktu "(N menit)". Terapkan Dimensi Profil Lulusan secara konkret TANPA menyebut nama dimensi.

k11 "inti": ARRAY JSON dari objek-objek, satu objek per sintaks model pembelajaran (sesuai urutan "Sintaks Model" pada k6 praktikPedagogis). Format:
[{"tahap":"<nama tahap sintaks>","langkah":"<langkah-langkah>"}]
Pada bagian "langkah" WAJIB berisi:
1. Baris pertama: prinsip pembelajaran yang digunakan pada tahap ini (berkesadaran, bermakna, dan/atau menggembirakan).
2. Lalu langkah-langkah bernomor urut (1., 2., 3., ...).
SETIAP langkah WAJIB memuat:
- Keterangan aturan berupa salah satu dari: "Memahami:", "Mengaplikasi:", atau "Merefleksi:" — diikuti prinsip pembelajaran dalam kurung, lalu deskripsi kegiatan.
  * Memahami: (prinsip) kegiatan yang memfasilitasi murid untuk terlibat aktif mengonstruksi pengetahuan agar dapat memahami secara mendalam konsep atau materi dari berbagai sumber dan konteks. Pengetahuan terdiri dari pengetahuan esensial, pengetahuan aplikatif, dan pengetahuan nilai dan karakter.
  * Mengaplikasi: (prinsip) kegiatan yang mengondisikan pengalaman belajar yang menunjukkan aktivitas murid mengaplikasi pemahaman secara kontekstual atau kehidupan nyata (hidup, kehidupan, dan/atau penghidupan). Proses mengaplikasi ini merupakan bagian dari pendalaman pengetahuan untuk menghasilkan pengembangan kompetensi.
  * Merefleksi: (prinsip) kegiatan yang memfasilitasi murid: (a) mengevaluasi dan memaknai proses serta hasil dari tindakan atau praktik nyata yang telah mereka lakukan dan menentukan tindak lanjut ke depan; (b) mengelola proses belajarnya secara mandiri, dengan meneruskan dan mengembangkan strategi belajar yang berhasil dan memperbaiki yang belum berhasil dengan tetap meningkatkan motivasi belajar dan kepercayaan diri.
- Keterangan alokasi waktu "(N menit)" di akhir langkah.
Contoh format langkah:
"1. Memahami: (Berkesadaran, Bermakna) Murid mengamati tayangan video tentang keberagaman budaya yang ditampilkan oleh guru, lalu mengidentifikasi contoh keberagaman budaya di lingkungan sekitar menggunakan lembar kerja cetak (10 menit)."
Urutan tahapan sintaks HARUS mengikuti persis urutan pada "Sintaks Model" di k6.
Media digital dari k9, kegiatan lintas disiplin dari k5 (dengan penanda nama mapel), dan mitra dari k7 (bila ada, dengan penanda) WAJIB muncul secara nyata di langkah-langkah.

k12 "penutup": Tahap akhir dalam proses pembelajaran yang bertujuan memberikan umpan balik yang konstruktif kepada murid atas pengalaman belajar yang telah dilakukan, menyimpulkan pembelajaran, dan murid terlibat dalam perencanaan pembelajaran selanjutnya. Tuliskan prinsip pembelajaran yang digunakan (berkesadaran, bermakna, dan menggembirakan). Sertakan tindakan saling memuliakan antara guru dan murid. 2-3 langkah bernomor dengan "(N menit)".

k13.. (asesmen): Array teks berisi teknik dan instrumen penilaian yang digunakan pada awal, proses, dan akhir pembelajaran. Asesmen dalam pembelajaran mendalam dilaksanakan melalui: (a) asesmen sebagai pembelajaran (assessment as learning) yang menekankan pada penilaian diri dan penilaian sejawat, (b) asesmen untuk pembelajaran (assessment for learning) yang menekankan pada umpan balik, (c) asesmen hasil pembelajaran (assessment of learning) yang menekankan pada pencapaian dan tindak lanjut — dengan mempertimbangkan karakteristik murid. Contoh teknik: Penilaian Sejawat, Penilaian Diri, Penilaian Proyek, Penilaian Produk, Observasi, Portofolio, Penilaian Berbasis Kelas, Penilaian Kinerja, Tes Tertulis, Tes Lisan, dan sebagainya. Banyaknya asesmen PERSIS sama dengan jumlah Tujuan Pembelajaran yang dipilih (satu asesmen untuk tiap TP). Tiap elemen memuat tiga bagian berlabel "Teknik & Instrumen:", "Aspek yang Dinilai:", dan "Prinsip Assessment:", dipisahkan baris.

k(13+nAs).. (tujuanPembelajaran ABCD): TULIS ULANG dalam RUMUSAN ABCD untuk setiap TP yang dipilih (jangan mengubah makna): berbentuk "(condition), murid dapat (behavior) (degree)". Condition diawali "melalui/by/…" (mis. "Melalui diskusi kelompok"). Degree memakai kata TERUKUR (mis. "dengan tepat", "secara runtut", "sesuai kriteria"). JUMLAH sesuai TP yang dipilih (${nTP}). CONDITION yang kamu tulis pada tiap rumusan WAJIB konsisten muncul di "Metode Pembelajaran:" pada k6 praktikPedagogis DAN benar-benar dilaksanakan di langkah-langkah kegiatan pembelajaran pada k11 inti.

${brevityBlock}
${aturanBlock}
${closingBlock}`;
}

async function requestAiText(
	input: RpmGenerateInput,
	userPrompt: string,
	responseSchema: Record<string, unknown> | null,
	maxTokens = 16384
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
						...(opts.maxTokens ? { max_tokens: maxTokens } : {})
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
			// body may not be JSON
		}
		console.error(
			`[ai-rpm] Provider error status=${response.status} "${response.statusText}" detail=${detail || rawHint || '(no body)'}`
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

// ── Parsing helpers ──

const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export const toText = (v: unknown): string => {
	if (typeof v === 'string') {
		const t = v.trim();
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

export function parseInti(text: string): SintaksBlock[] {
	const v = (text ?? '').trim();
	if (!v) return [];

	let parsed: unknown;
	try {
		parsed = JSON.parse(v);
	} catch {
		parsed = undefined;
	}

	if (Array.isArray(parsed)) {
		return parsed
			.map((item) => {
				if (item && typeof item === 'object') {
					const o = item as Record<string, unknown>;
					const tahap = toText(
						o['tahap'] ?? o['sintaks'] ?? o['nama'] ?? o['name'] ?? o['judul'] ?? ''
					);
					const langkah = toText(
						o['langkah'] ?? o['detail'] ?? o['isi'] ?? o['steps'] ?? o['kegiatan'] ?? item
					);
					return { tahap, langkah };
				}
				return { tahap: '', langkah: toText(item) };
			})
			.filter((b) => b.langkah);
	}

	const blocks: SintaksBlock[] = [];
	const sectionRegex =
		/\[(?:Sintaks|SINTAKS)\s*(?:model\s+pembelajaran\s+)?\d+\s*[—–\-]\s*(.+?)\]/gi;
	const matches = [...v.matchAll(sectionRegex)];

	if (matches.length > 1) {
		for (let i = 0; i < matches.length; i++) {
			const start = matches[i].index!;
			const end = i + 1 < matches.length ? matches[i + 1].index! : v.length;
			const section = v.slice(start, end).trim();
			const tahap = (matches[i][1] ?? '').trim();
			const langkah = section.replace(/^\[[^\]]+\]\s*/, '').trim();
			if (langkah) blocks.push({ tahap: tahap || `Sintaks ${i + 1}`, langkah });
		}
		return blocks;
	}

	const lineRegex = /^(?:Sintaks|SINTAKS)\s+(?:model\s+pembelajaran\s+)?\d+\s*[—–\-]\s*(.+)/gim;
	const lineMatches = [...v.matchAll(lineRegex)];
	if (lineMatches.length > 1) {
		const positions = lineMatches.map((m) => m.index!);
		for (let i = 0; i < positions.length; i++) {
			const start = positions[i];
			const end = i + 1 < positions.length ? positions[i + 1] : v.length;
			const section = v.slice(start, end).trim();
			const firstLine = section.split('\n')[0] ?? '';
			const headerM = firstLine.match(
				/^(?:Sintaks|SINTAKS)\s+(?:model\s+pembelajaran\s+)?\d+\s*[—–\-]\s*(.+)/i
			);
			const tahap = headerM?.[1]?.trim() ?? '';
			const langkah = section.replace(/^[^\n]*\n?/, '').trim();
			if (langkah) blocks.push({ tahap: tahap || `Sintaks ${i + 1}`, langkah });
		}
		return blocks;
	}

	return [{ tahap: '', langkah: v }];
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

	const normalized = new Map<string, unknown>();
	for (const [k, v] of Object.entries(first)) normalized.set(normKey(k), v);

	type FieldDef = { name: string; patterns: string[]; cores: string[] };

	const FIELDS: FieldDef[] = [
		{
			name: 'pengetahuanAwal',
			patterns: ['pengetahuanawal', 'pengetahuan murid', 'pengetahuan', 'k1'],
			cores: ['pengetahuanawal', 'pengetahuanmurid', 'pengetahuanawal']
		},
		{
			name: 'minat',
			patterns: ['minat', 'minatmurid', 'k2'],
			cores: ['minat']
		},
		{
			name: 'latarBelakang',
			patterns: ['latarbelakang', 'latar belakang', 'k3'],
			cores: ['latarbelakang', 'latar']
		},
		{
			name: 'kebutuhanBelajar',
			patterns: ['kebutuhanbelajar', 'kebutuhan belajar', 'k4'],
			cores: ['kebutuhanbelajar', 'kebutuhan']
		},
		{
			name: 'lintasDisiplinIlmu',
			patterns: [
				'lintasdisiplinilmu',
				'lintasdisiplin',
				'lintas disiplin ilmu',
				'lintasdisiplinilmu',
				'k5'
			],
			cores: ['lintasdisiplin', 'lintas']
		},
		{
			name: 'praktikPedagogis',
			patterns: [
				'praktikpedagogis',
				'praktik pedagogis',
				'modelpembelajaran',
				'model pembelajaran',
				'strategimetode',
				'k6'
			],
			cores: ['praktikpedagogis', 'praktik', 'pedagogis', 'modelpembelajaran', 'strategi']
		},
		{
			name: 'kemitraanPembelajaran',
			patterns: ['kemitraanpembelajaran', 'kemitraan', 'kemitraanpembelajaran', 'k7'],
			cores: ['kemitraan', 'mitra']
		},
		{
			name: 'lingkunganPembelajaran',
			patterns: ['lingkunganpembelajaran', 'lingkungan pembelajaran', 'k8'],
			cores: ['lingkungan']
		},
		{
			name: 'pemanfaatanDigital',
			patterns: ['pemanfaatandigital', 'pemanfaatan digital', 'digital', 'k9'],
			cores: ['digital', 'pemanfaatan']
		},
		{
			name: 'kegiatanAwal',
			patterns: ['kegiatanawal', 'kegiatan awal', 'k10'],
			cores: ['kegiatanawal']
		},
		{
			name: 'penutup',
			patterns: ['penutup', 'k12'],
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
		for (const [nk, v] of normalized.entries()) {
			if (def?.cores.some((c) => nk.includes(c))) {
				const t = toText(v);
				if (t) return t;
			}
		}
		return '';
	};

	const getInti = (): SintaksBlock[] => {
		const candidates = ['inti', 'k11', 'langkahinti', 'sintaks', 'pengalamaninti'];
		for (const c of candidates) {
			const v = normalized.get(normKey(c));
			if (v !== undefined) {
				if (typeof v === 'string') return parseInti(v);
				if (Array.isArray(v)) {
					const blocks = v
						.map((item) => {
							if (item && typeof item === 'object') {
								const o = item as Record<string, unknown>;
								const tahap = toText(o['tahap'] ?? o['sintaks'] ?? o['nama'] ?? '');
								const langkah = toText(o['langkah'] ?? o['isi'] ?? o['detail'] ?? item);
								return { tahap, langkah };
							}
							return { tahap: '', langkah: toText(item) };
						})
						.filter((b) => b.langkah);
					if (blocks.length) return blocks;
				}
				if (typeof v === 'object') {
					const text = toText(v);
					if (text) return parseInti(text);
				}
			}
		}
		for (const [nk, v] of normalized.entries()) {
			if (nk.includes('inti') || nk.includes('sintaks')) {
				const t = typeof v === 'string' ? v : toText(v);
				if (t) {
					const blocks = parseInti(t);
					if (blocks.length) return blocks;
				}
			}
		}
		return [];
	};

	const getAsesmen = (): string[] => {
		const arr = first['asesmen'];
		if (Array.isArray(arr)) {
			const a = (arr as unknown[]).map((x) => toText(x)).filter(Boolean);
			if (a.length) return a;
		}
		const numeric: string[] = [];
		for (let i = 0; i < nAsesmen; i++) {
			const v = normalized.get(`k${13 + i}`);
			if (v !== undefined) {
				const t = toText(v);
				if (t) numeric.push(t);
			}
		}
		if (numeric.length) return numeric;
		const fromKeys: string[] = [];
		for (const [nk, v] of normalized.entries()) {
			if (nk.includes('asesmen') || nk.includes('assessment')) {
				const t = toText(v);
				if (t) fromKeys.push(t);
			}
		}
		if (fromKeys.length) return fromKeys;
		const patterns = [
			['asesmen', 'asesmenpembelajaran1', 'asesmen1', 'k13'],
			['asesmenpembelajaran2', 'asesmen2', 'k14'],
			['asesmenpembelajaran3', 'asesmen3', 'k15']
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

	const getTujuanPembelajaran = (): string[] => {
		const direct = first['tujuanpembelajaran'];
		if (Array.isArray(direct)) {
			const a = (direct as unknown[]).map((x) => toText(x)).filter(Boolean);
			if (a.length) return a;
		}
		const out: string[] = [];
		for (let i = 0; i < nTP; i++) {
			const v = normalized.get(`k${13 + nAsesmen + i}`);
			if (v !== undefined) {
				const t = toText(v);
				if (t) out.push(t);
			}
		}
		if (out.length) return out;
		const fromKeys: string[] = [];
		for (const [nk, v] of normalized.entries()) {
			if (nk.includes('tujuanpembelajaran') || nk.includes('abcd') || nk.includes('tp')) {
				const t = toText(v);
				if (t && !nk.includes('lintas') && !nk.includes('kemitraan')) fromKeys.push(t);
			}
		}
		return fromKeys;
	};

	const asesmen = getAsesmen();
	const tujuan = getTujuanPembelajaran();
	const inti = getInti();

	const result: RpmGenerated = {
		pengetahuanAwal: getField('pengetahuanAwal'),
		minat: getField('minat'),
		latarBelakang: getField('latarBelakang'),
		kebutuhanBelajar: getField('kebutuhanBelajar'),
		lintasDisiplinIlmu: getField('lintasDisiplinIlmu'),
		praktikPedagogis: getField('praktikPedagogis'),
		kemitraanPembelajaran: getField('kemitraanPembelajaran'),
		lingkunganPembelajaran: getField('lingkunganPembelajaran'),
		pemanfaatanDigital: getField('pemanfaatanDigital'),
		kegiatanAwal: getField('kegiatanAwal'),
		inti,
		penutup: getField('penutup'),
		asesmen,
		tujuanPembelajaran: tujuan
	};

	const missing: string[] = [];
	if (!result.praktikPedagogis) missing.push('praktik pedagogis');
	if (!result.kegiatanAwal) missing.push('kegiatan awal');
	if (!inti.length) missing.push('inti');
	if (!result.penutup) missing.push('penutup');
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
		console.error('[ai-rpm] Missing fields:', missing.join(', '), 'keys:', receivedKeys);
		throw new Error(
			`AI mengembalikan respons yang tidak lengkap. Bagian yang kosong: ${missing.join(', ')}. Kunci yang diterima: ${receivedKeys}. Coba lagi.`
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

function geminiBase(base: string): string {
	return base.replace(/\/v1beta$/, '');
}
