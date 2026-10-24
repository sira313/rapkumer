<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- form links use static hrefs intentionally */
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import MuridPicker from '$lib/components/asesmen-sumatif/murid-picker.svelte';
	import Icon from '$lib/components/icon.svelte';
	import NilaiIndikatorCard from '$lib/components/asesmen-keasramaan/nilai-indikator-card.svelte';
	import type { EkstrakurikulerNilaiKategori } from '$lib/ekstrakurikuler';
	import {
		kategoriToRubrikValue,
		hitungNilaiIndikator,
		getIndikatorCategory,
		formatScore
	} from '$lib/components/asesmen-keasramaan/utils';

	type TujuanWithIndikator = {
		id: number;
		deskripsi: string;
		indikatorId: number;
		indikatorNama: string;
		indikatorDeskripsi: string;
	};

	type PageData = {
		murid: { id: number; nama: string };
		kelasId: number;
		muridList: Array<{ id: number; nama: string }>;
		keasramaan: { id: number; nama: string };
		keasramaanList: Array<{ id: number; nama: string }>;
		tujuan: TujuanWithIndikator[];
		nilaiByTujuan: Record<number, EkstrakurikulerNilaiKategori>;
		kategoriOptions: Array<{ value: EkstrakurikulerNilaiKategori; label: string }>;
		indikators: Array<{ id: number; nama: string }>;
		backUrl: string;
	};

	let { data }: { data: PageData } = $props();
	async function pilihKeasramaan(event: Event) {
		const id = Number((event.currentTarget as HTMLSelectElement).value);
		if (Number.isInteger(id) && id !== data.keasramaan.id) {
			window.location.href = `/asesmen-keasramaan/form-asesmen?murid_id=${data.murid.id}&keasramaan_id=${id}`;
		}
	}

	// State untuk tracking nilai per TP
	// svelte-ignore state_referenced_locally
	let nilaiByTujuanState = $state<Record<number, EkstrakurikulerNilaiKategori>>(
		structuredClone(data.nilaiByTujuan)
	);
	const isDirty = $derived.by(() => {
		const ids = new Set([...Object.keys(data.nilaiByTujuan), ...Object.keys(nilaiByTujuanState)]);
		return Array.from(ids).some((id) => {
			const tujuanId = Number(id);
			return (nilaiByTujuanState[tujuanId] ?? null) !== (data.nilaiByTujuan[tujuanId] ?? null);
		});
	});

	const hasTujuan = $derived.by(() => data.tujuan.length > 0);
	const initValue = $derived.by(() => ({
		muridId: data.murid.id,
		keasramaanId: data.keasramaan.id,
		nilai: data.nilaiByTujuan
	}));

	// Kelompokkan tujuan per indikator
	const tujuanByIndikator = $derived.by(() => {
		const grouped = new Map<number, TujuanWithIndikator[]>();
		for (const tujuan of data.tujuan) {
			const key = tujuan.indikatorId;
			if (!grouped.has(key)) {
				grouped.set(key, []);
			}
			grouped.get(key)!.push(tujuan);
		}
		return grouped;
	});

	// Hitung nilai per indikator
	const nilaiPerIndikator = $derived.by(() => {
		const result = new Map<
			number,
			{
				nilaiIndikator: number | null;
				indikatorCategory: ReturnType<typeof getIndikatorCategory>;
				tpCount: number;
			}
		>();

		for (const [indikatorId, tujuanList] of tujuanByIndikator) {
			const nilaiTpArray = tujuanList.map((t) => {
				const kategori = nilaiByTujuanState[t.id];
				if (!kategori) return null;
				return kategoriToRubrikValue(kategori);
			});

			const nilaiIndikator = hitungNilaiIndikator(nilaiTpArray);
			const indikatorCategory = getIndikatorCategory(nilaiIndikator);

			result.set(indikatorId, {
				nilaiIndikator,
				indikatorCategory,
				tpCount: tujuanList.length
			});
		}

		return result;
	});

	function capitalizeSentence(value: string | null | undefined) {
		if (!value) return '';
		const trimmed = value.trimStart();
		if (!trimmed) return '';
		return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
	}

	function formatTujuan(value: string) {
		return value.trim();
	}

	function handleNilaiChange(tujuanId: number, value: string) {
		if (!value) {
			delete nilaiByTujuanState[tujuanId];
		} else if (
			value === 'sangat-baik' ||
			value === 'baik' ||
			value === 'cukup' ||
			value === 'perlu-bimbingan'
		) {
			nilaiByTujuanState[tujuanId] = value;
		}
		// Trigger reactivity
		nilaiByTujuanState = nilaiByTujuanState;
	}
