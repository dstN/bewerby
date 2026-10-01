import {
	VaultError,
	fromBase64,
	toBase64,
	utf8,
	type KdfParams,
	type WrappedKey
} from './format.js';

/**
 * The key primitives: Argon2id and HKDF key-encryption keys, wrapping the
 * 32-byte root secret, and deriving purpose-bound content keys from it. All
 * keys that come out of here are non-extractable; only the root secret
 * passes through JavaScript as bytes, once when it is created or unwrapped.
 * See docs/adr/0001-e2e-sync-crypto.md.
 */

/**
 * Calibrated to about a second on a mid-range phone; re-measured in #49.
 * OWASP's floor for Argon2id is 19 MiB with t = 2.
 */
export const DEFAULT_KDF = { m: 64 * 1024, t: 3, p: 1 };

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
	return crypto.getRandomValues(new Uint8Array(length));
}

async function argon2(passphrase: string, kdf: KdfParams): Promise<Uint8Array<ArrayBuffer>> {
	const input = {
		// NFC, so the same passphrase typed on macOS and on Windows derives
		// the same key even when one of them composes umlauts differently.
		password: passphrase.normalize('NFC'),
		salt: fromBase64(kdf.salt),
		m: kdf.m,
		t: kdf.t,
		p: kdf.p
	};
	if (typeof Worker === 'undefined') {
		const { runArgon2 } = await import('./argon2.js');
		return runArgon2(input);
	}
	const worker = new Worker(new URL('./kdf.worker.ts', import.meta.url), { type: 'module' });
	try {
		return await new Promise((resolve, reject) => {
			worker.onmessage = (event: MessageEvent<Uint8Array<ArrayBuffer> | null>) =>
				event.data ? resolve(event.data) : reject(new Error('Argon2id failed'));
			worker.onerror = () => reject(new Error('Argon2id worker failed'));
			worker.postMessage(input);
		});
	} finally {
		worker.terminate();
	}
}

async function aesKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Key-encryption key from the passphrase. Slow by design. */
export async function passphraseKek(passphrase: string, kdf: KdfParams): Promise<CryptoKey> {
	const raw = await argon2(passphrase, kdf);
	try {
		return await aesKey(raw);
	} finally {
		raw.fill(0);
	}
}

/**
 * Key-encryption key from the recovery key. The recovery key is 160 random
 * bits, so a fast HKDF is enough - there is nothing to brute-force.
 */
export async function recoveryKek(
	recovery: Uint8Array<ArrayBuffer>,
	salt: Uint8Array<ArrayBuffer>
): Promise<CryptoKey> {
	const base = await crypto.subtle.importKey('raw', recovery, 'HKDF', false, ['deriveKey']);
	return crypto.subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt, info: utf8('bewerby/v1/recovery-kek') },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

export async function wrapRoot(
	root: Uint8Array<ArrayBuffer>,
	kek: CryptoKey,
	aad: Uint8Array<ArrayBuffer>
): Promise<WrappedKey> {
	const iv = randomBytes(12);
	const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, kek, root);
	return { iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
}

/** A wrong passphrase or recovery key shows up here, as a failed tag. */
export async function unwrapRoot(
	wrapped: WrappedKey,
	kek: CryptoKey,
	aad: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
	try {
		const plain = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: fromBase64(wrapped.iv), additionalData: aad },
			kek,
			fromBase64(wrapped.ct)
		);
		return new Uint8Array(plain);
	} catch {
		throw new VaultError('secret');
	}
}

/**
 * The root secret as a non-extractable HKDF key. Everything that encrypts
 * content derives its own key from this one, so a key never serves two
 * purposes (file backups now; sync updates, PDFs and the live channel later).
 */
export async function importRoot(root: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', root, 'HKDF', false, ['deriveKey']);
}

export type KeyPurpose = 'file';

export async function contentKey(root: CryptoKey, purpose: KeyPurpose): Promise<CryptoKey> {
	return crypto.subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8(`bewerby/v1/${purpose}`) },
		root,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

// Crockford's base32: no I, L, O or U, so a recovery key copied by hand
// cannot be misread as 1, 0 or a curse word.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RECOVERY_KEY_BYTES = 20;

/** Any bytes as Crockford characters, ungrouped. */
export function toCrockford(bytes: Uint8Array): string {
	return formatRecoveryKey(bytes).replace(/-/g, '');
}

/** The inverse of toCrockford for exactly `length` bytes; null otherwise. */
export function fromCrockford(text: string, length: number): Uint8Array<ArrayBuffer> | null {
	const clean = normalizeRecoveryInput(text);
	if (clean.length !== Math.ceil((length * 8) / 5)) return null;
	const out = new Uint8Array(length);
	let bits = 0;
	let value = 0;
	let index = 0;
	for (const char of clean) {
		const digit = CROCKFORD.indexOf(char);
		if (digit < 0) return null;
		value = ((value << 5) | digit) & 0xffff;
		bits += 5;
		if (bits >= 8 && index < length) {
			out[index++] = (value >>> (bits - 8)) & 0xff;
			bits -= 8;
		}
	}
	return out;
}

/** 20 bytes as 32 Crockford characters in groups of four: ABCD-EFGH-… */
export function formatRecoveryKey(bytes: Uint8Array): string {
	let bits = 0;
	let value = 0;
	let out = '';
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += CROCKFORD[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31];
	return out.match(/.{1,4}/g)!.join('-');
}

/**
 * Forgiving on input: case, spaces, hyphens, and the look-alikes Crockford
 * defines (O as 0, I and L as 1).
 */
export function normalizeRecoveryInput(text: string): string {
	return text.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

/** Strict on length; null when the text cannot be a recovery key at all. */
export function parseRecoveryKey(text: string): Uint8Array<ArrayBuffer> | null {
	return fromCrockford(text, RECOVERY_KEY_BYTES);
}

export async function gzip(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
	const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzip(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
	try {
		const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
		return new Uint8Array(await new Response(stream).arrayBuffer());
	} catch {
		throw new VaultError('corrupt');
	}
}
