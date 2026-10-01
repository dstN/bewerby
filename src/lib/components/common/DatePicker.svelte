<script lang="ts">
	import { tick } from 'svelte';
	import { t, i18n } from '#lib/i18n/index.svelte.js';
	import { announcer } from '#lib/stores/announcer.svelte.js';

	let {
		value = $bindable(''),
		id = '',
		disabled = false
	}: {
		value: string;
		id?: string;
		disabled?: boolean;
	} = $props();

	const uid = $props.id();
	const popoverId = `datepicker-popup-${uid}`;
	const anchorName = `--datepicker-anchor-${uid}`;

	let isOpen = $state(false);
	let popupEl: HTMLElement | undefined = $state();

	function toDateStr(y: number, m: number, d: number): string {
		return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
	}

	// Delegates overflow (day 32, day -2, ...) to the Date constructor instead
	// of hand-rolled month/year carrying, anchored at noon so DST transitions
	// never shift the result onto the wrong calendar day.
	function addDays(y: number, m: number, d: number, delta: number) {
		const dt = new Date(y, m, d + delta, 12, 0, 0);
		return { year: dt.getFullYear(), month: dt.getMonth(), day: dt.getDate() };
	}

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
	// The single roving tab-stop within the day grid (WAI-ARIA grid pattern).
	let focusedDateStr = $state(value || toDateStr(initial.year, initial.month, initial.day));

	// Sync view month/year when value changes externally while closed
	$effect(() => {
		if (!isOpen && value) {
			const parsed = parseInitialParts(value);
			viewYear = parsed.year;
			viewMonth = parsed.month;
		}
	});

	// Locale-aware first day of the week (ISO numbering: 1=Monday...7=Sunday).
	// Current engines expose this via Intl.Locale#getWeekInfo(); a few expose
	// it as a `weekInfo` getter instead. Monday is the fallback if neither
	// exists, matching the previous hardcoded behavior.
	function getWeekStartsOn(locale: string): number {
		try {
			const l = new Intl.Locale(locale) as Intl.Locale & {
				weekInfo?: { firstDay: number };
				getWeekInfo?: () => { firstDay: number };
			};
			const info = l.weekInfo ?? l.getWeekInfo?.();
			if (info?.firstDay) return info.firstDay;
		} catch {
			// Intl.Locale unsupported here - fall through to the default below.
		}
		return 1;
	}

	let weekStartsOn = $derived(getWeekStartsOn(i18n.locale));

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

	// Derived localized weekday headers, starting on the locale's first day of the week
	let weekdayHeaders = $derived.by(() => {
		const headers: string[] = [];
		// Jan 5, 2026 is a Monday (ISO weekday 1); shift to the locale's start day.
		const base = new Date(2026, 0, 5 + (weekStartsOn - 1), 12, 0, 0);
		for (let i = 0; i < 7; i++) {
			const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, 12, 0, 0);
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

	// Calculate 42-cell grid (6 weeks) for calendar view, aligned to the locale's week start
	let gridCells = $derived.by(() => {
		const cells: DayCell[] = [];
		const firstDayOfMonth = new Date(viewYear, viewMonth, 1, 12, 0, 0);
		const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0, 12, 0, 0);

		const isoDay = firstDayOfMonth.getDay() === 0 ? 7 : firstDayOfMonth.getDay();
		const startOffset = (isoDay - weekStartsOn + 7) % 7;

		const now = new Date();
		const todayStr = toDateStr(now.getFullYear(), now.getMonth(), now.getDate());

		// Previous month tail days
		const prevMonthLastDay = new Date(viewYear, viewMonth, 0, 12, 0, 0).getDate();
		for (let i = startOffset - 1; i >= 0; i--) {
			const d = prevMonthLastDay - i;
			const m = viewMonth === 0 ? 11 : viewMonth - 1;
			const y = viewMonth === 0 ? viewYear - 1 : viewYear;
			const dateStr = toDateStr(y, m, d);
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
			const dateStr = toDateStr(viewYear, viewMonth, d);
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
			const dateStr = toDateStr(y, m, d);
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

	// Grouped into weeks for role="row" grid semantics.
	let weeks = $derived.by(() => {
		const result: DayCell[][] = [];
		for (let i = 0; i < gridCells.length; i += 7) {
			result.push(gridCells.slice(i, i + 7));
		}
		return result;
	});

	// Full accessible name per cell (weekday, day, month, year) so a screen
	// reader announces real date context instead of just a bare number.
	function cellLabel(cell: DayCell): string {
		const d = new Date(cell.year, cell.month, cell.day, 12, 0, 0);
		const label = d.toLocaleDateString(i18n.locale, {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
		return cell.isToday ? `${label} (${t('datepicker.today')})` : label;
	}

	function pickFocusCandidate(): string {
		const inView = (dateStr: string) =>
			gridCells.some((c) => c.dateStr === dateStr && c.isCurrentMonth);
		if (value && inView(value)) return value;
		const now = new Date();
		const todayStr = toDateStr(now.getFullYear(), now.getMonth(), now.getDate());
		if (inView(todayStr)) return todayStr;
		return (gridCells.find((c) => c.isCurrentMonth) ?? gridCells[0]).dateStr;
	}

	async function focusCell(dateStr: string) {
		await tick();
		popupEl?.querySelector<HTMLButtonElement>(`[data-date="${dateStr}"]`)?.focus();
	}

	function selectDate(dateStr: string) {
		value = dateStr;
		focusedDateStr = dateStr;
		popupEl?.hidePopover();
	}

	function selectQuickDate(daysAgo: number) {
		const now = new Date();
		const target = addDays(now.getFullYear(), now.getMonth(), now.getDate(), -daysAgo);
		viewYear = target.year;
		viewMonth = target.month;
		selectDate(toDateStr(target.year, target.month, target.day));
	}

	function prevMonth() {
		if (viewMonth === 0) {
			viewMonth = 11;
			viewYear -= 1;
		} else {
			viewMonth -= 1;
		}
		focusedDateStr = pickFocusCandidate();
		announcer.announce(headerMonthYear);
	}

	function nextMonth() {
		if (viewMonth === 11) {
			viewMonth = 0;
			viewYear += 1;
		} else {
			viewMonth += 1;
		}
		focusedDateStr = pickFocusCandidate();
		announcer.announce(headerMonthYear);
	}

	// WAI-ARIA grid pattern: arrow keys move the roving tab-stop, Home/End
	// jump to the start/end of the visible week, PageUp/PageDown (+Shift for
	// a year) change month/year, Enter/Space select.
	async function handleGridKeydown(event: KeyboardEvent, cell: DayCell) {
		let deltaDays = 0;
		let deltaMonths = 0;
		let deltaYears = 0;

		switch (event.key) {
			case 'ArrowLeft':
				deltaDays = -1;
				break;
			case 'ArrowRight':
				deltaDays = 1;
				break;
			case 'ArrowUp':
				deltaDays = -7;
				break;
			case 'ArrowDown':
				deltaDays = 7;
				break;
			case 'Home': {
				const isoDay = new Date(cell.year, cell.month, cell.day, 12).getDay() || 7;
				deltaDays = -((isoDay - weekStartsOn + 7) % 7);
				break;
			}
			case 'End': {
				const isoDay = new Date(cell.year, cell.month, cell.day, 12).getDay() || 7;
				deltaDays = 6 - ((isoDay - weekStartsOn + 7) % 7);
				break;
			}
			case 'PageUp':
				if (event.shiftKey) deltaYears = -1;
				else deltaMonths = -1;
				break;
			case 'PageDown':
				if (event.shiftKey) deltaYears = 1;
				else deltaMonths = 1;
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				selectDate(cell.dateStr);
				return;
			default:
				return;
		}
		event.preventDefault();

		let target: { year: number; month: number; day: number };
		if (deltaMonths !== 0 || deltaYears !== 0) {
			// PageUp/PageDown only ever set one of these, never both.
			const dt = new Date(cell.year + deltaYears, cell.month + deltaMonths, cell.day, 12, 0, 0);
			target = { year: dt.getFullYear(), month: dt.getMonth(), day: dt.getDate() };
		} else {
			target = addDays(cell.year, cell.month, cell.day, deltaDays);
		}

		const monthChanged = target.year !== viewYear || target.month !== viewMonth;
		viewYear = target.year;
		viewMonth = target.month;
		focusedDateStr = toDateStr(target.year, target.month, target.day);

		if (monthChanged) {
			announcer.announce(headerMonthYear);
		}

		await focusCell(focusedDateStr);
	}

	function handlePopoverToggle(event: Event) {
		const newState = (event as Event & { newState?: string }).newState;
		isOpen = newState === 'open';
		if (isOpen) {
			focusedDateStr = pickFocusCandidate();
			focusCell(focusedDateStr);
		}
	}
</script>

<div class="datepicker-wrapper">
	<!-- Value-mirror only, not an alternate tab stop - the trigger button below
	     is the sole accessible entry point (see issue #19). -->
	<input {id} type="date" bind:value class="sr-only" {disabled} tabindex="-1" aria-hidden="true" />

	<button
		type="button"
		class="datepicker-trigger"
		class:active={isOpen}
		{disabled}
		popovertarget={popoverId}
		style:anchor-name={anchorName}
		aria-haspopup="dialog"
		aria-expanded={isOpen}
		aria-label={t('datepicker.selectDate')}
	>
		<div class="trigger-content">
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				class="calendar-icon"
				aria-hidden="true"
			>
				<path
					d="M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				<path
					d="M16 2v4M8 2v4M3 10h18"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			<span class="trigger-label">{formattedDisplay}</span>
		</div>
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			class="chevron-icon"
			class:rotated={isOpen}
			aria-hidden="true"
		>
			<path
				d="M6 9l6 6 6-6"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</button>

	<div
		bind:this={popupEl}
		id={popoverId}
		popover="auto"
		class="datepicker-popup"
		style:position-anchor={anchorName}
		role="dialog"
		aria-label={t('datepicker.selectDate')}
		ontoggle={handlePopoverToggle}
	>
		<!-- Quick shortcuts pill bar -->
		<div class="quick-shortcuts">
			<button type="button" class="btn-quick" onclick={() => selectQuickDate(0)}
				>{t('datepicker.today')}</button
			>
			<button type="button" class="btn-quick" onclick={() => selectQuickDate(1)}
				>{t('datepicker.yesterday')}</button
			>
			<button type="button" class="btn-quick" onclick={() => selectQuickDate(3)}
				>{t('datepicker.daysAgo3')}</button
			>
			<button type="button" class="btn-quick" onclick={() => selectQuickDate(7)}
				>{t('datepicker.weekAgo1')}</button
			>
			<button type="button" class="btn-quick" onclick={() => selectQuickDate(14)}
				>{t('datepicker.weeksAgo2')}</button
			>
		</div>

		<!-- Month navigation bar -->
		<header class="calendar-header">
			<button
				type="button"
				class="btn-nav"
				onclick={prevMonth}
				aria-label={t('datepicker.prevMonth')}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
					<path
						d="M15 19l-7-7 7-7"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>

			<span class="header-title" id="{popoverId}-title">{headerMonthYear}</span>

			<button
				type="button"
				class="btn-nav"
				onclick={nextMonth}
				aria-label={t('datepicker.nextMonth')}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
					<path
						d="M9 5l7 7-7 7"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
		</header>

		<!-- Weekday headers (decorative - each grid cell carries its own full
		     weekday name in its accessible label, so this row is redundant for AT). -->
		<div class="weekday-grid" aria-hidden="true">
			{#each weekdayHeaders as wday, i (i)}
				<span class="weekday-cell">{wday}</span>
			{/each}
		</div>

		<!-- Day grid: WAI-ARIA grid pattern, one roving tab-stop, arrow-key navigation. -->
		<div class="days-grid" role="grid" aria-labelledby="{popoverId}-title">
			{#each weeks as week, wi (wi)}
				<div class="grid-row" role="row">
					{#each week as cell (cell.dateStr)}
						<button
							type="button"
							role="gridcell"
							class="day-cell"
							class:current-month={cell.isCurrentMonth}
							class:today={cell.isToday}
							class:selected={cell.isSelected}
							data-date={cell.dateStr}
							tabindex={cell.dateStr === focusedDateStr ? 0 : -1}
							aria-selected={cell.isSelected}
							aria-current={cell.isToday ? 'date' : undefined}
							aria-label={cellLabel(cell)}
							onclick={() => selectDate(cell.dateStr)}
							onkeydown={(e) => handleGridKeydown(e, cell)}
						>
							{cell.day}
						</button>
					{/each}
				</div>
			{/each}
		</div>
	</div>
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
		transition: border-color var(--duration-fast) ease;
	}

	.datepicker-trigger:hover:not(:disabled) {
		border-color: var(--border-strong);
		background-color: var(--surface-0);
	}

	.datepicker-trigger.active {
		border-color: var(--color-accent-500);
		background-color: var(--surface-0);
		box-shadow: none;
	}

	.datepicker-trigger:focus-visible {
		outline: 2px solid var(--color-accent-500);
		outline-offset: 2px;
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

	/* Popover Card - positioned via CSS anchor positioning against the trigger
	   button (anchor-name/position-anchor above), so no JS position tracking
	   or scroll/resize listeners are needed. position-try-fallbacks flips it
	   above the trigger when there isn't room below. */
	.datepicker-popup {
		position: fixed;
		position-area: bottom span-right;
		position-try-fallbacks: flip-block;
		margin: 0;
		margin-top: 8px;
		width: 19.5rem;
		max-width: calc(100vw - 32px);
		padding: 1rem;
		background-color: var(--surface-0);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
	}

	.datepicker-popup:popover-open {
		animation: modal-enter var(--duration-fast) var(--ease-out-expo);
	}

	@keyframes modal-enter {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
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
		background-color: var(--color-accent-600);
		color: #ffffff;
		border-color: var(--color-accent-600);
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
		gap: 0.25rem;
	}

	.grid-row {
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
		color: var(--color-accent-text);
		border-color: var(--color-accent-500);
	}

	.day-cell.selected {
		background-color: var(--color-accent-600);
		color: #ffffff;
		font-weight: 600;
		box-shadow: 0 2px 4px rgb(59 130 246 / 0.3);
	}
</style>
