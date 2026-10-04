import { activeSync } from '#lib/crdt/session.js';
import { fromCrockford, importRoot, randomBytes, toCrockford } from '#lib/vault/crypto.js';
import { fromBase64, parseKeyHeader, toBase64, type KeyHeader } from '#lib/vault/format.js';
import { adoptVault } from '#lib/vault/session.js';
import { syncRunner } from '../runner.svelte.js';
import { SyncState, type TargetConfig } from '../state.js';
import { DocLink } from './link.js';
import { comparisonCode, pairingKeys } from './keys.js';
import {
	answerOffer,
	completeOffer,
	createOffer,
	fingerprint,
	opened,
	type Offer
} from './peer.js';
import { SignalClient } from './signal.js';

/**
 * Adding a device without typing the passphrase on it (#55).
 *
 * The existing device (host) makes 16 random bytes and shows them as a QR
 * code / link / typed code. Both devices derive a signaling room and key
 * from them, swap a sealed offer and answer through /api/signal, and open a
 * WebRTC data channel. Both then show a six-digit code computed from the
 * secret and both DTLS fingerprints; only when the user confirms on the host
 * that they match does the host send the vault's key header and root over
 * the channel. The new device adopts the vault, and the two documents merge.
 *
 * The host also passes on where it syncs: a cloud account's refresh token,
 * so the new device keeps up while the other one is closed. A folder cannot
 * be passed on. The new device takes the target only if it has none of its
 * own.
 */

export const PAIRING_SECRET_BYTES = 16;
const PAIRING_TIMEOUT_MS = 3 * 60 * 1000;
const SETTLE_TIMEOUT_MS = 30_000;

export function pairingLink(secret: Uint8Array): string {
	return `${location.origin}/pair#p=${toCrockford(secret)}`;
}

/** The code as people type it: groups of four, any case, dashes optional. */
export function formatPairingCode(secret: Uint8Array): string {
	return toCrockford(secret)
		.match(/.{1,4}/g)!
		.join('-');
}

export function parsePairingCode(text: string): Uint8Array<ArrayBuffer> | null {
	return fromCrockford(text, PAIRING_SECRET_BYTES);
}

/** A short, human label for the confirmation question ("Add 'Android'?"). */
export function deviceLabel(userAgent = navigator.userAgent): string {
	if (/iPhone|iPad/.test(userAgent)) return 'iPhone / iPad';
	if (/Android/.test(userAgent)) return 'Android';
	if (/Mac OS X/.test(userAgent)) return 'Mac';
	if (/Windows/.test(userAgent)) return 'Windows';
	if (/Linux/.test(userAgent)) return 'Linux';
	return 'Browser';
}

/** What of a target can travel to another device: no folder, no access token. */
export function shareableTarget(target: TargetConfig | null | undefined): TargetConfig | null {
	if (!target || target.kind === 'folder') return null;
	return { kind: target.kind, refreshToken: target.refreshToken };
}

/** A target received over the channel, checked field by field. */
export function receivedTarget(value: unknown): TargetConfig | null {
	if (typeof value !== 'object' || value === null) return null;
	const { kind, refreshToken } = value as Record<string, unknown>;
	if (
		(kind === 'dropbox' || kind === 'onedrive' || kind === 'google') &&
		typeof refreshToken === 'string' &&
		refreshToken.length > 0 &&
		refreshToken.length <= 4096
	) {
		return { kind, refreshToken };
	}
	return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
	return Promise.race([
		promise,
		new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms))
	]);
}

function channelMessage(channel: RTCDataChannel, type: string): Promise<Record<string, unknown>> {
	return new Promise((resolve) => {
		const listener = (event: MessageEvent) => {
			try {
				const message = JSON.parse(event.data as string) as Record<string, unknown>;
				if (message.t !== type) return;
				channel.removeEventListener('message', listener);
				resolve(message);
			} catch {
				// Not ours.
			}
		};
		channel.addEventListener('message', listener);
	});
}

export type HostState =
	| { step: 'waiting' }
	| { step: 'confirm'; code: string; peer: string }
	| { step: 'sending' }
	| { step: 'done' }
	| { step: 'failed' };

/**
 * The device that already has the vault. `raw` is the root's bytes, from
 * unlocking with the passphrase or recovery key just before; it is zeroed
 * once sent or once pairing ends.
 */
export class PairingHost {
	readonly secret = randomBytes(PAIRING_SECRET_BYTES);
	private offer: Offer | null = null;
	private abort = new AbortController();
	private confirmResolve: ((go: boolean) => void) | null = null;

	constructor(
		private readonly header: KeyHeader,
		private readonly raw: Uint8Array,
		private readonly onState: (state: HostState) => void,
		/** Where the new device should sync, asked for once it has the key. */
		private readonly shareTarget: () => Promise<TargetConfig | null> = async () => null
	) {}

	async run(): Promise<void> {
		try {
			await withTimeout(this.pair(), PAIRING_TIMEOUT_MS, 'Pairing timed out.');
			this.onState({ step: 'done' });
		} catch (err) {
			if (!this.abort.signal.aborted) console.error('Pairing failed:', err);
			this.onState({ step: 'failed' });
		} finally {
			this.raw.fill(0);
		}
	}

