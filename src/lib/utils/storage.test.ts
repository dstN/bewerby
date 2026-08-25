import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

type StorageModule = typeof import('./storage.js');

async function loadStorageUtils(): Promise<StorageModule> {
	vi.resetModules();
	return import('./storage.js');
}

/** Installs a StorageManager stand-in; pass `null` for a browser (or Node,
 *  which is what actually runs these tests) that has no navigator.storage. */
function installStorageManager(manager: Partial<StorageManager> | null) {
	vi.stubGlobal('navigator', manager === null ? {} : { storage: manager });
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('requestPersistentStorage', () => {
	it('returns true when the browser grants persistence', async () => {
		installStorageManager({ persist: async () => true });
		const { requestPersistentStorage } = await loadStorageUtils();
		await expect(requestPersistentStorage()).resolves.toBe(true);
	});

	it('returns false when the browser silently denies (Chromium heuristics)', async () => {
		installStorageManager({ persist: async () => false });
		const { requestPersistentStorage } = await loadStorageUtils();
		await expect(requestPersistentStorage()).resolves.toBe(false);
	});

	it('returns false instead of throwing where the Storage API is missing entirely', async () => {
		installStorageManager(null);
		const { requestPersistentStorage } = await loadStorageUtils();
		await expect(requestPersistentStorage()).resolves.toBe(false);
	});

	it('returns false when navigator.storage exists but has no persist() (older Safari)', async () => {
		installStorageManager({ estimate: async () => ({}) });
		const { requestPersistentStorage } = await loadStorageUtils();
		await expect(requestPersistentStorage()).resolves.toBe(false);
	});

	it('swallows a rejected persist() rather than failing app startup', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		installStorageManager({
			persist: async () => {
				throw new Error('SecurityError');
			}
		});
		const { requestPersistentStorage } = await loadStorageUtils();
		await expect(requestPersistentStorage()).resolves.toBe(false);
		expect(errorSpy).toHaveBeenCalled();
	});
});

describe('isStoragePersisted', () => {
	it('reports the browser-reported state', async () => {
		installStorageManager({ persisted: async () => true });
		const { isStoragePersisted } = await loadStorageUtils();
		await expect(isStoragePersisted()).resolves.toBe(true);
	});

	it('returns false where the API is unavailable', async () => {
		installStorageManager(null);
		const { isStoragePersisted } = await loadStorageUtils();
		await expect(isStoragePersisted()).resolves.toBe(false);
	});

	it('swallows a rejected persisted() call', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		installStorageManager({
			persisted: async () => {
				throw new Error('nope');
			}
		});
		const { isStoragePersisted } = await loadStorageUtils();
		await expect(isStoragePersisted()).resolves.toBe(false);
	});
});

describe('getStorageEstimate', () => {
	it('maps usage/quota onto the app-facing shape', async () => {
		installStorageManager({ estimate: async () => ({ usage: 1234, quota: 5_000_000 }) });
		const { getStorageEstimate } = await loadStorageUtils();
		await expect(getStorageEstimate()).resolves.toEqual({
			usageBytes: 1234,
			quotaBytes: 5_000_000
		});
	});

	it('reports a genuine zero usage rather than treating it as "unknown"', async () => {
		installStorageManager({ estimate: async () => ({ usage: 0, quota: 5_000_000 }) });
		const { getStorageEstimate } = await loadStorageUtils();
		await expect(getStorageEstimate()).resolves.toEqual({ usageBytes: 0, quotaBytes: 5_000_000 });
	});

	it('returns null when the browser omits either figure', async () => {
		installStorageManager({ estimate: async () => ({ usage: 1234 }) });
		const { getStorageEstimate } = await loadStorageUtils();
		await expect(getStorageEstimate()).resolves.toBeNull();
	});

	it('returns null where the API is unavailable', async () => {
		installStorageManager(null);
		const { getStorageEstimate } = await loadStorageUtils();
		await expect(getStorageEstimate()).resolves.toBeNull();
	});

	it('swallows a rejected estimate() and returns null', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		installStorageManager({
			estimate: async () => {
				throw new Error('nope');
			}
		});
		const { getStorageEstimate } = await loadStorageUtils();
		await expect(getStorageEstimate()).resolves.toBeNull();
	});
});
