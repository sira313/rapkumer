<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import ImportDatabaseModal from '$lib/components/modals/import-database-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';

	import { page } from '$app/state';

	// single permission to manage dashboard quick actions
	let canDashboardManage = $derived.by(() => {
		const perms = (page.data.user ?? { permissions: [] }).permissions ?? [];
		return (perms as string[]).includes('dashboard_manage');
	});

	let downloadingBackup = $state(false);

	const handleExportInfo = () => {
		showModal({
			title: 'Export Dapodik',
			body: 'Fitur belum tersedia, masih dalam tahap pengembangan.',
			dismissible: true,
			onPositive: {
				label: 'Mengerti',
				action: ({ close }) => close()
			}
		});
	};

	const handleBackupDownload = async () => {
		if (typeof window === 'undefined' || downloadingBackup) return;
		downloadingBackup = true;

		try {
			const response = await fetch('/api/database/backup');
			if (!response.ok) {
				const errorText = (await response.text()) || 'Gagal mengunduh backup database.';
				toast(errorText, 'error');
				return;
			}

			const blob = await response.blob();
			let filename = 'rapkumer-backup.sqlite3';
			const disposition = response.headers.get('content-disposition');
			const matched = disposition?.match(/filename="?([^";]+)"?/i);
			if (matched?.[1]) {
				filename = matched[1];
			} else {
				const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
				filename = `rapkumer-backup-${timestamp}.sqlite3`;
			}

			const blobUrl = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			document.body.appendChild(anchor);
			anchor.href = blobUrl;
			anchor.download = filename;
			anchor.click();
			document.body.removeChild(anchor);
			URL.revokeObjectURL(blobUrl);
			toast('Backup database berhasil diunduh.', 'success');
		} catch (error) {
			console.error(error);
			toast('Gagal mengunduh backup database.', 'error');
		} finally {
			downloadingBackup = false;
		}
	};

	const handleImport = () => {
		showModal({
			title: 'Import Database',
			body: ImportDatabaseModal,
			dismissible: true
		});
	};
</script>

<div class="card bg-base-100 rounded-box shadow-md">
	<div class="card-body">
		<h2 class="card-title mb-4">
			<span class="text-xl">
				<Icon name="gear" />
			</span>
			Tindakan Cepat
		</h2>
		<div class="grid grid-cols-1 gap-2">
			<button
				type="button"
				onclick={() => (canDashboardManage ? handleExportInfo() : undefined)}
				class="btn btn-primary w-full shadow-none"
				disabled={!canDashboardManage}
				aria-disabled={!canDashboardManage}
				title={!canDashboardManage ? 'Anda tidak memiliki izin untuk melakukan tindakan cepat' : ''}
			>
				<Icon name="export" />
				Export Dapodik
			</button>
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
				<button
					type="button"
					onclick={() => (canDashboardManage ? handleBackupDownload() : undefined)}
					class="btn btn-outline btn-accent w-full shadow-none"
					disabled={downloadingBackup || !canDashboardManage}
					aria-disabled={!canDashboardManage}
					aria-busy={downloadingBackup}
					title={!canDashboardManage
						? 'Anda tidak memiliki izin untuk melakukan tindakan cepat'
						: ''}
				>
					{#if downloadingBackup}
						<span class="loading loading-spinner loading-sm"></span>
					{:else}
						<Icon name="database" />
					{/if}
					<span>{downloadingBackup ? 'Mengunduh…' : 'Backup Data'}</span>
				</button>
				<button
					type="button"
					onclick={() => (canDashboardManage ? handleImport() : undefined)}
					class="btn btn-outline btn-accent w-full shadow-none"
					disabled={!canDashboardManage}
					aria-disabled={!canDashboardManage}
					title={!canDashboardManage
						? 'Anda tidak memiliki izin untuk melakukan tindakan cepat'
						: ''}
				>
					<Icon name="import" />
					Import Data
				</button>
			</div>
		</div>
		<p class="mt-4 text-xs text-gray-400">
			Pastikan semua data sudah terisi lengkap sebelum melakukan export.
		</p>
	</div>
</div>
