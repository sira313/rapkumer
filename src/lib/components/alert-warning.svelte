<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	let { message }: { message: string } = $props();
</script>

<div class="alert alert-warning flex items-start gap-3">
	<Icon name="warning" />
	<div class="flex-1">{@html message}</div>
</div>
