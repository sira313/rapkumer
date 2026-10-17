<script lang="ts">
	import Icon from './icon.svelte';

	const SELECTOR = '[data-scroll-container]';

	let isVisible = $state(false);

	function scrollToTop() {
		const scrollContainer = document.querySelector(SELECTOR) as HTMLElement | null;
		scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function handleScroll() {
		const scrollContainer = document.querySelector(SELECTOR) as HTMLElement | null;
		isVisible = (scrollContainer?.scrollTop ?? 0) > 300;
	}

	// $effect (not $effect.pre): guaranteed to run after the layout DOM exists,
	// so the scroll container is always found on initial mount.
	$effect(() => {
		const scrollContainer = document.querySelector(SELECTOR);
		if (!scrollContainer) return;
		scrollContainer.addEventListener('scroll', handleScroll);
		return () => scrollContainer.removeEventListener('scroll', handleScroll);
	});
</script>

{#if isVisible}
	<div class="fab end-6 md:end-12 bottom-24 xl:bottom-6">
		<button
			type="button"
			class="btn btn-lg btn-circle btn-primary"
			onclick={scrollToTop}
			aria-label="Scroll ke atas"
		>
			<Icon name="up" />
		</button>
	</div>
{/if}
