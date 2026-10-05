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
			await page.getByRole('button', { name: 'Nachweis (CSV)' }).click();
			const dialog = page.getByRole('dialog', { name: 'Nachweis exportieren' });
			await dialog.getByRole('radio', { name: 'Alle versendeten Bewerbungen' }).check();
			const [download] = await Promise.all([
				page.waitForEvent('download'),
				dialog.getByRole('button', { name: 'CSV herunterladen' }).click()
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

test.describe('Choosing the period of the Nachweis when exporting it', () => {
	test('asks for the period, counts what it covers, and names it in the file', async ({ page }) => {
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
		// The period chosen last time, preselected.
		await page.evaluate(() =>
			localStorage.setItem(
				'bewerby-board-view',
				JSON.stringify({ exportPeriod: 'custom', from: '2026-11-01', to: '2027-01-31' })
			)
		);
		await page.reload();

		// The board itself is not limited by it.
		await expect(page.locator('.card')).toHaveCount(3);

		await page.getByRole('button', { name: 'Nachweis (CSV)' }).click();
		const dialog = page.getByRole('dialog', { name: 'Nachweis exportieren' });
		await expect(dialog.getByRole('radio', { name: 'Eigener Zeitraum' })).toBeChecked();
		await expect(dialog.getByRole('button', { name: /^Von: 1\. November 2026/ })).toBeVisible();
		await expect(dialog.getByTestId('export-count')).toHaveText('2 Bewerbungen im Nachweis');

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			dialog.getByRole('button', { name: 'CSV herunterladen' }).click()
		]);
		expect(download.suggestedFilename()).toBe('bewerbungen-2026-11-01-bis-2027-01-31.csv');
		const csv = readFileSync((await download.path())!, 'utf-8');
		expect(csv).toContain('November GmbH');
		expect(csv).toContain('Dezember KG');
		expect(csv).not.toContain('Januar AG');
		await expect(dialog).toBeHidden();

		// All of them, chosen in the dialog.
		await page.getByRole('button', { name: 'Nachweis (CSV)' }).click();
		await dialog.getByRole('radio', { name: 'Alle versendeten Bewerbungen' }).check();
		await expect(dialog.getByTestId('export-count')).toHaveText('3 Bewerbungen im Nachweis');
		await dialog.getByRole('button', { name: 'Abbrechen' }).click();
		await expect(dialog).toBeHidden();
	});
});
