<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';

	let { passkeySet, activePasskey = null }: { passkeySet: boolean; activePasskey?: string | null } =
		$props();

	// Password visibility toggles
	let showBukuTamuPasskey = $state(false);
	let showBukuTamuConfirm = $state(false);
	let clearingBukuTamuPasskey = $state(false);
</script>

<section class="card bg-base-100 rounded-lg border border-none p-6 shadow-md">
	<FormEnhance
		action="?/buku-tamu-passkey"
		onsuccess={({ form }) => {
			form.reset();
		}}
	>
		{#snippet children({ submitting, invalid })}
			<header class="mb-4 space-y-2">
				<h2 class="text-xl font-semibold">Passkey Buku Tamu</h2>
				<p class="text-base-content/70 text-sm">
					Jika diaktifkan, pengunjung harus memasukkan passkey sekali saat membuka halaman
					<code>/tamu</code> sebelum dapat mengisi buku tamu. Kosongkan untuk menonaktifkan.
				</p>
				{#if passkeySet && activePasskey}
					<div class="alert alert-success flex items-center gap-2">
						<Icon name="success" />
						<div>
							<span>Passkey buku tamu aktif:</span>
							<code class="ml-1 font-mono">{activePasskey}</code>
						</div>
					</div>
				{:else if passkeySet}
					<div class="alert alert-success">
						<Icon name="success" />
						<span>Passkey buku tamu aktif.</span>
					</div>
				{/if}
			</header>

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<fieldset class="fieldset">
					<legend class="fieldset-legend">Passkey</legend>
					<div class="form-control">
						<label class="input bg-base-200 dark:bg-base-300 validator w-full dark:border-none">
							<span class="pl-2"><Icon name="lock" /></span>
							<input
								type={showBukuTamuPasskey ? 'text' : 'password'}
								id="passkey"
								name="passkey"
								required
								minlength={4}
								maxlength={64}
								placeholder="Masukkan passkey baru (4–64 karakter)"
								autocomplete="new-password"
							/>
							<button
								type="button"
								class="cursor-pointer pr-2"
								onclick={() => (showBukuTamuPasskey = !showBukuTamuPasskey)}
								aria-label="Lihat atau sembunyikan kunci akses"
							>
								<Icon name={showBukuTamuPasskey ? 'eye-off' : 'eye'} />
							</button>
						</label>
					</div>
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend">Konfirmasi passkey</legend>
					<div class="form-control">
						<label class="input bg-base-200 dark:bg-base-300 validator w-full dark:border-none">
							<span class="pl-2"><Icon name="lock" /></span>
							<input
								type={showBukuTamuConfirm ? 'text' : 'password'}
								id="confirmPasskey"
								name="confirmPasskey"
								required
								minlength={4}
								maxlength={64}
								placeholder="Ulangi passkey baru"
								autocomplete="new-password"
							/>
							<button
								type="button"
								class="cursor-pointer pr-2"
								onclick={() => (showBukuTamuConfirm = !showBukuTamuConfirm)}
								aria-label="Lihat atau sembunyikan konfirmasi kunci akses"
							>
								<Icon name={showBukuTamuConfirm ? 'eye-off' : 'eye'} />
							</button>
						</label>
					</div>
				</fieldset>
			</div>

			<div class="mt-6 flex items-center gap-2">
				{#if passkeySet}
					<button
						class="btn btn-soft btn-error shadow-none"
						type="submit"
						form="buku-tamu-passkey-clear"
						disabled={clearingBukuTamuPasskey}
					>
						<Icon name="del" />
						{clearingBukuTamuPasskey ? 'Menonaktifkan…' : 'Nonaktifkan Passkey'}
					</button>
				{/if}

				<button
					class="btn btn-primary shadow-none ml-auto"
					type="submit"
					disabled={submitting || invalid}
				>
					<Icon name="save" />
					{submitting ? 'Menyimpan…' : 'Simpan Passkey'}
				</button>
			</div>
		{/snippet}
	</FormEnhance>

	{#if passkeySet}
		<FormEnhance
			id="buku-tamu-passkey-clear"
			action="?/buku-tamu-passkey-clear"
			submitStateChange={(s) => (clearingBukuTamuPasskey = s)}
		>
			{#snippet children({ submitting })}
				<button type="submit" class="hidden" disabled={submitting}>Nonaktifkan</button>
			{/snippet}
		</FormEnhance>
	{/if}
</section>
