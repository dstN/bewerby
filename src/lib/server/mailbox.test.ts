import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { Mailbox, MailboxError, MESSAGE_TTL_MS } from './mailbox.js';

const ROOM = 'r'.repeat(22);
const dirs: string[] = [];

async function freshDir() {
	const dir = await mkdtemp(join(tmpdir(), 'bewerby-signal-'));
	dirs.push(dir);
	return dir;
}

afterEach(async () => {
	for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function status(promise: Promise<unknown>) {
	try {
		await promise;
		return 200;
	} catch (err) {
		if (err instanceof MailboxError) return err.status;
		throw err;
	}
}

describe('signaling mailbox', () => {
	it('carries messages between two workers that share only the directory', async () => {
		const dir = await freshDir();
		// Two instances, as two Passenger worker processes would have.
		const workerA = new Mailbox(dir);
		const workerB = new Mailbox(dir);
		await workerA.send(ROOM, 'laptop-1', 'b2ZmZXI=');
		const [message] = await workerB.receive(ROOM, 'phone-01', '', 0);
		expect(message).toMatchObject({ from: 'laptop-1', payload: 'b2ZmZXI=' });

		// Nobody gets their own messages back, and a cursor skips what was read.
		expect(await workerA.receive(ROOM, 'laptop-1', '', 0)).toEqual([]);
		expect(await workerB.receive(ROOM, 'phone-01', message.id, 0)).toEqual([]);
	});

	it('wakes a waiting receiver as soon as a message arrives', async () => {
		const dir = await freshDir();
		const mailbox = new Mailbox(dir);
		const started = Date.now();
		const waiting = mailbox.receive(ROOM, 'phone-01', '', 5_000);
		setTimeout(() => void new Mailbox(dir).send(ROOM, 'laptop-1', 'YW5zd2Vy'), 300);
		const messages = await waiting;
		expect(messages).toHaveLength(1);
		expect(Date.now() - started).toBeLessThan(3_000);
	});

	it('forgets messages after two minutes and removes the empty room', async () => {
		const dir = await freshDir();
		let now = 1_800_000_000_000;
		const mailbox = new Mailbox(dir, () => now);
		await mailbox.send(ROOM, 'laptop-1', 'b2xk');
		now += MESSAGE_TTL_MS + 1;
		expect(await mailbox.receive(ROOM, 'phone-01', '', 0)).toEqual([]);
		expect(await readdir(dir)).toEqual([]);
	});

	it('refuses malformed rooms, senders and payloads, and caps a room', async () => {
		const mailbox = new Mailbox(await freshDir());
		expect(await status(mailbox.send('../etc', 'laptop-1', 'eA=='))).toBe(400);
		expect(await status(mailbox.send(ROOM, 'a/b', 'eA=='))).toBe(400);
		expect(await status(mailbox.send(ROOM, 'laptop-1', 'not base64!'))).toBe(400);
		expect(await status(mailbox.send(ROOM, 'laptop-1', 'x'.repeat(20_000)))).toBe(400);
		for (let i = 0; i < 64; i++) await mailbox.send(ROOM, 'laptop-1', 'eA==');
		expect(await status(mailbox.send(ROOM, 'laptop-1', 'eA=='))).toBe(429);
	});
});
