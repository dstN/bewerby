import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Native HTML5 drag-and-drop between columns. board-crud.spec.ts covers the
 * per-card status <select> - the keyboard/touch path - but the two share only
 * moveApp(): the drop path alone carries the id through dataTransfer as a
 * string, and that round-trip is where a card can silently fail to move.
 */

function column(page: Page, label: string): Locator {
	return page.locator('.kanban-column', {
		has: page.locator('.column-title', { hasText: label })
	});
}

async function addApplication(page: Page, title: string, company: string) {
	await page.getByRole('button', { name: 'Bewerbung hinzufügen' }).click();
	const dialog = page.locator('dialog.modal-content');
	await dialog.locator('#title').fill(title);
	await dialog.locator('#company').fill(company);
	await dialog.getByRole('button', { name: 'Speichern' }).click();
	await expect(dialog).toBeHidden();
}

/**
 * Writes one application row straight into IndexedDB, bypassing Dexie, with
 * whatever primary key the caller passes. That is how a row "written past
 * TypeScript" (a DevTools edit, a script, a pre-validation import that kept a
 * foreign export's keys) ends up with an id the Application type never
 * allows - and such rows exist in real databases, see the history-less rows
 * analytics.ts had to learn to survive.
 */
async function seedRowWithRawId(page: Page, id: string | number, company: string) {
	await page.evaluate(
		([id, company]) =>
			new Promise<void>((resolve, reject) => {
				const open = indexedDB.open('bewerby-db');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					const tx = db.transaction('applications', 'readwrite');
					const now = Date.now();
					tx.objectStore('applications').add({
						id,
						title: 'Handgeschriebene Zeile',
						company,
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
						createdAt: now,
						updatedAt: now,
						history: [{ status: 'draft', timestamp: now }]
					});
					tx.oncomplete = () => {
						db.close();
						resolve();
					};
					tx.onerror = () => reject(tx.error);
				};
			}),
		[id, company] as const
	);
}

test.describe('Kanban drag and drop', () => {
	test('moves a card into an empty column, onto another card, and onto a column header', async ({
		page
	}) => {
		await page.goto('/board');
		await addApplication(page, 'Frontend Entwickler', 'Contoso GmbH');
		await addApplication(page, 'Backend Entwickler', 'Fabrikam AG');
		await column(page, 'In Arbeit')
			.locator('.card', { hasText: 'Fabrikam AG' })
			.locator('.card-status-select')
			.selectOption('sent');

		const card = () => page.locator('.card', { hasText: 'Contoso GmbH' });

		// Empty drop zone: nothing but the list itself under the pointer.
		await card().dragTo(column(page, 'Vorstellung').locator('.cards-list'));
		await expect(
			column(page, 'Vorstellung').locator('.card', { hasText: 'Contoso GmbH' })
		).toBeVisible();
		await expect(
			column(page, 'In Arbeit').locator('.card', { hasText: 'Contoso GmbH' })
		).toHaveCount(0);

		// Onto another draggable card: the drop must bubble up to the column.
		await card().dragTo(column(page, 'Versendet').locator('.card', { hasText: 'Fabrikam AG' }));
		await expect(
			column(page, 'Versendet').locator('.card', { hasText: 'Contoso GmbH' })
		).toBeVisible();

		// Onto the header: the whole column is the target, not only the list.
		await card().dragTo(column(page, 'Zusage').locator('.column-header'));
		await expect(
			column(page, 'Zusage').locator('.card', { hasText: 'Contoso GmbH' })
		).toBeVisible();
		await expect(page.locator('.card', { hasText: 'Contoso GmbH' })).toHaveCount(1);

		// The move is a real status change, announced like the select path is.
		await expect(page.locator('.sr-only[aria-live="polite"]')).toContainText(
			'Contoso GmbH wurde zu "Zusage" verschoben.'
		);
	});

	test('dropping a card back onto its own column changes nothing', async ({ page }) => {
		await page.goto('/board');
		await addApplication(page, 'Frontend Entwickler', 'Contoso GmbH');
		const card = column(page, 'In Arbeit').locator('.card', { hasText: 'Contoso GmbH' });
		await card.dragTo(column(page, 'In Arbeit').locator('.column-header'));
		await expect(card).toBeVisible();
		await expect(page.locator('.card', { hasText: 'Contoso GmbH' })).toHaveCount(1);
	});

	test('still moves a row whose id is not a number', async ({ page }) => {
		const warnings: string[] = [];
		page.on('console', (m) => {
			if (m.type() === 'warning' || m.type() === 'error') warnings.push(m.text());
		});

		await page.goto('/board');
		// One ordinary row first so the database and its schema exist.
		await addApplication(page, 'Frontend Entwickler', 'Contoso GmbH');
		await seedRowWithRawId(page, 'app-7f3a', 'Northwind e.V.');
		// The raw write bypasses Dexie's change tracking, so liveQuery only
		// sees the row after a fresh load.
		await page.reload();

		const card = column(page, 'In Arbeit').locator('.card', { hasText: 'Northwind e.V.' });
		await expect(card).toBeVisible();

		// The keyboard/touch path was never affected - it hands app.id over as-is.
		await card.locator('.card-status-select').selectOption('sent');
		await expect(
			column(page, 'Versendet').locator('.card', { hasText: 'Northwind e.V.' })
		).toBeVisible();

		// The drag path must reach the same row.
		await column(page, 'Versendet')
			.locator('.card', { hasText: 'Northwind e.V.' })
			.dragTo(column(page, 'Vorstellung').locator('.cards-list'));
		await expect(
			column(page, 'Vorstellung').locator('.card', { hasText: 'Northwind e.V.' })
		).toBeVisible();

		expect(warnings.filter((w) => !w.includes('Background Sync'))).toEqual([]);
	});
});
