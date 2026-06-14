<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import type { DimensiProfilLulusanKey } from '$lib/statics';
	import type { KokurikulerRow } from './types';

	type DimensionOption = {
		key: DimensiProfilLulusanKey;
		label: string;
	};

	let {
		open,
		title,
		action,
		kelasId,
		tableReady,
		canManage,
		isEditMode,
		modalItem,
		dimensionOptions,
		selectedDimensions,
		onToggleDimension,
		tujuanInput,
		onTujuanChange,
		onClose,
		onSuccess
	} = $props<{
		open: boolean;
		title: string;
		action: string;
		kelasId: number | null;
		tableReady: boolean;
		canManage: boolean;
		isEditMode: boolean;
		modalItem: (KokurikulerRow & { dimensi: DimensiProfilLulusanKey[] }) | null;
		dimensionOptions: DimensionOption[];
		selectedDimensions: DimensiProfilLulusanKey[];
		onToggleDimension: (dimension: DimensiProfilLulusanKey, checked: boolean) => void;
		tujuanInput: string;
		onTujuanChange: (value: string) => void;
		onClose: () => void;
		onSuccess: (payload: { form: HTMLFormElement }) => void;
	}>();

	let submitting = $state(false);
</script>

{#if open}
	<div
		class="modal modal-open"
		tabindex="-1"
		role="dialog"
		aria-modal="true"
		onkeydown={(event) => {
			if (event.key === 'Escape') onClose();
		}}
	>
		<dialog class="modal-box relative z-10 max-w-2xl" open aria-modal="true">
			<h3 class="mb-2 text-lg font-bold">{title}</h3>
			<p class="font-semibold">Pilih Dimensi Profil Lulusan</p>

			<FormEnhance
				id="form-kokurikuler"
				{action}
				onsuccess={onSuccess}
				submitStateChange={(v) => (submitting = v)}
			>
				{#snippet children()}
					<input name="kelasId" value={kelasId ?? ''} hidden />
					{#if isEditMode && modalItem}
						<input name="id" value={modalItem.id} hidden />
					{/if}

					<div class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
						{#each dimensionOptions as dimensi (dimensi.key)}
							<label class="flex cursor-pointer flex-row gap-2">
								<input
									type="checkbox"
									class="checkbox"
									value={dimensi.key}
									name="dimensi"
									checked={selectedDimensions.includes(dimensi.key)}
									onchange={(event) => onToggleDimension(dimensi.key, event.currentTarget.checked)}
									aria-label={dimensi.label}
								/>
								<div class="flex flex-col">
									<span>{dimensi.label}</span>
								</div>
							</label>
						{/each}
					</div>

					<p class="mt-4 font-semibold">Kegiatan Kokurikuler</p>
					<textarea
						class="textarea bg-base-200 dark:bg-base-300 mt-2 h-28 w-full dark:border-none"
						placeholder="Ketik kegiatan atau tema kegiatan kokurikuler"
						name="kokurikuler"
						value={tujuanInput}
						oninput={(event) => onTujuanChange((event.currentTarget as HTMLTextAreaElement).value)}
						required
						disabled={!canManage}
					></textarea>
				{/snippet}
			</FormEnhance>

			<div class="modal-action mt-6 flex gap-2">
				<button class="btn btn-soft shadow-none" type="button" onclick={onClose}>
					<Icon name="close" />
					Batal
				</button>
				<button
					class="btn btn-primary shadow-none"
					type="submit"
					form="form-kokurikuler"
					disabled={submitting ||
						!selectedDimensions.length ||
						!kelasId ||
						!tableReady ||
						!tujuanInput.trim()}
				>
					{#if submitting}
						<div class="loading loading-spinner"></div>
					{:else}
						<Icon name="save" />
					{/if}
					{isEditMode ? 'Simpan Perubahan' : 'Simpan'}
				</button>
			</div>
		</dialog>
		<form method="dialog" class="modal-backdrop">
			<button
				type="submit"
				onclick={(event) => {
					event.preventDefault();
					onClose();
				}}
			>
				tutup
			</button>
		</form>
	</div>
{/if}
