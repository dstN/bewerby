import { utf8 } from '#lib/vault/format.js';
import { base64url } from '../oauth.js';
import type { RemoteStore } from '../port.js';

/**
 * The encrypted sync store on bewerby.de (#58), for when the other devices
 * are closed. Same files as in a Dropbox app folder - ciphertext only - in a
 * space whose id derives from the vault's root key: only devices with the
 * key find it, and a new key (#56) means a new space.
 *
 * Space, path and operation go in headers of a POST, so none of them lands
 * in the request line of the server's access log.
 */

const ENDPOINT = '/api/relay';
/**
 * On every request, bodiless ones included: SvelteKit treats a POST without
 * a content type as a form submission and checks its Origin against an
 * https origin it assumes behind Passenger. The route checks the Origin by
 * host instead, and another site cannot send this type without a CORS
 * preflight, which it does not pass.
 */
const BINARY = { 'Content-Type': 'application/octet-stream' };
/** Below adapter-node's 512 KB body limit; must match PART_BYTES on the server. */
const PART_BYTES = 256 * 1024;

type Fetch = typeof fetch;

/** 32 bytes from the root, base64url: the space id, and the only way in. */
export async function relaySpace(root: CryptoKey): Promise<string> {
	const key = await crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: new Uint8Array(0),
			info: utf8('bewerby/v1/relay-space')
		},
		root,
		{ name: 'HMAC', hash: 'SHA-256', length: 256 },
		false,
		['sign']
	);
	return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8('space'))));
}

export class RelayStore implements RemoteStore {
	constructor(
		private readonly space: string,
		private readonly fetcher: Fetch = fetch
	) {}

	private async call(
		op: string,
		headers: Record<string, string> = {},
		body?: Uint8Array<ArrayBuffer>
	): Promise<Response> {
		const response = await this.fetcher(ENDPOINT, {
			method: 'POST',
			headers: { ...BINARY, 'x-relay-op': op, 'x-relay-space': this.space, ...headers },
			body
		});
		if (!response.ok && !(op === 'remove' && response.status === 404)) {
			throw new Error(`bewerby.de store: ${op} failed with ${response.status}`);
		}
		return response;
	}

	async list(): Promise<string[]> {
		const { files } = (await (await this.call('list')).json()) as { files: string[] };
		return files;
	}

	/** What the server keeps for this space: the user's own view of it (Art. 15 GDPR). */
	async info(): Promise<{ files: number; bytes: number; lastUsed: string | null }> {
		return (await this.call('info')).json() as Promise<{
			files: number;
			bytes: number;
			lastUsed: string | null;
		}>;
	}

	async read(path: string): Promise<Uint8Array> {
		return new Uint8Array(await (await this.call('read', { 'x-relay-path': path })).arrayBuffer());
	}

	async write(path: string, bytes: Uint8Array): Promise<void> {
		const upload = base64url(crypto.getRandomValues(new Uint8Array(12)));
		const parts = Math.max(1, Math.ceil(bytes.length / PART_BYTES));
		for (let part = 0; part < parts; part++) {
			await this.call(
				'write',
				{
					'x-relay-path': path,
					'x-relay-upload': upload,
					'x-relay-part': String(part),
					'x-relay-parts': String(parts)
				},
				bytes.slice(part * PART_BYTES, (part + 1) * PART_BYTES)
			);
		}
	}

	async remove(path: string): Promise<void> {
		await this.call('remove', { 'x-relay-path': path });
	}
}
