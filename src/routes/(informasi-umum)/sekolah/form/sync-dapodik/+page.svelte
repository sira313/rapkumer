<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- small page-level navigation helper calls */
	import { goto, refreshAll } from '$app/navigation';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';

	let { data } = $props();

	type SectionLog = { label: string; status: 'ok' | 'gagal' | 'dilewati'; detail: string };

	const modes = [
		{ value: 'tes-koneksi', label: 'Tes Koneksi Dapodik' },
		{ value: 'semester', label: 'Ambil Semester Saja' },
		{ value: 'semua', label: 'Ambil Semua Data' }
	] as const;

	type ModeValue = (typeof modes)[number]['value'];

	let selectedMode = $state<ModeValue>('tes-koneksi');
	let sections = $state<SectionLog[]>([]);
	let resultMessage = $state('');
	let notif = $state<{ type: 'success' | 'error'; message: string } | null>(null);

	const modeDescription: Record<ModeValue, string> = {
		'tes-koneksi': 'Berfungsi untuk melakukan tes koneksi dapodik melalui bearer token.',
		semester:
			'Ambil data semester saja. Berdampak pada halaman /sekolah/tahun-ajaran dan "Semester Aktif" pada halaman /akademik.',
		semua:
			'Ambil semua data yang dapat diambil dari Dapodik: profil sekolah, semester, PTK/guru, rombongan belajar, peserta didik, pembelajaran (mapel & pengampu), dan ekstrakurikuler.'
	};

	function statusIcon(status: SectionLog['status']): IconName {
		if (status === 'ok') return 'success';
		if (status === 'gagal') return 'error';
		return 'info';
	}

	function statusClass(status: SectionLog['status']): string {
		if (status === 'ok') return 'text-success';
		if (status === 'gagal') return 'text-error';
		return 'opacity-60';
	}

	async function handleSuccess({
		form,
		data: payload
	}: {
		form?: HTMLFormElement;
		data?: Record<string, unknown>;
	}) {
		resultMessage =
			typeof payload?.message === 'string' ? payload.message : 'Sinkronisasi selesai.';
		sections = Array.isArray(payload?.sections) ? (payload.sections as SectionLog[]) : [];

		const submittedMode = form ? (new FormData(form).get('mode') as ModeValue | null) : null;
		if ((submittedMode ?? selectedMode) !== 'semua') {
			await refreshAll();
			notif = { type: 'success', message: resultMessage };
			return;
		}

		toast(resultMessage, 'success');
		await goto('/', { replaceState: true });
	}

	function handleFailure({ data }: { data?: Record<string, unknown> }) {
		const message =
			typeof data?.fail === 'string'
				? data.fail
				: typeof data?.message === 'string'
					? data.message
					: 'Sinkronisasi Dapodik gagal.';
		resultMessage = '';
		sections = [];
		notif = { type: 'error', message };
	}
</script>

<FormEnhance
	action="?/sync"
	class="flex min-h-0 flex-1 flex-col"
	init={{ ...(data.settings ?? {}), npsn: data.npsn ?? '' }}
	showToast={false}
	updateAfterSuccess={false}
	onsuccess={handleSuccess}
	onfailure={handleFailure}
>
	{#snippet children({ submitting })}
		<h3 class="mb-3 text-lg font-bold">Sinkronisasi Dapodik</h3>
		<div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-1">
			<p class="text-sm opacity-70">
				Ambil data dari aplikasi Dapodik melalui Web Service (Bearer token). Data Dapodik akan
				menimpa data yang sudah ada di sistem.
			</p>

			{#if notif}
				<div
					role="alert"
					class="alert {notif.type === 'success' ? 'alert-success' : 'alert-error'} alert-soft"
				>
					<Icon name={notif.type === 'success' ? 'success' : 'error'} />
					<span class="text-wrap">{notif.message}</span>
				</div>
			{/if}

			<div class="grid grid-cols-1 gap-2">
				<div class="fieldset">
					<legend class="fieldset-legend">Token</legend>
					<input
						required
						type="text"
						name="token"
						placeholder="Masukkan token web service dapodik"
						class="input bg-base-200 dark:bg-base-300 validator w-full dark:border-none"
					/>
					<p class="label text-wrap">Token didapat dari menu Web Service pada aplikasi Dapodik.</p>
				</div>

				<div class="fieldset">
					<legend class="fieldset-legend">URL Dapodik</legend>
					<input
						required
						type="text"
						name="url"
						placeholder="Contoh: 192.168.8.114:5774"
						class="input bg-base-200 dark:bg-base-300 validator w-full dark:border-none"
					/>
				</div>

				<div class="fieldset">
					<legend class="fieldset-legend">NPSN</legend>
					<input
						required
						type="text"
						name="npsn"
						placeholder="Contoh: 69856875"
						class="input bg-base-200 dark:bg-base-300 validator w-full dark:border-none"
					/>
				</div>

				<div class="fieldset">
					<legend class="fieldset-legend">Mode Sinkronisasi</legend>
					<select
						bind:value={selectedMode}
						name="mode"
						class="select w-full truncate bg-base-200 dark:bg-base-300 validator dark:border-none"
					>
						{#each modes as item (item.value)}
							<option value={item.value}>{item.label}</option>
						{/each}
					</select>
					<p class="label text-wrap">{modeDescription[selectedMode]}</p>
				</div>
			</div>

			{#if sections.length > 0}
				<div class="bg-base-200 dark:bg-base-300 rounded-md p-3">
					{#if resultMessage}
						<p class="mb-2 font-semibold">{resultMessage}</p>
					{/if}
					<ul class="flex flex-col gap-1">
						{#each sections as section (section.label)}
							<li class="flex items-start gap-2 text-sm">
								<span class="{statusClass(section.status)} mt-0.5 shrink-0">
									<Icon name={statusIcon(section.status)} />
								</span>
								<span>
									<b>{section.label}:</b>
									{section.detail}
								</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
		<div
			class="modal-action grid grid-cols-2 justify-between gap-2 sm:flex sm:flex-row sm:items-center"
		>
			<button
				type="button"
				class="btn btn-soft w-full shadow-none sm:w-auto sm:flex-none"
				onclick={() => history.back()}
			>
				<Icon name="close" />
				Tutup
			</button>
			<button
				class="btn btn-primary w-full shadow-none sm:w-auto sm:flex-none"
				disabled={submitting}
			>
				{#if submitting}
					<span class="loading loading-spinner"></span>
				{:else}
					<Icon name="play" />
				{/if}
				Proses
			</button>
		</div>
	{/snippet}
</FormEnhance>
