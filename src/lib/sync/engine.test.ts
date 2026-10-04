import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import type { Application } from '#lib/db/index.js';

const files = new Map<string, Uint8Array>();
let written = 0;
vi.mock('#lib/utils/opfs.js', () => ({
	writePdfToOpfs: vi.fn(async (blob: Blob) => {
		const ref = `file-${++written}.pdf`;
		files.set(ref, new Uint8Array(await blob.arrayBuffer()));
		return ref;
	}),
	readPdfFromOpfs: vi.fn(async (ref: string) => {
		const bytes = files.get(ref);
		return bytes ? new Blob([new Uint8Array(bytes)]) : null;
	})
}));

const { BewerbyDatabase } = await import('#lib/db/index.js');
const { SyncRuntime } = await import('#lib/crdt/runtime.js');
const { createVault, openFile, sealFile, unlock } = await import('#lib/vault/vault.js');
const { encodeSnapshot } = await import('#lib/crdt/snapshot.js');
const { SyncEngine, announceKey, eraseVaultFiles, vaultDir } = await import('./engine.js');
const { SyncState } = await import('./state.js');
import type { RemoteStore } from './port.js';

/** What a sync folder or Dropbox looks like to the engine. */
class MemoryStore implements RemoteStore {
	readonly files = new Map<string, Uint8Array>();
	async list() {
		return [...this.files.keys()];
	}
	async read(path: string) {
		const bytes = this.files.get(path);
		if (!bytes) throw new Error(`missing ${path}`);
		return bytes;
	}
	async write(path: string, bytes: Uint8Array) {
		this.files.set(path, new Uint8Array(bytes));
	}
	async remove(path: string) {
		this.files.delete(path);
	}
}

const FAST_KDF = { m: 256, t: 1, p: 1 };

type Vault = Awaited<ReturnType<typeof createVault>>['vault'];

async function device(vault: Vault, store: RemoteStore) {
	const db = new BewerbyDatabase(`bewerby-engine-${Math.random().toString(36).slice(2)}`);
	const runtime = await SyncRuntime.open(db);
	const state = new SyncState(db);
	runtime.onLocalChange(() => void state.markDirty());
	// The key can change (#56), and with the bewerby.de store the place too
	// (#58); each pass runs with the ones passed in.
	const sync = (key: Vault = vault, at: RemoteStore = store) =>
		new SyncEngine(runtime, at, key, state).run();
	return { db, runtime, state, sync };
}

function fields(overrides: Partial<Application> = {}) {
	return {
		title: 'Entwickler',
		company: 'Contoso GmbH',
		url: '',
		salary: '',
		contactName: '',
		contactEmail: '',
		contactPhone: '',
		notes: '',
		priority: 'medium' as const,
		status: 'sent' as const,
		tags: [],
		reminderInterval: 'none' as const,
		...overrides
	};
}

async function rows(db: InstanceType<typeof BewerbyDatabase>) {
	return (await db.applications.toArray()).sort((a, b) => a.company.localeCompare(b.company));
}

