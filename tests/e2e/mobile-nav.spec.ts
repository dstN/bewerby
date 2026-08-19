import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test.describe('Mobile navigation (390px viewport)', () => {
	const routes: Array<{ path: string; heading: string }> = [
		{ path: '/', heading: 'Kanban-Board' },
		{ path: '/analytics', heading: 'Statistiken' },
		{ path: '/backup', heading: 'Backup & Sync' },
		{ path: '/settings', heading: 'Einstellungen' }
	];

	test('every route is reachable through the hamburger drawer', async ({ page }) => {
		await page.goto('/');

		for (const route of routes) {
			const toggle = page.getByRole('button', { name: /Menü (öffnen|schließen)/ });
			await toggle.click();

			const drawer = page.locator('#mobile-sidebar');
			await expect(drawer).toHaveClass(/mobile-open/);

			await drawer.getByRole('link', { name: route.heading, exact: true }).click();
			await expect(page).toHaveURL(new RegExp(route.path === '/' ? '/$' : route.path + '$'));
			await expect(page.getByRole('heading', { level: 1 })).toHaveText(route.heading);

			// Navigating closes the drawer automatically (afterNavigate hook).
			await expect(drawer).not.toHaveClass(/mobile-open/);
		}
	});

	test('the kanban board reflows into a single column instead of forcing horizontal scroll', async ({
		page
	}) => {
		await page.goto('/');
		const board = page.locator('.kanban-board');
		await expect(board).toBeVisible();

		const [boardBox, viewportWidth] = await Promise.all([
			board.boundingBox(),
			page.evaluate(() => window.innerWidth)
		]);
		expect(boardBox).not.toBeNull();
		expect(boardBox!.width).toBeLessThanOrEqual(viewportWidth + 1);

		const scrollWidth = await board.evaluate((el) => el.scrollWidth);
		expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 1);
	});
});
