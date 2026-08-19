import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
			alias: {
				$i18n: 'src/lib/i18n'
			},
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
					'connect-src': ['self'],
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
		// None of the tested logic (PDF heuristics, reminder math, backup
		// serialization, analytics stats, the Dexie migration) touches the
		// DOM - plain Node is lighter and faster than jsdom/happy-dom here.
		// IndexedDB (for Dexie) is provided per-test-file via fake-indexeddb.
		environment: 'node',
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
