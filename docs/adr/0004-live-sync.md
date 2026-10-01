# ADR 0004: Pairing devices and live sync over WebRTC

- **Status:** accepted, 2026-10-01. Works locally end to end; on the
  production host it depends on two points still open in #49: whether
  Passenger's workers share `tmp/signal` and keep 25-second requests open
  (B2), and which STUN server to use (B3).
- **Context:** Milestone 5, #55 (from #41). Plan:
  [docs/e2e-sync-plan.md](../e2e-sync-plan.md)

## Context

Cloud and folder sync (#53, #54) work while the devices are apart. #41 asked
for two more things: adding a device without typing the passphrase on it,
and changes that arrive the moment they are made, with no cloud account
involved.

Browsers cannot reach each other without help: WebRTC needs the two sides
to swap an offer and an answer first. And bewerby.de is the only
infrastructure available (decided in the plan).

## Decision

**Signaling through a mailbox on bewerby.de** (`/api/signal`,
`src/lib/server/mailbox.ts`).

- Browsers post sealed messages into a room and long-poll for the others'.
  Each request waits up to 25 seconds, so an open tab asks about twice a
  minute.
- Rooms are directories of message files, because Passenger's workers share
  nothing but the disk. Messages are written under a temporary name and
  renamed, so no worker reads half a message, and they expire after two
  minutes.
- Limits: 12 KB per message, 64 messages per room, 2,000 rooms, a per-IP
  throttle, an Origin check, POST only (no room id in the access log's
  request line).

**Everything the mailbox holds is sealed** (AES-GCM, bound to the room):

- _Pairing:_ the room, its key and a comparison code all derive from 16
  random bytes that travel only in the QR code. That is a link with the
  bytes in its fragment, which browsers never send to a server, or a
  26-character code to type.
- _Live:_ room and key derive from the vault's root key, so only devices of
  the vault find and understand each other.

**One message each way.** ICE candidates are gathered completely before the
offer or answer is sealed; there is no trickling.

**The data channel needs no second layer of encryption.** It is DTLS-encrypted
end to end, and the DTLS fingerprints travel inside the sealed offer and
answer. The mailbox therefore cannot substitute its own endpoint, so a
second layer, as the plan proposed, would protect against nothing.

**A comparison code** of six digits is derived from the pairing secret and
both DTLS fingerprints. Both devices show it, and the existing device hands
over the key only after the user confirms the two match. Someone who
photographed the QR code and connected first would have a different
fingerprint, and so a different code.

**Handing over the key.** The stored root key is non-extractable on
purpose, so the existing device cannot simply send it. "Add device"
therefore asks for the passphrase or recovery key on the _existing_ device
once. That yields the root's bytes for the transfer, and they are zeroed
once sent. The new device never needs the passphrase.

**The document protocol** (`link.ts`):

- Each side sends its state vector and answers the other's with exactly
  what it lacks (`Y.encodeStateAsUpdate(doc, sv)`). After that, every local
  update goes over as it is made.
- PDFs are requested by blob id and sent in 48 KB chunks.
- No `y-protocols`, no `y-webrtc`: they would bring a signaling client and
  public servers along.

**Live sync is off unless switched on per device.** While on, a tab leaves a
sealed presence note every 20 seconds and keeps a long poll open. Each of
those requests is in the server's access log with the IP address, which is
not something to impose on everyone. When two tabs see each other, the one
with the smaller id offers, so they never both do.

**No TURN.** STUN is a build variable (`PUBLIC_STUN_URL`) and empty until
B3 is decided, so for now devices find each other only on the same network.
WebRTC is not governed by `connect-src`, so the CSP is unaffected. When
there is no direct path, cloud or folder sync carries the changes instead.

## Consequences

- Two devices on the same network can be paired and kept in step with no
  cloud account at all.
- The server learns which IP addresses use the same room at the same time
  - that is, which devices belong together - for the two minutes a message
    lives and for as long as the access log is kept.
- The devices learn each other's IP addresses, as any direct connection
  requires.
- Rooms on disk do not survive a deploy (the application directory is
  replaced), which costs at most a pairing that was in progress.
- `qrcode-generator` (MIT, no dependencies) draws the QR code. It is
  rendered as an SVG path, with no `{@html}` and no `data:` URL.

## Alternatives considered

- **y-webrtc:** brings its own signaling client, defaults to public
  signaling servers, and syncs through its own awareness protocol. That is
  more than the four Yjs calls needed here.
- **WebSockets for signaling:** Passenger on shared hosting is not known to
  keep them open (B2), whereas a 25-second POST is an ordinary request.
- **Scanning QR codes in the page:** that would need camera access, the
  Permissions-Policy relaxed, and a decoding library. A phone's own camera
  app already opens the link, and a laptop can take the typed code.
- **Asking for the passphrase on the new device instead:** possible, and it
  is still how a device joins through a cloud target. For pairing, typing
  it on the existing device is the point of the feature.
