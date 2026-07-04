<script lang="ts">
	import { enhance } from '$app/forms';
	import { flatten, populateForm } from '$lib/utils';
	import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
	import type { Snippet } from 'svelte';
	import type { HTMLFormAttributes } from 'svelte/elements';
	import { toast } from './toast.svelte';

	export interface Props {
		children: Snippet<[{ submitting: boolean; invalid: boolean }]>;
		action: string;
		id?: string;
		enctype?: HTMLFormAttributes['enctype'];
		init?: Record<string, unknown>;
		onsuccess?: (params: { form: HTMLFormElement; data?: Record<string, unknown> }) => void;
		submitStateChange?: (submitting: boolean) => void;
		showToast?: boolean;
	}

	let {
		children,
		action,
		id,
		enctype,
		init,
		onsuccess,
		submitStateChange,
		showToast = true
	}: Props = $props();

	let submitting = $state(false);
	let invalid = $state(true);
	let formEl: HTMLFormElement | null = null;

	type GenericActionResult = ActionResult<Record<string, unknown>, Record<string, unknown>>;

	// Narrowed shape for action results and parsed JSON responses we expect to
	// handle. Keep these local and conservative so we avoid using `any`.
	interface ActionResultLike {
		type?: 'success' | 'failure' | 'redirect' | 'error' | string;
		status?: number;
		data?: Record<string, unknown>;
		error?: { message?: string; debug?: string } | unknown;
	}

	interface SuccessData extends Record<string, unknown> {
		message?: string;
		logout?: boolean;
		loginPath?: string;
	}

	type SubmitOutcome = GenericActionResult | Response | Record<string, unknown> | undefined;

	function isActionResult(value: SubmitOutcome): value is GenericActionResult {
		return typeof value === 'object' && value !== null && 'type' in value;
	}

	async function extractSuccessData(result: SubmitOutcome): Promise<SuccessData | undefined> {
		try {
			if (!result) return undefined;
			if (result instanceof Response) {
				const contentType = result.headers.get('content-type') || '';
				if (contentType.includes('application/json')) {
					const clone = result.clone();
					return (await clone.json()) as SuccessData;
				}
				return undefined;
			}
			if (isActionResult(result) && 'data' in result) {
				return (result.data as SuccessData) || undefined;
			}
			// Some endpoints return a plain JSON object (not a Response nor an ActionResult)
			// (for example when the enhance shim already parsed JSON). Accept that shape
			// as success data as well.
			if (typeof result === 'object' && result !== null) {
				return result as Record<string, unknown>;
			}
		} catch (error) {
			console.warn('[form-enhance] gagal mengekstrak data sukses', error);
		}
		return undefined;
	}

	const enhancedSubmit: SubmitFunction = () => {
		submitting = true;
		return async (args: {
			result?: SubmitOutcome;
			update?: (() => Promise<void>) | undefined;
			form?: HTMLFormElement | undefined;
			formElement?: HTMLFormElement | undefined;
		}) => {
			// `result` may be an ActionResult (for server actions) or a Response
			// (for endpoint responses). Some environments may provide a plain
			// Response-like object without `type`, so handle both cases. Use a
			// local `raw` variable to avoid TypeScript narrowing issues.
			const raw = args.result as SubmitOutcome;
			const update = args.update;
			const actionResult = isActionResult(raw) ? (raw as unknown as ActionResultLike) : undefined;
			const isResponse = raw instanceof Response;
			const status = isResponse ? (raw as Response).status : actionResult?.status;
			const initialType = actionResult?.type;
			console.debug('[form-enhance] submit result', {
				action,
				initialType,
				raw,
				status
			});
			try {
				// Resolve the kind of result we have. Prefer `result.type` when
				// available (ActionResult). Otherwise, infer from HTTP status on
				// Response objects.
				// If the raw result is a plain object with a `message` it is likely a
				// parsed JSON response from the endpoint; treat that as success.
				const isPlainObject = typeof raw === 'object' && raw !== null && !isResponse;
				const resultType = actionResult
					? actionResult.type
					: isResponse
						? (raw as Response).ok
							? 'success'
							: 'error'
						: isPlainObject && 'message' in (raw as Record<string, unknown>)
							? 'success'
							: undefined;
				switch (resultType) {
					case 'success': {
						const successData = await extractSuccessData(raw);
						const successMessage = successData?.message ?? 'Sukses';
						if (showToast) {
							toast(successMessage, 'success');
						}
						if (update) await update();
						const callForm = args.form ?? args.formElement;
						if (callForm && onsuccess) {
							onsuccess({ form: callForm, data: successData });
						}
						// If the server indicates the user must re-login after this action,
						// show the toast (above) and then redirect to the login page. Keep a
						// short delay so the toast is visible before navigation.
						try {
							if (successData && successData.logout) {
								const loginPath = successData.loginPath;
								setTimeout(() => {
									try {
										window.location.href = loginPath ?? '/login';
									} catch (e) {
										console.warn('[form-enhance] gagal melakukan redirect ke halaman login', e);
									}
								}, 1400);
							}
						} catch (e) {
							console.warn('[form-enhance] gagal memproses logout redirect', e);
						}
						break;
					}
					case 'redirect': {
						if (update) await update();
						break;
					}
					case 'failure': {
						const failureData =
							actionResult && 'data' in actionResult
								? (actionResult.data as { fail?: string; message?: string } | undefined)
								: undefined;
						if (showToast) {
							toast(failureData?.fail || failureData?.message || 'Gagal', 'warning');
						}
						break;
					}
					case 'error': {
						const actionErrMsg =
							actionResult && typeof actionResult.error === 'object' && actionResult.error !== null
								? (actionResult.error as { message?: string }).message
								: undefined;
						const actionErrDebug =
							actionResult && typeof actionResult.error === 'object' && actionResult.error !== null
								? (actionResult.error as { debug?: string }).debug
								: undefined;
						let message = `Error (${status ?? '??'}): ${
							actionErrMsg ||
							(isResponse ? String((raw as Response).statusText) : JSON.stringify(raw))
						} \n\ndebug: "${actionErrDebug || ''}"`;
						if (showToast) {
							toast({
								message: message,
								type: 'error',
								persist: true
							});
						}
						console.error(message);
						break;
					}
					default: {
						// If we couldn't determine a type, still attempt an update so any
						// server-driven state changes are applied to the page.
						try {
							if (update) await update();
						} catch (e) {
							console.debug('[form-enhance] update() failed for unknown result type', e);
						}
						break;
					}
				}
			} catch (error) {
				console.error(error);
				toast(`Gagal mengirim formulir`, 'error');
			} finally {
				submitting = false;
				const localForm = args.form ?? args.formElement;
				invalid = !(localForm && (localForm as HTMLFormElement).checkValidity());
			}
		};
	};

	// action used to populate the form on mount
	function loader(form: HTMLFormElement) {
		if (init) {
			populateForm(form, flatten(init));
			invalid = !form.checkValidity();
		}
	}

	$effect(() => {
		submitStateChange?.(submitting);
	});

	// Ensure jenjangVariant hidden input gets populated from the selected option right before submit.
	function preSubmit() {
		try {
			const form = formEl;
			if (!form) return;
			const sel = form.querySelector<HTMLSelectElement>('select[name="jenjangPendidikan"]');
			if (!sel) return;
			const opt = sel.selectedOptions?.[0];
			const variant = opt?.dataset?.variant ?? '';
			const hidden = form.elements.namedItem('jenjangVariant') as HTMLInputElement | null;
			if (hidden) hidden.value = variant;
		} catch (err) {
			console.warn('[form-enhance] preSubmit failed to set jenjangVariant', err);
		}
	}
</script>

<form
	bind:this={formEl}
	{id}
	{action}
	method="POST"
	{enctype}
	use:enhance={enhancedSubmit}
	use:loader
	onsubmit={preSubmit}
	oninput={() => (invalid = !(formEl && formEl.checkValidity()))}
	onchange={() => (invalid = !(formEl && formEl.checkValidity()))}
>
	{@render children({ submitting, invalid })}
</form>
