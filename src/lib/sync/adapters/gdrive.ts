import { ReconnectRequiredError, type RemoteStore } from '../port.js';
import type { OAuthTarget } from '../state.js';
import { TokenKeeper, withTokens, type TokenResponse } from './tokens.js';

/**
 * Google Drive, scoped to drive.appdata: a hidden folder only this app can
 * see, not the user's Drive (#54). Google does not let a web client redeem
 * or refresh a code without its client secret, so those two calls go
 * through bewerby.de's token broker (/api/oauth/google); every file request
 * goes from the browser straight to Google.
 *
 * Drive addresses files by id, not by path. Names here are the engine's
 * paths ("upd/<device>/<n>.bwv") kept verbatim, and the ids come from the
 * last listing.
 */

const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const BROKER = '/api/oauth/google';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
/** Google's limit for a single multipart upload; larger files go resumable. */
const MULTIPART_LIMIT = 5 * 1024 * 1024;

type Fetch = typeof fetch;
export type GoogleTarget = OAuthTarget<'google'>;

export function googleAuthorizeUrl(params: {
	clientId: string;
	redirectUri: string;
	challenge: string;
	state: string;
}): string {
	const query = new URLSearchParams({
		client_id: params.clientId,
		redirect_uri: params.redirectUri,
		response_type: 'code',
		scope: SCOPE,
		// A refresh token, and every time: Google sends one only on the first
		// consent otherwise, and a reconnect would come back without it.
		access_type: 'offline',
		prompt: 'consent',
		code_challenge: params.challenge,
		code_challenge_method: 'S256',
		state: params.state
	});
	return `${AUTHORIZE}?${query}`;
}

async function broker(body: Record<string, string>, fetchFn: Fetch): Promise<Response> {
	const response = await fetchFn(BROKER, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (response.status === 400) throw new ReconnectRequiredError();
	if (!response.ok) throw new Error(`Token broker failed: ${response.status}`);
	return response;
}

export async function exchangeGoogleCode(
	params: { code: string; verifier: string; redirectUri: string },
	fetchFn: Fetch = fetch,
	now = Date.now()
): Promise<GoogleTarget> {
	const response = await broker(
		{
			grant_type: 'authorization_code',
			code: params.code,
			code_verifier: params.verifier,
			redirect_uri: params.redirectUri
		},
		fetchFn
	);
	const tokens = (await response.json()) as TokenResponse;
	if (!tokens.refresh_token) throw new Error('Google returned no refresh token.');
	return withTokens<GoogleTarget>(
		{ kind: 'google', refreshToken: tokens.refresh_token },
		tokens,
		now
	);
}

function escapeQuery(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export class GoogleDriveStore implements RemoteStore {
	private readonly tokens: TokenKeeper<GoogleTarget>;
	private ids = new Map<string, string>();

	constructor(
		private target: GoogleTarget,
		onTarget: (target: GoogleTarget) => Promise<void>,
		private readonly fetchFn: Fetch = fetch.bind(globalThis),
		now: () => number = Date.now
	) {
		this.tokens = new TokenKeeper(
			target,
			async (refreshToken) =>
				(await (
					await broker({ grant_type: 'refresh_token', refresh_token: refreshToken }, fetchFn)
				).json()) as TokenResponse,
			async (next) => {
				this.target = next;
				await onTarget(next);
			},
			now
		);
	}

	private call(url: string, init: RequestInit = {}): Promise<Response> {
		return this.tokens.fetch(this.fetchFn, url, init);
	}

	async list(): Promise<string[]> {
		const ids = new Map<string, string>();
		let pageToken: string | undefined;
		do {
			const query = new URLSearchParams({
				spaces: 'appDataFolder',
				fields: 'nextPageToken,files(id,name)',
				pageSize: '1000'
			});
			if (pageToken) query.set('pageToken', pageToken);
			const response = await this.call(`${FILES}?${query}`);
			if (!response.ok) throw new Error(`Google Drive list failed: ${response.status}`);
			const page = (await response.json()) as {
				files: Array<{ id: string; name: string }>;
				nextPageToken?: string;
			};
			for (const file of page.files) ids.set(file.name, file.id);
			pageToken = page.nextPageToken;
		} while (pageToken);
		this.ids = ids;
		return [...ids.keys()];
	}

	private async idFor(path: string): Promise<string | undefined> {
		const known = this.ids.get(path);
		if (known) return known;
		const query = new URLSearchParams({
			spaces: 'appDataFolder',
			q: `name = '${escapeQuery(path)}'`,
			fields: 'files(id)'
		});
		const response = await this.call(`${FILES}?${query}`);
		if (!response.ok) throw new Error(`Google Drive lookup failed: ${response.status}`);
		const id = ((await response.json()) as { files: Array<{ id: string }> }).files[0]?.id;
		if (id) this.ids.set(path, id);
		return id;
	}

	async read(path: string): Promise<Uint8Array> {
		const id = await this.idFor(path);
		if (!id) throw new Error(`No such file: ${path}`);
		const response = await this.call(`${FILES}/${id}?alt=media`);
		if (!response.ok) throw new Error(`Google Drive download failed: ${response.status}`);
		return new Uint8Array(await response.arrayBuffer());
	}

	async write(path: string, bytes: Uint8Array): Promise<void> {
		const metadata = JSON.stringify({ name: path, parents: ['appDataFolder'] });
		let response: Response;
		if (bytes.length <= MULTIPART_LIMIT) {
			const boundary = `bewerby-${crypto.randomUUID()}`;
			const body = new Blob([
				`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
				`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
				new Uint8Array(bytes),
				`\r\n--${boundary}--`
			]);
			response = await this.call(`${UPLOAD}?uploadType=multipart&fields=id`, {
				method: 'POST',
				headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
				body
			});
		} else {
			const session = await this.call(`${UPLOAD}?uploadType=resumable&fields=id`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json; charset=UTF-8',
					'X-Upload-Content-Type': 'application/octet-stream'
				},
				body: metadata
			});
			const location = session.headers.get('Location');
			if (!session.ok || !location)
				throw new Error(`Google Drive upload failed: ${session.status}`);
			response = await this.call(location, { method: 'PUT', body: new Uint8Array(bytes) });
		}
		if (!response.ok) throw new Error(`Google Drive upload failed: ${response.status}`);
		const { id } = (await response.json()) as { id: string };
		this.ids.set(path, id);
	}

	async remove(path: string): Promise<void> {
		const id = await this.idFor(path);
		if (!id) return;
		// Files in appDataFolder cannot be trashed, only deleted for good.
		const response = await this.call(`${FILES}/${id}`, { method: 'DELETE' });
		if (!response.ok && response.status !== 404) {
			throw new Error(`Google Drive delete failed: ${response.status}`);
		}
		this.ids.delete(path);
	}

	/** Revokes the grant at Google when the user disconnects (through the broker). */
	async revoke(): Promise<void> {
		await broker({ grant_type: 'revoke', token: this.target.refreshToken }, this.fetchFn);
	}
}
