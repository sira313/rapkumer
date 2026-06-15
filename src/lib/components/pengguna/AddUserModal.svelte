<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';

	let {
		open = $bindable(false),
		mataPelajaran = [],
		sekolahList = [],
		kelasList = []
	} = $props<{
		open?: boolean;
		mataPelajaran?: { id: number; nama: string }[];
		sekolahList?: { id: number; nama: string }[];
		kelasList?: { id: number; nama: string; fase?: string | null; sekolahId: number }[];
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

	// Validasi: semua field wajib terisi
	let isValid = $derived.by(() => {
		const hasNama = nama.trim().length > 0;
		const hasUsername = username.trim().length > 0;
		const hasPassword = password.trim().length > 0;
		const hasMapel = mataPelajaranIds.size > 0;
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
			nama = '';
			username = '';
			password = '';
			type = 'user';
			// Clear multi-mapel selection
			mataPelajaranIds = new Set<number>();
			// Clear multi-kelas selection
			kelasIds = new Set<number>();
			sekolahId = '';
			initialized = true;
		}
	});

	// if modal is closed, allow re-initialization next time it opens
	$effect(() => {
		if (!open) {
			initialized = false;
			selectAllKelas = false;
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
		mataPelajaranIds = mataPelajaranIds;
	}

	function toggleKelas(id: number) {
		if (kelasIds.has(id)) {
			kelasIds.delete(id);
		} else {
			kelasIds.add(id);
		}
		// Trigger reactivity
		kelasIds = kelasIds;
	}

	async function save() {
		const form = new FormData();
		form.set('username', username || '');
		form.set('password', password || '');
		form.set('nama', nama || '');
		form.set('type', type || 'user');
		// Send multiple mapel as JSON array
		form.set('mataPelajaranIds', JSON.stringify(Array.from(mataPelajaranIds)));
		// Send multiple kelas as JSON array
		form.set('kelasIds', JSON.stringify(Array.from(kelasIds)));
		// include sekolahId when provided. Server may use this to resolve a default
		// mataPelajaran within the chosen sekolah so users are linked to a sekolah.
		form.set('sekolahId', String(sekolahId ?? ''));
		try {
			const res = await fetch('?/create_user', { method: 'POST', body: form });
			if (res.ok) {
				const body = await res.json().catch(() => ({}));
				// merge local form values so the UI can update immediately even if server
				// response omits some fields. Do NOT include the raw password in the event.
				const mergedBody = {
					...body,
					username: body.user?.username ?? username,
					displayName: body.displayName ?? nama,
					mataPelajaranIds: body.mataPelajaranIds ?? Array.from(mataPelajaranIds),
					kelasIds: body.kelasIds ?? Array.from(kelasIds),
					// ensure there's a `user` object for the parent to consume
					user: body.user ?? {
						id: Date.now(),
						username: body.user?.username ?? username,
						createdAt: new Date().toISOString(),
						type: body.user?.type ?? type,
						passwordUpdatedAt: body.user?.passwordUpdatedAt ?? new Date().toISOString()
					},
					// indicate whether server actually returned the user object (so parent can detect fallback)
					__server_user_returned: Boolean(body.user && typeof body.user.id !== 'undefined')
				};
				toast({ message: 'Pengguna dibuat', type: 'success' });
				dispatch('saved', { body: mergedBody });
				open = false;
			} else {
				// try to parse a JSON error payload from the action
				let msg = 'Gagal membuat pengguna';
				try {
					const parsed = await res.json().catch(() => null);
					if (parsed) {
						if (typeof parsed.message === 'string' && parsed.message.trim()) msg = parsed.message;
						else if (parsed.error && typeof parsed.error.message === 'string')
							msg = parsed.error.message;
						else msg = JSON.stringify(parsed);
					} else {
						msg = await res.text().catch(() => msg);
					}
				} catch {
					msg = (await res.text().catch(() => msg)) as string;
				}
				toast({ message: `Gagal membuat: ${msg}`, type: 'error' });
			}
		} catch {
			toast({ message: 'Gagal membuat pengguna', type: 'error' });
		}
	}
</script>

{#if open}
	<div class="modal modal-open">
		<div class="modal-box flex max-h-[90vh] max-w-lg flex-col p-4">
			<h3 class="mb-3 text-lg font-bold">Tambah Pengguna</h3>
			<div class="flex-1 space-y-3 overflow-y-auto px-1">
				<!-- Sekolah -->
				<fieldset class="fieldset overflow-hidden">
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
												{#if k.fase}({k.fase}){/if}</span
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

				<fieldset class="fieldset">
					<legend class="fieldset-legend">Akun</legend>
					<div class="flex flex-col gap-2 sm:flex-row">
						<label class="input validator dark:bg-base-200 w-full dark:border-none">
							<Icon name="user" />
							<input
								id="add-user-username"
								type="text"
								required
								placeholder="Username"
								title="Only letters, numbers or dash"
								bind:value={username}
							/>
						</label>
						<label class="input validator dark:bg-base-200 w-full dark:border-none">
							<Icon name="lock" />
							<input
								id="add-user-password"
								type={showPassword ? 'text' : 'password'}
								required
								placeholder="Password"
								bind:value={password}
							/>
							<button
								type="button"
								class="cursor-pointer"
								onclick={() => (showPassword = !showPassword)}
								aria-label="Toggle password visibility"
							>
								<Icon name={showPassword ? 'eye-off' : 'eye'} />
							</button>
						</label>
					</div>
					<p class="validator-hint hidden">Isi username dan password dulu!</p>
					<p class="label">Username dan password untuk login</p>
				</fieldset>
			</div>

			<div class="modal-action sticky bottom-0 z-10">
				<button class="btn btn-soft shadow-none" type="button" onclick={close}
					><Icon name="close" /> Batal</button
				>
				<button class="btn btn-primary shadow-none" type="button" onclick={save} disabled={!isValid}
					><Icon name="save" /> Simpan</button
				>
			</div>
		</div>
	</div>
{/if}
