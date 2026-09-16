<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { validatePasswordStrength } from '$lib/password-policy';

	let {
		open = $bindable(false),
		mataPelajaran = [],
		sekolahList = [],
		kelasList = [],
		editUser = null
	} = $props<{
		open?: boolean;
		mataPelajaran?: { id: number; nama: string }[];
		sekolahList?: { id: number; nama: string }[];
		kelasList?: { id: number; nama: string; fase?: string | null; sekolahId: number }[];
		editUser?: {
			id: number;
			username: string;
			pegawaiName?: string | null;
			type?: string;
			sekolahId?: number | null;
			mataPelajaranIds?: number[];
			kelasIds?: number[];
			waliKelasIds?: number[];
		} | null;
	}>();

	const dispatch = createEventDispatcher();

	let nama = $state('');
	let username = $state('');
	let password = $state('');
	let type = $state('user');
	// Multi-mapel: simpan sebagai Set of checked mata pelajaran IDs
	let mataPelajaranIds = $state(new Set<number>());
	// Multi-kelas: simpan sebagai Set of checked kelas IDs
	let kelasIds = $state(new Set<number>());
	let sekolahId = $state<string | number | null>('');
	let initialized = $state(false);
	let showPassword = $state(false);
	let selectAllKelas = $state(false);
	let saving = $state(false);

	const isEditMode = $derived(editUser !== null);
	const modalTitle = $derived(isEditMode ? 'Edit Pengguna' : 'Tambah Pengguna');

	// Derived state
	let uniqueMataPelajaran = $derived.by(() => uniqueByNama(mataPelajaran ?? []));
	let filteredMataPelajaran = $derived.by(() => {
		return uniqueMataPelajaran.filter((m) => {
			const name = (m.nama ?? '').toString().trim().toLowerCase();
			// exclude the exact combined parent subject
			if (name === 'pendidikan agama dan budi pekerti') return false;
			// exclude the exact combined parent subject for Pendalaman Kitab Suci
			if (name === 'pendalaman kitab suci') return false;
			return true;
		});
	});

	let filteredKelasList = $derived.by(() => {
		if (!sekolahId) return kelasList ?? [];
		const sId = Number(sekolahId);
		return (kelasList ?? []).filter((k: { sekolahId?: number | null }) => k.sekolahId === sId);
	});

	// Kelas wali milik user (edit mode) — dipakai untuk badge 'wali' + ringkasan peran gabungan.
	const waliKelasIdSet = $derived(new Set(editUser?.waliKelasIds ?? []));
	const roleHint = $derived.by(() => {
		if (!isEditMode || type !== 'wali_kelas') return '';
		const list = (kelasList ?? []) as {
			id: number;
			nama: string;
			fase?: string | null;
			sekolahId: number;
		}[];
		const waliNames = list.filter((k) => waliKelasIdSet.has(k.id)).map((k) => k.nama);
		const guruNames = list
			.filter((k) => !waliKelasIdSet.has(k.id) && kelasIds.has(k.id))
			.map((k) => k.nama);
		const parts: string[] = [];
		if (waliNames.length) parts.push(`Wali Kelas ${waliNames.join(', ')}`);
		if (guruNames.length) parts.push(`Guru di ${guruNames.join(', ')}`);
		return parts.join(' · ');
	});

	// Validasi: semua field wajib terisi (password optional saat edit, mapel optional untuk non-guru)
	let isValid = $derived.by(() => {
		const hasNama = nama.trim().length > 0;
		const hasUsername = username.trim().length > 0;
		const hasPassword = isEditMode ? true : password.trim().length > 0;
		const hasMapel = type !== 'user' || mataPelajaranIds.size > 0;
		return hasNama && hasUsername && hasPassword && hasMapel;
	});

	function uniqueByNama(list: { id: number; nama: string }[]) {
		const map = new Map<string, { id: number; nama: string }>();
		for (const m of list) {
			// keep the first occurrence for a given nama
			if (!map.has(m.nama)) map.set(m.nama, m);
		}
		return Array.from(map.values());
	}

	// initialize defaults only once when the modal opens (prevent clearing while open)
	$effect(() => {
		if (open && !initialized) {
			if (editUser) {
				nama = editUser.pegawaiName ?? '';
				username = editUser.username ?? '';
				type = editUser.type ?? 'user';
				sekolahId = editUser.sekolahId ?? '';
				mataPelajaranIds = new Set(editUser.mataPelajaranIds ?? []);
				kelasIds = new Set(editUser.kelasIds ?? []);
			} else {
				nama = '';
				username = '';
				type = 'user';
				mataPelajaranIds = new Set<number>();
				kelasIds = new Set<number>();
				sekolahId = '';
			}
			password = '';
			initialized = true;
		}
	});

	// if modal is closed, allow re-initialization next time it opens
	$effect(() => {
		if (!open) {
			initialized = false;
			selectAllKelas = false;
			saving = false;
			kelasIds.clear();
		}
	});

	function toggleSelectAllKelas() {
		selectAllKelas = !selectAllKelas;
		if (selectAllKelas) {
			// Select all visible kelas
			for (const k of filteredKelasList) {
				kelasIds.add(k.id);
			}
		} else {
			// Deselect all kelas
			kelasIds.clear();
		}
		kelasIds = new Set(kelasIds);
	}

	function close() {
		// reset initialized so next open will reinitialize fields
		initialized = false;
		open = false;
		dispatch('cancel');
	}

	function toggleMapel(id: number) {
		if (mataPelajaranIds.has(id)) {
			mataPelajaranIds.delete(id);
		} else {
			mataPelajaranIds.add(id);
		}
		// Trigger reactivity
		mataPelajaranIds = new Set(mataPelajaranIds);
	}

	function toggleKelas(id: number) {
		if (kelasIds.has(id)) {
			kelasIds.delete(id);
		} else {
			kelasIds.add(id);
		}
		// Trigger reactivity
		kelasIds = new Set(kelasIds);
	}

	async function save() {
		if (saving) return;
		if (password.trim()) {
			const passwordError = validatePasswordStrength(password.trim());
			if (passwordError) {
				toast({ message: passwordError, type: 'error' });
				return;
			}
		}
		saving = true;
		const form = new FormData();
		form.set('username', username || '');
		form.set('password', password || '');
		form.set('nama', nama || '');
		form.set('type', type || 'user');
		// Send multiple mapel as JSON array
		form.set('mataPelajaranIds', JSON.stringify(Array.from(mataPelajaranIds)));
		// Send multiple kelas as JSON array
		form.set('kelasIds', JSON.stringify(Array.from(kelasIds)));
		// include sekolahId when provided
		form.set('sekolahId', String(sekolahId ?? ''));

		const endpoint = isEditMode ? '?/update_user' : '?/create_user';
		if (isEditMode) form.set('id', String(editUser!.id));

		try {
			const res = await fetch(endpoint, { method: 'POST', body: form });
			if (res.ok) {
				const body = await res.json().catch(() => ({}));
				const mergedBody = {
					...body,
					username: body.user?.username ?? username,
					displayName: body.displayName ?? nama,
					mataPelajaranIds: body.mataPelajaranIds ?? Array.from(mataPelajaranIds),
					kelasIds: body.kelasIds ?? Array.from(kelasIds),
					user: body.user ?? {
						id: isEditMode ? editUser!.id : Date.now(),
						username: body.user?.username ?? username,
						createdAt: isEditMode ? undefined : new Date().toISOString(),
						type: body.user?.type ?? type,
						passwordUpdatedAt: body.user?.passwordUpdatedAt ?? new Date().toISOString()
					},
					__server_user_returned: Boolean(body.user && typeof body.user.id !== 'undefined')
				};
				toast({
					message: isEditMode ? 'Pengguna diperbarui' : 'Pengguna dibuat',
					type: 'success'
				});
				dispatch('saved', { body: mergedBody });
				open = false;
			} else {
				let msg = isEditMode ? 'Gagal memperbarui pengguna' : 'Gagal membuat pengguna';
				try {
					const parsed = await res.json().catch(() => null);
					if (parsed) {
						const flat = parsed as Record<string, unknown>;
						const data = (flat.data ?? flat) as Record<string, unknown>;
						if (typeof data.message === 'string' && data.message.trim()) msg = data.message;
						else if (
							flat.error &&
							typeof (flat.error as Record<string, unknown>).message === 'string'
						)
							msg = (flat.error as Record<string, unknown>).message as string;
						else msg = JSON.stringify(parsed);
					} else {
						msg = await res.text().catch(() => msg);
					}
				} catch {
					msg = (await res.text().catch(() => msg)) as string;
				}
				toast({
					message: `${isEditMode ? 'Gagal memperbarui' : 'Gagal membuat'}: ${msg}`,
					type: 'error'
				});
			}
		} catch {
			toast({
				message: isEditMode ? 'Gagal memperbarui pengguna' : 'Gagal membuat pengguna',
				type: 'error'
			});
		} finally {
			saving = false;
		}
	}
