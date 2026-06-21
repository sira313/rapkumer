<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- layout contains many intentional href links for navigation */
	import { page } from '$app/state';
	import { invalidate } from '$app/navigation';
	import GlobalModal, { showModal } from '$lib/components/global-modal.svelte';
	import Icon from '$lib/components/icon.svelte';
	import Menu from '$lib/components/menu.svelte';
	import Navbar from '$lib/components/navbar.svelte';
	import Task from '$lib/components/tasks.svelte';
	import KodeKegiatan from '$lib/components/jadwal-bell/kode-kegiatan.svelte';
	import TambahKegiatanModal from '$lib/components/jadwal-bell/tambah-kegiatan-modal.svelte';
	import Toast, { toast } from '$lib/components/toast.svelte';
	import { jadwalIsEditing } from '$lib/stores/jadwal-edit';
	import { get } from 'svelte/store';

	import NavIndicator from '$lib/components/nav-indicator.svelte';
	import ScrollToTop from '$lib/components/scroll-to-top.svelte';
	import '../app.css';

	let { data, children } = $props();

	const appName = 'Rapkumer';
	let stoppingServer = $state(false);
	let loggingOut = $state(false);
	const isLoginPage = $derived(page.url.pathname === '/login');
	let isJadwalPage = $derived(page.url.pathname === '/akademik/jadwal-pelajaran');
	const jadwalCanManage = $derived(
		((page.data.user as { permissions?: string[] })?.permissions ?? []).includes('rapor_manage')
	);

	async function handleHapusKegiatan(kode: string) {
		if (!jadwalCanManage || !get(jadwalIsEditing)) return;
		const formData = new FormData();
		formData.append('kode', kode);

		try {
			const res = await fetch('?/hapusKegiatan', {
				method: 'POST',
				body: formData,
				redirect: 'error'
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ fail: 'Gagal menghapus kegiatan' }));
				throw new Error(err.fail ?? `Error ${res.status}`);
			}

			toast('Kegiatan berhasil dihapus', 'success');
			await invalidate('app:jadwal-bell');
		} catch (e) {
			toast(e instanceof Error ? e.message : 'Gagal menghapus kegiatan', 'error');
		}
	}

	function openEditKegiatan(kegiatan: { kode: string; nama: string; durasi: number | null }) {
		let actions: { submit: () => Promise<void>; cancel: () => void };
		showModal({
			title: 'Edit Kegiatan',
			body: TambahKegiatanModal,
			bodyProps: {
				onAction: (a: typeof actions) => {
					actions = a;
				},
				existingKegiatan: kegiatan
			},
			onPositive: {
				label: 'Simpan',
				action: () => actions!.submit()
			},
			onNegative: { label: 'Batal' },
			dismissible: false
		});
	}

	const readonlyRoutes = [
		'/murid',
		'/kokurikuler',
		'/ekstrakurikuler',
		'/keasramaan',
		'/asesmen-kokurikuler',
		'/nilai-ekstrakurikuler',
		'/asesmen-keasramaan',
		'/absen',
		'/catatan-wali-kelas',
		'/keputusan',
		'/cetak'
	];

	const isReadonlyPage = $derived(
		readonlyRoutes.some((r) => page.url.pathname === r || page.url.pathname.startsWith(r + '/'))
	);

	const userIsGuruMapel = $derived(data.user?.type === 'user' && data.hasMataPelajaran);
	const isAbsenPage = $derived(page.url.pathname.startsWith('/absen'));

	const disableInteraction = $derived(
		data.user?.type === 'user' && isReadonlyPage && !(isAbsenPage && userIsGuruMapel)
	);

	async function stopServer() {
		if (stoppingServer) return;
		stoppingServer = true;

		const showSuccess = () =>
			toast({
				message:
					'Server dihentikan. Tutup jendela Rapkumer ini lalu jalankan ulang bila diperlukan.',
				type: 'info',
				persist: true
			});

		try {
			const response = await fetch('/api/runtime/stop', { method: 'POST', keepalive: true });
			if (response.ok) {
				showSuccess();
			} else {
				const details = await response.text().catch(() => '');
				console.error('Gagal menghentikan server', response.status, details);
				toast({ message: 'Gagal menghentikan server. Coba lagi.', type: 'error' });
			}
		} catch (error) {
			console.warn(
				'Permintaan stop server berakhir sebelum respons diterima. Diasumsikan berhasil.',
				error
			);
			showSuccess();
		} finally {
			stoppingServer = false;
		}
	}

	async function logout() {
		if (loggingOut) return;
		loggingOut = true;

		try {
			const response = await fetch('/logout', { method: 'POST' });
			if (response.redirected) {
				window.location.href = response.url;
				return;
			}

			if (response.ok) {
				window.location.href = '/login';
				return;
			}

			console.error('Gagal logout', response.status, await response.text().catch(() => ''));
			toast({ message: 'Gagal keluar. Coba lagi.', type: 'error' });
		} catch (error) {
			console.error('Gagal logout', error);
			toast({ message: 'Gagal keluar. Coba lagi.', type: 'error' });
		} finally {
			loggingOut = false;
		}
	}
