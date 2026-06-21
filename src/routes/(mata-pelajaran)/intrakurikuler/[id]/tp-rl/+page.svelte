<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- page uses goto/href for TP/RL navigation */
	import { goto, invalidate } from '$app/navigation';
	import Icon from '$lib/components/icon.svelte';
	import BobotInfoAlert from '$lib/components/tp-rl/bobot-info-alert.svelte';
	import BulkDeleteDialog from '$lib/components/tp-rl/bulk-delete-dialog.svelte';
	import DeleteEntryDialog from '$lib/components/tp-rl/delete-entry-dialog.svelte';
	import DeleteGroupDialog from '$lib/components/tp-rl/delete-group-dialog.svelte';
	import ImportDialog from '$lib/components/tp-rl/import-dialog.svelte';
	import GroupDisplayRow from '$lib/components/tp-rl/group-display-row.svelte';
	import GroupFormRow from '$lib/components/tp-rl/group-form-row.svelte';
	import type {
		GroupBobotState,
		GroupEntry,
		GroupFormState,
		SelectedGroupState,
		TujuanPembelajaranGroup
	} from '$lib/components/tp-rl/types';
	import { showModal } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import {
		buildGroupedTujuanPembelajaran,
		areGroupsEqual,
		ensureTrailingEntry,
		sanitizeBobotValue,
		formatBobotValue,
		applyBobotDistribution,
		isSameBobotState,
		deriveInitialBobotState,
		computeTotalBobot,
		cloneBobotState
	} from '$lib/utils/tp-rl';
	import Header from '$lib/components/intrakurikuler/header.svelte';
	import {
		groupKey as utilGroupKey,
		removeSelectionByKey as utilRemoveSelectionByKey,
		isGroupSelected as utilIsGroupSelected,
		computeToggleSelection as utilComputeToggleSelection,
		computeSelectAllChange as utilComputeSelectAllChange,
		isEditingGroup as utilIsEditingGroup
	} from '$lib/utils/tp-rl-selection';
	import { refreshBobotDrafts as utilRefreshBobotDrafts } from '$lib/utils/tp-rl-bobot';

	// grouping helpers imported from '$lib/utils/tp-rl'

	import { page } from '$app/state';
	import SvelteURLSearchParams from '$lib/svelte-helpers/url-search-params';
	let { data } = $props();
	const AGAMA_PARENT_NAME = 'Pendidikan Agama dan Budi Pekerti';
	const PKS_PARENT_NAME = 'Pendalaman Kitab Suci';
	const isAgamaParentMapel = $derived(data.mapel.nama === AGAMA_PARENT_NAME);
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const _isPksParentMapel = $derived(data.mapel.nama === PKS_PARENT_NAME);
	// Check if mapel is PAPB-related (parent or any variant)
	const isAgamaRelated = $derived(
		data.mapel.nama === AGAMA_PARENT_NAME || data.mapel.nama?.startsWith('Pendidikan Agama ')
	);
	// Check if mapel is PKS-related (parent or any variant)
	const isPksRelated = $derived(
		data.mapel.nama === PKS_PARENT_NAME || data.mapel.nama?.startsWith('Pendalaman Kitab Suci ')
	);
	const isReligionBasedMapel = $derived(isAgamaRelated || isPksRelated);
	const agamaOptions = $derived(data.agamaOptions ?? []);
	const showAgamaSelect = $derived(agamaOptions.length > 0 && isReligionBasedMapel);
	const requiresAgamaSelection = $derived(isReligionBasedMapel && showAgamaSelect);
	let selectedAgamaId = $state(data.agamaSelection ?? '');
	let lastAgamaSelection = $state(data.agamaSelection ?? '');
	const agamaSelectId = 'agama-select';
	const activeAgamaOption = $derived.by(() => {
		if (!isReligionBasedMapel) {
			return agamaOptions.find((option) => option.id === data.mapel.id);
		}
		const selectionId = Number.parseInt(selectedAgamaId, 10);
		return Number.isFinite(selectionId)
			? agamaOptions.find((option) => option.id === selectionId)
			: undefined;
	});

	// lock/disable agama select when the logged-in user is a 'user' assigned to an agama-variant or pks-variant
	// Prefer server-provided `agamaSelectDisabled` so server can enforce the disabled
	// state after class changes; fall back to resolving from assigned ids.
	// IMPORTANT: Only lock if viewing a specific variant (not the parent page), to allow
	// multi-mapel users to switch between their assigned variants from the parent page.
	const isAgamaSelectLocked = $derived.by(() => {
		// If on parent agama/pks page, never lock (allow switching between assigned variants)
		if (isReligionBasedMapel) {
			return false;
		}

		// Check server-provided disabled flag for specific variant pages
		const serverDisabled = (data as unknown as { agamaSelectDisabled?: boolean })
			.agamaSelectDisabled;
		const userHasMultiAgama = (data as unknown as { userHasMultiAgama?: boolean })
			.userHasMultiAgama;

		// For multi-mapel users, never lock the select (let them switch variants)
		if (userHasMultiAgama) {
			return false;
		}

		if (serverDisabled) {
			return Boolean(serverDisabled);
		}

		// Fallback: check if user has single assigned agama that matches current variant
		const assignedLocal = (data?.assignedLocalMapelId ?? null) as number | null;
		const u = page.data && page.data.user ? page.data.user : null;
		const fallbackAssigned =
			u && u.type === 'user' && u.mataPelajaranId ? Number(u.mataPelajaranId) : null;
		const checkId = Number.isFinite(Number(assignedLocal))
			? Number(assignedLocal)
			: Number.isFinite(Number(fallbackAssigned))
				? Number(fallbackAssigned)
				: null;
		if (!checkId) {
			return false;
		}
		// Only lock if the specific variant matches assigned agama
		const shouldLock = data.mapel?.id === checkId;
		return shouldLock;
	});

	$effect(() => {
		// if locked (viewing specific variant), default the selection to the assigned agama option
		if (isAgamaSelectLocked && (!selectedAgamaId || selectedAgamaId === '')) {
			const assignedLocal = data?.assignedLocalMapelId;
			if (assignedLocal && agamaOptions.find((o) => o.id === assignedLocal)) {
				selectedAgamaId = String(assignedLocal);
			}
		}
		// if on parent page and no selection yet, default to first option or assigned variant
		else if (
			isAgamaParentMapel &&
			(!selectedAgamaId || selectedAgamaId === '') &&
			agamaOptions.length > 0
		) {
			const assignedLocal = data?.assignedLocalMapelId;
			if (assignedLocal && agamaOptions.find((o) => o.id === assignedLocal)) {
				selectedAgamaId = String(assignedLocal);
			} else {
				// default to first available option
				selectedAgamaId = String(agamaOptions[0]?.id ?? '');
			}
		}
	});
	const hasActiveAgamaSelection = $derived(Boolean(activeAgamaOption));
	const mapelDisplayName = $derived.by(() => {
		if (!isReligionBasedMapel) {
			return data.mapel.nama;
		}
		return activeAgamaOption?.name ?? data.mapel.nama;
	});

	// label kelas aktif — fallback ke mapel.kelas bila parent tidak menyediakan
	const kelasAktifLabel = $derived.by(() => {
		const kelas = data.kelasAktif ?? data.mapel?.kelas ?? null;
		if (!kelas) return null;
		return kelas.fase ? `${kelas.nama} - ${kelas.fase}` : kelas.nama;
	});

	let groupedTujuanPembelajaran = $state<TujuanPembelajaranGroup[]>([]);
	let groupForm = $state<GroupFormState | null>(null);
	let deleteGroup = $state<{ lingkupMateri: string; ids: number[] } | null>(null);
	let deleteEntryDialog = $state<{ index: number } | null>(null);
	let selectedGroups = $state<Record<string, SelectedGroupState>>({});
	let bulkDeleteDialog = $state<{ groups: SelectedGroupState[] } | null>(null);
	let selectAllCheckbox = $state<HTMLInputElement | null>(null);
	let agamaSelectElement = $state<HTMLSelectElement | null>(null);
	let importDialogOpen = $state(false);

	// track kelas aktif id so we can react to "Pindah Kelas" and reload TP data
	let lastKelasId = $state<number | null>(data.kelasAktif ? (data.kelasAktif.id as number) : null);

	let activeFormId = $state<string | null>(null);
	let isFormSubmitting = $state(false);
	let confirmedLongTpEntries = $state<Set<number>>(new Set());

	const BOBOT_TOTAL = 100;
	let isEditingBobot = $state(false);
	let bobotState = $state<Record<string, GroupBobotState>>({});
	let bobotStateBeforeEditing = $state<Record<string, GroupBobotState> | null>(null);
	let bobotDrafts = $state<Record<string, string>>({});
	let bobotOverflowActive = false;
	let bobotInfoShown = false;
	let shouldShowBobotInfoAlert = $state(false);

	const isCreateModeActive = $derived(groupForm?.mode === 'create');
	const isEditModeActive = $derived(groupForm?.mode === 'edit');
	const isInteractionLocked = $derived(isCreateModeActive || isEditingBobot || isEditModeActive);

	const selectedGroupList = $derived(Object.values(selectedGroups));
	const selectableGroups = $derived(
		groupedTujuanPembelajaran.filter((group) => !(groupForm && isEditingGroup(group)))
	);
	const hasSelection = $derived(!isInteractionLocked && selectedGroupList.length > 0);
	const allSelected = $derived(
		selectableGroups.length > 0 && selectedGroupList.length === selectableGroups.length
	);
	const hasGroups = $derived(groupedTujuanPembelajaran.length > 0);
	const isTambahTpDisabled = $derived.by(() => {
		if (hasSelection) return false;
		if (isInteractionLocked) return false;
		if (groupForm) return true;
		if (requiresAgamaSelection && !hasActiveAgamaSelection) return true;
		return false;
	});
	const tambahTpTooltip = $derived.by(() => {
		if (hasSelection) return undefined;
		if (requiresAgamaSelection && !hasActiveAgamaSelection) {
			return 'Pilih agama terlebih dahulu sebelum menambahkan tujuan pembelajaran.';
		}
		if (isEditingBobot) {
			return 'Batalkan pengaturan bobot.';
		}
		if (isEditModeActive) {
			return 'Batalkan perubahan tujuan pembelajaran.';
		}
		if (isCreateModeActive) {
			return 'Batalkan penambahan tujuan pembelajaran.';
		}
		if (groupForm) {
			return 'Form tujuan pembelajaran sedang dibuka.';
		}
		return undefined;
	});
	const isImportDisabled = $derived(
		(requiresAgamaSelection && !hasActiveAgamaSelection) || isInteractionLocked
	);
	const importTooltip = $derived.by(() => {
		if (isEditingBobot) {
			return 'Selesaikan pengaturan bobot terlebih dahulu sebelum mengimpor tujuan pembelajaran.';
		}
		if (isEditModeActive) {
			return 'Selesaikan perubahan tujuan pembelajaran terlebih dahulu sebelum mengimpor.';
		}
		if (isCreateModeActive) {
			return 'Batalkan form tambah tujuan pembelajaran terlebih dahulu sebelum mengimpor.';
		}
		if (requiresAgamaSelection && !hasActiveAgamaSelection) {
			return 'Pilih agama terlebih dahulu sebelum mengimpor tujuan pembelajaran.';
		}
		return undefined;
	});

	$effect(() => {
		const nextSelection =
			data.agamaSelection ??
			((data as unknown as { lockedAgamaSelectionId?: number }).lockedAgamaSelectionId
				? String((data as unknown as { lockedAgamaSelectionId?: number }).lockedAgamaSelectionId)
				: '') ??
			'';
		if (nextSelection === lastAgamaSelection) return;
		lastAgamaSelection = nextSelection;
		selectedAgamaId = nextSelection;
	});

	$effect(() => {
		// When kelas aktif changes and we're viewing the parent religion-based mapel,
		// attempt to resolve the assigned local mapel for the logged-in user
		// in the newly selected kelas and navigate to its TP page so the
		// tujuan pembelajaran shown correspond to the active kelas.
		const kelasAktif = page.data?.kelasAktif ?? null;
		if (!kelasAktif) return;
		if (!isReligionBasedMapel) return;
		const u = page.data?.user;
		if (!u || u.type !== 'user' || !u.mataPelajaranId) return;
		(async () => {
			try {
				const res = await fetch(`/api/assigned-mapel/resolve?kelas_id=${kelasAktif.id}`);
				if (!res.ok) return;
				const json = await res.json();
				const assignedLocalId = Number(json.assignedLocalMapelId ?? null);
				if (!Number.isFinite(assignedLocalId)) return;
				if (assignedLocalId === Number(data.mapel?.id)) return;
				void goto(`/intrakurikuler/${assignedLocalId}/tp-rl`, { replaceState: true });
			} catch {
				// ignore network errors silently
			}
		})();
	});

	// When kelas aktif changes for non-agama pages (or generally), reload the
	// tujuan pembelajaran and bobot data so the table reflects the active class.
	$effect(() => {
		const kelasAktif = page.data?.kelasAktif ?? null;
		const nextId = kelasAktif ? kelasAktif.id : null;
		if (nextId === lastKelasId) return;
		lastKelasId = nextId;
		// Try to resolve a corresponding mata pelajaran in the newly active kelas
		// by the current mapel name. If found, navigate to its TP page so the
		// URL and server parent load reflect the kelas-scoped mapel id.
		(async () => {
			try {
				const currentName = data?.mapel?.nama ?? '';
				if (currentName && kelasAktif) {
					const q = new SvelteURLSearchParams({
						kelas_id: String(kelasAktif.id),
						name: currentName
					});
					const res = await fetch(`/api/mapel/resolve-by-name?${q.toString()}`);
					if (res.ok) {
						const json = await res.json();
						const mappedId = Number(json?.mapelId ?? null);
						if (Number.isFinite(mappedId) && mappedId !== Number(data.mapel?.id)) {
							// navigate to the mapped mapel id so parent() load uses the new id
							void goto(`/intrakurikuler/${mappedId}/tp-rl`, { replaceState: true });
							return;
						}
					}
				}
				// fallback: invalidate loads so page data refreshes even if no mapping
				await Promise.all([invalidate('app:mapel'), invalidate('app:mapel_tp-rl')]);
			} catch {
				// ignore network errors
			}
		})();
	});

	$effect(() => {
		const nextGroups = buildGroupedTujuanPembelajaran(data.tujuanPembelajaran ?? []);
		if (!areGroupsEqual(groupedTujuanPembelajaran, nextGroups)) {
			groupedTujuanPembelajaran = nextGroups;
			syncBobotStateWithGroups(nextGroups);
		}
	});

	$effect(() => {
		const allowedKeys = new Set(groupedTujuanPembelajaran.map((group) => groupKey(group)));
		const entries = Object.entries(selectedGroups);
		const filteredEntries = entries.filter(([key]) => allowedKeys.has(key));
		if (filteredEntries.length !== entries.length) {
			selectedGroups = Object.fromEntries(filteredEntries);
		}
		if (filteredEntries.length === 0 && bulkDeleteDialog) {
			bulkDeleteDialog = null;
		}
	});

	$effect(() => {
		if (selectAllCheckbox) {
			selectAllCheckbox.indeterminate = hasSelection && !allSelected;
		}
	});

	async function handleAgamaChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const value = target.value;
		if (!value) return;
		const mapelId = Number(value);
		if (!Number.isFinite(mapelId) || mapelId === data.mapel.id) return;
		await goto(`/intrakurikuler/${mapelId}/tp-rl`, { replaceState: true });
	}

	// ensureTrailingEntry is imported from utils

	function removeSelectionByKey(key: string) {
		selectedGroups = utilRemoveSelectionByKey(selectedGroups, key);
	}

	function dismissBobotInfoAlert() {
		shouldShowBobotInfoAlert = false;
	}

	function isGroupSelected(group: TujuanPembelajaranGroup) {
		return utilIsGroupSelected(selectedGroups, group);
	}

	function toggleGroupSelection(group: TujuanPembelajaranGroup, checked: boolean) {
		if (isInteractionLocked) return;
		selectedGroups = utilComputeToggleSelection(selectedGroups, group, checked);
	}

	function clearSelection() {
		if (Object.keys(selectedGroups).length === 0) return;
		selectedGroups = {};
	}

	function handleSelectAllChange(checked: boolean) {
		if (isInteractionLocked) return;
		if (checked) {
			if (selectableGroups.length === 0) return;
			selectedGroups = utilComputeSelectAllChange(selectableGroups, true);
			return;
		}
		if (Object.keys(selectedGroups).length > 0) {
			selectedGroups = {};
		}
	}

	function openBulkDeleteDialog() {
		if (selectedGroupList.length === 0) return;
		bulkDeleteDialog = {
			groups: selectedGroupList.map((group) => ({
				lingkupMateri: group.lingkupMateri,
				ids: [...group.ids]
			}))
		};
	}

	function closeBulkDeleteDialog() {
		bulkDeleteDialog = null;
	}

	function handlePrimaryActionClick() {
		if (hasSelection) {
			openBulkDeleteDialog();
			return;
		}
		if (isCreateModeActive) {
			closeForm();
			return;
		}
		if (isEditingBobot) {
			cancelBobotEditing();
			return;
		}
		if (isEditModeActive) {
			closeForm();
			return;
		}
		openCreateForm();
	}

	function openCreateForm() {
		if (isEditModeActive) return;
		if (requiresAgamaSelection && !hasActiveAgamaSelection) {
			toast('Pilih agama terlebih dahulu sebelum menambahkan tujuan pembelajaran.', 'warning');
			agamaSelectElement?.focus();
			return;
		}
		if (selectedGroupList.length > 0) {
			clearSelection();
		}
		if (bulkDeleteDialog) {
			closeBulkDeleteDialog();
		}
		groupForm = {
			mode: 'create',
			lingkupMateri: '',
			entries: ensureTrailingEntry([{ deskripsi: '' }]),
			targetIds: []
		};
	}

	function openImportDialog() {
		if (isEditingBobot) {
			toast(
				'Selesaikan pengaturan bobot terlebih dahulu sebelum mengimpor tujuan pembelajaran.',
				'warning'
			);
			return;
		}
		if (isCreateModeActive) {
			toast(
				'Batalkan form tambah tujuan pembelajaran terlebih dahulu sebelum mengimpor.',
				'warning'
			);
			return;
		}
		if (isEditModeActive) {
			toast(
				'Selesaikan perubahan tujuan pembelajaran terlebih dahulu sebelum mengimpor.',
				'warning'
			);
			return;
		}
		if (requiresAgamaSelection && !hasActiveAgamaSelection) {
			toast('Pilih agama terlebih dahulu sebelum mengimpor tujuan pembelajaran.', 'warning');
			agamaSelectElement?.focus();
			return;
		}
		importDialogOpen = true;
	}

	function handleImportCancel() {
		importDialogOpen = false;
	}

	async function handleImportSuccess(data?: Record<string, unknown>) {
		importDialogOpen = false;
		await invalidate('app:mapel_tp-rl');

		const longEntryCount = (data?.longEntryCount ?? 0) as number;
		if (longEntryCount > 0) {
			showModal({
				title: 'Perhatian',
				body: `Tujuan pembelajaran yang diimpor melebihi 95 karakter, hal ini akan menjadi masalah jika bapak/ibu mencoba mengeksport TP ini ke E-Rapor Kemdikdas. ${longEntryCount} data terindikasi bermasalah.`,
				onNeutral: { label: 'Mengerti' },
				dismissible: false
			});
		}
	}

	function openEditForm(group: TujuanPembelajaranGroup) {
		if (isEditingBobot || isCreateModeActive) return;
		if (isEditModeActive && !isEditingGroup(group)) return;
		if (selectedGroupList.length > 0) {
			clearSelection();
		}
		removeSelectionByKey(utilGroupKey(group));
		if (bulkDeleteDialog) {
			closeBulkDeleteDialog();
		}
		const entries = group.items.map((item) => ({ id: item.id, deskripsi: item.deskripsi }));
		groupForm = {
			mode: 'edit',
			lingkupMateri: group.lingkupMateri,
			entries: ensureTrailingEntry(entries),
			targetIds: group.items.map((item) => item.id)
		};
	}

	function closeForm() {
		groupForm = null;
		deleteEntryDialog = null;
		activeFormId = null;
		isFormSubmitting = false;
		confirmedLongTpEntries = new Set();
	}

	function handleFormRegistered(formId: string) {
		activeFormId = formId ? formId : null;
	}

	function handleFormSubmittingChange(submitting: boolean) {
		isFormSubmitting = submitting;
	}

	function submitActiveForm() {
		if (!activeFormId || isFormSubmitting) return;
		const formElement = document.getElementById(activeFormId) as HTMLFormElement | null;
		if (!formElement) return;

		const lingkupInput = formElement.elements.namedItem(
			'lingkupMateri'
		) as HTMLTextAreaElement | null;
		const lingkupValue = lingkupInput?.value.trim() ?? '';

		if (!lingkupValue) {
			toast(
				'lingkup materi tidak boleh kosong, jika anda ingin menghapusnya, anda bisa melakukannya dengan tombol hapus',
				'warning'
			);
			lingkupInput?.focus();
			return;
		}

		if (!formElement.checkValidity()) {
			formElement.reportValidity();
			return;
		}

		formElement.requestSubmit();
	}

	function handleLingkupMateriInput(value: string) {
		if (!groupForm) return;
		groupForm = { ...groupForm, lingkupMateri: value };
	}

	function handleEntryInput(index: number, value: string) {
		if (!groupForm) return;

		if (value.length > 95 && !confirmedLongTpEntries.has(index)) {
			const truncated = value.slice(0, 95);
			const truncatedEntries = groupForm.entries.map((entry, entryIndex) =>
				entryIndex === index ? { ...entry, deskripsi: truncated, deleted: false } : entry
			);
			groupForm = { ...groupForm, entries: ensureTrailingEntry(truncatedEntries) };

			showModal({
				title: 'Perhatian',
				body: 'Tujuan pembelajaran yang bapak/ibu input melebihi 95 karakter, hal ini akan menjadi masalah jika bapak/ibu mencoba mengeksport TP ini ke E-Rapor Kemdikdas. Lanjutkan?',
				onPositive: {
					label: 'Lanjutkan',
					action: ({ close }) => {
						if (!groupForm) {
							close();
							return;
						}
						const fullEntries = groupForm.entries.map((entry, entryIndex) =>
							entryIndex === index ? { ...entry, deskripsi: value, deleted: false } : entry
						);
						groupForm = { ...groupForm, entries: ensureTrailingEntry(fullEntries) };
						confirmedLongTpEntries = new Set([...confirmedLongTpEntries, index]);
						close();
					}
				},
				onNegative: { label: 'Kembali' },
				dismissible: false
			});
			return;
		}

		const entries = groupForm.entries.map((entry, entryIndex) =>
			entryIndex === index ? { ...entry, deskripsi: value, deleted: false } : entry
		);
		groupForm = { ...groupForm, entries: ensureTrailingEntry(entries) };
	}

	function openEntryDeleteDialog(index: number) {
		deleteEntryDialog = { index };
	}

	function closeEntryDeleteDialog() {
		deleteEntryDialog = null;
	}

	function confirmEntryDelete() {
		if (deleteEntryDialog === null) return;
		const { index } = deleteEntryDialog;
		if (!groupForm) {
			deleteEntryDialog = null;
			return;
		}
		if (!groupForm.entries[index]) {
			deleteEntryDialog = null;
			return;
		}
		handleEntryDelete(index);
	}

	function handleEntryDelete(index: number) {
		if (!groupForm) return;
		const target = groupForm.entries[index];
		if (!target) return;

		let entries: GroupEntry[];
		if (target.id !== undefined) {
			entries = groupForm.entries.map((entry, entryIndex) =>
				entryIndex === index ? { ...entry, deskripsi: '', deleted: true } : entry
			);
		} else {
			entries = groupForm.entries.filter((_, entryIndex) => entryIndex !== index);
		}

		groupForm = { ...groupForm, entries: ensureTrailingEntry(entries) };
		deleteEntryDialog = null;
	}

	function isEditingGroup(group: TujuanPembelajaranGroup) {
		return utilIsEditingGroup(group, groupForm);
	}

	function groupKey(group: TujuanPembelajaranGroup) {
		return utilGroupKey(group);
	}

	function openDeleteDialog(group: TujuanPembelajaranGroup) {
		if (isEditingBobot || isEditModeActive) return;
		removeSelectionByKey(groupKey(group));
		deleteGroup = { lingkupMateri: group.lingkupMateri, ids: group.items.map((item) => item.id) };
	}

	function closeDeleteDialog() {
		deleteGroup = null;
	}

	function handleFormSuccess() {
		closeForm();
		invalidate('app:mapel_tp-rl');
	}

	function handleBulkDeleteSuccess() {
		closeBulkDeleteDialog();
		clearSelection();
		invalidate('app:mapel_tp-rl');
	}

	function handleDeleteGroupSuccess() {
		closeDeleteDialog();
		invalidate('app:mapel_tp-rl');
	}

	// bobot helper functions moved to '$lib/utils/tp-rl'

	type RefreshBobotOptions = {
		preserveKey?: string;
		rawValue?: string;
	};

	function refreshBobotDrafts(
		state: Record<string, GroupBobotState>,
		options: RefreshBobotOptions = {}
	) {
		bobotDrafts = utilRefreshBobotDrafts(state, bobotDrafts, formatBobotValue, options);
	}

	function syncBobotStateWithGroups(groups: TujuanPembelajaranGroup[]) {
		const derived = deriveInitialBobotState(groups, groupKey);
		const next: Record<string, GroupBobotState> = {};
		for (const group of groups) {
			const key = groupKey(group);
			const existing = bobotState[key];
			const derivedEntry = derived[key];
			if (!existing) {
				next[key] = derivedEntry ?? { value: 0, isManual: false };
				continue;
			}
			if (
				!isEditingBobot &&
				derivedEntry &&
				!isSameBobotState({ [key]: existing }, { [key]: derivedEntry })
			) {
				next[key] = derivedEntry;
				continue;
			}
			next[key] = {
				value: sanitizeBobotValue(existing.value ?? 0),
				isManual: Boolean(existing.isManual)
			};
		}

		if (isSameBobotState(bobotState, next)) {
			maybeShowBobotInfo(bobotState);
			refreshBobotDrafts(bobotState);
			return;
		}

		const { state, manualSum } = applyBobotDistribution(next);
		bobotState = state;
		notifyBobotOverflow(manualSum > BOBOT_TOTAL);
		maybeShowBobotInfo(state);
		refreshBobotDrafts(state);
	}

	function notifyBobotOverflow(active: boolean) {
		if (active === bobotOverflowActive) return;
		bobotOverflowActive = active;
		if (active) {
			toast('Total bobot tidak boleh melebihi 100%!', 'error');
		}
	}

	function maybeShowBobotInfo(state: Record<string, GroupBobotState>) {
		if (bobotInfoShown) return;
		const hasAutomatic = Object.values(state).some((entry) => !entry.isManual);
		if (hasAutomatic) {
			shouldShowBobotInfoAlert = true;
			bobotInfoShown = true;
		}
	}

	function handleBobotInput(group: TujuanPembelajaranGroup, rawValue: string) {
		const key = groupKey(group);
		const trimmed = rawValue.trim();
		const next: Record<string, GroupBobotState> = { ...bobotState };

		if (trimmed === '') {
			next[key] = { value: 0, isManual: false };
			const { state, manualSum } = applyBobotDistribution(next);
			bobotState = state;
			// Preserve raw input instead of formatting
			refreshBobotDrafts(state, { preserveKey: key, rawValue: '' });
			notifyBobotOverflow(manualSum > BOBOT_TOTAL);
			return;
		}

		// Normalize input: replace comma with dot for consistent parsing across locales
		const normalized = trimmed.replace(',', '.');
		const parsed = Number.parseFloat(normalized);
		const sanitized = sanitizeBobotValue(parsed);
		next[key] = { value: sanitized, isManual: true };
		const { state, manualSum } = applyBobotDistribution(next);
		bobotState = state;
		// Preserve raw input as draft, don't auto-format while typing
		refreshBobotDrafts(state, { preserveKey: key, rawValue: trimmed });
		notifyBobotOverflow(manualSum > BOBOT_TOTAL);
	}

	function getBobotValue(group: TujuanPembelajaranGroup) {
		return bobotState[groupKey(group)]?.value ?? 0;
	}

	function cancelBobotEditing() {
		if (!isEditingBobot) return;
		const next =
			bobotStateBeforeEditing !== null
				? cloneBobotState(bobotStateBeforeEditing)
				: deriveInitialBobotState(groupedTujuanPembelajaran, groupKey);
		bobotState = next;
		refreshBobotDrafts(next);
		notifyBobotOverflow(false);
		maybeShowBobotInfo(next);
		isEditingBobot = false;
		bobotStateBeforeEditing = null;
		shouldShowBobotInfoAlert = false;
	}

	async function toggleBobotEditing() {
		if (!hasGroups || isEditModeActive) return;
		if (!isEditingBobot) {
			bobotStateBeforeEditing = cloneBobotState(bobotState);
			if (selectedGroupList.length > 0) {
				clearSelection();
			}
			if (bulkDeleteDialog) {
				closeBulkDeleteDialog();
			}
			const next: Record<string, GroupBobotState> = {};
			for (const [key, entry] of Object.entries(bobotState)) {
				next[key] = {
					value: sanitizeBobotValue(entry.value ?? 0),
					isManual: false
				};
			}
			bobotState = next;
			refreshBobotDrafts(next);
			isEditingBobot = true;
			notifyBobotOverflow(false);
			maybeShowBobotInfo(next);
			return;
		}

		const total = computeTotalBobot(bobotState);
		if (Math.abs(total - BOBOT_TOTAL) > 0.01) {
			toast('Total bobot harus tepat 100% untuk menyimpan.', 'warning');
			isEditingBobot = true;
			return;
		}

		// Save bobot to server via form submission
		const formData = new FormData();
		for (const [key, entry] of Object.entries(bobotState)) {
			const sanitized = sanitizeBobotValue(entry.value);
			formData.append(`bobot[${key}]`, String(sanitized));
		}

		try {
			const response = await fetch('?/savebobot', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				const errorMsg = errorData?.fail || 'Gagal menyimpan bobot ke server.';
				toast(errorMsg, 'error');
				return;
			}

			const resultData = await response.json().catch(() => ({}));

			const next: Record<string, GroupBobotState> = {};
			for (const [key, entry] of Object.entries(bobotState)) {
				next[key] = { value: sanitizeBobotValue(entry.value), isManual: true };
			}
			bobotState = next;
			refreshBobotDrafts(next);
			bobotOverflowActive = false;
			isEditingBobot = false;
			bobotDrafts = {};
			shouldShowBobotInfoAlert = false;
			bobotStateBeforeEditing = null;

			// Invalidate data so UI reflects saved bobot
			await invalidate('app:mapel_tp-rl');

			toast(resultData?.message || 'Bobot berhasil disimpan.', 'success');
		} catch {
			toast('Terjadi kesalahan saat menyimpan bobot.', 'error');
			// Restore editing mode on error
			isEditingBobot = true;
		}
	}
