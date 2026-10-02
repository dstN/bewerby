import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import type { Application } from '#lib/db/index.js';

const files = new Map<string, Uint8Array>();
let written = 0;
vi.mock('#lib/utils/opfs.js', () => ({
	writePdfToOpfs: vi.fn(async (blob: Blob) => {
		const ref = `file-${++written}.pdf`;
		files.set(ref, new Uint8Array(await blob.arrayBuffer()));
		return ref;
	}),
	readPdfFromOpfs: vi.fn(async (ref: string) => {
		const bytes = files.get(ref);
		return bytes ? new Blob([new Uint8Array(bytes)]) : null;
	})
}));

const { BewerbyDatabase } = await import('#lib/db/index.js');
const { SyncRuntime } = await import('#lib/crdt/runtime.js');
const { createVault } = await import('#lib/vault/vault.js');
const { comparisonCode, liveKeys, pairingKeys, seal, unseal } = await import('./keys.js');
const { DocLink } = await import('./link.js');
const { formatPairingCode, parsePairingCode, receivedTarget, shareableTarget } =
	await import('./pairing.js');

/** Two ends of a data channel, delivering messages asynchronously like the real one. */
function channelPair() {
	const make = () => {
		const target = new EventTarget() as EventTarget & {
			readyState: string;
			send(data: string): void;
			close(): void;
		};
		target.readyState = 'open';
		return target;
	};
	const a = make();
	const b = make();
	const wire = (from: typeof a, to: typeof a) => {
		from.send = (data: string) => {
			setTimeout(() => to.dispatchEvent(new MessageEvent('message', { data })), 0);
		};
		from.close = () => {
			from.readyState = 'closed';
		};
	};
	wire(a, b);
	wire(b, a);
	return [a as unknown as RTCDataChannel, b as unknown as RTCDataChannel] as const;
}

function fields(overrides: Partial<Application> = {}) {
	return {
		title: 'Entwickler',
		company: 'Contoso GmbH',
		url: '',
		salary: '',
		contactName: '',
		contactEmail: '',
		contactPhone: '',
		notes: '',
		priority: 'medium' as const,
		status: 'sent' as const,
		tags: [],
		reminderInterval: 'none' as const,
		...overrides
	};
}

async function device() {
	const db = new BewerbyDatabase(`bewerby-live-${Math.random().toString(36).slice(2)}`);
	return { db, runtime: await SyncRuntime.open(db) };
}

