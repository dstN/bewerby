import { test, expect } from '@playwright/test';

const ROUTES = ['/', '/analytics', '/backup', '/settings', '/impressum', '/datenschutz'];

test.describe('Offline hard reload', () => {
	test('every route still renders after the service worker is active and the network is cut', async ({
		page,
		context
	}) => {
		await page.goto('/');

		// Wait for the real installed-and-activated registration, not just "a
		// registration exists" - .ready only resolves once a worker is
		// controlling the page (see issue #3/#4's install-time fixes).
		await page.evaluate(async () => {
			const registration = await navigator.serviceWorker.ready;
			if (!registration.active) throw new Error('service worker never activated');
		});

		await context.setOffline(true);

		for (const route of ROUTES) {
			// A hard navigation (not client-side routing) is the real test here -
			// it can only succeed offline if the service worker serves a
			// precached document instead of the browser hitting the network.
			await page.goto(route, { waitUntil: 'load' });
			await expect(page.locator('#main-content')).toBeVisible();
			await expect(page.locator('.render-error')).toHaveCount(0);
		}

		await context.setOffline(false);
	});
});
