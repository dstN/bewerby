import { test, expect } from '@playwright/test';

/**
 * The contact form. The relay is intercepted, so nothing here sends a real
 * mail - what is under test is what the form lets through to it.
 */

const RELAY = 'https://contact.yinside.de/phpmailer.php';

test.describe('Contact form', () => {
	test('will not send until the privacy policy is ticked as read', async ({ page }) => {
		const sent: unknown[] = [];
		await page.route(RELAY, async (route) => {
			sent.push(route.request().postDataJSON());
			await route.fulfill({ json: { success: true } });
		});

		await page.goto('/kontakt');
		await page.locator('#contact-name').fill('Erika Mustermann');
		await page.locator('#contact-email').fill('erika@example.com');
		await page.locator('#contact-message').fill('Eine Frage zu bewerby.');

		const privacy = page.locator('#contact-privacy');
		await page.getByRole('button', { name: /Absenden|Send/ }).click();
		expect(await privacy.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
		expect(sent).toHaveLength(0);

		await privacy.check();
		await page.getByRole('button', { name: /Absenden|Send/ }).click();
		await expect(page.locator('.success-banner')).toBeVisible();
		expect(sent).toHaveLength(1);
		// The tick is an acknowledgement for this form, not data for the mail.
		expect(Object.keys(sent[0] as object).sort()).toEqual(['email', 'message', 'name']);
		// Cleared with the rest, so a second message needs a second tick.
		await expect(privacy).not.toBeChecked();
	});

	test('links the contact-form section of the privacy policy in a new tab', async ({ page }) => {
		await page.goto('/kontakt');
		const link = page.locator('.form-check a');
		await expect(link).toHaveAttribute('href', '/datenschutz#kontaktformular');
		await expect(link).toHaveAttribute('target', '_blank');

		await page.goto('/datenschutz#kontaktformular');
		await expect(page.locator('#kontaktformular')).toBeVisible();
	});
});
