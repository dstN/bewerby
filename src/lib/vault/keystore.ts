import Dexie, { type Table } from 'dexie';
import { parseKeyHeader, type KeyHeader } from './format.js';

/**
 * This device's vault, in an IndexedDB of its own ("bewerby-keys") rather
 * than as a table in bewerby-db: key material stays out of every query the
 * board, statistics and reminders run, and erasing it is one deleteDatabase.
 *
 * The header (wrapped keys, KDF parameters) is useless without the
 * passphrase or recovery key. The root key is only stored when the user
 * asked this device to remember it, and then as a non-extractable CryptoKey:
 * the browser can use it but will never hand its bytes back out.
 */
interface StoredVault {
	id: 'local';
	header: KeyHeader;
	root?: CryptoKey;
}

export class KeyDatabase extends Dexie {
	vault!: Table<StoredVault, string>;

	/** name defaults to the real database; tests pass a unique one for isolation. */
	constructor(name = 'bewerby-keys') {
		super(name);
		this.version(1).stores({ vault: 'id' });
	}
}

export const keyDb = new KeyDatabase();

export async function loadStoredVault(
	database: KeyDatabase = keyDb
): Promise<{ header: KeyHeader; root?: CryptoKey } | undefined> {
	const row = await database.vault.get('local');
	if (!row) return undefined;
	try {
		return {
			header: parseKeyHeader(row.header),
			root: row.root instanceof CryptoKey ? row.root : undefined
		};
	} catch {
		// A header that no longer validates opens nothing; treat it as absent
		// rather than taking the backup page down.
		return undefined;
	}
}

export async function storeVault(
	header: KeyHeader,
	root: CryptoKey | undefined,
	database: KeyDatabase = keyDb
): Promise<void> {
	await database.vault.put({ id: 'local', header, root });
}

/** Keeps the vault, drops the remembered key: the passphrase is asked for again. */
export async function forgetRoot(database: KeyDatabase = keyDb): Promise<void> {
	await database.vault.update('local', { root: undefined });
}

/** Right to erasure: removes the whole database. */
export async function deleteKeystore(database: KeyDatabase = keyDb): Promise<void> {
	await database.delete();
}
