import { describe, it, expect } from 'vitest';
import { ReconnectRequiredError } from '../port.js';
import {
	GoogleDriveStore,
	exchangeGoogleCode,
	googleAuthorizeUrl,
	type GoogleTarget
} from './gdrive.js';
import {
	OneDriveStore,
	exchangeOneDriveCode,
	oneDriveAuthorizeUrl,
	type OneDriveTarget
} from './onedrive.js';

type Call = { url: string; init: RequestInit };

function fakeFetch(answers: Array<(call: Call) => Response>) {
	const calls: Call[] = [];
	const fetchFn = (async (url: string, init: RequestInit = {}) => {
		const call = { url, init };
		calls.push(call);
		const answer = answers.shift();
		if (!answer) throw new Error(`unexpected request to ${url}`);
		return answer(call);
	}) as unknown as typeof fetch;
	return { calls, fetchFn };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...headers }
	});
const auth = (call: Call) =>
	(call.init.headers as Record<string, string> | undefined)?.Authorization;

describe('onedrive', () => {
	const target: OneDriveTarget = {
		kind: 'onedrive',
		refreshToken: 'r1',
		accessToken: 'a1',
		expiresAt: 1e12
	};

	it('signs in as a single-page app: PKCE, code in the fragment, app folder only', () => {
		const url = new URL(
			oneDriveAuthorizeUrl({
				clientId: 'app',
				redirectUri: 'https://bewerby.de/cloud/callback',
				challenge: 'c',
				state: 's'
			})
		);
		expect(url.origin + url.pathname).toBe(
			'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
		);
		expect(url.searchParams.get('response_mode')).toBe('fragment');
		expect(url.searchParams.get('scope')).toBe('Files.ReadWrite.AppFolder offline_access');
		expect(url.searchParams.get('code_challenge_method')).toBe('S256');
	});

	it('redeems the code without a secret and keeps the rotated refresh token', async () => {
		const { calls, fetchFn } = fakeFetch([
			() => json({ access_token: 'a', refresh_token: 'r', expires_in: 3600 })
		]);
		const result = await exchangeOneDriveCode(
			{
				clientId: 'app',
				code: 'c',
				verifier: 'v',
				redirectUri: 'https://bewerby.de/cloud/callback'
			},
			fetchFn,
			0
		);
		expect(result).toMatchObject({ kind: 'onedrive', refreshToken: 'r', accessToken: 'a' });
		expect(new URLSearchParams(calls[0].init.body as URLSearchParams).has('client_secret')).toBe(
			false
		);

		const persisted: OneDriveTarget[] = [];
		const refresh = fakeFetch([
			() => json({ access_token: 'a2', refresh_token: 'r2', expires_in: 3600 }),
			() => json({ value: [] })
		]);
		const store = new OneDriveStore(
			{ ...target, expiresAt: 0 },
			'app',
			async (next) => void persisted.push(next),
			refresh.fetchFn,
			() => 1000
		);
		await store.list();
		expect(persisted[0]).toMatchObject({ refreshToken: 'r2', accessToken: 'a2' });
	});

	it('walks the app folder recursively, following paging', async () => {
		const { calls, fetchFn } = fakeFetch([
			() =>
				json({
					value: [
						{ id: 'f1', name: 'upd', folder: {} },
						{ id: 'x', name: 'loose.bwv', file: {} }
					],
					'@odata.nextLink': 'https://graph.microsoft.com/next'
				}),
			() => json({ value: [{ id: 'f2', name: 'dev', folder: {} }] }),
			() => json({ value: [{ id: 'y', name: '1.bwv', file: {} }] }),
			() => json({ value: [{ id: 'z', name: 'snap', folder: {} }] }),
			() => json({ value: [] })
		]);
		const store = new OneDriveStore(
			target,
			'app',
			async () => {},
			fetchFn,
			() => 0
		);
		expect(await store.list()).toEqual(['upd/dev/1.bwv', 'loose.bwv']);
		expect(calls[0].url).toContain('/me/drive/special/approot/children');
		expect(calls[3].url).toBe('https://graph.microsoft.com/next');
	});

	it('downloads through the pre-authenticated URL, without the token', async () => {
		const { calls, fetchFn } = fakeFetch([
			() => json({ id: 'y', '@microsoft.graph.downloadUrl': 'https://abc.files.1drv.com/y' }),
			() => new Response(new Uint8Array([9]))
		]);
		const store = new OneDriveStore(
			target,
			'app',
			async () => {},
			fetchFn,
			() => 0
		);
		expect([...(await store.read('upd/dev/1.bwv'))]).toEqual([9]);
		expect(calls[0].url).toBe(
			'https://graph.microsoft.com/v1.0/me/drive/special/approot:/upd/dev/1.bwv?$select=id,@microsoft.graph.downloadUrl'
		);
		expect(auth(calls[1])).toBeUndefined();
	});

	it('uploads by path and deletes without minding a file already gone', async () => {
		const { calls, fetchFn } = fakeFetch([
			() => json({ id: 'n' }, 201),
			() => new Response(null, { status: 404 })
		]);
		const store = new OneDriveStore(
			target,
			'app',
			async () => {},
			fetchFn,
			() => 0
		);
		await store.write('blob/b.bwv', new Uint8Array([1]));
		await store.remove('blob/b.bwv');
		expect(calls[0].url).toBe(
			'https://graph.microsoft.com/v1.0/me/drive/special/approot:/blob/b.bwv:/content'
		);
		expect(calls[0].init.method).toBe('PUT');
		expect(calls[1].init.method).toBe('DELETE');
	});
});

