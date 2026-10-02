import { browser } from '$app/env';
import { db } from '#lib/db/index.js';
import { syncRunner } from '#lib/sync/runner.svelte.js';
import { isOpfsSupported } from '#lib/utils/opfs.js';
import { deleteKeystore } from '#lib/vault/keystore.js';

/**
 * Exercises the right to erasure completely: both IndexedDB databases
 * (applications and backup keys), every attached PDF in
 * OPFS, all localStorage, every Cache Storage entry, and any notifications
 * still shown. Afterwards the origin is in the same state as a fresh
 * install - there is no partial/soft-delete state to reason about.
 *
 * A connected sync target is disconnected first, which revokes its access
 * token. With `remote`, this vault's encrypted files there are deleted too
 * (#56); if that fails, nothing here is erased either, so the user can
 * retry instead of losing the key to files that still exist.
 */
export async function eraseAllData({ remote = false }: { remote?: boolean } = {}): Promise<void> {
	if (!browser) return;

	await syncRunner.disconnect(remote);

	// db.delete() closes the connection and removes the IndexedDB database.
	await db.delete();
	// The encrypted-backup keys live in a database of their own (keystore.ts).
	await deleteKeystore();

	if (isOpfsSupported()) {
		try {
			const root = await navigator.storage.getDirectory();
			await root.removeEntry('application-pdfs', { recursive: true });
		} catch (err) {
			// Already gone, or never existed - not fatal for an erase operation.
			console.warn('Failed to remove OPFS PDF directory during erase:', err);
		}
	}

	localStorage.clear();

	if ('caches' in window) {
		const cacheNames = await caches.keys();
		await Promise.all(cacheNames.map((name) => caches.delete(name)));
	}

	if ('serviceWorker' in navigator) {
		try {
			const registration = await navigator.serviceWorker.ready;
			const notifications = await registration.getNotifications();
			for (const notification of notifications) notification.close();
		} catch (err) {
			console.warn('Failed to close open notifications during erase:', err);
		}
	}
}
