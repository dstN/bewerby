import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

export const PASSPHRASE = 'korrekt pferd batterie heftklammer';

/** Runs the setup assistant and returns the recovery key it displayed. */
export async function setUpEncryption(page: Page, remember = true): Promise<string> {
	await page.goto('/backup');
	await page.getByRole('button', { name: 'Verschlüsselung einrichten' }).click();
	const dialog = page.getByRole('dialog', { name: 'Verschlüsselung einrichten' });
	await dialog.getByLabel('Passwort', { exact: true }).fill(PASSPHRASE);
	await dialog.getByLabel('Passwort wiederholen').fill(PASSPHRASE);
	if (!remember) await dialog.getByLabel('Schlüssel auf diesem Gerät merken').uncheck();
	await dialog.getByRole('button', { name: 'Weiter' }).click();

	const recoveryKey = (await dialog.getByTestId('recovery-key').textContent())!.trim();
	await dialog.getByLabel('Zur Bestätigung').fill(recoveryKey.slice(-4));
	await dialog.getByRole('button', { name: 'Fertig' }).click();
	await expect(dialog).toBeHidden();
	return recoveryKey;
}

/** Downloads the encrypted backup from /backup and returns its bytes. */
export async function exportEncrypted(page: Page): Promise<Buffer> {
	await page.goto('/backup');
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Verschlüsselt herunterladen' }).click()
	]);
	return readFileSync((await download.path())!);
}

/** Imports an encrypted backup with the passphrase, merging by default. */
export async function importEncrypted(page: Page, file: Buffer): Promise<void> {
	await page.goto('/backup');
	await page.locator('input[type="file"][accept^=".bwv"]').setInputFiles({
		name: 'backup.bwv',
		mimeType: 'application/octet-stream',
		buffer: file
	});
	const unlock = page.getByRole('dialog', { name: 'Verschlüsselte Sicherung öffnen' });
	await unlock.locator('#vault-secret').fill(PASSPHRASE);
	await unlock.getByRole('button', { name: 'Entsperren und importieren' }).click();
	await expect(unlock).toBeHidden();
	await expect(page.locator('.status-msg.success-msg')).toHaveText(
		'Verschlüsselte Sicherung wiederhergestellt.'
	);
}
