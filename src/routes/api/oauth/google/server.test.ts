import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const env: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env }));

const { POST } = await import('./+server.js');

type Upstream = { url: string; body: URLSearchParams };
let upstream: Upstream[];
let answer: () => Response;

beforeEach(() => {
	env.GOOGLE_CLIENT_ID = 'client-id';
	env.GOOGLE_CLIENT_SECRET = 'top-secret';
	upstream = [];
	answer = () =>
		Response.json({
			access_token: 'a',
			expires_in: 3599,
			refresh_token: 'r',
			scope: 's',
			id_token: 'x'
		});
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init: RequestInit) => {
			upstream.push({ url, body: new URLSearchParams(init.body as URLSearchParams) });
			return answer();
		})
	);
});

afterEach(() => vi.unstubAllGlobals());

let ip = 0;
function call(
	body: unknown,
	{ origin = 'https://bewerby.de', raw }: { origin?: string | null; raw?: string } = {}
) {
	const headers = new Headers({ 'content-type': 'application/json' });
	if (origin) headers.set('origin', origin);
	// A fresh address per call, so the rate limit stays out of the way.
	headers.set('!~passenger-client-address', `192.0.2.${++ip % 250}`);
	const request = new Request('https://bewerby.de/api/oauth/google', {
		method: 'POST',
		headers,
		body: raw ?? JSON.stringify(body)
	});
	const event = {
		request,
		url: new URL('https://bewerby.de/api/oauth/google'),
		getClientAddress: () => '127.0.0.1'
	} as unknown as RequestEvent;
	return POST(event as never);
}

const codeGrant = {
	grant_type: 'authorization_code',
	code: '4/abc',
	code_verifier: 'v'.repeat(43),
	redirect_uri: 'https://bewerby.de/cloud/callback'
};

describe('POST /api/oauth/google', () => {
	it('adds the secret, forwards to Google and returns only the token fields', async () => {
		const response = await call(codeGrant);
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual({
			access_token: 'a',
			expires_in: 3599,
			refresh_token: 'r',
			scope: 's'
		});
		expect(upstream[0].url).toBe('https://oauth2.googleapis.com/token');
		expect(Object.fromEntries(upstream[0].body)).toEqual({
			...codeGrant,
			client_id: 'client-id',
			client_secret: 'top-secret'
		});
	});

	it('refreshes, and revokes through the revocation endpoint', async () => {
		expect((await call({ grant_type: 'refresh_token', refresh_token: 'r' })).status).toBe(200);
		expect(upstream[0].body.get('grant_type')).toBe('refresh_token');

		answer = () => new Response('', { status: 200 });
		expect((await call({ grant_type: 'revoke', token: 'r' })).status).toBe(200);
		expect(upstream[1].url).toBe('https://oauth2.googleapis.com/revoke');
		expect(Object.fromEntries(upstream[1].body)).toEqual({ token: 'r' });
	});

	it('refuses other sites, other callbacks and anything it does not know', async () => {
		expect((await call(codeGrant, { origin: 'https://evil.example' })).status).toBe(403);
		expect((await call(codeGrant, { origin: null })).status).toBe(403);
		expect(
			(await call({ ...codeGrant, redirect_uri: 'https://evil.example/cloud/callback' })).status
		).toBe(400);
		expect(
			(await call({ ...codeGrant, redirect_uri: 'https://bewerby.de/elsewhere' })).status
		).toBe(400);
		expect((await call({ grant_type: 'client_credentials' })).status).toBe(400);
		expect((await call(null, { raw: '{not json' })).status).toBe(400);
		expect((await call(null, { raw: 'x'.repeat(5000) })).status).toBe(413);
		expect(upstream).toHaveLength(0);
	});

	it('accepts the local http origin of the same host', async () => {
		const response = await call(codeGrant, { origin: 'http://bewerby.de' });
		expect(response.status).toBe(200);
	});

	it('says it is not configured instead of calling Google without a secret', async () => {
		env.GOOGLE_CLIENT_SECRET = undefined;
		expect((await call(codeGrant)).status).toBe(503);
		expect(upstream).toHaveLength(0);
	});

	it('passes a refused grant on as 400, so the client signs in again', async () => {
		answer = () => Response.json({ error: 'invalid_grant' }, { status: 400 });
		expect((await call({ grant_type: 'refresh_token', refresh_token: 'old' })).status).toBe(400);
		answer = () => new Response('', { status: 503 });
		expect((await call({ grant_type: 'refresh_token', refresh_token: 'old' })).status).toBe(502);
	});
});
