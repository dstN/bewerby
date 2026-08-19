import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
	// tests/e2e (not e2e/) so SvelteKit's generated tsconfig - which
	// auto-includes tests/** but not e2e/** - type-checks these files too.
	testDir: 'tests/e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
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
