<script lang="ts" module>
	type ToastInstance = Toast & { id: string; _timer?: ReturnType<typeof setTimeout> };

	export const toasts = $state<ToastInstance[]>([]);

	let seed = 0;

	function nextId(requested?: string): string {
		if (requested) {
			const exists = toasts.some((item) => item.id === requested);
			if (!exists) return requested;
		}
		seed = (seed + 1) % Number.MAX_SAFE_INTEGER;
		return `toast-${Date.now()}-${seed.toString(36)}`;
	}

	export function toast(data: Toast | string, type?: Toast['type']) {
		const payload: Toast =
			typeof data === 'string' ? { message: data, type } : { ...data, type: data.type ?? type };

		const id = nextId(payload.id);
		const entry: ToastInstance = {
			...payload,
			id,
			type: payload.type ?? 'info'
		};

		toasts.push(entry);
		return id;
	}

	export function dismissToast(id: string) {
		const targetIndex = toasts.findIndex((item) => item.id === id);
		if (targetIndex > -1) {
			const item = toasts[targetIndex];
			if (item._timer) clearTimeout(item._timer);
			toasts.splice(targetIndex, 1);
		}
	}
</script>

<script lang="ts">
	import { flip } from 'svelte/animate';
	import Icon from './icon.svelte';

	const autoCloseAfter = 2; // seconds
	const typesMaps: Record<
		NonNullable<Toast['type']>,
		{
			alertClass: string;
			icon: IconName;
			iconClass: string;
		}
	> = {
		info: {
			alertClass: 'alert-info',
			icon: 'info',
			iconClass: 'text-info-content'
		},
		success: {
			alertClass: 'alert-success',
			icon: 'success',
			iconClass: 'text-success-content'
		},
		warning: {
			alertClass: 'alert-warning',
			icon: 'warning',
			iconClass: 'text-warning-content'
		},
		error: {
			alertClass: 'alert-error',
			icon: 'error',
			iconClass: 'text-error-content'
		}
	};

	function close(id: string) {
		dismissToast(id);
	}

	$effect(() => {
		for (const t of toasts) {
			if (t._timer || t.persist) continue;
			t._timer = setTimeout(() => close(t.id), autoCloseAfter * 1000);
		}
	});
</script>

<div class="toast toast-top toast-center z-50">
	{#each toasts as t (t.id)}
		{@const config = typesMaps[t.type || 'info']}
		<div
			animate:flip={{ duration: 200, delay: 80 }}
			class="alert relative {config.alertClass}"
			role="alert"
		>
			<span class="flex h-9 w-9 items-center justify-center {config.iconClass}">
				<Icon name={config.icon} class="h-5 w-5" />
			</span>
			<span class="flex-1 text-wrap">{@html t.message.replaceAll('\n', '<br />')}</span>
			<button
				class="btn btn-circle btn-ghost"
				type="button"
				title="Tutup"
				onclick={() => close(t.id)}
			>
				<Icon name="close" class="h-4 w-4" />
				<span class="sr-only">Tutup</span>
			</button>
		</div>
	{/each}
</div>
