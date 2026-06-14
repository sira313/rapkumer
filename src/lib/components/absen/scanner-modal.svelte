<script lang="ts">
	import { onMount } from 'svelte';
	import jsqr from 'jsqr';
	import { toast } from '$lib/components/toast.svelte';
	import { hideModal } from '$lib/components/global-modal.svelte';

	let { onscan }: { onscan?: () => void } = $props();

	let videoEl: HTMLVideoElement;
	let canvasEl: HTMLCanvasElement;
	let stream: MediaStream | null = null;

	let status = $state('Mengakses kamera...');
	let processing = $state(false);
	let isActive = $state(true);
	let lastResult: string | null = null;

	onMount(() => {
		startCamera();
		return () => {
			isActive = false;
			stopCamera();
		};
	});

	async function startCamera() {
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
			});
			videoEl.srcObject = stream;
			await videoEl.play();
			status = 'Arahkan QR code ke kamera';
			scanLoop();
		} catch {
			status = 'Gagal mengakses kamera. Periksa izin kamera.';
		}
	}

	function stopCamera() {
		if (stream) {
			stream.getTracks().forEach((t) => t.stop());
			stream = null;
		}
	}

	function scanLoop() {
		if (!isActive) return;
		if (!videoEl || !canvasEl || videoEl.readyState < 2) {
			requestAnimationFrame(scanLoop);
			return;
		}

		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;

		canvasEl.width = videoEl.videoWidth;
		canvasEl.height = videoEl.videoHeight;
		ctx.drawImage(videoEl, 0, 0);

		const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
		const code = jsqr(imageData.data, imageData.width, imageData.height);

		if (code && !processing && code.data !== lastResult) {
			lastResult = code.data;
			handleQR(code.data);
		}

		requestAnimationFrame(scanLoop);
	}

	async function handleQR(data: string) {
		processing = true;
		status = 'Memproses...';
		try {
			const res = await fetch('/api/absen', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ qrData: data })
			});
			const result = await res.json();
			if (res.ok) {
				toast({ message: result.message, type: 'success' });
				onscan?.();
			} else {
				toast({ message: result.error, type: 'warning' });
			}
		} catch {
			toast({ message: 'Gagal terhubung ke server.', type: 'error' });
		}
		status = 'Arahkan QR code ke kamera';
		processing = false;
	}
</script>

<div class="flex flex-col items-center gap-4">
	<div class="relative w-full max-w-md overflow-hidden rounded-lg bg-black">
		<video bind:this={videoEl} class="w-full" autoplay playsinline muted></video>
		<canvas bind:this={canvasEl} class="hidden"></canvas>

		{#if status !== 'Arahkan QR code ke kamera'}
			<div class="absolute inset-0 flex items-center justify-center bg-black/60">
				<div class="text-center text-white">
					{#if processing}
						<span class="loading loading-spinner loading-lg"></span>
					{/if}
					<p class="mt-2 text-sm">{status}</p>
				</div>
			</div>
		{/if}
	</div>

	<p class="text-base-content/70 text-center text-xs">{status}</p>

	<button type="button" class="btn btn-soft shadow-none" onclick={hideModal}> Tutup </button>
</div>
