<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import type { NilaiKategori } from '$lib/kokurikuler';
	import type { DimensiProfilLulusanKey } from '$lib/statics';

	type MuridRow = {
		id: number;
		nama: string;
		nilaiByDimensi: Record<DimensiProfilLulusanKey, NilaiKategori | null>;
	};

	type KokurikulerDetail = {
		id: number;
		kode: string;
		tujuan: string;
		dimensi: Array<{ key: DimensiProfilLulusanKey; label: string }>;
	};

	let { open, murid, kokurikuler, kategoriOptions, action, onClose, onSuccess } = $props<{
		open: boolean;
		murid: MuridRow | null;
		kokurikuler: KokurikulerDetail | null;
		kategoriOptions: Array<{ value: NilaiKategori; label: string }>;
		action: string;
		onClose: () => void;
		onSuccess: () => void | Promise<void>;
	}>();

	const initValue = $derived.by(() => {
		if (!murid || !kokurikuler) return undefined;
		const nilai: Record<string, NilaiKategori> = {};
		for (const [key, value] of Object.entries(murid.nilaiByDimensi) as Array<
			[DimensiProfilLulusanKey, NilaiKategori | null]
		>) {
			if (value) {
				nilai[key] = value;
			}
		}
		return {
			muridId: murid.id,
			kokurikulerId: kokurikuler.id,
			nilai
		};
	});

	function handleSuccess() {
		onSuccess?.();
	}

	let submitting = $state(false);

	function capitalizeSentence(value: string | null | undefined) {
		if (!value) return '';
		const trimmed = value.trimStart();
		if (!trimmed) return '';
		return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
	}
</script>

{#if open && murid && kokurikuler}
	<div
		class="modal modal-open"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onkeydown={(event) => {
			if (event.key === 'Escape') onClose();
		}}
	>
		<div class="modal-box max-w-2xl">
			<h3 class="text-lg font-bold">Nilai Kokurikuler</h3>
			<p class="text-base-content/80 mt-1 text-sm">
				Ananda <span class="font-semibold">{murid.nama}</span>
			</p>
			<label class="form-control mt-4">
				<span class="label-text text-base-content/80 text-sm font-semibold">
					Kegiatan Kokurikuler
				</span>
				<select class="select bg-base-200 dark:bg-base-300 mt-2 w-full dark:border-none" disabled>
					<option>{capitalizeSentence(kokurikuler.tujuan)}</option>
				</select>
			</label>

			<FormEnhance
				id="form-nilai-kokurikuler"
				{action}
				init={initValue}
				onsuccess={handleSuccess}
				submitStateChange={(v) => (submitting = v)}
			>
				{#snippet children()}
					<input type="hidden" name="muridId" value={murid.id} />
					<input type="hidden" name="kokurikulerId" value={kokurikuler.id} />

					<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
						{#each kokurikuler.dimensi as dim (dim.key)}
							<fieldset class="fieldset">
								<legend class="fieldset-legend text-base-content/80 text-sm font-semibold">
									{dim.label}
								</legend>
								<select
									class="select bg-base-200 dark:bg-base-300 w-full dark:border-none"
									name={`nilai.${dim.key}`}
									aria-label={`Nilai ${dim.label}`}
								>
									<option value="">Belum dinilai</option>
									{#each kategoriOptions as option (option.value)}
										<option value={option.value}>{option.label}</option>
									{/each}
								</select>
							</fieldset>
						{/each}
					</div>
				{/snippet}
			</FormEnhance>

			<div class="modal-action mt-6 flex gap-2">
				<button type="button" class="btn btn-soft shadow-none" onclick={onClose}>
					<Icon name="close" />
					Batal
				</button>
				<button
					class="btn btn-primary shadow-none"
					type="submit"
					form="form-nilai-kokurikuler"
					disabled={submitting}
				>
					{#if submitting}
						<span class="loading loading-spinner"></span>
					{:else}
						<Icon name="save" />
					{/if}
					Simpan
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
				Tutup
			</button>
		</form>
	</div>
{/if}
