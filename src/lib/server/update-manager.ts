import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createWriteStream, constants } from 'node:fs';
import { access, mkdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

import { getAppVersion } from './app-info';

const releasesEndpoint = 'https://api.github.com/repos/sira313/rapkumer/releases/latest';
const userAgent = 'RapkumerUpdater/1.0';

const downloads = new Map<string, DownloadRecord>();

const updateBaseDir = (() => {
	if (process.env.RAPKUMER_UPDATE_DIR) return process.env.RAPKUMER_UPDATE_DIR;
	const localAppData = process.env.LOCALAPPDATA;
	if (localAppData) return join(localAppData, 'Rapkumer', 'updates');
	const home = homedir() || process.cwd();
	return join(home, '.rapkumer', 'updates');
})();

async function ensureDir(pathname: string) {
	await mkdir(pathname, { recursive: true });
}

function normalizeVersion(input: string | null | undefined): string {
	if (!input) return '0.0.0';
	const trimmed = input.trim();
	if (!trimmed) return '0.0.0';
	return trimmed.startsWith('v') || trimmed.startsWith('V') ? trimmed.slice(1) : trimmed;
}

function buildGithubHeaders(): HeadersInit {
	const headers = new Headers({
		Accept: 'application/vnd.github+json',
		'User-Agent': userAgent
	});
	const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
	if (token) headers.set('Authorization', `Bearer ${token}`);
	return headers;
}

function buildGithubDownloadHeaders(): HeadersInit {
	const headers = new Headers({
		Accept: 'application/octet-stream',
		'User-Agent': userAgent
	});
	const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
	if (token) headers.set('Authorization', `Bearer ${token}`);
	return headers;
}

function compareVersions(a: string, b: string): number {
	const segmentsA = normalizeVersion(a)
		.split('.')
		.map((part) => Number.parseInt(part, 10));
	const segmentsB = normalizeVersion(b)
		.split('.')
		.map((part) => Number.parseInt(part, 10));
	const length = Math.max(segmentsA.length, segmentsB.length);

	for (let index = 0; index < length; index += 1) {
		const valueA = Number.isFinite(segmentsA[index]) ? segmentsA[index] : 0;
		const valueB = Number.isFinite(segmentsB[index]) ? segmentsB[index] : 0;
		if (valueA > valueB) return 1;
		if (valueA < valueB) return -1;
	}

	return 0;
}

interface GithubReleaseAsset {
	id: number;
	name: string;
	size: number;
	browser_download_url: string;
	content_type: string | null;
}

interface GithubReleaseResponse {
	tag_name: string;
	name: string;
	body: string | null;
	published_at: string | null;
	html_url: string;
	prerelease: boolean;
	assets: GithubReleaseAsset[];
}

interface DownloadRecord {
	id: string;
	version: string;
	assetId: number;
	assetName: string;
	assetUrl: string;
	status: DownloadState;
	downloadedBytes: number;
	totalBytes: number | null;
	error?: string;
	filePath?: string;
	installScheduled: boolean;
	startedAt: number;
	updatedAt: number;
}

type DownloadState = 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';

export async function fetchLatestRelease(): Promise<ReleaseSummary> {
	const response = await fetch(releasesEndpoint, { headers: buildGithubHeaders() });
	if (!response.ok) {
		const details = await response.text().catch(() => '');
		throw new Error(
			`Gagal mengambil data rilis GitHub (${response.status} ${response.statusText}): ${details}`.trim()
		);
	}

	const payload = (await response.json()) as GithubReleaseResponse;
	return mapRelease(payload);
}

function mapRelease(payload: GithubReleaseResponse): ReleaseSummary {
	return {
		version: normalizeVersion(payload.tag_name || payload.name),
		name: payload.name || payload.tag_name || 'Rilis terbaru',
		notes: payload.body ?? '',
		publishedAt: payload.published_at ?? '',
		htmlUrl: payload.html_url,
		isPrerelease: Boolean(payload.prerelease),
		assets: (payload.assets ?? []).map((asset) => ({
			id: asset.id,
			name: asset.name,
			size: asset.size,
			downloadUrl: asset.browser_download_url,
			contentType: asset.content_type ?? null
		}))
	};
}

interface StartDownloadParams {
	version: string;
	assetId: number;
	assetName: string;
	assetUrl: string;
	size?: number | null;
}

async function ensureWritableTarget(targetPath: string) {
	await ensureDir(dirname(targetPath));
	try {
		await access(targetPath, constants.F_OK);
		await rm(targetPath, { force: true });
	} catch {
		// ignore when file not found
	}
}

async function requestLocalShutdown(port: string) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 5000);
	const url = `http://127.0.0.1:${port}/api/runtime/stop`;

	try {
		const response = await fetch(url, { method: 'POST', signal: controller.signal });
		if (!response.ok) {
			const details = await response.text().catch(() => '');
			console.warn(
				`[updates] gagal menghentikan server otomatis (${response.status} ${response.statusText}): ${details}`.trim()
			);
		}
	} catch (error) {
		console.warn('[updates] permintaan penghentian server otomatis mungkin gagal', error);
	} finally {
		clearTimeout(timeout);
	}
}

function findExistingDownload(version: string, assetId: number) {
	for (const record of downloads.values()) {
		if (
			normalizeVersion(record.version) === normalizeVersion(version) &&
			record.assetId === assetId
		) {
			return record;
		}
	}
	return null;
}

