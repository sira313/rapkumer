<script lang="ts">
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import type { Favorite } from '$lib/stores/favorites.svelte';
	import FavoriteMenusCard from './favorite-menus-card.svelte';

	let dialogEl: HTMLDialogElement;

	const favorites = $derived(
		Array.isArray(page.data.favorites) ? (page.data.favorites as Favorite[]) : []
	);

	onNavigate(() => {
		dialogEl?.close();
	});

	function open() {
		dialogEl?.showModal();
	}
</script>

<div class="fab end-6 bottom-24 md:end-12 md:bottom-6 xl:hidden">
	<button
		type="button"
		class="btn btn-lg btn-circle btn-secondary shadow-lg"
		onclick={open}
		aria-label="Buka menu favorit"
		title="Menu Favorit"
	>
		<Icon name="star" />
	</button>
</div>

<dialog class="modal" bind:this={dialogEl}>
	<div class="modal-box max-w-lg p-0">
		<FavoriteMenusCard {favorites} />
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>
