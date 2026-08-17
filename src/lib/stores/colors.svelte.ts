import { browser } from '$app/environment';

export interface ColorPreset {
	id: string;
	hex: string;
	labelKey?: string;
}

export const AUTO_COLORS: ColorPreset[] = [
	{ id: '#6366f1', hex: '#6366f1', labelKey: 'Indigo (High Value)' },
	{ id: '#10b981', hex: '#10b981', labelKey: 'Emerald (Great Fit)' },
	{ id: '#f59e0b', hex: '#f59e0b', labelKey: 'Amber (In Review)' },
	{ id: '#ec4899', hex: '#ec4899', labelKey: 'Rose (Special)' }
];

function createColorStore() {
	let customColors = $state<string[]>([]);

	function init() {
		if (!browser) return;
		try {
			const saved = localStorage.getItem('bewerby_custom_colors');
			if (saved) {
				const parsed = JSON.parse(saved);
				if (Array.isArray(parsed)) {
					customColors = parsed.filter((c) => typeof c === 'string').slice(0, 4);
				}
			}
		} catch (e) {
			console.error('Failed to load custom colors', e);
		}
	}

	function addCustomColor(hex: string) {
		if (!browser || !hex) return;
		const normalized = hex.toLowerCase();
		if (
			AUTO_COLORS.some((c) => c.hex.toLowerCase() === normalized) ||
			customColors.includes(normalized)
		) {
			return;
		}
		if (customColors.length >= 4) {
			// Replace oldest custom color if we already have 4
			customColors = [...customColors.slice(1), normalized];
		} else {
			customColors = [...customColors, normalized];
		}
		localStorage.setItem('bewerby_custom_colors', JSON.stringify(customColors));
	}

	function removeCustomColor(hex: string) {
		if (!browser) return;
		const normalized = hex.toLowerCase();
		customColors = customColors.filter((c) => c !== normalized);
		localStorage.setItem('bewerby_custom_colors', JSON.stringify(customColors));
	}

	return {
		get auto() {
			return AUTO_COLORS;
		},
		get custom() {
			return customColors;
		},
		init,
		addCustomColor,
		removeCustomColor
	};
}

export const colorStore = createColorStore();
