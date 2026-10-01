import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { makeMinimalPdf } from './fixtures/make-pdf.js';

const PASSPHRASE = 'korrekt pferd batterie heftklammer';

/** Runs the setup assistant and returns the recovery key it displayed. */
async function setUpEncryption(page: Page, remember: boolean): Promise<string> {
	await page.goto('/backup');
	await page.getByRole('button', { name: 'Verschlüsselung einrichten' }).click();
	const dialog = page.getByRole('dialog', { name: 'Verschlüsselung einrichten' });
	await dialog.getByLabel('Passwort', { exact: true }).fill(PASSPHRASE);
	await dialog.getByLabel('Passwort wiederholen').fill(PASSPHRASE);
	if (!remember) await dialog.getByLabel('Schlüssel auf diesem Gerät merken').uncheck();
	await dialog.getByRole('button', { name: 'Weiter' }).click();

	const recoveryKey = (await dialog.getByTestId('recovery-key').textContent())!.trim();
	expect(recoveryKey).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
	// Confirming with the wrong group is refused, the right one accepted.
	await dialog.getByLabel('Zur Bestätigung').fill('0000');
	await dialog.getByRole('button', { name: 'Fertig' }).click();
	await expect(dialog.getByRole('alert')).toContainText('stimmen nicht');
	await dialog.getByLabel('Zur Bestätigung').fill(recoveryKey.slice(-4).toLowerCase());
	await dialog.getByRole('button', { name: 'Fertig' }).click();
	await expect(dialog).toBeHidden();
	return recoveryKey;
}

async function eraseEverything(page: Page) {
	await page.goto('/settings');
	await Promise.all([
		page.waitForEvent('load'),
		page.getByRole('button', { name: 'Alle Daten unwiderruflich löschen' }).click()
	]);
}

test.describe('Encrypted backup', () => {
	test.beforeEach(({ page }) => {
		page.on('dialog', (dialog) => dialog.accept());
	});

	test('a backup restores on a wiped device with the recovery key, and never carries plaintext', async ({
		page
	}) => {
		await page.goto('/board');
		await page.getByRole('button', { name: 'Bewerbung hinzufügen' }).click();
		const modal = page.locator('dialog.modal-content');
		await modal.locator('#title').fill('Backend Entwickler');
		await modal.locator('#company').fill('Fabrikam AG');
		await modal.locator('input[type="file"][accept=".pdf"]').setInputFiles({
			name: 'anschreiben.pdf',
			mimeType: 'application/pdf',
			buffer: makeMinimalPdf(['Fabrikam AG', 'Anschreiben Testdokument'])
		});
		await expect(modal.locator('.pdf-upload-text')).toHaveText('anschreiben.pdf');
		await modal.getByRole('button', { name: 'Speichern' }).click();
		await expect(modal).toBeHidden();

		const recoveryKey = await setUpEncryption(page, true);
		await expect(page.getByText('Der Schlüssel ist auf diesem Gerät gespeichert.')).toBeVisible();

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Verschlüsselt herunterladen' }).click()
		]);
		expect(download.suggestedFilename()).toMatch(/^bewerby-backup-\d{4}-\d{2}-\d{2}\.bwv$/);
		const file = readFileSync((await download.path())!);
		expect(file.subarray(0, 3).toString('latin1')).toBe('BWV');
		// The whole point: neither the company nor the job title, nor the
		// PDF, appears anywhere in what would be handed to a cloud folder.
		expect(file.includes('Fabrikam')).toBe(false);
		expect(file.includes('Backend Entwickler')).toBe(false);
		expect(file.includes('%PDF')).toBe(false);

		await eraseEverything(page);
		await page.goto('/backup');
		// The key database went with everything else.
		await expect(page.getByRole('button', { name: 'Verschlüsselung einrichten' })).toBeVisible();

		await page.locator('input[type="file"][accept^=".bwv"]').setInputFiles({
			name: 'backup.bwv',
			mimeType: 'application/octet-stream',
			buffer: file
		});
		const unlock = page.getByRole('dialog', { name: 'Verschlüsselte Sicherung öffnen' });
		await unlock.locator('#vault-secret').fill('das falsche passwort');
		await unlock.getByRole('button', { name: 'Entsperren und importieren' }).click();
		await expect(unlock.getByRole('alert')).toHaveText(
			'Passwort oder Wiederherstellungsschlüssel passt nicht zu dieser Sicherung.'
		);

		await unlock.getByRole('radio', { name: 'Wiederherstellungsschlüssel' }).check();
		await unlock.locator('#vault-secret').fill(recoveryKey);
		await unlock.getByRole('button', { name: 'Entsperren und importieren' }).click();
		await expect(unlock).toBeHidden();
		await expect(page.locator('.status-msg.success-msg')).toHaveText(
			'Verschlüsselte Sicherung wiederhergestellt.'
		);
		// The wiped device adopted the vault: its own exports use the same key.
		await expect(page.getByRole('button', { name: 'Verschlüsselt herunterladen' })).toBeVisible();

		await page.goto('/board');
		const card = page.locator('.card', { hasText: 'Fabrikam AG' });
		await expect(card).toBeVisible();
		await card.locator('.card-open-btn').click();
		await expect(modal.getByRole('button', { name: 'Anzeigen', exact: true })).toBeVisible();
	});

	test('without a remembered key, every export asks for the passphrase', async ({ page }) => {
		await setUpEncryption(page, false);
		await expect(
			page.getByText('Eingerichtet. Beim Export fragt bewerby nach deinem Passwort.')
		).toBeVisible();

		// The passphrase was just typed, so the key stays unlocked for this
		// visit; a reload is where "not remembered" starts to show.
		await page.reload();
		await page.getByRole('button', { name: 'Verschlüsselt herunterladen' }).click();
		const unlock = page.getByRole('dialog', { name: 'Passwort für den Export' });
		await unlock.locator('#vault-secret').fill(PASSPHRASE);
		await unlock.getByLabel('Schlüssel auf diesem Gerät merken').uncheck();
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			unlock.getByRole('button', { name: 'Entsperren' }).click()
		]);
		expect(download.suggestedFilename()).toMatch(/\.bwv$/);
		await expect(unlock).toBeHidden();

		// Still not remembered after a reload.
		await page.reload();
		await page.getByRole('button', { name: 'Verschlüsselt herunterladen' }).click();
		await expect(page.getByRole('dialog', { name: 'Passwort für den Export' })).toBeVisible();
	});

	test('a file that is not an encrypted backup is turned away before any passphrase prompt', async ({
		page
	}) => {
		await page.goto('/backup');
		await page.locator('input[type="file"][accept^=".bwv"]').setInputFiles({
			name: 'notes.bwv',
			mimeType: 'application/octet-stream',
			buffer: Buffer.from('{"version":3,"applications":[]}')
		});
		await expect(page.locator('.status-msg.error-msg')).toHaveText(
			'Das ist keine verschlüsselte bewerby-Sicherung.'
		);
		await expect(page.getByRole('dialog')).toHaveCount(0);
	});
});
