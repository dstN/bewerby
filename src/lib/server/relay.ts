import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * The encrypted sync store on bewerby.de (#58): where a device's changes
 * wait while the other devices are closed. It holds the same `.bwv` files a
 * Dropbox app folder would - ciphertext the server cannot read - in one
 * space per vault key.
 *
 * A space's id is derived from the vault's root key by the browsers, so it
 * doubles as the capability: whoever lacks the key can neither find nor
 * touch the space. Files live under one directory per space, because
 * Passenger may run several worker processes that share nothing but the
 * disk. Uploads arrive in parts below adapter-node's body size limit and
 * are put together once the last part is in.
 */

/** One upload part: well under adapter-node's default 512 KB body limit. */
export const PART_BYTES = 256 * 1024;
/**
 * New PDFs are at most 2 MB (pdf.ts), and a sealed file is about 3 % larger
 * than what it holds. The bound is higher for the PDFs added before that
 * limit (up to 15 MB) and for whole documents after a key change: a vault
 * that holds one must still sync.
 */
export const MAX_FILE_BYTES = 16 * 1024 * 1024;
/** 200 applications with a 2 MB ad and a 2 MB CV each come to 800 MB; real ones far less. */
export const MAX_SPACE_BYTES = 512 * 1024 * 1024;
/** Spaces nobody has used for this long are removed. */
export const IDLE_MS = 180 * 24 * 60 * 60 * 1000;
/** Parts of an upload that never finished. */
const UPLOAD_TTL_MS = 60 * 60 * 1000;
/** A space's last use is recorded at most this often. */
const TOUCH_EVERY_MS = 24 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

const SPACE = /^[A-Za-z0-9_-]{43}$/;
const UPLOAD = /^[A-Za-z0-9_-]{8,32}$/;
// The sync engine's layout: <vault>/<epoch>/<upd|snap|blob>/... .bwv, and
// the marker an erasure leaves at <vault>/erased.bwv (#56).
const PATH = /^[\w-]{22}\/(erased|\d{1,10}\/(upd|snap|blob)\/[\w-]+(\/[\w-]+)?)\.bwv$/;
const MAGIC = Buffer.from('BWV');

export class RelayError extends Error {
	constructor(readonly status: number) {
		super(`relay: ${status}`);
		this.name = 'RelayError';
	}
}

export function isSpace(value: unknown): value is string {
	return typeof value === 'string' && SPACE.test(value);
}

export function isRelayPath(value: unknown): value is string {
	return typeof value === 'string' && PATH.test(value);
}

export class RelayStorage {
	private lastSweep = 0;
	/** Bytes stored, as of the last sweep: the global cap is checked against it. */
	private total = 0;

	constructor(
		private readonly dir: string,
		private readonly maxTotalBytes: number,
		private readonly now: () => number = Date.now
	) {}

	private files(space: string): string {
		return join(this.dir, space, 'files');
	}

	private async walk(root: string, prefix = ''): Promise<{ path: string; bytes: number }[]> {
		let entries;
		try {
			entries = await readdir(root, { withFileTypes: true });
		} catch {
			return [];
		}
		const out: { path: string; bytes: number }[] = [];
		for (const entry of entries) {
			const path = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				out.push(...(await this.walk(join(root, entry.name), path)));
			} else if (!entry.name.startsWith('.')) {
				const info = await stat(join(root, entry.name)).catch(() => null);
				if (info) out.push({ path, bytes: info.size });
			}
		}
		return out;
	}

	/** Records that a space is in use, so the idle sweep leaves it. */
	private async touch(space: string): Promise<void> {
		const marker = join(this.dir, space, '.used');
		const info = await stat(marker).catch(() => null);
		const now = this.now();
		if (info && now - info.mtimeMs < TOUCH_EVERY_MS) return;
		await mkdir(join(this.dir, space), { recursive: true });
		if (!info) await writeFile(marker, '');
		await utimes(marker, now / 1000, now / 1000);
	}

	/**
	 * Removes idle spaces and abandoned uploads, and recounts the total.
	 * At most once an hour per worker; `force` for tests.
	 */
	async sweep(force = false): Promise<void> {
		const now = this.now();
		if (!force && now - this.lastSweep < SWEEP_EVERY_MS) return;
		this.lastSweep = now;
		let spaces: string[];
		try {
			spaces = await readdir(this.dir);
		} catch {
			this.total = 0;
			return;
		}
		let total = 0;
		for (const space of spaces) {
			// Only what looks like a space: a RELAY_DIR pointed at the wrong
			// directory must never cost anything else in it.
			if (!isSpace(space)) continue;
			const root = join(this.dir, space);
			const used = await stat(join(root, '.used')).catch(() => null);
			if (!used || now - used.mtimeMs > IDLE_MS) {
				await rm(root, { recursive: true, force: true });
				continue;
			}
			for (const upload of await readdir(join(root, 'uploads')).catch(() => [] as string[])) {
				const info = await stat(join(root, 'uploads', upload)).catch(() => null);
				if (!info || now - info.mtimeMs > UPLOAD_TTL_MS) {
					await rm(join(root, 'uploads', upload), { recursive: true, force: true });
				}
			}
			for (const file of await this.walk(this.files(space))) total += file.bytes;
		}
		this.total = total;
	}

	async list(space: string): Promise<string[]> {
		if (!isSpace(space)) throw new RelayError(400);
		await this.sweep();
		const files = await this.walk(this.files(space));
		if (files.length > 0) await this.touch(space);
		return files.map((file) => file.path).filter(isRelayPath);
	}

	/**
	 * What is kept for a space, for the user's own view of it (Art. 15
	 * GDPR): how many files, how many bytes, and the day it was last used.
	 */
	async info(space: string): Promise<{ files: number; bytes: number; lastUsed: string | null }> {
		if (!isSpace(space)) throw new RelayError(400);
		const files = (await this.walk(this.files(space))).filter((file) => isRelayPath(file.path));
		const used = await stat(join(this.dir, space, '.used')).catch(() => null);
		return {
			files: files.length,
			bytes: files.reduce((sum, file) => sum + file.bytes, 0),
			lastUsed: used ? new Date(used.mtimeMs).toISOString().slice(0, 10) : null
		};
	}

	async read(space: string, path: string): Promise<Buffer> {
		if (!isSpace(space) || !isRelayPath(path)) throw new RelayError(400);
		try {
			const bytes = await readFile(join(this.files(space), ...path.split('/')));
			await this.touch(space);
			return bytes;
		} catch (err) {
			if (err instanceof RelayError) throw err;
			throw new RelayError(404);
		}
	}

	/**
	 * Stores part `index` of `count` of a file. The file appears - complete,
	 * under its name - only once the last part is in.
	 */
	async write(
		space: string,
		path: string,
		upload: string,
		index: number,
		count: number,
		bytes: Uint8Array
	): Promise<void> {
		const maxParts = Math.ceil(MAX_FILE_BYTES / PART_BYTES);
		if (
			!isSpace(space) ||
			!isRelayPath(path) ||
			!UPLOAD.test(upload) ||
			!Number.isInteger(count) ||
			count < 1 ||
			count > maxParts ||
			!Number.isInteger(index) ||
			index < 0 ||
			index >= count
		) {
			throw new RelayError(400);
		}
		if (bytes.length === 0 || bytes.length > PART_BYTES) throw new RelayError(413);
		await this.sweep();
		if (index === 0) {
			const used = (await this.walk(this.files(space))).reduce((sum, f) => sum + f.bytes, 0);
			const incoming = count * PART_BYTES;
			if (used + incoming > MAX_SPACE_BYTES) throw new RelayError(507);
			if (this.total + incoming > this.maxTotalBytes) throw new RelayError(507);
		}
		await this.touch(space);
		const parts = join(this.dir, space, 'uploads', upload);
		await mkdir(parts, { recursive: true });
		await writeFile(join(parts, String(index).padStart(4, '0')), bytes);
		if (index < count - 1) return;

		const chunks: Buffer[] = [];
		for (let i = 0; i < count; i++) {
			try {
				chunks.push(await readFile(join(parts, String(i).padStart(4, '0'))));
			} catch {
				throw new RelayError(409);
			}
		}
		await rm(parts, { recursive: true, force: true });
		const file = Buffer.concat(chunks);
		if (file.length > MAX_FILE_BYTES || !file.subarray(0, MAGIC.length).equals(MAGIC)) {
			throw new RelayError(400);
		}
		const target = join(this.files(space), ...path.split('/'));
		await mkdir(dirname(target), { recursive: true });
		// Written under a temporary name and renamed: another worker listing the
		// space must never hand out half a file.
		const temporary = `${target}.${randomBytes(4).toString('hex')}.tmp`;
		await writeFile(temporary, file);
		await rename(temporary, target);
		this.total += file.length;
	}

	/** Not an error when the file is already gone. The last file takes its space with it. */
	async remove(space: string, path: string): Promise<void> {
		if (!isSpace(space) || !isRelayPath(path)) throw new RelayError(400);
		const target = join(this.files(space), ...path.split('/'));
		const info = await stat(target).catch(() => null);
		await rm(target, { force: true });
		if (info) this.total = Math.max(0, this.total - info.size);
		if ((await this.walk(this.files(space))).length === 0) {
			await rm(join(this.dir, space), { recursive: true, force: true });
		}
	}
}
