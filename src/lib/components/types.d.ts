interface ModalAction {
	label: string;
	icon?: IconName;
	class?: string;
	action?: (params: { close: () => void }) => MaybePromise<void>;
}

type ModalBodyComponent<Props extends Record<string, unknown> = Record<string, unknown>> =
	import('svelte').Component<Props, Record<string, unknown>, string>;

interface ModalProps<BodyProps extends Record<string, unknown> = Record<string, unknown>> {
	title?: string;
	body: string | ModalBodyComponent<BodyProps>;
	bodyProps?: BodyProps;
	dismissible?: boolean;
	onPositive?: ModalAction;
	onNeutral?: ModalAction;
	onNegative?: ModalAction;
	onClose?: () => void;
}

interface Toast {
	id?: string;
	message: string;
	type?: 'info' | 'success' | 'warning' | 'error';
	/** if true, toast will not close automatically */
	persist?: boolean;
}
