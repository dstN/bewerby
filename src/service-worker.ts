/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_NAME = `bewerby-cache-${version}`;

// Assets to precache: built JS/CSS bundles + static files
const ASSETS = [...build, ...files];

// Install: precache all app assets
sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

// Activate: clean up old caches
sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key !== CACHE_NAME)
						.map((key) => caches.delete(key))
				)
			)
			.then(() => sw.clients.claim())
	);
});

// Fetch: serve from cache first, fall back to network
sw.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);

	// Skip non-HTTP(S) requests
	if (!url.protocol.startsWith('http')) return;

	event.respondWith(
		caches.match(event.request).then((cached) => {
			if (cached) return cached;

			return fetch(event.request).then((response) => {
				// Only cache successful responses for same-origin
				if (response.ok && url.origin === sw.location.origin) {
					const responseClone = response.clone();
					caches.open(CACHE_NAME).then((cache) => {
						cache.put(event.request, responseClone);
					});
				}
				return response;
			});
		})
	);
});

/**
 * Local reminder notification check.
 * This runs entirely client-side with no server involved.
 * The main app will post messages to the SW with reminder data.
 */
sw.addEventListener('message', (event) => {
	if (event.data?.type === 'CHECK_REMINDERS') {
		const reminders = event.data.reminders as Array<{
			id: string;
			title: string;
			body: string;
			dueAt: number;
		}>;

		const now = Date.now();

		for (const reminder of reminders) {
			if (reminder.dueAt <= now && reminder.dueAt > 0) {
				sw.registration.showNotification(reminder.title, {
					body: reminder.body,
					icon: '/icons/apple-touch-icon.png',
					tag: `reminder-${reminder.id}`,
					data: { applicationId: reminder.id }
				});
			} else if (reminder.dueAt - now > 0 && reminder.dueAt - now <= 300000) {
				setTimeout(() => {
					sw.registration.showNotification(reminder.title, {
						body: reminder.body,
						icon: '/icons/apple-touch-icon.png',
						tag: `reminder-${reminder.id}`,
						data: { applicationId: reminder.id }
					});
				}, reminder.dueAt - now);
			}
		}
	}
});

// Handle notification clicks
sw.addEventListener('notificationclick', (event) => {
	event.notification.close();

	event.waitUntil(
		sw.clients
			.matchAll({ type: 'window', includeUncontrolled: true })
			.then((clients) => {
				// Focus existing window or open new one
				const existingClient = clients.find((c) => 'focus' in c);
				if (existingClient) {
					return existingClient.focus();
				}
				return sw.clients.openWindow('/');
			})
	);
});
