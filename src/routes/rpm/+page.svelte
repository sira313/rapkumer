<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import PdfPreviewModal from '$lib/components/cetak/PdfPreviewModal.svelte';
	import {
		profilPelajarPancasilaDimensions,
		profilPelajarPancasilaDimensionLabelByKey,
		type DimensiProfilLulusanKey
	} from '$lib/statics';

	type SintaksData = { tahap: string; langkah: string };

	type Generated = {
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
		inti: SintaksData[];
		penutup: string;
		asesmen: string[];
	};

	type StringFieldKey = {
		[K in keyof Generated]: Generated[K] extends string ? K : never;
	}[keyof Generated];

	let { data } = $props();

	const DIMENSI_PROFIL_LULUSAN_OPTIONS = profilPelajarPancasilaDimensions.map((d) => ({
		key: d.key,
		label: profilPelajarPancasilaDimensionLabelByKey[d.key]
	}));

	let capaianPembelajaran = $state('');
	// svelte-ignore state_referenced_locally
	let mapelId = $state<number>(data.pickerMapelId ?? 0);
	let lingkupMateri = $state('');
	let tpIds = $state<number[]>([]);
	let inputCustom = $state('');
	let profilLulusan = $state<DimensiProfilLulusanKey[]>([]);

	const profilLulusanLabels = $derived(
		profilLulusan.map((k) => profilPelajarPancasilaDimensionLabelByKey[k] ?? k)
	);
	const kelasLabelFase = $derived.by(() => {
		if (!kelasAktif) return '';
		const faseRaw = kelasAktif.fase ?? '';
		const fase = faseRaw ? ` Fase ${faseRaw.replace(/^Fase\s+/i, '').trim()}` : '';
		return `${kelasAktif.nama}${fase}`;
	});

	let generated = $state<Generated | null>(null);
	let generating = $state(false);
	let printing = $state(false);
	let errorMessage = $state('');
	let aiStatus = $state<'checking' | 'ready' | 'unconfigured'>('checking');
	let isAdminUser = $state(false);
	let pdfUrl = $state('');
	let pdfTitle = $state('');
	let pdfOpen = $state(false);
	let importOpen = $state(false);
	let importError = $state('');

	type RubrikRow = { aspek: string; indikator: string; skor: string; kriteria: string };
	type AsesmenLampiran = { uraian: string; instrumen: string; rubrik: RubrikRow[] };
	type Lampiran = { formatif: AsesmenLampiran; sumatif: AsesmenLampiran; lkpd: string };
	let lampiran = $state<Lampiran | null>(null);
	let lampiranGenerating = $state(false);
	let lampiranError = $state('');
	let combiningPdf = $state(false);
	let lampiranCustom = $state('');

	const kelasAktif = $derived(data.kelasAktif);
	const selectedMapel = $derived(data.mapelList.find((m) => m.id === mapelId));
	const isAgamaFamily = $derived(
		selectedMapel
			? /^pendidikan (agama|kepercayaan)/i.test(selectedMapel.nama) ||
					/^pendalaman kitab suci/i.test(selectedMapel.nama)
			: false
	);

	let agamaKey = $state('');
	const showAgamaSelect = $derived(
		['admin', 'kepala_sekolah', 'wali_kelas'].includes(
			(data.user as { type?: string } | undefined)?.type ?? ''
		) &&
			!!selectedMapel &&
			/^(pendidikan (agama|kepercayaan) dan budi pekerti)/i.test(selectedMapel.nama)
	);
	const agamaOptions = $derived(
		(data.agamaOptions ?? []) as Array<{
			key: string;
			label: string;
			nama: string;
			mapelId: number;
		}>
	);
	const agamaChoice = $derived(agamaOptions.find((o) => o.key === agamaKey));
	const activeMapelId = $derived(showAgamaSelect && agamaChoice ? agamaChoice.mapelId : mapelId);
	const mapelNama = $derived(
		showAgamaSelect && agamaChoice ? agamaChoice.nama : (selectedMapel?.nama ?? '')
	);

	const kelasTps = $derived(
		data.tujuanPembelajaranList.filter((tp) => tp.mataPelajaranId === activeMapelId)
	);
	const lingkupOptions = $derived(
		[...new Set(kelasTps.map((tp) => tp.lingkupMateri).filter(Boolean))].sort()
	);
	const tpOptions = $derived(
		kelasTps.filter((tp) => !lingkupMateri || tp.lingkupMateri === lingkupMateri)
	);
	const selectedTps = $derived(data.tujuanPembelajaranList.filter((tp) => tpIds.includes(tp.id)));

	const canGenerate = $derived(
		aiStatus === 'ready' &&
			capaianPembelajaran.trim().length > 0 &&
			mapelId > 0 &&
			(!showAgamaSelect || !!agamaKey) &&
			lingkupMateri.trim().length > 0 &&
			profilLulusan.length > 0
	);
	const generateTitle = $derived.by(() => {
		if (aiStatus !== 'ready') return 'Fitur AI belum aktif. Setel kunci API di halaman Pengaturan.';
		if (!capaianPembelajaran.trim()) return 'Capaian Pembelajaran wajib diisi.';
		if (!mapelId) return 'Mata pelajaran wajib dipilih.';
		if (showAgamaSelect && !agamaKey)
			return 'Pilih agama terlebih dahulu agar menggunakan varian PABP yang sesuai.';
		if (!lingkupMateri.trim()) return 'Lingkup materi wajib dipilih.';
		if (profilLulusan.length === 0)
			return 'Pilih minimal satu Dimensi Profil Lulusan agar langkah pembelajaran selaras.';
		return undefined;
	});

	onMount(() => {
		(async () => {
			try {
				const response = await fetch('/api/ai/status');
				const body = await response.json().catch(() => ({}));
				aiStatus = response.ok && body?.configured ? 'ready' : 'unconfigured';
				isAdminUser = Boolean(body?.isAdmin);
			} catch {
				aiStatus = 'unconfigured';
			}
		})();
	});

	function handleMapelChange(event: Event) {
		mapelId = Number((event.currentTarget as HTMLSelectElement).value) || 0;
		agamaKey = '';
		lingkupMateri = '';
		tpIds = [];
	}

	function handleLingkupChange(event: Event) {
		lingkupMateri = (event.currentTarget as HTMLSelectElement).value;
		tpIds = [];
	}

	function toggleTp(id: number, checked: boolean) {
		tpIds = checked ? [...tpIds, id] : tpIds.filter((x) => x !== id);
	}

	function toggleDimensi(key: DimensiProfilLulusanKey, checked: boolean) {
		profilLulusan = checked
			? [...new Set([...profilLulusan, key])]
			: profilLulusan.filter((x) => x !== key);
	}

	function resetError() {
		errorMessage = '';
	}

	async function handleGenerate() {
		resetError();
		if (!canGenerate) {
			errorMessage = generateTitle ?? 'Lengkapi data terlebih dahulu.';
			return;
		}
		generating = true;
		try {
			const response = await fetch('/api/ai/rpm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					mapelId: activeMapelId,
					capaianPembelajaran: capaianPembelajaran.trim(),
					lingkupMateri: lingkupMateri.trim(),
					tujuanPembelajaranIds: tpIds,
					inputCustom: inputCustom.trim(),
					profilLulusan: profilLulusanLabels
				})
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				errorMessage = body?.message || 'Gagal generate RPM.';
				return;
			}
			generated = (body?.data?.generated ?? null) as Generated | null;
			if (!generated) {
				errorMessage = 'AI tidak menghasilkan konten RPM. Coba lagi.';
			}
		} catch {
			errorMessage = 'Terjadi kesalahan saat menghubungi layanan AI. Coba lagi.';
		} finally {
			generating = false;
		}
	}

	function updateGenerated<K extends keyof Generated>(key: K, value: Generated[K]) {
		if (!generated) return;
		generated = { ...generated, [key]: value };
	}

	function updateIntiSintaks(idx: number, field: 'tahap' | 'langkah', value: string) {
		if (!generated) return;
		const next = [...generated.inti];
		next[idx] = { ...next[idx], [field]: value };
		updateGenerated('inti', next);
	}

	function addIntiSintaks() {
		if (!generated) return;
		updateGenerated('inti', [...generated.inti, { tahap: '', langkah: '' }]);
	}

	function removeIntiSintaks(idx: number) {
		if (!generated) return;
		updateGenerated(
			'inti',
			generated.inti.filter((_, i) => i !== idx)
		);
	}

	function addAsesmen() {
		if (!generated) return;
		updateGenerated('asesmen', [...generated.asesmen, '']);
	}

	function updateAsesmen(idx: number, value: string) {
		if (!generated) return;
		const next = [...generated.asesmen];
		next[idx] = value;
		updateGenerated('asesmen', next);
	}

	function rpmPdfPayload() {
		if (!generated || !kelasAktif) return null;
		return {
			mapelNama,
			penyusun:
				data.user?.type === 'admin'
					? '-'
					: ((data.user as { pegawaiName?: string | null } | undefined)?.pegawaiName ?? '-'),
			kelasLabel: kelasAktif.nama,
			fase: kelasAktif.fase ?? null,
			lingkupMateri: lingkupMateri.trim(),
			profilLulusan: profilLulusanLabels,
			capaianPembelajaran: capaianPembelajaran.trim(),
			pengetahuanAwal: generated.pengetahuanAwal,
			minat: generated.minat,
			latarBelakang: generated.latarBelakang,
			kebutuhanBelajar: generated.kebutuhanBelajar,
			lintasDisiplinIlmu: generated.lintasDisiplinIlmu,
			tujuanPembelajaran: generated.tujuanPembelajaran.length
				? generated.tujuanPembelajaran
				: selectedTps.map((tp) => tp.deskripsi),
			praktikPedagogis: generated.praktikPedagogis,
			kemitraanPembelajaran: generated.kemitraanPembelajaran,
			lingkunganPembelajaran: generated.lingkunganPembelajaran,
			pemanfaatanDigital: generated.pemanfaatanDigital,
			kegiatanAwal: generated.kegiatanAwal,
			inti: generated.inti,
			penutup: generated.penutup,
			asesmen: generated.asesmen
		};
	}

	function lampiranPdfPayload() {
		if (!generated || !kelasAktif || !lampiran) return null;
		return {
			mapelNama,
			kelasLabel: kelasAktif.nama,
			penyusun:
				data.user?.type === 'admin'
					? '-'
					: ((data.user as { pegawaiName?: string | null } | undefined)?.pegawaiName ?? '-'),
			formatif: lampiran.formatif,
			sumatif: lampiran.sumatif,
			lkpd: lampiran.lkpd
		};
	}

	async function handlePrintPdf() {
		const payload = rpmPdfPayload();
		if (!payload || !kelasAktif) return;
		printing = true;
		resetError();
		try {
			const response = await fetch('/api/pdf/rpm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!response.ok) {
				const body = await response.json().catch(() => ({}));
				errorMessage = body?.message || 'Gagal membuat PDF.';
				return;
			}
			const blob = await response.blob();
			if (pdfUrl) URL.revokeObjectURL(pdfUrl);
			pdfUrl = URL.createObjectURL(blob);
			pdfTitle = `RPM - Kelas ${kelasAktif.nama}`;
			pdfOpen = true;
		} catch {
			errorMessage = 'Terjadi kesalahan saat membuat PDF.';
		} finally {
			printing = false;
		}
	}

	function handlePdfDownload() {
		if (!pdfUrl) return;
		const anchor = document.createElement('a');
		anchor.href = pdfUrl;
		anchor.download = 'rpm.pdf';
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		toast('PDF RPM diunduh.', 'success');
	}

	function handlePdfClose() {
		if (pdfUrl) URL.revokeObjectURL(pdfUrl);
		pdfUrl = '';
		pdfOpen = false;
	}

	function handleDownloadJson() {
		if (!generated || !kelasAktif) return;
		const payload = {
			mapelNama,
			kelas: kelasAktif.nama,
			fase: kelasAktif.fase ?? null,
			lingkupMateri: lingkupMateri.trim(),
			capaianPembelajaran: capaianPembelajaran.trim(),
			dimensiProfilLulusan: profilLulusanLabels,
			...generated,
			tujuanPembelajaran: generated.tujuanPembelajaran.length
				? generated.tujuanPembelajaran
				: selectedTps.map((tp) => tp.deskripsi)
		};
		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'rpm.json';
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		URL.revokeObjectURL(url);
		toast('Data RPM berhasil diunduh.', 'success');
	}

	function handleBack() {
		generated = null;
		resetError();
	}

	function handleLampiranBack() {
		lampiran = null;
		lampiranError = '';
	}

	function lampiranPayload() {
		if (!generated || !kelasAktif) return null;
		const muridText = [
			generated.pengetahuanAwal,
			generated.minat,
			generated.latarBelakang,
			generated.kebutuhanBelajar
		]
			.map((s) => s.trim())
			.filter(Boolean)
			.join('\n');

		// Pecah langkah inti ke tiga fase klasik agar lampiran tetap mengerti struktur.
		const intiLines: string[] = [];
		for (const b of generated.inti) {
			intiLines.push(b.langkah);
		}
		const allSteps = intiLines.join('\n');
		const memahami: string[] = [];
		const mengaplikasi: string[] = [];
		const merefleksi: string[] = [];
		for (const line of allSteps
			.split(/\n+/)
			.map((s) => s.trim())
			.filter(Boolean)) {
			if (/^\d+\.\s*Mengaplikasi\s*:/i.test(line)) mengaplikasi.push(line);
			else if (/^\d+\.\s*Merefleksi\s*:/i.test(line)) merefleksi.push(line);
			else memahami.push(line);
		}

		return {
			mapelNama,
			kelasLabel: kelasAktif.nama,
			kelasId: kelasAktif.id,
			fase: kelasAktif.fase ?? null,
			lingkupMateri: lingkupMateri.trim(),
			capaianPembelajaran: capaianPembelajaran.trim(),
			tujuanPembelajaran: generated.tujuanPembelajaran.length
				? generated.tujuanPembelajaran
				: selectedTps.map((tp) => tp.deskripsi),
			asesmen: generated.asesmen,
			karakteristik: muridText,
			profilLulusan: profilLulusanLabels,
			model: generated.praktikPedagogis,
			inputCustom: lampiranCustom.trim(),
			kegiatanAwal: generated.kegiatanAwal,
			memahami: memahami.join('\n'),
			mengaplikasi: mengaplikasi.join('\n'),
			merefleksi: merefleksi.join('\n'),
			penutup: generated.penutup
		};
	}

	function lampiranAsesmen(value: unknown): AsesmenLampiran {
		if (!value || typeof value !== 'object') {
			const flat = typeof value === 'string' ? value.trim() : '';
			return flat
				? { uraian: flat, instrumen: '', rubrik: [] }
				: { uraian: '', instrumen: '', rubrik: [] };
		}
		const o = value as Record<string, unknown>;
		const t = (x: unknown): string => (typeof x === 'string' ? x.trim() : '');
		const rowOf = (r: unknown): RubrikRow => {
			if (r && typeof r === 'object') {
				const row = r as Record<string, unknown>;
				return {
					aspek: t(row?.aspek),
					indikator: t(row?.indikator),
					skor: t(row?.skor),
					kriteria: t(row?.kriteria)
				};
			}
			return { aspek: String(r ?? '').trim(), indikator: '', skor: '', kriteria: '' };
		};
		const rubrik = Array.isArray(o.rubrik)
			? (o.rubrik as unknown[])
					.map(rowOf)
					.filter((r) => r.aspek || r.kriteria || r.indikator || r.skor)
			: typeof o.rubrik === 'string'
				? o.rubrik
						.split(/\n+/)
						.map((line) => line.trim())
						.filter((line) => /^\d+\.|^[-*]/.test(line))
						.map((line) => rowOf(line.replace(/^(\d+\.|[-*])\s*/, '')))
						.filter((r) => r.aspek)
				: [];
		return { uraian: t(o.uraian), instrumen: t(o.instrumen), rubrik };
	}

	function handleLampiranImport() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'application/json,.json';
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;
			try {
				const data = JSON.parse(await file.text()) as Record<string, unknown>;
				const formatif = lampiranAsesmen(data.formatif);
				const sumatif = lampiranAsesmen(data.sumatif);
				const lkpd = typeof data.lkpd === 'string' ? data.lkpd.trim() : '';
				if (
					(!formatif.uraian && !formatif.instrumen) ||
					(!sumatif.uraian && !sumatif.instrumen) ||
					!lkpd
				) {
					throw new Error('invalid');
				}
				lampiran = { formatif, sumatif, lkpd };
				lampiranError = '';
				toast('Lampiran RPM berhasil diimpor.', 'success');
			} catch {
				lampiranError = 'Berkas bukan JSON lampiran RPM yang valid.';
			}
		};
		input.click();
	}

	async function handleGenerateLampiran() {
		const payload = lampiranPayload();
		if (!payload || !generated) return;
		lampiranError = '';
		lampiranGenerating = true;
		try {
			const response = await fetch('/api/ai/lampiran', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				lampiranError = body?.message || 'Gagal generate lampiran.';
				return;
			}
			const g = body?.data?.generated as Lampiran | null;
			if (!g) {
				lampiranError = 'AI tidak menghasilkan lampiran. Coba lagi.';
				return;
			}
			lampiran = g;
		} catch {
			lampiranError = 'Terjadi kesalahan saat menghubungi layanan AI. Coba lagi.';
		} finally {
			lampiranGenerating = false;
		}
	}

	async function handleLampiranPdf() {
		const payload = lampiranPdfPayload();
		if (!payload) return;
		printing = true;
		resetError();
		try {
			const response = await fetch('/api/pdf/lampiran', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!response.ok) {
				const body = await response.json().catch(() => ({}));
				errorMessage = body?.message || 'Gagal membuat PDF lampiran.';
				return;
			}
			const blob = await response.blob();
			if (pdfUrl) URL.revokeObjectURL(pdfUrl);
			pdfUrl = URL.createObjectURL(blob);
			pdfTitle = 'Lampiran RPM';
			pdfOpen = true;
		} catch {
			errorMessage = 'Terjadi kesalahan saat membuat PDF lampiran.';
		} finally {
			printing = false;
		}
	}

	async function handleCombinePdf() {
		const rpm = rpmPdfPayload();
		const lampiran = lampiranPdfPayload();
		if (!rpm || !lampiran) return;
		combiningPdf = true;
		resetError();
		try {
			const response = await fetch('/api/pdf/combine', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ rpm, lampiran })
			});
			if (!response.ok) {
				const body = await response.json().catch(() => ({}));
				errorMessage = body?.message || 'Gagal menggabungkan PDF.';
				return;
			}
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = 'rpm-dan-lampiran.pdf';
			document.body.appendChild(anchor);
			anchor.click();
			document.body.removeChild(anchor);
			window.setTimeout(() => URL.revokeObjectURL(url), 1000);
			toast('PDF RPM + Lampiran diunduh.', 'success');
		} catch {
			errorMessage = 'Terjadi kesalahan saat menggabungkan PDF.';
		} finally {
			combiningPdf = false;
		}
	}

	function handleLampiranJson() {
		if (!generated || !kelasAktif || !lampiran) return;
		const payload = {
			mapelNama,
			kelas: kelasAktif.nama,
			fase: kelasAktif.fase ?? null,
			lingkupMateri: lingkupMateri.trim(),
			tujuanPembelajaran: generated.tujuanPembelajaran.length
				? generated.tujuanPembelajaran
				: selectedTps.map((tp) => tp.deskripsi),
			formatif: lampiran.formatif,
			sumatif: lampiran.sumatif,
			lkpd: lampiran.lkpd
		};
		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'lampiran-rpm.json';
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		URL.revokeObjectURL(url);
		toast('Lampiran RPM diunduh.', 'success');
	}

	function strOrEmpty(v: unknown): string {
		return typeof v === 'string' ? v : '';
	}

	function sintaksFromUnknown(v: unknown): SintaksData[] {
		if (!v) return [];
		if (Array.isArray(v)) {
			return v
				.map((item) => {
					if (item && typeof item === 'object') {
						const o = item as Record<string, unknown>;
						return {
							tahap: strOrEmpty(o.tahap ?? o.sintaks ?? o.nama),
							langkah: strOrEmpty(o.langkah ?? o.isi ?? o.detail)
						};
					}
					return { tahap: '', langkah: strOrEmpty(item) };
				})
				.filter((b) => b.langkah);
		}
		if (typeof v === 'string' && v.trim()) {
			// Format bracket "[Sintaks N — Nama]" ... jika tak ada, format baris
			// "Sintaks model pembelajaran N — Nama".
			const brackets = [
				...(v.matchAll(/\[(?:Sintaks|SINTAKS)\s*\d+\s*[—–-]\s*([^\]]+)\]/g) ?? [])
			];
			const lines = [
				...(v.matchAll(/^(?:Sintaks|SINTAKS)\s+model\s+pembelajaran\s+\d+\s*[—–-]\s*(.+)$/gim) ?? [])
			];
			const heads = brackets.map((m, i) => ({
				name: m[1].trim(),
				start: m.index,
				end: m.index + m[0].length
			}));
			if (heads.length === 0 && lines.length) {
				const lh = lines.map((m, i) => ({
					name: m[1].trim(),
					start: m.index,
					end: (m as RegExpExecArray).index + (m as RegExpExecArray)[0].length
				}));
				heads.push(...lh);
			}
			if (heads.length === 0) return [{ tahap: '', langkah: v.trim() }];
			const blocks: SintaksData[] = [];
			for (let i = 0; i < heads.length; i++) {
				const sectionStart = heads[i].end;
				const sectionEnd = i + 1 < heads.length ? heads[i + 1].start : v.length;
				const langkah = v.slice(sectionStart, sectionEnd).trim();
				if (langkah) blocks.push({ tahap: heads[i].name, langkah });
			}
			return blocks;
		}
		return [];
	}

	async function handleImportFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		importError = '';
		let text: string;
		try {
			text = await file.text();
		} catch {
			importError = 'Gagal membaca file.';
			return;
		}
		restoreFromJson(text);
	}

	function restoreFromJson(text: string) {
		let payload: Record<string, unknown>;
		try {
			payload = JSON.parse(text) as Record<string, unknown>;
		} catch {
			importError = 'File bukan JSON yang valid.';
			return;
		}

		const g = payload;
		if (typeof g.praktikPedagogis !== 'string' || typeof g.kegiatanAwal !== 'string') {
			importError = 'File bukan hasil generate RPM (format tidak sesuai).';
			return;
		}

		const next: Generated = {
			pengetahuanAwal: strOrEmpty(g.pengetahuanAwal),
			minat: strOrEmpty(g.minat),
			latarBelakang: strOrEmpty(g.latarBelakang),
			kebutuhanBelajar: strOrEmpty(g.kebutuhanBelajar),
			lintasDisiplinIlmu: strOrEmpty(g.lintasDisiplinIlmu),
			tujuanPembelajaran: Array.isArray(g.tujuanPembelajaran)
				? (g.tujuanPembelajaran as unknown[]).map(String).filter(Boolean)
				: [],
			praktikPedagogis: strOrEmpty(g.praktikPedagogis),
			kemitraanPembelajaran: strOrEmpty(g.kemitraanPembelajaran),
			lingkunganPembelajaran: strOrEmpty(g.lingkunganPembelajaran),
			pemanfaatanDigital: strOrEmpty(g.pemanfaatanDigital),
			kegiatanAwal: strOrEmpty(g.kegiatanAwal),
			inti: sintaksFromUnknown(g.inti),
			penutup: strOrEmpty(g.penutup),
			asesmen: Array.isArray(g.asesmen) ? (g.asesmen as unknown[]).map(String).filter(Boolean) : []
		};
		generated = next;

		lingkupMateri = strOrEmpty(g.lingkupMateri);
		capaianPembelajaran = strOrEmpty(g.capaianPembelajaran);

		const mapelNama = strOrEmpty(g.mapelNama);
		if (mapelNama) {
			const match = data.mapelList.find((m) => m.nama === mapelNama);
			if (match) {
				mapelId = match.id;
				agamaKey = '';
			} else {
				const agamaMatch = agamaOptions.find((o) => o.nama === mapelNama);
				if (agamaMatch) {
					mapelId = agamaMatch.mapelId;
					agamaKey = agamaMatch.key;
				}
			}
		}

		const labelToKey = new Map<string, string>();
		for (const [key, label] of Object.entries(profilPelajarPancasilaDimensionLabelByKey)) {
			labelToKey.set(label, key);
		}
		const dims = Array.isArray(g.dimensiProfilLulusan)
			? (g.dimensiProfilLulusan as unknown[]).map(String)
			: [];
		profilLulusan = dims
			.map((l) => (labelToKey.get(l) ?? '') as DimensiProfilLulusanKey)
			.filter(Boolean);

		const tps = Array.isArray(g.tujuanPembelajaran)
			? (g.tujuanPembelajaran as unknown[]).map(String)
			: [];
		tpIds = tps
			.map((d) => data.tujuanPembelajaranList.find((tp) => tp.deskripsi === d)?.id)
			.filter((id): id is number => typeof id === 'number');

		importOpen = false;
		importError = '';
		toast('Import berhasil. Periksa hasil, lalu cetak ke PDF.', 'success');
	}