describe('sync engine', () => {
	it('brings two devices to the same state through the store, both ways', async () => {
		const { vault } = await createVault('ein langes passwort', FAST_KDF);
		const store = new MemoryStore();
		const laptop = await device(vault, store);
		const phone = await device(vault, store);

		const id = await laptop.runtime.create(
			fields({ company: 'Fabrikam AG', notes: 'Hallo Welt' }),
			1000
		);
		await phone.runtime.create(fields({ company: 'Northwind GmbH' }), 1100);
		await laptop.sync();
		await phone.sync();
		await laptop.sync();
		expect((await rows(laptop.db)).map((row) => row.company)).toEqual([
			'Fabrikam AG',
			'Northwind GmbH'
		]);
		expect((await rows(phone.db)).map((row) => row.company)).toEqual([
			'Fabrikam AG',
			'Northwind GmbH'
		]);

		const onPhone = (await rows(phone.db))[0];
		await laptop.runtime.update(id, { title: 'Senior Entwickler' }, 2000);
		await phone.runtime.update(onPhone.id!, { notes: 'Hallo Welt!' }, 2100);
		await laptop.sync();
		await phone.sync();
		await laptop.sync();
		expect(await laptop.db.applications.get(id)).toMatchObject({
			title: 'Senior Entwickler',
			notes: 'Hallo Welt!'
		});
		expect(await phone.db.applications.get(onPhone.id!)).toMatchObject({
			title: 'Senior Entwickler',
			notes: 'Hallo Welt!'
		});

		// Nothing but ciphertext under random names.
		for (const [path, bytes] of store.files) {
			expect(path).toMatch(/^[\w-]{22}\/0\/(upd\/[0-9a-f-]+\/|snap\/|blob\/)[0-9a-z-]+\.bwv$/);
			expect(Buffer.from(bytes).includes('Fabrikam')).toBe(false);
		}
	});

	it('moves PDFs between devices as separate encrypted files', async () => {
		const { vault } = await createVault('ein langes passwort', FAST_KDF);
		const store = new MemoryStore();
		const laptop = await device(vault, store);
		const phone = await device(vault, store);
		const ref = 'local-ad.pdf';
		files.set(ref, new TextEncoder().encode('%PDF Anzeige'));
		await laptop.runtime.create(fields({ pdfRef: ref, pdfName: 'anzeige.pdf' }), 1000);

		expect((await laptop.sync()).blobsUp).toBe(1);
		expect([...store.files.keys()].filter((path) => path.includes('/blob/'))).toHaveLength(1);
		const report = await phone.sync();
		expect(report.blobsDown).toBe(1);
		const [row] = await rows(phone.db);
		expect(new TextDecoder().decode(files.get(row.pdfRef!))).toBe('%PDF Anzeige');
	});

	it('removes the PDF of a replaced CV and of a deleted application from the store', async () => {
		const { vault } = await createVault('ein langes passwort', FAST_KDF);
		const store = new MemoryStore();
		const laptop = await device(vault, store);
		const blobs = () => [...store.files.keys()].filter((path) => path.includes('/blob/'));
		files.set('ad.pdf', new TextEncoder().encode('%PDF Anzeige'));
		files.set('cv-1.pdf', new TextEncoder().encode('%PDF Lebenslauf 1'));
		files.set('cv-2.pdf', new TextEncoder().encode('%PDF Lebenslauf 2'));
		const id = await laptop.runtime.create(fields({ pdfRef: 'ad.pdf', cvRef: 'cv-1.pdf' }), 1000);
		await laptop.sync();
		expect(blobs()).toHaveLength(2);

		await laptop.runtime.update(id, { cvRef: 'cv-2.pdf' }, 2000);
		const replaced = await laptop.sync();
		expect(replaced.blobsUp).toBe(1);
		expect(replaced.blobsRemoved).toBe(1);
		expect(blobs()).toHaveLength(2);

		await laptop.runtime.remove(id);
		expect((await laptop.sync()).blobsRemoved).toBe(2);
		expect(blobs()).toEqual([]);
	});

	it('keeps a PDF another device just added, though this one has not seen the application yet', async () => {
		const { vault } = await createVault('ein langes passwort', FAST_KDF);
		const store = new MemoryStore();
		const laptop = await device(vault, store);
		const phone = await device(vault, store);
		files.set('new-ad.pdf', new TextEncoder().encode('%PDF neu'));
		await laptop.runtime.create(fields({ pdfRef: 'new-ad.pdf' }), 1000);
		await laptop.sync();

		const report = await phone.sync();
		expect(report.blobsRemoved).toBe(0);
		expect(report.blobsDown).toBe(1);
		expect([...store.files.keys()].filter((path) => path.includes('/blob/'))).toHaveLength(1);
	});

	it('carries deletions, including text deleted without adding anything', async () => {
		const { vault } = await createVault('ein langes passwort', FAST_KDF);
		const store = new MemoryStore();
		const laptop = await device(vault, store);
		const phone = await device(vault, store);
		const keep = await laptop.runtime.create(
			fields({ company: 'Bleibt AG', notes: 'Langer Text' }),
			1000
		);
		const gone = await laptop.runtime.create(fields({ company: 'Weg AG' }), 1000);
		await laptop.sync();
		await phone.sync();

		await laptop.runtime.remove(gone);
		// A pure deletion: it moves no state vector, only the dirty flag knows.
		await laptop.runtime.update(keep, { notes: 'Lang' }, 2000);
		expect((await laptop.sync()).pushed).toBe(true);
		await phone.sync();
		expect((await rows(phone.db)).map((row) => [row.company, row.notes])).toEqual([
			['Bleibt AG', 'Lang']
		]);
	});

	it('does not push back what it just pulled', async () => {
		const { vault } = await createVault('ein langes passwort', FAST_KDF);
		const store = new MemoryStore();
		const laptop = await device(vault, store);
		const phone = await device(vault, store);
		await laptop.runtime.create(fields(), 1000);
		await laptop.sync();
		await phone.sync(); // first pass: pushes its (empty) state once
		const report = await phone.sync();
		expect(report.pushed).toBe(false);
		expect(report.applied).toBe(0);
	});

	it('rolls many update files into one snapshot that a new device starts from', async () => {
		const { vault } = await createVault('ein langes passwort', FAST_KDF);
		const store = new MemoryStore();
		const laptop = await device(vault, store);
		const id = await laptop.runtime.create(fields(), 1000);
		for (let i = 0; i < 32; i++) {
			await laptop.runtime.update(id, { title: `Version ${i}` }, 1000 + i);
			await laptop.sync();
		}
		const paths = [...store.files.keys()];
		expect(paths.filter((path) => path.includes('/snap/'))).toHaveLength(1);
		expect(paths.filter((path) => path.includes('/upd/')).length).toBeLessThanOrEqual(2);

		const newcomer = await device(vault, store);
		await newcomer.sync();
		expect((await rows(newcomer.db))[0].title).toBe('Version 31');
	});

	it('leaves files of another vault alone, even when compacting', async () => {
		const ours = await createVault('ein langes passwort', FAST_KDF);
		const theirs = await createVault('ein anderes passwort', FAST_KDF);
		const store = new MemoryStore();
		const stranger = await device(theirs.vault, store);
		await stranger.runtime.create(fields({ company: 'Fremd AG' }), 1000);
		await stranger.sync();
		const foreignFiles = [...store.files.keys()];

		const laptop = await device(ours.vault, store);
		const id = await laptop.runtime.create(fields({ company: 'Eigen AG' }), 1000);
		const first = await laptop.sync();
		expect(first.foreign).toBe(foreignFiles.length);
		for (let i = 0; i < 32; i++) {
			await laptop.runtime.update(id, { title: `V${i}` }, 2000 + i);
			await laptop.sync();
		}
		for (const path of foreignFiles) expect(store.files.has(path)).toBe(true);
		expect((await rows(laptop.db)).map((row) => row.company)).toEqual(['Eigen AG']);
	});

	it('keeps a change made while a push uploads for the next pass', async () => {
		const { vault } = await createVault('ein langes passwort', FAST_KDF);
		const store = new MemoryStore();
		const laptop = await device(vault, store);
		const id = await laptop.runtime.create(fields(), 1000);
		const write = store.write.bind(store);
		let edited = false;
		store.write = async (path, bytes) => {
			if (!edited && path.includes('/upd/')) {
				edited = true;
				await laptop.runtime.update(id, { notes: 'während des Uploads' }, 3000);
			}
			return write(path, bytes);
		};
		await laptop.sync();
		expect((await laptop.state.progress()).dirty).toBe(true);
		expect((await laptop.sync()).pushed).toBe(true);
	});
});

