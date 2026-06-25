<script lang="ts">
	import { showModal, updateModal } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import AlertWarning from '$lib/components/alert-warning.svelte';
	import UsersHeader from '$lib/components/pengguna/UsersHeader.svelte';
	import AddUserModal from '$lib/components/pengguna/AddUserModal.svelte';
	import ExistingUserRow from '$lib/components/pengguna/ExistingUserRow.svelte';

	let { data } = $props();

	// derive user item type from incoming load data to keep typings simple
	type UserItem = typeof data.users extends Array<infer U> ? U : unknown;

	// local reactive users copy so UI updates instantly without full reload
	// extend with local-only fields used for inline add
	interface LocalUser extends UserItem {
		isNew?: boolean;
		nama?: string;
		mataPelajaranId?: number | null;
	}
	let users = $state<LocalUser[]>(data.users ?? []);

	// mata pelajaran for inline-add select
	let mataPelajaran = $state<{ id: number; nama: string }[]>(data.mataPelajaran ?? []);

	// (use global `ModalAction` from `src/lib/components/types.d.ts`)

	// next temporary id for new rows (negative numbers)
	let showAddModal = $state<boolean>(false);

	// selected ids for bulk actions
	let selectedIds = $state<number[]>([]);

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
						let msg = 'Gagal menghapus';
						let parsedBody: unknown = null;
						try {
							parsedBody = await res.json().catch(() => null);
							if (parsedBody && typeof parsedBody === 'object') {
								const pb = parsedBody as Record<string, unknown>;
								if (typeof pb.message === 'string' && pb.message.trim()) msg = pb.message;
								else if (pb.type === 'warning' && typeof pb.message === 'string') msg = pb.message;
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
	function getSelectableIds() {
		// only real existing users (positive ids) are selectable for bulk actions
		return users.map((u) => Number(u.id)).filter((n) => Number.isFinite(n) && n > 0);
	}

	function toggleSelectAll() {
		const selectable = getSelectableIds();
		if (selectable.length === 0) {
			selectedIds = [];
			return;
		}
		const allSelected = selectable.every((id) => selectedIds.indexOf(id) !== -1);
		if (allSelected) selectedIds = [];
		else selectedIds = [...selectable];
	}

	let editingId = $state<number | null>(null);
	let editValues = $state<Record<number, { username: string; password: string }>>({});

	// handle add/new row
	function handleAdd() {
		showAddModal = true;
	}
</script>

<section class="card bg-base-100 rounded-lg border border-none p-6 shadow-md">
	<div class="space-y-4">
		<header class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="space-y-2">
				<h1 class="text-2xl font-bold">Daftar pengguna</h1>
			</div>
			<UsersHeader {selectedIds} {editingId} onDelete={handleDelete} onAdd={handleAdd} />
		</header>
		<div class="overflow-x-auto">
			<table class="table">
				<thead>
					<tr>
						{#if !editingId}
							<th>
								<input
									type="checkbox"
									class="checkbox"
									checked={getSelectableIds().length > 0 &&
										getSelectableIds().every((id) => selectedIds.indexOf(id) !== -1)}
									onclick={() => toggleSelectAll()}
								/>
							</th>
						{/if}
						<th>Nama</th>
						<th>Role</th>
						<th>Username</th>
						<th>Password</th>
						<td>Aksi</td>
					</tr>
				</thead>
				<tbody>
					{#each users as u (u.id)}
						<tr>
							{#if !editingId}
								<td>
									<input
										type="checkbox"
										class="checkbox"
										checked={selectedIds.indexOf(u.id) !== -1}
										onclick={() => toggleSelect(u.id)}
									/>
								</td>
							{/if}

							<ExistingUserRow
								{u}
								{editingId}
								{editValues}
								onToggleEdit={(user: LocalUser) => {
									if (editingId === user.id) {
										editingId = null;
									} else {
										editingId = user.id;
										editValues[user.id] = { username: user.username ?? '', password: '' };
									}
								}}
								onSaveEdit={async (user: LocalUser) => {
									const form = new FormData();
									form.set('id', String(user.id));
									form.set('username', editValues[user.id].username);
									form.set('password', editValues[user.id].password);
									const res = await fetch('?/update_credentials', { method: 'POST', body: form });
									if (res.ok) {
										const body = await res.json().catch(() => ({}));
										toast({ message: 'Perubahan tersimpan', type: 'success' });
										if (body.user) {
											const idx = users.findIndex((x) => x.id === body.user.id);
											if (idx !== -1) {
												users[idx] = {
													...users[idx],
													username: body.user.username ?? users[idx].username,
													passwordUpdatedAt:
														body.user.passwordUpdatedAt ?? users[idx].passwordUpdatedAt
												};
											}
										} else {
											const idx = users.findIndex((x) => x.id === user.id);
											if (idx !== -1) {
												users[idx] = {
													...users[idx],
													username: editValues[user.id].username || users[idx].username,
													passwordUpdatedAt: editValues[user.id].password
														? new Date().toISOString()
														: users[idx].passwordUpdatedAt
												};
											}
										}
										editingId = null;
									} else {
										const text = await res.text().catch(() => 'Gagal');
										toast({ message: `Gagal menyimpan: ${text}`, type: 'error' });
									}
								}}
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

		<AddUserModal
			bind:open={showAddModal}
			{mataPelajaran}
			sekolahList={data.sekolahList ?? []}
			kelasList={data.kelasList ?? []}
			on:saved={(e: CustomEvent) => {
				const body = e.detail?.body ?? {};
				const serverUser = body.user ?? null;
				const newUser = {
					id: serverUser?.id ?? Date.now(),
					username: serverUser?.username ?? body.username ?? 'user',
					createdAt: serverUser?.createdAt ?? new Date().toISOString(),
					type: serverUser?.type ?? 'user',
					pegawaiName: body.displayName || serverUser?.username || (body.username ?? 'user'),
					pegawaiId: null,
					kelasId: null,
					kelasName: null,
					passwordUpdatedAt: serverUser?.passwordUpdatedAt ?? new Date().toISOString(),
					// determine isNew based on whether server actually returned a real id
					isNew: body.__server_user_returned ? false : true
				} as LocalUser;
				users = [newUser, ...users];

				// if server did not return an id (or returned a local fallback), start polling to resolve the created user by username
				if (!body.__server_user_returned) {
					const usernameToFind = newUser.username;
					let attempts = 0;
					const maxAttempts = 10;
					const interval = 500; // ms
					const poll = setInterval(async () => {
						attempts += 1;
						try {
							const resp = await fetch(
								`/api/pengguna/find?username=${encodeURIComponent(usernameToFind)}`
							);
							if (!resp.ok) return;
							const data = await resp.json().catch(() => null);
							if (data && data.found && data.user && data.user.id) {
								// replace temporary id with real id and clear isNew
								users = users.map((u) =>
									u.username === usernameToFind && u.isNew
										? { ...u, id: data.user.id, isNew: false }
										: u
								);
								clearInterval(poll);
							}
						} catch {
							// ignore transient errors
						}
						if (attempts >= maxAttempts) clearInterval(poll);
					}, interval);
				}
			}}
		/>
	</div>
</section>