</script>

<div class="space-y-4">
	<div class="card bg-base-100 rounded-box w-full border border-none p-4 shadow-md">
		<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
			<h2 class="text-lg font-bold">Generate RPM (Rencana Pembelajaran Mendalam)</h2>
			<button
				class="btn btn-soft btn-sm shadow-none"
				type="button"
				onclick={() => (importOpen = true)}
			>
				<Icon name="import" />
				Import JSON
			</button>
		</div>
		<p class="text-base-content/70 mb-4 text-sm">
			Buat Rencana Pembelajaran Mendalam (RPM) berbasis Capaian Pembelajaran, mata pelajaran,
			lingkup materi, tujuan pembelajaran, karakteristik murid, dan Dimensi Profil Lulusan pilihan
			Anda. Hasil disusun ke dalam Identifikasi, Desain Pembelajaran, Pengalaman Belajar, dan
			Asesmen Pembelajaran — diperiksa dan disunting sebelum dicetak ke PDF.
		</p>

		{#if aiStatus === 'checking'}
			<div class="alert alert-info alert-soft mb-4">
				<span class="loading loading-spinner loading-sm"></span>
				<span>Memeriksa ketersediaan fitur AI…</span>
			</div>
		{:else if aiStatus === 'unconfigured'}
			<div class="alert alert-warning mb-4" role="alert">
				<Icon name="warning" />
				<span>
					Fitur AI belum aktif. Setel kunci API {isAdminUser ? '' : 'pribadi Anda '}di
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- deep link to settings page AI key card -->
					<a class="link" href="/pengaturan#ai-key">Pengaturan</a>.
				</span>
			</div>
		{/if}

		{#if !generated}
			<div class="flex flex-col gap-4">
				{#snippet mapel_and_agama()}
					<fieldset class="fieldset">
						<legend class="fieldset-legend font-semibold">Mata Pelajaran di Kelas Aktif</legend>
						{#if data.mapelList.length === 0}
							<p class="text-sm opacity-60">Belum ada mata pelajaran di kelas aktif ini.</p>
						{:else}
							<select
								class="select bg-base-200 dark:bg-base-300 validator w-full dark:border-none"
								value={mapelId}
								onchange={handleMapelChange}
							>
								<option value={0} disabled>Pilih mata pelajaran…</option>
								{#each data.mapelList as m (m.id)}
									<option value={m.id}>{m.nama}</option>
								{/each}
							</select>
						{/if}
					</fieldset>

					{#if showAgamaSelect}
						<fieldset class="fieldset">
							<legend class="fieldset-legend font-semibold">Agama</legend>
							{#if !agamaOptions.length}
								<p class="text-sm opacity-60">
									Tidak ada varian agama untuk Pendidikan Agama dan Budi Pekerti di kelas ini.
								</p>
							{:else}
								<select
									class="select bg-base-200 dark:bg-base-300 validator w-full dark:border-none"
									bind:value={agamaKey}
									onchange={() => {
										lingkupMateri = '';
										tpIds = [];
									}}
								>
									<option value="">Pilih agama…</option>
									{#each agamaOptions as o (o.key)}
										<option value={o.key}>{o.label}</option>
									{/each}
								</select>
							{/if}
						</fieldset>
					{/if}
				{/snippet}

				{#if showAgamaSelect}
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
						{@render mapel_and_agama()}
					</div>
				{:else}
					{@render mapel_and_agama()}
				{/if}

				<div class="alert alert-info" role="note">
					<Icon name="info" />
					<span>
						Khusus sekolah negeri, pastikan menggunakan Capaian Pembelajaran dari
						{#if isAgamaFamily}
							<a
								class="link"
								href="https://drive.google.com/file/d/1kZnNYVitjQQqHtqVHGhuiMTdNFDqF3v1/view"
								target="_blank"
								rel="noreferrer">Keputusan Kepala BKPDM Nomor 020 Tahun 2026</a
							>
						{:else}
							<a
								class="link"
								href="https://uploads.belajar.id/document/files/Kepka_BSKAP_No_01k17e8396ajn15j3hcw0k773b.pdf"
								target="_blank"
								rel="noreferrer">Keputusan Kepala BSKAP Nomor 046 tahun 2025</a
							>
						{/if}
						.
					</span>
				</div>

				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Capaian Pembelajaran</legend>
					<textarea
						class="textarea validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
						bind:value={capaianPembelajaran}
						placeholder="Tempel atau tulis Capaian Pembelajaran (CP) yang akan dijadikan dasar penyusunan RPM"
						rows="6"></textarea>
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Lingkup Materi</legend>
					<select
						class="select bg-base-200 dark:bg-base-300 validator w-full dark:border-none"
						value={lingkupMateri}
						onchange={handleLingkupChange}
						disabled={!selectedMapel || lingkupOptions.length === 0}
					>
						<option value="">Pilih lingkup materi…</option>
						{#each lingkupOptions as lm (lm)}
							<option value={lm}>{lm}</option>
						{/each}
					</select>
					<p class="mt-1 text-xs opacity-60">
						Lingkup materi menjadi "Materi Pelajaran" pada Identifikasi sekaligus "Topik
						Pembelajaran" pada Desain Pembelajaran.
					</p>
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">
						Tujuan Pembelajaran (bisa lebih dari satu)
					</legend>
					{#if !selectedMapel}
						<p class="text-sm opacity-60">Pilih mata pelajaran terlebih dahulu.</p>
					{:else if tpOptions.length === 0}
						<p class="text-sm opacity-60">Belum ada tujuan pembelajaran pada lingkup materi ini.</p>
					{:else}
						<div
							class="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-box border p-2 bg-base-200 dark:bg-base-300 border-base-300 dark:border-none"
						>
							{#each tpOptions as tp (tp.id)}
								<label class="flex items-start gap-2 text-sm">
									<input
										type="checkbox"
										class="checkbox checkbox-sm mt-0.5"
										checked={tpIds.includes(tp.id)}
										onchange={(event) =>
											toggleTp(tp.id, (event.currentTarget as HTMLInputElement).checked)}
									/>
									<span>{tp.deskripsi}</span>
								</label>
							{/each}
						</div>
						<p class="mt-1 text-xs opacity-60">
							Tujuan pembelajaran yang dipilih akan diubah AI menjadi rumusan ABCD pada hasil.
						</p>
					{/if}
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">
						Dimensi Profil Lulusan (pilih satu atau lebih)
					</legend>
					<div
						class="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-box border p-2 bg-base-200 dark:bg-base-300 border-base-300 dark:border-none"
					>
						{#each DIMENSI_PROFIL_LULUSAN_OPTIONS as opt (opt.key)}
							<label class="flex items-start gap-2 text-sm">
								<input
									type="checkbox"
									class="checkbox checkbox-sm mt-0.5"
									checked={profilLulusan.includes(opt.key)}
									onchange={(event) =>
										toggleDimensi(opt.key, (event.currentTarget as HTMLInputElement).checked)}
								/>
								<span>{opt.label}</span>
							</label>
						{/each}
					</div>
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">Prompt Tambahan untuk AI (opsional)</legend>
					<textarea
						class="textarea bg-base-200 dark:bg-base-300 w-full dark:border-none"
						bind:value={inputCustom}
						placeholder="contoh: murid lebih suka belajar dengan video; aku ingin ada kemitraan dengan puskesmas; gunakan model Problem Based Learning"
						rows="3"></textarea>
					<p class="mt-1 text-xs opacity-60">
						Permintaan tambahan yang memengaruhi seluruh hasil: karakteristik murid, lintas disiplin
						ilmu, praktik pedagogis, kemitraan, lingkungan, pemanfaatan digital, pengalaman belajar,
						dan asesmen. Tidak dicetak langsung, hanya menjadi acuan AI.
					</p>
				</fieldset>

				{#if errorMessage}
					<div class="alert alert-error alert-soft" role="alert" aria-live="polite">
						<Icon name="error" />
						<span>{errorMessage}</span>
					</div>
				{/if}

				<div class="flex justify-end gap-2">
					<button
						class="btn btn-primary shadow-none"
						type="button"
						onclick={handleGenerate}
						disabled={generating || !canGenerate}
						aria-busy={generating}
						title={canGenerate ? undefined : generateTitle}
					>
						{#if generating}
							<span class="loading loading-spinner loading-sm"></span>
						{:else}
							<Icon name="sparkles" />
						{/if}
						Generate RPM
					</button>
				</div>
			</div>
		{:else}
			{@const g = generated}
			{#snippet field_item(label: string, key: StringFieldKey, rows = 4)}
				<div class="grid gap-1 sm:grid-cols-[12rem_1fr] sm:items-start">
					<span class="text-sm font-semibold sm:pt-2">{label}</span>
					<textarea
						class="textarea validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
						{rows}
						value={g[key] as string}
						oninput={(event) =>
							updateGenerated(key, (event.currentTarget as HTMLTextAreaElement).value)}></textarea>
				</div>
			{/snippet}

			<p class="text-base-content/70 mb-3 text-sm">
				Hasil generate sementara. Silakan periksa dan perbaiki bagian yang diinginkan sebelum
				mencetak PDF.
			</p>

			<div class="flex flex-col gap-4">
				<div class="card bg-base-100 rounded-box border border-base-300 p-4">
					<h3 class="mb-3 text-base font-bold">A. Identifikasi</h3>
					<div class="flex flex-col gap-4">
						<div class="grid gap-1 sm:grid-cols-[12rem_1fr] sm:items-start">
							<span class="text-sm font-semibold sm:pt-2">Murid ({kelasLabelFase})</span>
							<div class="flex flex-col gap-3">
								{@render field_item('Pengetahuan Awal', 'pengetahuanAwal', 2)}
								{@render field_item('Minat', 'minat', 2)}
								{@render field_item('Latar Belakang', 'latarBelakang', 2)}
								{@render field_item('Kebutuhan Belajar', 'kebutuhanBelajar', 2)}
							</div>
						</div>

						<div class="grid gap-1 sm:grid-cols-[12rem_1fr] sm:items-start">
							<span class="text-sm font-semibold sm:pt-2">Materi Pelajaran</span>
							<div class="pt-2 text-sm">{lingkupMateri}</div>
						</div>

						<div class="grid gap-1 sm:grid-cols-[12rem_1fr] sm:items-start">
							<span class="text-sm font-semibold sm:pt-2">Dimensi Profil Lulusan</span>
							<div
								class="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-box border p-2 bg-base-200 dark:bg-base-300 border-base-300 dark:border-none"
							>
								{#each DIMENSI_PROFIL_LULUSAN_OPTIONS as opt (opt.key)}
									<label class="flex items-start gap-2 text-sm">
										<input
											type="checkbox"
											class="checkbox checkbox-sm mt-0.5"
											checked={profilLulusan.includes(opt.key)}
											onchange={(event) =>
												toggleDimensi(opt.key, (event.currentTarget as HTMLInputElement).checked)}
										/>
										<span>{opt.label}</span>
									</label>
								{/each}
							</div>
						</div>
					</div>
				</div>

				<div class="card bg-base-100 rounded-box border border-base-300 p-4">
					<h3 class="mb-3 text-base font-bold">B. Desain Pembelajaran</h3>
					<div class="flex flex-col gap-4">
						<div class="grid gap-1 sm:grid-cols-[12rem_1fr] sm:items-start">
							<span class="text-sm font-semibold sm:pt-2">Capaian Pembelajaran</span>
							<textarea
								class="textarea validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								rows="4"
								value={capaianPembelajaran}
								oninput={(event) =>
									(capaianPembelajaran = (event.currentTarget as HTMLTextAreaElement).value)}
							></textarea>
						</div>

						<div class="grid gap-1 sm:grid-cols-[12rem_1fr] sm:items-start">
							<span class="text-sm font-semibold sm:pt-2">Topik Pembelajaran</span>
							<div class="pt-2 text-sm">{lingkupMateri}</div>
						</div>

						<div class="grid gap-1 sm:grid-cols-[12rem_1fr] sm:items-start">
							<span class="text-sm font-semibold sm:pt-2">Tujuan Pembelajaran</span>
							<div class="flex flex-col gap-1 pt-1">
								{#if g.tujuanPembelajaran?.length}
									{#each g.tujuanPembelajaran as tp, idx (idx)}
										<span class="text-sm">{idx + 1}. {tp}</span>
									{/each}
								{:else}
									{#each selectedTps as tp, idx (tp.id)}
										<span class="text-sm">{idx + 1}. {tp.deskripsi}</span>
									{:else}
										<span class="text-sm italic opacity-60"
											>Belum ada tujuan pembelajaran dipilih.</span
										>
									{/each}
								{/if}
							</div>
						</div>

						{@render field_item('Lintas Disiplin Ilmu', 'lintasDisiplinIlmu')}
						{@render field_item('Praktik Pedagogis (Model/Strategi/Metode)', 'praktikPedagogis', 6)}
						{@render field_item('Kemitraan Pembelajaran', 'kemitraanPembelajaran')}
						{@render field_item('Lingkungan Pembelajaran', 'lingkunganPembelajaran')}
						{@render field_item('Pemanfaatan Digital', 'pemanfaatanDigital')}
					</div>
				</div>

				<div class="card bg-base-100 rounded-box border border-base-300 p-4">
					<h3 class="mb-3 text-base font-bold">C. Pengalaman Belajar</h3>
					<div class="flex flex-col gap-4">
						{@render field_item('Awal', 'kegiatanAwal', 5)}

						<div class="grid gap-1 sm:grid-cols-[12rem_1fr] sm:items-start">
							<span class="text-sm font-semibold sm:pt-3">Inti</span>
							<div class="flex flex-col gap-3">
								{#if g.inti.length === 0}
									<p class="text-sm italic opacity-60">Belum ada sintaks model pembelajaran.</p>
								{/if}
								{#each g.inti as block, i (i)}
									<div class="rounded-box border border-base-300 bg-base-200 p-3 dark:bg-base-300">
										<div class="flex items-center justify-between gap-2">
											<span class="text-sm font-semibold"
												>{block.tahap.trim() || `Sintaks model pembelajaran ${i + 1}`}</span
											>
											<button
												class="btn btn-ghost btn-sm shadow-none"
												type="button"
												title="Hapus sintaks ini"
												aria-label="Hapus sintaks"
												onclick={() => removeIntiSintaks(i)}
											>
												<Icon name="close" />
											</button>
										</div>
										<input
											class="input input-sm bg-base-100 dark:bg-base-100 w-full"
											placeholder="Nama tahap sintaks (mis. Orientasi, Merumuskan Masalah)"
											value={block.tahap}
											oninput={(event) =>
												updateIntiSintaks(
													i,
													'tahap',
													(event.currentTarget as HTMLInputElement).value
												)}
										/>
										<textarea
											class="textarea validator bg-base-100 dark:bg-base-100 mt-2 w-full dark:border-none"
											rows="6"
											value={block.langkah}
											placeholder="Langkah-langkah (setiap langkah memuat Memahami/Mengaplikasi/Merefleksi + prinsip + alokasi waktu)"
											oninput={(event) =>
												updateIntiSintaks(
													i,
													'langkah',
													(event.currentTarget as HTMLTextAreaElement).value
												)}></textarea>
									</div>
								{/each}
								<button
									class="btn btn-soft btn-sm shadow-none"
									type="button"
									onclick={addIntiSintaks}
								>
									<Icon name="plus" />
									Tambah Sintaks
								</button>
							</div>
						</div>

						{@render field_item('Penutup', 'penutup', 5)}
					</div>
				</div>

				<div class="card bg-base-100 rounded-box border border-base-300 p-4">
					<h3 class="mb-3 text-base font-bold">D. Asesmen Pembelajaran</h3>
					<div class="flex flex-col gap-4">
						{#if g.asesmen.length}
							{#each g.asesmen as a, i (i)}
								<div class="grid gap-1 sm:grid-cols-[12rem_1fr] sm:items-start">
									<span class="text-sm font-semibold sm:pt-2"
										>Assessment for Learning ({i + 1})</span
									>
									<textarea
										class="textarea validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
										rows="5"
										value={a}
										oninput={(event) =>
											updateAsesmen(i, (event.currentTarget as HTMLTextAreaElement).value)}
									></textarea>
								</div>
							{/each}
						{:else}
							<p class="text-sm italic opacity-60">Belum ada assessment.</p>
						{/if}
						<div class="flex justify-end">
							<button class="btn btn-soft btn-sm shadow-none" type="button" onclick={addAsesmen}>
								<Icon name="plus" />
								Tambah Asesmen
							</button>
						</div>
					</div>
				</div>
			</div>

			{#if errorMessage}
				<div class="alert alert-error alert-soft" role="alert" aria-live="polite">
					<Icon name="error" />
					<span>{errorMessage}</span>
				</div>
			{/if}

			<div
				class="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
			>
				<div class="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap">
					<button
						class="btn btn-soft btn-sm w-full shadow-none sm:btn-md sm:w-auto"
						type="button"
						onclick={handleBack}
					>
						Kembali ke Form
					</button>
					<button
						class="btn btn-soft btn-sm w-full shadow-none sm:btn-md sm:w-auto"
						type="button"
						onclick={handleDownloadJson}
					>
						<Icon name="download" />
						Unduh JSON
					</button>
				</div>
				<button
					class="btn btn-primary btn-sm w-full shadow-none sm:btn-md sm:w-auto"
					type="button"
					onclick={handlePrintPdf}
					disabled={printing}
					aria-busy={printing}
				>
					{#if printing}
						<span class="loading loading-spinner loading-sm"></span>
					{:else}
						<Icon name="print" />
					{/if}
					Cetak PDF
				</button>
			</div>
		{/if}
	</div>

	{#if generated}
		{#if !lampiran}
			<div class="card bg-base-100 rounded-box w-full border border-none p-4 shadow-md">
				<div
					class="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
				>
					<h2 class="text-lg font-bold">Lampiran RPM</h2>
					<div class="flex flex-wrap gap-2 sm:justify-end">
						<button
							class="btn btn-primary btn-sm shadow-none"
							type="button"
							onclick={handleGenerateLampiran}
							disabled={lampiranGenerating}
							aria-busy={lampiranGenerating}
						>
							{#if lampiranGenerating}
								<span class="loading loading-spinner loading-sm"></span>
							{:else}
								<Icon name="sparkles" />
							{/if}
							Generate Lampiran
						</button>
						<button
							class="btn btn-soft btn-sm shadow-none"
							type="button"
							onclick={handleLampiranImport}
						>
							<Icon name="import" />
							Import JSON
						</button>
					</div>
				</div>
				<p class="mb-3 text-sm opacity-70">
					Penilaian Formatif &amp; Sumatif (beserta rubrik) serta Lembar Kerja Murid — disusun
					terkait tujuan pembelajaran dan langkah kegiatan pada RPM.
				</p>

				{#if lampiranError}
					<div class="alert alert-error alert-soft mb-4" role="alert">
						<Icon name="error" />
						<span>{lampiranError}</span>
					</div>
				{/if}

				<fieldset class="fieldset mb-3">
					<legend class="fieldset-legend font-semibold">Prompt Tambahan untuk AI (opsional)</legend>
					<textarea
						class="textarea validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
						rows="2"
						placeholder="contoh: instrumen sumatif menggunakan soal jawaban ganda sebanyak 10 soal"
						value={lampiranCustom}
						oninput={(event) =>
							(lampiranCustom = (event.currentTarget as HTMLTextAreaElement).value)}></textarea>
				</fieldset>
			</div>
		{/if}

		{#if lampiran}
			<div class="card bg-base-100 rounded-box w-full border border-none p-4 shadow-md">
				<h2 class="mb-3 text-lg font-bold">Hasil Lampiran</h2>
				<p class="mb-3 text-sm opacity-70">
					Hasil lampiran dapat disunting sebelum dicetak. Rubrik otomatis menjadi tabel di PDF.
				</p>
				<div class="flex flex-col gap-4">
					<fieldset class="fieldset">
						<legend class="fieldset-legend font-semibold">Penilaian Formatif</legend>
						<span class="fieldset-label">Uraian Teknik &amp; Pelaksanaan</span>
						<textarea
							class="textarea validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
							rows="3"
							value={lampiran.formatif.uraian}
							oninput={(event) => {
								const cur = lampiran as Lampiran;
								lampiran = {
									...cur,
									formatif: {
										...cur.formatif,
										uraian: (event.currentTarget as HTMLTextAreaElement).value
									}
								};
							}}></textarea>
						<span class="fieldset-label">Instrumen Asesmen</span>
						<textarea
							class="textarea validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
							rows="6"
							value={lampiran.formatif.instrumen}
							oninput={(event) => {
								const cur = lampiran as Lampiran;
								lampiran = {
									...cur,
									formatif: {
										...cur.formatif,
										instrumen: (event.currentTarget as HTMLTextAreaElement).value
									}
								};
							}}></textarea>
						{#if lampiran.formatif.rubrik.length}
							<p class="ml-1 text-xs opacity-60">
								Rubrik ({lampiran.formatif.rubrik.length} aspek) ditampilkan sebagai tabel di PDF.
							</p>
						{/if}
					</fieldset>
					<fieldset class="fieldset">
						<legend class="fieldset-legend font-semibold">Penilaian Sumatif</legend>
						<span class="fieldset-label">Uraian Teknik &amp; Pelaksanaan</span>
						<textarea
							class="textarea validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
							rows="3"
							value={lampiran.sumatif.uraian}
							oninput={(event) => {
								const cur = lampiran as Lampiran;
								lampiran = {
									...cur,
									sumatif: {
										...cur.sumatif,
										uraian: (event.currentTarget as HTMLTextAreaElement).value
									}
								};
							}}></textarea>
						<span class="fieldset-label">Instrumen Asesmen</span>
						<textarea
							class="textarea validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
							rows="6"
							value={lampiran.sumatif.instrumen}
							oninput={(event) => {
								const cur = lampiran as Lampiran;
								lampiran = {
									...cur,
									sumatif: {
										...cur.sumatif,
										instrumen: (event.currentTarget as HTMLTextAreaElement).value
									}
								};
							}}></textarea>
						{#if lampiran.sumatif.rubrik.length}
							<p class="ml-1 text-xs opacity-60">
								Rubrik ({lampiran.sumatif.rubrik.length} aspek) ditampilkan sebagai tabel di PDF.
							</p>
						{/if}
					</fieldset>
					<fieldset class="fieldset">
						<legend class="fieldset-legend font-semibold">Lembar Kerja Murid (LKPD)</legend>
						<textarea
							class="textarea validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
							rows="8"
							value={lampiran.lkpd}
							oninput={(event) => {
								const cur = lampiran as Lampiran;
								lampiran = { ...cur, lkpd: (event.currentTarget as HTMLTextAreaElement).value };
							}}></textarea>
					</fieldset>
				</div>
				<div
					class="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
				>
					<div class="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap">
						<button
							class="btn btn-soft btn-sm w-full shadow-none sm:btn-md sm:w-auto"
							type="button"
							onclick={handleLampiranBack}
						>
							Kembali ke Form
						</button>
						<button
							class="btn btn-soft btn-sm w-full shadow-none sm:btn-md sm:w-auto"
							type="button"
							onclick={handleLampiranJson}
						>
							<Icon name="download" />
							Unduh JSON
						</button>
					</div>
					<div class="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap">
						<button
							class="btn btn-primary btn-sm w-full shadow-none sm:btn-md sm:w-auto"
							type="button"
							onclick={handleLampiranPdf}
							disabled={printing}
							aria-busy={printing}
						>
							{#if printing}
								<span class="loading loading-spinner loading-sm"></span>
							{:else}
								<Icon name="print" />
							{/if}
							Cetak PDF
						</button>
						<button
							class="btn btn-soft btn-sm w-full shadow-none sm:btn-md sm:w-auto"
							type="button"
							onclick={handleCombinePdf}
							disabled={combiningPdf}
							aria-busy={combiningPdf}
						>
							{#if combiningPdf}
								<span class="loading loading-spinner loading-sm"></span>
							{:else}
								<Icon name="download" />
							{/if}
							Combine PDF
						</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>

<dialog class="modal" open={importOpen} onclose={() => (importOpen = false)}>
	<div class="modal-box">
		<h3 class="mb-2 text-lg font-bold">Import Hasil Generate (JSON)</h3>
		<p class="mb-3 text-sm opacity-70">
			Pilih file <code>.json</code> hasil unduhan untuk mengembalikan hasil generate, lalu periksa dan
			cetak ke PDF.
		</p>
		<input
			type="file"
			accept="application/json,.json"
			class="file-input file-input-ghost"
			onchange={handleImportFile}
		/>
		{#if importError}
			<div class="alert alert-error alert-soft mt-3" role="alert">
				<Icon name="error" />
				<span>{importError}</span>
			</div>
		{/if}
		<div class="modal-action">
			<button class="btn btn-soft shadow-none" type="button" onclick={() => (importOpen = false)}>
				Batal
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label="Tutup">close</button>
	</form>
</dialog>

<PdfPreviewModal
	{pdfUrl}
	{pdfTitle}
	bind:open={pdfOpen}
	onDownload={handlePdfDownload}
	onClose={handlePdfClose}
/>