export function startDownload(params: StartDownloadParams): DownloadStatus {
	const existing = findExistingDownload(params.version, params.assetId);
	if (existing && existing.status !== 'failed') {
		existing.updatedAt = Date.now();
		return toPublic(existing);
	}

	const id = randomUUID();
	const record: DownloadRecord = {
		id,
		version: normalizeVersion(params.version),
		assetId: params.assetId,
		assetName: params.assetName,
		assetUrl: params.assetUrl,
		status: 'pending',
		downloadedBytes: 0,
		totalBytes: Number.isFinite(params.size ?? null) ? Number(params.size) : null,
		installScheduled: false,
		startedAt: Date.now(),
		updatedAt: Date.now()
	};

	downloads.set(id, record);

	(async () => {
		const releaseDir = join(updateBaseDir, record.version);
		const targetPath = join(releaseDir, record.assetName);

		try {
			await ensureWritableTarget(targetPath);

			const response = await fetch(record.assetUrl, { headers: buildGithubDownloadHeaders() });
			if (!response.ok || !response.body) {
				const details = await response.text().catch(() => '');
				throw new Error(
					`Gagal mengunduh aset (${response.status} ${response.statusText}): ${details}`.trim()
				);
			}

			const total = response.headers.get('content-length');
			record.totalBytes = total ? Number.parseInt(total, 10) : record.totalBytes;
			record.status = 'downloading';
			record.updatedAt = Date.now();

			await ensureDir(releaseDir);
			const fileStream = createWriteStream(targetPath);
			fileStream.on('error', (error) => {
				console.error('Gagal menulis file pembaruan', error);
			});

			const reader = response.body.getReader();

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					if (value) {
						record.downloadedBytes += value.length;
						record.updatedAt = Date.now();
						if (!fileStream.write(value)) {
							await once(fileStream, 'drain');
						}
					}
				}
			} finally {
				reader.releaseLock();
			}

			await new Promise<void>((resolve, reject) => {
				const handleError = (error: Error) => {
					fileStream.off('finish', handleFinish);
					reject(error);
				};
				const handleFinish = () => {
					fileStream.off('error', handleError);
					resolve();
				};
				fileStream.once('error', handleError);
				fileStream.once('finish', handleFinish);
				fileStream.end();
			});

			record.filePath = targetPath;
			record.status = 'completed';
			record.updatedAt = Date.now();
		} catch (error) {
			record.status = 'failed';
			record.error = error instanceof Error ? error.message : 'Gagal mengunduh pembaruan.';
			record.updatedAt = Date.now();
			try {
				await rm(targetPath, { force: true });
			} catch {
				// ignore cleanup failure
			}
			console.error('[updates] download gagal', error);
		}
	})();

	return toPublic(record);
}

export function getDownloadStatus(id: string): DownloadStatus | null {
	const record = downloads.get(id);
	return record ? toPublic(record) : null;
}

export function getDownloadRecord(id: string): DownloadRecord | null {
	return downloads.get(id) ?? null;
}

export async function scheduleInstall(downloadId: string): Promise<{ message: string }> {
	const record = downloads.get(downloadId);
	if (!record) {
		throw new Error('Unduhan pembaruan tidak ditemukan.');
	}

	if (record.status !== 'completed' || !record.filePath) {
		throw new Error('Unduhan belum siap dipasang.');
	}

	await access(record.filePath, constants.F_OK);
	const installerPath = record.filePath;

	if (process.platform !== 'win32') {
		throw new Error('Pemasangan otomatis hanya tersedia di Windows.');
	}

	if (record.installScheduled) {
		return { message: 'Pemasangan pembaruan sudah dijadwalkan.' };
	}

	const port = process.env.PORT ?? '3000';

	try {
		await new Promise<void>((resolve, reject) => {
			const child = spawn(installerPath, [], {
				detached: true,
				stdio: 'ignore',
				windowsHide: false
			});
			child.once('error', reject);
			child.once('spawn', () => {
				child.unref();
				resolve();
			});
		});
	} catch (error) {
		throw new Error(
			error instanceof Error ? error.message : 'Gagal menjalankan proses pemasangan pembaruan.'
		);
	}

	record.installScheduled = true;
	record.updatedAt = Date.now();

	setTimeout(() => {
		void requestLocalShutdown(port);
	}, 1000);

	return { message: 'Pemasangan pembaruan dijadwalkan. Ikuti petunjuk installer yang muncul.' };
}

export function toPublic(record: DownloadRecord): DownloadStatus {
	return {
		id: record.id,
		version: record.version,
		assetName: record.assetName,
		status: record.status,
		downloadedBytes: record.downloadedBytes,
		totalBytes: record.totalBytes,
		error: record.error ?? null,
		installScheduled: record.installScheduled
	};
}

export interface ReleaseSummary {
	version: string;
	name: string;
	notes: string;
	publishedAt: string;
	htmlUrl: string;
	isPrerelease: boolean;
	assets: UpdateAsset[];
}

export interface UpdateAsset {
	id: number;
	name: string;
	size: number;
	downloadUrl: string;
	contentType: string | null;
}

export interface DownloadStatus {
	id: string;
	version: string;
	assetName: string;
	status: DownloadState;
	downloadedBytes: number;
	totalBytes: number | null;
	error: string | null;
	installScheduled: boolean;
}

export { compareVersions, normalizeVersion, updateBaseDir as updateDownloadBaseDir, getAppVersion };
