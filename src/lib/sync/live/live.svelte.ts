import { browser } from '$app/env';
import { activeSync } from '#lib/crdt/session.js';
import { onVaultChange, unlockedVault } from '#lib/vault/session.js';
import { db } from '#lib/db/index.js';
import { DocLink } from './link.js';
import { liveKeys } from './keys.js';
import { answerOffer, completeOffer, createOffer, opened, type Offer } from './peer.js';
import { SignalClient } from './signal.js';

/**
 * Live sync between devices of one vault that are open at the same time
 * (#55). Off unless the user switches it on per device: while on, this tab
 * leaves a sealed presence note in the vault's signaling room every 20 s
 * and keeps a long poll open, and each of those requests shows up with the
 * IP address in the server's access log.
 *
 * When two tabs see each other, the one with the smaller id offers; the
 * other answers. Once the data channel is open, DocLink keeps the documents
 * in step until a tab closes. Cloud and folder sync carry on regardless.
 */

const PRESENCE_EVERY_MS = 20_000;
/** An offer the other device never answered (it went to sleep midway) is dropped after this. */
const OFFER_TTL_MS = 60_000;
const SETTING = 'live';

class LiveSync {
	enabled = $state(false);
	peers = $state(0);

	private abort: AbortController | null = null;
	private readonly links = new Map<string, { link: DocLink; connection: RTCPeerConnection }>();
	private readonly pending = new Map<string, { offer: Offer; at: number }>();
	private listening = false;

	async init(): Promise<void> {
		if (!browser) return;
		this.enabled = (await db.syncState.get(SETTING))?.value === true;
		if (!this.listening) {
			this.listening = true;
			onVaultChange(() => void this.restart());
		}
		await this.restart();
	}

	async setEnabled(enabled: boolean): Promise<void> {
		this.enabled = enabled;
		await db.syncState.put({ key: SETTING, value: enabled });
		await this.restart();
	}

	private stop(): void {
		this.abort?.abort();
		this.abort = null;
		for (const { link, connection } of this.links.values()) {
			link.close();
			connection.close();
		}
		this.links.clear();
		for (const { offer } of this.pending.values()) offer.connection.close();
		this.pending.clear();
		this.peers = 0;
	}

	private async restart(): Promise<void> {
		this.stop();
		if (!this.enabled) return;
		const vault = await unlockedVault();
		const runtime = vault ? await activeSync() : null;
		if (!vault || !runtime) return;
		const abort = new AbortController();
		this.abort = abort;
		const signal = new SignalClient(await liveKeys(vault.root));

		const announce = () => void signal.send({ t: 'here' }).catch(() => undefined);
		announce();
		const timer = setInterval(announce, PRESENCE_EVERY_MS);
		abort.signal.addEventListener('abort', () => clearInterval(timer));

		const connect = async (
			peer: string,
			channel: RTCDataChannel,
			connection: RTCPeerConnection
		) => {
			await opened(channel);
			const link = new DocLink(runtime, channel);
			this.links.set(peer, { link, connection });
			this.peers = this.links.size;
			const drop = () => {
				if (this.links.get(peer)?.link !== link) return;
				link.close();
				this.links.delete(peer);
				this.peers = this.links.size;
			};
			channel.addEventListener('close', drop);
			connection.addEventListener('connectionstatechange', () => {
				if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
					drop();
				}
			});
			// Both sides send what the other lacks first, so a device that was
			// closed catches up on everything it missed, both ways.
			link.start();
		};

		/**
		 * Lets a peer in again: a connection that no longer stands - a laptop
		 * closed overnight, without its channel noticing - and an offer it
		 * never answered would otherwise keep it out for good.
		 */
		const clearStale = (peer: string) => {
			const existing = this.links.get(peer);
			const state = existing?.connection.connectionState;
			if (existing && state !== 'connected' && state !== 'connecting') {
				existing.link.close();
				existing.connection.close();
				this.links.delete(peer);
				this.peers = this.links.size;
			}
			const waiting = this.pending.get(peer);
			if (waiting && Date.now() - waiting.at > OFFER_TTL_MS) {
				waiting.offer.connection.close();
				this.pending.delete(peer);
			}
		};

		while (!abort.signal.aborted) {
			let inbox: Awaited<ReturnType<SignalClient['receive']>>;
			try {
				inbox = await signal.receive(abort.signal);
			} catch {
				if (abort.signal.aborted) return;
				// Offline or the server is away; try again shortly.
				await new Promise((resolve) => setTimeout(resolve, PRESENCE_EVERY_MS));
				continue;
			}
			for (const { from, message } of inbox) {
				clearStale(from);
				if (this.links.has(from)) continue;
				try {
					if (message.t === 'here' && signal.id < from && !this.pending.has(from)) {
						const offer = await createOffer();
						this.pending.set(from, { offer, at: Date.now() });
						await signal.send({ t: 'offer', to: from, sdp: offer.sdp });
					} else if (message.t === 'offer' && message.to === signal.id) {
						const answer = await answerOffer(String(message.sdp));
						await signal.send({ t: 'answer', to: from, sdp: answer.sdp });
						void answer.channel.then((channel) => connect(from, channel, answer.connection));
					} else if (message.t === 'answer' && message.to === signal.id) {
						const offer = this.pending.get(from)?.offer;
						if (!offer) continue;
						this.pending.delete(from);
						await completeOffer(offer, String(message.sdp));
						void connect(from, offer.channel, offer.connection).catch(() =>
							offer.connection.close()
						);
					}
				} catch (err) {
					console.warn('Live sync: could not connect to another device', err);
				}
			}
		}
	}
}

export const liveSync = new LiveSync();
