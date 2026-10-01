import { describe, it, expect } from 'vitest';
import { getReminderDueAt } from './reminders.js';
import type { Application, StatusHistory } from '#lib/db/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeApp(overrides: Partial<Application> = {}): Application {
	return {
		title: 'Frontend Developer',
		company: 'Acme GmbH',
		url: '',
		salary: '',
		contactName: '',
		contactEmail: '',
		contactPhone: '',
		notes: '',
		priority: 'medium',
		status: 'sent',
		tags: [],
		reminderInterval: 'none',
		createdAt: 1_000_000,
		updatedAt: 1_000_000,
		history: [],
		...overrides
	};
}

function sentAt(timestamp: number): StatusHistory[] {
	return [{ status: 'sent', timestamp }];
}

describe('getReminderDueAt', () => {
	it('returns null when reminderInterval is "none"', () => {
		const app = makeApp({ reminderInterval: 'none', history: sentAt(1_000_000) });
		expect(getReminderDueAt(app)).toBeNull();
	});

	it.each([
		['24h', 24 * 60 * 60 * 1000],
		['48h', 48 * 60 * 60 * 1000],
		['7d', 7 * DAY_MS],
		['14d', 14 * DAY_MS]
	] as const)('computes the correct due time for interval %s', (interval, expectedMs) => {
		const sentTimestamp = 1_000_000;
		const app = makeApp({ reminderInterval: interval, history: sentAt(sentTimestamp) });
		expect(getReminderDueAt(app)).toBe(sentTimestamp + expectedMs);
	});

	it.each(['accepted', 'rejected'] as const)(
		'returns null when status is "%s", regardless of reminderInterval',
		(status) => {
			const app = makeApp({ status, reminderInterval: '24h', history: sentAt(1_000_000) });
			expect(getReminderDueAt(app)).toBeNull();
		}
	);

	it('anchors on the first "sent" history entry, not a later one', () => {
		const app = makeApp({
			reminderInterval: '24h',
			history: [
				{ status: 'sent', timestamp: 1_000_000 },
				{ status: 'interview', timestamp: 2_000_000 },
				{ status: 'sent', timestamp: 3_000_000 } // re-sent after an interview, e.g. a second round
			]
		});
		expect(getReminderDueAt(app)).toBe(1_000_000 + 24 * 60 * 60 * 1000);
	});

	it('falls back to appliedAt when there is no "sent" history entry', () => {
		const app = makeApp({
			reminderInterval: '24h',
			history: [],
			appliedAt: 5_000_000,
			createdAt: 1_000_000
		});
		expect(getReminderDueAt(app)).toBe(5_000_000 + 24 * 60 * 60 * 1000);
	});

	it('falls back to createdAt when there is neither a "sent" entry nor appliedAt', () => {
		const app = makeApp({
			reminderInterval: '24h',
			history: [],
			appliedAt: undefined,
			createdAt: 1_000_000
		});
		expect(getReminderDueAt(app)).toBe(1_000_000 + 24 * 60 * 60 * 1000);
	});

	it('uses an explicit reminderAt instead of counting the interval from "sent"', () => {
		const app = makeApp({
			reminderInterval: '7d',
			history: sentAt(1_000_000),
			reminderAt: 9_999_999
		});
		expect(getReminderDueAt(app)).toBe(9_999_999);
	});

	it('honours a custom date on an application that was never marked sent', () => {
		const app = makeApp({ status: 'draft', reminderInterval: 'custom', reminderAt: 4_242_424 });
		expect(getReminderDueAt(app)).toBe(4_242_424);
	});

	it('still returns null for "none" and for closed applications with a reminderAt set', () => {
		expect(getReminderDueAt(makeApp({ reminderInterval: 'none', reminderAt: 5_000 }))).toBeNull();
		expect(
			getReminderDueAt(
				makeApp({ status: 'accepted', reminderInterval: 'custom', reminderAt: 5_000 })
			)
		).toBeNull();
	});

	it('returns null for "custom" without a date rather than guessing one', () => {
		expect(
			getReminderDueAt(makeApp({ reminderInterval: 'custom', history: sentAt(1) }))
		).toBeNull();
	});

	it('returns null for an unrecognized reminderInterval value instead of miscalculating', () => {
		const app = makeApp({
			// Simulates data written by an older/different build - deliberately
			// bypassing the type system the way real stale data would.
			reminderInterval: 'unexpected-value' as Application['reminderInterval'],
			history: sentAt(1_000_000)
		});
		expect(getReminderDueAt(app)).toBeNull();
	});

	it('does not move the due date when unrelated fields change (draft -> sent history is preserved)', () => {
		const original = makeApp({ reminderInterval: '24h', history: sentAt(1_000_000) });
		const editedLater = makeApp({
			reminderInterval: '24h',
			history: sentAt(1_000_000), // status history unchanged
			updatedAt: 9_999_999, // but the row was touched much later (e.g. color changed)
			cardColor: '#ff00ff'
		});
		expect(getReminderDueAt(editedLater)).toBe(getReminderDueAt(original));
	});
});
