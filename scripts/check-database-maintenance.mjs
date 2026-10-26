import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
	const m = await server.ssrLoadModule('/src/lib/server/db/maintenance.ts');
	const unavailable = (e) => e.status === 503;
	let staleAccess;
	let runStale;
	const staleTrigger = new Promise((resolve) => {
		runStale = resolve;
	});
	await m.withDatabaseMaintenance(async () => {
		staleAccess = staleTrigger.then(() => {
			assert.throws(() => m.assertDatabaseAvailable(), unavailable);
		});
	});
	await m.withDatabaseMaintenance(async () => {
		runStale();
		await staleAccess;
	});
	await m.withDatabaseRequest(async () => {
		await m.withDatabaseRequest(async () => {
			await assert.rejects(
				m.withDatabaseMaintenance(async () => {}),
				unavailable
			);
		});
	});
	await m.withDatabaseBackground(async () => {
		await assert.rejects(
			m.withDatabaseMaintenance(async () => {}),
			unavailable
		);
	});
	let release;
	let entered;
	const ready = new Promise((resolve) => {
		entered = resolve;
	});
	const wait = new Promise((resolve) => {
		release = resolve;
	});
	const maintenance = m.withDatabaseMaintenance(async () => {
		m.assertDatabaseAvailable();
		entered();
		await wait;
	});
	await ready;
	await assert.rejects(
		m.withDatabaseRequest(async () => {}),
		unavailable
	);
	let backgroundRan = false;
	await m.withDatabaseBackground(async () => {
		backgroundRan = true;
	});
	assert.equal(backgroundRan, false);
	release();
	await maintenance;
	m.assertDatabaseAvailable();
	await assert.rejects(
		m.withDatabaseMaintenance(async () => {
			throw new Error('activation failed');
		})
	);
	m.assertDatabaseAvailable();
	await m.withDatabaseMaintenance(async () => {
		m.blockDatabaseAfterRecoveryFailure();
	});
	assert.throws(() => m.assertDatabaseAvailable(), unavailable);
	await assert.rejects(
		m.withDatabaseMaintenance(async () => {}),
		unavailable
	);
	console.log(
		'Database maintenance: concurrent requests, background jobs, owner access, release and failed recovery passed'
	);
} finally {
	await server.close();
}
