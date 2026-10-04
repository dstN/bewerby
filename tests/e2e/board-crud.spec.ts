import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { makeSeedApplication, seedApplications } from './fixtures/seed.js';

test('the sidebar version tag matches package.json (single source of truth)', async ({ page }) => {
	const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
	await page.goto('/board');
	await expect(page.locator('.version-tag')).toHaveText(`v${pkg.version}`);
});

test.describe('Kanban board CRUD', () => {
	test.beforeEach(({ page }) => {
		// Every confirm() (delete, discard-unsaved-changes) is accepted by
		// default; individual tests override this where they need to decline.
		page.on('dialog', (dialog) => dialog.accept());
	});

	test('creates, edits, moves via the status select, and deletes an application', async ({
		page
	}) => {
		await page.goto('/board');

		await page.getByRole('button', { name: 'Bewerbung hinzufügen' }).click();
		const dialog = page.locator('dialog.modal-content');
		await expect(dialog).toBeVisible();

		await dialog.locator('#title').fill('Frontend Entwickler');
		await dialog.locator('#company').fill('Contoso GmbH');
		await dialog.getByRole('button', { name: 'Speichern' }).click();
		await expect(dialog).toBeHidden();

		const draftColumn = page.locator('.kanban-column', {
			has: page.locator('.column-title', { hasText: 'In Arbeit' })
		});
		const card = draftColumn.locator('.card', { hasText: 'Contoso GmbH' });
		await expect(card).toBeVisible();
		await expect(card.locator('.card-title')).toHaveText('Frontend Entwickler');

		// Edit: reopen and change the title.
		await card.locator('.card-open-btn').click();
		await expect(dialog).toBeVisible();
		await dialog.locator('#title').fill('Senior Frontend Entwickler');
		await dialog.getByRole('button', { name: 'Speichern' }).click();
		await expect(dialog).toBeHidden();
		await expect(card.locator('.card-title')).toHaveText('Senior Frontend Entwickler');

		// Move: the per-card status <select> is the keyboard/touch-friendly
		// alternative to native HTML5 drag-and-drop (see issue #9).
		await card.locator('.card-status-select').selectOption('interview');
		const interviewColumn = page.locator('.kanban-column', {
			has: page.locator('.column-title', { hasText: 'Vorstellung' })
		});
		await expect(interviewColumn.locator('.card', { hasText: 'Contoso GmbH' })).toBeVisible();
		await expect(draftColumn.locator('.card', { hasText: 'Contoso GmbH' })).toHaveCount(0);

		// Delete (confirm() auto-accepted by the beforeEach dialog handler).
		await interviewColumn
			.locator('.card', { hasText: 'Contoso GmbH' })
			.locator('.btn-card-delete')
			.click();
		await expect(page.locator('.card', { hasText: 'Contoso GmbH' })).toHaveCount(0);
	});

	test('the Nachweis dates by the moves, or by the dates entered in the dialog', async ({
		page
	}) => {
		const day = (daysAgo: number) =>
			new Intl.DateTimeFormat('de-DE', {
				day: '2-digit',
				month: '2-digit',
				year: 'numeric'
			}).format(Date.now() - daysAgo * 86_400_000);
		async function exportedLine() {
			const [download] = await Promise.all([
				page.waitForEvent('download'),
				page.getByRole('button', { name: 'Nachweis (CSV)' }).click()
			]);
			return readFileSync((await download.path())!, 'utf-8')
				.split('\r\n')
				.find((line) => line.includes('Fabrikam AG'));
		}

		await page.goto('/board');
		await page.getByRole('button', { name: 'Bewerbung hinzufügen' }).click();
		const dialog = page.locator('dialog.modal-content');
		await dialog.locator('#title').fill('Entwickler');
		await dialog.locator('#company').fill('Fabrikam AG');
		await dialog.locator('#status').selectOption('sent');
		await dialog.getByRole('button', { name: 'Speichern' }).click();
		await expect(dialog).toBeHidden();

		const card = page.locator('.card', { hasText: 'Fabrikam AG' });
		await card.locator('.card-status-select').selectOption('rejected');
		expect(await exportedLine()).toBe(`${day(0)};Fabrikam AG;Absage (${day(0)})`);

		await card.locator('.card-open-btn').click();
		async function pick(fieldId: string, shortcut: string) {
			const field = dialog.locator('.form-group', { has: page.locator(`label[for="${fieldId}"]`) });
			await field.locator('.datepicker-trigger').click();
			await field.getByRole('button', { name: shortcut }).click();
		}
		await pick('appliedAt', 'Vor 2 Wochen');
		await pick('rejectedAt', 'Vor 1 Woche');
		await dialog.getByRole('button', { name: 'Speichern' }).click();
		await expect(dialog).toBeHidden();
		expect(await exportedLine()).toBe(`${day(14)};Fabrikam AG;Absage (${day(7)})`);
	});

	test('cancels application creation without saving anything', async ({ page }) => {
		await page.goto('/board');
		await page.getByRole('button', { name: 'Bewerbung hinzufügen' }).click();
		const dialog = page.locator('dialog.modal-content');
		await dialog.locator('#title').fill('Wird verworfen');
		await dialog.locator('button.btn-flat', { hasText: 'Abbrechen' }).click();
		await expect(dialog).toBeHidden();
		await expect(page.locator('.card', { hasText: 'Wird verworfen' })).toHaveCount(0);
	});

	test('the manifest "New application" shortcut (?new=1) opens the add dialog and cleans the URL', async ({
		page
	}) => {
		await page.goto('/board?new=1');
		const dialog = page.locator('dialog.modal-content');
		await expect(dialog).toBeVisible();
		await expect(page).toHaveURL(/\/board(\?.*)?$/);
		await expect(page).not.toHaveURL(/new=1/);
	});
});

test.describe('Limiting the board and the Nachweis to a period', () => {
	test('keeps applications sent in the period, names it in the file, and clears again', async ({
		page
	}) => {
		const sent = (company: string, y: number, m: number, d: number) => {
			const at = new Date(y, m - 1, d, 12).getTime();
			return makeSeedApplication({ company, status: 'sent', appliedAt: at, createdAt: at });
		};
		await page.goto('/board');
		await seedApplications(page, [
			sent('Januar AG', 2026, 1, 20),
			sent('November GmbH', 2026, 11, 5),
			sent('Dezember KG', 2026, 12, 10)
		]);
		await page.evaluate(() =>
			localStorage.setItem(
				'bewerby-board-view',
				JSON.stringify({ from: '2026-11-01', to: '2027-01-31' })
			)
		);
		await page.reload();

		// The winter phase only, and the pickers say so.
		await expect(page.locator('.card')).toHaveCount(2);
		await expect(page.locator('.card', { hasText: 'Januar AG' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: /^Von: 1\. November 2026/ })).toBeVisible();

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Nachweis (CSV)' }).click()
		]);
		expect(download.suggestedFilename()).toBe('bewerbungen-2026-11-01-bis-2027-01-31.csv');
		const csv = readFileSync((await download.path())!, 'utf-8');
		expect(csv).toContain('November GmbH');
		expect(csv).toContain('Dezember KG');
		expect(csv).not.toContain('Januar AG');

		await page.getByRole('button', { name: 'Zeitraum zurücksetzen' }).click();
		await expect(page.locator('.card')).toHaveCount(3);
		await expect(page.getByRole('button', { name: 'Von: Kalender öffnen' })).toBeVisible();
	});
});
