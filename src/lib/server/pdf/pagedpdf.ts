import puppeteer from 'puppeteer-core';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);

declare global {
	interface Window {
		PagedConfig?: {
			auto?: boolean;
			before?: () => void | Promise<void>;
			after?: (done?: unknown) => void | Promise<void>;
		};
		PagedPolyfill?: {
			on: (event: string, handler: (...args: unknown[]) => void) => void;
			preview: () => Promise<unknown>;
		};
		__onRendered?: () => void;
	}
}

type Browser = Awaited<ReturnType<typeof puppeteer.launch>>;

let polyfillScript: string | null = null;

function getPolyfillScript(): string {
	if (polyfillScript) return polyfillScript;
	const require = createRequire(__filename);
	const cliMain = require.resolve('pagedjs-cli');
	const pkgDir = resolve(dirname(cliMain), '..');
	const polyfillPath = resolve(pkgDir, 'dist/browser.js');
	polyfillScript = readFileSync(polyfillPath, 'utf-8');
	return polyfillScript;
}

function findChromeExecutable(): string | undefined {
	if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
	if (process.platform === 'win32') {
		const paths = [
			'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
			'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
			'C:\\Program Files\\Chromium\\Application\\chrome.exe'
		];
		for (const p of paths) {
			if (existsSync(p)) return p;
		}
	}
	const commonPaths = [
		'/usr/bin/google-chrome-stable',
		'/usr/bin/google-chrome',
		'/usr/bin/chromium-browser',
		'/usr/bin/chromium'
	];
	for (const p of commonPaths) {
		if (existsSync(p)) return p;
	}
	return undefined;
}

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
	if (browser) {
		try {
			await browser.version();
			return browser;
		} catch {
			browser = null;
		}
	}
	const executablePath = findChromeExecutable();
	browser = await puppeteer.launch({
		executablePath,
		headless: true,
		args: [
			'--no-sandbox',
			'--disable-setuid-sandbox',
			'--disable-dev-shm-usage',
			'--export-tagged-pdf'
		]
	});
	browser.on('disconnected', () => {
		browser = null;
	});
	return browser;
}

// ── PDF cache ──────────────────────────────────────────────────────

interface CacheEntry {
	pdf: Uint8Array;
	createdAt: number;
}

const pdfCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX = 30;

function htmlHash(html: string): string {
	return createHash('sha1').update(html, 'utf-8').digest('hex');
}

function cacheGet(key: string): Uint8Array | null {
	const entry = pdfCache.get(key);
	if (!entry) return null;
	if (Date.now() - entry.createdAt > CACHE_TTL) {
		pdfCache.delete(key);
		return null;
	}
	return entry.pdf;
}

function cacheSet(key: string, pdf: Uint8Array): void {
	if (pdfCache.size >= CACHE_MAX) {
		const oldest = pdfCache.keys().next().value;
		if (oldest) pdfCache.delete(oldest);
	}
	pdfCache.set(key, { pdf, createdAt: Date.now() });
}

export async function renderPDF(html: string): Promise<Uint8Array> {
	const key = htmlHash(html);
	const cached = cacheGet(key);
	if (cached) return cached;

	const b = await getBrowser();
	const page = await b.newPage();

	try {
		await page.emulateMediaType('print');
		await page.setContent(html, { waitUntil: 'load' });

		await page.evaluate(() => {
			window.PagedConfig = window.PagedConfig || {};
			window.PagedConfig.auto = false;
		});

		await page.addScriptTag({ content: getPolyfillScript() });

		let renderedResolve!: () => void;
		const rendered = new Promise<void>((resolve) => {
			renderedResolve = resolve;
		});

		await page.exposeFunction('__onRendered', () => {
			renderedResolve();
		});

		await page.evaluate(async () => {
			window.PagedPolyfill!.on('rendered', () => {
				window.__onRendered!();
			});

			if (window.PagedConfig?.before) {
				await window.PagedConfig.before();
			}

			await window.PagedPolyfill!.preview();

			if (window.PagedConfig?.after) {
				await window.PagedConfig.after();
			}
		});

		await rendered;
		await page.waitForSelector('.pagedjs_pages', { timeout: 30000 });
		await page.evaluate(() => document.fonts.ready);

		const pdf = await page.pdf({
			printBackground: true,
			preferCSSPageSize: true,
			margin: { top: '0', right: '0', bottom: '0', left: '0' }
		});

		const result = new Uint8Array(pdf);
		cacheSet(key, result);
		return result;
	} finally {
		await page.close();
	}
}
