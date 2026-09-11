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
};

const REQUEST_TIMEOUT_MS = 120_000;

export async function generateRpm(input: RpmGenerateInput): Promise<RpmGenerated> {
	const userPrompt = buildRpmPrompt(input);

	const responseSchema = {
		type: 'object',
		properties: {
			karakteristik: { type: 'string' },
			model: { type: 'string' },
			lintasDisiplinIlmu: { type: 'string' },
			kemitraanPembelajaran: { type: 'string' },
			lingkunganPembelajaran: { type: 'string' },
			pemanfaatanDigital: { type: 'string' },
			kegiatanAwal: { type: 'string' },
			memahami: { type: 'string' },
			mengaplikasi: { type: 'string' },
			merefleksi: { type: 'string' },
			penutup: { type: 'string' },
			asesmen: { type: 'array', items: { type: 'string' } }
		},
		required: [
			'karakteristik',
			'model',
			'lintasDisiplinIlmu',
			'kemitraanPembelajaran',
			'lingkunganPembelajaran',
			'pemanfaatanDigital',
			'kegiatanAwal',
			'memahami',
			'mengaplikasi',
			'merefleksi',
			'penutup',
			'asesmen'
		]
	} as const;

	const text = await requestAiText(input, userPrompt, responseSchema);
	const parsed = parseGeneratedPayload(text);
	return parsed;
}