describe('changing the key (#56)', () => {
	async function twoDevices() {
		const old = await createVault('ein langes passwort', FAST_KDF);
		const store = new MemoryStore();
		const laptop = await device(old.vault, store);
		const phone = await device(old.vault, store);
		await laptop.runtime.create(fields({ company: 'Fabrikam AG' }), 1000);
		await phone.runtime.create(fields({ company: 'Northwind GmbH' }), 1100);
		await laptop.sync();
		await phone.sync();
		await laptop.sync();
		const next = await createVault('ein neues passwort', FAST_KDF, old.vault.header);
		return { old: old.vault, next: next.vault, store, laptop, phone };
	}

	it('moves everything under the new key and removes the files of the old one', async () => {
		const { old, next, store, laptop } = await twoDevices();
		expect(next.header.vaultId).toBe(old.header.vaultId);
		expect(next.header.epoch).toBe(1);

		const report = await laptop.sync(next);
		expect(report.pushed).toBe(true);
		expect(report.retired).toBeGreaterThan(0);
		const paths = [...store.files.keys()];
		expect(paths.every((path) => path.startsWith(`${vaultDir(old.header.vaultId)}/1/`))).toBe(true);
		// The old key opens none of it.
		for (const bytes of store.files.values()) {
			await expect(openFile(bytes, old.root)).rejects.toThrow();
		}
	});

	it('stops a device on the old key, which then follows with the new passphrase', async () => {
		const { old, next, store, laptop, phone } = await twoDevices();
		await laptop.sync(next);
		await laptop.runtime.create(fields({ company: 'Contoso GmbH' }), 3000);
		await laptop.sync(next);
		// Made on the phone before it learns about the new key.
		await phone.runtime.create(fields({ company: 'Litware Inc.' }), 3100);
		const before = new Set(store.files.keys());

		const stopped = await phone.sync(old);
		expect(stopped.newerKey?.epoch).toBe(1);
		expect(stopped.pushed).toBe(false);
		expect(new Set(store.files.keys())).toEqual(before);

		const root = await unlock(stopped.newerKey!, { passphrase: 'ein neues passwort' });
		await phone.sync({ header: stopped.newerKey!, root });
		await laptop.sync(next);
		const all = ['Contoso GmbH', 'Fabrikam AG', 'Litware Inc.', 'Northwind GmbH'];
		expect((await rows(phone.db)).map((row) => row.company)).toEqual(all);
		expect((await rows(laptop.db)).map((row) => row.company)).toEqual(all);
	});

	it('takes nothing from a removed device that keeps writing with the old key', async () => {
		const { old, next, store, laptop } = await twoDevices();
		await laptop.sync(next);
		const dir = vaultDir(old.header.vaultId);
		const stranger = await device(old, new MemoryStore());
		await stranger.runtime.create(fields({ company: 'Eindringling AG' }), 4000);
		const snapshot = encodeSnapshot(await stranger.runtime.exportSnapshot());
		// Where it would write by itself, and slipped into the new key's directory.
		store.files.set(`${dir}/0/upd/removed/a.bwv`, await sealFile(old, 'sync', snapshot));
		store.files.set(`${dir}/1/upd/removed/b.bwv`, await sealFile(old, 'sync', snapshot));

		const report = await laptop.sync(next);
		expect(report.applied).toBe(0);
		expect(report.unreadable).toBe(1);
		expect(store.files.has(`${dir}/0/upd/removed/a.bwv`)).toBe(false);
		expect((await rows(laptop.db)).map((row) => row.company)).not.toContain('Eindringling AG');
	});

	it('leaves word of the new key in the old place when every key has its own (#58)', async () => {
		const { old, next, store: oldSpace, laptop, phone } = await twoDevices();
		const newSpace = new MemoryStore();
		await laptop.runtime.create(fields({ company: 'Contoso GmbH' }), 3000);
		await announceKey(oldSpace, next);
		await laptop.sync(next, newSpace);

		// The old space keeps nothing but the notice, which the old key cannot open.
		const left = [...oldSpace.files.keys()];
		expect(left).toHaveLength(1);
		expect(left[0]).toMatch(new RegExp(`^${vaultDir(old.header.vaultId)}/1/upd/key/`));
		await expect(openFile(oldSpace.files.get(left[0])!, old.root)).rejects.toThrow();

		const stopped = await phone.sync(old, oldSpace);
		expect(stopped.newerKey?.epoch).toBe(1);
		const root = await unlock(stopped.newerKey!, { passphrase: 'ein neues passwort' });
		await phone.sync({ header: stopped.newerKey!, root }, newSpace);
		expect((await rows(phone.db)).map((row) => row.company)).toEqual([
			'Contoso GmbH',
			'Fabrikam AG',
			'Northwind GmbH'
		]);
	});

	it('erases every file of the vault from the store, all keys, and leaves other vaults be', async () => {
		const { old, next, store, laptop } = await twoDevices();
		await laptop.sync(next);
		const other = await createVault('ein anderes passwort', FAST_KDF);
		const stranger = await device(other.vault, store);
		await stranger.runtime.create(fields({ company: 'Fremd AG' }), 1000);
		await stranger.sync();
		const theirs = [...store.files.keys()].filter(
			(path) => !path.startsWith(vaultDir(old.header.vaultId))
		);

		await eraseVaultFiles(store, old.header.vaultId);
		expect([...store.files.keys()].sort()).toEqual(theirs.sort());

		// A device still connected notices and puts its whole document back,
		// so a newcomer does not start from half of it.
		expect((await laptop.sync(next)).pushed).toBe(true);
		const newcomer = await device(next, store);
		await newcomer.sync();
		expect((await rows(newcomer.db)).map((row) => row.company)).toEqual([
			'Fabrikam AG',
			'Northwind GmbH'
		]);
	});
});
