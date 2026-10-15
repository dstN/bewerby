import { readFileSync } from 'node:fs';
import { test, expect, type Page, type Locator } from '@playwright/test';
import { makeSeedApplication, seedApplications } from './fixtures/seed.js';

/**
 * The archive (#60): a column of its own for applications that ended without
 * a result, hidden unless switched on, that asks why a card goes in.
 */

function column(page: Page, label: string): Locator {
	return page.locator('.kanban-column', {
		has: page.locator('.column-title', { hasText: label })
	});
}

test.describe('Archive', () => {
	test('archives a card from its status select, behind a toggle that survives a reload', async ({
		page
	}) => {
		await page.goto('/board');
		await seedApplications(page, [
			makeSeedApplication({ company: 'Still AG', status: 'sent' }),
			makeSeedApplication({ company: 'Offen GmbH', status: 'sent' })
		]);
		await page.reload();

		const toggle = page.getByRole('button', { name: /^Archiv \(\d+\)$/ });
		const archive = page.locator('#column-archived');
		await expect(toggle).toHaveText('Archiv (0)');
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await expect(toggle).toHaveAttribute('aria-controls', 'column-archived');
		await expect(archive).toBeHidden();

		// Cancelled: nothing moves, and the select shows the card's status again.
		const select = page.getByRole('combobox', { name: 'Status ändern für Still AG' });
		await select.selectOption('archived');
		const dialog = page.getByRole('dialog', { name: 'Bewerbung archivieren' });
		await expect(dialog.getByRole('radio', { name: 'Keine Rückmeldung' })).toBeChecked();
		await dialog.getByRole('button', { name: 'Abbrechen' }).click();
		await expect(dialog).toBeHidden();
		await expect(select).toHaveValue('sent');

		await select.selectOption('archived');
		await dialog.getByRole('button', { name: 'Archivieren' }).click();
		await expect(dialog).toBeHidden();
		await expect(column(page, 'Versendet').locator('.card')).toHaveCount(1);
		await expect(toggle).toHaveText('Archiv (1)');
		await expect(page.locator('.sr-only[aria-live="polite"]')).toContainText(
			'Still AG wurde zu "Archiv" verschoben.'
		);

		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await expect(archive.locator('.card', { hasText: 'Still AG' })).toBeVisible();

		await page.reload();
		await expect(archive.locator('.card', { hasText: 'Still AG' })).toBeVisible();

		// The Nachweis says what became of it, without a date that never was.
		await page.getByRole('button', { name: 'Nachweis (CSV)' }).click();
		const exportDialog = page.getByRole('dialog', { name: 'Nachweis exportieren' });
		await exportDialog.getByRole('radio', { name: 'Alle versendeten Bewerbungen' }).check();
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			exportDialog.getByRole('button', { name: 'CSV herunterladen' }).click()
		]);
		const csv = readFileSync((await download.path())!, 'utf-8');
		expect(csv).toMatch(/;Still AG;Keine Rückmeldung\r\n/);

		// The edit dialog shows the reason; out of the archive is a plain move.
		await archive.locator('.card-open-btn', { hasText: 'Still AG' }).click();
		const modal = page.locator('dialog.modal-content');
		await expect(modal.locator('#archiveReason')).toHaveValue('no-response');
		await modal.locator('#status').selectOption('sent');
		await expect(modal.locator('#archiveReason')).toHaveCount(0);
		await modal.getByRole('button', { name: 'Speichern' }).click();
		await expect(modal).toBeHidden();
		await expect(column(page, 'Versendet').locator('.card')).toHaveCount(2);
		await expect(toggle).toHaveText('Archiv (0)');
	});

	test('a draft dropped into the archive is suggested as never sent, and leaves the Nachweis', async ({
		page
	}) => {
		// Wide enough for all six columns side by side: narrower, the board
		// scrolls the archive into view and the draft out of it.
		await page.setViewportSize({ width: 1600, height: 900 });
		await page.goto('/board');
		await seedApplications(page, [makeSeedApplication({ company: 'Weg GmbH', status: 'draft' })]);
		await page.reload();
		await page.getByRole('button', { name: 'Archiv (0)' }).click();

		await page
			.locator('.card', { hasText: 'Weg GmbH' })
			.dragTo(column(page, 'Archiv').locator('.cards-list'));
		const dialog = page.getByRole('dialog', { name: 'Bewerbung archivieren' });
		await expect(
			dialog.getByRole('radio', { name: 'Nie versendet, z. B. weil die Anzeige weg war' })
		).toBeChecked();
		await dialog.getByRole('button', { name: 'Archivieren' }).click();

		await expect(column(page, 'Archiv').locator('.card', { hasText: 'Weg GmbH' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Nachweis (CSV)' })).toBeDisabled();
	});
});
