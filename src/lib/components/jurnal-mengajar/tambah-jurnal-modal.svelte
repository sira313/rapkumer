<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import { setLoading } from '$lib/components/global-modal.svelte';

	interface TujuanPembelajaranItem {
		id: number;
		deskripsi: string;
		lingkupMateri: string;
		mataPelajaranId: number;
	}

	interface MataPelajaranItem {
		id: number;
		nama: string;
		kode: string | null;
	}

	interface EditData {
		id: number;
		kelasId: number;
		mataPelajaranId: number;
		lingkupMateri: string;
		tujuanPembelajaranId: number | null;
		catatan: string;
	}

	interface Props {
		editData: EditData | null;
		tanggal?: string;
		kelasId?: number;
		mapelId?: number | null;
		mataPelajaranList: MataPelajaranItem[];
		tujuanPembelajaranList: TujuanPembelajaranItem[];
		lingkupMateriList: string[];
		userType: string;
		onAction?: (actions: { submit: () => void }) => void;
		onSuccess?: (params: { data?: Record<string, unknown> }) => void | Promise<void>;
	}

	let {
		editData,
		tanggal,
		kelasId,
		mapelId,
		mataPelajaranList,
		tujuanPembelajaranList,
		lingkupMateriList,
		userType,
		onAction,
		onSuccess
	}: Props = $props();

	const defaultKelasId = $derived(editData?.kelasId ?? kelasId ?? 0);
	const defaultMapelId = $derived(editData?.mataPelajaranId ?? mapelId ?? 0);

	// Form state
	let formKelasId = $state(defaultKelasId);
	let formMapelId = $state(defaultMapelId);
	let formLingkupMateri = $state(editData?.lingkupMateri ?? '');
	let formTujuanPembelajaranId = $state(editData?.tujuanPembelajaranId ?? null);
	let formCatatan = $state(editData?.catatan ?? '');

	const formId = 'tambah-jurnal-form';

	const filteredLingkupMateri = $derived.by(() => {
		const set = new Set<string>();
		for (const tp of tujuanPembelajaranList) {
			if (formMapelId && tp.mataPelajaranId === formMapelId && tp.lingkupMateri) {
				set.add(tp.lingkupMateri);
			}
		}
		return Array.from(set).sort();
	});

	const filteredTujuanPembelajaran = $derived.by(() => {
		return tujuanPembelajaranList.filter(
			(tp) =>
				tp.lingkupMateri === formLingkupMateri &&
				(formMapelId === 0 || tp.mataPelajaranId === formMapelId)
		);
	});

	function handleSuccess({ data }: { form: HTMLFormElement; data?: Record<string, unknown> }) {
		void onSuccess?.({ data });
	}

	$effect(() => {
		onAction?.({
			submit: () => (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit()
		});
	});

	// When mapel changes, reset lingkupMateri if current selection is invalid
	$effect(() => {
		if (formLingkupMateri && !filteredLingkupMateri.includes(formLingkupMateri)) {
			formLingkupMateri = '';
			formTujuanPembelajaranId = null;
		}
	});

	// When lingkup materi changes, reset TP if current TP doesn't belong to the new lingkup
	$effect(() => {
		if (formLingkupMateri && formTujuanPembelajaranId) {
			const valid = filteredTujuanPembelajaran.some((tp) => tp.id === formTujuanPembelajaranId);
			if (!valid) {
				formTujuanPembelajaranId = null;
			}
		}
	});
</script>

<FormEnhance action="?/save" id={formId} onsuccess={handleSuccess} submitStateChange={setLoading}>
	{#snippet children()}
		<input type="hidden" name="id" value={editData?.id ?? ''} />
		<input type="hidden" name="kelasId" value={formKelasId} />
		<input type="hidden" name="tanggal" value={tanggal ?? ''} />

		{#if mataPelajaranList.length > 0}
			<fieldset class="fieldset">
				<legend class="fieldset-legend">Mata Pelajaran</legend>
				<select
					class="select w-full dark:border-none dark:bg-base-300 bg-base-200"
					name="mataPelajaranId"
					value={formMapelId}
					onchange={(e) => {
						formMapelId = Number((e.currentTarget as HTMLSelectElement).value);
					}}
				>
					<option value="" disabled>Pilih Mata Pelajaran</option>
					{#each mataPelajaranList as mp}
						<option value={mp.id}>{mp.nama}</option>
					{/each}
				</select>
			</fieldset>
		{/if}

		<fieldset class="fieldset">
			<legend class="fieldset-legend">Lingkup Materi</legend>
			<select
				class="select w-full dark:border-none dark:bg-base-300 bg-base-200"
				name="lingkupMateri"
				value={formLingkupMateri}
				onchange={(e) => {
					formLingkupMateri = (e.currentTarget as HTMLSelectElement).value;
				}}
				required
			>
				<option value="" disabled>Pilih Lingkup Materi</option>
				{#each filteredLingkupMateri as lm}
					<option value={lm}>{lm}</option>
				{/each}
			</select>
		</fieldset>

		<fieldset class="fieldset">
			<legend class="fieldset-legend">Tujuan Pembelajaran</legend>
			<select
				class="select w-full dark:border-none dark:bg-base-300 bg-base-200"
				name="tujuanPembelajaranId"
				value={formTujuanPembelajaranId ?? ''}
				onchange={(e) => {
					const val = (e.currentTarget as HTMLSelectElement).value;
					formTujuanPembelajaranId = val ? Number(val) : null;
				}}
			>
				<option value="">Pilih Tujuan Pembelajaran</option>
				{#each filteredTujuanPembelajaran as tp}
					<option value={tp.id}>{tp.deskripsi}</option>
				{/each}
			</select>
			{#if !formLingkupMateri}
				<p class="label">Pilih lingkup materi terlebih dahulu</p>
			{/if}
		</fieldset>

		<fieldset class="fieldset">
			<legend class="fieldset-legend">Catatan</legend>
			<textarea
				class="textarea w-full dark:border-none dark:bg-base-300 bg-base-200"
				name="catatan"
				rows="3"
				maxlength="300"
				value={formCatatan}
				oninput={(e) => {
					formCatatan = (e.currentTarget as HTMLTextAreaElement).value;
				}}
				placeholder="Tuliskan catatan (maksimal 300 karakter)"
				spellcheck="false"></textarea>
			<p class="label">{formCatatan.length}/300 karakter</p>
		</fieldset>
	{/snippet}
</FormEnhance>
