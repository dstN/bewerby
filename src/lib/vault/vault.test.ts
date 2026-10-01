import { argon2Sync } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import type { BackupPayload } from '$lib/utils/backup.js';
import { runArgon2 } from './argon2.js';
import { formatRecoveryKey, parseRecoveryKey, randomBytes } from './crypto.js';
import { VaultError, decodeFile, pad, padme, unpad } from './format.js';
import { createVault, openBackup, readFileHeader, sealBackup, unlock } from './vault.js';

// The real default (64 MiB, t = 3) would take seconds per test; the format
// and the code paths are the same at any cost setting.
const FAST_KDF = { m: 256, t: 1, p: 1 };

const payload: BackupPayload = {
	version: 3,
	exportedAt: 1_790_000_000_000,
	applications: [],
	pdfs: { 'a.pdf': 'JVBERi0xLjQK' },
	profile: undefined
};

async function vaultError(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (err) {
		if (err instanceof VaultError) return err.code;
		throw err;
	}
	throw new Error('expected a VaultError, got success');
}

/** Deterministic, so a failing fuzz case can be replayed. */
function seededRandom(seed: number) {
	return () => {
		seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
		return seed / 2 ** 31;
	};
}

describe('vault', () => {
	it('opens its own backup with the passphrase and with the recovery key', async () => {
		const { vault, recoveryKey } = await createVault(
			'korrekt pferd batterie heftklammer',
			FAST_KDF
		);
		const file = await sealBackup(vault, payload);
		const header = readFileHeader(file);
		expect(header.vaultId).toBe(vault.header.vaultId);

		const byPassphrase = await unlock(header, { passphrase: 'korrekt pferd batterie heftklammer' });
		expect(JSON.parse(await openBackup(file, byPassphrase))).toEqual(
			JSON.parse(JSON.stringify(payload))
		);

		const byRecovery = await unlock(header, { recoveryKey });
		expect(JSON.parse(await openBackup(file, byRecovery)).pdfs).toEqual(payload.pdfs);
	});

	it('accepts the recovery key the way people actually type it back', async () => {
		const { vault, recoveryKey } = await createVault('ein langes passwort', FAST_KDF);
		const sloppy = recoveryKey.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o');
		await expect(unlock(vault.header, { recoveryKey: sloppy })).resolves.toBeInstanceOf(CryptoKey);
	});

	it('refuses a wrong passphrase, a wrong recovery key and a malformed one alike', async () => {
		const { vault } = await createVault('das richtige passwort', FAST_KDF);
		expect(await vaultError(unlock(vault.header, { passphrase: 'das falsche passwort' }))).toBe(
			'secret'
		);
		const other = formatRecoveryKey(randomBytes(20));
		expect(await vaultError(unlock(vault.header, { recoveryKey: other }))).toBe('secret');
		expect(await vaultError(unlock(vault.header, { recoveryKey: 'ABCD-EFGH' }))).toBe('secret');
	});

	it('does not open another vault with this vault’s passphrase', async () => {
		const a = await createVault('gleiches passwort', FAST_KDF);
		const b = await createVault('gleiches passwort', FAST_KDF);
		const file = await sealBackup(a.vault, payload);
		expect(await vaultError(openBackup(file, b.vault.root))).toBe('corrupt');
	});

	it('encrypts the same backup differently every time', async () => {
		const { vault } = await createVault('ein langes passwort', FAST_KDF);
		const first = await sealBackup(vault, payload);
		const second = await sealBackup(vault, payload);
		expect(Buffer.from(first).equals(Buffer.from(second))).toBe(false);
		await expect(openBackup(second, vault.root)).resolves.toContain('JVBERi0xLjQK');
	});

	it('fails on any flipped byte, in the header as much as in the ciphertext', async () => {
		const { vault } = await createVault('ein langes passwort', FAST_KDF);
		const file = await sealBackup(vault, payload);
		const random = seededRandom(7);
		for (let i = 0; i < 200; i++) {
			const tampered = file.slice();
			const position = Math.floor(random() * file.length);
			tampered[position] ^= 1 + Math.floor(random() * 255);
			// The original root, so only the header binding (AAD) and the tag
			// stand between the edit and a successful decryption.
			const code = await vaultError(openBackup(tampered, vault.root));
			expect(['format', 'unsupported', 'corrupt']).toContain(code);
		}
	});

	it('catches a header edit that still parses', async () => {
		const { vault } = await createVault('ein langes passwort', FAST_KDF);
		const file = await sealBackup(vault, payload);
		const text = Buffer.from(file).toString('latin1');
		const id = vault.header.vaultId;
		const swapped = id[0] === 'A' ? `B${id.slice(1)}` : `A${id.slice(1)}`;
		const edited = new Uint8Array(Buffer.from(text.replace(id, swapped), 'latin1'));
		expect(readFileHeader(edited).vaultId).toBe(swapped);
		expect(await vaultError(openBackup(edited, vault.root))).toBe('corrupt');
	});

	it('turns arbitrary bytes into a format error, never a crash', () => {
		const random = seededRandom(42);
		for (let i = 0; i < 500; i++) {
			const length = Math.floor(random() * 300);
			const bytes = new Uint8Array(length).map(() => Math.floor(random() * 256));
			// Half of them with a valid magic and version, to get past the first check.
			if (i % 2 === 0 && length > 8) bytes.set([0x42, 0x57, 0x56, 1], 0);
			expect(() => decodeFile(bytes)).toThrow(VaultError);
		}
	});

	it('refuses KDF parameters that would let a file exhaust memory', async () => {
		const { vault } = await createVault('ein langes passwort', FAST_KDF);
		const file = await sealBackup(vault, payload);
		const text = Buffer.from(file).toString('latin1');
		const greedy = text.replace(`"m":${FAST_KDF.m}`, '"m":99999999');
		expect(() => readFileHeader(new Uint8Array(Buffer.from(greedy, 'latin1')))).toThrow(VaultError);
	});
});

