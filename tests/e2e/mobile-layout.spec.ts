import { test, expect, type Page } from '@playwright/test';
import { representativeBoard, seedApplications } from './fixtures/seed.js';

/**
 * Guards against content escaping the viewport on a phone.
 *
 * The concrete bug this was written for: the board's search input is
 * `width: 100%` with a 36px left inset for its icon plus padding and a
 * border. Without a `border-box` reset that adds up to 50px *past* the
 * container - invisible on desktop, where the wrapper is capped at 320px and
 * the overflow just spilled into the flex row's spare space, but plainly off
 * the right edge of a 390px phone once the mobile breakpoint removes that
 * cap. The same arithmetic applied to every other `width: 100%` element in
 * the app, so these tests check the whole page rather than only that input.
 */

const ROUTES = [
	'/',
	'/board',
	'/analytics',
	'/backup',
	'/settings',
	'/impressum',
	'/datenschutz',
	'/nutzungsbedingungen',
	'/kontakt',
	'/pair'
];

/**
 * 320px is the narrowest viewport WCAG 1.4.10 (reflow) requires content to
 * work at; 390px is a current iPhone. Both are checked because the board's
 * breakpoints only change at 768px, so a layout bug at 390px is usually
 * worse, not absent, at 320px.
 */
const PHONE_VIEWPORTS = [
	{ width: 320, height: 640, label: '320px' },
	{ width: 390, height: 844, label: '390px' }
];

/**
 * Waits until the shell has hydrated *and* the webfont has swapped in. Lexend
 * and its metric-matched fallback are close but not identical, so measuring
 * mid-swap reads widths that belong to neither - the source of an
 * intermittent overflow report on the text-heavy legal pages.
 */
