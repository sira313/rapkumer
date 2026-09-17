<script lang="ts" module>
	let modal = $state<HTMLDialogElement | null>(null);
	type ModalState = ModalProps<Record<string, unknown>>;
	let modalProps = $state<ModalState>({ body: '' } as ModalState);
	let modalShown = $state(false);
	let isLoading = $state(false);

	function clearModal() {
		const handler = modalProps?.onClose;
		modalProps = { body: '' } as ModalState;
		modalShown = false;
		isLoading = false;
		handler?.();
		// A drag may have left the class on a dialog that no longer holds the
		// modal; ensure a fresh show never inherits a hidden (transparent) box.
		modal?.classList.remove('modal-dragging');
		modal?.style.removeProperty('pointer-events');
		modal?.style.removeProperty('opacity');
		const backdrop = modal?.querySelector('.modal-backdrop');
		if (backdrop instanceof HTMLElement) backdrop.style.removeProperty('pointer-events');
	}

	export function showModal<BodyProps extends Record<string, unknown>>(
		props: ModalProps<BodyProps>
	) {
		modalProps = props as ModalState;
		modalShown = true;
		isLoading = false;
		requestAnimationFrame(() => {
			if (modal && !modal.open) {
				modal.showModal();
			}
		});
	}

	export function updateModal<BodyProps extends Record<string, unknown>>(
		props: Partial<ModalProps<BodyProps>>
	) {
		if (!props) return;
		const nextBodyProps = props.bodyProps
			? {
					...(modalProps.bodyProps ?? {}),
					...((props.bodyProps as Record<string, unknown>) ?? {})
				}
			: modalProps.bodyProps;
		modalProps = {
			...modalProps,
			...(props as Partial<ModalState>),
			bodyProps: nextBodyProps ?? {}
		};
	}

	export function hideModal() {
		if (!modal) return;
		modal.close();
		clearModal();
	}

	/** While set, the open dialog stops hit-testing and fades out but stays in
	 * the DOM, so an in-progress touch/mouse drag on its content is never
	 * cancelled (removing the touched element would fire `touchcancel`). */
	export function setModalDragging(state: boolean) {
		if (!modal) return;
		modal.classList.toggle('modal-dragging', state);
		// Modal-mode dialogs also expose a ::backdrop that hit-tests (dismiss
		// is a <button> in it). While dragging, drop the backdrop's background
		// and make it (and the box) click-through so native mouse drops can
		// reach the page behind a modal left in the DOM.
		const backdrop = modal.querySelector('.modal-backdrop') as HTMLElement | null;
		if (backdrop) backdrop.style.pointerEvents = state ? 'none' : '';
		modal.style.pointerEvents = state ? 'none' : '';
		modal.style.opacity = state ? '0' : '';
	}

	/** Closes the modal only if its current body is still `body` (so a modal
	 * opened by the drop handler is not clobbered by the closing of the drag
	 * source's own modal). */
	export function hideModalIf(body: unknown) {
		if (modalProps.body !== body) return;
		hideModal();
	}

	export function setLoading(state: boolean) {
		isLoading = state;
	}
</script>

<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- onExtra is an external link opened in a new tab */
	import Icon from '$lib/components/icon.svelte';
</script>

