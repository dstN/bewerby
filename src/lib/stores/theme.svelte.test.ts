// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$app/env', () => ({ browser: true }));

const STORAGE_KEY = 'bewerby-theme';

type ThemeModule = typeof import('./theme.svelte.js');

/** A matchMedia stand-in whose `matches` can be flipped and whose registered
 *  listeners can be fired, standing in for the OS switching to dark mode
 *  while the app is open (jsdom implements neither). */
function installSystemPreference(prefersDark: boolean) {
	const listeners = new Set<(event: MediaQueryListEvent) => void>();
	const mql = {
		get matches() {
			return prefersDark;
		},
		media: '(prefers-color-scheme: dark)',
		onchange: null,
		addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
			void listeners.add(listener),
		removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
			void listeners.delete(listener),
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false
	};
	vi.stubGlobal('matchMedia', () => mql as unknown as MediaQueryList);
	return {
		/** Simulates the OS theme changing after the app has already booted. */
		emitSystemChange(nowPrefersDark: boolean) {
			prefersDark = nowPrefersDark;
			for (const listener of listeners) {
				listener({ matches: nowPrefersDark } as MediaQueryListEvent);
			}
		}
	};
}

/** The store applies the class in its constructor, so the module has to be
 *  re-imported after each scenario is set up - not hoisted to the top. */
async function loadTheme(): Promise<ThemeModule> {
	vi.resetModules();
	return import('./theme.svelte.js');
}

const isDarkClassApplied = () => document.documentElement.classList.contains('dark');

beforeEach(() => {
	document.documentElement.classList.remove('dark');
});

describe('initial theme', () => {
	it('follows the system preference when the user has never chosen', async () => {
		installSystemPreference(true);
		const { theme } = await loadTheme();
		expect(theme.current).toBe('dark');
		expect(theme.isDark).toBe(true);
		expect(isDarkClassApplied()).toBe(true);
	});

	it('defaults to light when the system prefers light', async () => {
		installSystemPreference(false);
		const { theme } = await loadTheme();
		expect(theme.current).toBe('light');
		expect(isDarkClassApplied()).toBe(false);
	});

	it('a stored choice overrides the system preference', async () => {
		localStorage.setItem(STORAGE_KEY, 'light');
		installSystemPreference(true);
		const { theme } = await loadTheme();
		expect(theme.current).toBe('light');
		expect(isDarkClassApplied()).toBe(false);
	});

	it('ignores a corrupted stored value and falls back to the system preference', async () => {
		localStorage.setItem(STORAGE_KEY, 'chartreuse');
		installSystemPreference(true);
		const { theme } = await loadTheme();
		expect(theme.current).toBe('dark');
	});
});

describe('toggle()', () => {
	it('flips the theme, the <html> class, and the stored preference together', async () => {
		installSystemPreference(false);
		const { theme } = await loadTheme();

		theme.toggle();
		expect(theme.current).toBe('dark');
		expect(isDarkClassApplied()).toBe(true);
		expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');

		theme.toggle();
		expect(theme.current).toBe('light');
		expect(isDarkClassApplied()).toBe(false);
		expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
	});
});

describe('set()', () => {
	it('applies and persists an explicit choice', async () => {
		installSystemPreference(false);
		const { theme } = await loadTheme();
		theme.set('dark');
		expect(theme.current).toBe('dark');
		expect(isDarkClassApplied()).toBe(true);
		expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
	});

	it('setting the theme it already has is idempotent, not a toggle', async () => {
		installSystemPreference(false);
		const { theme } = await loadTheme();
		theme.set('light');
		theme.set('light');
		expect(theme.current).toBe('light');
		expect(isDarkClassApplied()).toBe(false);
	});
});

describe('reacting to the OS switching theme mid-session', () => {
	it('follows the system when the user has made no explicit choice', async () => {
		const system = installSystemPreference(false);
		const { theme } = await loadTheme();
		expect(theme.current).toBe('light');

		system.emitSystemChange(true);
		expect(theme.current).toBe('dark');
		expect(isDarkClassApplied()).toBe(true);
	});

	it('does NOT override an explicit choice the user already made', async () => {
		const system = installSystemPreference(false);
		const { theme } = await loadTheme();
		theme.set('light'); // explicit: "light, whatever the OS does"

		system.emitSystemChange(true);
		expect(theme.current).toBe('light');
		expect(isDarkClassApplied()).toBe(false);
	});

	it('stops following the system from the first toggle onwards', async () => {
		const system = installSystemPreference(false);
		const { theme } = await loadTheme();

		system.emitSystemChange(true);
		expect(theme.current).toBe('dark'); // still following

		theme.toggle(); // -> light, and now stored
		system.emitSystemChange(false);
		system.emitSystemChange(true);
		expect(theme.current).toBe('light');
	});
});

describe('persistence round-trip', () => {
	it('a reload restores the chosen theme even against an opposite system preference', async () => {
		installSystemPreference(false);
		const first = await loadTheme();
		first.theme.toggle();
		expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');

		document.documentElement.classList.remove('dark');
		installSystemPreference(false);
		const reloaded = await loadTheme();
		expect(reloaded.theme.current).toBe('dark');
		expect(isDarkClassApplied()).toBe(true);
	});
});
