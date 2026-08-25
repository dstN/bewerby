import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
	// tests/e2e (not e2e/) so SvelteKit's generated tsconfig - which
	// auto-includes tests/** but not e2e/** - type-checks these files too.
	testDir: 'tests/e2e',
	fullyParallel: true,
	// Capped rather than left at Playwright's default of half the CPU count: on
	// a 24-core machine that is 12 workers, and every one of them boots a
	// browser context that registers the service worker and has it precache
	// every route at once. That reliably tipped over into
	// net::ERR_INSUFFICIENT_RESOURCES once the suite grew past ~100 tests -
	// a flake in the harness, not in the app. Four still runs the whole suite
	// in well under a minute.
	workers: 4,
	forbidOnly: !!process.env.CI,
	// Retried everywhere, not only on CI. Roughly one run in three loses a
	// single test to `browser.newContext: Target page, context or browser has
	// been closed` - Chromium failing to launch, before any navigation or
	// assertion happens. It is independent of which test draws the short straw
	// and does not go away by lowering the worker count. A retry is the honest
	// fix for a browser-launch failure; a genuinely failing assertion fails
	// again on the retry.
	retries: 1,
	reporter: [['list']],
	// Runs the actual production entry point (app.cjs -> build/handler.js),
	// the same one Passenger starts on Netcup - not `vite preview`, which
	// SvelteKit's own docs say does not reliably emulate the adapter's server.
	// The offline/service-worker smoke test needs the real precached,
	// prerendered build, not dev-mode HMR.
	webServer: {
		command: 'npm run build && node app.cjs',
		port: PORT,
		env: { PORT: String(PORT) },
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	},
	use: {
		baseURL: `http://localhost:${PORT}`,
		locale: 'de-DE',
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	]
});
