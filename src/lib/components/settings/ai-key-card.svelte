<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';

	let {
		variant,
		title,
		description,
		idPrefix,
		data
	}: {
		variant: 'sekolah' | 'pribadi';
		title: string;
		description: string;
		idPrefix: string;
		data: {
			keySet: boolean;
			maskedKey: string | null;
			envKeyPresent: boolean;
			model: string;
			baseUrl: string;
		};
	} = $props();

	// svelte-ignore state_referenced_locally
	const isPersonal = variant === 'pribadi';
	const saveAction = isPersonal ? '?/save-my-ai-key' : '?/save-gemini-key';
	const clearAction = isPersonal ? '?/clear-my-ai-key' : '?/clear-gemini-key';

	// Password visibility toggle
	let showKey = $state(false);
	let clearingKey = $state(false);
	// svelte-ignore state_referenced_locally
	let aiModel = $state(data.model);
	// svelte-ignore state_referenced_locally
	let aiBaseUrl = $state(data.baseUrl);
</script>

<section
	id="ai-key"
	class="card bg-base-100 rounded-lg border border-none p-6 shadow-md scroll-mt-20"
>
	<FormEnhance
		action={saveAction}
		onsuccess={({ form }) => {
			form.reset();
		}}
	>
		{#snippet children({ submitting, invalid })}
			<header class="mb-4 space-y-2">
				<h2 class="text-xl font-semibold">{title}</h2>
				<p class="text-base-content/70 text-sm">
					{description}
				</p>
				{#if data.keySet}
					<div class="alert alert-success">
						<Icon name="success" />
						<span>Kunci API {isPersonal ? 'pribadi ' : ''}aktif: {data.maskedKey}</span>
					</div>
				{:else if isPersonal}
					<div class="alert alert-warning alert-soft">
						<Icon name="warning" />
						<span
							>Belum ada kunci API pribadi. Kunci sekolah tidak bisa dipakai untuk fitur "Generate".
							Setel kunci Anda di bawah.</span
						>
					</div>
				{:else if data.envKeyPresent}
					<div class="alert alert-info alert-soft">
						<Icon name="info" />
						<span
							>Kunci API aktif dari variabel lingkungan <code>GEMINI_API_KEY</code> (file .env). Kunci
							di atas tidak dapat diubah dari halaman ini.</span
						>
					</div>
				{:else}
					<div class="alert alert-warning alert-soft">
						<Icon name="warning" />
						<span>Belum ada kunci API. Fitur "Generate" belum dapat digunakan.</span>
					</div>
				{/if}
			</header>

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Kunci API</legend>
				<div class="form-control">
					<label class="input bg-base-200 dark:bg-base-300 validator w-full dark:border-none">
						<span class="pl-2"><Icon name="key" /></span>
						<input
							type={showKey ? 'text' : 'password'}
							id="{idPrefix}ApiKey"
							name="apiKey"
							required
							minlength={10}
							placeholder="AIzaSy… / sk-… / ds-…"
							autocomplete="off"
						/>
						<button
							type="button"
							class="cursor-pointer pr-2"
							onclick={() => (showKey = !showKey)}
							aria-label="Lihat atau sembunyikan kunci API"
						>
							<Icon name={showKey ? 'eye-off' : 'eye'} />
						</button>
					</label>
					<p class="text-base-content/70 mt-1 text-xs">
						Masukkan kunci API baru untuk mengganti kunci yang tersimpan.
					</p>
				</div>
			</fieldset>

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<fieldset class="fieldset">
					<legend class="fieldset-legend">Model</legend>
					<input
						class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
						type="text"
						name="model"
						bind:value={aiModel}
						placeholder={isPersonal ? 'ikut setelan sekolah' : 'gemini-3.6-flash'}
						list="{idPrefix}-model-list"
					/>
					<datalist id="{idPrefix}-model-list">
						<option value="gemini-3.6-flash"></option>
						<option value="gemini-3.1-pro"></option>
						<option value="gemini-3.7-flash"></option>
						<option value="claude-opus-4.8"></option>
						<option value="claude-opus-5"></option>
						<option value="claude-sonnet-5"></option>
						<option value="gpt-5.6-sol"></option>
						<option value="gpt-5.6-terra"></option>
						<option value="deepseek-v4-flash"></option>
						<option value="deepseek-v4-pro"></option>
						<option value="glm-5.2"></option>
						<option value="glm-5.3"></option>
						<option value="kimi-k3"></option>
						<option value="qwen3.8-max"></option>
					</datalist>
					<p class="text-base-content/70 mt-1 text-xs">
						{isPersonal
							? 'Kosongkan untuk mengikuti model setelan sekolah.'
							: 'Nama model sesuai penyedia API yang digunakan.'}
					</p>
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend">Base URL</legend>
					<input
						class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
						type="text"
						name="baseUrl"
						bind:value={aiBaseUrl}
						placeholder={isPersonal
							? 'ikut setelan sekolah'
							: 'contoh: https://generativelanguage.googleapis.com'}
						autocomplete="off"
						required={!isPersonal}
					/>
					<p class="text-base-content/70 mt-1 text-xs">
						{#if isPersonal}
							Kosongkan untuk mengikuti base URL sekolah.
						{:else}
							Endpoint API lengkap termasuk <code>/v1</code> jika diperlukan.
						{/if}
					</p>
				</fieldset>
			</div>

			<div class="mt-6 flex items-center gap-2">
				{#if data.keySet}
					<button
						class="btn btn-soft btn-error shadow-none"
						type="submit"
						form="{idPrefix}-key-clear"
						disabled={clearingKey}
					>
						<Icon name="del" />
						{clearingKey ? 'Menghapus…' : 'Hapus Kunci'}
					</button>
				{/if}

				<button
					class="btn btn-primary shadow-none ml-auto"
					type="submit"
					disabled={submitting || invalid}
				>
					<Icon name="save" />
					{submitting ? 'Menyimpan…' : 'Simpan'}
				</button>
			</div>
		{/snippet}
	</FormEnhance>

	{#if data.keySet}
		<FormEnhance
			id="{idPrefix}-key-clear"
			action={clearAction}
			submitStateChange={(s) => (clearingKey = s)}
		>
			{#snippet children({ submitting })}
				<button type="submit" class="hidden" disabled={submitting}>Hapus</button>
			{/snippet}
		</FormEnhance>
	{/if}
</section>
