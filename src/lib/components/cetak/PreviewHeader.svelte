<script lang="ts">
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
		academicContext = null
	}: {
		headingTitle: string;
		kelasAktifLabel: string | null;
		academicContext: AcademicContext;
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
</div>
