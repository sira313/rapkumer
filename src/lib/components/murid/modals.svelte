<script lang="ts">
	import { page } from '$app/state';
	import { invalidate } from '$app/navigation';
	import Icon from '$lib/components/icon.svelte';
	import DeleteMurid from '../../../routes/(informasi-umum)/murid/[id]/delete/+page.svelte';
	import DetailMurid from '../../../routes/(informasi-umum)/murid/[id]/+page.svelte';
	import FormMurid from '../../../routes/(informasi-umum)/murid/form/[[id]]/+page.svelte';
	import MuridBulkPhotoUploadModal from '$lib/components/murid-bulk-photo-upload-modal.svelte';

	type BulkModalData = {
		type: 'bulk';
		selectedMurids: {
			id: number;
			nama: string;
			nis: string;
			nisn: string;
		}[];
	};

	let {
		formSubmitting,
		submitBulkDelete,
		isBulkPhotoUploadOpen = $bindable(false)
	} = $props<{
		formSubmitting: boolean;
		submitBulkDelete: (event: Event) => void;
		isBulkPhotoUploadOpen?: boolean;
	}>();

	const bulkModalData = $derived.by(() => {
		const modal = page.state.modal;
		if (modal?.name === 'delete-murid' && modal.data?.type === 'bulk') {
			return modal.data as BulkModalData;
		}
		return null;
	});

	function handleBulkPhotoUploadSuccess() {
		console.debug('[MuridModals] Bulk photo upload success');
		invalidate('app:murid');
		isBulkPhotoUploadOpen = false;
	}
</script>

{#if ['add-murid', 'edit-murid'].includes(page.state.modal?.name)}
	<dialog class="modal" open>
		<div class="modal-box p-4 sm:w-full sm:max-w-2xl">
			<FormMurid data={page.state.modal?.data} />
		</div>
	</dialog>
{/if}

{#if page.state.modal?.name === 'detail-murid'}
	<dialog class="modal" onclose={() => history.back()} open>
		<div class="modal-box p-4 sm:w-full sm:max-w-2xl">
			<DetailMurid data={page.state.modal?.data} />
		</div>
		<form method="dialog" class="modal-backdrop">
			<button>close</button>
		</form>
	</dialog>
{/if}

{#if page.state.modal?.name === 'delete-murid'}
	{#if bulkModalData}
		<dialog class="modal" onclose={() => history.back()} open>
			<div class="modal-box">
				<h3 class="mb-4 text-xl font-bold">Hapus data murid terpilih?</h3>
				<p class="mb-2">
					Anda akan menghapus <b>{bulkModalData.selectedMurids.length}</b> murid secara permanen.
				</p>
				<ul class="list-disc space-y-1 pl-5 text-sm">
					{#each bulkModalData.selectedMurids.slice(0, 5) as murid (murid.id)}
						<li>{murid.nama}</li>
					{/each}
				</ul>
				{#if bulkModalData.selectedMurids.length > 5}
					<p class="mt-2 text-sm opacity-70">
						dan {bulkModalData.selectedMurids.length - 5} murid lainnya
					</p>
				{/if}
				<p class="mt-4 text-sm opacity-70">Tindakan ini tidak bisa dibatalkan.</p>
				<div class="modal-action">
					<button class="btn btn-soft shadow-none" type="button" onclick={() => history.back()}>
						<Icon name="close" />
						Batal
					</button>
					<button
						class="btn btn-error btn-soft shadow-none"
						type="button"
						onclick={submitBulkDelete}
						disabled={formSubmitting}
					>
						{#if formSubmitting}
							<div class="loading loading-spinner"></div>
						{:else}
							<Icon name="del" />
						{/if}
						Hapus
					</button>
				</div>
			</div>
			<form method="dialog" class="modal-backdrop">
				<button>close</button>
			</form>
		</dialog>
	{:else}
		<dialog class="modal" onclose={() => history.back()} open>
			<div class="modal-box">
				<DeleteMurid data={page.state.modal?.data} />
			</div>
			<form method="dialog" class="modal-backdrop">
				<button>close</button>
			</form>
		</dialog>
	{/if}
{/if}

<MuridBulkPhotoUploadModal
	bind:isOpen={isBulkPhotoUploadOpen}
	onSuccess={handleBulkPhotoUploadSuccess}
/>
