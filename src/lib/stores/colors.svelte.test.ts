import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

const STORAGE_KEY = 'bewerby_custom_colors';

type ColorsModule = typeof import('./colors.svelte.js');

/** Fresh module per test - the store keeps its custom colors in module-level
 *  `$state`, and init() only ever reads localStorage once. */
async function loadColorStore(): Promise<ColorsModule> {
	vi.resetModules();
	return import('./colors.svelte.js');
}

function stored(): string[] {
	return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('colorStore.init()', () => {
	it('starts empty when nothing was ever saved', async () => {
		const { colorStore } = await loadColorStore();
		colorStore.init();
		expect(colorStore.custom).toEqual([]);
	});

	it('restores previously saved custom colors', async () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(['#123456', '#abcdef']));
		const { colorStore } = await loadColorStore();
		colorStore.init();
		expect(colorStore.custom).toEqual(['#123456', '#abcdef']);
	});

	it('survives corrupted JSON without throwing, leaving the store empty', async () => {
		localStorage.setItem(STORAGE_KEY, '{not valid json');
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { colorStore } = await loadColorStore();
		expect(() => colorStore.init()).not.toThrow();
		expect(colorStore.custom).toEqual([]);
		expect(errorSpy).toHaveBeenCalled();
	});

	it('ignores a stored value that is valid JSON but not an array', async () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ favourite: '#123456' }));
		const { colorStore } = await loadColorStore();
		colorStore.init();
		expect(colorStore.custom).toEqual([]);
	});

	it('drops non-string entries rather than letting them reach the colour <select>', async () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(['#123456', 42, null, '#abcdef']));
		const { colorStore } = await loadColorStore();
		colorStore.init();
		expect(colorStore.custom).toEqual(['#123456', '#abcdef']);
	});

	it('caps a hand-edited over-long list at the 4-colour limit', async () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify(['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'])
		);
		const { colorStore } = await loadColorStore();
		colorStore.init();
		expect(colorStore.custom).toEqual(['#111111', '#222222', '#333333', '#444444']);
	});
});

describe('colorStore.addCustomColor()', () => {
	it('adds and persists a colour', async () => {
		const { colorStore } = await loadColorStore();
		colorStore.addCustomColor('#123456');
		expect(colorStore.custom).toEqual(['#123456']);
		expect(stored()).toEqual(['#123456']);
	});

	it('normalises to lower case so #ABCDEF and #abcdef are the same colour', async () => {
		const { colorStore } = await loadColorStore();
		colorStore.addCustomColor('#ABCDEF');
		colorStore.addCustomColor('#abcdef');
		expect(colorStore.custom).toEqual(['#abcdef']);
	});

	it('refuses a duplicate of an existing custom colour', async () => {
		const { colorStore } = await loadColorStore();
		colorStore.addCustomColor('#123456');
		colorStore.addCustomColor('#123456');
		expect(colorStore.custom).toEqual(['#123456']);
	});

	it('refuses a colour that is already one of the built-in presets', async () => {
		const { colorStore, AUTO_COLORS } = await loadColorStore();
		colorStore.addCustomColor(AUTO_COLORS[0].hex.toUpperCase());
		expect(colorStore.custom).toEqual([]);
	});

	it('ignores an empty value', async () => {
		const { colorStore } = await loadColorStore();
		colorStore.addCustomColor('');
		expect(colorStore.custom).toEqual([]);
	});

	it('evicts the oldest colour once a fifth is added, keeping insertion order', async () => {
		const { colorStore } = await loadColorStore();
		for (const hex of ['#111111', '#222222', '#333333', '#444444']) {
			colorStore.addCustomColor(hex);
		}
		colorStore.addCustomColor('#555555');
		expect(colorStore.custom).toEqual(['#222222', '#333333', '#444444', '#555555']);
		expect(stored()).toEqual(['#222222', '#333333', '#444444', '#555555']);
	});
});

describe('colorStore.removeCustomColor()', () => {
	it('removes a colour and persists the shortened list', async () => {
		const { colorStore } = await loadColorStore();
		colorStore.addCustomColor('#111111');
		colorStore.addCustomColor('#222222');
		colorStore.removeCustomColor('#111111');
		expect(colorStore.custom).toEqual(['#222222']);
		expect(stored()).toEqual(['#222222']);
	});

	it('matches case-insensitively, the same way adding does', async () => {
		const { colorStore } = await loadColorStore();
		colorStore.addCustomColor('#abcdef');
		colorStore.removeCustomColor('#ABCDEF');
		expect(colorStore.custom).toEqual([]);
	});

	it('is a no-op for a colour that was never added', async () => {
		const { colorStore } = await loadColorStore();
		colorStore.addCustomColor('#111111');
		colorStore.removeCustomColor('#999999');
		expect(colorStore.custom).toEqual(['#111111']);
	});
});

describe('built-in presets', () => {
	it('exposes four presets, each with a distinct lower-case hex', async () => {
		const { AUTO_COLORS } = await loadColorStore();
		expect(AUTO_COLORS).toHaveLength(4);
		const hexes = AUTO_COLORS.map((preset) => preset.hex);
		expect(new Set(hexes).size).toBe(hexes.length);
		for (const preset of AUTO_COLORS) {
			expect(preset.hex).toMatch(/^#[0-9a-f]{6}$/);
			expect(preset.id).toBe(preset.hex);
		}
	});
});

describe('persistence round-trip', () => {
	it('a reload restores exactly what the previous session saved', async () => {
		const first = await loadColorStore();
		first.colorStore.addCustomColor('#111111');
		first.colorStore.addCustomColor('#222222');

		const reloaded = await loadColorStore();
		reloaded.colorStore.init();
		expect(reloaded.colorStore.custom).toEqual(['#111111', '#222222']);
	});
});
