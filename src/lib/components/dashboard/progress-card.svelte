<script lang="ts">
	import Icon from '$lib/components/icon.svelte';

	type ProgressItem = {
		percentage: number;
		completed: number;
		total: number;
	};

	let { progress } = $props<{
		progress: {
			akademik: ProgressItem;
			ekstrakurikuler: ProgressItem;
			kokurikuler: ProgressItem;
		};
	}>();
</script>

<div class="card bg-base-100 rounded-box shadow-md">
	<div class="card-body space-y-4">
		<h2 class="card-title mb-4">
			<span class="text-xl">
				<Icon name="bar-chart" />
			</span>
			Progress Pengisian Data
		</h2>

		<div>
			<label class="label" for="progress-akademik">
				<span class="label-text">Nilai Intrakurikuler</span>
				<span class="label-text-alt font-semibold">{progress.akademik.percentage}%</span>
			</label>
			<progress
				id="progress-akademik"
				class="progress progress-success w-full"
				value={progress.akademik.percentage}
				max="100"
			></progress>
			<p class="text-base-content/70 mt-1 text-xs">
				{progress.akademik.completed} dari {progress.akademik.total} penilaian sudah diinput.
			</p>
		</div>

		<!-- Absensi Siswa section removed as requested -->

		<div>
			<label class="label" for="progress-ekskul">
				<span class="label-text">Nilai Ekstrakurikuler</span>
				<span class="label-text-alt font-semibold">{progress.ekstrakurikuler.percentage}%</span>
			</label>
			<progress
				id="progress-ekskul"
				class="progress progress-warning w-full"
				value={progress.ekstrakurikuler.percentage}
				max="100"
			></progress>
			<p class="text-base-content/70 mt-1 text-xs">
				{progress.ekstrakurikuler.completed} dari {progress.ekstrakurikuler.total} murid sudah dinilai.
			</p>
		</div>

		<div>
			<label class="label" for="progress-kokur">
				<span class="label-text">Nilai Kokurikuler</span>
				<span class="label-text-alt font-semibold">{progress.kokurikuler.percentage}%</span>
			</label>
			<progress
				id="progress-kokur"
				class="progress progress-error w-full"
				value={progress.kokurikuler.percentage}
				max="100"
			></progress>
			<p class="text-base-content/70 mt-1 text-xs">
				{progress.kokurikuler.completed} dari {progress.kokurikuler.total} murid sudah dinilai.
			</p>
		</div>
	</div>
</div>
