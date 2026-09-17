<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let formEl = $state<HTMLFormElement>();
	let canvasEl = $state<HTMLCanvasElement>();
	let ctx: CanvasRenderingContext2D | null = null;
	let drawing = $state(false);
	let hasSignature = $state(false);
	let submitting = $state(false);
	let submitted = $state(false);

	let lastX = 0;
	let lastY = 0;

	const gated = $derived(Boolean(data.passkeySet) && !data.unlocked);

	$effect(() => {
		if (submitted || !canvasEl) return;
		ctx = canvasEl.getContext('2d');
		if (!ctx) return;
		resizeCanvas();
		const onResize = () => resizeCanvas();
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('resize', onResize);
		};
	});

	function resizeCanvas() {
		if (!canvasEl || !ctx) return;
		const tempCanvas = document.createElement('canvas');
		tempCanvas.width = canvasEl.width;
		tempCanvas.height = canvasEl.height;
		const tempCtx = tempCanvas.getContext('2d');
		if (tempCtx) tempCtx.drawImage(canvasEl, 0, 0);
		const rect = canvasEl.getBoundingClientRect();
		canvasEl.width = Math.max(1, Math.round(rect.width)) * 2;
		canvasEl.height = Math.max(1, Math.round(rect.height)) * 2;
		// Copy the previous content 1:1 (old and new bitmaps are both 2x CSS px).
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.drawImage(tempCanvas, 0, 0);
		ctx.restore();
		// Logical space = CSS pixels; strokes render at 2x physical resolution.
		ctx.setTransform(2, 0, 0, 2, 0, 0);
	}

	function getPos(e: MouseEvent | TouchEvent) {
		const rect = canvasEl!.getBoundingClientRect();
		if ('touches' in e) {
			const touch = e.touches[0];
			return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
		}
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	function startDraw(e: MouseEvent | TouchEvent) {
		if (!ctx) return;
		drawing = true;
		const pos = getPos(e);
		lastX = pos.x;
		lastY = pos.y;
		ctx.beginPath();
		ctx.moveTo(lastX, lastY);
	}

	function draw(e: MouseEvent | TouchEvent) {
		if (!drawing || !ctx) return;
		e.preventDefault();
		const pos = getPos(e);
		ctx.strokeStyle = '#000000';
		ctx.lineWidth = 2;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.lineTo(pos.x, pos.y);
		ctx.stroke();
		hasSignature = true;
	}

	function endDraw() {
		drawing = false;
	}

	function clearSignature() {
		if (!ctx || !canvasEl) return;
		ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
		hasSignature = false;
	}

	function getSignatureData(): string | null {
		if (!canvasEl || !hasSignature) return null;
		return canvasEl.toDataURL('image/png');
	}

	async function handleSubmit(e?: Event) {
		if (e) e.preventDefault();
		if (submitting) return;

		const formData = new FormData(formEl);
		const nama = String(formData.get('nama') || '').trim();
		const asalInstansi = String(formData.get('asalInstansi') || '').trim();
		const nip = String(formData.get('nip') || '').trim();
		const keperluan = String(formData.get('keperluan') || '').trim();
		const pesanKesan = String(formData.get('pesanKesan') || '').trim();

		if (!nama || !asalInstansi || !keperluan) {
			toast('Harap isi nama, asal/instansi, dan keperluan.', 'warning');
			return;
		}

		submitting = true;
		try {
			const res = await fetch('/api/buku-tamu', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					nama,
					asalInstansi,
					nip: nip || null,
					keperluan,
					pesanKesan: pesanKesan || null,
					tandaTangan: getSignatureData()
				})
			});

			const data = await res.json().catch(() => ({}));

			if (!res.ok) {
				toast(data?.message || 'Gagal menyimpan data', 'error');
				return;
			}

			submitted = true;
			formEl!.reset();
			clearSignature();
		} catch {
			toast('Terjadi kesalahan jaringan', 'error');
		} finally {
			submitting = false;
		}
	}

	function submitAnother() {
		submitted = false;
	}
</script>

<svelte:head>
	<title>Buku Tamu</title>
</svelte:head>

