import { test, expect, type Page } from '@playwright/test';
import { makeMinimalPdf } from './fixtures/make-pdf.js';

/**
 * Every CV upload writes a fresh OPFS file. persist() only ever deletes
 * `originalCvRef` — the file the stored row pointed at when the dialog opened —
 * so replacing the CV a second time inside one session used to strand the one
 * in between: bytes on disk that nothing referenced. The boot sweep collected
 * them on the next start, which made the leak easy to miss and impossible to
 * see from the UI.
 */
async function countStoredPdfs(page: Page): Promise<number> {
	return page.evaluate(async () => {
		const root = await navigator.storage.getDirectory();
		const dir = await root.getDirectoryHandle('application-pdfs', { create: true });
		const names: string[] = [];
		for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) {
			names.push(name);
		}
		return names.length;
	});
}

test('replacing the CV within one dialog session leaves no orphaned file', async ({ page }) => {
	await page.goto('/board');

	await page.getByRole('button', { name: 'Bewerbung hinzufügen' }).click();
	const modal = page.locator('dialog.modal-content');
	await modal.locator('#title').fill('Pflegefachkraft');
	await modal.locator('#company').fill('Klinikum Musterstadt gGmbH');
	await modal.getByRole('button', { name: 'Speichern' }).click();
	await expect(modal).toBeHidden();

	await page.getByRole('button', { name: 'Bewerbung vorbereiten' }).first().click();
	const dispatch = page.locator('dialog.dispatch-dialog');
	await expect(dispatch).toBeVisible();

	const fileInput = dispatch.locator('input[type="file"][accept=".pdf"]');

	await fileInput.setInputFiles({
		name: 'lebenslauf-alt.pdf',
		mimeType: 'application/pdf',
		buffer: makeMinimalPdf(['Lebenslauf alt'])
	});
	await expect(dispatch.locator('.cv-state')).toContainText('lebenslauf-alt.pdf');

	await fileInput.setInputFiles({
		name: 'lebenslauf-neu.pdf',
		mimeType: 'application/pdf',
		buffer: makeMinimalPdf(['Lebenslauf neu'])
	});
	await expect(dispatch.locator('.cv-state')).toContainText('lebenslauf-neu.pdf');

	// The superseded upload is already gone, before anything is saved.
	expect(await countStoredPdfs(page)).toBe(1);

	await dispatch.getByRole('button', { name: 'Speichern' }).click();
	await expect(dispatch).toBeHidden();

	expect(await countStoredPdfs(page)).toBe(1);

	// And the one that survived is the one the user last chose.
	await page.getByRole('button', { name: 'Bewerbung vorbereiten' }).first().click();
	await expect(dispatch.locator('.cv-state')).toContainText('lebenslauf-neu.pdf');
});
