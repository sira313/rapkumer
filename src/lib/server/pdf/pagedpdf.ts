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

		await page.addScriptTag({
			content: `
class RepeatTableHeadersHandler extends Paged.Handler {
	constructor(chunker, polisher, caller) {
		super(chunker, polisher, caller);
		this.splitTablesRefs = [];
	}

	afterPageLayout(pageElement, page, breakToken, chunker) {
		this.chunker = chunker;
		this.splitTablesRefs = [];

		if (breakToken) {
			const node = breakToken.node;
			const tables = this.findAllAncestors(node, 'table');
			if (node.tagName === 'TABLE') tables.push(node);

			if (tables.length > 0) {
				this.splitTablesRefs = tables.map((t) => t.dataset.ref);

				const thead =
					node.tagName === 'THEAD' ? node : this.findFirstAncestor(node, 'thead');
				if (thead) {
					const lastTheadNode = thead.hasChildNodes() ? thead.lastChild : thead;
					breakToken.node = this.nodeAfter(lastTheadNode, chunker.source);
				}

				this.hideEmptyTables(pageElement, node);
			}
		}
	}

	hideEmptyTables(pageElement, breakTokenNode) {
		this.splitTablesRefs.forEach((ref) => {
			const table = pageElement.querySelector("[data-ref='" + ref + "']");
			if (table) {
				const sourceBody = table.querySelector('tbody > tr');
				if (
					!sourceBody ||
					this.refEquals(sourceBody.firstElementChild, breakTokenNode)
				) {
					table.style.visibility = 'hidden';
					table.style.position = 'absolute';
					const lineSpacer = table.nextSibling;
					if (lineSpacer) {
						lineSpacer.style.visibility = 'hidden';
						lineSpacer.style.position = 'absolute';
					}
				}
			}
		});
	}

	refEquals(a, b) {
		return a && a.dataset && b && b.dataset && a.dataset.ref === b.dataset.ref;
	}

	findFirstAncestor(element, selector) {
		while (element.parentNode && element.parentNode.nodeType === 1) {
			if (element.parentNode.matches(selector)) return element.parentNode;
			element = element.parentNode;
		}
		return null;
	}

	findAllAncestors(element, selector) {
		const ancestors = [];
		while (element.parentNode && element.parentNode.nodeType === 1) {
			if (element.parentNode.matches(selector)) ancestors.unshift(element.parentNode);
			element = element.parentNode;
		}
		return ancestors;
	}

	layout(rendered, layout) {
		this.splitTablesRefs.forEach((ref) => {
			const renderedTable = rendered.querySelector("[data-ref='" + ref + "']");
			if (renderedTable && !renderedTable.hasAttribute('repeated-headers')) {
				const sourceTable = this.chunker.source.querySelector("[data-ref='" + ref + "']");
				this.repeatColgroup(sourceTable, renderedTable);
				this.repeatTHead(sourceTable, renderedTable);
				renderedTable.setAttribute('repeated-headers', 'true');
			}
		});
	}

	repeatColgroup(sourceTable, renderedTable) {
		const colgroup = sourceTable.querySelectorAll('colgroup');
		const firstChild = renderedTable.firstChild;
		colgroup.forEach((cg) => {
			const cloned = cg.cloneNode(true);
			renderedTable.insertBefore(cloned, firstChild);
		});
	}

	repeatTHead(sourceTable, renderedTable) {
		const thead = sourceTable.querySelector('thead');
		if (thead && renderedTable.firstChild?.tagName !== 'THEAD') {
			const cloned = thead.cloneNode(true);
			renderedTable.insertBefore(cloned, renderedTable.firstChild);
		}
	}

	nodeAfter(node, limiter) {
		if (limiter && node === limiter) return;
		let significantNode = this.nextSignificantNode(node);
		if (significantNode) return significantNode;
		if (node.parentNode) {
			while ((node = node.parentNode)) {
				if (limiter && node === limiter) return;
				significantNode = this.nextSignificantNode(node);
				if (significantNode) return significantNode;
			}
		}
	}

	nextSignificantNode(sib) {
		while ((sib = sib.nextSibling)) {
			if (!this.isIgnorable(sib)) return sib;
		}
		return null;
	}

	isIgnorable(node) {
		return (
			node.nodeType === 8 ||
			(node.nodeType === 3 && this.isAllWhitespace(node))
		);
	}

	isAllWhitespace(node) {
		return !/[^\\t\\n\\r ]/.test(node.textContent);
	}
}
Paged.registerHandlers(RepeatTableHeadersHandler);
`
		});

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
