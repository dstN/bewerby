import { db } from '$lib/db/index.js';
import { loadStoredVault } from '$lib/vault/keystore.js';
import type { ProfilePort, SyncRuntime } from './runtime.js';

/**
 * Whether this device syncs, and the running sync layer if it does. A device
 * syncs once it has a vault; until then nothing here loads Yjs. Kept apart
 * from runtime.ts so the repository and the stores can ask cheaply.
 */

let current: Promise<SyncRuntime | null> | null = null;
let profilePort: ProfilePort | undefined;

async function open(): Promise<SyncRuntime> {
	const { SyncRuntime } = await import('./runtime.js');
	const runtime = await SyncRuntime.open(db);
	if (profilePort) await runtime.attachProfile(profilePort);
	return runtime;
}

/** The sync layer, started on first use - or null on a device without a vault. */
export function activeSync(): Promise<SyncRuntime | null> {
	current ??= loadStoredVault()
		.then((vault) => (vault ? open() : null))
		.catch((err) => {
			// Writes fall back to the plain table; the next start adopts them.
			console.error('Starting sync failed:', err);
			current = null;
			return null;
		});
	return current;
}

/** Called right after a vault was created or adopted. */
export async function enableSync(): Promise<SyncRuntime | null> {
	if (current && (await current) === null) current = null;
	return activeSync();
}

/** After replaceWith(), which hands back a fresh runtime. */
export function useRuntime(runtime: SyncRuntime): void {
	current = Promise.resolve(runtime);
}

/** The profile store registers itself once it has loaded its state. */
export async function registerProfilePort(port: ProfilePort): Promise<void> {
	profilePort = port;
	const runtime = await current;
	await runtime?.attachProfile(port);
}
