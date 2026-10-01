import { ReconnectRequiredError, type RemoteStore } from '../port.js';
import type { TargetConfig } from '../state.js';

/**
 * Dropbox, scoped to its "App folder" access type: the token can reach
 * /Apps/<app name> and nothing else in the account (#53). The browser talks
 * to Dropbox directly - PKCE needs no client secret, so bewerby.de is not
 * involved at all. Endpoints as used by the official dropbox-sdk-js.
 */

const AUTHORIZE = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN = 'https://api.dropboxapi.com/oauth2/token';
const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

type Fetch = typeof fetch;
export type DropboxTarget = Extract<TargetConfig, { kind: 'dropbox' }>;

export function dropboxAuthorizeUrl(params: {
	clientId: string;
	redirectUri: string;
	challenge: string;
	state: string;
}): string {
	const query = new URLSearchParams({
		client_id: params.clientId,
		response_type: 'code',
		code_challenge: params.challenge,
		code_challenge_method: 'S256',
		// offline: a refresh token, so syncing does not need a sign-in every hour.
		token_access_type: 'offline',
		redirect_uri: params.redirectUri,
		state: params.state
	});
	return `${AUTHORIZE}?${query}`;
}

interface TokenResponse {
	access_token: string;
	expires_in?: number;
	refresh_token?: string;
}

async function tokenRequest(body: Record<string, string>, fetchFn: Fetch): Promise<TokenResponse> {
	const response = await fetchFn(TOKEN, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(body)
	});
	if (response.status === 400 || response.status === 401) throw new ReconnectRequiredError();
	if (!response.ok) throw new Error(`Dropbox token request failed: ${response.status}`);
	return (await response.json()) as TokenResponse;
}

function toTarget(tokens: TokenResponse, refreshToken: string, now: number): DropboxTarget {
	return {
		kind: 'dropbox',
		refreshToken,
		accessToken: tokens.access_token,
		expiresAt: now + (tokens.expires_in ?? 3600) * 1000
	};
}

export async function exchangeDropboxCode(
	params: { clientId: string; code: string; verifier: string; redirectUri: string },
	fetchFn: Fetch = fetch,
	now = Date.now()
): Promise<DropboxTarget> {
	const tokens = await tokenRequest(
		{
			grant_type: 'authorization_code',
			code: params.code,
			client_id: params.clientId,
			code_verifier: params.verifier,
			redirect_uri: params.redirectUri
		},
		fetchFn
	);
	if (!tokens.refresh_token) throw new Error('Dropbox returned no refresh token.');
	return toTarget(tokens, tokens.refresh_token, now);
}

/**
 * The Dropbox-API-Arg header carries JSON, and headers must be ASCII: the
 * official SDK escapes everything else the same way.
 */
function headerJson(value: unknown): string {
	return JSON.stringify(value).replace(
		/[\u007f-￿]/g,
		(char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`
	);
}

export class DropboxStore implements RemoteStore {
	constructor(
		private target: DropboxTarget,
		private readonly clientId: string,
		/** Persists refreshed tokens. */
		private readonly onTarget: (target: DropboxTarget) => Promise<void>,
		private readonly fetchFn: Fetch = fetch.bind(globalThis),
		private readonly now: () => number = Date.now
	) {}

	private async accessToken(force = false): Promise<string> {
		const fresh =
			!force && this.target.accessToken && (this.target.expiresAt ?? 0) - 60_000 > this.now();
		if (fresh) return this.target.accessToken!;
		const tokens = await tokenRequest(
			{
				grant_type: 'refresh_token',
				refresh_token: this.target.refreshToken,
				client_id: this.clientId
			},
			this.fetchFn
		);
		this.target = toTarget(tokens, this.target.refreshToken, this.now());
		await this.onTarget(this.target);
		return this.target.accessToken!;
	}

	/** One request, retried once with a refreshed token on a 401. */
	private async call(url: string, init: RequestInit): Promise<Response> {
		for (const force of [false, true]) {
			const response = await this.fetchFn(url, {
				...init,
				headers: { ...init.headers, Authorization: `Bearer ${await this.accessToken(force)}` }
			});
			if (response.status !== 401) return response;
		}
		throw new ReconnectRequiredError();
	}

	private async rpc<T>(route: string, args: unknown): Promise<T> {
		const response = await this.call(`${API}/${route}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(args)
		});
		if (!response.ok) throw new Error(`Dropbox ${route} failed: ${response.status}`);
		return (await response.json()) as T;
	}

	async list(): Promise<string[]> {
		type Page = {
			entries: Array<{ '.tag': string; path_lower?: string }>;
			cursor: string;
			has_more: boolean;
		};
		const out: string[] = [];
		const first = await this.call(`${API}/files/list_folder`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ path: '', recursive: true })
		});
		// 409 path/not_found: the app folder does not exist until the first write.
		if (first.status === 409) return out;
		if (!first.ok) throw new Error(`Dropbox files/list_folder failed: ${first.status}`);
		let page = (await first.json()) as Page;
		for (;;) {
			for (const entry of page.entries) {
				if (entry['.tag'] === 'file' && entry.path_lower) out.push(entry.path_lower.slice(1));
			}
			if (!page.has_more) return out;
			page = await this.rpc<Page>('files/list_folder/continue', { cursor: page.cursor });
		}
	}

	async read(path: string): Promise<Uint8Array> {
		const response = await this.call(`${CONTENT}/files/download`, {
			method: 'POST',
			headers: { 'Dropbox-API-Arg': headerJson({ path: `/${path}` }) }
		});
		if (!response.ok) throw new Error(`Dropbox download failed: ${response.status}`);
		return new Uint8Array(await response.arrayBuffer());
	}

	async write(path: string, bytes: Uint8Array): Promise<void> {
		const response = await this.call(`${CONTENT}/files/upload`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/octet-stream',
				'Dropbox-API-Arg': headerJson({ path: `/${path}`, mode: 'overwrite', mute: true })
			},
			body: new Uint8Array(bytes)
		});
		if (!response.ok) throw new Error(`Dropbox upload failed: ${response.status}`);
	}

	async remove(path: string): Promise<void> {
		const response = await this.call(`${API}/files/delete_v2`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ path: `/${path}` })
		});
		// 409: path/not_found - already gone, which is what was wanted.
		if (!response.ok && response.status !== 409) {
			throw new Error(`Dropbox delete failed: ${response.status}`);
		}
	}

	/** Invalidates the token at Dropbox when the user disconnects. */
	async revoke(): Promise<void> {
		await this.call(`${API}/auth/token/revoke`, { method: 'POST' });
	}
}
