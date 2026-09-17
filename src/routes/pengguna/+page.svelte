<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- edit/add links to dedicated form pages are intentional */
	import { goto } from '$app/navigation';
	import { showModal, updateModal } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import AlertWarning from '$lib/components/alert-warning.svelte';
	import UsersHeader from '$lib/components/pengguna/UsersHeader.svelte';
	import ExistingUserRow from '$lib/components/pengguna/ExistingUserRow.svelte';

	let { data } = $props();

	// local reactive users copy so UI updates instantly without full reload
	// base shape mirrors load's users (never hardcode) + local-only fields
	type LocalUser = (typeof data.users)[number] & {
		roles: string[];
		isNew?: boolean;
		mataPelajaranIds?: number[];
		kelasIds?: number[];
		waliKelasIds?: number[];
	};
	// svelte-ignore state_referenced_locally
	let users = $state<LocalUser[]>(data.users ?? []);

	// (use global `ModalAction` from `src/lib/components/types.d.ts`)

	// selected ids for bulk actions
	let selectedIds = $state<number[]>([]);

	// selectable ids derived once per render (positive existing user ids)
	let selectableIds = $derived(
		users.map((u) => Number(u.id)).filter((n) => Number.isFinite(n) && n > 0)
	);

	function toggleSelect(id: number) {
		const idx = selectedIds.indexOf(id);
		if (idx === -1) selectedIds = [...selectedIds, id];
		else selectedIds = selectedIds.filter((x) => x !== id);
	}

	async function handleDelete() {
		// reuse the shared delete modal logic for the currently selected ids
		openDeleteModalForIds(selectedIds);
	}
	// open delete modal for given ids (reused by bulk and single-user delete)
	function openDeleteModalForIds(ids: number[]) {
		const selectedUsers = users.filter((u) => ids.indexOf(u.id as number) !== -1);
		const hasWali = selectedUsers.some((u) => {
			const type = (u as { type?: string }).type;
			return type === 'wali_kelas' || type === 'wali_asuh';
		});

		if (hasWali) {
			showModal({
				title: 'Hapus pengguna',
				body: AlertWarning,
				bodyProps: {
					message:
						'Tidak dapat menghapus karena satu atau lebih pengguna terpilih berperan sebagai Wali Kelas atau Wali Asuh. Untuk menggantinya, klik tombol <strong>Atur Data Kelas</strong>'
				},
				onPositive: {
					label: 'Atur Data Kelas',
					icon: 'edit',
					action: ({ close }: { close: () => void }) => {
						close();
						window.location.href = '/kelas';
					}
				},
				onNegative: { label: 'Batal', icon: 'close' },
				dismissible: true
			});
			return;
		}

		showModal({
			title: 'Hapus pengguna',
			body: `Yakin ingin menghapus ${ids.length} pengguna yang dipilih?`,
			onPositive: {
				label: 'Hapus',
				icon: 'del',
				action: async ({ close }: { close: () => void }) => {
					const idsToDelete = ids.filter((n) => n > 0);
					if (!idsToDelete.length) {
						toast({ message: 'Tidak ada pengguna valid untuk dihapus', type: 'error' });
						return;
					}
					const form = new FormData();
					form.set('ids', idsToDelete.join(','));
					const res = await fetch('?/delete_users', { method: 'POST', body: form });
					if (res.ok) {
						await res.json().catch(() => ({}));
						users = users.filter((x) => !idsToDelete.includes(x.id as number));
						selectedIds = selectedIds.filter((n) => !idsToDelete.includes(n));
						users = [...users];
						toast({
							message: `Berhasil menghapus ${idsToDelete.length} pengguna`,
							type: 'success'
						});
						close();
					} else {
						let msg: string;
						let parsedBody: unknown = null;
						try {
							parsedBody = await res.json().catch(() => null);
							if (parsedBody && typeof parsedBody === 'object') {
								const pb = parsedBody as Record<string, unknown>;
								if (typeof pb.message === 'string' && pb.message.trim()) msg = pb.message;
								else if (
									pb.error &&
									typeof (pb.error as Record<string, unknown>).message === 'string'
								)
									msg = (pb.error as Record<string, unknown>).message as string;
								else msg = JSON.stringify(pb);
							} else {
								const text = await res.text().catch(() => 'Gagal');
								msg = text;
							}
						} catch {
							const text = await res.text().catch(() => 'Gagal');
							msg = text;
						}
						if (!msg.trim()) msg = 'Gagal menghapus';
						try {
							if (
								parsedBody &&
								typeof parsedBody === 'object' &&
								(parsedBody as Record<string, unknown>).type === 'warning' &&
								typeof (parsedBody as Record<string, unknown>).message === 'string'
							) {
								const pb = parsedBody as Record<string, unknown>;
								const escapeHtml = (s: string) =>
									s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
								const safe = escapeHtml(pb.message as string);
								updateModal({
									title: 'Hapus pengguna',
									body: AlertWarning,
									bodyProps: { message: safe },
									onPositive: {
										label: 'Atur Wali Kelas',
										icon: 'key',
										action: ({ close: c }: { close: () => void }) => {
											c();
											window.location.href = '/kelas';
										}
									},
									onNegative: { label: 'Tutup', icon: 'close' },
									dismissible: true
								});
								return;
							}
						} catch {
							// ignore
						}
						toast({ message: msg, type: 'warning' });
					}
				}
			},
			onNegative: { label: 'Batal', icon: 'close' },
			dismissible: true
		});
	}
	function toggleSelectAll() {
		if (selectableIds.length === 0) {
			selectedIds = [];
			return;
		}
		const allSelected = selectableIds.every((id) => selectedIds.indexOf(id) !== -1);
		if (allSelected) selectedIds = [];
		else selectedIds = [...selectableIds];
	}

	// handle add/new row
	function handleAdd() {
		goto('/pengguna/form');
	}

	function handleEdit(user: LocalUser) {
		goto(`/pengguna/form/${user.id}`);
	}
</script>

<section class="card bg-base-100 rounded-lg border border-none p-6 shadow-md">
	<div class="space-y-4">
		<header class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="space-y-2">
				<h1 class="text-2xl font-bold">Daftar pengguna</h1>
			</div>
			<UsersHeader {selectedIds} onDelete={handleDelete} onAdd={handleAdd} />
		</header>
		<div class="overflow-x-auto">
			<table class="table">
				<thead>
					<tr>
						<th>
							<input
								type="checkbox"
								class="checkbox"
								checked={selectableIds.length > 0 &&
									selectableIds.every((id) => selectedIds.indexOf(id) !== -1)}
								onclick={() => toggleSelectAll()}
							/>
						</th>
						<th>Nama</th>
						<th>Role</th>
						<th>Nama Pengguna</th>
						<th>Aksi</th>
						<th>Hak Akses</th>
					</tr>
				</thead>
				<tbody>
					{#each users as u (u.id)}
						<tr>
							<td>
								<input
									type="checkbox"
									class="checkbox"
									checked={selectedIds.indexOf(u.id) !== -1}
									onclick={() => toggleSelect(u.id)}
								/>
							</td>

							<ExistingUserRow
								{u}
								onEdit={handleEdit}
								onOpenUser={(user: LocalUser) => {
									window.location.href = '/pengguna/' + user.id;
								}}
								onDelete={(user: LocalUser) => openDeleteModalForIds([Number(user.id)])}
							/>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</section>
