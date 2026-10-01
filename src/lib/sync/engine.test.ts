import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import type { Application } from '$lib/db/index.js';

const files = new Map<string, Uint8Array>();
let written = 0;
vi.mock('$lib/utils/opfs.js', () => ({
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

const { BewerbyDatabase } = await import('$lib/db/index.js');
const { SyncRuntime } = await import('$lib/crdt/runtime.js');
const { createVault } = await import('$lib/vault/vault.js');
const { SyncEngine } = await import('./engine.js');
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

async function device(vault: Awaited<ReturnType<typeof createVault>>['vault'], store: RemoteStore) {
	const db = new BewerbyDatabase(`bewerby-engine-${Math.random().toString(36).slice(2)}`);
	const runtime = await SyncRuntime.open(db);
	const state = new SyncState(db);
	runtime.onLocalChange(() => void state.markDirty());
	const sync = () => new SyncEngine(runtime, store, vault, state).run();
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
			expect(path).toMatch(/^(upd\/[0-9a-f-]+\/|snap\/|blob\/)[0-9a-z-]+\.bwv$/);
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
		expect([...store.files.keys()].filter((path) => path.startsWith('blob/'))).toHaveLength(1);
		const report = await phone.sync();
		expect(report.blobsDown).toBe(1);
		const [row] = await rows(phone.db);
		expect(new TextDecoder().decode(files.get(row.pdfRef!))).toBe('%PDF Anzeige');
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
		expect(paths.filter((path) => path.startsWith('snap/'))).toHaveLength(1);
		expect(paths.filter((path) => path.startsWith('upd/')).length).toBeLessThanOrEqual(2);

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
			if (!edited && path.startsWith('upd/')) {
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
