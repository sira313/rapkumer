<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
</script>

<div class="flex flex-col gap-4">
	<section class="hero bg-base-100 shadow-md rounded-box min-h-48">
		<div class="hero-content text-center">
			<div class="max-w-xl">
				<h1 class="text-base-content text-3xl font-bold md:text-4xl">Lisensi</h1>
				<p class="text-base-content/80 mt-4">
					Perangkat lunak ini menggunakan lisensi khusus yang melindungi hak pengembang sekaligus
					memberikan kebebasan untuk penggunaan nonkomersial.
				</p>
			</div>
		</div>
	</section>

	<section class="grid gap-4 sm:grid-cols-3">
		<div class="bg-base-100 shadow-md rounded-box flex gap-3 p-4">
			<Icon name="check" class="text-success mt-0.5 h-5 w-5 shrink-0" />
			<div>
				<p class="font-semibold">Gratis &amp; Bebas</p>
				<p class="text-base-content/70 text-sm">
					Boleh digunakan, disalin, dan dimodifikasi untuk keperluan nonkomersial.
				</p>
			</div>
		</div>
		<div class="bg-base-100 shadow-md rounded-box flex gap-3 p-4">
			<Icon name="lock" class="text-error mt-0.5 h-5 w-5 shrink-0" />
			<div>
				<p class="font-semibold">Non-Komersial</p>
				<p class="text-base-content/70 text-sm">
					Dilarang menjual, menyewakan, atau memonetisasi perangkat lunak ini atau hasil
					modifikasinya.
				</p>
			</div>
		</div>
		<div class="bg-base-100 shadow-md rounded-box flex gap-3 p-4">
			<Icon name="info" class="text-info mt-0.5 h-5 w-5 shrink-0" />
			<div>
				<p class="font-semibold">Atribusi</p>
				<p class="text-base-content/70 text-sm">
					Cantumkan nama Rapkumer dan tautan repositori saat membagikan.
				</p>
			</div>
		</div>
	</section>

	<section class="card bg-base-100 rounded-box shadow-md">
		<div class="card-body gap-4">
			<h2 class="card-title">Hak Penggunaan</h2>
			<ul class="divide-base-300 bg-base-200 rounded-box divide-y">
				<li class="flex flex-col gap-1 p-4">
					<p class="font-semibold">Pribadi, pendidikan &amp; penelitian</p>
					<p class="text-base-content/70 text-sm">
						Perangkat lunak ini boleh digunakan untuk keperluan pribadi, pendidikan, pembelajaran,
						dan penelitian.
					</p>
				</li>
				<li class="flex flex-col gap-1 p-4">
					<p class="font-semibold">Pelajari &amp; modifikasi</p>
					<p class="text-base-content/70 text-sm">
						Boleh mempelajari cara kerja kode sumber dan memodifikasinya sesuai kebutuhan.
					</p>
				</li>
				<li class="flex flex-col gap-1 p-4">
					<p class="font-semibold">Kontribusi</p>
					<p class="text-base-content/70 text-sm">
						Boleh mengirimkan perbaikan bug, fitur baru, atau kontribusi lainnya ke repositori resmi
						Rapkumer.
					</p>
				</li>
				<li class="flex flex-col gap-1 p-4">
					<p class="font-semibold">Penyalinan &amp; distribusi</p>
					<p class="text-base-content/70 text-sm">
						Boleh menyalin dan mendistribusikan perangkat lunak ini (asli maupun dimodifikasi)
						dengan syarat lisensi ini tetap disertakan, copyright notice dipertahankan, dan
						identitas pengembang asli tidak dihilangkan.
					</p>
				</li>
			</ul>
		</div>
	</section>

	<section class="card bg-base-100 rounded-box shadow-md">
		<div class="card-body gap-4">
			<h2 class="card-title">Larangan Komersial</h2>
			<p class="text-base-content/80">
				Perangkat lunak ini <strong class="text-error">tidak boleh</strong> digunakan untuk tujuan komersial
				dalam bentuk apa pun:
			</p>
			<ul class="text-base-content/80 flex flex-col gap-2 text-sm">
				<li>Menjual perangkat lunak ini, versi modifikasinya, atau hasil turunannya.</li>
				<li>Menjual atau menyewakan lisensi penggunaan.</li>
				<li>Memberikan akses berbayar terhadap perangkat lunak ini.</li>
				<li>Memungut biaya untuk mengunduh perangkat lunak ini.</li>
				<li>
					Menawarkan layanan instalasi, konfigurasi, atau dukungan dengan menjadikan perangkat lunak
					ini sebagai produk utama yang diperjualbelikan.
				</li>
				<li>
					Menggunakan perangkat lunak ini sebagai bagian dari produk atau layanan komersial tanpa
					izin tertulis dari pemegang hak cipta.
				</li>
			</ul>
			<div role="alert" class="alert alert-warning alert-soft alert-sm">
				<Icon name="alert" class="h-4 w-4 shrink-0" />
				<span>
					Ingin menggunakan Rapkumer untuk keperluan komersial? Hubungi tim pengembang untuk
					memperoleh izin tertulis.
				</span>
			</div>
		</div>
	</section>

	<section class="grid gap-4 lg:grid-cols-2">
		<div class="card bg-base-100 rounded-box shadow-md">
			<div class="card-body gap-3">
				<h2 class="card-title">Atribusi</h2>
				<p class="text-base-content/80 text-sm">
					Jika mendistribusikan perangkat lunak ini atau versi yang telah dimodifikasi, wajib:
				</p>
				<ul class="list bg-base-200 rounded-box divide-base-300 divide-y">
					<li class="flex flex-col gap-1 p-4">
						<p class="font-semibold">Kredit pengembang</p>
						<p class="text-base-content/70 text-xs">
							Cantumkan nama Rapkumer sebagai pengembang asli.
						</p>
					</li>
					<li class="flex flex-col gap-1 p-4">
						<p class="font-semibold">Tautan repositori</p>
						<p class="text-base-content/70 text-xs">
							Sertakan tautan ke repositori resmi Rapkumer.
						</p>
					</li>
					<li class="flex flex-col gap-1 p-4">
						<p class="font-semibold">Sebutkan modifikasi</p>
						<p class="text-base-content/70 text-xs">
							Jelaskan bahwa perangkat lunak telah dimodifikasi jika ada perubahan.
						</p>
					</li>
				</ul>
			</div>
		</div>

		<div class="card bg-base-100 rounded-box shadow-md">
			<div class="card-body gap-3">
				<h2 class="card-title">Cakupan Lisensi</h2>
				<p class="text-base-content/80 text-sm">Lisensi ini berlaku untuk:</p>
				<ul class="list bg-base-200 rounded-box divide-base-300 divide-y">
					<li class="flex flex-col gap-1 p-4">
						<p class="font-semibold">Seluruh kode sumber</p>
						<p class="text-base-content/70 text-xs">Semua file kode dalam repositori ini.</p>
					</li>
					<li class="flex flex-col gap-1 p-4">
						<p class="font-semibold">Aset visual</p>
						<p class="text-base-content/70 text-xs font-mono">
							logo.png, logo.ico, favicon.ico, favicon.png, bipmap2.png
						</p>
					</li>
					<li class="flex flex-col gap-1 p-4">
						<p class="font-semibold">Ikon pihak ketiga</p>
						<p class="text-base-content/70 text-xs">
							<code>src/lib/icons/</code> berasal dari Feather Icons (lisensi MIT).
						</p>
					</li>
				</ul>
				<p class="text-base-content/60 text-xs">
					Aset lain di luar daftar di atas tetap mengikuti lisensi masing-masing.
				</p>
			</div>
		</div>
	</section>

	<section class="card bg-base-100 rounded-box shadow-md">
		<div class="card-body gap-4">
			<h2 class="card-title">Penafian</h2>
			<div role="alert" class="alert alert-warning alert-soft alert-sm">
				<Icon name="alert" class="h-4 w-4 shrink-0" />
				<span class="text-sm">
					Perangkat lunak ini disediakan <strong>"sebagaimana adanya"</strong> (AS IS), tanpa jaminan
					dalam bentuk apa pun, baik tersurat maupun tersirat. Pemegang hak cipta tidak bertanggung jawab
					atas kerusakan, kehilangan data, gangguan operasional, atau kerugian lainnya yang timbul akibat
					penggunaan perangkat lunak ini.
				</span>
			</div>
		</div>
	</section>
</div>