</script>

{#if shouldShowBobotInfoAlert}
	<BobotInfoAlert
		message="Bobot belum disetel, maka pembobotan akan dilakukan dengan mengambil rata-rata dari semua nilai."
		onDismiss={dismissBobotInfoAlert}
	/>
{/if}

<!-- Data Mapel Wajib -->
<div class="card bg-base-100 rounded-box w-full border border-none p-4 shadow-md">
	<Header
		{mapelDisplayName}
		mapelKelasNama={data.mapel.kelas.nama}
		{kelasAktifLabel}
		{importTooltip}
		{isImportDisabled}
		onOpenImport={openImportDialog}
		{showAgamaSelect}
		{agamaSelectId}
		{agamaOptions}
		{selectedAgamaId}
		onAgamaChange={handleAgamaChange}
		onAgamaElementMounted={(el: HTMLSelectElement) => (agamaSelectElement = el)}
		{isAgamaSelectLocked}
		onBack={() => history.back()}
		{handlePrimaryActionClick}
		{isTambahTpDisabled}
		{tambahTpTooltip}
		{hasSelection}
		{isInteractionLocked}
		{isCreateModeActive}
		{isEditModeActive}
		{submitActiveForm}
		{activeFormId}
		{isFormSubmitting}
		{isEditingBobot}
		{hasGroups}
		{toggleBobotEditing}
	/>
	{#if requiresAgamaSelection && !hasActiveAgamaSelection}
		<div class="alert alert-warning alert-soft my-2 flex items-center gap-2 text-sm">
			<Icon name="warning" />
			<span>Pilih agama terlebih dahulu sebelum menambahkan tujuan pembelajaran.</span>
		</div>
	{/if}
	<div class="bg-base-100 dark:bg-base-200 overflow-x-auto rounded-md shadow-md dark:shadow-none">
		<table class="border-base-200 table border dark:border-none">
			<thead>
				<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
					<th style="width: 50px; min-width: 40px;">
						<input
							type="checkbox"
							class="checkbox"
							aria-label="Pilih semua lingkup materi"
							bind:this={selectAllCheckbox}
							checked={allSelected}
							onchange={(event) =>
								handleSelectAllChange((event.currentTarget as HTMLInputElement).checked)}
							disabled={selectableGroups.length === 0 || isInteractionLocked}
						/>
					</th>
					<th style="width: 50px; min-width: 40px;">No</th>
					<th style="width: 30%;">Lingkup Materi</th>
					<th style="width: 13%">Bobot</th>
					<th style="width: 60%">Tujuan Pembelajaran</th>
					<th>Aksi</th>
				</tr>
			</thead>
			<tbody>
				{#if groupForm && groupForm.mode === 'create'}
					{@const currentForm = groupForm}
					<GroupFormRow
						rowNumber={1}
						form={currentForm}
						onLingkupMateriInput={handleLingkupMateriInput}
						onEntryInput={handleEntryInput}
						onOpenDeleteEntry={openEntryDeleteDialog}
						onSubmitSuccess={handleFormSuccess}
						onFormRegistered={handleFormRegistered}
						onSubmittingChange={handleFormSubmittingChange}
					/>
				{/if}

				{#if groupedTujuanPembelajaran.length > 0}
					{#each groupedTujuanPembelajaran as group, groupIndex (groupKey(group))}
						{@const rowNumber = groupIndex + 1 + (groupForm && groupForm.mode === 'create' ? 1 : 0)}
						{#if groupForm && isEditingGroup(group)}
							{@const currentForm = groupForm}
							<GroupFormRow
								{rowNumber}
								form={currentForm}
								onLingkupMateriInput={handleLingkupMateriInput}
								onEntryInput={handleEntryInput}
								onOpenDeleteEntry={openEntryDeleteDialog}
								onSubmitSuccess={handleFormSuccess}
								onFormRegistered={handleFormRegistered}
								onSubmittingChange={handleFormSubmittingChange}
							/>
						{:else}
							<GroupDisplayRow
								{rowNumber}
								{group}
								isSelected={isGroupSelected(group)}
								{isEditingBobot}
								bobotDraftValue={bobotDrafts[groupKey(group)] ??
									formatBobotValue(getBobotValue(group))}
								bobotDisplayValue={formatBobotValue(getBobotValue(group))}
								onToggleSelection={(checked) => toggleGroupSelection(group, checked)}
								onBobotInput={(value) => handleBobotInput(group, value)}
								onEdit={() => openEditForm(group)}
								onDelete={() => openDeleteDialog(group)}
								areActionsDisabled={isInteractionLocked}
							/>
						{/if}
					{/each}
				{:else if !(groupForm && groupForm.mode === 'create')}
					<tr>
						<td class="text-center italic opacity-50" colspan="5">Belum ada data</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>

{#if importDialogOpen}
	<ImportDialog onCancel={handleImportCancel} onSuccess={handleImportSuccess} />
{/if}

{#if deleteEntryDialog && groupForm}
	{@const entryToDelete = groupForm.entries[deleteEntryDialog.index]}
	<DeleteEntryDialog
		entry={entryToDelete}
		onCancel={closeEntryDeleteDialog}
		onConfirm={confirmEntryDelete}
	/>
{/if}

{#if bulkDeleteDialog}
	<BulkDeleteDialog
		groups={bulkDeleteDialog.groups}
		onCancel={closeBulkDeleteDialog}
		onSuccess={handleBulkDeleteSuccess}
	/>
{/if}

{#if deleteGroup}
	<DeleteGroupDialog
		lingkupMateri={deleteGroup.lingkupMateri}
		ids={deleteGroup.ids}
		onCancel={closeDeleteDialog}
		onSuccess={handleDeleteGroupSuccess}
	/>
{/if}
