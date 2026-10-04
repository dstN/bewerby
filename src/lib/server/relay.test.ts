import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { IDLE_MS, MAX_SPACE_BYTES, PART_BYTES, RelayError, RelayStorage } from './relay.js';

const SPACE = 's'.repeat(43);
const VAULT = 'v'.repeat(22);
const PATH = `${VAULT}/0/upd/device-1/abc-123.bwv`;
const GB = 1024 * 1024 * 1024;
const dirs: string[] = [];

async function freshDir() {
	const dir = await mkdtemp(join(tmpdir(), 'bewerby-relay-'));
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
		if (err instanceof RelayError) return err.status;
		throw err;
	}
}

/** A sealed file as far as the store can tell: the magic, then anything. */
function sealed(length: number): Uint8Array {
	const bytes = new Uint8Array(length).map((_, i) => i % 251);
	bytes.set([0x42, 0x57, 0x56], 0);
	return bytes;
}

/** What the browser does: the file in parts of at most PART_BYTES. */
async function upload(storage: RelayStorage, path: string, bytes: Uint8Array, upload = 'upload-1') {
	const count = Math.max(1, Math.ceil(bytes.length / PART_BYTES));
	for (let i = 0; i < count; i++) {
		await storage.write(
			SPACE,
			path,
			upload,
			i,
			count,
			bytes.subarray(i * PART_BYTES, (i + 1) * PART_BYTES)
		);
	}
}

describe('relay storage', () => {
	it('puts a file together from its parts, and it reads back whole', async () => {
		const storage = new RelayStorage(await freshDir(), GB);
		const file = sealed(PART_BYTES * 2 + 1234);
		const count = 3;
		for (let i = 0; i < count - 1; i++) {
			await storage.write(
				SPACE,
				PATH,
				'upload-1',
				i,
				count,
				file.subarray(i * PART_BYTES, (i + 1) * PART_BYTES)
			);
			// Not there until the last part is.
			expect(await storage.list(SPACE)).toEqual([]);
		}
		await storage.write(SPACE, PATH, 'upload-1', 2, count, file.subarray(2 * PART_BYTES));
		expect(await storage.list(SPACE)).toEqual([PATH]);
		expect(new Uint8Array(await storage.read(SPACE, PATH))).toEqual(file);
	});

	it('is shared by two workers on one directory', async () => {
		const dir = await freshDir();
		const one = new RelayStorage(dir, GB);
		const two = new RelayStorage(dir, GB);
		await upload(one, PATH, sealed(100));
		expect(await two.list(SPACE)).toEqual([PATH]);
		await two.remove(SPACE, PATH);
		expect(await one.list(SPACE)).toEqual([]);
	});

	it('keeps spaces apart', async () => {
		const storage = new RelayStorage(await freshDir(), GB);
		await upload(storage, PATH, sealed(100));
		expect(await storage.list('t'.repeat(43))).toEqual([]);
		expect(await status(storage.read('t'.repeat(43), PATH))).toBe(404);
	});

	it('refuses paths outside the sync layout, traversal included', async () => {
		const storage = new RelayStorage(await freshDir(), GB);
		for (const path of [
			'../../etc/passwd',
			`${VAULT}/0/upd/../../x.bwv`,
			`${VAULT}/0/other/x.bwv`,
			`${VAULT}/0/upd/x.txt`,
			'/absolute.bwv',
			''
		]) {
			expect(await status(storage.write(SPACE, path, 'upload-1', 0, 1, sealed(10)))).toBe(400);
			expect(await status(storage.read(SPACE, path))).toBe(400);
		}
		expect(await status(storage.list('short'))).toBe(400);
	});

	it('takes only sealed files, and parts no bigger than the limit', async () => {
		const storage = new RelayStorage(await freshDir(), GB);
		expect(await status(storage.write(SPACE, PATH, 'upload-1', 0, 1, new Uint8Array(10)))).toBe(
			400
		);
		expect(
			await status(storage.write(SPACE, PATH, 'upload-1', 0, 2, new Uint8Array(PART_BYTES + 1)))
		).toBe(413);
		expect(await status(storage.write(SPACE, PATH, 'upload-1', 2, 2, sealed(10)))).toBe(400);
	});

	it('refuses an upload that would take a space or the whole store over its limit', async () => {
		const storage = new RelayStorage(await freshDir(), GB);
		const tooMany = Math.ceil(MAX_SPACE_BYTES / PART_BYTES) + 1;
		expect(await status(storage.write(SPACE, PATH, 'upload-1', 0, tooMany, sealed(10)))).toBe(400);

		const small = new RelayStorage(await freshDir(), PART_BYTES);
		await upload(small, PATH, sealed(PART_BYTES - 10));
		expect(
			await status(small.write(SPACE, `${VAULT}/0/blob/b.bwv`, 'upload-2', 0, 1, sealed(10)))
		).toBe(507);
	});

	it('does not finish an upload with a part missing', async () => {
		const storage = new RelayStorage(await freshDir(), GB);
		await storage.write(SPACE, PATH, 'upload-1', 0, 3, sealed(PART_BYTES));
		expect(await status(storage.write(SPACE, PATH, 'upload-1', 2, 3, sealed(10)))).toBe(409);
		expect(await storage.list(SPACE)).toEqual([]);
	});

	it('tells the owner what it keeps, and takes the marker an erasure leaves', async () => {
		let now = Date.UTC(2026, 9, 4, 12);
		const storage = new RelayStorage(await freshDir(), GB, () => now);
		expect(await storage.info(SPACE)).toEqual({ files: 0, bytes: 0, lastUsed: null });
		await upload(storage, PATH, sealed(1000));
		await upload(storage, `${VAULT}/erased.bwv`, sealed(3), 'upload-2');
		now += 60_000;
		expect(await storage.info(SPACE)).toEqual({ files: 2, bytes: 1003, lastUsed: '2026-10-04' });
		expect(await status(storage.info('short'))).toBe(400);
	});

	it('removes the space with its last file', async () => {
		const dir = await freshDir();
		const storage = new RelayStorage(dir, GB);
		await upload(storage, PATH, sealed(100));
		await storage.remove(SPACE, PATH);
		await storage.remove(SPACE, PATH);
		expect(await readdir(dir)).toEqual([]);
	});

	it('sweeps spaces nobody used for the idle period, and nothing that is not a space', async () => {
		let now = 1_800_000_000_000;
		const dir = await freshDir();
		const storage = new RelayStorage(dir, GB, () => now);
		await upload(storage, PATH, sealed(100));
		await mkdir(join(dir, 'not-a-space'));
		await writeFile(join(dir, 'not-a-space', 'keep.txt'), 'x');

		now += IDLE_MS - 1000;
		await storage.sweep(true);
		expect(await storage.list(SPACE)).toEqual([PATH]);

		// Listing counted as use, but only once a day; a whole idle period later it goes.
		now += IDLE_MS + 1000;
		await storage.sweep(true);
		expect((await readdir(dir)).sort()).toEqual(['not-a-space']);
	});
});
