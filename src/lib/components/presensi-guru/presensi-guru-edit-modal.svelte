<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { hideModal, updateModal } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { onMount } from 'svelte';

	interface Props {
		userId: number;
		nama: string;
		tanggal: string;
		tanggalJam?: string | null;
		initialStatus?: string | null;
		initialTandaTangan?: string | null;
		initialKeterangan?: string | null;
	}

	let {
		userId,
		nama,
		tanggal,
		tanggalJam = null,
		initialStatus = null,
		initialTandaTangan = null,
		initialKeterangan = null
	}: Props = $props();

	type Status = 'hadir' | 'izin' | 'sakit' | 'dinas_luar' | 'cuti';

	const STATUS_OPTIONS: Array<{ value: Status; label: string }> = [
		{ value: 'hadir', label: 'Hadir' },
		{ value: 'izin', label: 'Izin' },
		{ value: 'sakit', label: 'Sakit' },
		{ value: 'dinas_luar', label: 'Dinas Luar' },
		{ value: 'cuti', label: 'Cuti' }
	];

	const VALID_STATUS: Status[] = ['hadir', 'izin', 'sakit', 'dinas_luar', 'cuti'];

	/** Parse "Cuti 15-08-2026 s/d 20-08-2026" (stored keterangan) back into ISO dates. */
	function parseCutiRange(keterangan: string | null): { mulai: string; selesai: string } | null {
		if (!keterangan) return null;
		const m = /Cuti\s+(\d{2})-(\d{2})-(\d{4})\s+s\/d\s+(\d{2})-(\d{2})-(\d{4})/.exec(keterangan);
		if (!m) return null;
		return {
			mulai: `${m[3]}-${m[2]}-${m[1]}`,
			selesai: `${m[6]}-${m[5]}-${m[4]}`
		};
	}

	/** Drop the auto-generated "Cuti dd-mm-yyyy s/d dd-mm-yyyy — " prefix from stored text. */
	function stripCutiLabel(text: string): string {
		const m = /^Cuti\s+\d{2}-\d{2}-\d{4}\s+s\/d\s+\d{2}-\d{2}-\d{4}(\s+—\s+)?/.exec(text);
		return m ? text.slice(m[0].length) : text;
	}

	// svelte-ignore state_referenced_locally
	const initialCuti = parseCutiRange(initialKeterangan);

	// svelte-ignore state_referenced_locally
	let selectedStatus = $state<Status>(
		initialStatus && (VALID_STATUS as string[]).includes(initialStatus)
			? (initialStatus as Status)
			: 'hadir'
	);
	// svelte-ignore state_referenced_locally
	let keterangan = $state(stripCutiLabel(initialKeterangan ?? ''));
	// svelte-ignore state_referenced_locally
	let cutiMulai = $state(initialCuti?.mulai ?? tanggal);
	// svelte-ignore state_referenced_locally
	let cutiSelesai = $state(initialCuti?.selesai ?? tanggal);
	let redraw = $state(false);
	let submitting = $state(false);

	let canvasEl: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let drawing = $state(false);
	let hasSignature = $state(false);
	let lastX = 0;
	let lastY = 0;

	const CANVAS_W = 400;
	const CANVAS_H = 400;

	function initCanvas(el: HTMLCanvasElement) {
		canvasEl = el;
		const context = el.getContext('2d');
		if (!context) return;
		ctx = context;
		return {
			destroy() {
				ctx = null;
			}
		};
	}

	onMount(() => {
		updateModal({
			onPositive: { label: 'Simpan', class: 'btn-primary', action: () => void submit() },
			onNegative: undefined,
			onNeutral: { label: 'Batal', action: () => hideModal() },
			spreadActions: true
		});
	});

	function getPos(e: MouseEvent | TouchEvent) {
		const rect = canvasEl.getBoundingClientRect();
		const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
		const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
		return {
			x: ((clientX - rect.left) / rect.width) * CANVAS_W,
			y: ((clientY - rect.top) / rect.height) * CANVAS_H
		};
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
		ctx.lineWidth = 18;
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
		if (!ctx) return;
		ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
		hasSignature = false;
	}

	function getSignatureData(): string | null {
		if (!canvasEl || !hasSignature) return null;
		return canvasEl.toDataURL('image/png');
	}

	const showCanvas = $derived(selectedStatus === 'hadir' && (redraw || !initialTandaTangan));

	const tanggalLabel = $derived.by(() => {
		const d = new Date(`${tanggal}T00:00:00`);
		return d.toLocaleDateString('id-ID', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	});

	async function submit() {
		if (submitting) return;
		if (selectedStatus === 'hadir' && !hasSignature && !initialTandaTangan) {
			toast('Silakan buat paraf terlebih dahulu.', 'warning');
			return;
		}
		if (selectedStatus === 'cuti') {
			if (!cutiMulai || !cutiSelesai) {
				toast('Tanggal mulai dan selesai cuti wajib diisi.', 'warning');
				return;
			}
			if (cutiSelesai < cutiMulai) {
				toast('Tanggal selesai cuti tidak boleh sebelum tanggal mulai.', 'warning');
				return;
			}
		}
		submitting = true;
		try {
			const res = await fetch('/api/presensi-guru/admin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId,
					tanggal,
					status: selectedStatus,
					tandaTangan: selectedStatus === 'hadir' && showCanvas ? getSignatureData() : null,
					keterangan: keterangan.trim() || null,
					tanggalJam,
					cutiMulai: selectedStatus === 'cuti' ? cutiMulai : null,
					cutiSelesai: selectedStatus === 'cuti' ? cutiSelesai : null,
					cutiMulaiAsli: selectedStatus === 'cuti' ? (initialCuti?.mulai ?? null) : null,
					cutiSelesaiAsli: selectedStatus === 'cuti' ? (initialCuti?.selesai ?? null) : null
				})
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error((data as { message?: string }).message ?? `Error ${res.status}`);
			}
			hideModal();
			await invalidate('app:presensi-guru');
			toast('Presensi berhasil disimpan.', 'success');
		} catch (e) {
			toast(e instanceof Error ? e.message : 'Gagal menyimpan presensi', 'error');
		} finally {
			submitting = false;
		}
	}
