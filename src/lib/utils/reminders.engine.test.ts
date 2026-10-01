import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Application } from '#lib/db/index.js';

/**
 * Covers the reminder *engine* - the scheduling, de-duplication and cleanup
 * around getReminderDueAt() (whose own date maths is covered in
 * reminders.test.ts). None of it is reachable without a live query, a clock,
 * and a notification sink, so all three are substituted here.
 */

vi.mock('$app/env', () => ({ browser: true }));

/** Captures the subscriber startReminderEngine() hands to liveQuery, so a
 *  test can push a new snapshot of the applications table at will. */
let pushApplications: ((apps: Application[]) => void) | null = null;
let liveQueryError: ((err: unknown) => void) | null = null;
const unsubscribe = vi.fn();

vi.mock('dexie', () => ({
	liveQuery: () => ({
		subscribe: (observer: {
			next: (apps: Application[]) => void;
			error: (err: unknown) => void;
		}) => {
			pushApplications = observer.next;
			liveQueryError = observer.error;
			return { unsubscribe };
		}
	})
}));

const toArray = vi.fn<() => Promise<Application[]>>(async () => []);
vi.mock('#lib/db/index.js', () => ({ db: { applications: { toArray: () => toArray() } } }));

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

let shownNotifications: Array<{ title: string; options: NotificationOptions }>;

/** A service-worker registration stand-in - the path production actually
 *  takes (an in-page `new Notification()` is only the fallback). */
function installServiceWorker({ active = true }: { active?: boolean } = {}) {
	shownNotifications = [];
	vi.stubGlobal('navigator', {
		serviceWorker: {
			ready: Promise.resolve({
				active: active ? {} : null,
				showNotification: async (title: string, options: NotificationOptions) => {
					shownNotifications.push({ title, options });
				}
			})
		}
	});
	// showReminderNotification()'s fallback branch reads `window`, which does
	// not exist in the node environment; without Notification on it, a
	// registration with no active worker means "could not notify".
	vi.stubGlobal('window', {});
}

function makeApp(overrides: Partial<Application> = {}): Application {
	return {
		id: 1,
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
		reminderInterval: '24h',
		createdAt: NOW - 10 * DAY_MS,
		updatedAt: NOW - 10 * DAY_MS,
		history: [{ status: 'sent', timestamp: NOW - 10 * DAY_MS }],
		...overrides
	};
}

/** An application whose follow-up came due `agoMs` ago. */
function overdueApp(id: number, agoMs = DAY_MS): Application {
	return makeApp({
		id,
		company: `Firma ${id}`,
		reminderInterval: '24h',
		history: [{ status: 'sent', timestamp: NOW - DAY_MS - agoMs }]
	});
}

/** An application whose follow-up falls due `inMs` from now. */
function futureApp(id: number, inMs: number): Application {
	return makeApp({
		id,
		company: `Firma ${id}`,
		reminderInterval: '24h',
		history: [{ status: 'sent', timestamp: NOW - DAY_MS + inMs }]
	});
}

function notifiedKeys(): string[] {
	return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!)
		.filter((key) => key.startsWith('bewerby_notified_'))
		.sort();
}

/**
 * checkAndSchedule() deliberately does not await showReminderNotification()
 * (a slow/hanging notification must not stall the rest of the scan), so the
 * localStorage marker it writes lands several microtasks later - past
 * `navigator.serviceWorker.ready`, showNotification(), and the `.then()`.
 * Draining the microtask queue is what makes those observable.
 */
async function flush(): Promise<void> {
	for (let i = 0; i < 20; i++) await Promise.resolve();
}

