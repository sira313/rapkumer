<script lang="ts">
	const summary = [
		{
			title: 'Gratis & Bebas',
			description:
				'Perangkat lunak ini boleh digunakan, disalin, dan dimodifikasi secara gratis untuk keperluan nonkomersial.'
		},
		{
			title: 'NonKomersial',
			description:
				'Dilarang menjual, menyewakan, atau memonetisasi perangkat lunak ini maupun hasil modifikasinya dalam bentuk apa pun.'
		},
		{
			title: 'Atribusi',
			description:
				'Cantumkan nama Raporkumer dan tautan repositori saat membagikan, serta sebutkan jika ada perubahan.'
		}
	];
</script>

<div class="flex w-full flex-col gap-4">
	<section class="rounded-box border-base-200/80 bg-base-100/95 border p-8 shadow-md sm:p-10">
		<div class="space-y-3">
			<span class="badge badge-outline badge-lg bg-base-100/70 text-primary shadow">Lisensi</span>
			<h1 class="text-base-content text-3xl font-bold md:text-4xl">
				Ketentuan Penggunaan Raporkumer
			</h1>
			<p class="text-base-content/80 text-base md:text-lg">
				Repositori ini menggunakan lisensi khas (custom license) yang melindungi hak pengembang
				sekaligus memberikan kebebasan maksimal untuk penggunaan nonkomersial. Dengan menggunakan
				perangkat lunak ini, Anda menyetujui ketentuan berikut.
			</p>
		</div>
	</section>

	<section class="grid gap-4 sm:grid-cols-3">
		{#each summary as item, index (index)}
			<article class="rounded-box border-base-200/80 bg-base-100/95 border p-6 shadow-md">
				<h2 class="text-base-content text-xl font-semibold">{item.title}</h2>
				<p class="text-base-content/70 text-sm leading-relaxed">{item.description}</p>
			</article>
		{/each}
	</section>

	<section class="rounded-box border-base-200/80 bg-base-100/95 border p-8 shadow-md sm:p-10">
		<div class="space-y-4">
			<h2 class="text-base-content text-2xl font-semibold">Hak dan Batasan Utama</h2>
			<ul class="text-base-content/80 list-inside list-disc space-y-2 text-base">
				<li>
					<span class="text-base-content font-medium">Gunakan & salin:</span> bebas menggunakan dan mendistribusikan
					perangkat lunak ini di media apa pun untuk keperluan nonkomersial.
				</li>
				<li>
					<span class="text-base-content font-medium">Modifikasi:</span> bebas memodifikasi untuk kebutuhan
					pribadi atau kontribusi ke repositori asli.
				</li>
				<li>
					<span class="text-base-content font-medium">Atribusi:</span> sertakan nama Raporkumer dan tautan
					repositori saat membagikan, serta sebutkan jika ada perubahan.
				</li>
				<li>
					<span class="text-base-content font-medium">Larangan komersial:</span> dilarang menjual, menyewakan,
					atau memonetisasi perangkat lunak ini maupun hasil modifikasinya.
				</li>
			</ul>
			<p class="text-base-content/80 text-sm">
				Lisensi ini tidak menggantikan hukum lain yang mungkin berlaku, seperti hak potret, privasi,
				atau hak moral. Pastikan Anda mematuhi peraturan setempat saat menggunakan materi ini.
			</p>
			<p class="text-base-content/80 text-sm">
				Teks lisensi lengkap tersedia di file <code>LICENSE</code> pada repositori ini.
			</p>
		</div>
	</section>

	<section class="rounded-box border-base-200/80 bg-base-100/95 border p-8 shadow-md sm:p-10">
		<div class="space-y-4">
			<h2 class="text-base-content text-2xl font-semibold">Cakupan Lisensi</h2>
			<p class="text-base-content/80 text-sm leading-relaxed">
				Lisensi ini mencakup seluruh kode sumber repositori beserta aset-aset berikut:
			</p>
			<ul class="text-base-content/80 list-inside list-disc space-y-2">
				<li>Seluruh kode sumber dalam repositori</li>
				<li><code>static/logo.png</code></li>
				<li><code>static/logo.ico</code></li>
				<li><code>static/favicon.ico</code></li>
				<li><code>static/favicon.png</code></li>
				<li><code>static/bipmap2.png</code></li>
			</ul>
			<p class="text-base-content/80 text-sm leading-relaxed">
				Aset lain di luar daftar di atas (termasuk aset lain di folder <code>static/</code>) tetap
				berada di bawah lisensi aslinya masing-masing. Lihat file <code>LICENSE</code> atau dokumentasi
				terkait untuk informasi lebih lanjut.
			</p>
		</div>
	</section>

	<section class="rounded-box border-base-200/80 bg-base-100/95 border p-6 shadow-md">
		<h2 class="text-base-content text-xl font-semibold">Sumber & Kredit Ikon</h2>
		<p class="text-base-content/80 text-sm leading-relaxed">
			Ikon yang digunakan dalam folder <code>src/lib/icons</code> berasal dari
			<strong>Feather</strong>. Feather adalah proyek ikon open-source yang tersedia di
			<a href="https://github.com/feathericons/feather" target="_blank" rel="noreferrer"
				>https://github.com/feathericons/feather</a
			>
			dan dirilis di bawah lisensi MIT. Penggunaan ikon harus mematuhi syarat lisensi MIT. Kredit disarankan
			saat menggunakan ikon di luar konteks teknis internal.
		</p>
	</section>

	<section class="rounded-box border-base-200/80 bg-base-100/95 border p-6 shadow-md">
		<h2 class="text-base-content text-xl font-semibold">Pertanyaan Lebih Lanjut</h2>
		<p class="text-base-content/80 text-sm leading-relaxed">
			Untuk permintaan penggunaan di luar cakupan lisensi ini, hubungi tim pengembang melalui kanal
			yang disediakan pada halaman Tentang. Kami dengan senang hati membantu menilai kebutuhan Anda.
		</p>
	</section>
</div>
