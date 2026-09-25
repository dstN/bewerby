import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Dexie from 'dexie';

// writePdfToOpfs needs real OPFS (navigator.storage), unavailable under
// Node/vitest - mocked here so the v1->v2 migration can be exercised without
// it, while still recording what it was asked to persist.
const writtenBlobs: Blob[] = [];
vi.mock('$lib/utils/opfs.js', () => ({
	writePdfToOpfs: vi.fn(async (blob: Blob) => {
		writtenBlobs.push(blob);
		return `fake-ref-${writtenBlobs.length}.pdf`;
	})
}));

const { BewerbyDatabase } = await import('./index.js');

const APPLICATIONS_SCHEMA_V1 =
	'++id, title, company, priority, status, *tags, createdAt, updatedAt';

function uniqueDbName(): string {
	return `bewerby-test-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/** A minimal, v1-only Dexie schema, mirroring BewerbyDatabase before the pdfRef migration existed. */
class LegacyV1Database extends Dexie {
	// Loosely typed on purpose - this reproduces the pre-migration row shape.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	applications!: Dexie.Table<any, number>;

	constructor(name: string) {
		super(name);
		this.version(1).stores({ applications: APPLICATIONS_SCHEMA_V1 });
	}
}

function baseV1Row(overrides: Record<string, unknown> = {}) {
	return {
		title: 'Frontend Developer',
		company: 'Acme GmbH',
		url: '',
		salary: '',
		contactName: '',
		contactEmail: '',
		contactPhone: '',
		notes: '',
		priority: 'medium',
		status: 'draft',
		tags: [],
		reminderInterval: 'none',
		createdAt: 1_000_000,
		updatedAt: 1_000_000,
		history: [],
		...overrides
	};
}

beforeEach(() => {
	writtenBlobs.length = 0;
});

describe('Dexie v1 -> v2 migration (pdfBlob -> pdfRef via OPFS)', () => {
	it('moves an existing pdfBlob to OPFS and replaces it with a pdfRef string', async () => {
		const name = uniqueDbName();
		const pdfBytes = new TextEncoder().encode('%PDF-1.4 fake content');
		const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });

		const legacyDb = new LegacyV1Database(name);
		const insertedId = await legacyDb.table('applications').add(baseV1Row({ pdfBlob: blob }));
		legacyDb.close();

		const migratedDb = new BewerbyDatabase(name);
		await migratedDb.open();
		const row = await migratedDb.applications.get(insertedId as number);

		expect(row).toBeDefined();
		expect(row?.pdfRef).toBe('fake-ref-1.pdf');
		expect((row as unknown as { pdfBlob?: Blob }).pdfBlob).toBeUndefined();
		expect(writtenBlobs).toHaveLength(1);
		// IndexedDB structured-clones the Blob on write, so what the upgrade
		// callback reads back is a distinct object - compare content, not identity.
		expect(writtenBlobs[0].type).toBe(blob.type);
		expect(writtenBlobs[0].size).toBe(blob.size);
		await expect(writtenBlobs[0].text()).resolves.toBe(await blob.text());

		migratedDb.close();
		await Dexie.delete(name);
	});

	it('retries a PDF whose OPFS write failed during the upgrade on the next open', async () => {
		const { writePdfToOpfs } = await import('$lib/utils/opfs.js');
		const name = uniqueDbName();
		const blob = new Blob(['%PDF-1.4 stranded'], { type: 'application/pdf' });

		const legacyDb = new LegacyV1Database(name);
		const id = (await legacyDb.table('applications').add(baseV1Row({ pdfBlob: blob }))) as number;
		legacyDb.close();

		// Fails in the one-time upgrade and in the retry of that same open.
		vi.mocked(writePdfToOpfs)
			.mockRejectedValueOnce(new Error('QuotaExceededError'))
			.mockRejectedValueOnce(new Error('QuotaExceededError'));
		const firstOpen = new BewerbyDatabase(name);
		await firstOpen.open();
		const stranded = await firstOpen.table('applications').get(id);
		expect(stranded.pdfBlob).toBeInstanceOf(Blob);
		expect(stranded.pdfRef).toBeUndefined();
		firstOpen.close();

		const secondOpen = new BewerbyDatabase(name);
		await secondOpen.open();
		const row = await secondOpen.table('applications').get(id);
		expect(row.pdfRef).toBe('fake-ref-1.pdf');
		expect(row.pdfBlob).toBeUndefined();

		secondOpen.close();
		await Dexie.delete(name);
	});

	it('leaves rows without a pdfBlob untouched (no pdfRef invented)', async () => {
		const name = uniqueDbName();
		const legacyDb = new LegacyV1Database(name);
		const insertedId = await legacyDb.table('applications').add(baseV1Row());
		legacyDb.close();

		const migratedDb = new BewerbyDatabase(name);
		await migratedDb.open();
		const row = await migratedDb.applications.get(insertedId as number);

		expect(row?.pdfRef).toBeUndefined();
		expect(writtenBlobs).toHaveLength(0);

		migratedDb.close();
		await Dexie.delete(name);
	});

	it('migrates multiple rows independently, each getting its own OPFS ref', async () => {
		const name = uniqueDbName();
		const blobA = new Blob([new TextEncoder().encode('doc A') as BlobPart]);
		const blobB = new Blob([new TextEncoder().encode('doc B') as BlobPart]);

		const legacyDb = new LegacyV1Database(name);
		const idA = await legacyDb
			.table('applications')
			.add(baseV1Row({ company: 'A GmbH', pdfBlob: blobA }));
		const idB = await legacyDb
			.table('applications')
			.add(baseV1Row({ company: 'B GmbH', pdfBlob: blobB }));
		legacyDb.close();

		const migratedDb = new BewerbyDatabase(name);
		await migratedDb.open();
		const rowA = await migratedDb.applications.get(idA as number);
		const rowB = await migratedDb.applications.get(idB as number);

		expect(rowA?.pdfRef).toBeDefined();
		expect(rowB?.pdfRef).toBeDefined();
		expect(rowA?.pdfRef).not.toBe(rowB?.pdfRef);
		expect(writtenBlobs).toHaveLength(2);

		migratedDb.close();
		await Dexie.delete(name);
	});

	it('preserves all other fields on a migrated row unchanged', async () => {
		const name = uniqueDbName();
		const blob = new Blob([new TextEncoder().encode('doc') as BlobPart]);
		const legacyDb = new LegacyV1Database(name);
		const insertedId = await legacyDb
			.table('applications')
			.add(baseV1Row({ company: 'Preserved GmbH', priority: 'high', pdfBlob: blob }));
		legacyDb.close();

		const migratedDb = new BewerbyDatabase(name);
		await migratedDb.open();
		const row = await migratedDb.applications.get(insertedId as number);

		expect(row?.company).toBe('Preserved GmbH');
		expect(row?.priority).toBe('high');

		migratedDb.close();
		await Dexie.delete(name);
	});
});