const until = async (check: () => Promise<boolean>) => {
	for (let i = 0; i < 100; i++) {
		if (await check()) return;
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error('condition never met');
};

describe('live sync keys', () => {
	it('gives both devices the same room, key and comparison code from the shared secret', async () => {
		const secret = crypto.getRandomValues(new Uint8Array(16));
		const host = await pairingKeys(secret);
		const guest = await pairingKeys(new Uint8Array(secret));
		expect(guest.room).toBe(host.room);
		expect(await unseal(guest, await seal(host, { t: 'offer', sdp: 'x' }))).toEqual({
			t: 'offer',
			sdp: 'x'
		});

		const fingerprints: [string, string] = ['sha-256 AA:BB', 'sha-256 CC:DD'];
		const code = await comparisonCode(secret, fingerprints);
		expect(code).toMatch(/^\d{6}$/);
		// Either side lists the fingerprints in its own order.
		expect(await comparisonCode(secret, ['sha-256 CC:DD', 'sha-256 AA:BB'])).toBe(code);
		// A different connection (someone racing with the photographed code) differs.
		expect(await comparisonCode(secret, ['sha-256 EE:FF', 'sha-256 CC:DD'])).not.toBe(code);
	});

	it('does not open a message sealed for another room', async () => {
		const one = await pairingKeys(crypto.getRandomValues(new Uint8Array(16)));
		const other = await pairingKeys(crypto.getRandomValues(new Uint8Array(16)));
		expect(await unseal(other, await seal(one, { t: 'hello' }))).toBeNull();
	});

	it('puts devices of one vault in the same live room, and other vaults elsewhere', async () => {
		const { vault } = await createVault('ein langes passwort', { m: 256, t: 1, p: 1 });
		const other = await createVault('ein anderes passwort', { m: 256, t: 1, p: 1 });
		expect((await liveKeys(vault.root)).room).toBe((await liveKeys(vault.root)).room);
		expect((await liveKeys(other.vault.root)).room).not.toBe((await liveKeys(vault.root)).room);
	});

	it('round-trips the pairing code as people type it', () => {
		const secret = crypto.getRandomValues(new Uint8Array(16));
		const code = formatPairingCode(secret);
		expect(code).toMatch(/^([0-9A-Z]{4}-){6}[0-9A-Z]{2}$/);
		expect([...parsePairingCode(code.toLowerCase().replace(/-/g, ' '))!]).toEqual([...secret]);
		expect(parsePairingCode('ABCD')).toBeNull();
	});
});

describe('passing the sync target on when pairing (#58)', () => {
	it('sends the store on bewerby.de and a refresh token, never a folder or an access token', () => {
		expect(shareableTarget({ kind: 'relay', space: 'x'.repeat(43) })).toEqual({ kind: 'relay' });
		expect(
			shareableTarget({ kind: 'dropbox', refreshToken: 'r', accessToken: 'a', expiresAt: 1 })
		).toEqual({ kind: 'dropbox', refreshToken: 'r' });
		const handle = {} as FileSystemDirectoryHandle;
		expect(shareableTarget({ kind: 'folder', handle, name: 'Nextcloud' })).toBeNull();
		expect(shareableTarget(null)).toBeNull();
	});

	it('takes only a well-formed target from the other side', () => {
		expect(receivedTarget({ kind: 'relay', space: 'chosen-by-the-sender' })).toEqual({
			kind: 'relay'
		});
		expect(receivedTarget({ kind: 'google', refreshToken: 'r' })).toEqual({
			kind: 'google',
			refreshToken: 'r'
		});
		for (const value of [
			null,
			'relay',
			{ kind: 'folder', name: 'x' },
			{ kind: 'dropbox' },
			{ kind: 'dropbox', refreshToken: '' },
			{ kind: 'dropbox', refreshToken: 'x'.repeat(5000) },
			{ kind: 'ftp', refreshToken: 'r' }
		]) {
			expect(receivedTarget(value)).toBeNull();
		}
	});
});

describe('DocLink', () => {
	it('brings two documents in step over a channel, PDFs included, then carries live edits', async () => {
		const laptop = await device();
		const phone = await device();
		const ref = 'local-cv.pdf';
		// Bigger than one chunk, so it has to be put back together.
		const pdf = new Uint8Array(120_000).map((_, i) => i % 251);
		files.set(ref, pdf);
		const id = await laptop.runtime.create(
			fields({ company: 'Fabrikam AG', cvRef: ref, cvName: 'cv.pdf' }),
			1000
		);
		await phone.runtime.create(fields({ company: 'Northwind GmbH' }), 1100);

		const [a, b] = channelPair();
		const onLaptop = new DocLink(laptop.runtime, a);
		const onPhone = new DocLink(phone.runtime, b);
		onLaptop.start();
		onPhone.start();
		await onPhone.settled;
		await onLaptop.settled;

		const phoneRows = await phone.db.applications.toArray();
		expect(phoneRows.map((row) => row.company).sort()).toEqual(['Fabrikam AG', 'Northwind GmbH']);
		const copied = phoneRows.find((row) => row.company === 'Fabrikam AG')!;
		expect([...files.get(copied.cvRef!)!]).toEqual([...pdf]);
		expect((await laptop.db.applications.toArray()).map((row) => row.company).sort()).toEqual([
			'Fabrikam AG',
			'Northwind GmbH'
		]);

		// After the first exchange, edits travel as they happen.
		await laptop.runtime.update(id, { notes: 'Gespräch am Dienstag' }, 2000);
		await until(
			async () => (await phone.db.applications.get(copied.id!))?.notes === 'Gespräch am Dienstag'
		);

		onLaptop.close();
		onPhone.close();
	});
});
