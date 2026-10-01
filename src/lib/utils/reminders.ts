import { browser } from '$app/environment';
import { liveQuery } from 'dexie';
import { db, type Application } from '$lib/db/index.js';

// The Background Sync API (navigator.serviceWorker.ready.sync) isn't part of
// lib.dom.d.ts yet; declare just enough of it for the feature-detected call below.
interface SyncManager {
	register(tag: string): Promise<void>;
}
interface ServiceWorkerRegistrationWithSync extends ServiceWorkerRegistration {
	sync: SyncManager;
}

/**
 * Checks if browser notifications are supported and permitted.
 */
export function getNotificationPermissionState(): NotificationPermission {
	if (!browser || !('Notification' in window)) {
		return 'denied';
	}
	return Notification.permission;
}

/**
 * Requests permission from the user for showing local browser notifications.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
	if (!browser || !('Notification' in window)) {
		return 'denied';
	}

	const permission = await Notification.requestPermission();
	return permission;
}

/** Exported so the editor can anchor a changed interval on "now" the same way. */
export const INTERVAL_MS: Partial<Record<Application['reminderInterval'], number>> = {
	'24h': 24 * 60 * 60 * 1000,
	'48h': 48 * 60 * 60 * 1000,
	'7d': 7 * 24 * 60 * 60 * 1000,
	'14d': 14 * 24 * 60 * 60 * 1000
};

/**
 * When this application was sent, as far as anything records it: the date
 * the user entered, otherwise the first move into "sent". Undefined when
 * neither exists - the statistics time a response only from a real send.
 *
 * `history` is required on the type, but a row written past TypeScript (an
 * old import, a hand-edited IndexedDB entry) can be missing it - see
 * analytics.ts for the same guard.
 */
export function getSentAt(app: Pick<Application, 'history' | 'sentAt'>): number | undefined {
	return app.sentAt ?? (app.history ?? []).find((h) => h.status === 'sent')?.timestamp;
}

/**
 * The application date everything shows: getSentAt, falling back to
 * appliedAt and then createdAt. The reminder anchor, the card's date and the
 * "Zeitpunkt der Bewerbung" column of the Arbeitsamt export are the same
 * date by definition, so they read it from here rather than each rebuilding
 * the fallback chain.
 */
export function getAppliedAt(
	app: Pick<Application, 'history' | 'sentAt' | 'appliedAt' | 'createdAt'>
): number {
	return getSentAt(app) ?? app.appliedAt ?? app.createdAt;
}

/**
 * When this application was rejected: the date the user entered, otherwise
 * the move into "Absage". Undefined for anything not rejected, and for a
 * rejection whose history does not end in one - before 2026-08-18 the edit
 * dialog set a status without logging it, and an older "rejected" entry
 * further back would date the wrong rejection. The edit dialog and the
 * export both read it from here, so they show the same date.
 */
export function getRejectedAt(
	app: Pick<Application, 'status' | 'history' | 'rejectedAt'>
): number | undefined {
	if (app.status !== 'rejected') return undefined;
	const last = (app.history ?? []).at(-1);
	return app.rejectedAt ?? (last?.status === 'rejected' ? last.timestamp : undefined);
}

/**
 * Whether an application actually went out - the rule both the statistics
 * funnel and the proof-of-applications export count by. Every status past
 * draft implies it except a rejection: a card dragged from draft straight to
 * "Absage" (the posting was gone, say) was never sent, and only its history
 * shows that. A rejection with no draft entry at all - logged after the fact
 * directly in the rejected column, or a legacy row without history - records
 * a real rejection and counts. So does one with an entered application date:
 * that is the user saying it went out, whatever the board saw.
 */
export function wasSent(app: Pick<Application, 'status' | 'history' | 'sentAt'>): boolean {
	if (app.status === 'draft') return false;
	if (app.status !== 'rejected') return true;
	const history = app.history ?? [];
	// Before 2026-08-18 the edit dialog changed a status without logging it,
	// so an old row's history can stop short of the rejection it is in. That
	// history proves nothing about sending; count it, like a row without one.
	if (history.at(-1)?.status !== 'rejected') return true;
	return (
		app.sentAt !== undefined ||
		history.some(
			(h) => h.status === 'sent' || h.status === 'interview' || h.status === 'accepted'
		) ||
		!history.some((h) => h.status === 'draft')
	);
}

/**
 * The single source of truth for "when is a follow-up reminder due for this
 * application" - used by both the board's in-app alert banner and the
 * notification-firing engine below, so they can never drift out of sync with
 * each other the way two separately hand-copied interval mappings could.
 *
 * Reads the row's own `reminderAt` when it has one, and otherwise falls back
 * to counting the interval from when the application entered "sent" - never
 * from `updatedAt`, so editing an unrelated field, changing the card color,
 * or dragging the card without changing its status can't push the follow-up
 * date back either way.
 */
export function getReminderDueAt(app: Application): number | null {
	if (app.reminderInterval === 'none' || app.status === 'accepted' || app.status === 'rejected') {
		return null;
	}
	// An explicit due date always wins: it is what the user last chose, either
	// by picking a day outright or by changing the interval (which the editor
	// anchors on the moment of the change, not on the application date).
	if (app.reminderAt !== undefined) return app.reminderAt;

	const intervalMs = INTERVAL_MS[app.reminderInterval];
	// Falls through for any unrecognized value (e.g. data written by an older
	// build, or 'custom' on a row whose reminderAt went missing) instead of
	// throwing or mis-scheduling - no reminder is safer than a wrong one.
	if (!intervalMs) return null;

	// Rows predating reminderAt keep the original behaviour: counted from when
	// the application entered "sent", so editing an unrelated field never
	// pushes an already-pending follow-up back.
	return getAppliedAt(app) + intervalMs;
}

