import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { makeMinimalPdf } from './fixtures/make-pdf.js';

test.describe('Backup export/import roundtrip', () => {
	test.beforeEach(({ page }) => {
		page.on('dialog', (dialog) => dialog.accept());
	});

	test('a PDF attachment survives export, erase-all-data, and re-import; a manipulated file is rejected', async ({
		page
	}) => {
		await page.goto('/board');

		// Create one application with a real PDF attachment.
		await page.getByRole('button', { name: 'Bewerbung hinzufügen' }).click();
		const dialog = page.locator('dialog.modal-content');
		await dialog.locator('#title').fill('Backend Entwickler');
		await dialog.locator('#company').fill('Fabrikam AG');
		await dialog.locator('input[type="file"][accept=".pdf"]').setInputFiles({
			name: 'anschreiben.pdf',
			mimeType: 'application/pdf',
			buffer: makeMinimalPdf(['Fabrikam AG', 'Anschreiben Testdokument'])
		});
		await expect(dialog.locator('.pdf-upload-text')).toHaveText('anschreiben.pdf');
		await dialog.getByRole('button', { name: 'Speichern' }).click();
		await expect(dialog).toBeHidden();

		// Export.
		await page.goto('/backup');
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Als JSON exportieren' }).click()
		]);
		const downloadPath = await download.path();
		expect(downloadPath).not.toBeNull();
		const exportedJson = readFileSync(downloadPath!, 'utf-8');
		const exportedPayload = JSON.parse(exportedJson);
		expect(exportedPayload.applications).toHaveLength(1);
		expect(Object.keys(exportedPayload.pdfs)).toHaveLength(1);

		// Right to erasure: wipe everything, confirming the app comes back empty.
		await page.goto('/settings');
		// eraseAllData() reloads the page once its async cleanup finishes;
		// waitForLoadState('load') would race it (it checks the *current*,
		// already-loaded document, not the pending reload) - waiting for the
		// actual 'load' event instead catches the real post-reload navigation.
		await Promise.all([
			page.waitForEvent('load'),
			page.getByRole('button', { name: 'Alle Daten unwiderruflich löschen' }).click()
		]);
		await page.goto('/board');
		await expect(page.locator('.card')).toHaveCount(0);

		// A manipulated backup (missing a required field) must be rejected
		// without touching the (currently empty) database.
		const corrupted = structuredClone(exportedPayload);
		delete corrupted.applications[0].tags;
		await page.goto('/backup');
		await page.locator('input[type="file"][accept=".json"]').setInputFiles({
			name: 'corrupted.json',
			mimeType: 'application/json',
			buffer: Buffer.from(JSON.stringify(corrupted))
		});
		await expect(page.locator('.status-msg.error-msg')).toHaveText(
			'Einige Einträge im Backup entsprechen nicht dem Datenmodell.'
		);
		await page.goto('/board');
		await expect(page.locator('.card')).toHaveCount(0);

		// The real, unmodified export restores the application and its PDF.
		await page.goto('/backup');
		await page.locator('input[type="file"][accept=".json"]').setInputFiles({
			name: 'backup.json',
			mimeType: 'application/json',
			buffer: Buffer.from(exportedJson)
		});
		await expect(page.locator('.status-msg.success-msg')).toHaveText(
			'Datenbank erfolgreich wiederhergestellt!'
		);

		await page.goto('/board');
		const restoredCard = page.locator('.card', { hasText: 'Fabrikam AG' });
		await expect(restoredCard).toBeVisible();
		await restoredCard.locator('.card-open-btn').click();
		await expect(dialog).toBeVisible();
		// pdfRef only renders this button once the PDF was actually restored to
		// OPFS under a freshly assigned ref (see prepareImportRows()).
		// exact: the dialog also carries "Stattdessen Anzeigentext einfügen",
		// which a substring match would tie with.
		await expect(dialog.getByRole('button', { name: 'Anzeigen', exact: true })).toBeVisible();
	});

	test('the stored CV, an application-specific CV and the cover letter survive the roundtrip', async ({
		page
	}) => {
		// The unit tests cover this against a fake OPFS; this one runs it through
		// the real thing, a real Dexie database and a real file input, because
		// the orphan sweep on boot is what would silently eat the CVs.
		await page.goto('/settings');
		await page.locator('.doc-upload input[type="file"]').setInputFiles({
			name: 'lebenslauf.pdf',
			mimeType: 'application/pdf',
			buffer: makeMinimalPdf(['Lebenslauf', 'Petra Musterfrau'])
		});
		await expect(page.locator('.doc-current')).toHaveText('lebenslauf.pdf');

		await page.goto('/board');
		await page.getByRole('button', { name: 'Bewerbung hinzufügen' }).click();
		const modal = page.locator('dialog.modal-content');
		await modal.locator('#title').fill('Pflegefachkraft');
		await modal.locator('#company').fill('Klinikum Musterstadt gGmbH');
		await modal.getByRole('button', { name: 'Speichern' }).click();
		await expect(modal).toBeHidden();

		await page.getByRole('button', { name: 'Bewerbung vorbereiten' }).first().click();
		const dispatch = page.locator('dialog.dispatch-dialog');
		await dispatch.locator('input[type="file"][accept=".pdf"]').setInputFiles({
			name: 'lebenslauf-pflege.pdf',
			mimeType: 'application/pdf',
			buffer: makeMinimalPdf(['Lebenslauf', 'Schwerpunkt Pflege'])
		});
		await expect(dispatch.locator('.cv-state')).toContainText('lebenslauf-pflege.pdf');
		await dispatch
			.locator('#dispatch-letter')
			.fill(['Guten Tag,', '', 'ich bewerbe mich bei Ihnen.'].join('\n'));
		await dispatch.getByRole('button', { name: 'Speichern' }).click();
		await expect(dispatch).toBeHidden();

		await page.goto('/backup');
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Als JSON exportieren' }).click()
		]);
		const exported = JSON.parse(readFileSync((await download.path())!, 'utf-8'));

		expect(exported.version).toBe(3);
		expect(exported.profile.cvName).toBe('lebenslauf.pdf');
		expect(exported.applications[0].cvName).toBe('lebenslauf-pflege.pdf');
		expect(exported.applications[0].coverLetter).toContain('ich bewerbe mich');
		// Job ad (none here), application CV and the profile CV are separate files.
		expect(Object.keys(exported.pdfs)).toHaveLength(2);

		await page.goto('/settings');
		await Promise.all([
			page.waitForEvent('load'),
			page.getByRole('button', { name: 'Alle Daten unwiderruflich löschen' }).click()
		]);
		await page.goto('/settings');
		await expect(page.locator('.doc-current')).toHaveText('Noch kein Lebenslauf hinterlegt.');

		await page.goto('/backup');
		await page.getByRole('radio', { name: /ersetzen/i }).check();
		await page.locator('input[type="file"][accept=".json"]').setInputFiles({
			name: 'backup.json',
			mimeType: 'application/json',
			buffer: Buffer.from(JSON.stringify(exported))
		});
		await expect(page.locator('.status-msg.success-msg')).toBeVisible();

		await page.goto('/settings');
		await expect(page.locator('.doc-current')).toHaveText('lebenslauf.pdf');

		await page.goto('/board');
		await page.getByRole('button', { name: 'Bewerbung vorbereiten' }).first().click();
		await expect(dispatch.locator('.cv-state')).toContainText('lebenslauf-pflege.pdf');
		await expect(dispatch.locator('#dispatch-letter')).toHaveValue(/ich bewerbe mich/);

		// A reload runs cleanupOrphanedPdfs; the CVs must still be there after it.
		await page.reload();
		await page.getByRole('button', { name: 'Bewerbung vorbereiten' }).first().click();
		await expect(dispatch.locator('.cv-state')).toContainText('lebenslauf-pflege.pdf');
	});
});
