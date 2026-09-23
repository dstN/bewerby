import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * The one non-prerendered route in the app. These run against the real
 * adapter-node build (see playwright.config.ts), so they exercise the guard
 * as it will actually be deployed - not a unit-tested copy of it.
 *
 * Nothing here reaches the public internet: every case is either rejected
 * before a socket is opened, or points back at the test server itself.
 */

async function post(request: APIRequestContext, url: unknown) {
	const response = await request.post('/api/fetch-ad', { data: { url } });
	return { status: response.status(), body: (await response.json()) as { error?: string } };
}

test.describe('POST /api/fetch-ad', () => {
	test('refuses every way of pointing the server back at itself or its network', async ({
		request
	}) => {
		const inward = [
			'http://127.0.0.1/',
			'https://127.0.0.1/',
			'https://[::1]:8443/',
			'https://169.254.169.254/latest/meta-data/',
			'https://10.0.0.1/',
			'https://192.168.0.1/',
			'file:///etc/passwd',
			'ftp://example.com/',
			'https://user:pw@example.com/'
		];

		for (const url of inward) {
			const { status, body } = await post(request, url);
			expect(status, `${url} must be rejected`).toBe(400);
			expect(['blocked', 'invalid-url']).toContain(body.error);
		}
	});

	test('rejects a body that is not a URL string at all', async ({ request }) => {
		expect((await post(request, 42)).status).toBe(400);
		expect((await post(request, null)).status).toBe(400);
		expect((await post(request, `https://example.com/${'x'.repeat(2100)}`)).status).toBe(400);
		expect((await post(request, 'Senior Frontend Developer (m/w/d)')).status).toBe(400);
	});

	test('a redirect into the private range is caught on the hop, not just up front', async ({
		request,
		baseURL
	}) => {
		// The test server itself is the loopback target: a check that only ran
		// on the original URL would follow this happily.
		const { status, body } = await post(
			request,
			`https://example.com@${new URL(baseURL!).host}/board`
		);
		expect(status).toBe(400);
		expect(['blocked', 'invalid-url']).toContain(body.error);
	});

	test('sets the security headers, since this route is not prerendered', async ({ request }) => {
		const response = await request.post('/api/fetch-ad', { data: { url: 'https://127.0.0.1/' } });
		expect(response.headers()['x-content-type-options']).toBe('nosniff');
		expect(response.headers()['x-frame-options']).toBe('DENY');
	});

	test('does not answer GET, so the URL can never land in an access log', async ({ request }) => {
		const response = await request.get('/api/fetch-ad?url=https://example.com/');
		expect(response.status()).toBe(405);
	});
});
