import { describe, it, expect } from 'vitest';
import { ReconnectRequiredError } from '../port.js';
import {
	DropboxStore,
	dropboxAuthorizeUrl,
	exchangeDropboxCode,
	type DropboxTarget
} from './dropbox.js';

type Call = { url: string; init: RequestInit };

/** A fake Dropbox: records every request, answers from a script. */
function fakeFetch(answers: Array<(call: Call) => Response>) {
	const calls: Call[] = [];
	const fetchFn = (async (url: string, init: RequestInit) => {
		const call = { url, init };
		calls.push(call);
		const answer = answers.shift();
		if (!answer) throw new Error(`unexpected request to ${url}`);
		return answer(call);
	}) as unknown as typeof fetch;
	return { calls, fetchFn };
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const target: DropboxTarget = {
	kind: 'dropbox',
	refreshToken: 'refresh-1',
	accessToken: 'access-1',
	expiresAt: 10_000_000
};

function header(call: Call, name: string): string | undefined {
	return (call.init.headers as Record<string, string>)[name];
}

describe('dropbox', () => {
	it('asks for PKCE, an offline token and nothing that needs a secret', () => {
		const url = new URL(
			dropboxAuthorizeUrl({
				clientId: 'app',
				redirectUri: 'https://bewerby.de/cloud/callback',
				challenge: 'c',
				state: 's'
			})
		);
		expect(url.origin + url.pathname).toBe('https://www.dropbox.com/oauth2/authorize');
		expect(Object.fromEntries(url.searchParams)).toEqual({
			client_id: 'app',
			response_type: 'code',
			code_challenge: 'c',
			code_challenge_method: 'S256',
			token_access_type: 'offline',
			redirect_uri: 'https://bewerby.de/cloud/callback',
			state: 's'
		});
	});

	it('exchanges the code with the verifier and no client secret', async () => {
		const { calls, fetchFn } = fakeFetch([
			() => json({ access_token: 'a', refresh_token: 'r', expires_in: 14400 })
		]);
		const result = await exchangeDropboxCode(
			{
				clientId: 'app',
				code: 'code',
				verifier: 'ver',
				redirectUri: 'https://bewerby.de/cloud/callback'
			},
			fetchFn,
			1000
		);
		expect(result).toEqual({
			kind: 'dropbox',
			refreshToken: 'r',
			accessToken: 'a',
			expiresAt: 1000 + 14_400_000
		});
		const body = new URLSearchParams(calls[0].init.body as URLSearchParams);
		expect(body.get('code_verifier')).toBe('ver');
		expect(body.has('client_secret')).toBe(false);
	});

	it('lists every page of the app folder, files only', async () => {
		const { calls, fetchFn } = fakeFetch([
			() =>
				json({
					entries: [
						{ '.tag': 'folder', path_lower: '/upd' },
						{ '.tag': 'file', path_lower: '/upd/d/1.bwv' }
					],
					cursor: 'c1',
					has_more: true
				}),
			() =>
				json({
					entries: [{ '.tag': 'file', path_lower: '/blob/x.bwv' }],
					cursor: 'c2',
					has_more: false
				})
		]);
		const store = new DropboxStore(
			target,
			'app',
			async () => {},
			fetchFn,
			() => 0
		);
		expect(await store.list()).toEqual(['upd/d/1.bwv', 'blob/x.bwv']);
		expect(JSON.parse(calls[0].init.body as string)).toEqual({ path: '', recursive: true });
		expect(header(calls[1], 'Authorization')).toBe('Bearer access-1');
	});

	it('treats a missing app folder as empty', async () => {
		const { fetchFn } = fakeFetch([() => json({ error_summary: 'path/not_found/' }, 409)]);
		const store = new DropboxStore(
			target,
			'app',
			async () => {},
			fetchFn,
			() => 0
		);
		expect(await store.list()).toEqual([]);
	});

	it('uploads with the path in the Dropbox-API-Arg header, ASCII only', async () => {
		const { calls, fetchFn } = fakeFetch([() => json({})]);
		const store = new DropboxStore(
			target,
			'app',
			async () => {},
			fetchFn,
			() => 0
		);
		await store.write('upd/d/ä.bwv', new Uint8Array([1, 2]));
		expect(calls[0].url).toBe('https://content.dropboxapi.com/2/files/upload');
		const arg = header(calls[0], 'Dropbox-API-Arg')!;
		expect(arg).toMatch(/^[\x20-\x7e]+$/);
		expect(JSON.parse(arg)).toEqual({ path: '/upd/d/ä.bwv', mode: 'overwrite', mute: true });
	});

	it('refreshes an expired token first and persists the new one', async () => {
		const persisted: DropboxTarget[] = [];
		const { calls, fetchFn } = fakeFetch([
			() => json({ access_token: 'access-2', expires_in: 14400 }),
			() => new Response(new Uint8Array([7]))
		]);
		const store = new DropboxStore(
			{ ...target, expiresAt: 0 },
			'app',
			async (next) => void persisted.push(next),
			fetchFn,
			() => 5000
		);
		expect([...(await store.read('blob/x.bwv'))]).toEqual([7]);
		expect(calls[0].url).toBe('https://api.dropboxapi.com/oauth2/token');
		expect(new URLSearchParams(calls[0].init.body as URLSearchParams).get('grant_type')).toBe(
			'refresh_token'
		);
		expect(header(calls[1], 'Authorization')).toBe('Bearer access-2');
		expect(persisted[0]).toMatchObject({ refreshToken: 'refresh-1', accessToken: 'access-2' });
	});

	it('retries once with a fresh token on a 401, then asks for a new sign-in', async () => {
		const { fetchFn } = fakeFetch([
			() => new Response(null, { status: 401 }),
			() => json({ access_token: 'access-2', expires_in: 14400 }),
			() => new Response(null, { status: 401 })
		]);
		const store = new DropboxStore(
			target,
			'app',
			async () => {},
			fetchFn,
			() => 0
		);
		await expect(store.read('blob/x.bwv')).rejects.toBeInstanceOf(ReconnectRequiredError);
	});

	it('maps a refused refresh token to a reconnect', async () => {
		const { fetchFn } = fakeFetch([() => json({ error: 'invalid_grant' }, 400)]);
		const store = new DropboxStore(
			{ ...target, expiresAt: 0 },
			'app',
			async () => {},
			fetchFn,
			() => 5000
		);
		await expect(store.list()).rejects.toBeInstanceOf(ReconnectRequiredError);
	});
});
