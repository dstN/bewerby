import {
	DEFAULT_KDF,
	RECOVERY_KEY_BYTES,
	contentKey,
	formatRecoveryKey,
	gunzip,
	gzip,
	importRoot,
	parseRecoveryKey,
	passphraseKek,
	randomBytes,
	recoveryKek,
	unwrapRoot,
	wrapRoot
} from './crypto.js';
import {
	VaultError,
	decodeFile,
	encodePrefix,
	fromBase64,
	pad,
	toBase64,
	unpad,
	utf8,
	type FileHeader,
	type FileKind,
	type KdfParams,
	type KeyHeader
} from './format.js';

/** A vault this session can encrypt and decrypt with. */
export interface UnlockedVault {
	header: KeyHeader;
	/** Non-extractable HKDF key - see importRoot. */
	root: CryptoKey;
}

export type Secret = { passphrase: string } | { recoveryKey: string };

/** Binds a wrapped root to its vault, epoch and slot, so wraps cannot be swapped between them. */
function slotAad(header: Pick<KeyHeader, 'vaultId' | 'epoch'>, slot: 'pass' | 'recovery') {
	return utf8(`bewerby/v1/root/${header.vaultId}/${header.epoch}/${slot}`);
}

/**
 * A new vault: a random root secret, wrapped once under the passphrase and
 * once under a freshly generated recovery key. The recovery key is returned
 * for display exactly once and never stored anywhere.
 */
export async function createVault(
	passphrase: string,
	kdf: Omit<KdfParams, 'alg' | 'salt'> = DEFAULT_KDF
): Promise<{ vault: UnlockedVault; recoveryKey: string }> {
	const ids = { vaultId: toBase64(randomBytes(16)), epoch: 0 };
	const kdfParams: KdfParams = { alg: 'argon2id', ...kdf, salt: toBase64(randomBytes(16)) };
	const root = randomBytes(32);
	const recovery = randomBytes(RECOVERY_KEY_BYTES);
	const recoverySalt = randomBytes(16);
	try {
		const [passWrap, recoveryWrap] = await Promise.all([
			passphraseKek(passphrase, kdfParams).then((kek) => wrapRoot(root, kek, slotAad(ids, 'pass'))),
			recoveryKek(recovery, recoverySalt).then((kek) =>
				wrapRoot(root, kek, slotAad(ids, 'recovery'))
			)
		]);
		const header: KeyHeader = {
			...ids,
			kdf: kdfParams,
			pass: passWrap,
			recovery: { ...recoveryWrap, salt: toBase64(recoverySalt) }
		};
		return {
			vault: { header, root: await importRoot(root) },
			recoveryKey: formatRecoveryKey(recovery)
		};
	} finally {
		root.fill(0);
		recovery.fill(0);
	}
}

/** Throws VaultError('secret') when the passphrase or recovery key does not fit. */
export async function unlock(header: KeyHeader, secret: Secret): Promise<CryptoKey> {
	let root: Uint8Array<ArrayBuffer>;
	if ('passphrase' in secret) {
		const kek = await passphraseKek(secret.passphrase, header.kdf);
		root = await unwrapRoot(header.pass, kek, slotAad(header, 'pass'));
	} else {
		const recovery = parseRecoveryKey(secret.recoveryKey);
		if (!recovery) throw new VaultError('secret');
		const kek = await recoveryKek(recovery, fromBase64(header.recovery.salt));
		root = await unwrapRoot(header.recovery, kek, slotAad(header, 'recovery'));
	}
	try {
		return await importRoot(root);
	} finally {
		root.fill(0);
	}
}

/**
 * Encrypts a payload into a self-contained `.bwv` file: the key header rides
 * along, so the file opens on any device with the passphrase or the
 * recovery key, without anything else.
 */
export async function sealFile(
	vault: UnlockedVault,
	kind: FileKind,
	payload: unknown
): Promise<Uint8Array<ArrayBuffer>> {
	const iv = randomBytes(12);
	const header: FileHeader = { ...vault.header, kind, iv: toBase64(iv) };
	const prefix = encodePrefix(header);
	const plaintext = pad(await gzip(utf8(JSON.stringify(payload))));
	const key = await contentKey(vault.root, 'file');
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: prefix }, key, plaintext)
	);
	const out = new Uint8Array(prefix.length + ciphertext.length);
	out.set(prefix, 0);
	out.set(ciphertext, prefix.length);
	return out;
}

/**
 * Reads only the header, so a file that is not a bewerby backup is turned
 * away before anyone is asked for a passphrase.
 */
export function readFileHeader(bytes: Uint8Array): KeyHeader {
	const { header } = decodeFile(bytes);
	return stripFileFields(header);
}

function stripFileFields(header: FileHeader): KeyHeader {
	const { vaultId, epoch, kdf, pass, recovery } = header;
	return { vaultId, epoch, kdf, pass, recovery };
}

/**
 * Decrypts a `.bwv` file with an already unlocked root. Returns the payload
 * JSON as text with its kind - validating it is the caller's job
 * (parseBackupPayload, decodeSnapshot), exactly as for an unencrypted export.
 */
export async function openFile(
	bytes: Uint8Array,
	root: CryptoKey
): Promise<{ kind: FileKind; json: string }> {
	const { header, aad, ciphertext } = decodeFile(bytes);
	const key = await contentKey(root, 'file');
	let plain: Uint8Array<ArrayBuffer>;
	try {
		plain = new Uint8Array(
			await crypto.subtle.decrypt(
				{ name: 'AES-GCM', iv: fromBase64(header.iv), additionalData: aad },
				key,
				ciphertext
			)
		);
	} catch {
		throw new VaultError('corrupt');
	}
	const json = await gunzip(new Uint8Array(unpad(plain)));
	try {
		return { kind: header.kind, json: new TextDecoder('utf-8', { fatal: true }).decode(json) };
	} catch {
		throw new VaultError('corrupt');
	}
}
