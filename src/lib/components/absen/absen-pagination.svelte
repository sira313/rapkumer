<script lang="ts">
	let {
		pages,
		currentPage,
		onPageClick
	}: {
		pages: number[];
		currentPage: number;
		onPageClick: (page: number) => void;
	} = $props();
</script>

<div class="join mt-4 sm:mx-auto">
	{#each pages as pageNumber (pageNumber)}
		<button
			type="button"
			class="join-item btn pointer-events-auto"
			class:btn-active={pageNumber === currentPage}
			onclick={() => onPageClick(pageNumber)}
			aria-current={pageNumber === currentPage ? 'page' : undefined}
		>
			{pageNumber}
		</button>
	{/each}
</div>
