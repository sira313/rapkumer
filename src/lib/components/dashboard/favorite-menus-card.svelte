<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
	import { favoritesStore, type Favorite } from '$lib/stores/favorites.svelte';

	let { favorites = [] }: { favorites: Favorite[] } = $props();

	let editing = $state(false);

	onMount(() => {
		if (favoritesStore.items.length === 0 && favorites.length > 0) {
			favoritesStore.items = favorites;
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

<div class="card bg-base-100 rounded-box shadow-md dark:border-none">
	<div class="card-body">
		<div class="flex items-center justify-between">
			<h2 class="card-title">Menu Favorit</h2>
			{#if favoritesStore.items.length > 0}
				<button
					class="btn btn-ghost btn-square btn-sm shadow-none"
					title={editing ? 'Selesai' : 'Edit'}
					onclick={() => (editing = !editing)}
				>
					<Icon name={editing ? 'check' : 'edit'} />
				</button>
			{/if}
		</div>

		{#if favoritesStore.items.length === 0}
			<p class="text-base-content/70 text-sm">
				Belum ada menu favorit. Klik bintang di navbar untuk menambahkan.
			</p>
		{:else}
			<div class="max-h-48 overflow-y-auto">
				<ul class="divide-base-300 divide-y">
					{#each favoritesStore.items as fav (fav.id)}
						<li class="flex items-center gap-2 py-2">
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
</div>
