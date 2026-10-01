/**
 * Shared by the server routes that do work for a visitor: /api/fetch-ad and
 * the Google token broker (#54). Under #lib/server, so SvelteKit never
 * bundles it into client code.
 */

/**
 * Per-IP throttle, in memory.
 *
 * ponytail: in-process counter, so it resets on restart and is per Passenger
 * worker rather than per host. That is the right size for a personal app
 * whose job is to stop an endpoint becoming a free open proxy, not to
 * survive a determined attacker; move it to a shared store if there is ever
 * more than one instance that matters.
 */
export function createRateLimiter(windowMs: number, maxPerWindow: number) {
	const hits = new Map<string, { count: number; resetAt: number }>();
	return function rateLimited(key: string, now = Date.now()): boolean {
		// Sweep on every call, not only once the map is large: the
		// Datenschutzerklärung promises an IP is held for at most one window,
		// and a lazy sweep would keep it until the next restart.
		for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip);
		const entry = hits.get(key);
		if (!entry || entry.resetAt <= now) {
			hits.set(key, { count: 1, resetAt: now + windowMs });
			return false;
		}
		entry.count += 1;
		return entry.count > maxPerWindow;
	};
}

/**
 * Who is asking, for a rate limit. Behind Passenger the socket peer is
 * Passenger itself, so getClientAddress() alone would put every visitor into
 * one shared bucket. Passenger passes the real address in a header with the
 * `!~` prefix, which it refuses to accept from clients - unlike
 * X-Forwarded-For, which anyone can send. Without Passenger (locally, in
 * tests) the header is absent and the socket peer is the client after all.
 * https://www.phusionpassenger.com/library/indepth/nodejs/secure_http_headers.html
 */
export function clientAddress(request: Request, fallback: () => string): string {
	return request.headers.get('!~passenger-client-address') ?? fallback();
}
