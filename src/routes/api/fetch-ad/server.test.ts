import { describe, it, expect } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { POST } from './+server.js';

/** A request that fails URL validation, so nothing reaches the network. */
async function statusFor(passengerClient: string | null): Promise<number> {
	const headers = new Headers({ 'content-type': 'application/json' });
	if (passengerClient) headers.set('!~passenger-client-address', passengerClient);
	const request = new Request('http://localhost/api/fetch-ad', {
		method: 'POST',
		headers,
		body: JSON.stringify({ url: 'not a url' })
	});
	// Behind Passenger every socket peer is Passenger itself.
	const event = { request, getClientAddress: () => '127.0.0.1' } as unknown as RequestEvent;
	return (await POST(event)).status;
}

describe('POST /api/fetch-ad rate limit', () => {
	it('counts per real client behind Passenger, not per proxy socket', async () => {
		for (let i = 0; i < 40; i++) expect(await statusFor('198.51.100.7')).toBe(400);
		expect(await statusFor('198.51.100.7')).toBe(429);
		// Same socket peer, different visitor: not caught in the first one's bucket.
		expect(await statusFor('203.0.113.9')).toBe(400);
	});
});
