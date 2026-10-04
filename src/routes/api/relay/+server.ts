import { join } from 'node:path';
import { RELAY_DIR, RELAY_MAX_MB } from '$app/env/private';
import { PART_BYTES, RelayError, RelayStorage } from '#lib/server/relay.js';
import { clientAddress, createRateLimiter } from '#lib/server/requests.js';
import type { RequestHandler } from './$types';

/**
 * The encrypted sync store on bewerby.de (#58). Browsers keep their vault's
 * `.bwv` files here so a device that was closed can catch up; the server
 * holds ciphertext it cannot read, in a space whose id only the vault's key
 * yields.
 *
 * POST only, and the space, path and operation travel in headers: none of
 * it ends up in the request line of the access log.
 */
export const prerender = false;

const NO_STORE = { 'Cache-Control': 'no-store' };

// An open tab lists the space once a minute and pushes after changes; the
// first sync of a vault with PDFs uploads a few hundred parts. 3000 an hour
// leaves room for that and a couple of devices behind one address.
const rateLimited = createRateLimiter(60 * 60 * 1000, 3000);

// Under the Application Root (outside the Document Root, so never reachable
// from the web) and outside build/, so deploys leave it alone.
const storage = new RelayStorage(
	RELAY_DIR || join(process.cwd(), 'data', 'relay'),
	(Number(RELAY_MAX_MB) || 2048) * 1024 * 1024
);

function int(value: string | null): number {
	return value !== null && /^\d{1,4}$/.test(value) ? Number(value) : -1;
}

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	const origin = request.headers.get('origin');
	try {
		if (!origin || new URL(origin).host !== url.host) return new Response(null, { status: 403 });
	} catch {
		return new Response(null, { status: 403 });
	}
	if (rateLimited(clientAddress(request, getClientAddress))) {
		return new Response(null, { status: 429 });
	}

	const op = request.headers.get('x-relay-op');
	const space = request.headers.get('x-relay-space') ?? '';
	const path = request.headers.get('x-relay-path') ?? '';
	try {
		switch (op) {
			case 'list':
				return Response.json({ files: await storage.list(space) }, { headers: NO_STORE });
			case 'info':
				return Response.json(await storage.info(space), { headers: NO_STORE });
			case 'read':
				return new Response(new Uint8Array(await storage.read(space, path)), {
					headers: { ...NO_STORE, 'Content-Type': 'application/octet-stream' }
				});
			case 'write': {
				const declared = Number(request.headers.get('content-length'));
				if (declared > PART_BYTES) return new Response(null, { status: 413 });
				const bytes = new Uint8Array(await request.arrayBuffer());
				await storage.write(
					space,
					path,
					request.headers.get('x-relay-upload') ?? '',
					int(request.headers.get('x-relay-part')),
					int(request.headers.get('x-relay-parts')),
					bytes
				);
				return new Response(null, { status: 204, headers: NO_STORE });
			}
			case 'remove':
				await storage.remove(space, path);
				return new Response(null, { status: 204, headers: NO_STORE });
			default:
				return new Response(null, { status: 400 });
		}
	} catch (err) {
		if (err instanceof RelayError) return new Response(null, { status: err.status });
		throw err;
	}
};
