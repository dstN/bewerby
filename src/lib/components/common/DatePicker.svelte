<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { t, i18n } from '$lib/i18n/index.svelte.js';

	let {
		value = $bindable(''),
		id = '',
		disabled = false
	}: {
		value: string;
		id?: string;
		disabled?: boolean;
	} = $props();

	let isOpen = $state(false);
	let containerRef = $state<HTMLElement | null>(null);

	// Parse initial or current value to initialize view state
	function parseInitialParts(dateStr: string) {
		if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
			const [y, m, d] = dateStr.split('-').map(Number);
			return { year: y, month: m - 1, day: d };
		}
		const now = new Date();
		return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
	}

	let initial = parseInitialParts(value);
	let viewYear = $state(initial.year);
	let viewMonth = $state(initial.month);
	let popupStyle = $state('');

	function updatePosition() {
		if (!containerRef || !isOpen) return;
		const rect = containerRef.getBoundingClientRect();
		const popupHeight = 340;
		const spaceBelow = window.innerHeight - rect.bottom;

		if (spaceBelow < popupHeight && rect.top > popupHeight) {
			// Flip above
			popupStyle = `position: fixed; bottom: ${window.innerHeight - rect.top + 8}px; left: ${rect.left}px; width: 19.5rem; z-index: 99999;`;
		} else {
			// Open below
			popupStyle = `position: fixed; top: ${rect.bottom + 8}px; left: ${rect.left}px; width: 19.5rem; z-index: 99999;`;
		}
	}

	// Sync view month/year when value changes externally while closed
	$effect(() => {
		if (!isOpen && value) {
			const parsed = parseInitialParts(value);
			viewYear = parsed.year;
			viewMonth = parsed.month;
		}
	});

	// Close popup on outside click or Escape, and track scroll/resize for fixed positioning
	$effect(() => {
		if (!isOpen) return;

		updatePosition();

		function handleOutsideClick(event: MouseEvent) {
			if (containerRef && !containerRef.contains(event.target as Node)) {
				// Check if click was inside fixed popover since it is fixed
				const popupEl = document.querySelector('.datepicker-popup');
				if (popupEl && popupEl.contains(event.target as Node)) {
					return;
				}
				isOpen = false;
			}
		}

		function handleKeydown(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				isOpen = false;
			}
		}

		function handleScrollResize() {
			updatePosition();
		}

		window.addEventListener('click', handleOutsideClick, true);
		window.addEventListener('keydown', handleKeydown, true);
		window.addEventListener('scroll', handleScrollResize, true);
		window.addEventListener('resize', handleScrollResize, true);

		return () => {
			window.removeEventListener('click', handleOutsideClick, true);
			window.removeEventListener('keydown', handleKeydown, true);
			window.removeEventListener('scroll', handleScrollResize, true);
			window.removeEventListener('resize', handleScrollResize, true);
		};
	});

	// Derived formatted display for trigger button
	let formattedDisplay = $derived.by(() => {
		if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
			return t('datepicker.selectDate');
		}
		const [y, m, d] = value.split('-').map(Number);
		const dateObj = new Date(y, m - 1, d, 12, 0, 0);
		return dateObj.toLocaleDateString(i18n.locale, {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	});

	// Derived localized month name and year title for calendar header
	let headerMonthYear = $derived.by(() => {
		const dateObj = new Date(viewYear, viewMonth, 1, 12, 0, 0);
		return dateObj.toLocaleDateString(i18n.locale, {
			month: 'long',
			year: 'numeric'
		});
	});

	// Derived localized weekday headers (starting on Monday: Mo, Di, Mi, Do, Fr, Sa, So)
	let weekdayHeaders = $derived.by(() => {
		const headers: string[] = [];
		// Jan 5, 2026 is a Monday
		for (let i = 0; i < 7; i++) {
			const d = new Date(2026, 0, 5 + i, 12, 0, 0);
			headers.push(d.toLocaleDateString(i18n.locale, { weekday: 'short' }));
		}
		return headers;
	});

	interface DayCell {
		day: number;
		month: number;
		year: number;
		isCurrentMonth: boolean;
		isToday: boolean;
		isSelected: boolean;
		dateStr: string;
	}

	// Calculate 42-cell grid (6 weeks) for calendar view
	let gridCells = $derived.by(() => {
		const cells: DayCell[] = [];
		const firstDayOfMonth = new Date(viewYear, viewMonth, 1, 12, 0, 0);
		const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0, 12, 0, 0);

		// Get weekday of first day (0=Sun, 1=Mon... -> convert to Mon=0...Sun=6)
		let startOffset = (firstDayOfMonth.getDay() + 6) % 7;

		const now = new Date();
		const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

		// Previous month tail days
		const prevMonthLastDay = new Date(viewYear, viewMonth, 0, 12, 0, 0).getDate();
		for (let i = startOffset - 1; i >= 0; i--) {
			const d = prevMonthLastDay - i;
			const m = viewMonth === 0 ? 11 : viewMonth - 1;
			const y = viewMonth === 0 ? viewYear - 1 : viewYear;
			const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			cells.push({
				day: d,
				month: m,
				year: y,
				isCurrentMonth: false,
				isToday: dateStr === todayStr,
				isSelected: dateStr === value,
				dateStr
			});
		}

		// Current month days
		for (let d = 1; d <= lastDayOfMonth.getDate(); d++) {
			const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			cells.push({
				day: d,
				month: viewMonth,
				year: viewYear,
				isCurrentMonth: true,
				isToday: dateStr === todayStr,
				isSelected: dateStr === value,
				dateStr
			});
		}

		// Next month head days to fill 42 total cells
		const remaining = 42 - cells.length;
		for (let d = 1; d <= remaining; d++) {
			const m = viewMonth === 11 ? 0 : viewMonth + 1;
			const y = viewMonth === 11 ? viewYear + 1 : viewYear;
			const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			cells.push({
				day: d,
				month: m,
				year: y,
				isCurrentMonth: false,
				isToday: dateStr === todayStr,
				isSelected: dateStr === value,
				dateStr
			});
		}

		return cells;
	});

	function selectDate(dateStr: string) {
		value = dateStr;
		isOpen = false;
	}

	function selectQuickDate(daysAgo: number) {
		const target = new Date(Date.now() - daysAgo * 86400000);
		const y = target.getFullYear();
		const m = target.getMonth();
		const d = target.getDate();
		const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
		viewYear = y;
		viewMonth = m;
		selectDate(dateStr);
	}

	function prevMonth() {
		if (viewMonth === 0) {
			viewMonth = 11;
			viewYear -= 1;
		} else {
			viewMonth -= 1;
		}
	}

	function nextMonth() {
		if (viewMonth === 11) {
			viewMonth = 0;
			viewYear += 1;
		} else {
			viewMonth += 1;
		}
	}

	function toggleOpen() {
		if (!disabled) {
			isOpen = !isOpen;
		}
	}