	private async pair(): Promise<void> {
		this.onState({ step: 'waiting' });
		const signal = new SignalClient(await pairingKeys(this.secret));
		let guest = '';
		while (!guest) {
			for (const { from, message } of await signal.receive(this.abort.signal)) {
				if (message.t === 'hello') guest = from;
			}
		}
		this.offer = await createOffer();
		await signal.send({ t: 'offer', to: guest, sdp: this.offer.sdp });
		let answer = '';
		while (!answer) {
			for (const { from, message } of await signal.receive(this.abort.signal)) {
				if (from === guest && message.t === 'answer' && message.to === signal.id) {
					answer = String(message.sdp);
				}
			}
		}
		await completeOffer(this.offer, answer);
		const channel = this.offer.channel;
		await opened(channel);
		const ready = await channelMessage(channel, 'ready');
		const code = await comparisonCode(this.secret as Uint8Array<ArrayBuffer>, [
			fingerprint(this.offer.sdp),
			fingerprint(answer)
		]);
		this.onState({ step: 'confirm', code, peer: String(ready.name ?? '') });
		const go = await new Promise<boolean>((resolve) => (this.confirmResolve = resolve));
		if (!go) throw new Error('Pairing declined.');

		this.onState({ step: 'sending' });
		channel.send(JSON.stringify({ t: 'vault', header: this.header, root: toBase64(this.raw) }));
		this.raw.fill(0);
		await channelMessage(channel, 'adopted');
		channel.send(
			JSON.stringify({ t: 'target', target: shareableTarget(await this.shareTarget()) })
		);
		const runtime = await activeSync();
		if (runtime) {
			const link = new DocLink(runtime, channel);
			link.start();
			await withTimeout(
				channelMessage(channel, 'done'),
				SETTLE_TIMEOUT_MS,
				'No confirmation.'
			).catch(() => undefined);
			link.close();
		}
	}

	/** The user compared the codes. */
	confirm(matches: boolean): void {
		this.confirmResolve?.(matches);
	}

	cancel(): void {
		this.abort.abort();
		this.confirmResolve?.(false);
		this.offer?.connection.close();
		this.raw.fill(0);
	}
}

export type GuestState =
	| { step: 'connecting' }
	| { step: 'compare'; code: string }
	| { step: 'syncing' }
	| { step: 'done' }
	| { step: 'failed' };

/** The new device, which arrived through the link or typed the code. */
export async function joinAsGuest(
	secret: Uint8Array<ArrayBuffer>,
	remember: boolean,
	onState: (state: GuestState) => void,
	abort = new AbortController()
): Promise<void> {
	let connection: RTCPeerConnection | undefined;
	try {
		await withTimeout(
			(async () => {
				onState({ step: 'connecting' });
				const signal = new SignalClient(await pairingKeys(secret));
				let offer: { from: string; sdp: string } | null = null;
				// Repeated until the host answers, so the order in which the two
				// devices arrive does not matter.
				while (!offer) {
					await signal.send({ t: 'hello' });
					for (const { from, message } of await signal.receive(abort.signal)) {
						if (message.t === 'offer' && message.to === signal.id) {
							offer = { from, sdp: String(message.sdp) };
						}
					}
				}
				const answer = await answerOffer(offer.sdp);
				connection = answer.connection;
				await signal.send({ t: 'answer', to: offer.from, sdp: answer.sdp });
				const channel = await answer.channel;
				await opened(channel);
				const code = await comparisonCode(secret, [
					fingerprint(offer.sdp),
					fingerprint(answer.sdp)
				]);
				onState({ step: 'compare', code });
				const vaultMessage = channelMessage(channel, 'vault');
				channel.send(JSON.stringify({ t: 'ready', name: deviceLabel() }));
				const message = await vaultMessage;

				onState({ step: 'syncing' });
				const header = parseKeyHeader(message.header);
				const raw = fromBase64(String(message.root));
				const root = await importRoot(raw);
				raw.fill(0);
				await adoptVault(header, root, remember);
				const targetMessage = channelMessage(channel, 'target');
				channel.send(JSON.stringify({ t: 'adopted' }));
				const shared = receivedTarget(
					(await withTimeout(targetMessage, SETTLE_TIMEOUT_MS, 'No target.').catch(() => null))
						?.target
				);
				const state = new SyncState();
				if (shared && !(await state.target())) {
					await state.setTarget(shared);
					void syncRunner.start();
				}
				const runtime = await activeSync();
				if (!runtime) throw new Error('Sync did not start.');
				const link = new DocLink(runtime, channel);
				link.start();
				await withTimeout(link.settled, SETTLE_TIMEOUT_MS, 'Sync did not settle.').catch(
					() => undefined
				);
				channel.send(JSON.stringify({ t: 'done' }));
				// Give the host a moment to receive this device's own rows too.
				await new Promise((resolve) => setTimeout(resolve, 1_000));
				link.close();
			})(),
			PAIRING_TIMEOUT_MS,
			'Pairing timed out.'
		);
		onState({ step: 'done' });
	} catch (err) {
		if (!abort.signal.aborted) console.error('Joining failed:', err);
		onState({ step: 'failed' });
	} finally {
		connection?.close();
	}
}
