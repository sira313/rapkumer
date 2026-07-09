<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- page uses links for internal navigation */
	import { browser } from '$app/environment';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import UpdateModal from '$lib/components/settings/update-modal.svelte';
	import { page } from '$app/state';
	import { isAuthorizedUser } from '../pengguna/permissions';

	let user = $derived(page.data.user);
	import { toast } from '$lib/components/toast.svelte';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	const { data } = $props<{ data: PageData }>();

	const detectedAddresses = data.appAddresses ?? [];
	const protocol = data.protocol ?? 'http:';
	const currentVersion = $derived(data.appVersion ?? '0.0.0');

	let appAddress = $state(detectedAddresses[0] ?? '');
	let copying = $state(false);
	let updateModalOpen = $state(false);

	// Password visibility toggles
	let showAdminPassword = $state(false);
	let showCurrentPassword = $state(false);
	let showNewPassword = $state(false);
	let showConfirmPassword = $state(false);

	onMount(() => {
		if (!appAddress && browser) {
			appAddress = window.location.host;
		}
	});

	async function copyAddress() {
		if (!browser) {
			toast({ message: 'Penyalinan hanya tersedia di peramban.', type: 'warning' });
			return;
		}

		const target = appAddress || window.location.host;
		if (!target) {
			toast({ message: 'Alamat aplikasi tidak ditemukan.', type: 'warning' });
			return;
		}

		if (!navigator.clipboard) {
			toast({ message: 'Clipboard tidak tersedia di perangkat ini.', type: 'warning' });
			return;
		}

		const scheme = protocol === 'https:' ? 'https://' : 'http://';
		const copyValue =
			target.startsWith('http://') || target.startsWith('https://') ? target : `${scheme}${target}`;

		try {
			copying = true;
			await navigator.clipboard.writeText(copyValue);
			toast({ message: 'Alamat aplikasi berhasil disalin.', type: 'success' });
		} catch (error) {
			console.error('Failed to copy app address', error);
			toast({ message: 'Gagal menyalin alamat. Salin manual ya.', type: 'error' });
		} finally {
			copying = false;
		}
	}

	function handlePasswordSuccess({ form }: { form: HTMLFormElement }) {
		form.reset();
	}

	function handleAdminUsernameSuccess({ form }: { form: HTMLFormElement }) {
		form.reset();
	}
</script>

<section class="card bg-base-100 rounded-lg border border-none p-6 shadow-md">
	<div class="space-y-4">
		<header class="flex justify-between gap-3">
			<div class="space-y-2">
				<h1 class="text-2xl font-bold">Pengaturan Aplikasi</h1>
				<p class="text-base-content/70 text-sm">
					Pengaturan tambahan untuk lingkungan server lokal Anda.
				</p>
				<p class="text-base-content/60 text-xs">Versi terpasang: v{currentVersion}</p>
			</div>
		</header>

		<fieldset class="fieldset">
			<legend class="fieldset-legend">Alamat aplikasi</legend>
			<div class="join">
				<input
					type="text"
					disabled
					class="input bg-base-200 join-item w-full dark:border-none"
					placeholder={appAddress || 'Tidak ada alamat terdeteksi'}
					value={appAddress}
				/>
				<button
					class="btn join-item btn-soft btn-info shadow-none"
					type="button"
					onclick={copyAddress}
					disabled={!appAddress || copying}
				>
					<Icon name="copy" />
					{copying ? 'Menyalin…' : 'Copy'}
				</button>
			</div>
			{#if detectedAddresses.length > 1}
				<label class="label mt-3" for="addressSelector">
					<span class="label-text">Alamat terdeteksi lainnya</span>
				</label>
				<div class="overflow-hidden">
					<select
						id="addressSelector"
						class="select select-bordered dark:bg-base-200 w-full truncate dark:border-none"
						bind:value={appAddress}
					>
						{#each detectedAddresses as address (address)}
							<option value={address}>{address}</option>
						{/each}
					</select>
				</div>
			{/if}
			<p class="text-base-content/70 mt-1 text-xs">
				Buka alamat ini pada perangkat lain di jaringan lokal yang sama.
			</p>
		</fieldset>
	</div>
	<UpdateModal open={updateModalOpen} {currentVersion} on:close={() => (updateModalOpen = false)} />
	<div class="mt-4 flex flex-col justify-between gap-2 sm:flex-row">
		<button
			class="btn btn-outline btn-secondary shadow-none sm:self-start {!isAuthorizedUser(
				['app_check_update'],
				user
			)
				? 'btn-disabled pointer-events-none opacity-60'
				: ''}"
			type="button"
			onclick={() => (updateModalOpen = true)}
			disabled={!isAuthorizedUser(['app_check_update'], user)}
			title={!isAuthorizedUser(['app_check_update'], user)
				? 'Anda tidak memiliki izin untuk memeriksa pembaruan'
				: ''}
		>
			<Icon name="download" />
			Cek Update
		</button>
		<a
			class="btn btn-outline btn-info shadow-none {!isAuthorizedUser(['user_list'], user)
				? 'btn-disabled pointer-events-none opacity-60'
				: ''}"
			href={isAuthorizedUser(['user_list'], user) ? '/pengguna' : '#'}
			aria-disabled={!isAuthorizedUser(['user_list'], user)}
			tabindex={!isAuthorizedUser(['user_list'], user) ? -1 : 0}
			title={!isAuthorizedUser(['user_list'], user)
				? 'Anda tidak memiliki izin untuk mengakses Manajemen Pengguna'
				: ''}
			onclick={(e) => {
				if (!isAuthorizedUser(['user_list'], user)) e.preventDefault();
			}}
		>
			<Icon name="users" />
			Manajemen Pengguna
		</a>
	</div>
