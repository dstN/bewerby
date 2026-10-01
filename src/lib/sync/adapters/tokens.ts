import { ReconnectRequiredError } from '../port.js';

/**
 * Access-token upkeep shared by the OAuth adapters (#53, #54): refresh a
 * minute before expiry, keep a rotated refresh token (Microsoft rotates on
 * every refresh, Dropbox and Google keep theirs), persist the result, and
 * retry a request once with a fresh token when the provider answers 401.
 */

export interface TokenTarget {
	refreshToken: string;
	accessToken?: string;
	/** Epoch ms after which the access token is stale. */
	expiresAt?: number;
}

export interface TokenResponse {
	access_token: string;
	expires_in?: number;
	refresh_token?: string;
}

/** The target after a token response; a missing refresh token keeps the old one. */
export function withTokens<T extends TokenTarget>(
	target: T,
	tokens: TokenResponse,
	now: number
): T {
	return {
		...target,
		accessToken: tokens.access_token,
		refreshToken: tokens.refresh_token ?? target.refreshToken,
		expiresAt: now + (tokens.expires_in ?? 3600) * 1000
	};
}

/** POSTs a form to a token endpoint; a refused grant means signing in again. */
export async function tokenRequest(
	url: string,
	body: Record<string, string>,
	fetchFn: typeof fetch
): Promise<TokenResponse> {
	const response = await fetchFn(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(body)
	});
	if (response.status === 400 || response.status === 401) throw new ReconnectRequiredError();
	if (!response.ok) throw new Error(`Token request failed: ${response.status}`);
	return (await response.json()) as TokenResponse;
}

export class TokenKeeper<T extends TokenTarget> {
	constructor(
		private target: T,
		private readonly refresh: (refreshToken: string) => Promise<TokenResponse>,
		private readonly persist: (target: T) => Promise<void>,
		private readonly now: () => number = Date.now
	) {}

	async token(force = false): Promise<string> {
		const fresh =
			!force && this.target.accessToken && (this.target.expiresAt ?? 0) - 60_000 > this.now();
		if (fresh) return this.target.accessToken!;
		this.target = withTokens(this.target, await this.refresh(this.target.refreshToken), this.now());
		await this.persist(this.target);
		return this.target.accessToken!;
	}

	/** One request with the bearer token, retried once with a refreshed one on a 401. */
	async fetch(fetchFn: typeof fetch, url: string, init: RequestInit = {}): Promise<Response> {
		for (const force of [false, true]) {
			const response = await fetchFn(url, {
				...init,
				headers: { ...init.headers, Authorization: `Bearer ${await this.token(force)}` }
			});
			if (response.status !== 401) return response;
		}
		throw new ReconnectRequiredError();
	}
}
