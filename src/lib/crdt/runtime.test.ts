import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import type { Application } from '#lib/db/index.js';
import type { Profile } from '#lib/utils/profile.js';

// One in-memory OPFS for the whole file; every device gets fresh names in
// it, as real devices get fresh names on their own disks.
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
const { SyncRuntime, SnapshotError } = await import('./runtime.js');

function device() {
	return new BewerbyDatabase(`bewerby-sync-${Math.random().toString(36).slice(2)}`);
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

async function companies(db: InstanceType<typeof BewerbyDatabase>) {
	return (await db.applications.toArray()).map((row) => row.company).sort();
}

async function storePdf(text: string) {
	const ref = `local-${++written}.pdf`;
	files.set(ref, new TextEncoder().encode(text));
	return ref;
}

describe('sync runtime', () => {
	it('adopts the rows a device already has, without changing them', async () => {
		const db = device();
		await db.applications.add({
			...fields({ company: 'Alt AG' }),
			createdAt: 1,
			updatedAt: 2,
			history: []
		});
		const before = await db.applications.toArray();

		await SyncRuntime.open(db);
		const after = await db.applications.toArray();
		expect(after).toHaveLength(1);
		expect(after[0].uid).toEqual(expect.any(String));
		expect({ ...after[0], uid: undefined }).toEqual({ ...before[0], uid: undefined });
	});

	it('applies the repository rules to the document and persists them', async () => {
		const db = device();
		const sync = await SyncRuntime.open(db);
		const id = await sync.create(fields({ status: 'rejected', rejectedAt: 5 }), 1000);
		await sync.update(id, { status: 'interview', notes: 'Rückruf' }, 2000);

		let row = await db.applications.get(id);
		expect(row?.history.map((entry) => entry.status)).toEqual(['rejected', 'interview']);
		expect(row?.rejectedAt).toBeUndefined();
		expect(row).toMatchObject({ status: 'interview', notes: 'Rückruf', updatedAt: 2000 });

		// A second start reads the same state back out of the persisted updates.
		await sync.close();
		await SyncRuntime.open(db);
		row = await db.applications.get(id);
		expect(row).toMatchObject({ status: 'interview', notes: 'Rückruf' });
	});

	it('adopts a row written while sync was off instead of deleting it', async () => {
		const db = device();
		const sync = await SyncRuntime.open(db);
		await sync.create(fields({ company: 'Mit Sync AG' }), 1000);
		await sync.close();
		await db.applications.add({
			...fields({ company: 'Ohne Sync AG' }),
			uid: crypto.randomUUID(),
			createdAt: 2,
			updatedAt: 2,
			history: []
		});

		await SyncRuntime.open(db);
		expect(await companies(db)).toEqual(['Mit Sync AG', 'Ohne Sync AG']);
	});

	it('merges two devices both ways, PDFs included, and every edit survives', async () => {
		const laptop = device();
		const phone = device();
		const a = await SyncRuntime.open(laptop);
		const b = await SyncRuntime.open(phone);

		const ad = await storePdf('%PDF Anzeige Fabrikam');
		const fabrikamOnLaptop = await a.create(
			fields({ company: 'Fabrikam AG', notes: 'Hallo Welt', pdfRef: ad, pdfName: 'anzeige.pdf' }),
			1000
		);
		await b.create(fields({ company: 'Northwind GmbH' }), 1100);

		await b.merge(await a.exportSnapshot());
		expect(await companies(phone)).toEqual(['Fabrikam AG', 'Northwind GmbH']);

		// The PDF arrived under the phone's own file name, with the same bytes.
		const fabrikamOnPhone = (await phone.applications.toArray()).find(
			(row) => row.company === 'Fabrikam AG'
		)!;
		expect(fabrikamOnPhone.pdfRef).toBeDefined();
		expect(fabrikamOnPhone.pdfRef).not.toBe(ad);
		expect(new TextDecoder().decode(files.get(fabrikamOnPhone.pdfRef!))).toBe(
			'%PDF Anzeige Fabrikam'
		);

		// Both edit the same notes offline, then exchange again.
		await a.update(fabrikamOnLaptop, { notes: 'Hallo schöne Welt' }, 2000);
		await b.update(fabrikamOnPhone.id!, { notes: 'Hallo Welt!' }, 2100);
		await b.merge(await a.exportSnapshot());
		await a.merge(await b.exportSnapshot());

		expect((await laptop.applications.get(fabrikamOnLaptop))?.notes).toBe('Hallo schöne Welt!');
		expect((await phone.applications.get(fabrikamOnPhone.id!))?.notes).toBe('Hallo schöne Welt!');
		expect(await companies(laptop)).toEqual(['Fabrikam AG', 'Northwind GmbH']);
	});

	it('carries a deletion to the other device, and it does not come back', async () => {
		const laptop = device();
		const phone = device();
		const a = await SyncRuntime.open(laptop);
		const b = await SyncRuntime.open(phone);
		const id = await a.create(fields({ company: 'Weg AG' }), 1000);
		await a.create(fields({ company: 'Bleibt AG' }), 1000);
		await b.merge(await a.exportSnapshot());

		await a.remove(id);
		await b.merge(await a.exportSnapshot());
		expect(await companies(phone)).toEqual(['Bleibt AG']);

		// The phone's older state does not resurrect it on the laptop.
		await a.merge(await b.exportSnapshot());
		expect(await companies(laptop)).toEqual(['Bleibt AG']);
	});

	it('replaces this device with a snapshot when asked to restore instead of merge', async () => {
		const laptop = device();
		const phone = device();
		const a = await SyncRuntime.open(laptop);
		const b = await SyncRuntime.open(phone);
		await a.create(fields({ company: 'Vom Laptop AG' }), 1000);
		await b.create(fields({ company: 'Vom Handy AG' }), 1000);

		const fresh = await b.replaceWith(await a.exportSnapshot());
		expect(await companies(phone)).toEqual(['Vom Laptop AG']);
		await fresh.create(fields({ company: 'Danach AG' }), 2000);
		expect(await companies(phone)).toEqual(['Danach AG', 'Vom Laptop AG']);
	});

	it('syncs the profile, CV included, and hands it to the store', async () => {
		const laptop = device();
		const phone = device();
		const a = await SyncRuntime.open(laptop);
		const b = await SyncRuntime.open(phone);
		const cv = await storePdf('%PDF Lebenslauf');
		await a.attachProfile({
			get: (): Profile => ({
				senderName: 'Petra Musterfrau',
				senderStreet: 'Hauptstraße 1',
				senderCity: '12345 Musterstadt',
				senderEmail: 'petra@example.org',
				senderPhone: '',
				cvRef: cv,
				cvName: 'lebenslauf.pdf'
			}),
			set: () => {}
		});
		let received: Profile | undefined;
		await b.attachProfile({
			get: (): Profile => ({
				senderName: '',
				senderStreet: '',
				senderCity: '',
				senderEmail: '',
				senderPhone: ''
			}),
			set: (profile) => (received = profile)
		});

		await b.merge(await a.exportSnapshot());
		expect(received).toMatchObject({ senderName: 'Petra Musterfrau', cvName: 'lebenslauf.pdf' });
		expect(new TextDecoder().decode(files.get(received!.cvRef!))).toBe('%PDF Lebenslauf');
	});

	it('refuses a broken snapshot and leaves the device as it was', async () => {
		const db = device();
		const sync = await SyncRuntime.open(db);
		await sync.create(fields({ company: 'Unberührt AG' }), 1000);
		await expect(
			sync.merge({ update: new Uint8Array([1, 2, 3, 4, 5]), blobs: {} })
		).rejects.toBeInstanceOf(SnapshotError);
		expect(await companies(db)).toEqual(['Unberührt AG']);
	});

	it('compacts its persisted updates on start once there are many', async () => {
		const db = device();
		const sync = await SyncRuntime.open(db);
		const id = await sync.create(fields(), 1000);
		for (let i = 0; i < 210; i++) await sync.update(id, { title: `Version ${i}` }, 1000 + i);
		await sync.close();
		expect(await db.crdt.count()).toBeGreaterThan(200);

		await SyncRuntime.open(db);
		expect(await db.crdt.count()).toBe(1);
		expect((await db.applications.get(id))?.title).toBe('Version 209');
	});
});
