import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * eraseAllData() is the app's right-to-erasure implementation, so what
 * matters is that it clears *every* store - a step silently skipped would
 * leave personal data behind while the UI reports success. These tests
 * assert each store is reached, and that a failure in one of the
 * best-effort steps never aborts the ones after it.
 */

vi.mock('$app/environment', () => ({ browser: true }));

const dbDelete = vi.fn(async () => {});
vi.mock('$lib/db/index.js', () => ({ db: { delete: () => dbDelete() } }));

const isOpfsSupported = vi.fn(() => true);
vi.mock('$lib/utils/opfs.js', () => ({ isOpfsSupported: () => isOpfsSupported() }));

let removedOpfsEntries: Array<{ name: string; options?: { recursive?: boolean } }>;
let deletedCaches: string[];
let closedNotifications: number;

function installBrowserApis({
	cacheNames = ['bewerby-precache-v1', 'bewerby-runtime'],
	notifications = 2,
	opfsRemoveFails = false,
	serviceWorkerReadyFails = false
} = {}) {
	removedOpfsEntries = [];
	deletedCaches = [];
	closedNotifications = 0;

	vi.stubGlobal('navigator', {
		storage: {
			getDirectory: async () => ({
				removeEntry: async (name: string, options?: { recursive?: boolean }) => {
					if (opfsRemoveFails) throw new Error('NotFoundError');
					removedOpfsEntries.push({ name, options });
				}
			})
		},
		serviceWorker: {
			get ready() {
				return serviceWorkerReadyFails
					? Promise.reject(new Error('no registration'))
					: Promise.resolve({
							getNotifications: async () =>
								Array.from({ length: notifications }, () => ({
									close: () => void closedNotifications++
								}))
						});
			}
		}
	});

	vi.stubGlobal('caches', {
		keys: async () => cacheNames,
		delete: async (name: string) => {
			deletedCaches.push(name);
			return true;
		}
	});

	// eraseAllData() feature-detects both of these off `window`.
	vi.stubGlobal('window', { caches: globalThis.caches });
}

async function loadEraser() {
	vi.resetModules();
	return import('./eraseAllData.js');
}

beforeEach(() => {
	dbDelete.mockClear();
	isOpfsSupported.mockReturnValue(true);
	installBrowserApis();
	localStorage.setItem('bewerby-theme', 'dark');
	localStorage.setItem('bewerby-locale', 'en');
	localStorage.setItem('bewerby_notified_1_123', 'true');
	// The profile carries the applicant's own name, address, e-mail and phone,
	// so it is exactly the kind of thing right-to-erasure must not leave behind.
	localStorage.setItem(
		'bewerby-profile',
		JSON.stringify({ senderName: 'Petra Musterfrau', cvRef: 'cv-1.pdf' })
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('eraseAllData', () => {
	it('deletes the IndexedDB database', async () => {
		const { eraseAllData } = await loadEraser();
		await eraseAllData();
		expect(dbDelete).toHaveBeenCalledOnce();
	});

	it('removes the whole OPFS PDF directory recursively, not file by file', async () => {
		const { eraseAllData } = await loadEraser();
		await eraseAllData();
		expect(removedOpfsEntries).toEqual([
			{ name: 'application-pdfs', options: { recursive: true } }
		]);
	});

	it('skips OPFS entirely where it is unsupported', async () => {
		isOpfsSupported.mockReturnValue(false);
		const { eraseAllData } = await loadEraser();
		await eraseAllData();
		expect(removedOpfsEntries).toEqual([]);
	});

	it('leaves no trace of the applicant profile behind', async () => {
		expect(localStorage.getItem('bewerby-profile')).not.toBeNull();
		const { eraseAllData } = await loadEraser();
		await eraseAllData();
		expect(localStorage.getItem('bewerby-profile')).toBeNull();
	});

	it('clears every localStorage key, including settings and reminder markers', async () => {
		const { eraseAllData } = await loadEraser();
		await eraseAllData();
		expect(localStorage.length).toBe(0);
	});

	it('deletes every Cache Storage entry, so no offline copy survives', async () => {
		const { eraseAllData } = await loadEraser();
		await eraseAllData();
		expect(deletedCaches).toEqual(['bewerby-precache-v1', 'bewerby-runtime']);
	});

	it('closes notifications still on screen, which would otherwise leak a company name', async () => {
		const { eraseAllData } = await loadEraser();
		await eraseAllData();
		expect(closedNotifications).toBe(2);
	});

	it('leaves the origin in a fresh-install state in one pass', async () => {
		const { eraseAllData } = await loadEraser();
		await eraseAllData();

		expect(dbDelete).toHaveBeenCalledOnce();
		expect(removedOpfsEntries).toHaveLength(1);
		expect(localStorage.length).toBe(0);
		expect(deletedCaches).toHaveLength(2);
		expect(closedNotifications).toBe(2);
	});
});

describe('eraseAllData resilience', () => {
	it('carries on past an OPFS directory that was already gone', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		installBrowserApis({ opfsRemoveFails: true });
		const { eraseAllData } = await loadEraser();

		await expect(eraseAllData()).resolves.toBeUndefined();
		expect(warnSpy).toHaveBeenCalled();
		// The steps *after* the failure still ran - that is the point.
		expect(localStorage.length).toBe(0);
		expect(deletedCaches).toHaveLength(2);
	});

	it('carries on when there is no service worker registration to query', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		installBrowserApis({ serviceWorkerReadyFails: true });
		const { eraseAllData } = await loadEraser();

		await expect(eraseAllData()).resolves.toBeUndefined();
		expect(warnSpy).toHaveBeenCalled();
		expect(localStorage.length).toBe(0);
		expect(deletedCaches).toHaveLength(2);
	});

	it('handles an origin with nothing cached and nothing on screen', async () => {
		installBrowserApis({ cacheNames: [], notifications: 0 });
		const { eraseAllData } = await loadEraser();

		await expect(eraseAllData()).resolves.toBeUndefined();
		expect(deletedCaches).toEqual([]);
		expect(closedNotifications).toBe(0);
	});

	it('propagates a failed database delete rather than reporting a clean wipe', async () => {
		dbDelete.mockRejectedValueOnce(new Error('DatabaseClosedError'));
		const { eraseAllData } = await loadEraser();
		await expect(eraseAllData()).rejects.toThrow('DatabaseClosedError');
	});
});
