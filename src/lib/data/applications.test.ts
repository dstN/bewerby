import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Application } from '#lib/db/index.js';

// The repository writes through the app's db singleton; each test file gets
// its own, uniquely named database instead of the real 'bewerby-db'.
vi.mock('#lib/utils/opfs.js', () => ({ writePdfToOpfs: vi.fn() }));
vi.mock('#lib/db/index.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('#lib/db/index.js')>();
	return { ...actual, db: new actual.BewerbyDatabase(`bewerby-repo-${Math.random()}`) };
});

const { db } = await import('#lib/db/index.js');
const {
	createApplication,
	importApplications,
	MissingApplicationError,
	removeApplication,
	updateApplication
} = await import('./applications.js');

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
		status: 'draft' as const,
		tags: [],
		reminderInterval: 'none' as const,
		...overrides
	};
}

beforeEach(async () => {
	await db.applications.clear();
});

describe('application repository', () => {
	it('creates a row with an initial history entry and timestamps', async () => {
		const id = await createApplication(fields(), 1000);
		const row = await db.applications.get(id);
		expect(row).toMatchObject({ createdAt: 1000, updatedAt: 1000 });
		expect(row?.history).toEqual([{ status: 'draft', timestamp: 1000 }]);
	});

	it('logs a status change to the history, and only a real change', async () => {
		const id = await createApplication(fields(), 1000);
		await updateApplication(id, { status: 'sent' }, 2000);
		await updateApplication(id, { status: 'sent', title: 'Senior Entwickler' }, 3000);
		const row = await db.applications.get(id);
		expect(row?.history).toEqual([
			{ status: 'draft', timestamp: 1000 },
			{ status: 'sent', timestamp: 2000 }
		]);
		expect(row).toMatchObject({ title: 'Senior Entwickler', updatedAt: 3000, createdAt: 1000 });
	});

	it('drops an entered rejection date on a move, unless the caller sets one', async () => {
		const id = await createApplication(fields({ status: 'rejected', rejectedAt: 5 }), 1000);
		await updateApplication(id, { status: 'sent' }, 2000);
		expect((await db.applications.get(id))?.rejectedAt).toBeUndefined();

		await updateApplication(id, { status: 'rejected', rejectedAt: 1500 }, 3000);
		expect((await db.applications.get(id))?.rejectedAt).toBe(1500);
	});

	it('removes a field the caller sets to undefined', async () => {
		const id = await createApplication(fields({ cardColor: '#10b981' }), 1000);
		await updateApplication(id, { cardColor: undefined }, 2000);
		expect(await db.applications.get(id)).not.toHaveProperty('cardColor');
	});

	it('repairs a row that lost its history instead of keeping undefined', async () => {
		const id = await createApplication(fields(), 1000);
		await db.applications.update(id, { history: undefined });
		await updateApplication(id, { title: 'Neu' }, 2000);
		expect((await db.applications.get(id))?.history).toEqual([]);
	});

	it('refuses to update a row that does not exist, instead of reporting success', async () => {
		await expect(updateApplication(9999, { title: 'x' })).rejects.toBeInstanceOf(
			MissingApplicationError
		);
	});

	it('hands the removed row back so its PDFs can be cleaned up', async () => {
		const id = await createApplication(fields({ pdfRef: 'ad.pdf' }), 1000);
		expect((await removeApplication(id))?.pdfRef).toBe('ad.pdf');
		expect(await db.applications.count()).toBe(0);
	});

	it('imports by merging or by replacing, all or nothing', async () => {
		await createApplication(fields({ company: 'Alt AG' }), 1000);
		const imported = {
			...fields({ company: 'Neu AG' }),
			createdAt: 1,
			updatedAt: 1,
			history: []
		} as Application;

		await importApplications([imported], 'merge');
		expect(await db.applications.count()).toBe(2);

		await importApplications([imported], 'replace');
		expect((await db.applications.toArray()).map((row) => row.company)).toEqual(['Neu AG']);

		// A duplicate primary key fails the bulkAdd: the replace must roll back.
		const [existing] = await db.applications.toArray();
		await expect(importApplications([existing, existing], 'replace')).rejects.toThrow();
		expect((await db.applications.toArray()).map((row) => row.company)).toEqual(['Neu AG']);
	});
});
