import { goto, preloadData, pushState } from '$app/navigation';
import { appMenuItems } from './components/menu';

export const cookieNames = {
	ACTIVE_SEKOLAH_ID: 'active-sekolah-id',
	ACTIVE_KELAS_ID: 'active-kelas-id',
	AUTH_SESSION: 'rapkumer-session'
};

export function findTitleByPath(path: string, items = appMenuItems): string | undefined {
	path = path.replace(/\/+$/, '');
	for (const item of items) {
		if (item.path === path) {
			return item.title;
		}
		if (item.subMenu) {
			const found = findTitleByPath(path, item.subMenu);
			if (found) return found;
		}
	}
	return undefined;
}

export function unflatten<T = Record<string, unknown>>(
	obj: Record<string, unknown>,
	trim = true
): T {
	const result: Record<string, unknown> = {};
	for (const key in obj) {
		const parts = key.split('.');
		let current = result;
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (i === parts.length - 1) {
				const value = obj[key];
				current[part] = trim && typeof value == 'string' ? value.trim() : value;
			} else {
				if (!(part in current)) {
					current[part] = {};
				}
				current = current[part] as typeof current;
			}
		}
	}
	return result as T;
}

export function unflattenFormData<T = Record<string, unknown>>(formData: FormData, trim = true) {
	const obj = Object.fromEntries(formData);
	return unflatten<T>(obj, trim);
}

export function flatten<T = Record<string, unknown>>(obj: T, prefix = ''): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const key in obj) {
		if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
		const value = obj[key];
		const prefixedKey = prefix ? `${prefix}.${key}` : key;
		if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			Object.assign(result, flatten(value as Record<string, unknown>, prefixedKey));
		} else {
			result[prefixedKey] = value;
		}
	}
	return result;
}

export function populateForm<T = Record<string, unknown>>(form: HTMLFormElement, data: T) {
	for (const key in data) {
		const field = form.elements.namedItem(key);
		if (!field) continue;
		const value = data[key];

		if (field instanceof HTMLInputElement) {
			if (field.type === 'checkbox') {
				field.checked = !!value;
			} else if (field.type === 'radio') {
				const radios = form.querySelectorAll<HTMLInputElement>(`input[name="${key}"]`);
				radios.forEach((radio) => {
					radio.checked = radio.value === value;
				});
			} else if (field.type === 'file') {
				// Can't set value programmatically for security reasons
				continue;
			} else {
				field.value = value as typeof field.value;
			}
		} else if (field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
			field.value = value as typeof field.value;
		}
	}
}

export function searchQueryMarker(query?: string | null, target?: string | null) {
	if (!query || !target) return target;

	// escape special characters in the query string
	const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	// create a regular expression pattern to match the query string as whole words
	const pattern = new RegExp(escaped.split(/\s+/).join('|'), 'gi');

	// replace matches using the pattern
	return target.replace(pattern, (match) => `<mark>${match}</mark>`);
}

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(value: string): boolean {
	return timeRegex.test(value);
}

export async function delay(ms = 500) {
	return new Promise((r) => setTimeout(r, ms));
}

export function modalRoute(anchor: HTMLAnchorElement, name: string) {
	anchor.onclick = async (e) => {
		if (
			e.shiftKey || // or the link is opened in a new window
			e.metaKey ||
			e.ctrlKey // or a new tab (mac: metaKey, win/linux: ctrlKey)
			// should also consider clicking with a mouse scroll wheel
		)
			return;

		// prevent navigation
		e.preventDefault();

		const href = anchor.href;

		try {
			anchor.setAttribute('data-preloading', 'true');
			anchor.href = '#';

			// run `load` functions (or rather, get the result of the `load` functions
			// that are already running because of `data-sveltekit-preload-data`)
			const result = await preloadData(href);
			if (result.type === 'loaded' && result.status === 200) {
				/* eslint-disable-next-line svelte/no-navigation-without-resolve */
				pushState(href, { modal: { data: result.data, name: name } });
			} else {
				// something bad happened! try navigating
				/* eslint-disable-next-line svelte/no-navigation-without-resolve */
				goto(href);
			}
		} finally {
			anchor.removeAttribute('data-preloading');
			anchor.href = href;
		}
	};
}

export function autoSubmit(form: HTMLFormElement) {
	const btn = document.createElement('button');
	btn.hidden = true;
	btn.type = 'submit';
	form.appendChild(btn);

	let timer: ReturnType<typeof setTimeout>;

	function submit(e: Event) {
		clearTimeout(timer);
		if (e.target instanceof HTMLSelectElement) {
			btn.click();
		} else {
			timer = setTimeout(() => btn.click(), 550);
		}
	}

	form.addEventListener('input', submit);
	return {
		destroy() {
			form.removeEventListener('input', submit);
		}
	};
}
