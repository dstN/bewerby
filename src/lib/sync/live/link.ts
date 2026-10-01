import type { SyncRuntime } from '$lib/crdt/runtime.js';
import { fromBase64, toBase64 } from '$lib/vault/format.js';

/**
 * Keeps two devices' documents in step over an open data channel (#55).
 * On opening, each side sends its state vector and answers the other's with
 * exactly what it is missing; after that, every local change goes over as
 * it happens. PDFs follow on request, in chunks a data channel can carry.
 *
 * Plain Yjs state vectors and updates (Y.encodeStateVector,
 * Y.encodeStateAsUpdate) - no y-protocols, no y-webrtc.
 */

/** Well under the 256 KB a data channel message can safely hold. */
const CHUNK = 48 * 1024;
const EMPTY_UPDATE = new Uint8Array([0, 0]);

type Message =
	| { t: 'sv'; sv: string }
	| { t: 'update'; update: string }
	| { t: 'want'; ids: string[] }
	| { t: 'blob'; id: string; part: number; parts: number; data: string };

export class DocLink {
	private readonly stopListening: () => void;
	private readonly incoming = new Map<string, string[]>();
	private wanted = new Set<string>();
	private updated = false;
	private settledResolve!: () => void;
	/** Resolves once the other side's state and every missing PDF are in. */
	readonly settled = new Promise<void>((resolve) => (this.settledResolve = resolve));

	constructor(
		private readonly runtime: SyncRuntime,
		private readonly channel: RTCDataChannel
	) {
		channel.addEventListener('message', (event) => {
			try {
				void this.receive(JSON.parse(event.data as string) as Message);
			} catch (err) {
				console.warn('Live sync: dropped a malformed message', err);
			}
		});
		this.stopListening = runtime.onLocalChange((update) =>
			this.send({ t: 'update', update: toBase64(update) })
		);
	}

	start(): void {
		this.send({ t: 'sv', sv: toBase64(this.runtime.stateVector()) });
	}

	close(): void {
		this.stopListening();
		if (this.channel.readyState === 'open') this.channel.close();
	}

	private send(message: Message): void {
		if (this.channel.readyState === 'open') this.channel.send(JSON.stringify(message));
	}

	private async receive(message: Message): Promise<void> {
		switch (message.t) {
			case 'sv':
				this.send({
					t: 'update',
					update: toBase64(this.runtime.diffSince(fromBase64(message.sv)))
				});
				return;
			case 'update':
				await this.runtime.applyRemote([{ update: fromBase64(message.update), blobs: {} }]);
				this.updated = true;
				await this.requestMissing();
				return;
			case 'want':
				for (const id of message.ids) await this.sendBlob(id);
				return;
			case 'blob':
				await this.receiveBlob(message);
				return;
		}
	}

	private async requestMissing(): Promise<void> {
		const missing: string[] = [];
		for (const id of this.runtime.referencedBlobIds()) {
			if (!this.wanted.has(id) && !(await this.runtime.hasBlob(id))) missing.push(id);
		}
		for (const id of missing) this.wanted.add(id);
		if (missing.length > 0) this.send({ t: 'want', ids: missing });
		this.checkSettled();
	}

	private async sendBlob(id: string): Promise<void> {
		const bytes = await this.runtime.blobBytes(id);
		if (!bytes) return;
		const parts = Math.max(1, Math.ceil(bytes.length / CHUNK));
		for (let part = 0; part < parts; part++) {
			const data = toBase64(bytes.subarray(part * CHUNK, (part + 1) * CHUNK));
			this.send({ t: 'blob', id, part, parts, data });
		}
	}

	private async receiveBlob(message: Extract<Message, { t: 'blob' }>): Promise<void> {
		if (!this.wanted.has(message.id) || message.parts > 10_000) return;
		const parts = this.incoming.get(message.id) ?? new Array<string>(message.parts);
		parts[message.part] = message.data;
		this.incoming.set(message.id, parts);
		if (parts.filter((part) => part !== undefined).length < message.parts) return;
		this.incoming.delete(message.id);
		const chunks = parts.map((part) => fromBase64(part));
		const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.length;
		}
		await this.runtime.applyRemote([{ update: EMPTY_UPDATE, blobs: { [message.id]: bytes } }]);
		this.wanted.delete(message.id);
		this.checkSettled();
	}

	private checkSettled(): void {
		if (this.updated && this.wanted.size === 0) this.settledResolve();
	}
}
