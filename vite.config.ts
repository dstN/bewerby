import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
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
			}
		})
	]
});
