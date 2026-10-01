import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { makeMinimalPdf } from './fixtures/make-pdf.js';
import { PASSPHRASE, exportEncrypted, importEncrypted, setUpEncryption } from './fixtures/vault.js';

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

	test('the recovery key has to be confirmed before anything is stored', async ({ page }) => {
		await page.goto('/backup');
		await page.getByRole('button', { name: 'Verschlüsselung einrichten' }).click();
		const dialog = page.getByRole('dialog', { name: 'Verschlüsselung einrichten' });
		await dialog.getByLabel('Passwort', { exact: true }).fill(PASSPHRASE);
		await dialog.getByLabel('Passwort wiederholen').fill(PASSPHRASE);
		await dialog.getByRole('button', { name: 'Weiter' }).click();
		const recoveryKey = (await dialog.getByTestId('recovery-key').textContent())!.trim();
		expect(recoveryKey).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);

		await dialog.getByLabel('Zur Bestätigung').fill('0000');
		await dialog.getByRole('button', { name: 'Fertig' }).click();
		await expect(dialog.getByRole('alert')).toContainText('stimmen nicht');

		// Closing here leaves no vault behind.
		await dialog.getByRole('button', { name: 'Schließen' }).click();
		await page.reload();
		await expect(page.getByRole('button', { name: 'Verschlüsselung einrichten' })).toBeVisible();
	});

	test('two devices merge their changes through the file, without duplicates', async ({
		page,
		browser
	}, testInfo) => {
		const modal = (target: typeof page) => target.locator('dialog.modal-content');
		async function addApplication(target: typeof page, company: string, notes: string) {
			await target.goto('/board');
			await target.getByRole('button', { name: 'Bewerbung hinzufügen' }).click();
			await modal(target).locator('#title').fill('Entwickler');
			await modal(target).locator('#company').fill(company);
			await modal(target).locator('#notes').fill(notes);
			await modal(target).getByRole('button', { name: 'Speichern' }).click();
			await expect(modal(target)).toBeHidden();
		}
		async function edit(target: typeof page, company: string, field: string, value: string) {
			await target.goto('/board');
			await target.locator('.card', { hasText: company }).locator('.card-open-btn').click();
			await modal(target).locator(field).fill(value);
			await modal(target).getByRole('button', { name: 'Speichern' }).click();
			await expect(modal(target)).toBeHidden();
		}

		// The laptop sets up the vault and has one application.
		const laptop = page;
		await setUpEncryption(laptop);
		await addApplication(laptop, 'Fabrikam AG', 'Erster Satz.');
		const fromLaptop = await exportEncrypted(laptop);

		// The phone has its own application before it ever sees the vault.
		const phoneContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
		const phone = await phoneContext.newPage();
		phone.on('dialog', (dialog) => dialog.accept());
		await addApplication(phone, 'Northwind GmbH', '');
		await importEncrypted(phone, fromLaptop);
		await phone.goto('/board');
		await expect(phone.locator('.card')).toHaveCount(2);

		// Both edit the shared application while apart.
		await edit(phone, 'Fabrikam AG', '#notes', 'Erster Satz. Vom Handy.');
		await edit(laptop, 'Fabrikam AG', '#title', 'Senior Entwickler');

		await importEncrypted(laptop, await exportEncrypted(phone));
		await laptop.goto('/board');
		// One Fabrikam, not two; the phone's application came along.
		await expect(laptop.locator('.card')).toHaveCount(2);
		const merged = laptop.locator('.card', { hasText: 'Fabrikam AG' });
		await expect(merged.locator('.card-title')).toHaveText('Senior Entwickler');
		await merged.locator('.card-open-btn').click();
		await expect(modal(laptop).locator('#notes')).toHaveValue('Erster Satz. Vom Handy.');

		await phoneContext.close();
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
