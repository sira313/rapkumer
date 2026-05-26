<script lang="ts">
	import Icon from '$lib/components/icon.svelte';

	type AcademicContext = {
		activeSemesterId: number | null;
		tahunAjaranList: Array<{
			nama: string;
			semester: Array<{ id: number; nama: string }>;
		}>;
	} | null;

	let {
		headingTitle = '',
		kelasAktifLabel = null,
		academicContext = null,
		canNavigateMurid = false,
		hasPrevMurid = false,
		hasNextMurid = false,
		loading = false,
		onNavigatePrev,
		onNavigateNext
	}: {
		headingTitle: string;
		kelasAktifLabel: string | null;
		academicContext: AcademicContext;
		canNavigateMurid: boolean;
		hasPrevMurid: boolean;
		hasNextMurid: boolean;
		loading?: boolean;
		onNavigatePrev: () => void;
		onNavigateNext: () => void;
	} = $props();

	const activeSemester = $derived.by(() => {
		const context = academicContext;
		if (!context?.activeSemesterId) return null;
		for (const tahun of context.tahunAjaranList ?? []) {
			const match = tahun.semester.find((item) => item.id === context.activeSemesterId);
			if (match) {
				return {
					...match,
					tahunAjaranNama: tahun.nama
				};
			}
		}
		return null;
	});
</script>

<div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
	<div>
		<h2 class="text-xl font-bold">
			{headingTitle}
		</h2>
		{#if kelasAktifLabel}
			<p class="text-base-content/80 block text-sm">
				{kelasAktifLabel}
				{#if activeSemester}
					- Semester {activeSemester.nama} ({activeSemester.tahunAjaranNama})
				{:else if academicContext?.activeSemesterId}
					- Semester aktif tidak ditemukan dalam daftar tahun ajaran.
				{:else}
					- Semester belum disetel di menu Rapor.
				{/if}
			</p>
		{/if}
	</div>
	<div class="flex items-center gap-2 self-end sm:self-auto">
		<button
			class="btn btn-circle btn-soft shadow-none"
			type="button"
			onclick={onNavigatePrev}
			title="Murid sebelumnya"
			aria-label="Murid sebelumnya"
			disabled={loading || !canNavigateMurid || !hasPrevMurid}
		>
			<Icon name="left" />
		</button>
		<button
			class="btn btn-circle btn-soft shadow-none"
			type="button"
			onclick={onNavigateNext}
			title="Murid berikutnya"
			aria-label="Murid berikutnya"
			disabled={loading || !canNavigateMurid || !hasNextMurid}
		>
			<Icon name="right" />
		</button>
	</div>
</div>
