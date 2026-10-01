import { browser } from '$app/env';

/**
 * Requests persistent storage from the browser, so it won't evict this
 * origin's IndexedDB/OPFS data under storage pressure the way "best effort"
 * storage can be. Safe to call repeatedly - browsers no-op if already
 * granted, and most (Firefox) auto-grant based on site engagement without
 * ever prompting, while others (Chromium) may silently deny depending on
 * heuristics. Either way, the actual state is always readable via
 * isStoragePersisted().
 */
export async function requestPersistentStorage(): Promise<boolean> {
	if (!browser || !('storage' in navigator) || !navigator.storage.persist) return false;
	try {
		return await navigator.storage.persist();
	} catch (err) {
		console.error('Failed to request persistent storage:', err);
		return false;
	}
}

export async function isStoragePersisted(): Promise<boolean> {
	if (!browser || !('storage' in navigator) || !navigator.storage.persisted) return false;
	try {
		return await navigator.storage.persisted();
	} catch (err) {
		console.error('Failed to read storage persistence state:', err);
		return false;
	}
}

export interface StorageEstimate {
	usageBytes: number;
	quotaBytes: number;
}

export async function getStorageEstimate(): Promise<StorageEstimate | null> {
	if (!browser || !('storage' in navigator) || !navigator.storage.estimate) return null;
	try {
		const { usage, quota } = await navigator.storage.estimate();
		if (usage === undefined || quota === undefined) return null;
		return { usageBytes: usage, quotaBytes: quota };
	} catch (err) {
		console.error('Failed to read storage estimate:', err);
		return null;
	}
}
