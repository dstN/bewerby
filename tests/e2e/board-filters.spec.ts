import { test, expect, type Page } from '@playwright/test';
import { makeSeedApplication, seedApplications } from './fixtures/seed.js';

/**
 * The board's search / filter / sort controls. All of it lives in one
 * `$derived` chain over the live query, so a change to any single control can
 * quietly break the combination with another - these drive the real controls
 * rather than the derived function.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();

function board() {
	return [
		makeSeedApplication({
			title: 'Frontend Entwickler',
			company: 'Contoso GmbH',
			status: 'draft',
			priority: 'high',
			tags: ['remote', 'svelte'],
			cardColor: '#6366f1',
			notes: 'Über Xing gefunden.',
			appliedAt: now - 2 * DAY_MS
		}),
		makeSeedApplication({
			title: 'Backend Entwickler',
			company: 'Fabrikam AG',
			status: 'sent',
			priority: 'low',
			tags: ['go'],
			notes: 'Kaltakquise.',
			appliedAt: now - 10 * DAY_MS
		}),
		makeSeedApplication({
			title: 'Data Engineer',
			company: 'Northwind Ltd.',
			status: 'interview',
			priority: 'medium',
			tags: ['remote', 'python'],
			cardColor: '#10b981',
			notes: 'Empfehlung von Contoso-Kollegin.',
			appliedAt: now - 1 * DAY_MS
		})
	];
}

/**
 * Sorting reorders the filtered list, but the board then *groups* it by
 * status into five fixed columns - so a sort is only observable between cards
 * that share a column. These four all sit in "sent" for that reason.
 */
function oneColumnBoard() {
	return [
		makeSeedApplication({
			title: 'Ops Engineer',
			company: 'Adventure Works',
			status: 'sent',
			priority: 'low',
			appliedAt: now - 30 * DAY_MS
		}),
		makeSeedApplication({
			title: 'QA Engineer',
			company: 'Blue Yonder',
			status: 'sent',
			priority: 'high',
			cardColor: '#10b981',
			appliedAt: now - 20 * DAY_MS
		}),
		makeSeedApplication({
			title: 'Release Manager',
			company: 'Coho Vineyard',
			status: 'sent',
			priority: 'medium',
			appliedAt: now - 1 * DAY_MS
		}),
		makeSeedApplication({
			title: 'Site Reliability Engineer',
			company: 'Wide World Importers',
			status: 'sent',
			priority: 'medium',
			cardColor: '#6366f1',
			appliedAt: now - 10 * DAY_MS
		})
	];
}

const cards = (page: Page) => page.locator('.card');
const search = (page: Page) => page.locator('.search-input-wrapper input');

/**
 * Companies in rendered order. textContent, not innerText: .card-company is
 * `text-transform: uppercase`, which innerText would bake into the string.
 */
async function visibleCompanies(page: Page): Promise<string[]> {
	return page.locator('.card .card-company').allTextContents();
}

async function open(page: Page, applications: ReturnType<typeof board>) {
	await page.goto('/');
	await seedApplications(page, applications);
	await expect(cards(page)).toHaveCount(applications.length);
}

test.describe('Search', () => {
	test.beforeEach(async ({ page }) => open(page, board()));

	test('matches on the job title', async ({ page }) => {
		await search(page).fill('Backend');
		await expect(cards(page)).toHaveCount(1);
		await expect(cards(page)).toContainText('Fabrikam AG');
	});

	test('matches on the company', async ({ page }) => {
		await search(page).fill('Northwind');
		await expect(cards(page)).toHaveCount(1);
		await expect(cards(page)).toContainText('Data Engineer');
	});

	test('matches on the notes, which are not visible on the card', async ({ page }) => {
		await search(page).fill('Kaltakquise');
		await expect(cards(page)).toHaveCount(1);
		await expect(cards(page)).toContainText('Fabrikam AG');
	});

	test('is case-insensitive', async ({ page }) => {
		await search(page).fill('cOnToSo');
		// Two hits: Contoso GmbH itself, and Northwind's notes mentioning it.
		await expect(cards(page)).toHaveCount(2);
	});

	test('shows an empty board rather than an error for no matches', async ({ page }) => {
		await search(page).fill('Initech');
		await expect(cards(page)).toHaveCount(0);
		await expect(page.locator('.kanban-column')).toHaveCount(5);
	});

	test('clearing the field restores every card', async ({ page }) => {
		await search(page).fill('Initech');
		await expect(cards(page)).toHaveCount(0);
		await search(page).fill('');
		await expect(cards(page)).toHaveCount(3);
	});

	test('keeps the column counters in step with what is shown', async ({ page }) => {
		await search(page).fill('Backend');
		const sentColumn = page.locator('.kanban-column', {
			has: page.locator('.column-title', { hasText: 'Versendet' })
		});
		await expect(sentColumn.locator('.column-badge')).toHaveText('1');

		const draftColumn = page.locator('.kanban-column', {
			has: page.locator('.column-title', { hasText: 'In Arbeit' })
		});
		await expect(draftColumn.locator('.column-badge')).toHaveText('0');
	});
});

