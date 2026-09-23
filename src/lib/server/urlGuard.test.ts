import { describe, it, expect } from 'vitest';
import { assertPublicUrl, isPrivateAddress, UnsafeUrlError } from './urlGuard.js';

describe('isPrivateAddress', () => {
	it.each([
		['127.0.0.1', 'loopback'],
		['0.0.0.0', 'unspecified'],
		['10.1.2.3', 'RFC 1918'],
		['172.16.0.1', 'RFC 1918 lower bound'],
		['172.31.255.254', 'RFC 1918 upper bound'],
		['192.168.1.1', 'RFC 1918'],
		['169.254.169.254', 'cloud metadata'],
		['100.64.0.1', 'carrier-grade NAT'],
		['224.0.0.1', 'multicast'],
		['255.255.255.255', 'broadcast']
	])('refuses %s (%s)', (address) => {
		expect(isPrivateAddress(address)).toBe(true);
	});

	it.each(['8.8.8.8', '172.15.0.1', '172.32.0.1', '93.184.216.34', '100.63.255.255'])(
		'allows the public address %s',
		(address) => {
			expect(isPrivateAddress(address)).toBe(false);
		}
	);

	it.each(['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1'])(
		'refuses the IPv6 address %s',
		(address) => {
			expect(isPrivateAddress(address)).toBe(true);
		}
	);

	it('sees through IPv4-mapped IPv6, which is the usual way past a v4-only check', () => {
		expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
		expect(isPrivateAddress('::ffff:169.254.169.254')).toBe(true);
		expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false);
	});

	it('allows an ordinary public IPv6 address', () => {
		expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
	});

	it('refuses anything that is not an address at all rather than passing it', () => {
		expect(isPrivateAddress('not-an-ip')).toBe(true);
		expect(isPrivateAddress('')).toBe(true);
	});
});

async function rejection(input: string): Promise<string> {
	try {
		await assertPublicUrl(input);
	} catch (err) {
		return err instanceof UnsafeUrlError ? err.reason : 'wrong-error-type';
	}
	return 'resolved';
}

describe('assertPublicUrl', () => {
	it('refuses every scheme but https', async () => {
		expect(await rejection('http://example.com')).toBe('scheme');
		expect(await rejection('file:///etc/passwd')).toBe('scheme');
		expect(await rejection('ftp://example.com')).toBe('scheme');
		expect(await rejection('gopher://example.com:11211/')).toBe('scheme');
	});

	it('refuses text that is not a URL', async () => {
		expect(await rejection('Senior Frontend Developer (m/w/d)')).toBe('not-a-url');
	});

	it('refuses embedded credentials, which can smuggle a host past a reader', async () => {
		// "example.com" here is the *username*; the real host is the loopback
		// address behind the @. Caught as credentials rather than as a private
		// address, because that check runs first - either way it never resolves.
		expect(await rejection('https://example.com@127.0.0.1/')).toBe('credentials');
		expect(await rejection('https://user:pw@example.com/')).toBe('credentials');
	});

	it.each([
		'https://127.0.0.1/',
		'https://localhost.localdomain.invalid./',
		'https://169.254.169.254/latest/meta-data/',
		'https://[::1]:8443/',
		'https://10.0.0.5/admin',
		'https://192.168.178.1/'
	])('refuses %s without touching the network', async (input) => {
		expect(['private-address', 'unresolvable']).toContain(await rejection(input));
	});

	it('judges a bare IP literal directly, with no DNS round trip', async () => {
		const { addresses } = await assertPublicUrl('https://8.8.8.8/stellenanzeige');
		expect(addresses).toEqual(['8.8.8.8']);
	});
});
