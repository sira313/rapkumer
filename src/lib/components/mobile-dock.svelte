<script lang="ts">
	import { onNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import Menu from '$lib/components/menu.svelte';
	import { createDockItem, dockDefaultsByType, type DockMenuItem } from '$lib/components/menu';
	import { isPathHiddenForUser } from '$lib/components/menu-access';
	import { favoritesStore } from '$lib/stores/favorites.svelte';
	import type { StorageState } from '$lib/state.svelte';

	let { menuExpanded }: { menuExpanded: StorageState<boolean> } = $props();

	/**
	 * Mobile-only navigation (below the `md` breakpoint).
	 *
	 * The drawer is a poor fit on phones, so small screens get a bottom dock:
	 * dashboard + up to three pinned favorites + a "Menu" slot that opens the
	 * full menu as a bottom sheet. The sheet reuses <Menu />, so every page
	 * stays reachable no matter how few dock slots are available.
	 * From `md` upwards the navbar hamburger + drawer take over again.
	 */

	let sheetEl: HTMLDialogElement | null = $state(null);
	let sheetOpen = $state(false);
	let search = $state('');

	const user = $derived(page.data.user ?? null);

	const access = $derived({
		user,
		kelasAktifId: page.data.kelasAktif?.id ?? null,
		presensiGuruEnabled: page.data.presensiGuruEnabled ?? true
	});

	// Favorites are fetched once per page load by <Navbar> into the shared store.
	const favoriteSlots = $derived.by<DockMenuItem[]>(() =>
		favoritesStore.items
			.filter((fav) => !isPathHiddenForUser(fav.path, access))
			.map((fav) => createDockItem(fav.path, fav.title))
			.filter((item) => item.path !== '/')
			.slice(0, 3)
	);

	const slots = $derived.by<DockMenuItem[]>(() => {
		const source = favoriteSlots.length
			? favoriteSlots
			: (dockDefaultsByType[user?.type ?? 'user'] ?? dockDefaultsByType.user).filter(
					(item) => !isPathHiddenForUser(item.path, access)
				);
		const seen = new Set<string>(['/']);
		const unique: DockMenuItem[] = [];
		for (const item of source) {
			if (seen.has(item.path)) continue;
			seen.add(item.path);
			unique.push(item);
		}
		return unique.slice(0, 3);
	});

	function isActive(path: string): boolean {
		const current = page.url.pathname.replace(/\/+$/, '') || '/';
		const target = path.replace(/\/+$/, '') || '/';
		if (target === '/') return current === '/';
		return current === target || current.startsWith(target + '/');
	}

	function openSheet() {
		sheetOpen = true;
		sheetEl?.showModal();
	}

	function closeSheet() {
		sheetOpen = false;
		sheetEl?.close();
		// Start from a clean list next time the sheet opens.
		search = '';
	}

	// If the viewport grows past `md` while the sheet is open, the dialog is
	// hidden by CSS but stays in the top layer and keeps trapping focus.
	$effect(() => {
		if (typeof window === 'undefined') return;
		const wide = window.matchMedia('(min-width: 768px)');
		const onChange = () => {
			if (wide.matches) closeSheet();
		};
		wide.addEventListener('change', onChange);
		return () => wide.removeEventListener('change', onChange);
	});

	// The layout survives soft navigation, so the sheet would otherwise stay
	// open on top of the target page (same reason the drawer is closed there).
	onNavigate(closeSheet);
</script>

{#if user}
	<nav class="dock z-40 md:hidden">
		<a
			href={resolve('/')}
			class:dock-active={isActive('/')}
			aria-current={isActive('/') ? 'page' : undefined}
			title="Dashboard"
		>
			<Icon name="grid" class="size-6" />
			<span class="dock-label">Beranda</span>
		</a>

		{#each slots as slot (slot.path)}
			<a
				href={resolve(slot.path as '/')}
				class:dock-active={isActive(slot.path)}
				aria-current={isActive(slot.path) ? 'page' : undefined}
				title={slot.title}
			>
				<Icon name={slot.icon} class="size-6" />
				<span class="dock-label">{slot.label}</span>
			</a>
		{/each}

		<button
			type="button"
			class:dock-active={sheetOpen}
			onclick={openSheet}
			aria-label="Buka menu lengkap"
			aria-haspopup="dialog"
			aria-expanded={sheetOpen}
			title="Menu"
		>
			<Icon name="menu-drawer" class="size-6" />
			<span class="dock-label">Menu</span>
		</button>
	</nav>

	<dialog
		bind:this={sheetEl}
		class="modal modal-bottom md:hidden"
		aria-label="Menu aplikasi"
		onclose={() => {
			// Covers Escape and backdrop dismissals too, which don't go through
			// closeSheet(): reset the state and start from a clean list next time.
			sheetOpen = false;
			search = '';
		}}
	>
		<div
			class="modal-box bg-base-100 flex max-h-[85dvh] w-full max-w-none flex-col rounded-b-none p-0"
		>
			<div class="border-base-300 flex shrink-0 items-center gap-2 border-b p-4">
				{#if page.data.meta?.logoUrl}
					<img class="h-7 rounded" src={page.data.meta.logoUrl} alt="Logo" />
				{/if}
				<a href={resolve('/')} onclick={closeSheet} class="flex-1 text-lg font-bold"> Dashboard </a>
				<button
					type="button"
					class="btn btn-ghost btn-square btn-sm shadow-none"
					onclick={closeSheet}
					aria-label="Tutup menu"
					title="Tutup"
				>
					<Icon name="close" />
				</button>
			</div>

			<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
				<ul class="menu w-full p-0">
					<Menu bind:search showToolbar={false} expanded={menuExpanded} />

					<li class="menu-title mt-2 border-base-300 border-t pt-3">Lainnya</li>
					<li>
						<a href={resolve('/pengaturan')} onclick={closeSheet}>
							<Icon name="gear" />
							<span>Pengaturan</span>
						</a>
					</li>
					<li>
						<a href={resolve('/tentang')} onclick={closeSheet}>
							<Icon name="info" />
							<span>Tentang Aplikasi</span>
						</a>
					</li>
				</ul>
			</div>

			<!-- Sticky toolbar: search + expand/collapse stay put while the menu scrolls. -->
			<div
				class="border-base-300 bg-base-100 flex shrink-0 gap-1 border-t p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
			>
				<label class="input bg-base-200 dark:bg-base-300 rounded-box dark:border-none flex-1">
					<Icon name="search" />
					<input
						type="search"
						class="grow"
						bind:value={search}
						placeholder="Cari menu"
						aria-label="Cari menu"
					/>
				</label>
				<label
					class="btn swap btn-square rounded-box shadow-none"
					title={menuExpanded.value ? 'Sempitkan menu' : 'Luaskan menu'}
				>
					<input type="checkbox" bind:checked={menuExpanded.value} />
					<span class="swap-on"><Icon name="expand-all" /></span>
					<span class="swap-off"><Icon name="collapse-all" /></span>
				</label>
			</div>
		</div>

		<form method="dialog" class="modal-backdrop">
			<button>Tutup</button>
		</form>
	</dialog>
{/if}
