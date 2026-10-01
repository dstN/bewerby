import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import type { AxeResults, Result } from 'axe-core';
import { representativeBoard, seedApplications } from './fixtures/seed.js';

/**
 * Accessibility conformance sweep.
 *
 * Held to WCAG 2.2 **Level AAA** plus axe's best-practice ruleset, not the
 * usual AA baseline. Only three of axe's rules are AAA-only
 * (color-contrast-enhanced, identical-links-same-purpose,
 * meta-refresh-no-exceptions) - the rest of AAA is not machine-testable - but
 * the enhanced 7:1 contrast threshold is exactly the one a hand-tuned dark
 * theme is most likely to drift out of, so it is worth pinning here rather
 * than re-checking by eye. `best-practice` adds the landmark/heading/region
 * structure rules, which is what keeps the app navigable by rotor rather
 * than merely technically labelled.
 *
 * Every scan runs in both themes: the two palettes are independent sets of
 * custom properties, so passing in light says nothing about dark.
 *
 * Scans also run with reduced motion emulated. The app's global
 * reduced-motion rule collapses all transition durations to ~0, so overlays
 * (the modal, the date picker popover) are at their final opacity by the time
 * axe samples them. Without it axe reads *mid-fade* blended colours - e.g. a
 * label measured against a half-transparent dialog - and reports contrast
 * numbers for pixels no user ever sees, which is both wrong and flaky.
 */
test.use({ contextOptions: { reducedMotion: 'reduce' } });

const A11Y_TAGS = [
	'wcag2a',
	'wcag2aa',
	'wcag2aaa',
	'wcag21a',
	'wcag21aa',
	'wcag22a',
	'wcag22aa',
	'best-practice'
];

const ROUTES: Array<{ path: string; name: string }> = [
	{ path: '/', name: 'Landing' },
	{ path: '/board', name: 'Kanban board' },
	{ path: '/analytics', name: 'Analytics' },
	{ path: '/backup', name: 'Backup' },
	{ path: '/settings', name: 'Settings' },
	{ path: '/impressum', name: 'Impressum' },
	{ path: '/datenschutz', name: 'Datenschutz' },
	{ path: '/nutzungsbedingungen', name: 'Nutzungsbedingungen' },
	{ path: '/kontakt', name: 'Kontakt' }
];

type Theme = 'light' | 'dark';

/** Sets the theme the way the app itself does, before the page boots, so the
 *  inline no-FOUC script in app.html applies it on first paint. */
async function gotoWithTheme(page: Page, path: string, theme: Theme): Promise<void> {
	await page.addInitScript((value) => {
		localStorage.setItem('bewerby-theme', value);
	}, theme);
	await page.goto(path);
	await expect(page.locator('#main-content')).toBeVisible();
	await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark).*$/);
}

function analyze(page: Page): AxeBuilder {
	return new AxeBuilder({ page }).withTags(A11Y_TAGS);
}

/** Turns axe's nested result shape into something a failing assertion can
 *  actually be read from in CI output. */
function formatViolations(results: AxeResults): string[] {
	return results.violations.map((violation: Result) => {
		const targets = violation.nodes
			.slice(0, 4)
			.map(
				(node) =>
					`      ${node.target.join(' ')}\n        ${node.failureSummary?.replace(/\n/g, '\n        ')}`
			)
			.join('\n');
		const extra =
			violation.nodes.length > 4 ? `\n      ... ${violation.nodes.length - 4} more` : '';
		return `${violation.id} (${violation.impact}): ${violation.help}\n${targets}${extra}`;
	});
}

async function expectNoViolations(page: Page, builder = analyze(page)): Promise<void> {
	const results = await builder.analyze();
	expect(formatViolations(results)).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
	test.describe(`WCAG 2.2 AAA + best practice - ${theme} theme`, () => {
		for (const route of ROUTES) {
			test(`${route.name} (${route.path}) has no violations`, async ({ page }) => {
				await gotoWithTheme(page, route.path, theme);
				await expectNoViolations(page);
			});
		}

		test('the board populated with applications has no violations', async ({ page }) => {
			await gotoWithTheme(page, '/board', theme);
			await seedApplications(page, representativeBoard());

			// Cards, the coloured/specular variants, the tag overflow chip, the
			// per-card status select and the overdue alert banner only exist once
			// there is data - an empty board scan misses nearly every component.
			await expect(page.locator('.card')).toHaveCount(5);
			await expect(page.locator('.alerts-banner')).toBeVisible();
			await expectNoViolations(page);
		});

		test('analytics with real data has no violations', async ({ page }) => {
			await gotoWithTheme(page, '/', theme);
			await seedApplications(page, representativeBoard());
			await page.goto('/analytics');
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
			await expectNoViolations(page);
		});

		test('the application dialog has no violations', async ({ page }) => {
			await gotoWithTheme(page, '/board', theme);
			await page.getByRole('button', { name: 'Bewerbung hinzufügen' }).click();
			await expect(page.locator('dialog.modal-content')).toBeVisible();
			// "Absage" adds the rejection date field; scan with it shown.
			await page.locator('#status').selectOption('rejected');
			await expectNoViolations(page);
		});

		test('the dispatch dialog has no violations', async ({ page }) => {
			await gotoWithTheme(page, '/board', theme);
			await seedApplications(page, representativeBoard());
			await expect(page.locator('.card').first()).toBeVisible();

			await page.getByRole('button', { name: 'Bewerbung vorbereiten' }).first().click();
			const dispatch = page.locator('dialog.dispatch-dialog');
			await expect(dispatch).toBeVisible();

			// With a letter written, the Markdown preview is rendered too - an
			// empty dialog would skip that half of the component.
			await dispatch
				.locator('#dispatch-letter')
				.fill(['Guten Tag,', '', '- **Punkt eins**', '- Punkt zwei'].join('\n'));
			await expect(dispatch.locator('.preview strong')).toBeVisible();

			await expectNoViolations(page);
		});

		test('the date picker popover has no violations', async ({ page }) => {
			await gotoWithTheme(page, '/board', theme);
			await page.getByRole('button', { name: 'Bewerbung hinzufügen' }).click();
			const dialog = page.locator('dialog.modal-content');
			await expect(dialog).toBeVisible();

			await dialog.locator('.datepicker-trigger').first().click();
			await expect(dialog.locator('.datepicker-popup')).toBeVisible();
			await expectNoViolations(page);
		});
	});
}