function notifiedKey(appId: number, dueAt: number): string {
	return `bewerby_notified_${appId}_${dueAt}`;
}

/** Removes notified-markers for reminders that are no longer current, so localStorage doesn't grow forever. */
function cleanupStaleNotifyKeys(validKeys: Set<string>): void {
	const staleKeys: string[] = [];
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key?.startsWith('bewerby_notified_') && !validKeys.has(key)) {
			staleKeys.push(key);
		}
	}
	for (const key of staleKeys) localStorage.removeItem(key);
}

/**
 * Shows a reminder notification via the active service worker registration
 * (falling back to an in-page Notification if none is controlling this
 * page). Returns whether a notification was actually shown, so the caller
 * only marks it "notified" on success - never before, or a denied/unavailable
 * permission would permanently suppress a reminder that was never seen.
 */
async function showReminderNotification(app: Application): Promise<boolean> {
	const title = `${app.company} Rückfrage fällig`;
	const body = `Es ist Zeit, bei ${app.company} bezüglich deiner Bewerbung als ${app.title} nachzufragen.`;
	const options: NotificationOptions = {
		body,
		icon: '/app-icons/apple-touch-icon.png',
		tag: `reminder-${app.id}`,
		data: { applicationId: app.id }
	};

	if ('serviceWorker' in navigator) {
		try {
			const registration = await navigator.serviceWorker.ready;
			if (registration.active) {
				await registration.showNotification(title, options);
				return true;
			}
		} catch (err) {
			console.error('Failed to show reminder via service worker:', err);
		}
	}

	if ('Notification' in window && Notification.permission === 'granted') {
		new Notification(title, options);
		return true;
	}

	return false;
}

let scheduledTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Fires any reminders that are due right now, then schedules a single precise
 * timeout for whichever reminder is due next - no polling. Re-invoked
 * automatically whenever the applications table changes (see
 * startReminderEngine), so a new/edited/deleted application always
 * reschedules against current data instead of a stale snapshot.
 */
function checkAndSchedule(apps: Application[]): void {
	if (scheduledTimeout !== null) {
		clearTimeout(scheduledTimeout);
		scheduledTimeout = null;
	}

	const now = Date.now();
	const validKeys = new Set<string>();
	let nextDueAt: number | null = null;

	for (const app of apps) {
		if (app.id === undefined) continue;
		const dueAt = getReminderDueAt(app);
		if (dueAt === null) continue;

		const key = notifiedKey(app.id, dueAt);
		validKeys.add(key);

		if (dueAt <= now) {
			if (!localStorage.getItem(key)) {
				showReminderNotification(app).then((shown) => {
					if (shown) localStorage.setItem(key, 'true');
				});
			}
		} else if (nextDueAt === null || dueAt < nextDueAt) {
			nextDueAt = dueAt;
		}
	}

	cleanupStaleNotifyKeys(validKeys);

	if (nextDueAt !== null) {
		// setTimeout delays are a 32-bit signed int internally; clamp so a
		// 14-day-out reminder doesn't overflow into firing immediately.
		const delay = Math.min(nextDueAt - now, 2_147_483_647);
		scheduledTimeout = setTimeout(() => {
			db.applications.toArray().then(checkAndSchedule);
		}, delay);
	}
}

/**
 * Starts the reminder engine: subscribes to live application data and keeps
 * exactly one timer scheduled for the next due reminder, replacing what used
 * to be a setInterval polling the whole table every 2 seconds forever.
 * Returns a teardown function to call on app/component destroy.
 */
export function startReminderEngine(): () => void {
	if (!browser) return () => {};

	const observable = liveQuery(() => db.applications.toArray());
	const subscription = observable.subscribe({
		next: (apps) => checkAndSchedule(apps),
		error: (err) => console.error('Reminder engine liveQuery error:', err)
	});

	return () => {
		subscription.unsubscribe();
		if (scheduledTimeout !== null) {
			clearTimeout(scheduledTimeout);
			scheduledTimeout = null;
		}
	};
}

/**
 * Best-effort registration for a one-shot background sync tag. This does
 * NOT make reminders fire while bewerby is fully closed - Background Sync
 * only runs once connectivity returns and has no listener registered for it
 * in the service worker, since there is nothing meaningful to reconcile for
 * a 100%-local app. Kept only as a documented no-op rather than removed
 * outright, since some browsers surface its absence as a PWA capability
 * warning; see settings for the honest, user-facing statement that
 * reminders require bewerby to remain open in a tab (foreground or
 * backgrounded).
 */
export async function registerBackgroundSyncBestEffort(): Promise<void> {
	if (!browser || !('serviceWorker' in navigator) || !('SyncManager' in window)) return;

	try {
		const registration = await navigator.serviceWorker.ready;
		await (registration as ServiceWorkerRegistrationWithSync).sync.register('check-reminders');
	} catch (err) {
		console.warn('Background sync registration failed (normal for standard browsers):', err);
	}
}
