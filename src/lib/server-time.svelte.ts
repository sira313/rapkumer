import { browser } from '$app/environment';

export const serverTime = $state<{ now: Date }>({ now: new Date() });

async function fetchServerTime() {
	try {
		const res = await fetch('/api/server-time');
		const data: { iso: string } = await res.json();
		serverTime.now = new Date(data.iso);
	} catch {
		serverTime.now = new Date();
	}
}

if (browser) {
	fetchServerTime();
	setInterval(fetchServerTime, 60_000);
}
