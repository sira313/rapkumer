<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- static link(s) to external/about pages */
	import Donate from '$lib/components/donate.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { openQrisImage } from '$lib/components/qris-image-modal';
	import type { PageData } from './$types';

	const { data } = $props<{ data: PageData }>();
	const appVersion = $derived(data.appVersion ?? '0.0.0');
</script>

<Donate />

<div class="flex flex-col gap-4">
	<section class="hero bg-base-100 shadow-md rounded-box min-h-48">
		<div class="hero-content text-center">
			<div class="max-w-xl">
				<img src="/logo.png" alt="Logo Rapkumer" class="mx-auto mb-4 w-24" />
				<h1 class="text-base-content text-3xl font-bold md:text-4xl">Rapkumer</h1>
				<p class="text-base-content/70 mt-1 text-sm">v{appVersion}</p>
				<p class="text-base-content/80 mt-4">
					Aplikasi administrasi guru terpadu untuk presensi, jurnal mengajar, nilai, dan rapor, siap
					cetak sesuai Kurikulum Merdeka.
				</p>
				<div class="mt-6 flex flex-wrap justify-center gap-2">
					<a
						class="btn btn-primary btn-sm"
						href="https://t.me/+zj3h_zjBAC02YjZl"
						target="_blank"
						rel="noreferrer"
					>
						<Icon name="telegram" />
						Grup Telegram
					</a>
					<a
						class="btn btn-soft btn-sm"
						href="https://kurikulum.kemendikdasmen.go.id/"
						target="_blank"
						rel="noreferrer"
					>
						Kurikulum
					</a>
					<a class="btn btn-soft btn-sm" href="/lisensi">Lisensi</a>
				</div>
			</div>
		</div>
	</section>

	<section class="card bg-base-100 rounded-box shadow-md">
		<div class="card-body gap-4">
			<h2 class="card-title">Fitur Utama</h2>
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="bg-base-200 rounded-box flex gap-3 p-4">
					<Icon name="import" class="text-primary mt-0.5 h-5 w-5 shrink-0" />
					<div>
						<p class="font-semibold">Import Excel</p>
						<p class="text-base-content/70 text-sm">
							Template bawaan untuk input data massal, tidak perlu copy paste berulang.
						</p>
					</div>
				</div>
				<div class="bg-base-200 rounded-box flex gap-3 p-4">
					<Icon name="export" class="text-secondary mt-0.5 h-5 w-5 shrink-0" />
					<div>
						<p class="font-semibold">Tarik data dan kirim nilai ke Dapodik</p>
						<p class="text-base-content/70 text-sm">
							Aplikasi ini sudah bisa menarik data dan mengirim matev beserta nilainya langsung ke
							Dapodik.
						</p>
					</div>
				</div>
				<div class="bg-base-200 rounded-box flex gap-3 p-4">
					<Icon name="book-open" class="text-accent mt-0.5 h-5 w-5 shrink-0" />
					<div>
						<p class="font-semibold">Jurnal Mengajar</p>
						<p class="text-base-content/70 text-sm">
							Catat kegiatan belajar mengajar harian secara otomatis.
						</p>
					</div>
				</div>
				<div class="bg-base-200 rounded-box flex gap-3 p-4">
					<Icon name="bar-chart" class="text-info mt-0.5 h-5 w-5 shrink-0" />
					<div>
						<p class="font-semibold">Nilai Otomatis</p>
						<p class="text-base-content/70 text-sm">
							Nilai STS dan SAS dihitung otomatis untuk rapor, siap cetak.
						</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<section class="card bg-base-100 rounded-box shadow-md">
		<div class="card-body gap-4">
			<h2 class="card-title">Mengapa Rapkumer?</h2>
			<p class="text-base-content/80">
				Aplikasi ini kami kembangkan sebagai solusi terpadu untuk tugas administrasi guru: presensi
				harian, jurnal mengajar, nilai harian, nilai STS, dan nilai SAS yang dihitung otomatis
				menjadi nilai rapor, bisa langsung dicetak atau dikirim ke Dapodik.
			</p>
			<p class="text-base-content/80">
				Ada juga jadwal pembelajaran dan bell otomatis. Harapan kami, aplikasi ini membantu pendidik
				dan tenaga kependidikan menerapkan Kurikulum Merdeka secara efektif dan efisien.
			</p>
		</div>
	</section>

	<section class="grid gap-4 lg:grid-cols-2">
		<div class="card bg-base-100 rounded-box shadow-md">
			<div class="card-body gap-3">
				<h2 class="card-title">Tim Pengembang</h2>
				<ul class="menu bg-base-200 rounded-box w-full">
					<li>
						<a href="https://apoxi.cam/" target="_blank" rel="noreferrer">
							<span class="font-semibold">Aris Pratama</span>
							<span class="text-base-content/60">Founder &amp; Maintainer</span>
						</a>
					</li>
					<li>
						<a href="https://mustofa.id" target="_blank" rel="noreferrer">
							<span class="font-semibold">Habib Mustofa</span>
							<span class="text-base-content/60">Mentor &amp; Advisor</span>
						</a>
					</li>
				</ul>

				<h3 class="card-title mt-1">Tester</h3>
				<ul class="menu bg-base-200 rounded-box w-full">
					{#each ['Hamdani, S.Pd., Gr.', 'Rudiansyah, S.Pd., Gr.', 'Putra Panji Prasetiyo, S.Pd., Gr.'] as name (name)}
						<li><span class="pointer-events-none cursor-default">{name}</span></li>
					{/each}
				</ul>
			</div>
		</div>

		<div class="card bg-base-100 rounded-box shadow-md">
			<div class="card-body gap-3">
				<h2 class="card-title">Referensi</h2>
				<ul class="divide-base-300 bg-base-200 rounded-box divide-y">
					<li class="flex flex-col gap-1 p-4">
						<a
							href="https://kurikulum.kemendikdasmen.go.id/file/1755668120_manage_file.pdf"
							target="_blank"
							rel="noreferrer"
							class="link link-hover font-semibold">Panduan Belajar dan Asesmen revisi 2025</a
						>
						<span class="text-base-content/60 text-xs">PDF: kurikulum.kemendikdasmen.go.id</span>
					</li>
					<li class="flex flex-col gap-1 p-4">
						<a
							href="https://kurikulum.kemendikdasmen.go.id/file/1753779343_manage_file.pdf"
							target="_blank"
							rel="noreferrer"
							class="link link-hover font-semibold">Panduan Kokurikuler tahun 2025</a
						>
						<span class="text-base-content/60 text-xs">PDF: kurikulum.kemendikdasmen.go.id</span>
					</li>
					<li class="flex flex-col gap-1 p-4">
						<a
							href="https://uploads.belajar.id/document/files/Kepka_BSKAP_No_01k17e8396ajn15j3hcw0k773b.pdf"
							target="_blank"
							rel="noreferrer"
							class="link link-hover font-semibold">Capaian Pembelajaran</a
						>
						<span class="text-base-content/60 text-xs">PDF: uploads.belajar.id</span>
					</li>
					<li class="flex flex-col gap-1 p-4">
						<a
							href="https://drive.google.com/file/d/1kZnNYVitjQQqHtqVHGhuiMTdNFDqF3v1/view"
							target="_blank"
							rel="noreferrer"
							class="link link-hover font-semibold">Capaian Pembelajaran Khusus PAPB</a
						>
						<span class="text-base-content/60 text-xs">PDF: Google Drive</span>
					</li>
				</ul>
			</div>
		</div>
	</section>

	<section class="card bg-base-100 rounded-box shadow-md">
		<div class="card-body gap-4">
			<h2 class="card-title">Terima Kasih</h2>
			<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
				<div class="bg-base-200 rounded-box p-4">
					<span class="badge badge-primary badge-soft badge-sm">UI &amp; UX</span>
					<p class="mt-2 font-semibold">Noffie Suryanti Mandasari, S.Pd.</p>
					<p class="text-base-content/70 text-sm">Ide dan saran pengembangan antarmuka.</p>
				</div>
				<div class="bg-base-200 rounded-box p-4">
					<span class="badge badge-secondary badge-soft badge-sm">Asesmen</span>
					<p class="mt-2 text-sm font-bold">Saran alur penilaian:</p>
					<ul class="text-base-content/80 mt-1 text-sm">
						<li>Saipul Anam, S.Pd.</li>
						<li>Anistoga, S.Pd., Gr.</li>
						<li>Fathonah Nilawidya, S.Pd.</li>
						<li>Rudiansyah, S.Pd., Gr.</li>
					</ul>
				</div>
				<div class="bg-base-200 rounded-box p-4">
					<span class="badge badge-accent badge-soft badge-sm">Donasi</span>
					<p class="mt-2 text-sm">
						Dukungan komunitas melalui
						<button type="button" class="link link-primary" onclick={openQrisImage}>QRIS</button>.
					</p>
				</div>
			</div>
		</div>
	</section>
</div>