</script>

{#if open}
	<div class="modal modal-open">
		<div class="modal-box flex max-h-[90vh] max-w-lg flex-col p-4">
			<h3 class="mb-3 text-lg font-bold">{modalTitle}</h3>
			<div class="flex-1 space-y-3 overflow-y-auto px-1">
				<!-- Sekolah -->
				<fieldset class="fieldset">
					<legend class="fieldset-legend">Sekolah</legend>
					<select
						id="add-user-sekolah"
						class="select dark:bg-base-200 w-full truncate dark:border-none"
						bind:value={sekolahId}
						onchange={() => {
							kelasIds.clear();
							selectAllKelas = false;
						}}
					>
						<option disabled selected={sekolahId === ''} value="">Pilih Sekolah</option>
						{#if sekolahList && sekolahList.length}
							{#each sekolahList as s (s.id)}
								<option value={s.id}>{s.nama}</option>
							{/each}
						{:else}
							<option disabled>- tidak ada sekolah -</option>
						{/if}
					</select>
					<p class="label text-wrap">
						Opsional: kaitkan pengguna ke sekolah tertentu sehingga saat login sekolah aktif bisa
						disesuaikan.
					</p>
				</fieldset>

				<!-- Mata Pelajaran Collapse -->
				<div tabindex="0" role="button" class="bg-base-200 border-base-300 collapse-arrow collapse">
					<div class="collapse-title font-semibold">
						Mata Pelajaran {#if mataPelajaranIds.size > 0}
							<span class="badge badge-sm badge-primary">{mataPelajaranIds.size}</span>
						{/if}
					</div>
					<div class="collapse-content text-sm">
						<div class="space-y-3">
							<p class="text-xs opacity-75">Pilih satu atau lebih mata pelajaran yang diajari</p>
							{#if filteredMataPelajaran.length > 0}
								<div class="space-y-2">
									{#each filteredMataPelajaran as m (m.id)}
										<label class="flex cursor-pointer gap-2">
											<input
												type="checkbox"
												class="checkbox checkbox-sm"
												checked={mataPelajaranIds.has(m.id)}
												onchange={() => toggleMapel(m.id)}
											/>
											<span class="text-sm">{m.nama}</span>
										</label>
									{/each}
								</div>
							{:else}
								<p class="text-xs opacity-75">- tidak ada mata pelajaran -</p>
							{/if}
						</div>
					</div>
				</div>

				<!-- Kelas -->
				<div tabindex="0" role="button" class="bg-base-200 border-base-300 collapse-arrow collapse">
					<div class="collapse-title font-semibold">
						Kelas {#if kelasIds.size > 0}
							<span class="badge badge-sm badge-secondary">{kelasIds.size}</span>
						{/if}
					</div>
					<div class="collapse-content text-sm">
						<div class="space-y-3">
							<p class="text-xs opacity-75">Pilih satu atau lebih kelas yang bisa diakses</p>
							{#if filteredKelasList.length > 0}
								<div class="space-y-2">
									<label class="bg-base-300 flex cursor-pointer gap-2 rounded p-2 font-semibold">
										<input
											type="checkbox"
											class="checkbox checkbox-sm"
											checked={selectAllKelas}
											onchange={toggleSelectAllKelas}
										/>
										<span class="text-sm">Pilih Semua</span>
									</label>
									{#each filteredKelasList as k (k.id)}
										<label class="flex cursor-pointer gap-2">
											<input
												type="checkbox"
												class="checkbox checkbox-sm"
												checked={kelasIds.has(k.id)}
												onchange={() => toggleKelas(k.id)}
											/>
											<span class="text-sm"
												>{k.nama}
												{#if k.fase}({k.fase}){/if}
												{#if waliKelasIdSet.has(k.id)}
													<span class="badge badge-sm badge-primary ml-1">wali</span>
												{/if}</span
											>
										</label>
									{/each}
								</div>
							{:else}
								<p class="text-xs opacity-75">- tidak ada kelas -</p>
							{/if}
						</div>
					</div>
				</div>

				<!-- Nama -->
				<fieldset class="fieldset">
					<legend class="fieldset-legend">Nama</legend>
					<input
						id="add-user-nama"
						required
						class="input dark:bg-base-200 w-full dark:border-none"
						bind:value={nama}
						placeholder="Contoh: Bruce Wayne, Bat."
					/>
					<p class="label text-wrap">Nama lengkap pengguna dan gelar (tampil pada daftar)</p>
				</fieldset>

				<!-- Role -->
				<fieldset class="fieldset">
					<legend class="fieldset-legend">Role</legend>
					<select
						id="add-user-role"
						class="select dark:bg-base-200 w-full dark:border-none"
						bind:value={type}
					>
						<option value="admin">Admin</option>
						<option value="kepala_sekolah">Kepala Sekolah</option>
						<option value="wali_kelas">Wali Kelas</option>
						<option value="wali_asuh">Wali Asuh</option>
						<option value="user">Guru</option>
					</select>
					<p class="label text-wrap">Tentukan peran pengguna dalam sistem</p>
					{#if roleHint}
						<p class="label text-wrap font-medium text-info">{roleHint}</p>
					{/if}
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend">Akun</legend>
					<div class="flex flex-col gap-2 sm:flex-row">
						<label class="input validator dark:bg-base-200 w-full dark:border-none">
							<Icon name="user" />
							<input
								id="add-user-username"
								type="text"
								required
								placeholder="Nama pengguna"
								title="Hanya huruf, angka, atau tanda hubung"
								bind:value={username}
							/>
						</label>
						<label class="input validator dark:bg-base-200 w-full dark:border-none">
							<Icon name="lock" />
							<input
								id="add-user-password"
								type={showPassword ? 'text' : 'password'}
								placeholder={isEditMode
									? 'Kata sandi baru (kosongkan jika tidak diubah)'
									: 'Kata sandi'}
								bind:value={password}
							/>
							<button
								type="button"
								class="cursor-pointer"
								onclick={() => (showPassword = !showPassword)}
								aria-label="Lihat atau sembunyikan kata sandi"
							>
								<Icon name={showPassword ? 'eye-off' : 'eye'} />
							</button>
						</label>
					</div>
					<p class="validator-hint hidden">Isi nama pengguna dan kata sandi dulu!</p>
					<p class="label">
						{isEditMode
							? 'Nama pengguna wajib diisi. Kata sandi opsional (kosongkan jika tidak diubah).'
							: 'Nama pengguna dan kata sandi untuk masuk'}
					</p>
				</fieldset>
			</div>

			<div class="modal-action sticky bottom-0 z-10">
				<button
					class="btn btn-soft shadow-none mr-auto"
					type="button"
					onclick={close}
					disabled={saving}><Icon name="close" /> Batal</button
				>
				<button
					class="btn btn-primary shadow-none"
					type="button"
					onclick={save}
					disabled={!isValid || saving}
					><Icon name="save" /> {saving ? 'Menyimpan...' : 'Simpan'}</button
				>
			</div>
		</div>
	</div>
{/if}
