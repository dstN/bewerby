import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { clientAddress, createRateLimiter } from '$lib/server/requests.js';
import type { RequestHandler } from './$types';

/**
 * Token broker for Google Drive (#54). Google does not let a web client
 * exchange or refresh a code without its client secret, so the browser
 * sends the grant here and this endpoint adds the secret.
 *
 * What passes through: the one-time code with its PKCE verifier, or a
 * refresh token; on the way back, the access token. Nothing is stored,
 * cached or logged. The tokens only reach the app's hidden appDataFolder,
 * which holds nothing but ciphertext. The body is POSTed, so Apache's access
 * log records that the endpoint was used, never a token.
 *
 * Fixed upstream URLs, so no SSRF surface; Origin checked, body capped,
 * throttled per IP like /api/fetch-ad.
 */
export const prerender = false;

const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
const MAX_BODY = 4096;
const NO_STORE = { 'Cache-Control': 'no-store' };

// An access token lives an hour, so a device refreshes about once an hour;
// 60 per hour and IP leaves room for a household of devices.
const rateLimited = createRateLimiter(60 * 60 * 1000, 60);

function refuse(status: number) {
	return json({ error: 'token' }, { status, headers: NO_STORE });
}

const isText = (value: unknown, max: number): value is string =>
	typeof value === 'string' && value.length > 0 && value.length <= max;

/** This app's /cloud/callback - by host, for the same reason as the Origin check. */
function isOwnCallback(value: unknown, url: URL): value is string {
	if (typeof value !== 'string') return false;
	try {
		const candidate = new URL(value);
		return (
			candidate.host === url.host && candidate.pathname === '/cloud/callback' && !candidate.search
		);
	} catch {
		return false;
	}
}

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	// Only the app's own pages. A cross-site page could fire this request
	// but never read the answer (no CORS headers); this keeps it from even
	// spending the visitor's rate limit. Host only: behind Passenger the
	// server cannot see whether the browser used https.
	const origin = request.headers.get('origin');
	try {
		if (!origin || new URL(origin).host !== url.host) return refuse(403);
	} catch {
		return refuse(403);
	}
	if (rateLimited(clientAddress(request, getClientAddress))) return refuse(429);

	const clientId = env.GOOGLE_CLIENT_ID;
	const clientSecret = env.GOOGLE_CLIENT_SECRET;
	if (!clientId || !clientSecret) return refuse(503);

	const raw = await request.text();
	if (raw.length > MAX_BODY) return refuse(413);
	let body: Record<string, unknown>;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return refuse(400);
		body = parsed as Record<string, unknown>;
	} catch {
		return refuse(400);
	}

	let target = TOKEN;
	let form: Record<string, string>;
	if (body.grant_type === 'authorization_code') {
		// The redirect URI must be this app's own callback: the broker is not a
		// general-purpose code exchanger for whatever Google client wants one.
		if (
			!isText(body.code, 1024) ||
			!isText(body.code_verifier, 128) ||
			!isOwnCallback(body.redirect_uri, url)
		) {
			return refuse(400);
		}
		form = {
			grant_type: 'authorization_code',
			code: body.code,
			code_verifier: body.code_verifier,
			redirect_uri: body.redirect_uri,
			client_id: clientId,
			client_secret: clientSecret
		};
	} else if (body.grant_type === 'refresh_token') {
		if (!isText(body.refresh_token, 2048)) return refuse(400);
		form = {
			grant_type: 'refresh_token',
			refresh_token: body.refresh_token,
			client_id: clientId,
			client_secret: clientSecret
		};
	} else if (body.grant_type === 'revoke') {
		if (!isText(body.token, 2048)) return refuse(400);
		target = REVOKE;
		form = { token: body.token };
	} else {
		return refuse(400);
	}

	let upstream: Response;
	try {
		upstream = await fetch(target, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(form),
			signal: AbortSignal.timeout(8_000)
		});
	} catch {
		return refuse(502);
	}

	// A refused grant (expired, revoked) is the client's to handle by signing
	// in again; anything else is Google's problem, reported as such.
	if (!upstream.ok) return refuse(upstream.status === 400 || upstream.status === 401 ? 400 : 502);
	if (target === REVOKE) return json({ revoked: true }, { headers: NO_STORE });

	const data = (await upstream.json()) as Record<string, unknown>;
	return json(
		{
			access_token: data.access_token,
			expires_in: data.expires_in,
			refresh_token: data.refresh_token,
			scope: data.scope
		},
		{ headers: NO_STORE }
	);
};
