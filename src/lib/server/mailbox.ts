import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * The signaling mailbox for live sync between devices (#55). Two browsers
 * that want a WebRTC connection need to swap an offer and an answer first;
 * they leave them here and pick them up.
 *
 * Everything posted is encrypted by the browsers with a key the server never
 * sees - an opaque string per message. Messages live as files under one
 * directory per room, because Passenger may run several worker processes
 * that share nothing but the disk. They expire after two minutes.
 */

export const MESSAGE_TTL_MS = 2 * 60 * 1000;
/** Characters of payload: an encrypted SDP with its candidates fits easily. */
export const MAX_PAYLOAD = 12 * 1024;
const MAX_MESSAGES_PER_ROOM = 64;
const MAX_ROOMS = 2000;
const POLL_INTERVAL_MS = 400;

const ROOM = /^[A-Za-z0-9_-]{22,64}$/;
const PEER = /^[A-Za-z0-9_-]{8,32}$/;
const PAYLOAD = /^[A-Za-z0-9+/=_-]+$/;

export interface Message {
	id: string;
	from: string;
	payload: string;
}

export class MailboxError extends Error {
	constructor(readonly status: number) {
		super(`mailbox: ${status}`);
		this.name = 'MailboxError';
	}
}

export function isRoom(value: unknown): value is string {
	return typeof value === 'string' && ROOM.test(value);
}

export function isPeer(value: unknown): value is string {
	return typeof value === 'string' && PEER.test(value);
}

/** `<13-digit time>-<random>-<sender>`: sorts by time, carries its sender. */
function messageName(now: number, from: string): string {
	return `${String(now).padStart(13, '0')}-${randomBytes(4).toString('hex')}-${from}`;
}

function parseName(name: string): { time: number; from: string } | null {
	const match = /^(\d{13})-[0-9a-f]{8}-([A-Za-z0-9_-]+)$/.exec(name);
	return match ? { time: Number(match[1]), from: match[2] } : null;
}

export class Mailbox {
	constructor(
		private readonly dir: string,
		private readonly now: () => number = Date.now
	) {}

	/** Removes expired messages and empty rooms. Runs before every operation. */
	async sweep(): Promise<void> {
		let rooms: string[];
		try {
			rooms = await readdir(this.dir);
		} catch {
			return;
		}
		const cutoff = this.now() - MESSAGE_TTL_MS;
		for (const room of rooms) {
			const roomDir = join(this.dir, room);
			let names: string[];
			try {
				names = await readdir(roomDir);
			} catch {
				continue;
			}
			let left = 0;
			for (const name of names) {
				const parsed = parseName(name);
				if (!parsed || parsed.time < cutoff) {
					await rm(join(roomDir, name), { force: true });
				} else {
					left++;
				}
			}
			if (left === 0) await rm(roomDir, { recursive: true, force: true });
		}
	}

	async send(room: string, from: string, payload: string): Promise<void> {
		if (!isRoom(room) || !isPeer(from)) throw new MailboxError(400);
		if (payload.length === 0 || payload.length > MAX_PAYLOAD || !PAYLOAD.test(payload)) {
			throw new MailboxError(400);
		}
		await this.sweep();
		const roomDir = join(this.dir, room);
		const existing = await readdir(roomDir).catch(() => null);
		if (existing === null) {
			await mkdir(this.dir, { recursive: true });
			if ((await readdir(this.dir)).length >= MAX_ROOMS) throw new MailboxError(503);
			await mkdir(roomDir, { recursive: true });
		} else if (existing.length >= MAX_MESSAGES_PER_ROOM) {
			throw new MailboxError(429);
		}
		// Written under a temporary name and renamed: another worker polling the
		// room must never read half a message.
		const name = messageName(this.now(), from);
		const temporary = join(roomDir, `.${name}.tmp`);
		await writeFile(temporary, payload, 'utf-8');
		await rename(temporary, join(roomDir, name));
	}

	private async pending(room: string, me: string, after: string): Promise<Message[]> {
		const roomDir = join(this.dir, room);
		const names = (await readdir(roomDir).catch(() => [] as string[])).sort();
		const out: Message[] = [];
		for (const name of names) {
			const parsed = parseName(name);
			if (!parsed || parsed.from === me || name <= after) continue;
			try {
				out.push({
					id: name,
					from: parsed.from,
					payload: await readFile(join(roomDir, name), 'utf-8')
				});
			} catch {
				// Swept by another worker in the meantime.
			}
		}
		return out;
	}

	/**
	 * Messages in the room from others, newer than `after`. Waits up to
	 * `waitMs` for the first one (long polling), so a browser asks about
	 * twice a minute instead of every second.
	 */
	async receive(
		room: string,
		me: string,
		after: string,
		waitMs: number,
		signal?: AbortSignal
	): Promise<Message[]> {
		if (!isRoom(room) || !isPeer(me) || typeof after !== 'string' || after.length > 80) {
			throw new MailboxError(400);
		}
		await this.sweep();
		const deadline = this.now() + waitMs;
		for (;;) {
			const messages = await this.pending(room, me, after);
			if (messages.length > 0 || this.now() >= deadline || signal?.aborted) return messages;
			await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
		}
	}
}
