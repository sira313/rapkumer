<script lang="ts">
	import Icon from '$lib/components/icon.svelte';

	let {
		pdfUrl = '',
		pdfTitle = '',
		open = $bindable(false),
		hasPrev = false,
		hasNext = false,
		loading = false,
		onPrev = () => {},
		onNext = () => {},
		onClose = () => {}
	}: {
		pdfUrl: string;
		pdfTitle: string;
		open: boolean;
		hasPrev?: boolean;
		hasNext?: boolean;
		loading?: boolean;
		onPrev?: () => void;
		onNext?: () => void;
		onClose?: () => void;
	} = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);

	$effect(() => {
		if (open && dialogEl) {
			dialogEl.showModal();
		}
	});

	function handleClose() {
		onClose();
	}
</script>

{#if open}
	<dialog bind:this={dialogEl} class="modal" onclose={handleClose}>
		<div class="modal-box relative flex h-dvh max-h-dvh w-screen max-w-screen flex-col rounded-none p-0">
			<div class="min-h-0 flex-1">
				<embed src={pdfUrl} type="application/pdf" class="h-full w-full" title={pdfTitle} />
			</div>
			<div class="absolute bottom-4 right-8 flex items-center gap-2">
				<div class="join [&>:first-child]:rounded-l-full [&>:last-child]:rounded-r-full">
					<button
						class="btn btn-primary btn-circle btn-sm shadow-none join-item"
						type="button"
						onclick={onPrev}
						title="Murid sebelumnya"
						aria-label="Murid sebelumnya"
						disabled={loading || !hasPrev}
					>
						<Icon name="left" />
					</button>
					<button
						class="btn btn-primary btn-circle btn-sm shadow-none join-item"
						type="button"
						onclick={onNext}
						title="Murid berikutnya"
						aria-label="Murid berikutnya"
						disabled={loading || !hasNext}
					>
						<Icon name="right" />
					</button>
				</div>
				<button
					class="btn btn-error btn-sm btn-circle shadow-none"
					type="button"
					aria-label="Tutup"
					onclick={handleClose}
				>
					<Icon name="close" />
				</button>
			</div>
		</div>
		<form method="dialog" class="modal-backdrop">
			<button type="submit" aria-label="Tutup">close</button>
		</form>
	</dialog>
{/if}
