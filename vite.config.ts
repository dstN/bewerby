import { readFileSync } from 'node:fs';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// OAuth client ids of the sync providers (#53, #54). Public by design -
// PKCE needs no secret - and set as GitHub environment variables for the
// build. A provider without one is not offered, and its origins stay out of
// the CSP below: no key, no new place the page may talk to.
const syncClients = {
	dropbox: process.env.PUBLIC_DROPBOX_APP_KEY ?? '',
	onedrive: process.env.PUBLIC_MS_CLIENT_ID ?? '',
	google: process.env.PUBLIC_GOOGLE_CLIENT_ID ?? '',
	// For live sync between devices (#55): e.g. stun:stun.example.org:3478.
	// WebRTC is not governed by connect-src, so nothing to add to the CSP.
	// Empty: devices only find each other on the same network.
	stun: process.env.PUBLIC_STUN_URL ?? ''
};
const syncOrigins: `https://${string}.${string}`[] = [
	...(syncClients.dropbox
		? (['https://api.dropboxapi.com', 'https://content.dropboxapi.com'] as const)
		: []),
	// Graph hands out downloads as pre-authenticated URLs on OneDrive's file
	// hosts (personal) and SharePoint (work or school); see onedrive.ts. The
	// exact hosts are to be confirmed against a real account (#49).
	...(syncClients.onedrive
		? ([
				'https://login.microsoftonline.com',
				'https://graph.microsoft.com',
				'https://*.files.1drv.com',
				'https://*.sharepoint.com'
			] as const)
		: []),
	// API and uploads; the token exchange goes through our own /api/oauth/google.
	...(syncClients.google ? (['https://www.googleapis.com'] as const) : [])
];

export default defineConfig({
	// Single source of truth for the version shown in the sidebar (see
	// Sidebar.svelte) - reading package.json directly there isn't possible in
	// client code, so it's injected as a build-time constant instead.
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
		__SYNC_CLIENTS__: JSON.stringify(syncClients)
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({
				out: 'build',
				precompress: true
			}),
			prerender: {
				// The skip-link in app.html targets #main-content, which is part of
				// +layout.svelte - with ssr disabled (see +layout.ts) that element only
				// exists after client-side hydration, not in the prerendered HTML. That's
				// expected for this fully client-rendered app, not a broken link.
				handleMissingId: 'warn'
			},
			csp: {
				// Every route is prerendered (see +layout.ts), so SvelteKit delivers
				// this via a <meta http-equiv> tag in the static HTML rather than a
				// real response header - which means frame-ancestors/report-uri/
				// sandbox are silently ignored here (SvelteKit's own documented
				// limitation). Those three are set as real HTTP headers instead,
				// in .htaccess, so they actually take effect under Passenger/Apache.
				directives: {
					'default-src': ['self'],
					// pdf.js's worker compiles WebAssembly for some codecs; it no
					// longer needs (or supports) unsafe-eval as of v6.
					'script-src': ['self', 'wasm-unsafe-eval'],
					// Svelte's transitions (e.g. DatePicker's `transition:scale`)
					// inject inline <style> elements at runtime; SvelteKit's own
					// docs call out unsafe-inline as the required accommodation.
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self'],
					'font-src': ['self'],
					// The contact form (see /kontakt) posts to a mail relay on separate
					// infrastructure the same person operates - not a third-party
					// service - documented in ARCHITECTURE.md and the Datenschutzerklärung.
					'connect-src': ['self', 'https://contact.yinside.de', ...syncOrigins],
					'worker-src': ['self'],
					'manifest-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['none'],
					'form-action': ['self']
				}
			}
		})
	],
	test: {
		// Plain Node is the default because most of the tested logic (PDF
		// heuristics, reminder math, backup serialization, analytics stats,
		// the Dexie migration, validation) never touches the DOM, and node is
		// far lighter than jsdom. The handful of files that genuinely need a
		// document (the theme store's `.dark` class, i18n's <html lang>) opt
		// in per-file with a `// @vitest-environment jsdom` docblock instead
		// of slowing every file down. IndexedDB (for Dexie) is provided
		// per-test-file via fake-indexeddb; localStorage and matchMedia come
		// from the setup file below, which both environments need.
		environment: 'node',
		include: ['src/**/*.{test,spec}.{js,ts}'],
		setupFiles: ['tests/setup/browser-globals.ts']
	}
});
