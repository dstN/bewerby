# ADR 0006: An encrypted sync store on bewerby.de

- **Status:** accepted, 2026-10-02
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

Decided on 2026-10-02: both. The store on bewerby.de is the default when
pairing, and a paired device's cloud account travels along for whoever
prefers their own provider.

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
- Limits per file, per space and in total, plus a per-IP throttle.
- Spaces unused for 180 days are swept, and the sweep touches nothing that
  does not look like a space.
- No backup: every device has the whole document, so the store only
  carries it.

**Pairing passes the target on** over the channel that already carried the
key, after the user compared the codes:

- the store on bewerby.de, preselected when the existing device has none;
- or a cloud account's refresh token, never an access token;
- not a folder, which another device cannot reach.

The new device takes the target only if it has none of its own.

## Consequences

- Pairing alone is enough: a closed device catches up when opened.
- bewerby.de now stores personal data, encrypted. The privacy policy names
  what, why (Art. 6(1)(b) GDPR, the feature the user chose), for how long,
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
