import { enableSync } from '$lib/crdt/session.js';
import type { KeyHeader } from './format.js';
import { loadStoredVault, storeVault } from './keystore.js';
import type { UnlockedVault } from './vault.js';

/**
 * This device's vault with a usable key, for everything that encrypts in the
 * background (the sync runner, #53) and not only on the backup page: the key
 * unlocked during this visit, or the remembered one. Held in memory only;
 * keystore.ts is what persists.
 */

let unlocked: UnlockedVault | null = null;
const listeners = new Set<() => void>();

export async function unlockedVault(): Promise<UnlockedVault | null> {
	if (unlocked) return unlocked;
	const stored = await loadStoredVault();
	if (stored?.root) unlocked = { header: stored.header, root: stored.root };
	return unlocked;
}

export function setUnlockedVault(vault: UnlockedVault | null): void {
	unlocked = vault;
	for (const listener of listeners) listener();
}

/**
 * Makes a vault this device's own: stored (with the key, if it is to be
 * remembered), unlocked for this visit, and syncing from here on (#52).
 */
export async function adoptVault(
	header: KeyHeader,
	root: CryptoKey,
	remember: boolean
): Promise<void> {
	await storeVault(header, remember ? root : undefined);
	await enableSync();
	setUnlockedVault({ header, root });
}

/** Called whenever the key becomes available or goes away. */
export function onVaultChange(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
