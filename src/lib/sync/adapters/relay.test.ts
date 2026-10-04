import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { RelayError, RelayStorage } from '#lib/server/relay.js';
import { createVault } from '#lib/vault/vault.js';
import { RelayStore, relaySpace } from './relay.js';

const FAST_KDF = { m: 256, t: 1, p: 1 };
const dirs: string[] = [];

afterEach(async () => {
	for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

/** The server's side of /api/relay, without HTTP: what the route does with the headers. */
async function server() {
	const dir = await mkdtemp(join(tmpdir(), 'bewerby-relay-client-'));
	dirs.push(dir);
	const storage = new RelayStorage(dir, 1024 * 1024 * 1024);
	const requests: { op: string; bytes: number }[] = [];
	const fetcher = (async (_url: string, init: RequestInit) => {
		const headers = new Headers(init.headers);
		const get = (name: string) => headers.get(name) ?? '';
		const op = get('x-relay-op');
		const body = init.body ? new Uint8Array(init.body as ArrayBuffer) : new Uint8Array(0);
		requests.push({ op, bytes: body.length });
		try {
			switch (op) {
				case 'list':
					return Response.json({ files: await storage.list(get('x-relay-space')) });
				case 'read':
					return new Response(
						new Uint8Array(await storage.read(get('x-relay-space'), get('x-relay-path')))
					);
				case 'write':
					await storage.write(
						get('x-relay-space'),
						get('x-relay-path'),
						get('x-relay-upload'),
						Number(get('x-relay-part')),
						Number(get('x-relay-parts')),
						body
					);
					return new Response(null, { status: 204 });
				case 'remove':
					await storage.remove(get('x-relay-space'), get('x-relay-path'));
					return new Response(null, { status: 204 });
			}
		} catch (err) {
			if (err instanceof RelayError) return new Response(null, { status: err.status });
			throw err;
		}
		return new Response(null, { status: 400 });
	}) as typeof fetch;
	return { fetcher, requests };
}

function sealed(length: number): Uint8Array {
	const bytes = new Uint8Array(length).map((_, i) => (i * 7) % 256);
	bytes.set([0x42, 0x57, 0x56], 0);
	return bytes;
}

describe('the bewerby.de store, from the browser', () => {
	it('derives one space per key: the same for every device, another for another key', async () => {
		const one = await createVault('ein langes passwort', FAST_KDF);
		const next = await createVault('ein neues passwort', FAST_KDF, one.vault.header);
		const space = await relaySpace(one.vault.root);
		expect(space).toMatch(/^[\w-]{43}$/);
		expect(await relaySpace(one.vault.root)).toBe(space);
		expect(await relaySpace(next.vault.root)).not.toBe(space);
	});

	it('uploads a PDF-sized file in parts and reads it back whole', async () => {
		const { fetcher, requests } = await server();
		const { vault } = await createVault('ein langes passwort', FAST_KDF);
		const store = new RelayStore(await relaySpace(vault.root), fetcher);
		const path = `${'v'.repeat(22)}/0/blob/9b1d0c2e-1111-4222-8333-444455556666.bwv`;
		const file = sealed(3 * 1024 * 1024 + 17);

		await store.write(path, file);
		const parts = requests.filter((request) => request.op === 'write');
		expect(parts.length).toBe(13);
		expect(Math.max(...parts.map((part) => part.bytes))).toBeLessThanOrEqual(256 * 1024);
		expect(await store.list()).toEqual([path]);
		expect(Buffer.from(await store.read(path)).equals(Buffer.from(file))).toBe(true);

		await store.remove(path);
		await store.remove(path);
		expect(await store.list()).toEqual([]);
	});
});
