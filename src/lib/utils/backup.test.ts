import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { BewerbyDatabase, type Application } from '$lib/db/index.js';
import {
	blobToBase64,
	base64ToBlob,
	buildBackupPayload,
	parseBackupPayload,
	prepareImportRows,
	BACKUP_FORMAT_VERSION
} from './backup.js';

// Stand-in for OPFS (unavailable under Node/vitest): a Map keyed by the same
// kind of ref string writePdfToOpfs would hand out, so the payload/roundtrip
// logic is exercised exactly as it runs in the browser.
function makeFakeOpfs() {
	const files = new Map<string, Blob>();
	let counter = 0;
	return {
		files,
		writePdfToOpfs: async (blob: Blob) => {
			const ref = `pdf-${++counter}.pdf`;
			files.set(ref, blob);
			return ref;
		},
		readPdfFromOpfs: async (ref: string) => files.get(ref) ?? null
	};
}

function uniqueDbName(): string {
	return `bewerby-backup-test-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function baseApp(overrides: Partial<Application> = {}): Application {
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

describe('blobToBase64 / base64ToBlob', () => {
	it('roundtrips arbitrary bytes exactly', async () => {
		const original = new Blob([new Uint8Array([0, 1, 2, 253, 254, 255]) as BlobPart], {
			type: 'application/pdf'
		});
		const base64 = await blobToBase64(original);
		const restored = base64ToBlob(base64, original.type);
		expect(restored.type).toBe(original.type);
		await expect(restored.text()).resolves.toBe(await original.text());
	});

	it('roundtrips a payload larger than the base64 chunk size (0x8000 bytes)', async () => {
		const bytes = new Uint8Array(0x8000 * 3 + 17);
		for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
		const original = new Blob([bytes as BlobPart]);
		const restored = base64ToBlob(await blobToBase64(original));
		await expect(restored.text()).resolves.toBe(await original.text());
	});
});

describe('buildBackupPayload / parseBackupPayload', () => {
	it('includes an attached PDF as base64 and skips applications without one', async () => {
		const opfs = makeFakeOpfs();
		const blob = new Blob([new TextEncoder().encode('%PDF-1.4 fake') as BlobPart], {
			type: 'application/pdf'
		});
		const ref = await opfs.writePdfToOpfs(blob);

		const payload = await buildBackupPayload(
			[baseApp({ pdfRef: ref }), baseApp({ company: 'No PDF GmbH' })],
			opfs.readPdfFromOpfs
		);

		expect(payload.version).toBe(BACKUP_FORMAT_VERSION);
		expect(Object.keys(payload.pdfs)).toEqual([ref]);
		expect(payload.applications).toHaveLength(2);
	});

	it('a payload built by buildBackupPayload round-trips through JSON and parseBackupPayload', async () => {
		const opfs = makeFakeOpfs();
		const blob = new Blob([new TextEncoder().encode('%PDF-1.4 fake') as BlobPart]);
		const ref = await opfs.writePdfToOpfs(blob);
		const payload = await buildBackupPayload([baseApp({ pdfRef: ref })], opfs.readPdfFromOpfs);

		const json = JSON.stringify(payload);
		const parsed = parseBackupPayload(json);

		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(parsed.data.applications).toHaveLength(1);
			expect(parsed.data.pdfs[ref]).toBe(payload.pdfs[ref]);
		}
	});

	it('rejects a file with the wrong format version', () => {
		const parsed = parseBackupPayload(JSON.stringify({ version: 1, applications: [] }));
		expect(parsed).toEqual({ ok: false, error: 'format' });
	});

	it('rejects malformed JSON', () => {
		expect(parseBackupPayload('{not json')).toEqual({ ok: false, error: 'format' });
	});

	it('rejects a structurally invalid application row (missing required fields)', () => {
		const parsed = parseBackupPayload(
			JSON.stringify({
				version: BACKUP_FORMAT_VERSION,
				applications: [{ title: 'Missing everything else' }]
			})
		);
		expect(parsed).toEqual({ ok: false, error: 'validation' });
	});
});

describe('prepareImportRows', () => {
	it('assigns every restored PDF a fresh ref, never reusing the backup file ref', async () => {
		const opfs = makeFakeOpfs();
		const payload = {
			version: BACKUP_FORMAT_VERSION,
			exportedAt: Date.now(),
			applications: [baseApp({ id: 42, pdfRef: 'old-ref.pdf' })],
			pdfs: { 'old-ref.pdf': await blobToBase64(new Blob([new Uint8Array([1, 2, 3]) as BlobPart])) }
		};

		const rows = await prepareImportRows(payload, opfs.writePdfToOpfs);

		expect(rows).toHaveLength(1);
		expect(rows[0].pdfRef).not.toBe('old-ref.pdf');
		expect(rows[0].pdfRef).toBeDefined();
		expect(opfs.files.has(rows[0].pdfRef as string)).toBe(true);
	});

	it('strips the id from every row so imported data never collides with local autoincrement ids', async () => {
		const opfs = makeFakeOpfs();
		const payload = {
			version: BACKUP_FORMAT_VERSION,
			exportedAt: Date.now(),
			applications: [baseApp({ id: 7 })],
			pdfs: {}
		};
		const rows = await prepareImportRows(payload, opfs.writePdfToOpfs);
		expect(rows[0].id).toBeUndefined();
	});

	it('leaves pdfRef undefined for applications that never had a PDF attached', async () => {
		const opfs = makeFakeOpfs();
		const payload = {
			version: BACKUP_FORMAT_VERSION,
			exportedAt: Date.now(),
			applications: [baseApp()],
			pdfs: {}
		};
		const rows = await prepareImportRows(payload, opfs.writePdfToOpfs);
		expect(rows[0].pdfRef).toBeUndefined();
	});
});

describe('end-to-end backup roundtrip with a PDF, through a real Dexie database', () => {
	let opfs: ReturnType<typeof makeFakeOpfs>;

	beforeEach(() => {
		opfs = makeFakeOpfs();
	});

	it('survives export -> JSON -> clear -> import with the PDF bytes intact', async () => {
		const sourceDb = new BewerbyDatabase(uniqueDbName());
		await sourceDb.open();
		const pdfBytes = new TextEncoder().encode('%PDF-1.4 a real-ish cover letter');
		const pdfBlob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
		const ref = await opfs.writePdfToOpfs(pdfBlob);
		await sourceDb.applications.add(baseApp({ company: 'Roundtrip GmbH', pdfRef: ref }));

		// TIER 1 export
		const exported = await buildBackupPayload(
			await sourceDb.applications.toArray(),
			opfs.readPdfFromOpfs
		);
		const json = JSON.stringify(exported);
		sourceDb.close();

		// Simulate "Alle Daten löschen" followed by a fresh import into a clean database.
		const targetDb = new BewerbyDatabase(uniqueDbName());
		await targetDb.open();

		const parsed = parseBackupPayload(json);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		const rows = await prepareImportRows(parsed.data, opfs.writePdfToOpfs);
		await targetDb.transaction('rw', targetDb.applications, async () => {
			await targetDb.applications.bulkAdd(rows);
		});

		const restored = await targetDb.applications.toArray();
		expect(restored).toHaveLength(1);
		expect(restored[0].company).toBe('Roundtrip GmbH');
		expect(restored[0].pdfRef).toBeDefined();
		expect(restored[0].pdfRef).not.toBe(ref);

		const restoredBlob = await opfs.readPdfFromOpfs(restored[0].pdfRef as string);
		expect(restoredBlob).not.toBeNull();
		await expect(restoredBlob?.text()).resolves.toBe(await pdfBlob.text());

		targetDb.close();
	});
});
