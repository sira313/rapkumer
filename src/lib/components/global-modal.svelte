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
	}

	export function showModal<BodyProps extends Record<string, unknown>>(
		props: ModalProps<BodyProps>
	) {
		modalProps = props as ModalState;
		modalShown = true;
		isLoading = false;
		requestAnimationFrame(() => modal?.showModal());
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
		if (nextBodyProps === undefined || nextBodyProps === null) return;
		modalProps = {
			...modalProps,
			...(props as Partial<ModalState>),
			bodyProps: nextBodyProps
		};
	}

	export function hideModal() {
		if (!modal) return;
		modal.close();
		clearModal();
	}

	export function setLoading(state: boolean) {
		isLoading = state;
	}
</script>

<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
</script>

{#if modalShown}
	<dialog bind:this={modal} class="modal" oncancel={clearModal} onclose={clearModal}>
		<div class="modal-box sm:w-full sm:max-w-2xl">
			{#if modalProps.title}
				<h3 class="text-lg font-bold">{modalProps.title}</h3>
			{/if}

			<div class="w-full max-w-none py-4">
				{#if typeof modalProps.body === 'function'}
					<modalProps.body {...(modalProps.bodyProps ?? {})} />
				{:else if typeof modalProps.body === 'string'}
					{@html modalProps.body}
				{/if}
			</div>

			{#if modalProps.onPositive || modalProps.onNeutral || modalProps.onNegative}
				<div class="modal-action">
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

					{#if modalProps.onNeutral}
						<button
							class="btn {modalProps.onNeutral.class ?? ''} gap-2 shadow-none"
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
			{/if}
		</div>
		{#if modalProps.dismissible}
			<form method="dialog" class="modal-backdrop">
				<button>close</button>
			</form>
		{/if}
	</dialog>
{/if}