</script>

<div class="datepicker-wrapper" bind:this={containerRef}>
	<!-- Hidden native input to preserve exact form accessibility and bindability -->
	<input {id} type="date" bind:value class="sr-only" {disabled} />

	<button
		type="button"
		class="datepicker-trigger"
		class:active={isOpen}
		{disabled}
		onclick={toggleOpen}
		aria-haspopup="dialog"
		aria-expanded={isOpen}
		aria-label={t('datepicker.selectDate')}
	>
		<div class="trigger-content">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" class="calendar-icon" aria-hidden="true">
				<path d="M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				<path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			<span class="trigger-label">{formattedDisplay}</span>
		</div>
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" class="chevron-icon" class:rotated={isOpen} aria-hidden="true">
			<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
	</button>

	{#if isOpen}
		<div
			class="datepicker-popup"
			style={popupStyle}
			role="dialog"
			aria-modal="true"
			aria-label={t('datepicker.selectDate')}
			transition:scale={{ duration: 180, start: 0.95 }}
		>
			<!-- Quick shortcuts pill bar -->
			<div class="quick-shortcuts">
				<button type="button" class="btn-quick" onclick={() => selectQuickDate(0)}>{t('datepicker.today')}</button>
				<button type="button" class="btn-quick" onclick={() => selectQuickDate(1)}>{t('datepicker.yesterday')}</button>
				<button type="button" class="btn-quick" onclick={() => selectQuickDate(3)}>{t('datepicker.daysAgo3')}</button>
				<button type="button" class="btn-quick" onclick={() => selectQuickDate(7)}>{t('datepicker.weekAgo1')}</button>
				<button type="button" class="btn-quick" onclick={() => selectQuickDate(14)}>{t('datepicker.weeksAgo2')}</button>
			</div>

			<!-- Month navigation bar -->
			<header class="calendar-header">
				<button type="button" class="btn-nav" onclick={prevMonth} aria-label="Vorheriger Monat">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
						<path d="M15 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>

				<span class="header-title">{headerMonthYear}</span>

				<button type="button" class="btn-nav" onclick={nextMonth} aria-label="Nächster Monat">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
						<path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
			</header>

			<!-- Weekday headers -->
			<div class="weekday-grid">
				{#each weekdayHeaders as wday}
					<span class="weekday-cell">{wday}</span>
				{/each}
			</div>

			<!-- Day grid -->
			<div class="days-grid">
				{#each gridCells as cell (cell.dateStr)}
					<button
						type="button"
						class="day-cell"
						class:current-month={cell.isCurrentMonth}
						class:today={cell.isToday}
						class:selected={cell.isSelected}
						onclick={() => selectDate(cell.dateStr)}
					>
						{cell.day}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.datepicker-wrapper {
		position: relative;
		width: 100%;
	}

	.datepicker-trigger {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		height: 36px;
		padding: 0 12px;
		box-sizing: border-box;
		background-color: var(--surface-0);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-size: 14px;
		font-family: inherit;
		box-shadow: none;
		cursor: pointer;
		outline: none;
		transition: border-color var(--duration-fast) ease;
	}

	.datepicker-trigger:hover:not(:disabled) {
		border-color: var(--border-strong);
		background-color: var(--surface-0);
	}

	.datepicker-trigger:focus-visible,
	.datepicker-trigger.active {
		outline: none;
		border-color: var(--color-accent-500);
		background-color: var(--surface-0);
		box-shadow: none;
	}

	.datepicker-trigger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.trigger-content {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.calendar-icon {
		color: var(--color-accent-500);
		flex-shrink: 0;
	}

	.chevron-icon {
		color: var(--text-tertiary);
		transition: transform var(--duration-fast) ease;
	}

	.chevron-icon.rotated {
		transform: rotate(180deg);
	}

	/* Popover Card */
	.datepicker-popup {
		padding: 1rem;
		background-color: var(--surface-0);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
	}

	/* Quick Shortcuts Pill Bar */
	.quick-shortcuts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		padding-bottom: 0.75rem;
		margin-bottom: 0.75rem;
		border-bottom: 1px solid var(--border-subtle);
	}

	.btn-quick {
		padding: 0.25rem 0.625rem;
		background-color: var(--surface-1);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		color: var(--text-secondary);
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--duration-fast) ease;
	}

	.btn-quick:hover {
		background-color: var(--color-accent-500);
		color: #ffffff;
		border-color: var(--color-accent-500);
	}

	/* Calendar Header */
	.calendar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}

	.header-title {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--text-primary);
		text-transform: capitalize;
	}

	.btn-nav {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.875rem;
		height: 1.875rem;
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		background: transparent;
		border: 1px solid transparent;
		cursor: pointer;
		transition: all var(--duration-fast) ease;
	}

	.btn-nav:hover {
		background-color: var(--surface-1);
		color: var(--text-primary);
		border-color: var(--border-subtle);
	}

	/* Weekday Header Grid */
	.weekday-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.25rem;
		margin-bottom: 0.375rem;
	}

	.weekday-cell {
		text-align: center;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-tertiary);
	}

	/* Days Grid */
	.days-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.25rem;
	}

	.day-cell {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 2.125rem;
		border-radius: var(--radius-sm);
		font-size: 0.8125rem;
		font-weight: 400;
		color: var(--text-tertiary);
		background: transparent;
		border: 1px solid transparent;
		cursor: pointer;
		transition: all var(--duration-fast) ease;
	}

	.day-cell.current-month {
		color: var(--text-primary);
	}

	.day-cell:hover:not(.selected) {
		background-color: var(--surface-1);
		border-color: var(--border-subtle);
	}

	.day-cell.today:not(.selected) {
		font-weight: 600;
		color: var(--color-accent-500);
		border-color: var(--color-accent-500);
	}

	.day-cell.selected {
		background-color: var(--color-accent-500);
		color: #ffffff;
		font-weight: 600;
		box-shadow: 0 2px 4px rgb(59 130 246 / 0.3);
	}
</style>