test.describe('Filters', () => {
	test.beforeEach(async ({ page }) => open(page, board()));

	test('filters by tag, listing only tags actually in use', async ({ page }) => {
		const tagSelect = page.getByLabel('Tags / Labels', { exact: true });
		await expect(tagSelect.locator('option')).toHaveText([
			'Alle Tags',
			'remote',
			'svelte',
			'go',
			'python'
		]);

		await tagSelect.selectOption('remote');
		await expect(cards(page)).toHaveCount(2);
		await expect(cards(page)).toContainText(['Contoso GmbH', 'Northwind Ltd.']);
	});

	test('filters by priority', async ({ page }) => {
		await page.getByLabel('Priorität', { exact: true }).selectOption('low');
		await expect(cards(page)).toHaveCount(1);
		await expect(cards(page)).toContainText('Fabrikam AG');
	});

	test('filters to coloured cards only', async ({ page }) => {
		await page.getByLabel('Alle Farben').selectOption('colored');
		await expect(cards(page)).toHaveCount(2);
		await expect(page.locator('.card .card-color-dot')).toHaveCount(2);
	});

	test('filters to uncoloured cards only', async ({ page }) => {
		await page.getByLabel('Alle Farben').selectOption('uncolored');
		await expect(cards(page)).toHaveCount(1);
		await expect(cards(page)).toContainText('Fabrikam AG');
	});

	test('filters by one specific colour', async ({ page }) => {
		await page.getByLabel('Alle Farben').selectOption('#6366f1');
		await expect(cards(page)).toHaveCount(1);
		await expect(cards(page)).toContainText('Contoso GmbH');
	});

	test('combines filters as AND, not OR', async ({ page }) => {
		await page.getByLabel('Tags / Labels', { exact: true }).selectOption('remote');
		await page.getByLabel('Priorität', { exact: true }).selectOption('high');
		// remote matches Contoso + Northwind; high narrows it to Contoso alone.
		await expect(cards(page)).toHaveCount(1);
		await expect(cards(page)).toContainText('Contoso GmbH');
	});

	test('combines search with a filter', async ({ page }) => {
		await search(page).fill('Contoso');
		await page.getByLabel('Priorität', { exact: true }).selectOption('medium');
		// Northwind's notes mention Contoso and its priority is medium.
		await expect(cards(page)).toHaveCount(1);
		await expect(cards(page)).toContainText('Northwind Ltd.');
	});
});

test.describe('Sorting', () => {
	test.beforeEach(async ({ page }) => open(page, oneColumnBoard()));

	test('leaves the order alone by default', async ({ page }) => {
		expect(await visibleCompanies(page)).toEqual([
			'Adventure Works',
			'Blue Yonder',
			'Coho Vineyard',
			'Wide World Importers'
		]);
	});

	test('sorts by priority, highest first', async ({ page }) => {
		await page.getByLabel('Sortieren nach').selectOption('priority');
		const companies = await visibleCompanies(page);
		expect(companies[0]).toBe('Blue Yonder'); // the only "high"
		expect(companies.at(-1)).toBe('Adventure Works'); // the only "low"
	});

	test('sorts by application date, most recent first', async ({ page }) => {
		await page.getByLabel('Sortieren nach').selectOption('date');
		expect(await visibleCompanies(page)).toEqual([
			'Coho Vineyard', // 1 day ago
			'Wide World Importers', // 10 days
			'Blue Yonder', // 20 days
			'Adventure Works' // 30 days
		]);
	});

	test('sorts coloured cards ahead of uncoloured ones', async ({ page }) => {
		await page.getByLabel('Sortieren nach').selectOption('color');
		const companies = await visibleCompanies(page);
		const coloured = ['Blue Yonder', 'Wide World Importers'];
		expect(companies.slice(0, 2).sort()).toEqual(coloured);
	});

	test('sorting changes the order without changing which cards are shown', async ({ page }) => {
		const before = (await visibleCompanies(page)).slice().sort();
		await page.getByLabel('Sortieren nach').selectOption('priority');
		expect((await visibleCompanies(page)).slice().sort()).toEqual(before);
	});

	test('sorting applies to the filtered list, not the whole table', async ({ page }) => {
		await search(page).fill('Engineer');
		await page.getByLabel('Sortieren nach').selectOption('priority');
		const companies = await visibleCompanies(page);
		// "Release Manager" has no "Engineer" in it, so Coho drops out entirely.
		expect(companies).not.toContain('Coho Vineyard');
		expect(companies[0]).toBe('Blue Yonder');
	});
});
