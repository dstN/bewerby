/**
 * OAuth 2.0 authorization code flow with PKCE (RFC 7636), done entirely in
 * the browser: no client secret, no server in between (#53). The verifier
 * and the state wait in sessionStorage while the user is at the provider,
 * and are taken out - read and removed - when they come back to
 * /cloud/callback.
 */

export type Provider = 'dropbox';

export interface PendingAuthorization {
	provider: Provider;
	state: string;
	verifier: string;
	redirectUri: string;
}

const STORAGE_KEY = 'bewerby-oauth';

export function base64url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function challengeFor(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	return base64url(new Uint8Array(digest));
}

/** A fresh verifier (32 random bytes, 43 characters) and its S256 challenge. */
export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
	const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
	return { verifier, challenge: await challengeFor(verifier) };
}

export function redirectUri(): string {
	return `${location.origin}/cloud/callback`;
}

/** Remembers the attempt for the callback and returns the `state` to send along. */
export function rememberAuthorization(provider: Provider, verifier: string, uri: string): string {
	const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
	const pending: PendingAuthorization = { provider, state, verifier, redirectUri: uri };
	sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
	return state;
}

/**
 * The attempt the callback belongs to, removed so it cannot be replayed.
 * Null unless the returned state matches the one sent - a callback this tab
 * did not start (CSRF) is ignored.
 */
export function takeAuthorization(state: string | null): PendingAuthorization | null {
	const raw = sessionStorage.getItem(STORAGE_KEY);
	sessionStorage.removeItem(STORAGE_KEY);
	if (!raw || !state) return null;
	try {
		const pending = JSON.parse(raw) as PendingAuthorization;
		return pending.state === state ? pending : null;
	} catch {
		return null;
	}
}

/** Code, state and error from either the query (Dropbox) or the fragment. */
export function readCallback(url: URL): {
	code: string | null;
	state: string | null;
	error: string | null;
} {
	const params = new URLSearchParams(url.search);
	for (const [key, value] of new URLSearchParams(url.hash.replace(/^#/, ''))) {
		if (!params.has(key)) params.set(key, value);
	}
	return { code: params.get('code'), state: params.get('state'), error: params.get('error') };
}
