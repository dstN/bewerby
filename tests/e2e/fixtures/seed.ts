import type { Page } from '@playwright/test';

/**
 * The subset of an application row a test cares about; everything else is
 * filled in with realistic defaults by makeSeedApplication() below.
 */
export interface SeedApplication {
	title: string;
	company: string;
	url: string;
	salary: string;
	contactName: string;
	contactEmail: string;
	contactPhone: string;
	notes: string;
	priority: 'low' | 'medium' | 'high';
	status: 'draft' | 'sent' | 'interview' | 'accepted' | 'rejected';
	tags: string[];
	cardColor?: string;
	reminderInterval: '24h' | '48h' | '7d' | '14d' | 'none';
	appliedAt?: number;
	createdAt: number;
	updatedAt: number;
	history: Array<{ status: SeedApplication['status']; timestamp: number }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function makeSeedApplication(overrides: Partial<SeedApplication> = {}): SeedApplication {
	const now = Date.now();
	const status = overrides.status ?? 'draft';
	// The move into the status happened on the application date, as it would
	// on a real board - everything dates a row by that move, not by appliedAt.
	const appliedAt = overrides.appliedAt ?? now - DAY_MS;
	return {
		title: 'Frontend Entwickler',
		company: 'Contoso GmbH',
		url: '',
		salary: '',
		contactName: '',
		contactEmail: '',
		contactPhone: '',
		notes: '',
		priority: 'medium',
		status,
		tags: [],
		reminderInterval: 'none',
		appliedAt,
		createdAt: now - DAY_MS,
		updatedAt: now,
		history: [{ status, timestamp: appliedAt }],
		...overrides
	};
}

/**
 * Writes rows straight into the Dexie-created IndexedDB store, then reloads.
 *
 * Driving the modal once per application would dominate the runtime of any
 * test that needs a *populated* board (the a11y sweep, the filter tests) and
 * would test the same create path those suites are not about. The reload is
 * required rather than cosmetic: liveQuery only observes mutations made
 * through Dexie itself, so a raw IndexedDB write is invisible to the running
 * page until it re-reads the table on boot.
 *
 * The caller must already have navigated to the app; this waits for the shell
 * to hydrate, because Dexie only creates the database and its object store
 * once the client boots. Opening it before that would create an *empty*
 * database with no `applications` store, and the transaction below would then
 * throw rather than seed anything.
 */
export async function seedApplications(page: Page, applications: SeedApplication[]): Promise<void> {
	await page.locator('#main-content').waitFor({ state: 'visible' });
	await page.waitForFunction(async () => {
		const names = await indexedDB.databases();
		return names.some((entry) => entry.name === 'bewerby-db');
	});

	await page.evaluate(async (rows) => {
		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.open('bewerby-db');
			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				const database = request.result;
				if (!database.objectStoreNames.contains('applications')) {
					database.close();
					reject(new Error('bewerby-db has no "applications" store - the app never booted'));
					return;
				}
				const tx = database.transaction('applications', 'readwrite');
				const store = tx.objectStore('applications');
				for (const row of rows) store.add(row);
				tx.oncomplete = () => {
					database.close();
					resolve();
				};
				tx.onerror = () => reject(tx.error);
			};
		});
	}, applications);

	await page.reload();
	await page.locator('#main-content').waitFor({ state: 'visible' });
}

/**
 * A board covering every column, priority, a coloured card, tags (including
 * the "+N more" overflow), a salary, and an application that is overdue for
 * follow-up - so a single scan or screenshot exercises every card variant
 * the board can render rather than only the plain one.
 */
export function representativeBoard(): SeedApplication[] {
	const now = Date.now();
	return [
		makeSeedApplication({
			title: 'Frontend Entwickler',
			company: 'Contoso GmbH',
			status: 'draft',
			priority: 'high',
			salary: '65.000 EUR',
			tags: ['remote', 'svelte', 'typescript', 'teilzeit'],
			cardColor: '#6366f1',
			notes: 'Empfehlung über einen ehemaligen Kollegen.'
		}),
		makeSeedApplication({
			title: 'Backend Entwickler',
			company: 'Fabrikam AG',
			status: 'sent',
			priority: 'medium',
			tags: ['go'],
			reminderInterval: '24h',
			// Sent three days ago with a 24h reminder: overdue, so the board's
			// alert banner renders too.
			history: [{ status: 'sent', timestamp: now - 3 * DAY_MS }],
			appliedAt: now - 3 * DAY_MS
		}),
		makeSeedApplication({
			title: 'Platform Engineer',
			company: 'Northwind Ltd.',
			status: 'interview',
			priority: 'low',
			tags: ['kubernetes', 'aws'],
			history: [
				{ status: 'sent', timestamp: now - 20 * DAY_MS },
				{ status: 'interview', timestamp: now - 6 * DAY_MS }
			]
		}),
		makeSeedApplication({
			title: 'Full-Stack Entwicklerin',
			company: 'Litware Inc.',
			status: 'accepted',
			priority: 'high',
			cardColor: '#10b981',
			history: [
				{ status: 'sent', timestamp: now - 30 * DAY_MS },
				{ status: 'interview', timestamp: now - 21 * DAY_MS },
				{ status: 'accepted', timestamp: now - 14 * DAY_MS }
			]
		}),
		makeSeedApplication({
			title: 'Data Engineer',
			company: 'Tailspin Toys',
			status: 'rejected',
			priority: 'medium',
			history: [
				{ status: 'sent', timestamp: now - 40 * DAY_MS },
				{ status: 'rejected', timestamp: now - 25 * DAY_MS }
			]
		})
	];
}
