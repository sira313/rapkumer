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
		kodeInput,
		onKodeChange,
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
		kodeInput: string;
		onKodeChange: (value: string) => void;
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
		<div class="modal-box flex max-h-[85vh] flex-col p-4 sm:max-w-2xl">
			<h3 class="shrink-0 text-lg font-bold">{title}</h3>

			<div class="min-h-0 flex-1 overflow-y-auto px-1 py-4">
				<FormEnhance
					id="form-kokurikuler"
					class="space-y-4"
					{action}
					onsuccess={onSuccess}
					submitStateChange={(v) => (submitting = v)}
				>
					<input name="kelasId" value={kelasId ?? ''} hidden />
					{#if isEditMode && modalItem}
						<input name="id" value={modalItem.id} hidden />
					{/if}

					<div class="space-y-2">
						<p class="font-semibold">Pilih Dimensi Profil Lulusan</p>
						<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
							{#each dimensionOptions as dimensi (dimensi.key)}
								<label class="flex cursor-pointer flex-row gap-2">
									<input
										type="checkbox"
										class="checkbox"
										value={dimensi.key}
										name="dimensi"
										checked={selectedDimensions.includes(dimensi.key)}
										onchange={(event) =>
											onToggleDimension(dimensi.key, event.currentTarget.checked)}
										aria-label={dimensi.label}
									/>
									<div class="flex flex-col">
										<span>{dimensi.label}</span>
									</div>
								</label>
							{/each}
						</div>
					</div>

					<div class="space-y-2">
						<p class="font-semibold">Kode</p>
						<input
							type="text"
							class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
							placeholder="Masukkan kode (contoh: KK-BAKU)"
							name="kode"
							value={kodeInput}
							oninput={(event) => onKodeChange((event.currentTarget as HTMLInputElement).value)}
							required
							disabled={!canManage}
							maxlength={20}
						/>
					</div>

					<div class="space-y-2">
						<p class="font-semibold">Kegiatan Kokurikuler</p>
						<textarea
							class="textarea bg-base-200 dark:bg-base-300 h-28 w-full dark:border-none"
							placeholder="Ketik kegiatan atau tema kegiatan kokurikuler"
							name="kokurikuler"
							value={tujuanInput}
							oninput={(event) =>
								onTujuanChange((event.currentTarget as HTMLTextAreaElement).value)}
							required
							disabled={!canManage}></textarea>
					</div>
				</FormEnhance>
			</div>

			<div class="modal-action shrink-0">
				<button class="btn btn-soft shadow-none mr-auto" type="button" onclick={onClose}>
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
						!kodeInput.trim() ||
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
		</div>
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