</script>

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<FormEnhance action="?/save" init={initValue} id="form-asesmen-keasramaan">
		{#snippet children({ submitting, invalid })}
			<input type="hidden" name="muridId" value={data.murid.id} />
			<input type="hidden" name="keasramaanId" value={data.keasramaan.id} />

			<div class="flex flex-row justify-between gap-2">
				<a href={data.backUrl} class="btn btn-soft shadow-none">
					<Icon name="left" />
					Kembali
				</a>
				<button
					type="submit"
					class="btn btn-primary shadow-none"
					disabled={!hasTujuan || invalid || submitting}
				>
					{#if submitting}
						<span class="loading loading-spinner"></span>
					{:else}
						<Icon name="save" />
					{/if}
					Simpan
				</button>
			</div>

			<h3 class="mt-4 pb-2 text-lg font-bold">
				Isi nilai untuk tiap tujuan pembelajaran keasramaan di bawah ini untuk Ananda
				<span class="text-primary">{capitalizeSentence(data.murid.nama)}</span>.
			</h3>
			<div class="text-base-content/70 text-sm">
				<div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
					<select
						class="select bg-base-200 w-full truncate dark:border-none"
						title="Pilih Matev"
						aria-label="Pilih Matev"
						value={data.keasramaan.id}
						onchange={pilihKeasramaan}
					>
						{#each data.keasramaanList as matev (matev.id)}
							<option value={matev.id}>{capitalizeSentence(matev.nama)}</option>
						{/each}
					</select>
					<MuridPicker
						basePath="/asesmen-keasramaan/form-asesmen"
						kelasId={data.kelasId}
						muridId={data.murid.id}
						mapelId={data.keasramaan.id}
						assessmentParam="keasramaan_id"
						muridOptionsInitial={data.muridList}
						getDirty={() => isDirty}
						confirmMessage="Pindah murid akan membuang perubahan. Lanjutkan?"
					/>
				</div>
			</div>

			{#if !hasTujuan}
				<div class="alert alert-soft alert-warning mt-6">
					<Icon name="alert" />
					<span>
						Belum ada tujuan pembelajaran untuk Matev ini. Tambahkan tujuan terlebih dahulu melalui
						menu <strong>Keasramaan &gt; Tujuan</strong>.
					</span>
				</div>
			{:else}
				<!-- Render per indikator dengan tabelnya -->
				{#each Array.from(data.indikators) as indikator (indikator.id)}
					{@const tujuanList = tujuanByIndikator.get(indikator.id) || []}
					{@const nilaiInfo = nilaiPerIndikator.get(indikator.id)}

					{#if tujuanList.length > 0}
						<div class="mt-6">
							<h4 class="mb-3 text-base font-semibold">{indikator.nama}</h4>
							<div
								class="bg-base-100 dark:bg-base-200 border-base-200 overflow-x-auto rounded-md shadow-md dark:shadow-none"
							>
								<table class="border-base-200 table border dark:border-none">
									<thead>
										<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
											<th style="width: 48px;">No</th>
											<th class="w-full" style="min-width: 240px;">Tujuan Pembelajaran</th>
											<th class="min-w-44">Pilih Nilai</th>
										</tr>
									</thead>
									<tbody>
										{#each tujuanList as tujuan, index (tujuan.id)}
											<tr>
												<td class="align-top">{index + 1}</td>
												<td class="text-base-content align-top text-sm">
													<div>{formatTujuan(tujuan.deskripsi)}</div>
												</td>
												<td class="overflow-hidden align-top">
													<select
														class="select bg-base-200 dark:bg-base-300 w-full truncate dark:border-none"
														name={`nilai.${tujuan.id}`}
														value={nilaiByTujuanState[tujuan.id] || ''}
														onchange={(e) =>
															handleNilaiChange(tujuan.id, (e.target as HTMLSelectElement).value)}
													>
														<option value="">Belum dinilai</option>
														{#each data.kategoriOptions as option (option.value)}
															<option value={option.value}>{option.label}</option>
														{/each}
													</select>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>

							<!-- Alert Nilai Indikator -->
							{#if nilaiInfo}
								<NilaiIndikatorCard
									nilaiIndikator={nilaiInfo.nilaiIndikator}
									indikatorCategory={nilaiInfo.indikatorCategory}
									indikatorNama={indikator.nama}
									{formatScore}
									tpCount={nilaiInfo.tpCount}
								/>
							{/if}
						</div>
					{/if}
				{/each}
			{/if}
		{/snippet}
	</FormEnhance>
</div>