</section>

<section class="card bg-base-100 mt-5 rounded-lg border border-none p-6 shadow-md">
	<!-- Change Admin Username -->
	<FormEnhance action="?/change-admin-username" onsuccess={handleAdminUsernameSuccess}>
		{#snippet children({ submitting, invalid })}
			<header class="mb-4 space-y-2">
				<h2 class="text-xl font-semibold">Ganti Username</h2>
				<p class="text-base-content/70 text-sm">
					Perbarui username untuk menjaga keamanan akses aplikasi.
				</p>
			</header>
			<div class="flex flex-col gap-2 sm:flex-row">
				<div class="w-full">
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Username</legend>
						<div class="form-control">
							<label class="input bg-base-200 dark:bg-base-300 validator w-full dark:border-none">
								<span class="pl-2"><Icon name="users" /></span>
								<input
									type="text"
									id="adminUsername"
									name="adminUsername"
									required
									pattern="^[A-Za-z0-9._-]&#123;3,&#125;$"
									title="Gunakan huruf, angka, titik, underscore atau minus. Minimal 3 karakter."
									placeholder="contoh: laila2"
								/>
							</label>
							<p class="text-base-content/70 mt-1 text-xs">Masukkan username baru.</p>
						</div>
					</fieldset>
				</div>

				<div class="w-full">
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Konfirmasi dengan Kata Sandi</legend>
						<div class="form-control">
							<label class="input bg-base-200 dark:bg-base-300 validator w-full dark:border-none">
								<span class="pl-2"><Icon name="lock" /></span>
								<input
									type={showAdminPassword ? 'text' : 'password'}
									id="adminPassword"
									name="adminPassword"
									required
									placeholder="Masukkan kata sandi"
									autocomplete="current-password"
								/>
								<button
									type="button"
									class="cursor-pointer pr-2"
									onclick={() => (showAdminPassword = !showAdminPassword)}
									aria-label="Toggle password visibility"
								>
									<Icon name={showAdminPassword ? 'eye-off' : 'eye'} />
								</button>
							</label>
							<p class="text-base-content/70 mt-1 text-xs">
								Masukkan kata sandi saat ini untuk konfirmasi perubahan username.
							</p>
						</div>
					</fieldset>
				</div>
			</div>

			<div class="mt-6 flex justify-end">
				<button class="btn btn-primary shadow-none" type="submit" disabled={submitting || invalid}>
					<Icon name="save" />
					{submitting ? 'Menyimpan…' : 'Terapkan'}
				</button>
			</div>
		{/snippet}
	</FormEnhance>
</section>

<section class="card bg-base-100 mt-5 rounded-lg border border-none p-6 shadow-md">
	<div class="space-y-4">
		<header class="space-y-2">
			<h2 class="text-xl font-semibold">Ganti Password</h2>
			<p class="text-base-content/70 text-sm">
				Perbarui kata sandi untuk menjaga keamanan akses aplikasi.
			</p>
		</header>

		<FormEnhance action="?/change-password" onsuccess={handlePasswordSuccess}>
			{#snippet children({ submitting, invalid })}
				<div>
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Kata sandi saat ini</legend>
						<label class="input bg-base-200 dark:bg-base-300 validator w-full dark:border-none">
							<span class="pl-2"><Icon name="lock" /></span>
							<input
								type={showCurrentPassword ? 'text' : 'password'}
								id="currentPassword"
								name="currentPassword"
								required
								autocomplete="current-password"
								placeholder="Masukkan kata sandi lama"
							/>
							<button
								type="button"
								class="cursor-pointer pr-2"
								onclick={() => (showCurrentPassword = !showCurrentPassword)}
								aria-label="Toggle password visibility"
							>
								<Icon name={showCurrentPassword ? 'eye-off' : 'eye'} />
							</button>
						</label>
					</fieldset>

					<fieldset class="fieldset">
						<legend class="fieldset-legend">Kata sandi baru</legend>
						<label class="input bg-base-200 dark:bg-base-300 validator w-full dark:border-none">
							<span class="pl-2"><Icon name="lock" /></span>
							<input
								type={showNewPassword ? 'text' : 'password'}
								id="newPassword"
								name="newPassword"
								required
								minlength={8}
								autocomplete="new-password"
								placeholder="Minimal 8 karakter"
							/>
							<button
								type="button"
								class="cursor-pointer pr-2"
								onclick={() => (showNewPassword = !showNewPassword)}
								aria-label="Toggle password visibility"
							>
								<Icon name={showNewPassword ? 'eye-off' : 'eye'} />
							</button>
						</label>
					</fieldset>

					<fieldset class="fieldset">
						<legend class="fieldset-legend">Konfirmasi kata sandi baru</legend>
						<label class="input bg-base-200 dark:bg-base-300 validator w-full dark:border-none">
							<span class="pl-2"><Icon name="lock" /></span>
							<input
								type={showConfirmPassword ? 'text' : 'password'}
								id="confirmPassword"
								name="confirmPassword"
								required
								minlength={8}
								autocomplete="new-password"
								placeholder="Ulangi kata sandi baru"
							/>
							<button
								type="button"
								class="cursor-pointer pr-2"
								onclick={() => (showConfirmPassword = !showConfirmPassword)}
								aria-label="Toggle password visibility"
							>
								<Icon name={showConfirmPassword ? 'eye-off' : 'eye'} />
							</button>
						</label>
					</fieldset>

					<p class="text-base-content/70 text-xs">
						Gunakan kombinasi huruf dan angka untuk keamanan maksimal.
					</p>

					<div role="alert" class="alert alert-info mt-4">
						<Icon name="info" />
						<span
							>Khusus wali kelas, dapat mengubah kata sandi mereka sendiri. Bila lupa sandi atau
							username, dapat menghubungi admin untuk melakukan reset.</span
						>
					</div>
					<div role="alert" class="alert alert-warning mt-4">
						<Icon name="alert" />
						<span>Khusus Admin, simpan sandi dengan aman. Tidak ada garansi lupa sandi!</span>
					</div>
					<div class="mt-6 flex justify-end">
						<button
							class="btn btn-primary shadow-none"
							type="submit"
							disabled={submitting || invalid}
						>
							<Icon name="save" />
							{submitting ? 'Menyimpan…' : 'Simpan kata sandi'}
						</button>
					</div>
				</div>
			{/snippet}
		</FormEnhance>
	</div>
</section>
