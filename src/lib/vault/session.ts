import { loadStoredVault } from './keystore.js';
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

/** Called whenever the key becomes available or goes away. */
export function onVaultChange(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
