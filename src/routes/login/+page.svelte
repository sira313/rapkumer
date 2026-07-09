<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';

	let showPassword = $state(false);
</script>

<section class="card bg-base-100 w-full max-w-md shadow-xl">
	<div class="card-body space-y-6">
		<header class="mb-2 space-y-2 text-center">
			<h1 class="text-2xl font-bold">Masuk ke Rapkumer</h1>
			<p class="text-base-content/70 text-sm">
				Masukkan nama pengguna dan sandi untuk mulai mengelola administrasi guru.
			</p>
		</header>

		<FormEnhance action="?/login">
			{#snippet children({ submitting, invalid })}
				<div class="fieldset">
					<label class="fieldset-legend" for="username"> Nama Pengguna </label>
					<input
						type="text"
						id="username"
						name="username"
						required
						autocomplete="username"
						placeholder="Contoh: Admin"
						class="input input-bordered dark:bg-base-200 w-full dark:border-none"
					/>
				</div>

				<div class="fieldset">
					<label class="fieldset-legend" for="password"> Kata Sandi </label>
					<label class="input input-bordered dark:bg-base-200 w-full dark:border-none">
						<input
							type={showPassword ? 'text' : 'password'}
							id="password"
							name="password"
							required
							autocomplete="current-password"
							placeholder="••••••••"
						/>
						<button
							type="button"
							class="cursor-pointer"
							onclick={() => (showPassword = !showPassword)}
							aria-label="Toggle password visibility"
						>
							<Icon name={showPassword ? 'eye-off' : 'eye'} />
						</button>
					</label>
				</div>

				<button class="btn btn-primary mt-6 w-full" type="submit" disabled={submitting || invalid}>
					{submitting ? 'Masuk…' : 'Masuk'}
				</button>
			{/snippet}
		</FormEnhance>
	</div>
</section>
