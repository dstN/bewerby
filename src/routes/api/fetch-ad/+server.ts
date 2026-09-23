import { json, type RequestHandler } from '@sveltejs/kit';
import { assertPublicUrl, UnsafeUrlError } from '$lib/server/urlGuard.js';
import { extractJobPage } from '$lib/utils/htmlToJobText.js';

/**
 * Fetches a job ad server-side and hands back its text plus whatever the page
 * states about itself in schema.org JSON-LD.
 *
 * This is the one route in bewerby that is not prerendered, and the one place
 * where anything reaches our server. What it deliberately does *not* do:
 *
 * - **It never sees application data.** The request body is one public URL.
 *   No row, no PDF, no profile, no id ever crosses this boundary.
 * - **It never writes anything down.** No database, no cache, no log of the
 *   target URL. The URL travels in the POST body, never the query string,
 *   precisely so Apache's access log - which records the path and the client
 *   IP, and rotates on the server's own schedule - cannot record *which*
 *   vacancy anybody looked at. The log shows that the import feature was
 *   used, and nothing about what for.
 * - **It hides the user from the job board.** The employer's server sees our
 *   IP, not the applicant's. That is strictly better for someone job-hunting
 *   out of a current position than opening the link themselves.
 */

export const prerender = false;

const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
/** A job ad is a few hundred KB of HTML at worst. */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * A plain browser-ish UA. Not a disguise - a blank or scripted UA is simply
 * rejected outright by most sites, and there is nothing to gain by failing a
 * request we are making on a user's explicit instruction, for a page they
 * could open themselves.
 */
const USER_AGENT = 'Mozilla/5.0 (compatible; bewerby/1.0; +https://bewerby.de) job-posting-import';

type FailureCode =
	| 'invalid-url'
	| 'blocked'
	| 'unreachable'
	| 'not-html'
	| 'too-large'
	| 'rate-limited'
	| 'http-error';

function failure(code: FailureCode, status: number) {
	return json({ error: code }, { status });
}

/**
 * Per-IP throttle, in memory.
 *
 * ponytail: in-process counter, so it resets on restart and is per Passenger
 * worker rather than per host. That is the right size for a personal app
 * whose job is to stop this becoming a free open proxy, not to survive a
 * determined attacker; move it to a shared store if there is ever more than
 * one instance that matters.
 */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 40;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string, now = Date.now()): boolean {
	// Opportunistic sweep: without it the map grows one entry per IP forever.
	if (hits.size > 5_000) {
		for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip);
	}
	const entry = hits.get(key);
	if (!entry || entry.resetAt <= now) {
		hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
		return false;
	}
	entry.count += 1;
	return entry.count > MAX_PER_WINDOW;
}

/** Reads at most MAX_BYTES, so a multi-gigabyte response cannot exhaust us. */
async function readCapped(response: Response): Promise<string | null> {
	const declared = Number(response.headers.get('content-length') ?? '0');
	if (declared > MAX_BYTES) return null;

	const reader = response.body?.getReader();
	if (!reader) return null;

	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.length;
			if (total > MAX_BYTES) return null;
			chunks.push(value);
		}
	} finally {
		await reader.cancel().catch(() => {});
	}

	const merged = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.length;
	}
	// Job boards are UTF-8 in practice; a mislabelled page degrades to a few
	// wrong characters, which the review panel lets the user correct.
	return new TextDecoder('utf-8').decode(merged);
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if (rateLimited(getClientAddress())) return failure('rate-limited', 429);

	let target: string;
	try {
		const body: unknown = await request.json();
		const candidate = (body as { url?: unknown } | null)?.url;
		if (typeof candidate !== 'string' || candidate.length > 2_000) {
			return failure('invalid-url', 400);
		}
		target = candidate;
	} catch {
		return failure('invalid-url', 400);
	}

	// Redirects are followed by hand, because every hop is a fresh chance to
	// be pointed at something internal - a public host answering 302 to
	// http://127.0.0.1:8443 defeats a one-time check completely.
	let current = target;
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		let url: URL;
		try {
			({ url } = await assertPublicUrl(current));
		} catch (err) {
			if (err instanceof UnsafeUrlError) {
				return failure(err.reason === 'private-address' ? 'blocked' : 'invalid-url', 400);
			}
			return failure('invalid-url', 400);
		}

		let response: Response;
		try {
			response = await fetch(url, {
				method: 'GET',
				redirect: 'manual',
				signal: AbortSignal.timeout(TIMEOUT_MS),
				headers: {
					'user-agent': USER_AGENT,
					accept: 'text/html,application/xhtml+xml',
					'accept-language': 'de-DE,de;q=0.9,en;q=0.8'
				}
			});
		} catch {
			return failure('unreachable', 502);
		}

		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get('location');
			await response.body?.cancel().catch(() => {});
			if (!location) return failure('unreachable', 502);
			current = new URL(location, url).toString();
			continue;
		}

		if (!response.ok) {
			await response.body?.cancel().catch(() => {});
			// One status for every failure: whether a host answered 401, 403 or
			// 404 is exactly the probe an SSRF attempt wants back.
			return failure('http-error', 502);
		}

		const contentType = response.headers.get('content-type') ?? '';
		if (!/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
			await response.body?.cancel().catch(() => {});
			return failure('not-html', 415);
		}

		const html = await readCapped(response);
		if (html === null) return failure('too-large', 413);

		const { text, fields } = extractJobPage(html, url.toString());
		return json({ text, fields, finalUrl: url.toString() });
	}

	return failure('unreachable', 502);
};