async function loadEngine() {
	vi.resetModules();
	return import('./reminders.js');
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	pushApplications = null;
	liveQueryError = null;
	unsubscribe.mockClear();
	toArray.mockClear();
	toArray.mockImplementation(async () => []);
	installServiceWorker();
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('firing due reminders', () => {
	it('shows a notification for an application whose follow-up is overdue', async () => {
		const { startReminderEngine } = await loadEngine();
		startReminderEngine();

		pushApplications!([overdueApp(1)]);
		await flush();

		expect(shownNotifications).toHaveLength(1);
		expect(shownNotifications[0].title).toContain('Firma 1');
		expect(shownNotifications[0].options.data).toEqual({ applicationId: 1 });
		expect(shownNotifications[0].options.tag).toBe('reminder-1');
	});

	it('does not notify for a reminder that is still in the future', async () => {
		const { startReminderEngine } = await loadEngine();
		startReminderEngine();

		pushApplications!([futureApp(1, 60_000)]);
		await flush();

		expect(shownNotifications).toHaveLength(0);
	});

	it('ignores applications with no reminder configured', async () => {
		const { startReminderEngine } = await loadEngine();
		startReminderEngine();

		pushApplications!([makeApp({ id: 1, reminderInterval: 'none' })]);
		await flush();

		expect(shownNotifications).toHaveLength(0);
		expect(notifiedKeys()).toEqual([]);
	});

	it('ignores an unsaved row that has no id yet', async () => {
		const { startReminderEngine } = await loadEngine();
		startReminderEngine();

		pushApplications!([{ ...overdueApp(1), id: undefined }]);
		await flush();

		expect(shownNotifications).toHaveLength(0);
	});

	it('notifies each overdue application separately', async () => {
		const { startReminderEngine } = await loadEngine();
		startReminderEngine();

		pushApplications!([overdueApp(1), overdueApp(2), futureApp(3, 60_000)]);
		await flush();

		expect(shownNotifications.map((n) => n.options.tag).sort()).toEqual([
			'reminder-1',
			'reminder-2'
		]);
	});
});

describe('never notifying twice for the same reminder', () => {
	it('marks a shown reminder and skips it on the next data change', async () => {
		const { startReminderEngine } = await loadEngine();
		startReminderEngine();

		const app = overdueApp(1);
		pushApplications!([app]);
		await flush();
		expect(shownNotifications).toHaveLength(1);
		expect(notifiedKeys()).toHaveLength(1);

		// Any unrelated edit re-runs the whole check against the same due time.
		pushApplications!([{ ...app, notes: 'Nachgefasst per Telefon' }]);
		await flush();
		expect(shownNotifications).toHaveLength(1);
	});

	it('notifies again once the due time itself moves (the interval was changed)', async () => {
		const { startReminderEngine } = await loadEngine();
		startReminderEngine();

		pushApplications!([overdueApp(1)]);
		await flush();
		expect(shownNotifications).toHaveLength(1);

		// Same application, longer interval => a different, still-overdue due
		// time (overdueApp(1) is due at NOW - 1 day; this one at NOW - 3 days).
		pushApplications!([
			makeApp({
				id: 1,
				company: 'Firma 1',
				reminderInterval: '7d',
				history: [{ status: 'sent', timestamp: NOW - 10 * DAY_MS }]
			})
		]);
		await flush();
		expect(shownNotifications).toHaveLength(2);
	});

	it('does NOT mark it notified when the notification could not be shown', async () => {
		// No active worker and no in-page Notification API: permission denied,
		// or the worker has not taken control yet. Marking it here would
		// permanently suppress a reminder the user never saw.
		installServiceWorker({ active: false });
		const { startReminderEngine } = await loadEngine();
		startReminderEngine();

		pushApplications!([overdueApp(1)]);
		await flush();

		expect(shownNotifications).toHaveLength(0);
		expect(notifiedKeys()).toEqual([]);
	});

	it('retries on the next check after a failed attempt', async () => {
		installServiceWorker({ active: false });
		const { startReminderEngine } = await loadEngine();
		startReminderEngine();

		pushApplications!([overdueApp(1)]);
		await flush();
		expect(notifiedKeys()).toEqual([]);

		installServiceWorker({ active: true });
		pushApplications!([overdueApp(1)]);
		await flush();
		expect(shownNotifications).toHaveLength(1);
		expect(notifiedKeys()).toHaveLength(1);
	});
});

describe('cleaning up notified-markers', () => {
	it('removes markers for reminders that are no longer current', async () => {
		const { startReminderEngine } = await loadEngine();
		startReminderEngine();

		pushApplications!([overdueApp(1), overdueApp(2)]);
		await flush();
		expect(notifiedKeys()).toHaveLength(2);

		// Application 2 was deleted; its marker must not linger forever.
		pushApplications!([overdueApp(1)]);
		await flush();
		expect(notifiedKeys()).toHaveLength(1);
		expect(notifiedKeys()[0]).toContain('_1_');
	});

	it('leaves unrelated localStorage entries alone', async () => {
		localStorage.setItem('bewerby-theme', 'dark');
		localStorage.setItem('bewerby-locale', 'en');
		localStorage.setItem('bewerby_custom_colors', '["#123456"]');

		const { startReminderEngine } = await loadEngine();
		startReminderEngine();

		pushApplications!([overdueApp(1)]);
		await flush();
		pushApplications!([]);
		await flush();

		expect(notifiedKeys()).toEqual([]);
		expect(localStorage.getItem('bewerby-theme')).toBe('dark');
		expect(localStorage.getItem('bewerby-locale')).toBe('en');
		expect(localStorage.getItem('bewerby_custom_colors')).toBe('["#123456"]');
	});

	it('sweeps markers left behind by an earlier session', async () => {
		localStorage.setItem('bewerby_notified_99_1234567890', 'true');

		const { startReminderEngine } = await loadEngine();
		startReminderEngine();

		pushApplications!([]);
		await flush();

		expect(notifiedKeys()).toEqual([]);
	});
});

describe('scheduling the next reminder', () => {
	it('fires exactly when the next reminder comes due, with no polling in between', async () => {
		const { startReminderEngine } = await loadEngine();
		startReminderEngine();

		const app = futureApp(1, 60 * 60 * 1000); // due in an hour
		toArray.mockImplementation(async () => [app]);
		pushApplications!([app]);
		await flush();
		expect(shownNotifications).toHaveLength(0);

		await vi.advanceTimersByTimeAsync(60 * 60 * 1000 - 1000);
		await flush();
		expect(shownNotifications).toHaveLength(0);

		await vi.advanceTimersByTimeAsync(1000);
		await flush();
		expect(shownNotifications).toHaveLength(1);
	});

	it('schedules against the earliest of several pending reminders', async () => {
		const { startReminderEngine } = await loadEngine();
		startReminderEngine();

		const soon = futureApp(1, 60_000);
		const later = futureApp(2, 10 * 60_000);
		toArray.mockImplementation(async () => [soon, later]);
		pushApplications!([soon, later]);
		await flush();

		await vi.advanceTimersByTimeAsync(60_000);
		await flush();
		expect(shownNotifications.map((n) => n.options.tag)).toEqual(['reminder-1']);
	});

	it('clamps a far-future delay to the 32-bit setTimeout limit instead of overflowing', async () => {
		const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
		const { startReminderEngine } = await loadEngine();
		startReminderEngine();

		// 14 days is ~1.2e9 ms and fits, so push it well past 2^31-1 ms (~24.8
		// days) - an overflowed delay would wrap negative and fire immediately.
		pushApplications!([futureApp(1, 60 * DAY_MS)]);
		await flush();

		const delays = setTimeoutSpy.mock.calls.map((call) => call[1]);
		expect(delays).toContain(2_147_483_647);
		expect(shownNotifications).toHaveLength(0);
	});

	it('replaces the pending timer when the data changes, rather than stacking timers', async () => {
		const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
		const { startReminderEngine } = await loadEngine();
		startReminderEngine();

		pushApplications!([futureApp(1, 10 * 60_000)]);
		await flush();

		const rescheduled = futureApp(1, 5 * 60_000);
		toArray.mockImplementation(async () => [rescheduled]);
		pushApplications!([rescheduled]);
		await flush();
		expect(clearTimeoutSpy).toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(5 * 60_000);
		await flush();
		expect(shownNotifications).toHaveLength(1);

		// The original 10-minute timer must not fire a second notification.
		await vi.advanceTimersByTimeAsync(10 * 60_000);
		await flush();
		expect(shownNotifications).toHaveLength(1);
	});

	it('schedules nothing when every reminder is already overdue or disabled', async () => {
		const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
		const { startReminderEngine } = await loadEngine();
		startReminderEngine();

		pushApplications!([overdueApp(1), makeApp({ id: 2, reminderInterval: 'none' })]);
		await flush();

		expect(setTimeoutSpy).not.toHaveBeenCalled();
	});
});

describe('engine lifecycle', () => {
	it('teardown unsubscribes and cancels the pending timer', async () => {
		const { startReminderEngine } = await loadEngine();
		const stop = startReminderEngine();

		const app = futureApp(1, 60_000);
		toArray.mockImplementation(async () => [app]);
		pushApplications!([app]);
		await flush();

		stop();
		expect(unsubscribe).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(5 * 60_000);
		await flush();
		expect(shownNotifications).toHaveLength(0);
	});

	it('logs a liveQuery error instead of letting it break the app shell', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { startReminderEngine } = await loadEngine();
		startReminderEngine();

		expect(() => liveQueryError!(new Error('DatabaseClosedError'))).not.toThrow();
		expect(errorSpy).toHaveBeenCalled();
	});
});

