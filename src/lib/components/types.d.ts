interface ModalAction {
	label: string;
	icon?: IconName;
	class?: string;
	/** renders the action as an anchor (opened in a new tab) instead of a button */
	href?: string;
	action?: (params: { close: () => void }) => MaybePromise<void>;
}

type ModalBodyComponent = import('svelte').Component<any, any, string>;

interface ModalProps<BodyProps extends Record<string, unknown> = Record<string, unknown>> {
	title?: string;
	body: string | ModalBodyComponent;
	bodyProps?: BodyProps;
	dismissible?: boolean;
	/** wraps the body in a `prose` container (typographic spacing) */
	typography?: boolean;
	/** spread action buttons across the footer (left vs right) instead of right-aligning them */
	spreadActions?: boolean;
	onPositive?: ModalAction;
	onNeutral?: ModalAction;
	onNegative?: ModalAction;
	/** renders an additional action (e.g. link) before onPositive */
	onExtra?: ModalAction;
	onClose?: () => void;
}

interface Toast {
	id?: string;
	message: string;
	type?: 'info' | 'success' | 'warning' | 'error';
	/** if true, toast will not close automatically */
	persist?: boolean;
}
