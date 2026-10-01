import { test, expect } from '@playwright/test';

const ROUTES = [
	'/',
	'/board',
	'/analytics',
	'/backup',
	'/settings',
	'/impressum',
	'/datenschutz',
	'/nutzungsbedingungen',
	'/kontakt'
];

// In production these come out of adapter-node's static-file path, and Apache
// adds `X-Content-Type-Options: nosniff` on top (static/.htaccess). A page
// without a Content-Type header is then rendered as text/plain - the raw HTML
// source instead of the app - so the header has to be there, not sniffed.
test('every prerendered route is served as text/html', async ({ request }) => {
	for (const route of ROUTES) {
		const response = await request.get(route);
		expect(response.status(), route).toBe(200);
		expect(response.headers()['content-type'], route).toMatch(/^text\/html/);
	}
});