test.describe('WCAG 2.2 AAA + best practice - mobile (390px)', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	for (const route of ROUTES) {
		test(`${route.name} (${route.path}) has no violations`, async ({ page }) => {
			await gotoWithTheme(page, route.path, 'light');
			await expectNoViolations(page);
		});
	}

	test('the open navigation drawer has no violations', async ({ page }) => {
		await gotoWithTheme(page, '/', 'light');
		await page.getByRole('button', { name: /Menü öffnen/ }).click();
		await expect(page.locator('#mobile-sidebar')).toHaveClass(/mobile-open/);
		await expectNoViolations(page);
	});
});

test.describe('Accessibility details axe cannot assert on its own', () => {
	test('the skip link is the first tab stop and moves focus to the main region', async ({
		page
	}) => {
		await page.goto('/');
		await expect(page.locator('#main-content')).toBeVisible();

		await page.keyboard.press('Tab');
		const skipLink = page.locator('#skip-link');
		await expect(skipLink).toBeFocused();
		// .skip-link is clipped to 1px until focused; it must become readable.
		const box = await skipLink.boundingBox();
		expect(box!.width).toBeGreaterThan(50);
		expect(box!.height).toBeGreaterThan(16);

		await page.keyboard.press('Enter');
		await expect(page.locator('#main-content')).toBeFocused();
	});

	test('the skip link is translated to the stored locale before it can be read', async ({
		page
	}) => {
		await page.addInitScript(() => localStorage.setItem('bewerby-locale', 'en'));
		await page.goto('/');
		await expect(page.locator('#skip-link')).toHaveText('Skip to content');
	});

	test('<html lang> tracks the selected language', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('html')).toHaveAttribute('lang', 'de');

		await page.getByRole('button', { name: /DE –/ }).click();
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	});

	test('the live region announces a status change without moving focus', async ({ page }) => {
		await page.goto('/board');
		await seedApplications(page, representativeBoard());

		const liveRegion = page.locator('.sr-only[aria-live="polite"]');
		await expect(liveRegion).toHaveAttribute('aria-atomic', 'true');

		const card = page.locator('.card', { hasText: 'Contoso GmbH' });
		await card.locator('.card-status-select').selectOption('interview');

		await expect(liveRegion).toContainText('Contoso GmbH');
		// The announcement is the whole point: changing status from the card must
		// not also open the edit dialog and yank focus somewhere else.
		await expect(page.locator('dialog.modal-content')).toHaveCount(0);
	});

	test('the navigation toggle reports its expanded state honestly on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/');

		const toggle = page.getByRole('button', { name: /Menü (öffnen|schließen)/ });
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await expect(toggle).toHaveAttribute('aria-controls', 'mobile-sidebar');

		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');

		await page.keyboard.press('Escape');
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	});

	test('the closed mobile drawer is inert, so Tab never lands in hidden navigation', async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/');
		await expect(page.locator('#mobile-sidebar')).toHaveAttribute('inert', '');

		await page.getByRole('button', { name: /Menü öffnen/ }).click();
		await expect(page.locator('#mobile-sidebar')).not.toHaveAttribute('inert', '');
	});

	test('every route keeps a single top-level h1 that names the page', async ({ page }) => {
		for (const route of ROUTES) {
			await page.goto(route.path);
			const headings = page.getByRole('heading', { level: 1 });
			await expect(headings).toHaveCount(1);
			await expect(headings).not.toBeEmpty();
		}
	});
});

test.describe('Reduced motion', () => {
	// Opts out of the file-level default so this suite can compare both states.
	test.use({ contextOptions: { reducedMotion: 'no-preference' } });

	/** Every transition duration on the page that is not already ~zero. */
	const animatedDurations = (page: Page) =>
		page.evaluate(() =>
			[...document.querySelectorAll('*')]
				.flatMap((el) => getComputedStyle(el).transitionDuration.split(', '))
				.map((value) => parseFloat(value))
				.filter((seconds) => seconds >= 0.001)
		);

	test('collapses every transition when the user asks for reduced motion', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('#main-content')).toBeVisible();
		// Guards the assertion below against passing for the wrong reason: there
		// have to be real transitions here to collapse in the first place.
		expect((await animatedDurations(page)).length).toBeGreaterThan(0);

		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/');
		await expect(page.locator('#main-content')).toBeVisible();
		expect(await animatedDurations(page)).toEqual([]);
	});
});