{#if modalShown}
	<dialog bind:this={modal} class="modal" oncancel={clearModal} onclose={clearModal}>
		<div class="modal-box flex max-h-[85vh] flex-col sm:w-full sm:max-w-2xl">
			{#if modalProps.title}
				<h3 class="shrink-0 text-lg font-bold">{modalProps.title}</h3>
			{/if}

			<div
				class="min-h-0 w-full max-w-none flex-1 overflow-y-auto px-1 py-4 {modalProps.typography
					? 'prose'
					: ''}"
			>
				{#if typeof modalProps.body === 'function'}
					<modalProps.body {...modalProps.bodyProps ?? {}} />
				{:else if typeof modalProps.body === 'string'}
					{@html modalProps.body}
				{/if}
			</div>

			{#if modalProps.onPositive || modalProps.onNeutral || modalProps.onNegative || modalProps.onExtra}
				<div class="modal-action shrink-0 {modalProps.spreadActions ? 'justify-between' : ''}">
					{#if modalProps.spreadActions && modalProps.onNeutral}
						<button
							class="btn {modalProps.onNeutral.class ?? 'btn-soft'} gap-2 shadow-none"
							type="button"
							onclick={() => {
								if (modalProps?.onNeutral?.action) {
									modalProps.onNeutral.action({ close: hideModal });
								} else {
									hideModal();
								}
							}}
						>
							{#if modalProps.onNeutral.icon}
								<Icon name={modalProps.onNeutral.icon} />
							{/if}
							{modalProps.onNeutral.label}
						</button>
					{/if}

					<div class="flex flex-wrap justify-end gap-2">
						{#if modalProps.onNegative}
							<button
								class="btn {modalProps.onNegative.class ?? 'btn-soft'} gap-2 shadow-none"
								type="button"
								onclick={() => {
									if (modalProps?.onNegative?.action) {
										modalProps.onNegative.action({ close: hideModal });
									} else {
										hideModal();
									}
								}}
							>
								{#if modalProps.onNegative.icon}
									<Icon name={modalProps.onNegative.icon} />
								{/if}
								{modalProps.onNegative.label}
							</button>
						{/if}

						{#if !modalProps.spreadActions && modalProps.onNeutral}
							<button
								class="btn {modalProps.onNeutral.class ?? 'btn-soft'} gap-2 shadow-none"
								type="button"
								onclick={() => {
									if (modalProps?.onNeutral?.action) {
										modalProps.onNeutral.action({ close: hideModal });
									} else {
										hideModal();
									}
								}}
							>
								{#if modalProps.onNeutral.icon}
									<Icon name={modalProps.onNeutral.icon} />
								{/if}
								{modalProps.onNeutral.label}
							</button>
						{/if}

						{#if modalProps.onExtra}
							<a
								class="btn {modalProps.onExtra.class ?? 'btn-soft'} gap-2 shadow-none"
								href={modalProps.onExtra.href}
								target="_blank"
								rel="noopener"
							>
								{#if modalProps.onExtra.icon}
									<Icon name={modalProps.onExtra.icon} />
								{/if}
								{modalProps.onExtra.label}
							</a>
						{/if}

						{#if modalProps.onPositive}
							<button
								class="btn {modalProps.onPositive.class ?? 'btn-primary'} gap-2 shadow-none"
								type="button"
								disabled={isLoading}
								onclick={() => {
									if (modalProps?.onPositive?.action) {
										const actionFn = modalProps.onPositive.action;
										const closeFn = hideModal;
										setLoading(true);
										try {
											const result = actionFn({ close: closeFn });
											Promise.resolve(result)
												.catch(() => {})
												.finally(() => {
													if (modalShown) setLoading(false);
												});
										} catch {
											setLoading(false);
										}
									} else {
										hideModal();
									}
								}}
							>
								{#if isLoading}
									<span class="loading loading-spinner loading-sm"></span>
								{:else if modalProps.onPositive.icon}
									<Icon name={modalProps.onPositive.icon} />
								{/if}
								{modalProps.onPositive.label}
							</button>
						{/if}
					</div>
				</div>
			{/if}
		</div>
		{#if modalProps.dismissible}
			<form method="dialog" class="modal-backdrop">
				<button>close</button>
			</form>
		{/if}
	</dialog>
{/if}

<style>
	:global(.modal .prose p) {
		margin-top: 0.6em;
		margin-bottom: 0.6em;
	}
	:global(.modal .prose pre) {
		margin-top: 0.5em;
		margin-bottom: 0.5em;
	}
	:global(dialog.modal-dragging) {
		background: transparent !important;
	}
	:global(dialog.modal-dragging .modal-box),
	:global(dialog.modal-dragging .modal-backdrop) {
		opacity: 0;
	}
</style>
