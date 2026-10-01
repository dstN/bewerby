import { fromBase64, toBase64, utf8 } from '$lib/vault/format.js';
import { base64url } from '../oauth.js';

/**
 * Keys for the signaling of live sync (#55). Two cases:
 *
 * - Pairing a new device: everything derives from 16 random bytes that only
 *   travel in the QR code (or as a typed code) - the room the two devices
 *   meet in, the key their signaling messages are sealed with, and the
 *   comparison code that rules out a third device that saw the QR code.
 * - Devices of one vault meeting later: derived from the vault's root, so
 *   only devices holding the key find and understand each other.
 *
 * The mailbox on bewerby.de only ever sees the room id and ciphertext.
 */

export interface SignalKeys {
	room: string;
	key: CryptoKey;
}

async function hkdfBits(
	base: CryptoKey,
	info: string,
	salt: Uint8Array<ArrayBuffer>,
	bits: number
) {
	return new Uint8Array(
		await crypto.subtle.deriveBits(
			{ name: 'HKDF', hash: 'SHA-256', salt, info: utf8(info) },
			base,
			bits
		)
	);
}

function aesFrom(base: CryptoKey, info: string): Promise<CryptoKey> {
	return crypto.subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8(info) },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

function importSecret(secret: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey', 'deriveBits']);
}

export async function pairingKeys(secret: Uint8Array<ArrayBuffer>): Promise<SignalKeys> {
	const base = await importSecret(secret);
	return {
		room: base64url(await hkdfBits(base, 'bewerby/v1/pair-room', new Uint8Array(0), 128)),
		key: await aesFrom(base, 'bewerby/v1/pair-signal')
	};
}

/**
 * Six digits both devices show and the user compares. Bound to the secret
 * and to both DTLS fingerprints: someone who photographed the QR code and
 * raced the real device would get a different connection, and so a
 * different code.
 */
export async function comparisonCode(
	secret: Uint8Array<ArrayBuffer>,
	fingerprints: [string, string]
): Promise<string> {
	const base = await importSecret(secret);
	const salt = utf8([...fingerprints].sort().join('|'));
	const bytes = await hkdfBits(base, 'bewerby/v1/pair-code', salt, 32);
	const value = new DataView(bytes.buffer).getUint32(0) % 1_000_000;
	return String(value).padStart(6, '0');
}

export async function liveKeys(root: CryptoKey): Promise<SignalKeys> {
	const roomKey = await crypto.subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8('bewerby/v1/live-room') },
		root,
		{ name: 'HMAC', hash: 'SHA-256', length: 256 },
		false,
		['sign']
	);
	const mac = new Uint8Array(await crypto.subtle.sign('HMAC', roomKey, utf8('room')));
	return {
		room: base64url(mac.subarray(0, 16)),
		key: await aesFrom(root, 'bewerby/v1/live-signal')
	};
}

/** JSON sealed with AES-GCM, bound to its room; IV and ciphertext as base64. */
export async function seal(keys: SignalKeys, message: unknown): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv, additionalData: utf8(keys.room) },
			keys.key,
			utf8(JSON.stringify(message))
		)
	);
	const out = new Uint8Array(iv.length + ct.length);
	out.set(iv, 0);
	out.set(ct, iv.length);
	return toBase64(out);
}

/** Null for anything that was not sealed with this room's key. */
export async function unseal(keys: SignalKeys, payload: string): Promise<unknown> {
	try {
		const bytes = fromBase64(payload);
		const plain = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: utf8(keys.room) },
			keys.key,
			bytes.subarray(12)
		);
		return JSON.parse(new TextDecoder().decode(plain));
	} catch {
		return null;
	}
}