describe('padding', () => {
	it('rounds up by at most 12 % and always fits', () => {
		for (let length = 1; length < 200_000; length += 97) {
			const padded = padme(length);
			expect(padded).toBeGreaterThanOrEqual(length);
			expect(padded - length).toBeLessThanOrEqual(Math.ceil(length * 0.12));
		}
	});

	it('hides the exact length inside a size class', () => {
		expect(padme(1000)).toBe(padme(1001));
	});

	it('round-trips through pad and unpad', () => {
		const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7]);
		expect([...unpad(pad(data))]).toEqual([...data]);
		expect(() => unpad(new Uint8Array([0, 0, 1, 0, 9]))).toThrow(VaultError);
	});
});

describe('recovery key', () => {
	it('is 32 Crockford characters in groups of four and parses back', () => {
		const bytes = randomBytes(20);
		const text = formatRecoveryKey(bytes);
		expect(text).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
		expect([...parseRecoveryKey(text)!]).toEqual([...bytes]);
	});

	it('rejects the wrong length and letters Crockford leaves out', () => {
		expect(parseRecoveryKey('ABCD')).toBeNull();
		expect(parseRecoveryKey('U'.repeat(32))).toBeNull();
	});
});

describe('argon2id', () => {
	it('matches Node’s native implementation', async () => {
		const salt = randomBytes(16);
		const ours = await runArgon2({ password: 'pässwort', salt, m: 1024, t: 2, p: 1 });
		const native = argon2Sync('argon2id', {
			message: Buffer.from('pässwort', 'utf8'),
			nonce: salt,
			parallelism: 1,
			tagLength: 32,
			memory: 1024,
			passes: 2
		});
		expect(Buffer.from(ours).equals(native)).toBe(true);
	});
});
