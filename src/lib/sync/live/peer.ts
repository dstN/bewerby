/**
 * A WebRTC data channel between two devices (#55). ICE candidates are
 * gathered completely before the offer or answer is sent, so each side
 * sends exactly one sealed signaling message instead of trickling.
 *
 * The channel is DTLS-encrypted end to end. Its fingerprints travel inside
 * the sealed offer and answer, so the signaling server cannot put itself in
 * between - which is why the data channel carries no second layer of
 * encryption of its own (docs/adr/0004-live-sync.md).
 */

const STUN = __SYNC_CLIENTS__.stun;
const ICE_SERVERS: RTCIceServer[] = STUN ? [{ urls: STUN }] : [];
const GATHER_TIMEOUT_MS = 5_000;
const OPEN_TIMEOUT_MS = 20_000;

function gathered(connection: RTCPeerConnection): Promise<void> {
	if (connection.iceGatheringState === 'complete') return Promise.resolve();
	return new Promise((resolve) => {
		const done = () => {
			if (connection.iceGatheringState === 'complete') resolve();
		};
		connection.addEventListener('icegatheringstatechange', done);
		// Whatever has been gathered by then has to do: a missing STUN answer
		// must not stall pairing forever.
		setTimeout(resolve, GATHER_TIMEOUT_MS);
	});
}

/** The DTLS fingerprint line of a session description. */
export function fingerprint(sdp: string): string {
	return /^a=fingerprint:(.+)$/m.exec(sdp)?.[1]?.trim() ?? '';
}

export interface Offer {
	connection: RTCPeerConnection;
	channel: RTCDataChannel;
	sdp: string;
}

export async function createOffer(): Promise<Offer> {
	const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
	const channel = connection.createDataChannel('bewerby', { ordered: true });
	await connection.setLocalDescription(await connection.createOffer());
	await gathered(connection);
	return { connection, channel, sdp: connection.localDescription!.sdp };
}

export async function completeOffer(offer: Offer, answerSdp: string): Promise<void> {
	await offer.connection.setRemoteDescription({ type: 'answer', sdp: answerSdp });
}

export async function answerOffer(
	offerSdp: string
): Promise<{ connection: RTCPeerConnection; channel: Promise<RTCDataChannel>; sdp: string }> {
	const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
	const channel = new Promise<RTCDataChannel>((resolve) => {
		connection.addEventListener('datachannel', (event) => resolve(event.channel), { once: true });
	});
	await connection.setRemoteDescription({ type: 'offer', sdp: offerSdp });
	await connection.setLocalDescription(await connection.createAnswer());
	await gathered(connection);
	return { connection, channel, sdp: connection.localDescription!.sdp };
}

/** Resolves once the channel is open; rejects when it closes or never opens. */
export function opened(channel: RTCDataChannel): Promise<void> {
	if (channel.readyState === 'open') return Promise.resolve();
	return new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error('The connection did not open.')),
			OPEN_TIMEOUT_MS
		);
		channel.addEventListener('open', () => {
			clearTimeout(timer);
			resolve();
		});
		channel.addEventListener('close', () => {
			clearTimeout(timer);
			reject(new Error('The connection closed.'));
		});
	});
}
