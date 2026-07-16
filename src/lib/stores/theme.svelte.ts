import { browser } from '$app/environment';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'bewerby-theme';

function getSystemPreference(): Theme {
	if (!browser) return 'light';
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): Theme | null {
	if (!browser) return null;
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'light' || stored === 'dark') return stored;
	return null;
}

function applyTheme(theme: Theme): void {
	if (!browser) return;
	const root = document.documentElement;
	if (theme === 'dark') {
		root.classList.add('dark');
	} else {
		root.classList.remove('dark');
	}
}

class ThemeState {
	current: Theme = $state('light');

	constructor() {
		if (browser) {
			this.current = getStoredTheme() ?? getSystemPreference();
			applyTheme(this.current);

			// Listen for system theme changes (only if user hasn't manually set)
			const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
			mediaQuery.addEventListener('change', (e) => {
				if (!getStoredTheme()) {
					this.current = e.matches ? 'dark' : 'light';
					applyTheme(this.current);
				}
			});
		}
	}

	toggle(): void {
		this.current = this.current === 'light' ? 'dark' : 'light';
		applyTheme(this.current);
		if (browser) {
			localStorage.setItem(STORAGE_KEY, this.current);
		}
	}

	set(theme: Theme): void {
		this.current = theme;
		applyTheme(this.current);
		if (browser) {
			localStorage.setItem(STORAGE_KEY, this.current);
		}
	}

	get isDark(): boolean {
		return this.current === 'dark';
	}
}

export const theme = new ThemeState();
