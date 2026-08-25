import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, it, expect } from 'vitest';
import de from './locales/de.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };

/**
 * Guards the translation files against the failure mode the runtime is
 * deliberately quiet about: i18n's resolve() falls back to returning the key
 * itself for anything it can't find, so a typo'd or German-only key renders
 * as "kanban.sortByy" in the UI rather than throwing anywhere a test could
 * catch it. These checks turn that silent fallback into a build failure.
 */

type Tree = Record<string, unknown>;

/** Flattens a nested translation object into dot-path -> value pairs. */
function flatten(tree: Tree, prefix = ''): Map<string, string> {
	const flat = new Map<string, string>();
	for (const [key, value] of Object.entries(tree)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			for (const [nested, nestedValue] of flatten(value as Tree, path)) {
				flat.set(nested, nestedValue);
			}
		} else {
			flat.set(path, value as string);
		}
	}
	return flat;
}

const deFlat = flatten(de as Tree);
const enFlat = flatten(en as Tree);

const SRC_DIR = join(process.cwd(), 'src');

function collectSourceFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			files.push(...collectSourceFiles(full));
		} else if (/\.(svelte|ts)$/.test(entry) && !/\.(test|spec)\.ts$/.test(entry)) {
			files.push(full);
		}
	}
	return files;
}

const sourceFiles = collectSourceFiles(SRC_DIR).map((file) => ({
	path: relative(process.cwd(), file).split(sep).join('/'),
	text: readFileSync(file, 'utf-8')
}));

const TOP_LEVEL_NAMESPACES = new Set(Object.keys(de as Tree));

/**
 * Every string literal in the source that is shaped like a translation key
 * *and* starts with a real namespace. Deliberately not just `t('...')` call
 * sites: several keys reach t() indirectly, as a `labelKey` on the column /
 * nav-item constants, as the values of ApplicationModal's PDF_ERROR_KEYS
 * map, or assigned to /backup's `importError` before being rendered - all of
 * which a call-site-only scan would miss entirely.
 */
function collectReferencedKeys(): Map<string, string[]> {
	const referenced = new Map<string, string[]>();
	const literal = /['"`]([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+)['"`]/g;
	for (const file of sourceFiles) {
		for (const match of file.text.matchAll(literal)) {
			const key = match[1];
			if (!TOP_LEVEL_NAMESPACES.has(key.split('.')[0])) continue;
			const sites = referenced.get(key) ?? [];
			if (!sites.includes(file.path)) sites.push(file.path);
			referenced.set(key, sites);
		}
	}
	return referenced;
}

const referencedKeys = collectReferencedKeys();

/**
 * Keys only ever built at runtime via template literals, so no literal for
 * them exists anywhere to scan for. Enumerated here from the union types
 * they interpolate (Application['status'] and Application['priority']) so
 * adding a sixth status without translating it fails here too.
 */
const DYNAMIC_KEY_FAMILIES = [
	...(['draft', 'sent', 'interview', 'accepted', 'rejected'] as const).map(
		(status) => `kanban.columns.${status}`
	),
	...(['low', 'medium', 'high'] as const).map((priority) => `application.priorities.${priority}`)
];

describe('translation file parity', () => {
	it('finds source files to scan (guards the scan itself against silently matching nothing)', () => {
		expect(sourceFiles.length).toBeGreaterThan(10);
		expect(referencedKeys.size).toBeGreaterThan(50);
	});

	it('defines exactly the same key paths in de and en', () => {
		const missingInEn = [...deFlat.keys()].filter((key) => !enFlat.has(key));
		const missingInDe = [...enFlat.keys()].filter((key) => !deFlat.has(key));
		expect({ missingInEn, missingInDe }).toEqual({ missingInEn: [], missingInDe: [] });
	});

	it('resolves every key to a non-empty string in both locales', () => {
		const blank = [...deFlat, ...enFlat]
			.filter(([, value]) => typeof value !== 'string' || value.trim() === '')
			.map(([key]) => key);
		expect(blank).toEqual([]);
	});

	it('has no key whose two translations are byte-identical placeholder text', () => {
		// Proper nouns and shared UI words legitimately match across DE/EN;
		// this only catches a *long* untranslated sentence copy-pasted over.
		const untranslated = [...deFlat]
			.filter(([key, value]) => value.length > 40 && enFlat.get(key) === value)
			.map(([key]) => key);
		expect(untranslated).toEqual([]);
	});
});

describe('translation keys referenced by the app', () => {
	it('every translation-shaped key literal in src exists in both locales', () => {
		const unresolved = [...referencedKeys]
			.filter(([key]) => !deFlat.has(key) || !enFlat.has(key))
			.map(([key, files]) => `${key} (referenced in ${files.join(', ')})`);
		expect(unresolved).toEqual([]);
	});

	it('every runtime-interpolated status/priority key exists in both locales', () => {
		const unresolved = DYNAMIC_KEY_FAMILIES.filter((key) => !deFlat.has(key) || !enFlat.has(key));
		expect(unresolved).toEqual([]);
	});

	it('placeholder tokens like {company} appear in both translations of a key or neither', () => {
		const placeholders = (value: string) => (value.match(/\{[a-zA-Z]+\}/g) ?? []).sort();
		const mismatched = [...deFlat]
			.filter(([key, value]) => {
				const other = enFlat.get(key);
				return other !== undefined && placeholders(value).join() !== placeholders(other).join();
			})
			.map(([key]) => key);
		expect(mismatched).toEqual([]);
	});
});
