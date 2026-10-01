import type { RemoteStore } from '../port.js';
import type { OAuthTarget } from '../state.js';
import { TokenKeeper, tokenRequest, withTokens } from './tokens.js';

/**
 * OneDrive, personal and work or school accounts (#54), scoped to
 * Files.ReadWrite.AppFolder: the token reaches /Apps/<app name> and nothing
 * else. Registered as a single-page app, so the browser redeems the code
 * itself with PKCE and no secret - Microsoft's refresh tokens for SPAs last
 * 24 hours, after which signing in again is a redirect without a password
 * prompt, as long as the Microsoft session is alive.
 *
 * Downloads go through `@microsoft.graph.downloadUrl`, not `/content`:
 * `/content` answers with a redirect, and a redirect is not allowed on a
 * CORS request that needs a preflight (Microsoft Graph docs, "Downloading
 * files in JavaScript apps"). The download URL is pre-authenticated and on
 * a different host - which is why that host is in the CSP.
 */

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const DRIVE = 'https://graph.microsoft.com/v1.0/me/drive';
const SCOPE = 'Files.ReadWrite.AppFolder offline_access';

type Fetch = typeof fetch;
export type OneDriveTarget = OAuthTarget<'onedrive'>;

export function oneDriveAuthorizeUrl(params: {
	clientId: string;
	redirectUri: string;
	challenge: string;
	state: string;
}): string {
	const query = new URLSearchParams({
		client_id: params.clientId,
		response_type: 'code',
		redirect_uri: params.redirectUri,
		// In the fragment, which browsers never send to a server.
		response_mode: 'fragment',
		scope: SCOPE,
		code_challenge: params.challenge,
		code_challenge_method: 'S256',
		state: params.state
	});
	return `${AUTHORITY}/authorize?${query}`;
}

export async function exchangeOneDriveCode(
	params: { clientId: string; code: string; verifier: string; redirectUri: string },
	fetchFn: Fetch = fetch,
	now = Date.now()
): Promise<OneDriveTarget> {
	const tokens = await tokenRequest(
		`${AUTHORITY}/token`,
		{
			client_id: params.clientId,
			grant_type: 'authorization_code',
			code: params.code,
			redirect_uri: params.redirectUri,
			code_verifier: params.verifier,
			scope: SCOPE
		},
		fetchFn
	);
	if (!tokens.refresh_token) throw new Error('Microsoft returned no refresh token.');
	return withTokens<OneDriveTarget>(
		{ kind: 'onedrive', refreshToken: tokens.refresh_token },
		tokens,
		now
	);
}

function encodePath(path: string): string {
	return path.split('/').map(encodeURIComponent).join('/');
}

export class OneDriveStore implements RemoteStore {
	private readonly tokens: TokenKeeper<OneDriveTarget>;

	constructor(
		target: OneDriveTarget,
		clientId: string,
		onTarget: (target: OneDriveTarget) => Promise<void>,
		private readonly fetchFn: Fetch = fetch.bind(globalThis),
		now: () => number = Date.now
	) {
		this.tokens = new TokenKeeper(
			target,
			(refreshToken) =>
				tokenRequest(
					`${AUTHORITY}/token`,
					{
						client_id: clientId,
						grant_type: 'refresh_token',
						refresh_token: refreshToken,
						scope: SCOPE
					},
					fetchFn
				),
			onTarget,
			now
		);
	}

	private call(url: string, init: RequestInit = {}): Promise<Response> {
		return this.tokens.fetch(this.fetchFn, url, init);
	}

	private item(path: string): string {
		return `${DRIVE}/special/approot:/${encodePath(path)}`;
	}

	async list(): Promise<string[]> {
		type Page = {
			value: Array<{ id: string; name: string; folder?: unknown; file?: unknown }>;
			'@odata.nextLink'?: string;
		};
		const out: string[] = [];
		const walk = async (first: string, prefix: string) => {
			let next: string | undefined = first;
			while (next) {
				const response = await this.call(next);
				// The app folder is created on first use; until then there is nothing.
				if (response.status === 404) return;
				if (!response.ok) throw new Error(`OneDrive list failed: ${response.status}`);
				const page = (await response.json()) as Page;
				for (const child of page.value) {
					if (child.folder) {
						await walk(
							`${DRIVE}/items/${child.id}/children?$select=id,name,folder,file&$top=200`,
							`${prefix}${child.name}/`
						);
					} else if (child.file) {
						out.push(`${prefix}${child.name}`);
					}
				}
				next = page['@odata.nextLink'];
			}
		};
		await walk(`${DRIVE}/special/approot/children?$select=id,name,folder,file&$top=200`, '');
		return out;
	}

	async read(path: string): Promise<Uint8Array> {
		const meta = await this.call(`${this.item(path)}?$select=id,@microsoft.graph.downloadUrl`);
		if (!meta.ok) throw new Error(`OneDrive metadata failed: ${meta.status}`);
		const url = ((await meta.json()) as Record<string, unknown>)['@microsoft.graph.downloadUrl'];
		if (typeof url !== 'string') throw new Error('OneDrive returned no download URL.');
		// Pre-authenticated: no Authorization header, which also keeps the
		// token away from the download host.
		const response = await this.fetchFn(url);
		if (!response.ok) throw new Error(`OneDrive download failed: ${response.status}`);
		return new Uint8Array(await response.arrayBuffer());
	}

	async write(path: string, bytes: Uint8Array): Promise<void> {
		// Simple upload; Microsoft allows up to 250 MB this way.
		const response = await this.call(`${this.item(path)}:/content`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/octet-stream' },
			body: new Uint8Array(bytes)
		});
		if (!response.ok) throw new Error(`OneDrive upload failed: ${response.status}`);
	}

	async remove(path: string): Promise<void> {
		const response = await this.call(this.item(path), { method: 'DELETE' });
		if (!response.ok && response.status !== 404) {
			throw new Error(`OneDrive delete failed: ${response.status}`);
		}
	}
}