</script>

<div class="not-prose flex flex-col gap-4">
	{#if tanggalJam}
		<div class="alert alert-soft alert-warning flex items-center gap-2">
			<Icon name="alert" class="h-5 w-5 shrink-0" />
			<span class="text-sm"
				>Mode simulasi: waktu dicatat mengikuti <strong>{tanggalJam}</strong></span
			>
		</div>
	{/if}

	<div class="space-y-1">
		<p class="text-sm"><strong>Nama:</strong> {nama}</p>
		<p class="text-sm"><strong>Tanggal:</strong> {tanggalLabel}</p>
	</div>

	<label class="flex flex-col gap-1">
		<span class="text-sm font-semibold">Status Kehadiran</span>
		<select
			class="select bg-base-200 w-full dark:border-none"
			bind:value={selectedStatus}
			disabled={submitting}
		>
			{#each STATUS_OPTIONS as opt (opt.value)}
				<option value={opt.value}>{opt.label}</option>
			{/each}
		</select>
	</label>

	{#if selectedStatus === 'hadir'}
		{#if !showCanvas}
			<div class="space-y-2">
				<span class="text-sm font-semibold">Paraf tersimpan</span>
				<img src={initialTandaTangan ?? ''} alt="Paraf" class="max-h-24 rounded border" />
				<button
					type="button"
					class="btn btn-soft btn-sm shadow-none"
					onclick={() => (redraw = true)}
					disabled={submitting}
				>
					<Icon name="pen" />
					Ganti Paraf
				</button>
			</div>
		{:else}
			<div class="space-y-2">
				<span class="text-sm font-semibold">Paraf</span>
				<div class="border-base-300 overflow-hidden rounded-md border bg-base-300">
					<canvas
						use:initCanvas
						width={CANVAS_W}
						height={CANVAS_H}
						class="bg-white mx-auto w-full max-w-52 cursor-crosshair touch-none"
						style="aspect-ratio: {CANVAS_W}/{CANVAS_H}; min-height: 180px;"
						onmousedown={startDraw}
						onmousemove={draw}
						onmouseup={endDraw}
						onmouseleave={endDraw}
						ontouchstart={startDraw}
						ontouchmove={draw}
						ontouchend={endDraw}
					></canvas>
				</div>
				<div class="flex items-center justify-between gap-2">
					<p class="text-base-content/50 text-xs">Hanya paraf, bukan tanda tangan.</p>
					<div class="flex items-center gap-1">
						{#if initialTandaTangan && redraw}
							<button
								type="button"
								class="btn btn-soft btn-sm shadow-none"
								onclick={() => {
									clearSignature();
									redraw = false;
								}}
								disabled={submitting}
							>
								Batal
							</button>
						{/if}
						{#if hasSignature}
							<button
								type="button"
								class="btn btn-soft btn-error btn-sm shadow-none"
								onclick={clearSignature}
								disabled={submitting}
							>
								<Icon name="del" />
								Hapus
							</button>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	{/if}

	{#if selectedStatus === 'cuti'}
		<div class="border-base-300 space-y-2 rounded-md border p-3">
			<span class="text-sm font-semibold">Rentang Cuti</span>
			<div class="grid grid-cols-2 gap-2">
				<label class="flex flex-col gap-1">
					<span class="text-xs font-semibold">Tanggal Mulai</span>
					<input
						type="date"
						class="input bg-base-200 w-full dark:border-none"
						bind:value={cutiMulai}
						disabled={submitting}
					/>
				</label>
				<label class="flex flex-col gap-1">
					<span class="text-xs font-semibold">Tanggal Selesai</span>
					<input
						type="date"
						class="input bg-base-200 w-full dark:border-none"
						bind:value={cutiSelesai}
						disabled={submitting}
					/>
				</label>
			</div>
			<p class="text-base-content/50 text-xs">
				Semua tanggal dalam rentang ini akan tercatat sebagai Cuti (Ct).
			</p>
		</div>
	{/if}

	<label class="flex flex-col gap-1">
		<span class="text-sm font-semibold"
			>Keterangan <span class="text-base-content/50 font-normal">(opsional)</span></span
		>
		<textarea
			class="textarea bg-base-200 w-full dark:border-none"
			rows="2"
			bind:value={keterangan}
			placeholder="Catatan tambahan..."
			disabled={submitting}></textarea>
	</label>
</div>