describe('google drive', () => {
	const target: GoogleTarget = {
		kind: 'google',
		refreshToken: 'r1',
		accessToken: 'a1',
		expiresAt: 1e12
	};

	it('asks for the appdata scope, a refresh token every time, and PKCE', () => {
		const url = new URL(
			googleAuthorizeUrl({
				clientId: 'app',
				redirectUri: 'https://bewerby.de/cloud/callback',
				challenge: 'c',
				state: 's'
			})
		);
		expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.appdata');
		expect(url.searchParams.get('access_type')).toBe('offline');
		expect(url.searchParams.get('prompt')).toBe('consent');
		expect(url.searchParams.get('code_challenge_method')).toBe('S256');
	});

	it('redeems the code through the broker, never holding a secret', async () => {
		const { calls, fetchFn } = fakeFetch([
			() => json({ access_token: 'a', refresh_token: 'r', expires_in: 3599 })
		]);
		const result = await exchangeGoogleCode(
			{ code: 'c', verifier: 'v', redirectUri: 'https://bewerby.de/cloud/callback' },
			fetchFn,
			0
		);
		expect(result).toMatchObject({ kind: 'google', refreshToken: 'r' });
		expect(calls[0].url).toBe('/api/oauth/google');
		expect(JSON.parse(calls[0].init.body as string)).toEqual({
			grant_type: 'authorization_code',
			code: 'c',
			code_verifier: 'v',
			redirect_uri: 'https://bewerby.de/cloud/callback'
		});
	});

	it('maps a refused refresh at the broker to a reconnect', async () => {
		const { fetchFn } = fakeFetch([() => json({ error: 'token' }, 400)]);
		const store = new GoogleDriveStore(
			{ ...target, expiresAt: 0 },
			async () => {},
			fetchFn,
			() => 1000
		);
		await expect(store.list()).rejects.toBeInstanceOf(ReconnectRequiredError);
	});

	it('lists the hidden folder by name, pages included, and reads by the listed id', async () => {
		const { calls, fetchFn } = fakeFetch([
			() => json({ files: [{ id: 'i1', name: 'upd/d/1.bwv' }], nextPageToken: 'p2' }),
			() => json({ files: [{ id: 'i2', name: 'blob/b.bwv' }] }),
			() => new Response(new Uint8Array([5]))
		]);
		const store = new GoogleDriveStore(
			target,
			async () => {},
			fetchFn,
			() => 0
		);
		expect(await store.list()).toEqual(['upd/d/1.bwv', 'blob/b.bwv']);
		expect(new URL(calls[0].url).searchParams.get('spaces')).toBe('appDataFolder');
		expect(new URL(calls[1].url).searchParams.get('pageToken')).toBe('p2');
		expect([...(await store.read('blob/b.bwv'))]).toEqual([5]);
		expect(calls[2].url).toBe('https://www.googleapis.com/drive/v3/files/i2?alt=media');
	});

	it('uploads small files as one multipart request into appDataFolder', async () => {
		const { calls, fetchFn } = fakeFetch([() => json({ id: 'n1' })]);
		const store = new GoogleDriveStore(
			target,
			async () => {},
			fetchFn,
			() => 0
		);
		await store.write('upd/d/2.bwv', new Uint8Array([1, 2, 3]));
		expect(calls[0].url).toBe(
			'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id'
		);
		const type = (calls[0].init.headers as Record<string, string>)['Content-Type'];
		expect(type).toMatch(/^multipart\/related; boundary=/);
		const body = await new Response(calls[0].init.body as Blob).text();
		expect(body).toContain('{"name":"upd/d/2.bwv","parents":["appDataFolder"]}');
	});

	it('uploads large files through a resumable session', async () => {
		const { calls, fetchFn } = fakeFetch([
			() => json({}, 200, { Location: 'https://www.googleapis.com/upload/session/1' }),
			() => json({ id: 'big' })
		]);
		const store = new GoogleDriveStore(
			target,
			async () => {},
			fetchFn,
			() => 0
		);
		await store.write('blob/big.bwv', new Uint8Array(6 * 1024 * 1024));
		expect(calls[0].url).toContain('uploadType=resumable');
		expect(calls[1].url).toBe('https://www.googleapis.com/upload/session/1');
		expect(calls[1].init.method).toBe('PUT');
	});

	it('looks a file up by name when it was not in the last listing, and escapes the query', async () => {
		const { calls, fetchFn } = fakeFetch([() => json({ files: [] })]);
		const store = new GoogleDriveStore(
			target,
			async () => {},
			fetchFn,
			() => 0
		);
		await store.remove("odd'name.bwv");
		expect(new URL(calls[0].url).searchParams.get('q')).toBe("name = 'odd\\'name.bwv'");
	});
});
