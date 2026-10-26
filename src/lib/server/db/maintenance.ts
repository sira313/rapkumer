import { AsyncLocalStorage } from 'node:async_hooks';
import { error } from '@sveltejs/kit';

const owner = new AsyncLocalStorage<symbol>();
let activeOwner: symbol | undefined;
let maintenance = false;
let requests = 0;
let backgroundJobs = 0;
let recoveryFailed = false;

export function blockDatabaseAfterRecoveryFailure() {
	recoveryFailed = true;
}

export function assertDatabaseAvailable() {
	if (recoveryFailed || (maintenance && owner.getStore() !== activeOwner)) {
		throw error(503, 'Database sedang dalam pemeliharaan. Coba lagi setelah proses selesai.');
	}
}

export async function withDatabaseBackground<T>(run: () => Promise<T>): Promise<T | undefined> {
	if (maintenance || recoveryFailed) return;
	backgroundJobs++;
	try {
		return await run();
	} finally {
		backgroundJobs--;
	}
}

export async function withDatabaseRequest<T>(run: () => Promise<T>): Promise<T> {
	assertDatabaseAvailable();
	requests++;
	try {
		return await run();
	} finally {
		requests--;
	}
}

export async function withDatabaseMaintenance<T>(run: () => Promise<T>): Promise<T> {
	if (maintenance || recoveryFailed || requests > 1 || backgroundJobs > 0) {
		throw error(503, 'Database sedang digunakan. Coba impor lagi setelah proses lain selesai.');
	}
	maintenance = true;
	activeOwner = Symbol('database-maintenance');
	try {
		return await owner.run(activeOwner, run);
	} finally {
		activeOwner = undefined;
		maintenance = false;
	}
}
