import { lookup } from 'node:dns/promises';
import { isIPv4, isIPv6 } from 'node:net';

/**
 * Server-Side Request Forgery guard for the job-ad fetcher.
 *
 * An endpoint that fetches a URL somebody hands it is, by default, an open
 * proxy into whatever the server can reach that the caller cannot: other
 * services on localhost (Plesk's panel), the hoster's private network, cloud
 * metadata endpoints, and the rest of the internet under our IP. Everything
 * here exists to make that specific attack not work.
 *
 * Lives under `$lib/server` on purpose: SvelteKit refuses to bundle anything
 * from that directory into client code, so this can never be shipped to a
 * browser where the checks would be meaningless.
 */

export type UrlRejection =
	'not-a-url' | 'scheme' | 'credentials' | 'unresolvable' | 'private-address';

export class UnsafeUrlError extends Error {
	constructor(readonly reason: UrlRejection) {
		super(`Unsafe URL: ${reason}`);
		this.name = 'UnsafeUrlError';
	}
}

/**
 * Whether an IP literal belongs to a range that must never be reachable
 * through us: loopback, link-local (which includes the 169.254.169.254 cloud
 * metadata address), the RFC 1918 private ranges, carrier-grade NAT, and
 * their IPv6 equivalents including IPv4-mapped forms like `::ffff:127.0.0.1`.
 *
 * Pure and exported so the range arithmetic is testable without a network.
 */
export function isPrivateAddress(address: string): boolean {
	const ip = address.trim().toLowerCase();

	if (isIPv4(ip)) {
		const [a, b] = ip.split('.').map(Number);
		if (a === 0 || a === 10 || a === 127) return true;
		if (a === 169 && b === 254) return true; // link-local + metadata
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		if (a === 192 && b === 0) return true; // IETF protocol assignments
		if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
		if (a >= 224) return true; // multicast + reserved + broadcast
		return false;
	}

	if (!isIPv6(ip)) return true; // not an address we can reason about: refuse

	// IPv4-mapped/compatible: judge them by the IPv4 rules they really are.
	const mapped = /^::(ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
	if (mapped) return isPrivateAddress(mapped[2]);

	if (ip === '::' || ip === '::1') return true;
	if (/^f[cd]/.test(ip)) return true; // fc00::/7 unique local
	if (/^fe[89ab]/.test(ip)) return true; // fe80::/10 link-local
	if (/^ff/.test(ip)) return true; // multicast
	return false;
}

/**
 * Validates a user-supplied URL and resolves it, refusing anything that
 * points inward. Returns every address the host resolves to, so the caller
 * can pin the connection to one it has actually checked.
 *
 * ALL resolved addresses have to pass, not just the first: a host that
 * answers with both a public and a private address would otherwise be a way
 * straight through this check.
 */
export async function assertPublicUrl(input: string): Promise<{ url: URL; addresses: string[] }> {
	let url: URL;
	try {
		url = new URL(input.trim());
	} catch {
		throw new UnsafeUrlError('not-a-url');
	}

	// https only. http would let a network-positioned attacker rewrite the
	// page we parse, and every other scheme (file:, ftp:, gopher:) exists
	// here only as a way to read something that is not a web page.
	if (url.protocol !== 'https:') throw new UnsafeUrlError('scheme');
	if (url.username || url.password) throw new UnsafeUrlError('credentials');

	const host = url.hostname.replace(/^\[|\]$/g, '');

	// A bare IP needs no DNS, and must be judged directly.
	if (isIPv4(host) || isIPv6(host)) {
		if (isPrivateAddress(host)) throw new UnsafeUrlError('private-address');
		return { url, addresses: [host] };
	}

	let resolved: { address: string }[];
	try {
		resolved = await lookup(host, { all: true });
	} catch {
		throw new UnsafeUrlError('unresolvable');
	}

	if (resolved.length === 0) throw new UnsafeUrlError('unresolvable');
	if (resolved.some((entry) => isPrivateAddress(entry.address))) {
		throw new UnsafeUrlError('private-address');
	}

	return { url, addresses: resolved.map((entry) => entry.address) };
}
