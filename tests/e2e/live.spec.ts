import { test, expect, type Page } from '@playwright/test';
import { PASSPHRASE, setUpEncryption } from './fixtures/vault.js';

/**
 * Pairing a device and live sync (#55): two browser contexts, a real WebRTC
 * data channel between them, signaling through /api/signal on the test
 * server. Chromium hides local addresses behind mDNS names by default, which
 * a headless browser cannot resolve - the channel would never open.
 */
test.use({ launchOptions: { args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] } });

async function addApplication(page: Page, company: string) {
	await page.goto('/board');
	await page.getByRole('button', { name: 'Bewerbung hinzufügen' }).click();
	const modal = page.locator('dialog.modal-content');
	await modal.locator('#title').fill('Entwickler');
	await modal.locator('#company').fill(company);
	await modal.getByRole('button', { name: 'Speichern' }).click();
	await expect(modal).toBeHidden();
}

async function switchLiveOn(page: Page) {
	await page.goto('/backup');
	await page.getByLabel('Live-Abgleich, wenn mehrere Geräte gleichzeitig geöffnet sind').check();
}

test.describe('Devices connected directly', () => {
	test.setTimeout(120_000);

	test('a new device joins through the link, after the codes are compared, and edits then travel live', async ({
		page,
		browser
	}, testInfo) => {
		const laptop = page;
		laptop.on('dialog', (dialog) => dialog.accept());
		await setUpEncryption(laptop);
		await addApplication(laptop, 'Fabrikam AG');

		await laptop.goto('/backup');
		await laptop.getByRole('button', { name: 'Gerät hinzufügen' }).click();
		const unlock = laptop.getByRole('dialog', { name: 'Gerät hinzufügen: Passwort bestätigen' });
		await unlock.locator('#vault-secret').fill(PASSPHRASE);
		await unlock.getByRole('button', { name: 'Weiter' }).click();
		const pairDialog = laptop.getByRole('dialog', { name: 'Gerät hinzufügen', exact: true });
		const link = (await pairDialog.getByTestId('pair-link').textContent())!.trim();
		expect(link).toMatch(/\/pair#p=[0-9A-Z]{26}$/);

		const phoneContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
		const phone = await phoneContext.newPage();
		await addApplication(phone, 'Northwind GmbH');
		await phone.goto(link);

		// Both show the same six digits; only then does the laptop hand over the key.
		const onPhone = phone.getByTestId('pair-compare');
		const onLaptop = pairDialog.getByTestId('pair-compare');
		await expect(onPhone).toBeVisible({ timeout: 45_000 });
		await expect(onLaptop).toBeVisible();
		expect((await onPhone.textContent())!.replace(/\s/g, '')).toBe(
			(await onLaptop.textContent())!.replace(/\s/g, '')
		);
		await expect(phone).toHaveURL(/\/pair$/);
		await pairDialog.getByRole('button', { name: 'Ja, derselbe Code' }).click();

		// Scoped to the page: the live region announces the same sentence.
		await expect(
			phone
				.locator('#main-content')
				.getByText('Fertig. Dieses Gerät verwendet jetzt denselben Schlüssel')
		).toBeVisible({ timeout: 45_000 });
		await expect(pairDialog.getByText('Das Gerät ist verbunden.')).toBeVisible({ timeout: 45_000 });
		await phone.goto('/board');
		await expect(phone.locator('.card')).toHaveCount(2);
		await laptop.goto('/board');
		await expect(laptop.locator('.card')).toHaveCount(2);

		// Live: with both switched on, an edit on one appears on the other.
		await switchLiveOn(laptop);
		await switchLiveOn(phone);
		await expect(laptop.getByText('Live verbunden mit 1 Gerät(en).')).toBeVisible({
			timeout: 60_000
		});
		await phone.goto('/board');
		await expect(laptop.getByText('Live verbunden mit 1 Gerät(en).')).toBeVisible({
			timeout: 60_000
		});
		await laptop.goto('/board');
		const card = laptop.locator('.card', { hasText: 'Fabrikam AG' });
		await card.locator('.card-open-btn').click();
		const modal = laptop.locator('dialog.modal-content');
		await modal.locator('#title').fill('Senior Entwickler');
		await modal.getByRole('button', { name: 'Speichern' }).click();
		await expect(
			phone.locator('.card', { hasText: 'Fabrikam AG' }).locator('.card-title')
		).toHaveText('Senior Entwickler', { timeout: 60_000 });

		await phoneContext.close();
	});

	test('pairing sets the new device up with the store on bewerby.de, so it catches up while the laptop is closed', async ({
		page,
		browser
	}, testInfo) => {
		const laptop = page;
		laptop.on('dialog', (dialog) => dialog.accept());
		await setUpEncryption(laptop);
		await addApplication(laptop, 'Fabrikam AG');

		await laptop.goto('/backup');
		await laptop.getByRole('button', { name: 'Gerät hinzufügen' }).click();
		const unlock = laptop.getByRole('dialog', { name: 'Gerät hinzufügen: Passwort bestätigen' });
		await unlock.locator('#vault-secret').fill(PASSPHRASE);
		await unlock.getByRole('button', { name: 'Weiter' }).click();
		const pairDialog = laptop.getByRole('dialog', { name: 'Gerät hinzufügen', exact: true });
		// No target of its own yet: bewerby.de is offered, and preselected.
		await expect(
			pairDialog.getByLabel('Änderungen verschlüsselt auf bewerby.de bereithalten', {
				exact: false
			})
		).toBeChecked();
		const link = (await pairDialog.getByTestId('pair-link').textContent())!.trim();

		const phoneContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
		const phone = await phoneContext.newPage();
		await phone.goto(link);
		await expect(pairDialog.getByTestId('pair-compare')).toBeVisible({ timeout: 45_000 });
		await pairDialog.getByRole('button', { name: 'Ja, derselbe Code' }).click();
		await expect(pairDialog.getByText('Das Gerät ist verbunden.')).toBeVisible({ timeout: 45_000 });

		// Both sync through bewerby.de now.
		for (const device of [laptop, phone]) {
			await device.goto('/backup');
			await expect(device.getByText('Verbunden mit bewerby.de.')).toBeVisible();
		}

		// A change on the laptop, pushed, and the laptop closed.
		await addApplication(laptop, 'Contoso GmbH');
		await laptop.goto('/backup');
		const syncNow = laptop.getByRole('button', { name: 'Jetzt synchronisieren' });
		for (let i = 0; i < 2; i++) {
			await syncNow.click();
			await expect(syncNow).toBeEnabled();
		}
		await laptop.close();

		// The phone, opened again, has it.
		await phone.goto('/board');
		await expect(phone.locator('.card', { hasText: 'Contoso GmbH' })).toBeVisible({
			timeout: 30_000
		});
		await expect(phone.locator('.card', { hasText: 'Fabrikam AG' })).toBeVisible();

		await phoneContext.close();
	});
});
