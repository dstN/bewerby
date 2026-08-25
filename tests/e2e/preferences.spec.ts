import { test, expect } from '@playwright/test';

/**
 * Theme and language are stored in localStorage and re-applied by the inline
 * script in app.html *before* first paint. That makes them easy to break in a
 * way unit tests cannot see: the store can be perfectly correct while the
 * no-FOUC script, the storage key, or the prerendered shell disagree with it.
 */

test.describe('Theme preference', () => {
	test('toggles, persists, and is applied before the app hydrates', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('html')).not.toHaveClass(/dark/);

		await page.getByRole('button', { name: 'Design wechseln' }).click();
		await expect(page.locator('html')).toHaveClass(/dark/);
		expect(await page.evaluate(() => localStorage.getItem('bewerby-theme'))).toBe('dark');

		await page.reload();
		await expect(page.locator('html')).toHaveClass(/dark/);
	});

	test('a stored dark theme is on the root element before any script of ours runs', async ({
		page
	}) => {
		await page.addInitScript(() => localStorage.setItem('bewerby-theme', 'dark'));
		await page.goto('/', { waitUntil: 'commit' });
		// Sampled without waiting for hydration: if this only became true later,
		// the user would see a white flash first.
		await expect(page.locator('html')).toHaveClass(/dark/);
	});

	test('follows the OS preference when the user has never chosen', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'dark' });
		await page.goto('/');
		await expect(page.locator('html')).toHaveClass(/dark/);
		expect(await page.evaluate(() => localStorage.getItem('bewerby-theme'))).toBeNull();
	});

	test('an explicit choice wins over the opposite OS preference', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'dark' });
		await page.addInitScript(() => localStorage.setItem('bewerby-theme', 'light'));
		await page.goto('/');
		await expect(page.locator('html')).not.toHaveClass(/dark/);
	});

	test('survives a hard navigation to another route', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Design wechseln' }).click();
		await expect(page.locator('html')).toHaveClass(/dark/);

		await page.goto('/settings', { waitUntil: 'load' });
		await expect(page.locator('html')).toHaveClass(/dark/);
	});
});

test.describe('Language preference', () => {
	test('switches the whole UI and persists across a reload', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kanban-Board');

		await page.getByRole('button', { name: /DE –/ }).click();
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kanban Board');
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		expect(await page.evaluate(() => localStorage.getItem('bewerby-locale'))).toBe('en');

		await page.reload();
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kanban Board');
	});

	test('translates the navigation, not only the page body', async ({ page }) => {
		await page.addInitScript(() => localStorage.setItem('bewerby-locale', 'en'));
		await page.goto('/');
		const nav = page.locator('#mobile-sidebar');
		await expect(nav.getByRole('link', { name: 'Analytics', exact: true })).toBeVisible();
		await expect(nav.getByRole('link', { name: 'Backup & Sync', exact: true })).toBeVisible();
	});

	test('switching back to German restores German', async ({ page }) => {
		await page.addInitScript(() => localStorage.setItem('bewerby-locale', 'en'));
		await page.goto('/');
		await page.getByRole('button', { name: /EN –/ }).click();
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kanban-Board');
		await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	});

	test('renders no raw translation keys on any route in either language', async ({ page }) => {
		for (const locale of ['de', 'en']) {
			await page.addInitScript((value) => localStorage.setItem('bewerby-locale', value), locale);
			for (const route of ['/', '/analytics', '/backup', '/settings', '/kontakt']) {
				await page.goto(route);
				await expect(page.locator('#main-content')).toBeVisible();
				// i18n's resolve() returns the key itself when it cannot find a
				// translation, so an untranslated string shows up as literal
				// "kanban.subtitle" text rather than as a blank or an error.
				const body = await page.locator('body').innerText();
				const leaked = body
					.split(/\s+/)
					.filter((word) => /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/.test(word))
					// Real dotted strings that are not translation keys.
					.filter((word) => !/^(bewerby|contact)\./.test(word) && !word.endsWith('.de'));
				expect(leaked, `raw keys on ${route} (${locale})`).toEqual([]);
			}
		}
	});
});
