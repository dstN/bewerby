import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { contentKey } from './crypto.js';
import { KeyDatabase, forgetRoot, loadStoredVault, storeVault } from './keystore.js';
import { createVault } from './vault.js';

const FAST_KDF = { m: 256, t: 1, p: 1 };

function freshDb() {
	return new KeyDatabase(`bewerby-keys-test-${Math.random().toString(36).slice(2)}`);
}

describe('keystore', () => {
	it('keeps a remembered root usable across a reload, and drops it on request', async () => {
		const database = freshDb();
		const { vault } = await createVault('ein langes passwort', FAST_KDF);
		await storeVault(vault.header, vault.root, database);

		const loaded = await loadStoredVault(database);
		expect(loaded?.header).toEqual(vault.header);
		expect(loaded?.root).toBeInstanceOf(CryptoKey);
		expect(loaded?.root?.extractable).toBe(false);
		await expect(contentKey(loaded!.root!, 'file')).resolves.toBeInstanceOf(CryptoKey);

		await forgetRoot(database);
		const forgotten = await loadStoredVault(database);
		expect(forgotten?.header).toEqual(vault.header);
		expect(forgotten?.root).toBeUndefined();
	});

	it('treats a tampered header as no vault instead of throwing', async () => {
		const database = freshDb();
		const { vault } = await createVault('ein langes passwort', FAST_KDF);
		await storeVault(
			{ ...vault.header, kdf: { ...vault.header.kdf, m: 1e12 } },
			undefined,
			database
		);
		await expect(loadStoredVault(database)).resolves.toBeUndefined();
	});
});
