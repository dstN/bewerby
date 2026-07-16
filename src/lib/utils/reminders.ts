import { browser } from '$app/environment';
import { db } from '$lib/db/index.js';

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

let reminderCheckInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Synchronizes due reminders to the active Service Worker and checks local due reminders.
 * Fetches application data from IndexedDB, checks which items need reminders,
 * and posts this list to the active SW via message routing. Also triggers immediate notifications if due.
 */
export async function syncRemindersToServiceWorker(): Promise<void> {
	if (!browser) return;

	const list = await db.applications.toArray();
	const now = Date.now();

	const remindersToRegister = list
		.filter(app => {
			if (app.reminderInterval === 'none' || app.status === 'accepted' || app.status === 'rejected') {
				return false;
			}
			return true;
		})
		.map(app => {
			let intervalMs = 0;
			if (app.reminderInterval === '10s') intervalMs = 10 * 1000;
			else if (app.reminderInterval === '24h') intervalMs = 24 * 60 * 60 * 1000;
			else if (app.reminderInterval === '48h') intervalMs = 48 * 60 * 60 * 1000;
			else if (app.reminderInterval === '7d') intervalMs = 7 * 24 * 60 * 60 * 1000;
			else if (app.reminderInterval === '14d') intervalMs = 14 * 24 * 60 * 60 * 1000;

			return {
				id: app.id!.toString(),
				title: `${app.company} Rückfrage fällig`,
				body: `Es ist Zeit, bei ${app.company} bezüglich deiner Bewerbung als ${app.title} nachzufragen.`,
				dueAt: app.updatedAt + intervalMs,
				updatedAt: app.updatedAt
			};
		});

	for (const reminder of remindersToRegister) {
		if (reminder.dueAt <= now && reminder.dueAt > 0) {
			const notifyKey = `bewerby_notified_${reminder.id}_${reminder.updatedAt}`;
			if (!localStorage.getItem(notifyKey)) {
				localStorage.setItem(notifyKey, 'true');
				if ('serviceWorker' in navigator) {
					navigator.serviceWorker.ready.then(reg => {
						if (reg && reg.active) {
							reg.showNotification(reminder.title, {
								body: reminder.body,
								icon: '/icons/apple-touch-icon.png',
								tag: `reminder-${reminder.id}`,
								data: { applicationId: reminder.id }
							});
						} else if ('Notification' in window && Notification.permission === 'granted') {
							new Notification(reminder.title, { body: reminder.body, icon: '/icons/apple-touch-icon.png' });
						}
					}).catch(() => {
						if ('Notification' in window && Notification.permission === 'granted') {
							new Notification(reminder.title, { body: reminder.body, icon: '/icons/apple-touch-icon.png' });
						}
					});
				} else if ('Notification' in window && Notification.permission === 'granted') {
					new Notification(reminder.title, { body: reminder.body, icon: '/icons/apple-touch-icon.png' });
				}
			}
		}
	}

	if ('serviceWorker' in navigator) {
		navigator.serviceWorker.ready.then(registration => {
			if (registration && registration.active) {
				registration.active.postMessage({
					type: 'CHECK_REMINDERS',
					reminders: remindersToRegister
				});
			}
		}).catch(() => {});
	}
}

/**
 * Register periodic updates to poll reminders if PWA is installed or while tab is open.
 */
export async function registerPeriodicReminderCheck(): Promise<void> {
	if (!browser) return;

	if (reminderCheckInterval) clearInterval(reminderCheckInterval);
	reminderCheckInterval = setInterval(() => {
		syncRemindersToServiceWorker();
	}, 2000);

	if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;

	try {
		const registration = await navigator.serviceWorker.ready;
		await (registration as any).sync.register('check-reminders');
	} catch (err) {
		console.warn('Background sync registration failed (normal for standard browsers):', err);
	}
}