async function settled(page: Page): Promise<void> {
	await page.locator('#main-content').waitFor({ state: 'visible' });
	await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Elements sticking out past the right edge of the viewport, if any. */
async function overflowingElements(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const limit = document.documentElement.clientWidth;
		const describe = (el: Element) => {
			const classes = [...el.classList].join('.');
			return `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
		};
		return [...document.querySelectorAll('body *')]
			.filter((el) => {
				const style = getComputedStyle(el);
				if (style.display === 'none' || style.visibility === 'hidden') return false;
				const rect = el.getBoundingClientRect();
				if (rect.width === 0 && rect.height === 0) return false;
				// 1px of slack absorbs sub-pixel rounding in fractional layouts.
				return rect.right > limit + 1;
			})
			.map((el) => `${describe(el)} (right: ${Math.round(el.getBoundingClientRect().right)}px)`);
	});
}

for (const viewport of PHONE_VIEWPORTS) {
	test.describe(`Mobile layout at ${viewport.label}`, () => {
		test.use({ viewport: { width: viewport.width, height: viewport.height } });

		for (const route of ROUTES) {
			test(`${route} keeps all content inside the viewport`, async ({ page }) => {
				await page.goto(route);
				await settled(page);
				expect(await overflowingElements(page)).toEqual([]);
			});
		}

		test('the populated board keeps all content inside the viewport', async ({ page }) => {
			await page.goto('/board');
			await seedApplications(page, representativeBoard());
			await expect(page.locator('.card')).toHaveCount(5);
			await settled(page);
			expect(await overflowingElements(page)).toEqual([]);
		});

		test('the application dialog keeps all content inside the viewport', async ({ page }) => {
			await page.goto('/board');
			await page.getByRole('button', { name: 'Bewerbung hinzufügen' }).click();
			await expect(page.locator('dialog.modal-content')).toBeVisible();
			await settled(page);
			expect(await overflowingElements(page)).toEqual([]);
		});

		test('the dispatch dialog keeps all content inside the viewport', async ({ page }) => {
			await page.goto('/board');
			await page.getByRole('button', { name: 'Bewerbung hinzufügen' }).click();
			const modal = page.locator('dialog.modal-content');
			await modal.locator('#title').fill('Pflegefachkraft');
			await modal.locator('#company').fill('Klinikum Musterstadt gGmbH');
			await modal.getByRole('button', { name: 'Speichern' }).click();
			await expect(modal).toBeHidden();

			await page.getByRole('button', { name: 'Bewerbung vorbereiten' }).first().click();
			await expect(page.locator('dialog.dispatch-dialog')).toBeVisible();
			await settled(page);
			expect(await overflowingElements(page)).toEqual([]);
		});

		test('the document itself never scrolls sideways', async ({ page }) => {
			await page.goto('/');
			await seedApplications(page, representativeBoard());
			await settled(page);
			const { scrollWidth, clientWidth } = await page.evaluate(() => ({
				scrollWidth: document.documentElement.scrollWidth,
				clientWidth: document.documentElement.clientWidth
			}));
			expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
		});
	});
}

test.describe('The board search field on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('fits inside its filter bar instead of running off the right edge', async ({ page }) => {
		await page.goto('/board');
		const input = page.locator('.search-input-wrapper input');
		await expect(input).toBeVisible();

		const [inputBox, barBox, viewportWidth] = await Promise.all([
			input.boundingBox(),
			page.locator('.filter-bar').boundingBox(),
			page.evaluate(() => document.documentElement.clientWidth)
		]);

		expect(inputBox!.x + inputBox!.width).toBeLessThanOrEqual(viewportWidth + 1);
		// The tighter assertion: it must sit inside its own container, not merely
		// happen to stay on screen.
		expect(inputBox!.x + inputBox!.width).toBeLessThanOrEqual(barBox!.x + barBox!.width + 1);
		expect(inputBox!.x).toBeGreaterThanOrEqual(barBox!.x - 1);
	});

	test('leaves room for the search icon rather than typing underneath it', async ({ page }) => {
		await page.goto('/board');
		const input = page.locator('.search-input-wrapper input');
		await input.fill('Contoso');

		const [inputBox, iconBox] = await Promise.all([
			input.boundingBox(),
			page.locator('.search-icon').boundingBox()
		]);
		// The icon is absolutely positioned over the input's left padding; the
		// text starts after it.
		const textStart =
			inputBox!.x + (await input.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft)));
		expect(textStart).toBeGreaterThanOrEqual(iconBox!.x + iconBox!.width);
	});

	test('still filters the board once typed into', async ({ page }) => {
		await page.goto('/board');
		await seedApplications(page, representativeBoard());
		await expect(page.locator('.card')).toHaveCount(5);

		await page.locator('.search-input-wrapper input').fill('Contoso');
		await expect(page.locator('.card')).toHaveCount(1);
		await expect(page.locator('.card')).toContainText('Contoso GmbH');
	});

	test('every filter control stays inside the filter bar', async ({ page }) => {
		await page.goto('/board');
		const barBox = (await page.locator('.filter-bar').boundingBox())!;
		const selects = page.locator('.filter-dropdowns select');
		const count = await selects.count();
		expect(count).toBe(4);

		for (let i = 0; i < count; i++) {
			const box = (await selects.nth(i).boundingBox())!;
			expect(box.x + box.width).toBeLessThanOrEqual(barBox.x + barBox.width + 1);
		}
	});

	/**
	 * A regression test for a bug the "stays inside the filter bar" check above
	 * cannot catch: a native <select> never overflows its own box - an
	 * over-narrow one just silently clips its label text inside a
	 * still-perfectly-in-bounds box. `flex: 1` (which sets `flex-basis: 0%`)
	 * let all four selects shrink to fit one row instead of ever triggering
	 * `flex-wrap`, so every label rendered as one or two characters ("Alle
	 * Tags" -> "Al") while every bounding-box assertion above kept passing.
	 * Asserting each select spans the *full* width of the bar - i.e. that they
	 * stack one per row - is what actually catches that.
	 */
	test('filter selects stack full-width instead of cramming onto one row', async ({ page }) => {
		await page.goto('/board');
		const barBox = (await page.locator('.filter-bar').boundingBox())!;
		const selects = page.locator('.filter-dropdowns select');
		const count = await selects.count();
		expect(count).toBe(4);

		const boxes = await Promise.all(
			Array.from({ length: count }, (_, i) => selects.nth(i).boundingBox())
		);

		for (const box of boxes) {
			expect(box!.width).toBeGreaterThan(barBox.width * 0.9);
		}
		for (let i = 1; i < boxes.length; i++) {
			expect(boxes[i]!.y).toBeGreaterThan(boxes[i - 1]!.y);
		}
	});
});

test.describe('Sizing rules that keep the layout honest', () => {
	test('border-box sizing is applied globally, not patched per component', async ({ page }) => {
		await page.goto('/board');
		await expect(page.locator('#main-content')).toBeVisible();

		// Sampling a few unrelated elements rather than asserting on the rule
		// text: this is about the computed result every component relies on.
		const boxSizings = await page.evaluate(() =>
			['body', '#main-content', '.filter-bar', '.search-input-wrapper input', '.kanban-column']
				.map((selector) => document.querySelector(selector))
				.filter((el): el is Element => el !== null)
				.map((el) => getComputedStyle(el).boxSizing)
		);
		expect(boxSizings.length).toBeGreaterThan(3);
		expect(new Set(boxSizings)).toEqual(new Set(['border-box']));
	});

	test('the viewport meta tag does not block pinch-zoom (WCAG 1.4.4)', async ({ page }) => {
		await page.goto('/');
		const content = await page.locator('meta[name="viewport"]').getAttribute('content');
		expect(content).not.toMatch(/user-scalable\s*=\s*(no|0)/);
		expect(content).not.toMatch(/maximum-scale\s*=\s*[01](\.\d+)?\b/);
	});
});
