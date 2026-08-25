import { beforeEach } from 'vitest';

/**
 * Two browser globals the app relies on are missing or inert under Vitest,
 * in both the `node` and `jsdom` environments:
 *
 * - `localStorage`: Node 26 ships its own `globalThis.localStorage`, which
 *   throws/reads as undefined unless the process was started with
 *   `--localstorage-file`. Because that key already exists on globalThis,
 *   Vitest's jsdom environment skips copying jsdom's own working
 *   implementation over it.
 * - `matchMedia`: jsdom 30 does not implement it at all.
 *
 * The theme store, the locale detection, and the reminder engine all read
 * both, so this installs deterministic, per-test-reset stand-ins in every
 * environment - which also lets a test that only needs storage stay in the
 * fast plain-`node` environment instead of pulling in jsdom.
 *
 * A test that needs a specific media-query answer (e.g. "system prefers
 * dark") overrides `globalThis.matchMedia` itself, before importing the
 * module under test - the stores read it at construction time.
 */

class MemoryStorage implements Storage {
	#entries = new Map<string, string>();

	get length(): number {
		return this.#entries.size;
	}

	clear(): void {
		this.#entries.clear();
	}

	getItem(key: string): string | null {
		return this.#entries.get(key) ?? null;
	}

	key(index: number): string | null {
		return [...this.#entries.keys()][index] ?? null;
	}

	removeItem(key: string): void {
		this.#entries.delete(key);
	}

	setItem(key: string, value: string): void {
		this.#entries.set(key, String(value));
	}
}

/** A MediaQueryList that never matches and never changes - the default. */
export function stubMediaQueryList(matches: boolean, media = ''): MediaQueryList {
	return {
		matches,
		media,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false
	} as MediaQueryList;
}

function installBrowserGlobals(): void {
	// configurable so a test can redefine matchMedia for its own scenario.
	Object.defineProperty(globalThis, 'localStorage', {
		value: new MemoryStorage(),
		configurable: true,
		writable: true
	});
	Object.defineProperty(globalThis, 'matchMedia', {
		value: (media: string) => stubMediaQueryList(false, media),
		configurable: true,
		writable: true
	});
	// Under jsdom, `window` is globalThis, so the two definitions above already
	// cover `window.localStorage` / `window.matchMedia`.
}

installBrowserGlobals();

beforeEach(() => {
	installBrowserGlobals();
});
