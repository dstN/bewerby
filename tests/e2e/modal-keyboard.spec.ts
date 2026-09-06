import { test, expect } from '@playwright/test';

test.describe('Application dialog keyboard path', () => {
	test.beforeEach(({ page }) => {
		page.on('dialog', (dialog) => dialog.accept());
	});

	test('Tab wraps focus inside the dialog and Escape returns focus to the trigger', async ({
		page
	}) => {
		await page.goto('/board');

		const addButton = page.getByRole('button', { name: 'Bewerbung hinzufügen' });
		await addButton.focus();
		await page.keyboard.press('Enter');

		const dialog = page.locator('dialog.modal-content');
		await expect(dialog).toBeVisible();

		// The dialog is native <dialog>.showModal(), which moves focus inside on
		// open. It should land on (or inside) the dialog, never stay on the
		// trigger button behind it.
		await expect(dialog).toContainText('Bewerbung hinzufügen');
		const activeIsInsideDialog = await page.evaluate(() => {
			const dialogEl = document.querySelector('dialog.modal-content');
			return !!dialogEl && dialogEl.contains(document.activeElement);
		});
		expect(activeIsInsideDialog).toBe(true);

		// Shift+Tab from the first focusable element must wrap to the last
		// (manual focus-trap fallback for Chromium's <dialog>, see issue #18).
		const focusables = dialog.locator(
			'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled])'
		);
		const firstId = await focusables.first().evaluate((el) => el.id || el.className);
		const lastId = await focusables.last().evaluate((el) => el.id || el.className);

		await focusables.first().focus();
		await page.keyboard.press('Shift+Tab');
		const afterShiftTab = await page.evaluate(
			() => document.activeElement?.id || document.activeElement?.className
		);
		expect(afterShiftTab).toBe(lastId);

		await focusables.last().focus();
		await page.keyboard.press('Tab');
		const afterTab = await page.evaluate(
			() => document.activeElement?.id || document.activeElement?.className
		);
		expect(afterTab).toBe(firstId);

		// Escape with no unsaved changes closes immediately (no confirm()) and
		// returns focus to whatever opened the dialog.
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
		await expect(addButton).toBeFocused();
	});

	test('Escape with unsaved changes asks for confirmation before closing', async ({ page }) => {
		await page.goto('/board');
		await page.getByRole('button', { name: 'Bewerbung hinzufügen' }).click();
		const dialog = page.locator('dialog.modal-content');
		await dialog.locator('#title').fill('Ungespeichert');

		let dialogMessage = '';
		page.removeAllListeners('dialog');
		page.on('dialog', (d) => {
			dialogMessage = d.message();
			d.accept();
		});

		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
		expect(dialogMessage).toContain('ungespeicherte');
	});
});
