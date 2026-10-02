import { defineEnvVars } from '@sveltejs/kit/env';

// Server-only settings, read from the Node app's environment in Plesk when
// the app starts (DEPLOYMENT.md). SvelteKit 3 exposes only what is declared
// here, through $app/env/private. All optional: without the Google pair the
// token broker answers 503, without SIGNAL_DIR signaling uses tmp/signal.
const optional = (value: string | undefined) => value || undefined;

export const variables = defineEnvVars({
	GOOGLE_CLIENT_ID: {
		schema: optional,
		description: 'Google OAuth client id, for the token broker /api/oauth/google (#54).'
	},
	GOOGLE_CLIENT_SECRET: {
		schema: optional,
		description: 'Google OAuth client secret. Plesk environment only, never in the repository.'
	},
	SIGNAL_DIR: {
		schema: optional,
		description: 'Where /api/signal keeps its message files (#55). Default: tmp/signal.'
	},
	RELAY_DIR: {
		schema: optional,
		description: 'Where /api/relay keeps the encrypted sync files (#58). Default: data/relay.'
	},
	RELAY_MAX_MB: {
		schema: optional,
		description: 'Upper bound for everything /api/relay stores, in MB (#58). Default: 2048.'
	}
});
