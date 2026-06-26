<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { page } from '$app/state';
	import DarkMode from '$lib/components/dark-mode.svelte';
	import Icon from '$lib/components/icon.svelte';
	import TasksModal from '$lib/components/modal-tasks.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import { favoritesStore } from '$lib/stores/favorites.svelte';
	import { onMount } from 'svelte';
	import type { Component } from 'svelte';

	type NavbarProps = {
		stopServer?: () => void;
		stoppingServer?: boolean;
		logout?: () => void;
		loggingOut?: boolean;
	};

	// Minimal local type for the user object shape we reference here.
	type UserLike = {
		pegawaiName?: string;
		username?: string;
		permissions?: string[];
		type?: 'admin' | 'user' | 'wali_asuh';
	};

	let {
		stopServer = () => {},
		stoppingServer = false,
		logout = () => {},
		loggingOut = false
	}: NavbarProps = $props();

	let tasksModalRef: { open: () => void } | null = null;
	const daftarKelas = $derived(page.data.daftarKelas ?? []);
	const kelasAktif = $derived(page.data.kelasAktif ?? null);
	const user = $derived(page.data.user ?? null);
	const kelasAktifLabel = $derived.by(() => {
		if (!kelasAktif) return 'Pilih Kelas';
		return kelasAktif.fase ? `${kelasAktif.nama} - ${kelasAktif.fase}` : kelasAktif.nama;
	});

	// Human-readable display name for current user (prefer pegawaiName if available)
	const displayUserName = $derived.by(() => {
		if (!user) return null;
		// use runtime field `pegawaiName` if the server provided it, otherwise fall back to username
		return (user as UserLike)?.pegawaiName ?? (user as UserLike)?.username ?? null;
	});

	// Whether current user can stop the server (client-side guard)
	// Allow users who explicitly have the `server_stop` permission, or
	// any user of type 'admin' (administrators can stop the server by default).
	const canStopServer = $derived.by(() => {
		if (!user) return false;
		// Admins should be allowed regardless of explicit permissions
		if ((user as UserLike).type === 'admin') return true;
		const perms = (user as UserLike)?.permissions ?? [];
		return Array.isArray(perms) ? perms.includes('server_stop') : false;
	});

	import SvelteURLSearchParams from '$lib/svelte-helpers/url-search-params';
	import { resolveHelpFile } from '$lib/help-maps';

	function buildKelasHref(kelasId: number) {
		const params = new SvelteURLSearchParams(page.url.search);
		params.set('kelas_id', String(kelasId));
		const query = params.toString();
		return query ? `${page.url.pathname}?${query}` : page.url.pathname;
	}

	function hasPindahPermission() {
		if (user?.type === 'wali_asuh') return true;
		const perms = user?.permissions ?? [];
		return perms.includes('kelas_pindah');
	}

	function handleKelasClick(e: MouseEvent) {
		if (hasPindahPermission()) {
			// allow navigation
			return;
		}
		// prevent navigation and show logout confirmation modal
		e.preventDefault();
		showModal({
			title: 'Konfirmasi Keluar',
			body: 'Anda tidak mempunyai akses untuk Pindah Kelas secara langsung, silahkan login ulang ke kelas yang dituju. Keluar sekarang?',
			dismissible: true,
			onPositive: {
				label: 'Keluar',
				icon: 'export',
				action: ({ close }: { close: () => void }) => {
					close();
					logout();
				}
			},
			onNegative: { label: 'Batal', icon: 'close' }
		});
	}

	/**
	 * Return an excerpt of `text` limited to `limit` characters.
	 * If text is shorter than or equal to limit, return it unchanged.
	 */
	function excerpt(text: string | null | undefined, limit = 16) {
		if (!text) return text;
		return text.length > limit ? text.slice(0, limit) + '…' : text;
	}

	async function getHelpPage(fileName: string) {
		const page = await import(`../../docs/help/${fileName}.md`);
		return {
			meta: page.metadata as { title: string },
			ContentPage: page.default as Component
		};
	}

	let loadingFav = $state(true);

	onMount(async () => {
		loadingFav = true;
		const ssrFavorites = page.data.favorites;
		if (Array.isArray(ssrFavorites) && ssrFavorites.length > 0) {
			favoritesStore.items = ssrFavorites;
			loadingFav = false;
			return;
		}
		try {
			const res = await fetch('/api/favorites');
			if (res.ok) {
				const data = await res.json();
				favoritesStore.items = data.favorites;
			}
		} catch {
			// ignore
		} finally {
			loadingFav = false;
		}
	});

	const isFavorited = $derived(favoritesStore.items.some((f) => f.path === page.url.pathname));
	const currentTitle = $derived(page.data.meta?.title || '');

	async function toggleFavorite() {
		if (loadingFav) return;
		const path = page.url.pathname;
		const title = currentTitle;
		if (!title) return;

		try {
			if (isFavorited) {
				const res = await fetch('/api/favorites', {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ path })
				});
				if (res.ok) {
					favoritesStore.items = favoritesStore.items.filter((f) => f.path !== path);
				}
			} else {
				const res = await fetch('/api/favorites', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ path, title })
				});
				if (res.ok) {
					const data = await res.json();
					favoritesStore.items = [...favoritesStore.items, data.favorite];
				}
			}
		} catch {
			// ignore
		}
	}

	async function showHelp() {
		const pathname = page.url.pathname.replace(/\/+$/, '') || '/';
		const fileName = resolveHelpFile(pathname);
		if (!fileName) {
			toast(
				`Tombol ini berfungsi untuk menampilkan petunjuk penggunaan.<br />` +
					`Silahkan klik salah satu menu lalu klik lagi tombol ini.`
			);
			return;
		}
		const result = await getHelpPage(fileName);
		showModal({
			title: result.meta.title,
			body: result.ContentPage,
			dismissible: true
		});
	}
