import { base64url } from '../oauth.js';
import { seal, unseal, type SignalKeys } from './keys.js';

/**
 * A seat in one signaling room on /api/signal (#55): sends sealed messages,
 * long-polls for the others'. What the server stores is ciphertext; what
 * comes back is opened here, and anything that does not open is dropped.
 */
export class SignalClient {
	/** This tab's id in the room; random per visit, not tied to the device. */
	readonly id = base64url(crypto.getRandomValues(new Uint8Array(12)));
	private after = '';

	constructor(
		private readonly keys: SignalKeys,
		private readonly fetchFn: typeof fetch = fetch.bind(globalThis)
	) {}

	private post(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
		return this.fetchFn('/api/signal', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ room: this.keys.room, from: this.id, ...body }),
			signal
		});
	}

	async send(message: Record<string, unknown>): Promise<void> {
		const response = await this.post({ op: 'send', payload: await seal(this.keys, message) });
		if (!response.ok) throw new Error(`Signaling failed: ${response.status}`);
	}

	/** Waits up to 25 s on the server for messages from others. */
	async receive(
		signal?: AbortSignal
	): Promise<Array<{ from: string; message: Record<string, unknown> }>> {
		const response = await this.post({ op: 'receive', after: this.after }, signal);
		if (!response.ok) throw new Error(`Signaling failed: ${response.status}`);
		const { messages } = (await response.json()) as {
			messages: Array<{ id: string; from: string; payload: string }>;
		};
		const out: Array<{ from: string; message: Record<string, unknown> }> = [];
		for (const entry of messages) {
			this.after = entry.id;
			const message = await unseal(this.keys, entry.payload);
			if (message && typeof message === 'object') {
				out.push({ from: entry.from, message: message as Record<string, unknown> });
			}
		}
		return out;
	}
}
