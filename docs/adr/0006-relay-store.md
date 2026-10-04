# ADR 0006: An encrypted sync store on bewerby.de

- **Status:** withdrawn, 2026-10-04. Live for a few hours the same day,
  then removed: storing strangers' names, addresses and application
  history on bewerby.de, even as ciphertext, is a liability the operator
  does not want to carry - for a breach, for a loss, and for the
  questions either would raise. The deploy deletes `data/relay`; devices
  set to the store let go of it on start and say so. Sync between devices
  runs through folders and cloud accounts of the users' own, and live over
  WebRTC while two devices are open. What follows is the decision as it
  was taken.
- **Accepted:** 2026-10-02
- **Context:** Milestone 5, #58. Builds on ADR 0003 (transport), 0004 (live
  sync) and 0005 (key change).

## Context

After pairing (#55), two devices stayed in step only while both were open,
or when each was connected to Dropbox or a folder on its own. Reloading
bewerby on the phone while the laptop was closed showed nothing the laptop
had changed. The owner's requirement: pairing means "set up", and a device
that was closed catches up when opened.

ADR 0003 ruled out "a server of ours in the data path". That rule served
zero knowledge, not an aversion to servers: what matters is that nothing
readable leaves the device. bewerby.de already runs on netcup in Germany,
under a processing agreement, with no third country involved.

Decided on 2026-10-02: both. The store on bewerby.de is offered when
pairing, and a paired device's cloud account travels along for whoever
prefers their own provider. Amended on 2026-10-04: the store is opt-in.
Nothing is stored on bewerby.de unless the user asks, on the backup page or
by ticking it when pairing; the privacy policy says so.

## Decision

**The store holds what a Dropbox app folder would:** the sync engine's
`.bwv` files, ciphertext under random names, unchanged. `RelayStore` is one
more `RemoteStore`; the engine does not know the difference.

**One space per vault key, and its id is the key to it.** The space id is
an HMAC of the root key. Whoever lacks the key cannot find the space, and
there is no account, token or second secret to manage. A key change (#56)
moves to a new space. `announceKey` leaves one empty update sealed under
the new key in the old space, so devices still on the old key find the new
header there, exactly as they find a newer epoch directory in Dropbox. A
locked-out device keeps its old space, which by then holds only that
notice.

**What the server sees:** a space id, file names, sizes rounded up to size
classes (Padmé), the day a space was last used, and IP addresses in the
access log. No key, no content.

**Requests:**

- POST only, with operation, space and path in headers, so none of them
  reaches the request line of the access log.
- Every request is `application/octet-stream`. SvelteKit treats a bodiless
  POST as a form submission and compares its Origin with an https origin it
  assumes behind Passenger, which a plain `fetch` fails. The route checks
  the Origin by host, like the broker and signaling. Another site cannot
  send this content type without a CORS preflight, which it does not pass.
- Uploads go in 256 KB parts. adapter-node limits request bodies to
  512 KB; raising that for every route would let any request buffer
  megabytes, so the store takes parts and puts the file together when the
  last one is in.

**Storage:** files under `data/relay/<space>/` in the Application Root:
outside the Document Root, and outside `build/`, which is all a deploy
replaces. Passenger's workers share it through the disk, as with signaling.

- Writes go to a temporary name and are renamed.
- Paths must match the sync layout.
- Limits per file (16 MB: new PDFs are at most 2 MB, the rest is for
  older ones and whole documents), per space (512 MB) and in total, plus a
  per-IP throttle.
- Spaces unused for 180 days are swept, and the sweep touches nothing that
  does not look like a space.
- Self-service (Art. 15 and 17 GDPR): the backup page shows what is kept
  for the vault (an `info` operation: files, bytes, day of last use) and
  deletes it on request, leaving only the erasure marker (ADR 0005). The
  operator cannot link a space to a person (Art. 11 GDPR), so a space
  whose owner has lost every device and backup cannot be deleted on
  request; it goes after 180 days without access.
- No backup: every device has the whole document, so the store only
  carries it.

**Pairing passes the target on** over the channel that already carried the
key, after the user compared the codes:

- the store on bewerby.de, when the existing device uses it, or when the
  user ticks it while pairing a device without a target (never
  preselected);
- or a cloud account's refresh token, never an access token;
- not a folder, which another device cannot reach.

The new device takes the target only if it has none of its own.

## Consequences

- Pairing alone is enough: a closed device catches up when opened.
- bewerby.de now stores personal data, encrypted. The privacy policy names
  what, why (Art. 6(1)(f) GDPR: the feature the user explicitly chose; the
  terms rule out a contract, so not (b)), for how long,
  and the processor; the user deletes it with "Disconnect and delete the
  files there" or "Erase all data".
- The webspace quota has to hold `RELAY_MAX_MB`.
- Anyone can create a space and fill it up to the per-space limit; the
  total cap and the throttle bound that. The store cannot tell ciphertext
  from junk, which is the price of zero knowledge.
- Two devices that share a cloud refresh token lose it together when one
  disconnects; the other is asked to reconnect.

## Alternatives considered

- **Dropbox for everyone:** needs an account with a US provider on every
  device, and a sign-in on each.
- **Accounts on bewerby.de:** a second secret to lose, sessions, and
  personal data (an email address) that the key-derived space avoids.
- **A random space id stored in the document:** it would survive key
  changes, so a locked-out device could still write and delete in it.
- **Raising `BODY_SIZE_LIMIT`:** simpler, but it would apply to every
  route.