</script>

<div class="navbar bg-base-100 border-base-200 sticky top-0 z-50">
	<div class="flex-none lg:hidden">
		<label for="my-drawer-2" class="btn btn-square btn-ghost drawer-button">
			<span class="text-lg">
				<Icon name="menu-drawer" />
			</span>
		</label>
	</div>

	{#if currentTitle && page.url.pathname !== '/'}
		<button
			class="btn btn-ghost btn-circle shadow-none"
			title={isFavorited ? 'Hapus dari favorit' : 'Tambah ke favorit'}
			onclick={toggleFavorite}
			disabled={loadingFav}
		>
			<span class="text-xl">
				<Icon name="star" class={isFavorited ? 'text-success fill-current' : ''} />
			</span>
		</button>
	{/if}
	<span class="mx-2 flex-1 truncate px-2 text-lg font-bold">{currentTitle}</span>
	<div class="ml-auto flex-none">
		<ul class="flex items-center px-1">
			<!-- tasks modal for mobile -->
			<li>
				<button
					class="btn btn-ghost btn-circle shadow-none xl:hidden"
					aria-label="Daftar Tugas"
					title="Daftar Tugas"
					onclick={() => tasksModalRef?.open()}
				>
					<Icon name="check" class="text-lg" />
				</button>
			</li>

			<!-- Dark Mode -->
			<li>
				<DarkMode />
			</li>

			<!-- Help -->
			<li>
				<button
					class="btn btn-ghost btn-circle shadow-none"
					aria-label="Bantuan"
					title="Petunjuk"
					onclick={showHelp}
				>
					<span class="text-xl">
						<Icon name="question" />
					</span>
				</button>
			</li>

			<!-- Dropdown ganti kelas -->
			<li class="ml-2">
				<div class="dropdown dropdown-end">
					<div
						tabindex="0"
						role="button"
						title="Ganti kelas"
						class="btn btn-soft rounded-full shadow-none"
					>
						<span class="hidden sm:block">{excerpt(kelasAktifLabel, 16)}</span>
						<Icon name="users" class="sm:hidden" />
						<Icon name="select" class="hidden sm:block" />
					</div>
					<ul
						class="border-base-300 menu dropdown-content bg-base-100 ring-opacity-5 z-1 mt-5 mr-1 w-72 origin-top-right rounded-xl border p-4 shadow-xl focus:outline-none"
					>
						<!-- alert akun admin -->
						{#if user?.type === 'admin'}
							<div role="alert" class="alert alert-info mb-4">
								<Icon name="info" />
								<span>Login sebagai <strong>Admin</strong></span>
							</div>
						{:else if user?.type === 'user'}
							<div role="alert" class="alert alert-info mb-4">
								<Icon name="info" />
								<span>
									<strong>{displayUserName}</strong> - Guru Mapel
								</span>
							</div>
						{:else if user?.type === 'wali_asuh'}
							<div role="alert" class="alert alert-info mb-4">
								<Icon name="info" />
								<span>
									<strong>{displayUserName}</strong> - Wali Asuh
								</span>
							</div>
						{/if}

						<div class="flex items-center gap-4">
							<div
								class="bg-base-300 dark:bg-base-200 flex h-14 w-14 items-center justify-center rounded-full"
							>
								<Icon name="user" class="text-4xl" />
							</div>
							<div class="flex flex-col gap-1">
								<!-- Nama wali kelas -->
								<p class="text-base-content text-sm font-semibold">
									{kelasAktif?.waliKelas?.nama ?? 'Belum ada wali kelas'}
								</p>
								<!-- Nama kelas -->
								<p class="text-base-content/70 text-xs">{kelasAktifLabel}</p>
							</div>
						</div>

						{#if daftarKelas.length}
							<details
								class="bg-base-300 dark:bg-base-200 collapse-plus collapse mt-6 rounded-b-none"
							>
								<!-- opsi pindah kelas -->
								<summary class="collapse-title font-semibold">Pindah Kelas</summary>
								<div
									class="border-base-100 flex max-h-[30vh] flex-col overflow-y-auto border-t-3 p-1"
								>
									{#each daftarKelas as kelas (kelas.id)}
										{@const label = kelas.fase ? `${kelas.nama} - ${kelas.fase}` : kelas.nama}
										<a
											class="btn btn-ghost btn-sm justify-start text-left shadow-none"
											href={buildKelasHref(kelas.id)}
											onclick={handleKelasClick}
											class:active={kelasAktif?.id === kelas.id}
										>
											{label}
										</a>
									{/each}
								</div>
							</details>
						{:else}
							<p class="text-base-content/70 mt-6 text-sm">
								Belum ada data kelas yang dapat dipilih.
							</p>
						{/if}

						<li class="mt-1">
							<a class="btn btn-sm rounded-none shadow-none" href="/pengaturan">
								<Icon name="gear" />
								Pengaturan
							</a>
						</li>
						{#if user}{/if}
						<li class="mt-1 flex flex-row">
							<button
								class="btn btn-sm hover:btn-warning flex-1 rounded-tl-none rounded-r-none rounded-bl-lg shadow-none"
								type="button"
								title="Keluar dari aplikasi"
								onclick={logout}
								disabled={loggingOut}
							>
								<Icon name="export" />
								{loggingOut ? 'Keluar…' : 'Keluar'}
							</button>
							<button
								class="btn btn-sm hover:btn-error flex-1 rounded-l-none rounded-tr-none rounded-br-lg shadow-none"
								type="button"
								onclick={stopServer}
								disabled={stoppingServer || !canStopServer}
							>
								<Icon name="power" />
								{stoppingServer ? 'Menghentikan server…' : 'Stop Server'}
							</button>
						</li>
					</ul>
				</div>
			</li>
		</ul>
	</div>
</div>

<!-- Tempel instance modal di bawah navbar dan bind ref -->
<TasksModal bind:this={tasksModalRef} />