<div class="card bg-base-100 w-full sm:max-w-lg sm:shadow-xl rounded-box">
	<div class="card-body space-y-4 p-4 sm:p-6">
		<header class="mb-2 space-y-2 text-center">
			<h1 class="text-2xl font-bold">Buku Tamu</h1>
			<p class="text-base-content/70 text-sm">
				Silakan mengisi data diri Anda untuk keperluan kunjungan.
			</p>
		</header>

		{#if gated}
			<FormEnhance action="?/unlock">
				{#snippet children({ submitting, invalid })}
					<div class="space-y-4">
						<div class="alert alert-info">
							<Icon name="info" />
							<span
								>Halaman ini dilindungi passkey. Hubungi pihak sekolah untuk mendapatkan passkey.</span
							>
						</div>
						<div class="fieldset">
							<label class="fieldset-legend" for="passkey">Passkey</label>
							<input
								type="password"
								id="passkey"
								name="passkey"
								required
								minlength={4}
								maxlength={64}
								placeholder="Masukkan passkey"
								class="input input-bordered dark:bg-base-200 w-full dark:border-none"
							/>
						</div>
						<button class="btn btn-primary w-full" type="submit" disabled={submitting || invalid}>
							{#if submitting}
								<span class="loading loading-spinner loading-sm"></span>
							{/if}
							Masuk
						</button>
					</div>
				{/snippet}
			</FormEnhance>
		{:else if submitted}
			<div class="space-y-4 text-center">
				<div class="alert alert-success">
					<Icon name="success" />
					<span>Terima kasih! Data kunjungan Anda telah tersimpan.</span>
				</div>
				<button type="button" class="btn btn-primary shadow-none" onclick={submitAnother}>
					<Icon name="plus" />
					Tulis Lagi
				</button>
			</div>
		{:else}
			<form bind:this={formEl}>
				<div class="fieldset">
					<label class="fieldset-legend" for="nama">Nama <span class="text-error">*</span></label>
					<input
						type="text"
						id="nama"
						name="nama"
						required
						placeholder="Nama lengkap"
						class="input input-bordered dark:bg-base-200 w-full dark:border-none"
					/>
				</div>

				<div class="fieldset">
					<label class="fieldset-legend" for="asalInstansi"
						>Asal / Instansi <span class="text-error">*</span></label
					>
					<input
						type="text"
						id="asalInstansi"
						name="asalInstansi"
						required
						placeholder="Masukkan alamat atau asal instansi"
						class="input input-bordered dark:bg-base-200 w-full dark:border-none"
					/>
				</div>

				<div class="fieldset">
					<label class="fieldset-legend" for="nip">NIP (opsional)</label>
					<input
						type="text"
						id="nip"
						name="nip"
						placeholder="Masukkan NIP jika ada"
						class="input input-bordered dark:bg-base-200 w-full dark:border-none"
					/>
				</div>

				<div class="fieldset">
					<label class="fieldset-legend" for="keperluan"
						>Keperluan <span class="text-error">*</span></label
					>
					<textarea
						id="keperluan"
						name="keperluan"
						required
						rows="2"
						placeholder="Isi keperluan kunjungan"
						class="textarea textarea-bordered dark:bg-base-200 w-full dark:border-none"></textarea>
				</div>

				<div class="fieldset">
					<label class="fieldset-legend" for="pesanKesan">Pesan & Kesan (opsional)</label>
					<textarea
						id="pesanKesan"
						name="pesanKesan"
						rows="2"
						placeholder="Isi pesan atau kesan Anda"
						class="textarea textarea-bordered dark:bg-base-200 w-full dark:border-none"></textarea>
				</div>

				<div class="fieldset">
					<label class="fieldset-legend">
						Tanda Tangan
						{#if hasSignature}
							<button
								type="button"
								class="btn btn-soft btn-xs text-error ml-2"
								onclick={clearSignature}
							>
								Hapus
							</button>
						{/if}
					</label>
					<div class="border-base-300 rounded-md border overflow-hidden">
						<canvas
							bind:this={canvasEl}
							class="bg-white w-full cursor-crosshair touch-none"
							style="height: 160px;"
							onmousedown={startDraw}
							onmousemove={draw}
							onmouseup={endDraw}
							onmouseleave={endDraw}
							ontouchstart={startDraw}
							ontouchmove={draw}
							ontouchend={endDraw}
						></canvas>
					</div>
					<p class="fieldset-label">Tanda tangan di atas (opsional)</p>
				</div>

				<button
					class="btn btn-primary mt-4 w-full"
					type="button"
					disabled={submitting}
					onclick={handleSubmit}
				>
					{#if submitting}
						<span class="loading loading-spinner loading-sm"></span>
					{/if}
					Kirim
				</button>
			</form>
		{/if}
	</div>
</div>