function buildRpmPrompt(input: RpmGenerateInput): string {
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
${inputCustom ? `\nCATATAN TAMBAHAN GURU:\n${inputCustom}` : ''}

Berdasarkan data di atas, buatlah elemen-elemen berikut. PENTING: seluruh langkah kegiatan pembelajaran (kegiatan awal, memahami, mengaplikasi, merefleksi, penutup) dan asesmen HARUS secara eksplisit mengembangkan dan menyebutkan Dimensi Profil Lulusan yang dipilih di atas, serta MENYESUAIKAN cara, media, ritme, dan tingkat pendampingan dengan karakteristik peserta didik yang diberikan (diferensiasi bila relevan). Media digital yang kamu tulis di "pemanfaatanDigital" WAJIB benar-benar DIPAKAI di dalam langkah-langkah kegiatan pembelajaran: sebutkan kembali penggunaan media digital tersebut secara konkret pada langkah fase "memahami" dan/atau "mengaplikasi" (mis. "guru menayangkan video animasi…", "murid menggunakan aplikasi…"), sehingga isi bagian Pemanfaatan Digital konsisten dengan langkah-langkahnya. Sisipkan nama dimensi pada langkah yang relevan agar keterkaitannya jelas dan terukur.
1. "karakteristik": ${karakteristik ? `gunakan persis teks berikut: "${karakteristik}"` : `deskripsi singkat karakteristik umum peserta didik kelas ${kelasLabel} yang menjadi dasar pembelajaran (mis. keragaman gaya belajar, tingkat keingintahuan, kemampuan berinkuiri), maksimal 1–2 kalimat.`}
2. "model": nama dan strategi model pembelajaran yang paling cocok untuk tujuan pembelajaran di baris pertama, lalu baris berikutnya adalah "Langkah:", dan baris berikutnya deretan langkah utamanya dengan tanda panah (→). Format persis seperti ini:
Model Pembelajaran Inkuiri (Inquiry Learning) dengan integrasi kegiatan role playing dan pembuatan poster.
Langkah:
Orientasi → Merumuskan masalah → Mengumpulkan data → Menganalisis data → Menyimpulkan → Refleksi
3. "lintasDisiplinIlmu": keterkaitan lintas disiplin ilmu dengan 2–3 mata pelajaran lain beserta aktivitas konkretnya, sebagai daftar bernomor, contoh: "1. Bahasa Indonesia (membaca dan menulis laporan hasil observasi)" lalu "2. Seni Budaya (membuat poster pelestarian)".
4. "kemitraanPembelajaran": mitra pembelajaran yang sesuai dengan materi (misal masyarakat sekitar atau profesi lain) plus bentuk kolaborasinya, 1–2 kalimat.
5. "lingkunganPembelajaran": pengaturan lingkungan belajar yang mendukung ketercapaian tujuan (tempat, penataan, suasana), 1–2 kalimat.
6. "pemanfaatanDigital": pemanfaatan teknologi digital yang relevan dengan tujuan pembelajaran (misal video animasi, simulasi, aplikasi interaktif), 1–2 kalimat. Media digital yang disebutkan di sini WAJIB dipakai kembali secara nyata di langkah "memahami" dan/atau "mengaplikasi".
7. "kegiatanAwal": TIGA hingga LIMA langkah kegiatan awal yang membangun kesadaran (berkesadaran) dan motivasi murid, sebagai daftar bernomor. Setiap langkah dijelaskan RINCI: siapa melakukan apa (guru dan murid), bagaimana, dan perkiraan durasi dalam menit. WAJIB menyertakan kegiatan yang secara eksplisit mengarahkan murid pada Dimensi Profil Lulusan yang dipilih (sebutkan nama dimensinya).
8. "memahami": EMPAT hingga ENAM langkah fase Memahami dengan prinsip berkesadaran dan bermakna, sebagai daftar bernomor. Setiap langkah dijelaskan RINCI: aktivitas guru, aktivitas murid, media/bahan yang digunakan, dan perkiraan durasi dalam menit. WAJIB mengembangkan salah satu atau lebih Dimensi Profil Lulusan yang dipilih dan menyebutkan nama dimensinya, serta WAJIB memakai media digital yang sama dengan "pemanfaatanDigital".
9. "mengaplikasi": EMPAT hingga ENAM langkah fase Mengaplikasi dengan prinsip bermakna dan menyenangkan, sebagai daftar bernomor. Setiap langkah dijelaskan RINCI: aktivitas guru, aktivitas murid, media/bahan, dan perkiraan durasi dalam menit. WAJIB mengembangkan salah satu atau lebih Dimensi Profil Lulusan yang dipilih dan menyebutkan nama dimensinya, serta WAJIB memakai media digital yang sama dengan "pemanfaatanDigital".
10. "merefleksi": TIGA hingga EMPAT langkah fase Merefleksi dengan prinsip berkesadaran dan bermakna, sebagai daftar bernomor. Setiap langkah dijelaskan RINCI: bentuk refleksi, pertanyaan pemantik, dan perkiraan durasi dalam menit. WAJIB menghubungkan pengalaman belajar dengan Dimensi Profil Lulusan yang dikembangkan.
11. "penutup": DUA hingga EMPAT langkah penutup yang bermakna dan menggembirakan, sebagai daftar bernomor dengan perkiraan durasi dalam menit. WAJIB menyertakan penegasan tentang Dimensi Profil Lulusan yang telah dikembangkan dalam pembelajaran hari ini.
12. "asesmen": TIGA bentuk Assessment for Learning yang cocok untuk tujuan pembelajaran. Tiap item wajib memuat tiga bagian berlabel: "Teknik & Instrumen:", "Aspek yang Dinilai:", dan "Prinsip Assessment:", dipisahkan baris. Di dalamnya harus mencakup penilaian terhadap perkembangan Dimensi Profil Lulusan yang dipilih. Contoh format per item:
Teknik & Instrumen:
Observasi proses inkuiri dan keterlibatan dalam role playing menggunakan lembar observasi.
Aspek yang Dinilai:
Keaktifan, rasa ingin tahu, kemampuan bekerja sama.
Prinsip Assessment:
Menilai proses dan keterlibatan siswa selama pembelajaran.

Seluruh teks dalam bahasa Indonesia yang baik dan benar sesuai EYD, terstruktur, tidak bertele-tele, mudah dipahami, dan relevan dengan capaian serta tujuan pembelajaran yang diberikan. Bila terdapat catatan tambahan guru, tidak perlu diulang di sini — catatan tersebut disisipkan langsung ke setiap bagian saat mencetak.

Jawab HANYA dengan JSON tanpa teks lain, dengan format:
{"karakteristik":"...","model":"...","lintasDisiplinIlmu":"...","kemitraanPembelajaran":"...","lingkunganPembelajaran":"...","pemanfaatanDigital":"...","kegiatanAwal":"...","memahami":"...","mengaplikasi":"...","merefleksi":"...","penutup":"...","asesmen":["asesmen 1","asesmen 2","asesmen 3"]}`;
}

async function requestAiText(
	input: RpmGenerateInput,
	userPrompt: string,
	responseSchema: Record<string, unknown>
): Promise<string> {
	const base = resolveBaseUrl(input.baseUrl);
	const isGeminiNative = base.includes('generativelanguage.googleapis.com');

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	let response: Response;
	try {
		if (isGeminiNative) {
			const endpoint = `${base}/v1beta/models/${input.model}:generateContent`;
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
						responseSchema
					}
				})
			});
		} else {
			const endpoint = `${base}/chat/completions`;
			response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${input.apiKey}`
				},
				signal: controller.signal,
				body: JSON.stringify({
					model: input.model,
					messages: [{ role: 'user', content: userPrompt }],
					response_format: { type: 'json_object', schema: responseSchema }
				})
			});
		}
	} catch (err) {
		clearTimeout(timeout);
		if (err instanceof Error && err.name === 'AbortError') {
			throw new Error('Waktu permintaan AI habis. Coba lagi dengan cakupan yang lebih kecil.', {
				cause: err
			});
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
			// ignore body parse errors
		}
		if (response.status === 400 || response.status === 403) {
			throw new Error(
				'Kunci API tidak valid atau kuota tidak mencukupi. Periksa kembali di halaman Pengaturan.'
			);
		}
		if (response.status === 429) {
			throw Object.assign(
				new Error(
					'Kuota API sedang habis atau terlalu banyak permintaan. Coba lagi beberapa saat.'
				),
				{ status: 429 }
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

function parseGeneratedPayload(text: string): RpmGenerated {
	const cleaned = text
		.trim()
		.replace(/^```(?:json)?/i, '')
		.replace(/```$/, '')
		.trim();
	let parsed: unknown;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		throw new Error('AI mengembalikan format yang tidak valid.');
	}

	const obj = (parsed ?? {}) as Record<string, unknown>;
	const str = (key: string): string =>
		typeof obj[key] === 'string' ? (obj[key] as string).trim() : '';
	const strArray = (key: string): string[] =>
		Array.isArray(obj[key])
			? (obj[key] as unknown[]).map((x) => String(x).trim()).filter(Boolean)
			: [];

	const asesmen = strArray('asesmen');
	const result: RpmGenerated = {
		karakteristik: str('karakteristik'),
		model: str('model'),
		lintasDisiplinIlmu: str('lintasDisiplinIlmu'),
		kemitraanPembelajaran: str('kemitraanPembelajaran'),
		lingkunganPembelajaran: str('lingkunganPembelajaran'),
		pemanfaatanDigital: str('pemanfaatanDigital'),
		kegiatanAwal: str('kegiatanAwal'),
		memahami: str('memahami'),
		mengaplikasi: str('mengaplikasi'),
		merefleksi: str('merefleksi'),
		penutup: str('penutup'),
		asesmen: asesmen.length >= 3 ? asesmen.slice(0, 3) : [...asesmen, '', '', ''].slice(0, 3)
	};

	if (!result.model || !result.kegiatanAwal) {
		throw new Error('AI tidak menghasilkan konten yang valid. Coba lagi.');
	}
	return result;
}

function resolveBaseUrl(baseUrl: string | null): string {
	const url = (baseUrl ?? '').trim();
	if (!url)
		throw new Error('Base URL API belum dikonfigurasi. Silakan atur di halaman Pengaturan.');
	return url.replace(/\/+$/, '');
}
