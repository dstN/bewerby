import { describe, it, expect, beforeEach } from 'vitest';
import {
	challengeFor,
	pkcePair,
	readCallback,
	rememberAuthorization,
	takeAuthorization
} from './oauth.js';

// The browser-globals setup stubs localStorage only; sessionStorage behaves the same.
const store = new Map<string, string>();
globalThis.sessionStorage = {
	getItem: (key: string) => store.get(key) ?? null,
	setItem: (key: string, value: string) => void store.set(key, value),
	removeItem: (key: string) => void store.delete(key),
	clear: () => store.clear(),
	key: () => null,
	length: 0
} as Storage;

beforeEach(() => store.clear());

describe('oauth', () => {
	it('derives the S256 challenge exactly as RFC 7636 Appendix B does', async () => {
		expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
			'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
		);
	});

	it('makes a 43-character verifier from 32 random bytes', async () => {
		const { verifier, challenge } = await pkcePair();
		expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(challenge).toBe(await challengeFor(verifier));
	});

	it('hands the verifier back only for the state it sent, and only once', () => {
		const state = rememberAuthorization('dropbox', 'v', 'https://bewerby.de/cloud/callback');
		expect(takeAuthorization('forged')).toBeNull();
		// A mismatch also consumes the attempt: the real callback cannot follow up.
		expect(takeAuthorization(state)).toBeNull();

		const again = rememberAuthorization('dropbox', 'v2', 'https://bewerby.de/cloud/callback');
		expect(takeAuthorization(again)?.verifier).toBe('v2');
		expect(takeAuthorization(again)).toBeNull();
	});

	it('reads the code from the query or the fragment', () => {
		expect(readCallback(new URL('https://x.de/cloud/callback?code=a&state=s'))).toEqual({
			code: 'a',
			state: 's',
			error: null
		});
		expect(readCallback(new URL('https://x.de/cloud/callback#code=b&state=t')).code).toBe('b');
		expect(readCallback(new URL('https://x.de/cloud/callback?error=access_denied')).error).toBe(
			'access_denied'
		);
	});
});
