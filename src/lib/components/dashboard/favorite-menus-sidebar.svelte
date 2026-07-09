<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
	import { favoritesStore } from '$lib/stores/favorites.svelte';

	let open = $state(true);
	let editing = $state(false);

	onMount(async () => {
		if (favoritesStore.items.length === 0) {
			try {
				const res = await fetch('/api/favorites');
				if (res.ok) {
					const data = await res.json();
					favoritesStore.items = data.favorites ?? [];
				}
			} catch {
				// ignore
			}
		}
	});

	async function removeFavorite(id: number) {
		const fav = favoritesStore.items.find((f) => f.id === id);
		if (!fav) return;
		try {
			const res = await fetch('/api/favorites', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: fav.path })
			});
			if (res.ok) {
				favoritesStore.items = favoritesStore.items.filter((f) => f.id !== id);
			}
		} catch {
			// ignore
		}
	}
</script>

<div class="hidden xl:block">
	<div class="card bg-base-100 rounded-box mb-4 max-w-70 min-w-70 shadow-md">
		<div class="p-4">
			<div class="flex flex-row items-center gap-2">
				<h2 class="text-sm font-bold">Menu Favorit</h2>
				<div class="flex-1"></div>
				<div class="join">
					{#if favoritesStore.items.length > 0}
						<button
							type="button"
							class="btn btn-sm join-item shadow-none"
							onclick={() => (editing = !editing)}
							title={editing ? 'Selesai' : 'Edit'}
						>
							<Icon name={editing ? 'check' : 'edit'} />
						</button>
					{/if}
					<button
						type="button"
						class="btn btn-sm join-item px-2 shadow-none"
						onclick={() => (open = !open)}
						title={open ? 'Tutup menu favorit' : 'Buka menu favorit'}
					>
						<Icon name={open ? 'up' : 'down'} />
					</button>
				</div>
			</div>
		</div>
		{#if open}
			<div class="p-0">
				{#if favoritesStore.items.length === 0}
					<div class="text-base-content/60 px-4 pb-4 text-sm">
						Belum ada menu favorit. Klik bintang di navbar untuk menambahkan.
					</div>
				{:else}
					<div class="max-h-48 overflow-y-auto">
						<ul class="divide-base-200 divide-y">
							{#each favoritesStore.items as fav (fav.id)}
								<li class="flex items-center gap-2 px-4 py-2">
									<Icon name="star" class="text-success shrink-0" />
									<a href={fav.path} class="hover:text-primary flex-1 text-sm">{fav.title}</a>
									{#if editing}
										<button
											class="btn btn-ghost btn-square btn-xs text-error shadow-none"
											title="Hapus"
											onclick={() => removeFavorite(fav.id)}
										>
											<Icon name="del" />
										</button>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
