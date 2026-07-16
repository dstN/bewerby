import { browser } from '$app/environment';
import type { Locale, TranslationKeys } from './types.js';

import de from './locales/de.json';
import en from './locales/en.json';

const translations: Record<Locale, TranslationKeys> = {
	de: de as TranslationKeys,
	en: en as TranslationKeys
};

const STORAGE_KEY = 'bewerby-locale';
const SUPPORTED_LOCALES: Locale[] = ['de', 'en'];

function detectLocale(): Locale {
	if (!browser) return 'de';
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored && SUPPORTED_LOCALES.includes(stored as Locale)) {
		return stored as Locale;
	}
	// Check browser language
	const browserLang = navigator.language.slice(0, 2).toLowerCase();
	if (SUPPORTED_LOCALES.includes(browserLang as Locale)) {
		return browserLang as Locale;
	}
	return 'de';
}

/**
 * Resolve a dot-path key against a translation object.
 * e.g. resolve('kanban.columns.draft', translations.de) => 'In Arbeit'
 */
function resolve(path: string, obj: Record<string, unknown>): string {
	const keys = path.split('.');
	let current: unknown = obj;
	for (const key of keys) {
		if (current && typeof current === 'object' && key in current) {
			current = (current as Record<string, unknown>)[key];
		} else {
			return path; // Fallback: return the key itself
		}
	}
	return typeof current === 'string' ? current : path;
}

class I18nState {
	locale: Locale = $state('de');

	init(): void {
		if (browser) {
			this.locale = detectLocale();
			document.documentElement.lang = this.locale;
		}
	}

	constructor() {
		// Constructor starts with fallback 'de' to match SSR
	}

	/**
	 * Translate a dot-path key.
	 * Usage: i18n.t('kanban.columns.draft') => 'In Arbeit'
	 */
	t(key: string): string {
		return resolve(key, translations[this.locale] as unknown as Record<string, unknown>);
	}

	setLocale(locale: Locale): void {
		this.locale = locale;
		if (browser) {
			localStorage.setItem(STORAGE_KEY, locale);
			document.documentElement.lang = locale;
		}
	}

	get supportedLocales(): Locale[] {
		return SUPPORTED_LOCALES;
	}

	get localeLabel(): string {
		const labels: Record<Locale, string> = {
			de: 'Deutsch',
			en: 'English'
		};
		return labels[this.locale];
	}
}

export const i18n = new I18nState();

/** Shorthand for i18n.t() */
export function t(key: string): string {
	return i18n.t(key);
}
