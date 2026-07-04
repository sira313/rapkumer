<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import { hideModal, setLoading } from '$lib/components/global-modal.svelte';

	interface Props {
		formId: string;
		muridIdsPayload: string;
		catatan: string;
		targetCount: number;
		onCatatanChange?: (value: string) => void;
		onSuccess?: (params: { data?: Record<string, unknown> }) => void | Promise<void>;
		onAction?: (actions: { submit: () => void }) => void;
	}

	let {
		formId,
		muridIdsPayload,
		catatan,
		targetCount,
		onCatatanChange,
		onSuccess,
		onAction
	}: Props = $props();

	let catatanOverride = $state<string | null>(null);
	const catatanValue = $derived.by(() => catatanOverride ?? catatan);
	let previousCatatan = catatan;

	$effect(() => {
		if (catatan !== previousCatatan) {
			previousCatatan = catatan;
			catatanOverride = null;
			return;
		}
		if (catatanOverride != null && catatanOverride === catatan) {
			catatanOverride = null;
		}
	});

	function handleInput(event: Event) {
		const value = (event.currentTarget as HTMLTextAreaElement).value;
		catatanOverride = value;
		onCatatanChange?.(value);
	}

	async function handleSuccess({
		data
	}: {
		form: HTMLFormElement;
		data?: Record<string, unknown>;
	}) {
		await onSuccess?.({ data });
		hideModal();
	}

	$effect(() => {
		onAction?.({
			submit: () => (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit()
		});
	});
</script>

<div class="not-prose flex flex-col gap-4">
	<p class="text-base-content/70 text-sm">
		Terapkan catatan yang sama untuk {targetCount} murid pada halaman ini. Tindakan ini akan menimpa catatan
		sebelumnya.
	</p>

	<FormEnhance
		action="?/fillAll"
		id={formId}
		onsuccess={handleSuccess}
		submitStateChange={setLoading}
	>
		{#snippet children()}
			<input type="hidden" name="muridIds" value={muridIdsPayload} />
			<label class="flex flex-col gap-2">
				<span class="text-sm font-semibold">Catatan</span>
				<textarea
					class="textarea textarea-bordered bg-base-200 dark:bg-base-300 w-full dark:border-none"
					name="catatan"
					rows="5"
					value={catatanValue}
					oninput={handleInput}
					placeholder="Tuliskan catatan yang ingin diterapkan ke semua murid"
					spellcheck="false"></textarea>
				<small class="text-base-content/70 text-xs">
					Biarkan kosong untuk menghapus catatan seluruh murid pada halaman ini.
				</small>
			</label>
		{/snippet}
	</FormEnhance>
</div>
