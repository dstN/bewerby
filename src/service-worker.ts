/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_NAME = `bewerby-cache-${version}`;

// Every prerendered route (see +layout.ts: ssr = false, prerender = true) -
// `build`/`files` below cover only the client JS/CSS bundle and static/, not
// these HTML documents. Without listing them explicitly, a route's document
// only ever enters the cache the first time a *hard* (non-SPA) navigation to
// it succeeds online - which normal in-app link-clicking never triggers,
// since SvelteKit's client router swaps content without a real navigation.
// A user who only ever clicked between routes, then went offline and hard-
// reloaded one, would hit nothing but this worker's offline fallback.
const PRERENDERED_ROUTES = [
	'/',
	'/analytics',
	'/backup',
	'/settings',
	'/impressum',
	'/datenschutz',
	'/nutzungsbedingungen',
	'/kontakt'
];

// Assets to precache: built JS/CSS bundles + static files + the above.
// `files` mirrors static/ verbatim, including dotfiles (e.g. static/.gitignore) -
// adapter-node serves those via sirv, which refuses dotfiles by default and
// answers 404. A single 404 during install used to fail cache.addAll()
// atomically, which meant the service worker never activated at all.
const ASSETS = [...build, ...files, ...PRERENDERED_ROUTES].filter((path) => {
	const basename = path.split('/').pop() ?? '';
	return !basename.startsWith('.');
});

// Install: precache all app assets. Each asset is added individually (instead
// of one atomic cache.addAll) so a single missing/failed asset can't abort
// the whole installation - we log and continue instead.
sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then(async (cache) => {
				const results = await Promise.allSettled(ASSETS.map((asset) => cache.add(asset)));
				const failed = results
					.map((result, i) => (result.status === 'rejected' ? ASSETS[i] : null))
					.filter((asset): asset is string => asset !== null);
				if (failed.length > 0) {
					console.warn('[service-worker] failed to precache', failed.length, 'asset(s):', failed);
				}
			})
			.then(() => sw.skipWaiting())
	);
});

// Activate: clean up old caches
sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
			)
			.then(() => sw.clients.claim())
	);
});

async function cacheSameOriginResponse(request: Request, response: Response, url: URL) {
	if (response.ok && url.origin === sw.location.origin) {
		const cache = await caches.open(CACHE_NAME);
		await cache.put(request, response.clone());
	}
	return response;
}

// Fetch strategy:
// - Navigations (loading a page/route) go network-first, so a user online
//   always sees the current app shell; a cached copy (if any) is the offline
//   fallback instead of the browser's own network-error page.
// - Everything else (JS/CSS/fonts/icons) is cache-first, since those assets
//   are fingerprinted and immutable - once cached, the network is only
//   consulted if the cache misses.
// Every branch has an explicit .catch(), so a network failure always resolves
// to *something* instead of an unhandled rejection breaking the whole request.
sw.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);

	// Skip non-HTTP(S) requests
	if (!url.protocol.startsWith('http')) return;

	if (event.request.mode === 'navigate') {
		event.respondWith(
			fetch(event.request)
				.then((response) => cacheSameOriginResponse(event.request, response, url))
				.catch(async () => {
					const cached = await caches.match(event.request);
					if (cached) return cached;
					// No network and nothing cached for this route yet (e.g. first-ever
					// visit to it happened offline) - fail predictably instead of
					// leaving the navigation to reject with no response at all.
					return new Response('Offline und noch nicht im Cache verfügbar.', {
						status: 503,
						statusText: 'Offline',
						headers: { 'Content-Type': 'text/plain; charset=utf-8' }
					});
				})
		);
		return;
	}

	event.respondWith(
		caches.match(event.request).then((cached) => {
			if (cached) return cached;

			return fetch(event.request)
				.then((response) => cacheSameOriginResponse(event.request, response, url))
				.catch(() => new Response(null, { status: 504, statusText: 'Offline' }));
		})
	);
});

// Handle notification clicks
sw.addEventListener('notificationclick', (event) => {
	event.notification.close();

	event.waitUntil(
		sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
			// Focus existing window or open new one
			const existingClient = clients.find((c) => 'focus' in c);
			if (existingClient) {
				return existingClient.focus();
			}
			return sw.clients.openWindow('/');
		})
	);
});
