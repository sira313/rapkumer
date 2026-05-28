export async function downloadTemplate(
	ekstrakurikulerId: string | number,
	kelasId: string | number
): Promise<boolean> {
	try {
		const formData = new FormData();
		formData.append('ekstrakurikulerId', String(ekstrakurikulerId));
		formData.append('kelasId', String(kelasId));

		const response = await fetch('/api/nilai-ekstrakurikuler/download-template', {
			method: 'POST',
			body: formData
		});

		if (!response.ok) {
			return false;
		}

		const blob = await response.blob();
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;

		const contentDisposition = response.headers.get('content-disposition');
		let filename = `template-nilai-ekstrakurikuler-${new Date().getTime()}.xlsx`;
		if (contentDisposition) {
			const match = contentDisposition.match(/filename="?([^";\n]+)"?/i);
			if (match && match[1]) {
				filename = match[1];
			}
		}

		a.download = filename;
		document.body.appendChild(a);
		a.click();
		window.URL.revokeObjectURL(url);
		document.body.removeChild(a);

		return true;
	} catch (err) {
		console.error(err);
		return false;
	}
}

export async function importNilai(
	file: File,
	ekstrakurikulerId: string | number,
	kelasId: string | number
): Promise<{ success: boolean; message?: string }> {
	if (!file.name.endsWith('.xlsx')) {
		return { success: false, message: 'Hanya file .xlsx yang didukung' };
	}

	try {
		const formData = new FormData();
		formData.append('ekstrakurikulerId', String(ekstrakurikulerId));
		formData.append('kelasId', String(kelasId));
		formData.append('file', file);

		const response = await fetch('/api/nilai-ekstrakurikuler/import', {
			method: 'POST',
			body: formData
		});

		const result = await response.json();

		if (!response.ok) {
			return { success: false, message: result.message ?? 'Gagal mengimport file' };
		}

		return { success: true, message: result.message };
	} catch (err) {
		console.error(err);
		return { success: false, message: 'Terjadi kesalahan saat import' };
	}
}
