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

	type Generated = {
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

	type StringFieldKey = {
		[K in keyof Generated]: Generated[K] extends string ? K : never;
	}[keyof Generated];

	let { data } = $props();

	const DIMENSI_PROFIL_LULUSAN_OPTIONS = profilPelajarPancasilaDimensions.map((d) => ({
		key: d.key,
		label: profilPelajarPancasilaDimensionLabelByKey[d.key]
	}));

	let capaianPembelajaran = $state('');
	let mapelId = $state<number>(0);
	let lingkupMateri = $state('');
	let tpIds = $state<number[]>([]);
	let inputCustom = $state('');
	let karakteristikInput = $state('');
	let profilLulusan = $state<DimensiProfilLulusanKey[]>([]);

	const profilLulusanLabels = $derived(
		profilLulusan.map((k) => profilPelajarPancasilaDimensionLabelByKey[k] ?? k)
	);
	const kelasLabelFase = $derived.by(() => {
		if (!kelasAktif) return '';
		const fase = kelasAktif.fase ? ` Fase ${kelasAktif.fase}` : '';
		return `Siswa ${kelasAktif.nama}${fase} dengan karakteristik`;
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

	const kelasAktif = $derived(data.kelasAktif);
	const selectedMapel = $derived(data.mapelList.find((m) => m.id === mapelId));
	const isAgamaFamily = $derived(
		selectedMapel
			? /^pendidikan (agama|kepercayaan)/i.test(selectedMapel.nama) ||
					/^pendalaman kitab suci/i.test(selectedMapel.nama)
			: false
	);
	const kelasTps = $derived(
		data.tujuanPembelajaranList.filter((tp) => tp.mataPelajaranId === mapelId)
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
			lingkupMateri.trim().length > 0 &&
			profilLulusan.length > 0
	);
	const generateTitle = $derived.by(() => {
		if (aiStatus !== 'ready') return 'Fitur AI belum aktif. Setel kunci API di halaman Pengaturan.';
		if (!capaianPembelajaran.trim()) return 'Capaian Pembelajaran wajib diisi.';
		if (!mapelId) return 'Mata pelajaran wajib dipilih.';
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
					mapelId,
					capaianPembelajaran: capaianPembelajaran.trim(),
					lingkupMateri: lingkupMateri.trim(),
					tujuanPembelajaranIds: tpIds,
					inputCustom: inputCustom.trim(),
					karakteristik: karakteristikInput.trim(),
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

	async function handlePrintPdf() {
		if (!generated || !kelasAktif) return;
		printing = true;
		resetError();
		try {
			const response = await fetch('/api/pdf/rpm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					kelasLabel: kelasAktif.nama,
					fase: kelasAktif.fase ?? null,
					karakteristik: generated.karakteristik,
					lingkupMateri: lingkupMateri.trim(),
					profilLulusan: profilLulusanLabels,
					capaianPembelajaran: capaianPembelajaran.trim(),
					lintasDisiplinIlmu: generated.lintasDisiplinIlmu,
					tujuanPembelajaran: selectedTps.map((tp) => tp.deskripsi),
					model: generated.model,
					kemitraanPembelajaran: generated.kemitraanPembelajaran,
					lingkunganPembelajaran: generated.lingkunganPembelajaran,
					pemanfaatanDigital: generated.pemanfaatanDigital,
					kegiatanAwal: generated.kegiatanAwal,
					memahami: generated.memahami,
					mengaplikasi: generated.mengaplikasi,
					merefleksi: generated.merefleksi,
					penutup: generated.penutup,
					asesmen: generated.asesmen,
					inputCustom: inputCustom.trim()
				})
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

	function handleBack() {
		generated = null;
		resetError();
	}
</script>

<div class="space-y-4">
	<div class="card bg-base-100 rounded-box w-full border border-none p-4 shadow-md">
		<div class="mb-3 flex items-center gap-2">
			<h2 class="text-lg font-bold">Generate RPM — Rencana Pembelajaran Mendalam</h2>
		</div>
		<p class="text-base-content/70 mb-4 text-sm">
			RPM untuk Kurikulum Merdeka dengan pendekatan Pembelajaran Mendalam. Teks dihasilkan AI dalam
			bahasa Indonesia sesuai EYD, terstruktur, ringkas, dan jelas.
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

		{#if errorMessage}
			<div class="alert alert-error alert-soft mb-4" role="alert">
				<Icon name="error" />
				<span>{errorMessage}</span>
			</div>
		{/if}

		{#if !generated}
			<div class="flex flex-col gap-4">
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

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
					</fieldset>

					<fieldset class="fieldset">
						<legend class="fieldset-legend font-semibold">Karakteristik Murid (opsional)</legend>
						<textarea
							class="textarea bg-base-200 dark:bg-base-300 w-full dark:border-none"
							bind:value={karakteristikInput}
							placeholder="Kosongkan untuk digenerate otomatis oleh AI, mis. siswa kelas aktif dengan latar belakang kemampuan beragam"
							rows="4"></textarea>
					</fieldset>
				</div>

				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">
						Tujuan Pembelajaran (bisa lebih dari satu)
					</legend>
					{#if !selectedMapel}
						<p class="text-sm opacity-60">Pilih mata pelajaran terlebih dahulu.</p>
					{:else if tpOptions.length === 0}
						<p class="text-sm opacity-60">Belum ada tujuan pembelajaran pada lingkup materi ini.</p>
					{:else}
						<div class="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-box border p-2">
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
					{/if}
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold">
						Dimensi Profil Lulusan (pilih satu atau lebih)
					</legend>
					<div class="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-box border p-2">
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
					<p class="mt-1 text-xs opacity-60">
						Pilih Dimensi Profil Lulusan yang relevan, sama seperti pada halaman Kokurikuler.
					</p>
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend font-semibold"
						>Catatan Deskripsi Tambahan (inputCustom)</legend
					>
					<textarea
						class="textarea bg-base-200 dark:bg-base-300 w-full dark:border-none"
						bind:value={inputCustom}
						placeholder="Opsional. Catatan tambahan guru yang akan disisipkan pada bagian yang sesuai."
						rows="3"></textarea>
				</fieldset>

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
				<div class="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-start">
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
					<h3 class="mb-3 text-base font-bold">Identifikasi</h3>
					<div class="flex flex-col gap-4">
						<div class="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-start">
							<span class="text-sm font-semibold sm:pt-2">Peserta Didik</span>
							<div>
								<p class="text-sm">{kelasLabelFase}</p>
								<textarea
									class="textarea validator bg-base-200 dark:bg-base-300 mt-2 w-full dark:border-none"
									rows="2"
									value={g.karakteristik}
									oninput={(event) =>
										updateGenerated(
											'karakteristik',
											(event.currentTarget as HTMLTextAreaElement).value
										)}
									placeholder="Karakteristik peserta didik"></textarea>
							</div>
						</div>

						<div class="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-start">
							<span class="text-sm font-semibold sm:pt-2">Materi Pelajaran</span>
							<div class="pt-2 text-sm">{lingkupMateri}</div>
						</div>

						<div class="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-start">
							<span class="text-sm font-semibold sm:pt-2">Dimensi Profil Lulusan</span>
							<div class="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-box border p-2">
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
					<h3 class="mb-3 text-base font-bold">Desain Pembelajaran</h3>
					<div class="flex flex-col gap-4">
						<div class="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-start">
							<span class="text-sm font-semibold sm:pt-2">Capaian Pembelajaran</span>
							<textarea
								class="textarea validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
								rows="4"
								value={capaianPembelajaran}
								oninput={(event) =>
									(capaianPembelajaran = (event.currentTarget as HTMLTextAreaElement).value)}
							></textarea>
						</div>

						<div class="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-start">
							<span class="text-sm font-semibold sm:pt-2">Topik Pembelajaran</span>
							<div class="pt-2 text-sm">{lingkupMateri}</div>
						</div>

						<div class="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-start">
							<span class="text-sm font-semibold sm:pt-2">Tujuan Pembelajaran</span>
							<div class="flex flex-col gap-1 pt-1">
								{#each selectedTps as tp, idx (tp.id)}
									<span class="text-sm">{idx + 1}. {tp.deskripsi}</span>
								{:else}
									<span class="text-sm italic opacity-60"
										>Belum ada tujuan pembelajaran dipilih.</span
									>
								{/each}
							</div>
						</div>

						{@render field_item('Lintas Disiplin Ilmu', 'lintasDisiplinIlmu')}
						{@render field_item('Praktis Pedagogis (Model/Strategi)', 'model', 5)}
						{@render field_item('Kemitraan Pembelajaran', 'kemitraanPembelajaran')}
						{@render field_item('Lingkungan Pembelajaran', 'lingkunganPembelajaran')}
						{@render field_item('Pemanfaatan Digital', 'pemanfaatanDigital')}
					</div>
				</div>

				<div class="card bg-base-100 rounded-box border border-base-300 p-4">
					<h3 class="mb-3 text-base font-bold">Pengalaman Belajar</h3>
					<div class="flex flex-col gap-4">
						<div class="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-start">
							<span class="text-sm font-semibold sm:pt-2">Catatan Tambahan Guru</span>
							<div>
								<textarea
									class="textarea bg-base-200 dark:bg-base-300 w-full dark:border-none"
									rows="2"
									value={inputCustom}
									oninput={(event) =>
										(inputCustom = (event.currentTarget as HTMLTextAreaElement).value)}></textarea>
								<p class="mt-1 text-xs opacity-60">
									Catatan ini disisipkan pada setiap bagian sesuai template.
								</p>
							</div>
						</div>

						{@render field_item('Kegiatan Awal', 'kegiatanAwal', 5)}
						{@render field_item('Memahami (Berkesadaran, Bermakna)', 'memahami', 5)}
						{@render field_item('Mengaplikasi (Bermakna, Menyenangkan)', 'mengaplikasi', 5)}
						{@render field_item('Merefleksi (Berkesadaran, Bermakna)', 'merefleksi', 5)}
						{@render field_item('Penutup Bermakna, Menggembirakan', 'penutup', 5)}
					</div>
				</div>

				<div class="card bg-base-100 rounded-box border border-base-300 p-4">
					<h3 class="mb-3 text-base font-bold">Asesmen Pembelajaran</h3>
					<div class="flex flex-col gap-4">
						{#each [0, 1, 2] as i (i)}
							<div class="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-start">
								<span class="text-sm font-semibold sm:pt-2">Assessment for Learning ({i + 1})</span>
								<textarea
									class="textarea validator bg-base-200 dark:bg-base-300 w-full dark:border-none"
									rows="5"
									value={g.asesmen[i] ?? ''}
									oninput={(event) => {
										const next = [...g.asesmen];
										next[i] = (event.currentTarget as HTMLTextAreaElement).value;
										updateGenerated('asesmen', next);
									}}></textarea>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<div class="mt-4 flex flex-wrap justify-end gap-2">
				<button class="btn btn-soft shadow-none" type="button" onclick={handleBack}>
					Kembali ke Form
				</button>
				<button
					class="btn btn-primary shadow-none"
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
</div>

<PdfPreviewModal
	{pdfUrl}
	{pdfTitle}
	bind:open={pdfOpen}
	onDownload={handlePdfDownload}
	onClose={handlePdfClose}
/>
