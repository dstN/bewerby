import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { makeMinimalPdf } from './fixtures/make-pdf.js';

/**
 * The path from a stored CV to a downloadable application: settings hold the
 * CV, the dispatch dialog writes the letter, and the export produces either
 * one merged PDF or two separate files.
 */
async function storeGlobalCv(page: Page) {
	await page.goto('/settings');
	await page.locator('.doc-upload input[type="file"]').setInputFiles({
		name: 'lebenslauf.pdf',
		mimeType: 'application/pdf',
		buffer: makeMinimalPdf(['Lebenslauf', 'Petra Musterfrau', 'Berufserfahrung'])
	});
	await expect(page.locator('.doc-current')).toHaveText('lebenslauf.pdf');
}

async function createApplication(page: Page) {
	await page.goto('/board');
	await page.getByRole('button', { name: 'Bewerbung hinzufügen' }).click();
	const modal = page.locator('dialog.modal-content');
	await modal.locator('#title').fill('Pflegefachkraft');
	await modal.locator('#company').fill('Klinikum Musterstadt gGmbH');
	await modal.locator('#contactEmail').fill('bewerbung@klinikum-musterstadt.de');
	await modal.getByRole('button', { name: 'Speichern' }).click();
	await expect(modal).toBeHidden();
}

async function openDispatch(page: Page) {
	await page.getByRole('button', { name: 'Bewerbung vorbereiten' }).first().click();
	const dialog = page.locator('dialog.dispatch-dialog');
	await expect(dialog).toBeVisible();
	return dialog;
}

function isPdf(path: string): boolean {
	return readFileSync(path).subarray(0, 5).toString('ascii') === '%PDF-';
}

test.describe('Preparing an application for sending', () => {
	test.beforeEach(({ page }) => {
		page.on('dialog', (dialog) => dialog.accept());
	});

	test('writes a letter from the template and downloads one merged PDF', async ({ page }) => {
		await storeGlobalCv(page);
		await createApplication(page);
		const dialog = await openDispatch(page);

		// The stored CV is offered without having to attach anything again.
		await expect(dialog.locator('.cv-state')).toContainText('lebenslauf.pdf');

		await dialog.getByRole('button', { name: 'Vorlage einfügen' }).click();
		const letter = dialog.locator('#dispatch-letter');
		await expect(letter).toHaveValue(/Bewerbung als Pflegefachkraft/);
		// The salutation stays neutral: no contact name was given.
		await expect(letter).toHaveValue(/Sehr geehrte Damen und Herren,/);

		// The preview renders what was typed.
		await expect(dialog.locator('.preview')).toContainText('Bewerbung als Pflegefachkraft');

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			dialog.getByRole('button', { name: 'Herunterladen', exact: true }).click()
		]);

		expect(download.suggestedFilename()).toMatch(/^Bewerbung-.*\.pdf$/);
		const path = await download.path();
		expect(path).not.toBeNull();
		expect(isPdf(path!)).toBe(true);
	});

	test('downloads the letter and the CV as two files when asked to', async ({ page }) => {
		await storeGlobalCv(page);
		await createApplication(page);
		const dialog = await openDispatch(page);

		await dialog.getByRole('button', { name: 'Vorlage einfügen' }).click();
		await dialog.getByRole('radio', { name: /Getrennte Dateien/ }).check();

		const downloads: string[] = [];
		page.on('download', (download) => downloads.push(download.suggestedFilename()));

		await dialog.getByRole('button', { name: 'Herunterladen', exact: true }).click();
		await expect.poll(() => downloads.length).toBe(2);

		expect(downloads.some((name) => name.startsWith('Anschreiben-'))).toBe(true);
		expect(downloads.some((name) => name.startsWith('Lebenslauf-'))).toBe(true);
	});

	test('keeps the letter after closing and reopening', async ({ page }) => {
		await createApplication(page);
		let dialog = await openDispatch(page);

		await dialog.locator('#dispatch-letter').fill('Guten Tag,\n\nich bewerbe mich.');
		await dialog.getByRole('button', { name: 'Speichern' }).click();
		await expect(dialog).toBeHidden();

		dialog = await openDispatch(page);
		await expect(dialog.locator('#dispatch-letter')).toHaveValue(/ich bewerbe mich\./);
	});

	test('states plainly that the email cannot carry the attachment', async ({ page }) => {
		await createApplication(page);
		const dialog = await openDispatch(page);
		// This is a hard limitation of mailto:, so the UI has to say so rather
		// than let the user discover it in their sent folder.
		await expect(dialog.locator('.mail-hint')).toContainText('ohne Anhang');
	});

	test('refuses to export an empty letter instead of producing a blank PDF', async ({ page }) => {
		await createApplication(page);
		const dialog = await openDispatch(page);
		await dialog.getByRole('button', { name: 'Herunterladen', exact: true }).click();
		await expect(dialog.locator('.error')).toBeVisible();
	});
});
