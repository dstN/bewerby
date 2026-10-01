/**
 * The on-disk shape of an encrypted bewerby file (`.bwv`) and everything
 * needed to read one back safely. Pure byte handling - no keys, no crypto -
 * so the parser can be fuzzed on its own: a file is untrusted input until
 * AES-GCM has authenticated it, and the header has to be read *before* that.
 *
 *   "BWV" | version (1 byte) | header length (uint32, big endian) | header JSON | ciphertext
 *
 * Everything before the ciphertext is the AES-GCM additional data, so a
 * flipped byte anywhere in the file fails decryption. See
 * docs/adr/0001-e2e-sync-crypto.md for why the format looks like this.
 */

export type VaultErrorCode =
	/** Not a bewerby file, or a header that does not parse or is out of bounds. */
	| 'format'
	/** A newer format version than this build understands. */
	| 'unsupported'
	/** The passphrase or recovery key does not open this file's key. */
	| 'secret'
	/** The key opened, but the content does not authenticate: damaged or altered. */
	| 'corrupt';

export class VaultError extends Error {
	constructor(readonly code: VaultErrorCode) {
		super(`vault: ${code}`);
		this.name = 'VaultError';
	}
}

const MAGIC = [0x42, 0x57, 0x56]; // "BWV"
export const FORMAT_VERSION = 1;
const PREFIX_BYTES = MAGIC.length + 1 + 4;
const MAX_HEADER_BYTES = 16 * 1024;

/**
 * Upper bounds for KDF parameters read from a file. The header is read
 * before anything is authenticated, so without a ceiling a crafted file could
 * ask Argon2 for gigabytes of memory and take the tab down.
 */
export const KDF_LIMITS = { maxMemoryKiB: 256 * 1024, maxIterations: 10, maxParallelism: 4 };

export interface KdfParams {
	alg: 'argon2id';
	/** Memory in KiB, as Argon2 counts it. */
	m: number;
	t: number;
	p: number;
	salt: string;
}

/** A 32-byte root secret, AES-GCM encrypted under a key-encryption key. */
export interface WrappedKey {
	iv: string;
	ct: string;
}

/**
 * Everything needed to recover the root secret from a passphrase or the
 * recovery key. Stored locally (keystore.ts) and copied into every file, so
 * a file can be opened on a device that has never seen this vault.
 */
export interface KeyHeader {
	vaultId: string;
	epoch: number;
	kdf: KdfParams;
	pass: WrappedKey;
	recovery: WrappedKey & { salt: string };
}

