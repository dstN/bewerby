// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The store is written for the browser; `$app/env` reports `browser:
// false` under Vitest's SSR-shaped module graph, which would short-circuit
// init()/setLocale() before they touch localStorage or <html lang>.
vi.mock('$app/env', () => ({ browser: true }));

type I18nModule = typeof import('./index.svelte.js');

/** Fresh module instance per test - `i18n` is a module-level singleton, and
 *  detectLocale() reads localStorage/navigator exactly once, at init(). */
async function loadI18n(): Promise<I18nModule> {
	vi.resetModules();
	return import('./index.svelte.js');
}

function setBrowserLanguage(language: string): void {
	Object.defineProperty(navigator, 'language', { value: language, configurable: true });
}

beforeEach(() => {
	setBrowserLanguage('en-US');
	document.documentElement.lang = '';
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('i18n.t()', () => {
	it('resolves a nested dot-path key', async () => {
		const { i18n } = await loadI18n();
		i18n.setLocale('de');
		expect(i18n.t('kanban.columns.draft')).toBe('In Arbeit');
		i18n.setLocale('en');
		expect(i18n.t('kanban.columns.draft')).toBe('In Progress');
	});

	it('returns the key itself for an unknown path instead of throwing or rendering "undefined"', async () => {
		const { i18n } = await loadI18n();
		expect(i18n.t('does.not.exist')).toBe('does.not.exist');
	});

	it('returns the key when the path resolves to an object rather than a string', async () => {
		const { i18n } = await loadI18n();
		// 'kanban.columns' is a real branch of the tree, but not a leaf - rendering
		// "[object Object]" into the UI would be worse than showing the key.
		expect(i18n.t('kanban.columns')).toBe('kanban.columns');
	});

	it('returns the key when a path continues past a string leaf', async () => {
		const { i18n } = await loadI18n();
		expect(i18n.t('kanban.columns.draft.deeper')).toBe('kanban.columns.draft.deeper');
	});

	it('exposes the same result through the standalone t() shorthand', async () => {
		const { i18n, t } = await loadI18n();
		i18n.setLocale('en');
		expect(t('nav.kanban')).toBe(i18n.t('nav.kanban'));
	});
});

describe('locale detection (init)', () => {
	it('starts at the "de" fallback before init() runs, matching the prerendered HTML', async () => {
		setBrowserLanguage('en-US');
		const { i18n } = await loadI18n();
		expect(i18n.locale).toBe('de');
	});

	it('prefers a stored locale over the browser language', async () => {
		localStorage.setItem('bewerby-locale', 'en');
		setBrowserLanguage('de-DE');
		const { i18n } = await loadI18n();
		i18n.init();
		expect(i18n.locale).toBe('en');
	});

	it('falls back to the browser language when nothing is stored', async () => {
		setBrowserLanguage('en-GB');
		const { i18n } = await loadI18n();
		i18n.init();
		expect(i18n.locale).toBe('en');
	});

	it('ignores an unsupported stored value rather than rendering every key as a fallback', async () => {
		localStorage.setItem('bewerby-locale', 'klingon');
		setBrowserLanguage('en-US');
		const { i18n } = await loadI18n();
		i18n.init();
		expect(i18n.locale).toBe('en');
	});

	it('falls back to "de" for an unsupported browser language', async () => {
		setBrowserLanguage('fr-FR');
		const { i18n } = await loadI18n();
		i18n.init();
		expect(i18n.locale).toBe('de');
	});

	it('sets <html lang> so assistive tech announces the right language', async () => {
		setBrowserLanguage('en-US');
		const { i18n } = await loadI18n();
		i18n.init();
		expect(document.documentElement.lang).toBe('en');
	});
});

describe('setLocale', () => {
	it('persists the choice and updates <html lang>', async () => {
		const { i18n } = await loadI18n();
		i18n.setLocale('en');
		expect(i18n.locale).toBe('en');
		expect(localStorage.getItem('bewerby-locale')).toBe('en');
		expect(document.documentElement.lang).toBe('en');
	});

	it('survives a reload: the stored choice wins over a conflicting browser language', async () => {
		const first = await loadI18n();
		first.i18n.setLocale('en');
		setBrowserLanguage('de-DE');

		const reloaded = await loadI18n();
		reloaded.i18n.init();
		expect(reloaded.i18n.locale).toBe('en');
	});
});

describe('locale metadata', () => {
	it('reports exactly the two shipped locales', async () => {
		const { i18n } = await loadI18n();
		expect(i18n.supportedLocales).toEqual(['de', 'en']);
	});

	it('exposes a human-readable label for the active locale', async () => {
		const { i18n } = await loadI18n();
		i18n.setLocale('de');
		expect(i18n.localeLabel).toBe('Deutsch');
		i18n.setLocale('en');
		expect(i18n.localeLabel).toBe('English');
	});
});