describe('notification permission helpers', () => {
	it('reports "denied" where the Notification API does not exist', async () => {
		vi.stubGlobal('window', {});
		const { getNotificationPermissionState } = await loadEngine();
		expect(getNotificationPermissionState()).toBe('denied');
	});

	it('reports the browser-held permission when the API exists', async () => {
		vi.stubGlobal('window', { Notification: { permission: 'granted' } });
		vi.stubGlobal('Notification', { permission: 'granted' });
		const { getNotificationPermissionState } = await loadEngine();
		expect(getNotificationPermissionState()).toBe('granted');
	});

	it('resolves to "denied" when requesting permission is impossible', async () => {
		vi.stubGlobal('window', {});
		const { requestNotificationPermission } = await loadEngine();
		await expect(requestNotificationPermission()).resolves.toBe('denied');
	});

	it('passes the user decision straight through', async () => {
		const requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
		vi.stubGlobal('window', { Notification: { requestPermission } });
		vi.stubGlobal('Notification', { requestPermission });
		const { requestNotificationPermission } = await loadEngine();
		await expect(requestNotificationPermission()).resolves.toBe('granted');
		expect(requestPermission).toHaveBeenCalledOnce();
	});
});

describe('registerBackgroundSyncBestEffort', () => {
	it('does nothing where SyncManager is unavailable (every non-Chromium browser)', async () => {
		vi.stubGlobal('window', {});
		const { registerBackgroundSyncBestEffort } = await loadEngine();
		await expect(registerBackgroundSyncBestEffort()).resolves.toBeUndefined();
	});

	it('registers the tag where the API exists', async () => {
		const register = vi.fn(async () => {});
		vi.stubGlobal('navigator', {
			serviceWorker: { ready: Promise.resolve({ sync: { register } }) }
		});
		vi.stubGlobal('window', { SyncManager: class {} });
		const { registerBackgroundSyncBestEffort } = await loadEngine();

		await registerBackgroundSyncBestEffort();
		expect(register).toHaveBeenCalledWith('check-reminders');
	});

	it('swallows a rejected registration - it is explicitly best-effort', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.stubGlobal('navigator', {
			serviceWorker: {
				ready: Promise.resolve({
					sync: {
						register: async () => {
							throw new Error('NotAllowedError');
						}
					}
				})
			}
		});
		vi.stubGlobal('window', { SyncManager: class {} });
		const { registerBackgroundSyncBestEffort } = await loadEngine();

		await expect(registerBackgroundSyncBestEffort()).resolves.toBeUndefined();
		expect(warnSpy).toHaveBeenCalled();
	});
});