export interface FileHeader extends KeyHeader {
	/** What the plaintext is. Phase 1 only writes backups (BackupPayload JSON). */
	kind: 'backup';
	/** The IV of the content encryption. */
	iv: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function utf8(text: string): Uint8Array<ArrayBuffer> {
	return encoder.encode(text);
}

export function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

/** Throws VaultError('format') on anything that is not clean base64. */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
	let binary: string;
	try {
		binary = atob(text);
	} catch {
		throw new VaultError('format');
	}
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/** Magic, version, length and header: the bytes the ciphertext is bound to. */
export function encodePrefix(header: FileHeader): Uint8Array<ArrayBuffer> {
	const json = utf8(JSON.stringify(header));
	const out = new Uint8Array(PREFIX_BYTES + json.length);
	out.set(MAGIC, 0);
	out[MAGIC.length] = FORMAT_VERSION;
	new DataView(out.buffer).setUint32(MAGIC.length + 1, json.length);
	out.set(json, PREFIX_BYTES);
	return out;
}

export function decodeFile(bytes: Uint8Array): {
	header: FileHeader;
	/** The authenticated prefix, to pass as AES-GCM additional data. */
	aad: Uint8Array<ArrayBuffer>;
	ciphertext: Uint8Array<ArrayBuffer>;
} {
	if (bytes.length < PREFIX_BYTES || MAGIC.some((byte, i) => bytes[i] !== byte)) {
		throw new VaultError('format');
	}
	if (bytes[MAGIC.length] !== FORMAT_VERSION) throw new VaultError('unsupported');

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const headerLength = view.getUint32(MAGIC.length + 1);
	const end = PREFIX_BYTES + headerLength;
	if (headerLength === 0 || headerLength > MAX_HEADER_BYTES || end >= bytes.length) {
		throw new VaultError('format');
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(decoder.decode(bytes.subarray(PREFIX_BYTES, end)));
	} catch {
		throw new VaultError('format');
	}

	return {
		header: parseFileHeader(parsed),
		aad: bytes.slice(0, end),
		ciphertext: bytes.slice(end)
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInt(value: unknown, min: number, max: number): value is number {
	return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

/** A base64 field that must decode to exactly `length` bytes. */
function isB64(value: unknown, length: number): value is string {
	if (typeof value !== 'string') return false;
	try {
		return fromBase64(value).length === length;
	} catch {
		return false;
	}
}

/** 32-byte root secret plus the 16-byte GCM tag. */
const WRAPPED_ROOT_BYTES = 48;

function isWrapped(value: unknown): value is WrappedKey {
	return isRecord(value) && isB64(value.iv, 12) && isB64(value.ct, WRAPPED_ROOT_BYTES);
}

/**
 * Validates a key header field by field. Shared by the file parser and the
 * keystore, since a stored header is just as able to be tampered with.
 */
export function parseKeyHeader(value: unknown): KeyHeader {
	if (!isRecord(value)) throw new VaultError('format');
	const { vaultId, epoch, kdf, pass, recovery } = value;
	const recoverySalt = isRecord(recovery) ? recovery.salt : undefined;
	if (
		!isB64(vaultId, 16) ||
		!isInt(epoch, 0, 2 ** 31) ||
		!isRecord(kdf) ||
		kdf.alg !== 'argon2id' ||
		!isInt(kdf.m, 8, KDF_LIMITS.maxMemoryKiB) ||
		!isInt(kdf.t, 1, KDF_LIMITS.maxIterations) ||
		!isInt(kdf.p, 1, KDF_LIMITS.maxParallelism) ||
		!isB64(kdf.salt, 16) ||
		!isWrapped(pass) ||
		!isWrapped(recovery) ||
		!isB64(recoverySalt, 16)
	) {
		throw new VaultError('format');
	}
	return {
		vaultId,
		epoch,
		kdf: { alg: 'argon2id', m: kdf.m, t: kdf.t, p: kdf.p, salt: kdf.salt },
		pass: { iv: pass.iv, ct: pass.ct },
		recovery: { iv: recovery.iv, ct: recovery.ct, salt: recoverySalt }
	};
}

function parseFileHeader(value: unknown): FileHeader {
	if (!isRecord(value) || value.kind !== 'backup' || !isB64(value.iv, 12)) {
		throw new VaultError('format');
	}
	return { ...parseKeyHeader(value), kind: 'backup', iv: value.iv };
}

/**
 * Padmé (Nikitin et al., "Reducing Metadata Leakage from Encrypted Files and
 * Communication with PURBs", 2019): rounds a length up so that only
 * O(log log L) bits of it remain visible, at most ~12 % overhead. Whoever
 * stores the file learns its size class, not how many applications or PDFs
 * it holds.
 */
export function padme(length: number): number {
	if (length < 2) return length;
	const e = Math.floor(Math.log2(length));
	const s = Math.floor(Math.log2(e)) + 1;
	const step = 2 ** (e - s);
	return Math.ceil(length / step) * step;
}

/** Length-prefixes the data, then zero-fills up to the Padmé size. */
export function pad(data: Uint8Array): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(padme(4 + data.length));
	new DataView(out.buffer).setUint32(0, data.length);
	out.set(data, 4);
	return out;
}

export function unpad(padded: Uint8Array): Uint8Array {
	if (padded.length < 4) throw new VaultError('corrupt');
	const length = new DataView(padded.buffer, padded.byteOffset, padded.byteLength).getUint32(0);
	if (4 + length > padded.length) throw new VaultError('corrupt');
	return padded.subarray(4, 4 + length);
}
