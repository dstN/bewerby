import { join } from 'node:path';
import { SIGNAL_DIR } from '$app/env/private';
import { Mailbox, MailboxError } from '#lib/server/mailbox.js';
import { clientAddress, createRateLimiter } from '#lib/server/requests.js';
import type { RequestHandler } from './$types';

/**
 * Signaling for live sync between devices (#55): browsers swap encrypted
 * WebRTC offers and answers through here, then talk to each other directly.
 * The server stores opaque ciphertext for at most two minutes and never
 * sees the data that later flows between the devices.
 *
 * POST only, so room ids stay out of the access log's request line.
 */
export const prerender = false;

/** Long enough that an open tab asks about twice a minute. */
const WAIT_MS = 25_000;
const NO_STORE = { 'Cache-Control': 'no-store' };

// A live tab sends a presence note every 20 s and keeps one long poll open:
// a few hundred requests an hour. 600 leaves room for two or three devices
// behind one address.
const rateLimited = createRateLimiter(60 * 60 * 1000, 600);

// Under the Application Root (not the Document Root, so not reachable from
// the web), shared by every Passenger worker; see DEPLOYMENT.md.
const mailbox = new Mailbox(SIGNAL_DIR || join(process.cwd(), 'tmp', 'signal'));

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	const origin = request.headers.get('origin');
	try {
		if (!origin || new URL(origin).host !== url.host) return Response.json({}, { status: 403 });
	} catch {
		return Response.json({}, { status: 403 });
	}
	if (rateLimited(clientAddress(request, getClientAddress)))
		return Response.json({}, { status: 429 });

	const raw = await request.text();
	if (raw.length > 16 * 1024) return Response.json({}, { status: 413 });
	let body: Record<string, unknown>;
	try {
		body = JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return Response.json({}, { status: 400 });
	}

	try {
		if (body.op === 'send') {
			await mailbox.send(body.room as string, body.from as string, body.payload as string);
			return Response.json({ sent: true }, { headers: NO_STORE });
		}
		if (body.op === 'receive') {
			const messages = await mailbox.receive(
				body.room as string,
				body.from as string,
				typeof body.after === 'string' ? body.after : '',
				WAIT_MS,
				request.signal
			);
			return Response.json({ messages }, { headers: NO_STORE });
		}
		return Response.json({}, { status: 400 });
	} catch (err) {
		if (err instanceof MailboxError) return Response.json({}, { status: err.status });
		throw err;
	}
};