</script>

<svelte:head>
	<script>
		(function () {
			try {
				var stored = localStorage.getItem('dark-mode');
				var theme;
				if (stored === 'dark' || stored === 'light') {
					theme = stored;
				} else if (stored === 'true' || stored === 'false') {
					theme = stored === 'true' ? 'dark' : 'light';
				} else if (stored) {
					try {
						var parsed = JSON.parse(stored);
						theme = parsed ? 'dark' : 'light';
					} catch (err) {
						theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
					}
				} else {
					theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
				}
				document.documentElement.setAttribute('data-theme', theme);
			} catch (e) {
				console.error('failed initialize dark mode:', e);
			}
		})();
	</script>
	<title>{appName}{page.data.meta.title ? ' - ' + page.data.meta.title : ''}</title>
</svelte:head>

{#if isLoginPage}
	<div class="bg-base-200 flex min-h-screen flex-col items-center justify-center p-6">
		{@render children()}
	</div>
{:else}
	<main class="drawer lg:drawer-open">
		<input id="my-drawer-2" type="checkbox" class="drawer-toggle" />
		<div class="drawer-content flex min-h-screen flex-col">
			<Navbar {stopServer} {stoppingServer} {logout} {loggingOut} />

			<div
				class="bg-base-300 dark:bg-base-200 dark:border-base-200 border-base-300 flex flex-1 flex-col border lg:mr-2 lg:mb-2 lg:rounded-xl"
			>
				<div
					class="max-h-[calc(100vh-4.2rem)] min-h-[calc(100vh-4.2rem)] max-w-none overflow-y-auto md:max-h-[calc(100vh-4.6rem)] md:min-h-[calc(100vh-4.6rem)]"
				>
					<div class="m-4 flex flex-row xl:gap-4">
						<div class="w-full max-w-7xl min-w-0 flex-1">
							<ScrollToTop />
							<div class={disableInteraction ? 'is-readonly' : ''}>
								{@render children()}
							</div>
						</div>
						<div class="sticky top-4 self-start">
							<Task variant="sidebar" />
							{#if isJadwalPage && page.data.daftarKodeMapel}
								<section
									class="card bg-base-100 hidden max-w-70 min-w-70 rounded-lg border border-none p-4 shadow-md xl:block"
								>
									<h3 class="mb-3 text-sm font-bold">Kode Kegiatan</h3>
									<KodeKegiatan
										kodeMapel={page.data.daftarKodeMapel as string[]}
										kodeTambahan={['UPB', 'IST', 'PLG']}
										kodeKokurikuler={(page.data.daftarKodeKokurikuler as string[]) ?? []}
										kegiatanCustom={(page.data.kegiatanCustom as Array<{
											kode: string;
											nama: string;
											durasi: number | null;
										}>) ?? []}
										canManage={jadwalCanManage && $jadwalIsEditing}
										onHapusKegiatan={handleHapusKegiatan}
										onEditKegiatan={openEditKegiatan}
									/>
								</section>
							{/if}
						</div>
					</div>
				</div>
			</div>
		</div>
		<div class="drawer-side">
			<label for="my-drawer-2" aria-label="close sidebar" class="drawer-overlay"></label>
			<ul class="menu bg-base-100 text-base-content min-h-full w-70 p-4">
				<div class="mt-16 flex items-center gap-2 pb-4 lg:mt-1">
					{#if data.meta?.logoUrl}
						<img class="h-8 rounded" src={data.meta.logoUrl} alt="Brand logo" />
					{/if}
					<a href="/"><h2 class="mb-2 text-xl font-bold">Dashboard</h2></a>
				</div>

				<Menu />

				<div class="mt-4 flex flex-col gap-3">
					<a href="/pengaturan" class="flex items-center gap-2">
						<Icon name="gear" />
						<h2 class="font-bold">Pengaturan</h2>
					</a>
					<a href="/tentang" class="flex items-center gap-2">
						<Icon name="info" />
						<h2 class="font-bold">Tentang Aplikasi</h2>
					</a>
				</div>
			</ul>
		</div>
	</main>
{/if}

<Toast />
<GlobalModal />
<NavIndicator />

<style>
	:global(
		.is-readonly :is(button, input, select, textarea, a, [role='button']):not(.pointer-events-auto)
	) {
		opacity: var(--btn-disabled-opacity, 0.5) !important;
		cursor: not-allowed !important;
		pointer-events: none !important;
	}
</style>
