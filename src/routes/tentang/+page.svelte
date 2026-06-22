<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- static link(s) to external/about pages */
	import Donate from '$lib/components/donate.svelte';
	import Icon from '$lib/components/icon.svelte';
	import type { PageData } from './$types';

	const { data } = $props<{ data: PageData }>();
	const appVersion = $derived(data.appVersion ?? '0.0.0');
</script>

<Donate />

<div class="w-full space-y-5">
	<section
		class="rounded-box from-primary/15 via-base-100 to-secondary/20 ring-base-200/60 overflow-hidden bg-linear-to-br p-5 shadow-md ring-1 sm:p-8"
	>
		<div class="space-y-6">
			<span class="badge badge-outline bg-base-100/70 text-primary shadow"
				>Tentang Rapkumer v{appVersion}</span
			>
			<h1 class="text-base-content text-3xl font-bold md:text-4xl">
				Rapkumer — Aplikasi Administrasi Guru Terpadu
			</h1>
			<p class="text-base-content/90 text-base md:text-lg">
				Rapkumer membantu guru dan operator sekolah menyelesaikan administrasi rutin secara efisien dan
				siap cetak sesuai kurikulum terbaru.
			</p>

			<div class="grid gap-4 sm:grid-cols-2">
				<div class="rounded-box border-base-200/80 bg-base-100/90 border p-4 shadow-md">
					<h3 class="text-primary font-semibold">Import Excel Sekali Klik</h3>
					<p class="text-base-content/80 text-sm">
						Gunakan template bawaan untuk memasukkan data secara massal tanpa perlu copy paste
						berulang.
					</p>
				</div>
				<div class="rounded-box border-base-200/80 bg-base-100/90 border p-4 shadow-md">
					<h3 class="text-secondary font-semibold">Ekspor Nilai ke Dapodik</h3>
					<p class="text-base-content/80 text-sm">
						Integrasi nilai ke Dapodik sedang dalam tahap riset agar format ekspor aman dipakai.
						Dukungan donasi membantu percepatan pengembangan.
					</p>
				</div>
			</div>

			<div class="flex flex-col gap-3 sm:flex-row">
				<a
					class="btn btn-outline shadow-none"
					href="https://kurikulum.kemdikbud.go.id/"
					target="_blank"
					rel="noreferrer">Pelajari Kurikulum</a
				>
				<a class="btn btn-outline shadow-none" href="/lisensi">Lihat Lisensi</a>
				<a
					class="btn btn-primary shadow-none sm:ml-auto"
					href="https://t.me/+zj3h_zjBAC02YjZl"
					target="_blank"
					rel="noreferrer"
				>
					<Icon name="telegram" class="mr-2 text-xl shadow-none" />
					Tanya di Telegram
				</a>
			</div>
		</div>
	</section>

	<section class="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
		<div class="rounded-box border-base-200/80 bg-base-100/95 border p-6 shadow-md">
			<div class="space-y-4">
				<h2 class="text-base-content text-2xl font-semibold">Mengapa kami membangun Rapkumer?</h2>
				<p class="text-base-content/90">
					Aplikasi Rapkumer ini kami kembangkan sebagai aplikasi terpadu untuk membantu tugas-tugas administrasi guru seperti:
					presensi harian murid, jurnal mengajar,
					nilai harian, nilai STS, dan nilai SAS yang
					dihitung otomatis untuk dijadikan nilai rapor yang bisa langsung
					dicetak maupun di-export menjadi file excel yang bisa di-import ke e-rapor kemdikdas.
				</p>
				<p class="text-base-content/90">
					Selain itu, Rapkumer juga memiliki fitur tambahan seperti jadwal pembelajaran dan bell otomatis.
				</p>
				<p class="text-base-content/90">
					Harapan kami, aplikasi ini menjadi solusi praktis bagi pendidik dan tenaga kependidikan dalam menerapkan
					Kurikulum Merdeka secara efektif dan efisien.
				</p>
			</div>
		</div>

		<aside class="rounded-box border-base-200/80 bg-base-100/95 border p-6 shadow-md">
			<div class="space-y-4">
				<h3 class="text-base-content text-lg font-semibold">Pengembang & Kontributor</h3>
				<ul class="text-base-content/90 list-inside list-disc space-y-2">
					<li>
						<a href="https://apoxi.cam/" target="_blank" class="link link-primary">Aris Pratama</a> —
						Founder & Maintainer
					</li>
					<li>
						<a href="https://mustofa.id" target="_blank" class="link link-primary">Habib Mustofa</a>
						— Mentor & Advisor
					</li>
				</ul>

				<h3 class="text-base-content text-lg font-semibold">Tester</h3>
				<ul class="text-base-content/90 list-inside list-disc space-y-1">
					<li>Hamdani, S.Pd., Gr.</li>
					<li>Rudiansyah, S.Pd., Gr.</li>
					<li>Putra Panji Prasetiyo, S.Pd., Gr.</li>
				</ul>

				<h3 class="text-base-content text-lg font-semibold">Referensi</h3>
				<ul class="text-base-content/90 list-inside list-disc space-y-2">
					<li>
						<a
							href="https://kurikulum.kemendikdasmen.go.id/file/1755668120_manage_file.pdf"
							target="_blank"
							class="link link-primary">Panduan Belajar dan Asesmen revisi 2025</a
						>
					</li>
					<li>
						<a
							href="https://kurikulum.kemendikdasmen.go.id/file/1753779343_manage_file.pdf"
							target="_blank"
							class="link link-primary">Panduan Kokurikuler tahun 2025</a
						>
					</li>
					<li>
						<a
							href="https://drive.google.com/file/d/1XigY7sH6SkA0RCyn_8X85NGJoR4HmyC0/view"
							target="_blank"
							class="link link-primary">Capaian Pembelajaran</a
						>
					</li>
				</ul>
			</div>
		</aside>
	</section>

	<section class="rounded-box border-base-200/80 bg-base-100/95 border p-6 shadow-md sm:p-8">
		<div class="space-y-4">
			<h2 class="text-base-content text-2xl font-semibold">Special Thanks</h2>
			<p class="text-base-content/90">
				Terima kasih kepada semua pihak yang berkontribusi dalam pengembangan aplikasi ini.
			</p>

			<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				<article
					class="rounded-box border-base-200 dark:bg-base-200 flex h-full flex-col justify-between border p-4 shadow-md dark:shadow-none"
				>
					<div class="space-y-2">
						<span class="badge badge-primary badge-outline">UI &amp; UX</span>
						<h3 class="text-base-content text-lg font-semibold">Masukan Antarmuka</h3>
						<p class="text-base-content/70 text-sm">
							<span class="text-base-content font-semibold">Noffie Suryanti Mandasari, S.Pd.</span> memberikan
							ide dan saran pengembangan tampilan pengguna.
						</p>
					</div>
				</article>

				<article
					class="rounded-box border-base-200 dark:bg-base-200 flex h-full flex-col justify-between border p-4 shadow-md dark:shadow-none"
				>
					<div class="space-y-2">
						<span class="badge badge-secondary badge-outline">Asesmen</span>
						<h3 class="text-base-content text-lg font-semibold">Saran Alur Penilaian</h3>
						<ul class="text-base-content/70 list-inside list-disc space-y-1 text-sm">
							<li><span class="text-base-content font-semibold">Saipul Anam, S.Pd.</span></li>
							<li><span class="text-base-content font-semibold">Anistoga, S.Pd., Gr.</span></li>
							<li>
								<span class="text-base-content font-semibold">Fathonah Nilawidya, S.Pd.</span>
							</li>
							<li><span class="text-base-content font-semibold">Rudiansyah, S.Pd., Gr.</span></li>
						</ul>
					</div>
				</article>

				<article
					class="rounded-box border-base-200 dark:bg-base-200 flex h-full flex-col justify-between border p-4 shadow-md dark:shadow-none"
				>
					<div class="space-y-2">
						<span class="badge badge-accent badge-outline">Donasi</span>
						<h3 class="text-base-content text-lg font-semibold">Dukungan Komunitas</h3>
						<p class="text-base-content/70 text-sm">
							Terima kasih kepada seluruh donatur yang mendukung pengembangan melalui <a
								href="https://trakteer.id/raporkumer/"
								target="_blank"
								class="link link-primary">trakteer.id/raporkumer</a
							>.
						</p>
					</div>
				</article>
			</div>
		</div>
	</section>
</div>
